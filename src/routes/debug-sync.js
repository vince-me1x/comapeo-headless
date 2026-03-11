import express from 'express'

function safeKeys(obj) {
  try {
    if (!obj) return []
    return Object.keys(obj)
  } catch {
    return []
  }
}

function safeTypeof(obj, key) {
  try {
    return typeof obj?.[key]
  } catch {
    return 'unknown'
  }
}

export function debugSyncRoutes(mapeoManager) {
  const router = express.Router()

  router.get('/project/:projectId/apis', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const project = await mapeoManager.getProject(projectId)
      if (!project) {
        return res.status(404).json({ error: 'Not Found', message: `Project ${projectId} not found` })
      }

      const core = mapeoManager.getMapeo()

      let peers = null
      try {
        peers = typeof core?.listLocalPeers === 'function' ? await core.listLocalPeers() : null
      } catch (e) {
        peers = { error: e?.message || String(e) }
      }

      let syncState = null
      try {
        syncState = typeof project?.sync?.getState === 'function' ? project.sync.getState() : null
      } catch (e) {
        syncState = { error: e?.message || String(e) }
      }

      return res.json({
        success: true,
        data: {
          core: {
            listLocalPeers: safeTypeof(core, 'listLocalPeers'),
            startLocalPeerDiscoveryServer: safeTypeof(core, 'startLocalPeerDiscoveryServer'),
            stopLocalPeerDiscoveryServer: safeTypeof(core, 'stopLocalPeerDiscoveryServer'),
            connectToLocalPeer: safeTypeof(core, 'connectToLocalPeer'),
            connectToPeer: safeTypeof(core, 'connectToPeer'),
            connect: safeTypeof(core, 'connect'),
          },
          project: {
            keys: safeKeys(project),
            projectId: project?.projectId ?? null,
            projectPublicId: project?.projectPublicId ?? null,
            sync: {
              keys: safeKeys(project?.sync),
              enableSync: safeTypeof(project?.sync, 'enableSync'),
              getState: safeTypeof(project?.sync, 'getState'),
              state: syncState,
            },
            observations: { keys: safeKeys(project?.observations) },
            blobs: { keys: safeKeys(project?.blobs) },
            member: { keys: safeKeys(project?.member) },
          },
          peers
        },
        timestamp: new Date().toISOString()
      })
    } catch (e) {
      next(e)
    }
  })

  return router
}
