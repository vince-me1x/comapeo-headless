import express from 'express'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function tryConnectAnyLocalPeer(core) {
  try {
    if (!core || typeof core.listLocalPeers !== 'function') {
      return { attempted: false, reason: 'listLocalPeers not available' }
    }

    const peers = await core.listLocalPeers()
    const connectFn = core.connectToLocalPeer || core.connectToPeer || core.connect

    if (typeof connectFn !== 'function') {
      return { attempted: false, reason: 'connectToLocalPeer/connectToPeer/connect not available', peersFound: peers?.length || 0 }
    }

    const candidate = (peers || []).find((p) => p?.status !== 'connected') || (peers || [])[0]
    if (!candidate) return { attempted: false, reason: 'no peers found' }

    let result
    try {
      result = await connectFn.call(core, candidate)
    } catch (e1) {
      // try common shape
      result = await connectFn.call(core, { deviceId: candidate.deviceId })
    }

    return { attempted: true, peer: candidate, result }
  } catch (e) {
    return { attempted: true, error: e?.message || String(e) }
  }
}

export function syncRoutes(mapeoManager) {
  const router = express.Router()

  router.get('/status/:projectId', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const project = await mapeoManager.getProject(projectId)

      if (!project) {
        return res.status(404).json({ error: 'Not Found', message: `Project ${projectId} not found` })
      }

      let syncState = {}
      try {
        if (project.sync?.getState) syncState = project.sync.getState()
      } catch (error) {
        console.warn('Sync getState not available:', error.message)
      }

      res.json({
        success: true,
        data: {
          projectId,
          initialSync: {
            enabled: syncState.initial?.isSyncEnabled || false,
            progress: syncState.initial?.progress ?? null
          },
          dataSync: {
            enabled: syncState.data?.isSyncEnabled || false,
            progress: syncState.data?.progress ?? null
          },
          remotePeers: Object.keys(syncState.remoteDeviceSyncState || {}),
          remoteDeviceSyncState: syncState.remoteDeviceSyncState || {},
          lastSyncTime: syncState.lastSyncTime || null
        },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      next(error)
    }
  })

  // Enable sync (+ optionally try connect peers)
  router.post('/:projectId/enable', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const { connectPeers = true } = req.body || {}

      const project = await mapeoManager.getProject(projectId)
      if (!project) {
        return res.status(404).json({ error: 'Not Found', message: `Project ${projectId} not found` })
      }

      try {
        if (project.sync?.enableSync) await project.sync.enableSync()
      } catch (error) {
        console.warn('enableSync error:', error.message)
      }

      let connectInfo = null
      if (connectPeers) {
        try {
          connectInfo = await tryConnectAnyLocalPeer(mapeoManager.getMapeo())
        } catch (e) {
          connectInfo = { attempted: true, error: e?.message || String(e) }
        }
      }

      res.json({
        success: true,
        message: 'Sync enable attempted',
        data: { projectId, connectInfo },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/:projectId/disable', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const project = await mapeoManager.getProject(projectId)

      if (!project) {
        return res.status(404).json({ error: 'Not Found', message: `Project ${projectId} not found` })
      }

      try {
        if (project.sync?.disableSync) await project.sync.disableSync()
      } catch (error) {
        console.warn('disableSync error:', error.message)
      }

      res.json({
        success: true,
        message: 'Sync disabled',
        data: { projectId },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      next(error)
    }
  })

  // Wait until sync is enabled (not "disabled"!)
  router.post('/:projectId/wait', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const { timeout = 30000, type = 'data' } = req.body || {}

      const project = await mapeoManager.getProject(projectId)
      if (!project) {
        return res.status(404).json({ error: 'Not Found', message: `Project ${projectId} not found` })
      }

      const start = Date.now()
      let last = {}

      while (Date.now() - start < timeout) {
        try {
          if (project.sync?.getState) last = project.sync.getState()
        } catch {}

        const target = type === 'initial' ? last.initial : last.data
        if (target && target.isSyncEnabled) {
          return res.json({
            success: true,
            message: 'sync enabled',
            data: { projectId, type, state: last },
            timestamp: new Date().toISOString()
          })
        }

        await sleep(500)
      }

      res.status(408).json({
        success: false,
        error: 'Timeout',
        message: 'Timed out waiting for sync to become enabled',
        data: { projectId, type, lastState: last },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}
