import express from 'express'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function getSyncStateSafe(project) {
  try {
    if (project?.sync?.getState) return project.sync.getState()
  } catch {}
  return {}
}

async function enableSyncSafe(project) {
  try {
    if (project?.sync?.enableSync) await project.sync.enableSync()
  } catch (e) {
    console.warn('enableSyncSafe error:', e?.message || e)
  }
}

async function tryConnectAnyLocalPeer(core) {
  // best-effort: core API can vary
  try {
    if (!core || typeof core.listLocalPeers !== 'function') return { attempted: false, reason: 'listLocalPeers not available' }

    const peers = await core.listLocalPeers()
    const connectFn =
      core.connectToLocalPeer || core.connectToPeer || core.connect

    if (typeof connectFn !== 'function') {
      return { attempted: false, reason: 'connectToLocalPeer/connectToPeer not available', peersFound: peers?.length || 0 }
    }

    // choose first peer that looks connectable
    const candidate =
      (peers || []).find((p) => p?.status !== 'connected') || (peers || [])[0]

    if (!candidate) return { attempted: false, reason: 'no peers found' }

    // Different cores expect different argument shapes; try common ones
    let result
    try {
      result = await connectFn.call(core, candidate)
    } catch (e1) {
      try {
        result = await connectFn.call(core, { deviceId: candidate.deviceId })
      } catch (e2) {
        throw e2
      }
    }

    return { attempted: true, peer: candidate, result }
  } catch (e) {
    return { attempted: true, error: e?.message || String(e) }
  }
}

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

      const syncState = await getSyncStateSafe(project)

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

  // Enable sync (and try to connect to peers)
  router.post('/:projectId/enable', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const { connectPeers = true, waitMs = 8000 } = req.body || {}

      const project = await mapeoManager.getProject(projectId)
      if (!project) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Project ${projectId} not found`
        })
      }

      await enableSyncSafe(project)

      const core = mapeoManager.getMapeo()
      let connectInfo = null
      if (connectPeers) {
        connectInfo = await tryConnectAnyLocalPeer(core)
      }

      // wait a little and read state again
      const start = Date.now()
      while (Date.now() - start < Number(waitMs || 0)) {
        const st = await getSyncStateSafe(project)
        const enabled = !!(st?.data?.isSyncEnabled || st?.initial?.isSyncEnabled)
        const hasPeers = Object.keys(st?.remoteDeviceSyncState || {}).length > 0
        if (enabled && (hasPeers || !connectPeers)) break
        await sleep(500)
      }

      const syncState = await getSyncStateSafe(project)

      res.json({
        success: true,
        message: 'Sync enable attempted',
        data: {
          projectId,
          connectInfo,
          syncState
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

  // Wait for sync progress / peers
  router.post('/:projectId/wait', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const {
        timeout = 30000,
        requirePeers = false,
        minRemotePeers = 1,
      } = req.body || {}

      const project = await mapeoManager.getProject(projectId)
      if (!project) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Project ${projectId} not found`
        })
      }

      const start = Date.now()
      let lastState = await getSyncStateSafe(project)

      while (Date.now() - start < timeout) {
        lastState = await getSyncStateSafe(project)
        const remotePeersCount = Object.keys(lastState?.remoteDeviceSyncState || {}).length
        const enabled = !!(lastState?.data?.isSyncEnabled || lastState?.initial?.isSyncEnabled)

        const peersOk = !requirePeers || remotePeersCount >= Number(minRemotePeers || 1)

        // “done” condition here is limited; core doesn't expose a single "fully synced" bool reliably.
        // We return when enabled + (optional peers condition) holds.
        if (enabled && peersOk) {
          return res.json({
            success: true,
            message: 'Sync is enabled (and peers condition satisfied)',
            data: {
              projectId,
              remotePeersCount,
              syncState: lastState
            },
            timestamp: new Date().toISOString()
          })
        }

        await sleep(500)
      }

      res.status(408).json({
        success: false,
        error: 'Timeout',
        message: 'Timed out waiting for sync enable/peers',
        data: { projectId, lastState },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}
