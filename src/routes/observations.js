import express from 'express'

export function observationsRoutes(mapeoManager) {
  const router = express.Router()

  // Mock data storage para observações (em um projeto real, isso seria no banco de dados)
  const observationStore = new Map()

  // List observations
  router.get('/project/:projectId', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const { limit = 100, offset = 0 } = req.query

      const project = await mapeoManager.getProject(projectId)
      if (!project) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Project ${projectId} not found`
        })
      }

      // Obter observações armazenadas para este projeto
      const key = `obs_${projectId}`
      const observations = observationStore.get(key) || []

      const paginated = observations.slice(parseInt(offset), parseInt(offset) + parseInt(limit))

      res.json({
        success: true,
        data: paginated,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: observations.length
        },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('List observations error:', error)
      next(error)
    }
  })

  // Create observation
  router.post('/project/:projectId', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const { name, description, lat, lon, tags = {} } = req.body

      // Validar dados
      if (lat === undefined || lon === undefined) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Latitude and longitude are required'
        })
      }

      if (!name || name.trim() === '') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Name is required'
        })
      }

      // Obter projeto
      const project = await mapeoManager.getProject(projectId)
      if (!project) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Project ${projectId} not found`
        })
      }

      // Gerar ID único
      const observationId = Math.random().toString(36).substr(2, 9)
      const timestamp = new Date().toISOString()

      const observation = {
        id: observationId,
        projectId,
        name: String(name).trim(),
        description: String(description || '').trim(),
        lat: Number(lat),
        lon: Number(lon),
        tags: Object.assign({}, tags),
        created: timestamp,
        updated: timestamp
      }

      // Armazenar observação
      const key = `obs_${projectId}`
      const observations = observationStore.get(key) || []
      observations.push(observation)
      observationStore.set(key, observations)

      console.log(`✅ Observation created: ${observationId}`)

      res.status(201).json({
        success: true,
        data: {
          id: observation.id,
          name: observation.name,
          lat: observation.lat,
          lon: observation.lon,
          created: timestamp
        },
        message: 'Observation created successfully',
        timestamp
      })
    } catch (error) {
      console.error('Create observation error:', error)
      next(error)
    }
  })

  // Get observation
  router.get('/project/:projectId/:observationId', async (req, res, next) => {
    try {
      const { projectId, observationId } = req.params

      const project = await mapeoManager.getProject(projectId)
      if (!project) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Project ${projectId} not found`
        })
      }

      const key = `obs_${projectId}`
      const observations = observationStore.get(key) || []
      const observation = observations.find(o => o.id === observationId)

      if (!observation) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Observation not found'
        })
      }

      res.json({
        success: true,
        data: observation,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('Get observation error:', error)
      next(error)
    }
  })

  // Update observation
  router.put('/project/:projectId/:observationId', async (req, res, next) => {
    try {
      const { projectId, observationId } = req.params
      const { name, description, tags, lat, lon } = req.body

      const project = await mapeoManager.getProject(projectId)
      if (!project) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Project ${projectId} not found`
        })
      }

      const key = `obs_${projectId}`
      const observations = observationStore.get(key) || []
      const index = observations.findIndex(o => o.id === observationId)

      if (index === -1) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Observation not found'
        })
      }

      const observation = observations[index]
      const timestamp = new Date().toISOString()

      // Atualizar campos fornecidos
      if (name !== undefined) observation.name = String(name).trim()
      if (description !== undefined) observation.description = String(description).trim()
      if (tags !== undefined) observation.tags = Object.assign({}, tags)
      if (lat !== undefined) observation.lat = Number(lat)
      if (lon !== undefined) observation.lon = Number(lon)
      observation.updated = timestamp

      observations[index] = observation
      observationStore.set(key, observations)

      res.json({
        success: true,
        message: 'Observation updated successfully',
        data: {
          id: observation.id,
          name: observation.name,
          updated: timestamp
        },
        timestamp
      })
    } catch (error) {
      console.error('Update observation error:', error)
      next(error)
    }
  })

  // Delete observation
  router.delete('/project/:projectId/:observationId', async (req, res, next) => {
    try {
      const { projectId, observationId } = req.params

      const project = await mapeoManager.getProject(projectId)
      if (!project) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Project ${projectId} not found`
        })
      }

      const key = `obs_${projectId}`
      const observations = observationStore.get(key) || []
      const index = observations.findIndex(o => o.id === observationId)

      if (index === -1) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Observation not found'
        })
      }

      observations.splice(index, 1)
      observationStore.set(key, observations)

      res.json({
        success: true,
        message: 'Observation deleted successfully',
        data: { id: observationId },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('Delete observation error:', error)
      next(error)
    }
  })

  // Endpoint para sincronizar observações com peers
  router.post('/project/:projectId/sync', async (req, res, next) => {
    try {
      const { projectId } = req.params

      const project = await mapeoManager.getProject(projectId)
      if (!project) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Project ${projectId} not found`
        })
      }

      // Trigger sync
      if (project.sync?.enableSync) {
        await project.sync.enableSync()
      }

      res.json({
        success: true,
        message: 'Observation sync initiated',
        data: { projectId },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('Sync error:', error)
      next(error)
    }
  })

  return router
}
