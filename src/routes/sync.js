import express from 'express'

export function syncRoutes(mapeoManager) {
  const router = express.Router()

  // Get sync status
  router.get('/status/:projectId', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const project = await mapeoManager.getProject(projectId)

      if (!project) {
        return res.status(404).json({ error: 'Project not found' })
      }

      let syncState = {}
      try {
        if (project.sync && project.sync.getState) {
          syncState = project.sync.getState()
        }
      } catch (error) {
        console.warn('Sync not available:', error.message)
      }

      res.json({
        success: true,
        data: {
          projectId,
          initialSync: syncState.initial || { isSyncEnabled: false },
          dataSync: syncState.data || { isSyncEnabled: false },
          remotePeers: Object.keys(syncState.remoteDeviceSyncState || {})
        }
      })
    } catch (error) {
      next(error)
    }
  })

  // Start/enable sync
  router.post('/:projectId/enable', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const project = await mapeoManager.getProject(projectId)

      if (!project) {
        return res.status(404).json({ error: 'Project not found' })
      }

      try {
        if (project.sync && project.sync.enableSync) {
          await project.sync.enableSync()
        }
      } catch (error) {
        console.warn('Sync not available:', error.message)
      }

      res.json({
        success: true,
        message: 'Sync enabled',
        data: {
          projectId,
          syncEnabled: true
        }
      })
    } catch (error) {
      next(error)
    }
  })

  // Stop/disable sync
  router.post('/:projectId/disable', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const project = await mapeoManager.getProject(projectId)

      if (!project) {
        return res.status(404).json({ error: 'Project not found' })
      }

      try {
        if (project.sync && project.sync.disableSync) {
          await project.sync.disableSync()
        }
      } catch (error) {
        console.warn('Sync not available:', error.message)
      }

      res.json({
        success: true,
        message: 'Sync disabled',
        data: {
          projectId,
          syncEnabled: false
        }
      })
    } catch (error) {
      next(error)
    }
  })

  // Wait for sync to complete
  router.post('/:projectId/wait', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const { timeout = 30000 } = req.body

      const project = await mapeoManager.getProject(projectId)

      if (!project) {
        return res.status(404).json({ error: 'Project not found' })
      }

      const syncPromise = new Promise((resolve) => {
        const checkSync = () => {
          try {
            if (project.sync && project.sync.getState) {
              const state = project.sync.getState()
              if (
                state.initial &&
                state.initial.isSyncEnabled === false &&
                state.data &&
                state.data.isSyncEnabled === false
              ) {
                resolve('sync complete')
                return
              }
            }
          } catch (error) {
            console.warn('Error checking sync:', error.message)
          }
          setTimeout(checkSync, 500)
        }
        checkSync()
      })

      const result = await Promise.race([
        syncPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Sync timeout')), timeout)
        )
      ])

      res.json({
        success: true,
        message: result,
        data: { projectId }
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}
