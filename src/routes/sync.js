import express from 'express'

export function syncRoutes(mapeoManager) {
  const router = express.Router()

  // Get sync status
  router.get('/status/:projectId', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const project = await mapeoManager.getProject(projectId)

      if (!project) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Project ${projectId} not found`
        })
      }

      let syncState = {}
      try {
        if (project.sync?.getState) {
          syncState = project.sync.getState()
        }
      } catch (error) {
        console.warn('Sync not available:', error.message)
      }

      res.json({
        success: true,
        data: {
          projectId,
          initialSync: {
            enabled: syncState.initial?.isSyncEnabled || false,
            progress: syncState.initial?.progress || 0
          },
          dataSync: {
            enabled: syncState.data?.isSyncEnabled || false,
            progress: syncState.data?.progress || 0
          },
          remotePeers: Object.keys(syncState.remoteDeviceSyncState || {}),
          lastSyncTime: syncState.lastSyncTime || null
        },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      next(error)
    }
  })

  // Enable sync
  router.post('/:projectId/enable', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const project = await mapeoManager.getProject(projectId)

      if (!project) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Project ${projectId} not found`
        })
      }

      try {
        if (project.sync?.enableSync) {
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
        },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      next(error)
    }
  })

  // Disable sync
  router.post('/:projectId/disable', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const project = await mapeoManager.getProject(projectId)

      if (!project) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Project ${projectId} not found`
        })
      }

      try {
        if (project.sync?.disableSync) {
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
        },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      next(error)
    }
  })

  // Wait for sync
  router.post('/:projectId/wait', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const { timeout = 30000, type = 'data' } = req.body

      const project = await mapeoManager.getProject(projectId)

      if (!project) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Project ${projectId} not found`
        })
      }

      const syncPromise = new Promise((resolve) => {
        const checkSync = () => {
          try {
            if (project.sync?.getState) {
              const state = project.sync.getState()
              const targetSync = type === 'initial' ? state.initial : state.data

              if (targetSync && !targetSync.isSyncEnabled) {
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
        data: { projectId, type },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}
