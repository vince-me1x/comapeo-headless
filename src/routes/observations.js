import express from 'express'

function pickFirstFn(obj, names = []) {
  for (const n of names) {
    if (obj && typeof obj[n] === 'function') return obj[n].bind(obj)
  }
  return null
}

function ensureObsApi(project) {
  const api = project?.observations
  if (!api) {
    const err = new Error('Project does not expose observations API (project.observations is missing)')
    err.status = 501
    throw err
  }

  const getMany = pickFirstFn(api, ['getMany', 'list', 'getAll'])
  const getById = pickFirstFn(api, ['getById', 'get', 'findById'])
  const create = pickFirstFn(api, ['create', 'insert', 'add'])
  const update = pickFirstFn(api, ['update', 'patch', 'put'])
  const remove = pickFirstFn(api, ['delete', 'remove', 'del'])

  return { api, getMany, getById, create, update, remove }
}

export function observationsRoutes(mapeoManager) {
  const router = express.Router()

  // List observations (real core)
  router.get('/project/:projectId', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const { limit = 100, offset = 0 } = req.query

      const project = await mapeoManager.getProject(projectId)
      if (!project) {
        return res.status(404).json({ error: 'Not Found', message: `Project ${projectId} not found` })
      }

      const { getMany } = ensureObsApi(project)
      if (!getMany) {
        return res.status(501).json({
          error: 'Not Implemented',
          message: 'project.observations.getMany/list is not available in this @comapeo/core version'
        })
      }

      const all = (await getMany()) || []
      const start = Number.parseInt(offset, 10) || 0
      const end = start + (Number.parseInt(limit, 10) || 100)
      const page = all.slice(start, end)

      res.json({
        success: true,
        data: page,
        pagination: { limit: end - start, offset: start, total: all.length },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      next(error)
    }
  })

  // Create observation (real core)
  router.post('/project/:projectId', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const body = req.body || {}

      const project = await mapeoManager.getProject(projectId)
      if (!project) {
        return res.status(404).json({ error: 'Not Found', message: `Project ${projectId} not found` })
      }

      const { create } = ensureObsApi(project)
      if (!create) {
        return res.status(501).json({
          error: 'Not Implemented',
          message: 'project.observations.create/insert is not available in this @comapeo/core version'
        })
      }

      // Payload “best-effort”:
      // - muitos clientes do Mapeo usam GeoJSON-like e/ou campos específicos
      // - aqui passamos o body direto e garantimos que lat/lon existam se vierem separados
      const payload = { ...body }

      if (payload.lat !== undefined && payload.lon !== undefined && !payload.geometry) {
        payload.geometry = {
          type: 'Point',
          coordinates: [Number(payload.lon), Number(payload.lat)]
        }
      }

      // criar no core
      const created = await create(payload)

      // garantir sync ligado (não bloqueia se falhar)
      try {
        const projectObj = project
        if (projectObj?.sync?.enableSync) await projectObj.sync.enableSync()
      } catch {}

      res.status(201).json({
        success: true,
        data: created,
        message: 'Observation created successfully',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      next(error)
    }
  })

  // Get observation by id
  router.get('/project/:projectId/:observationId', async (req, res, next) => {
    try {
      const { projectId, observationId } = req.params

      const project = await mapeoManager.getProject(projectId)
      if (!project) {
        return res.status(404).json({ error: 'Not Found', message: `Project ${projectId} not found` })
      }

      const { getById, getMany } = ensureObsApi(project)

      if (getById) {
        const obs = await getById(observationId)
        if (!obs) return res.status(404).json({ error: 'Not Found', message: 'Observation not found' })
        return res.json({ success: true, data: obs, timestamp: new Date().toISOString() })
      }

      // fallback: buscar na lista
      if (getMany) {
        const all = (await getMany()) || []
        const obs = all.find((o) => o?.id === observationId || o?.observationId === observationId)
        if (!obs) return res.status(404).json({ error: 'Not Found', message: 'Observation not found' })
        return res.json({ success: true, data: obs, timestamp: new Date().toISOString() })
      }

      return res.status(501).json({
        error: 'Not Implemented',
        message: 'No supported method to fetch observation by id (need getById or getMany)'
      })
    } catch (error) {
      next(error)
    }
  })

  // Update observation
  router.put('/project/:projectId/:observationId', async (req, res, next) => {
    try {
      const { projectId, observationId } = req.params
      const body = req.body || {}

      const project = await mapeoManager.getProject(projectId)
      if (!project) {
        return res.status(404).json({ error: 'Not Found', message: `Project ${projectId} not found` })
      }

      const { update } = ensureObsApi(project)
      if (!update) {
        return res.status(501).json({
          error: 'Not Implemented',
          message: 'project.observations.update/patch is not available in this @comapeo/core version'
        })
      }

      const updated = await update(observationId, body)

      res.json({
        success: true,
        data: updated,
        message: 'Observation updated successfully',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      next(error)
    }
  })

  // Delete observation
  router.delete('/project/:projectId/:observationId', async (req, res, next) => {
    try {
      const { projectId, observationId } = req.params

      const project = await mapeoManager.getProject(projectId)
      if (!project) {
        return res.status(404).json({ error: 'Not Found', message: `Project ${projectId} not found` })
      }

      const { remove } = ensureObsApi(project)
      if (!remove) {
        return res.status(501).json({
          error: 'Not Implemented',
          message: 'project.observations.delete/remove is not available in this @comapeo/core version'
        })
      }

      await remove(observationId)

      res.json({
        success: true,
        message: 'Observation deleted successfully',
        data: { id: observationId },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      next(error)
    }
  })

  // Sync helper: just ensure sync enabled (core handles actual replication)
  router.post('/project/:projectId/sync', async (req, res, next) => {
    try {
      const { projectId } = req.params

      const project = await mapeoManager.getProject(projectId)
      if (!project) {
        return res.status(404).json({ error: 'Not Found', message: `Project ${projectId} not found` })
      }

      if (project.sync?.enableSync) {
        await project.sync.enableSync()
      }

      res.json({
        success: true,
        message: 'Sync enabled (core replication running)',
        data: { projectId },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}
