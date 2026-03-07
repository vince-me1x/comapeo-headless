import express from 'express'

export function observationsRoutes(mapeoManager) {
  const router = express.Router()

  // List observations for a project
  router.get('/project/:projectId', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const project = await mapeoManager.getProject(projectId)

      if (!project) {
        return res.status(404).json({
          error: 'Project not found',
          message: `Project ${projectId} does not exist`
        })
      }

      // Tentar obter observações - pode variar conforme versão do core
      let observations = []
      try {
        if (project.observations && project.observations.getMany) {
          observations = await project.observations.getMany()
        }
      } catch (error) {
        console.warn('Error getting observations:', error.message)
      }

      res.json({
        success: true,
        data: observations.map(obs => ({
          id: obs.id || obs.docId,
          name: obs.name || obs.title || 'Unnamed',
          description: obs.description || '',
          lat: obs.lat,
          lon: obs.lon,
          created: obs.createdAt || obs.created,
          updated: obs.updatedAt || obs.updated,
          tags: obs.tags || {}
        })),
        count: observations.length
      })
    } catch (error) {
      next(error)
    }
  })

  // Get single observation
  router.get('/project/:projectId/:observationId', async (req, res, next) => {
    try {
      const { projectId, observationId } = req.params
      const project = await mapeoManager.getProject(projectId)

      if (!project) {
        return res.status(404).json({
          error: 'Project not found'
        })
      }

      let observation = null
      try {
        if (project.observations && project.observations.getById) {
          observation = await project.observations.getById(observationId)
        }
      } catch (error) {
        console.warn('Observation not found:', error.message)
      }

      if (!observation) {
        return res.status(404).json({
          error: 'Not found',
          message: 'Observation not found'
        })
      }

      res.json({
        success: true,
        data: {
          id: observation.id || observation.docId,
          name: observation.name || observation.title || 'Unnamed',
          description: observation.description || '',
          lat: observation.lat,
          lon: observation.lon,
          created: observation.createdAt || observation.created,
          updated: observation.updatedAt || observation.updated,
          tags: observation.tags || {},
          attachments: observation.attachments || []
        }
      })
    } catch (error) {
      next(error)
    }
  })

  // Create observation
  router.post('/project/:projectId', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const { name, description, lat, lon, tags = {} } = req.body

      if (lat === undefined || lon === undefined) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Latitude and longitude are required'
        })
      }

      const project = await mapeoManager.getProject(projectId)

      if (!project) {
        return res.status(404).json({
          error: 'Project not found'
        })
      }

      let observation = null
      try {
        if (project.observations && project.observations.create) {
          observation = await project.observations.create({
            name: name || 'Unnamed observation',
            description: description || '',
            lat,
            lon,
            tags
          })
        }
      } catch (error) {
        console.error('Error creating observation:', error)
        throw error
      }

      res.status(201).json({
        success: true,
        data: {
          id: observation.id || observation.docId,
          name: observation.name || 'Unnamed observation',
          created: new Date().toISOString(),
          lat: observation.lat,
          lon: observation.lon
        }
      })
    } catch (error) {
      next(error)
    }
  })

  // Update observation
  router.put('/project/:projectId/:observationId', async (req, res, next) => {
    try {
      const { projectId, observationId } = req.params
      const { name, description, tags } = req.body

      const project = await mapeoManager.getProject(projectId)

      if (!project) {
        return res.status(404).json({ error: 'Project not found' })
      }

      let observation = null
      try {
        if (project.observations && project.observations.update) {
          observation = await project.observations.update(observationId, {
            name,
            description,
            tags
          })
        }
      } catch (error) {
        console.error('Error updating observation:', error)
        throw error
      }

      res.json({
        success: true,
        data: {
          id: observation.id || observation.docId,
          name: observation.name || 'Unnamed',
          updated: new Date().toISOString()
        }
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}
