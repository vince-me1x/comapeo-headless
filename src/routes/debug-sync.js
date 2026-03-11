import express from 'express'

function safeKeys(obj) {
  try {
    if (!obj) return []
    return Object.keys(obj)
  } catch {
    return []
  }
}

export function debugSyncRoutes(mapeoManager) {
  const router = express.Router()

  router.get('/project/:projectId/apis', async (req, res) => {
    const { projectId } = req.params
    const project = await mapeoManager.getProject(projectId)
    if (!project) return res.status(404).json({ error: 'Not Found', message: `Project ${projectId} not found` })

    const core = mapeoManager.getMapeo()

    return res.json({
      success: true,
      data: {
        core: {
          hasListLocalPeers: typeof core?.listLocalPeers === 'function',
          hasConnectToLocalPeer: typeof core?.connectToLocalPeer === 'function',
          hasConnectToPeer: typeof core?.connectToPeer === 'function',
          hasStartLocalPeerDiscoveryServer: typeof core?.startLocalPeerDiscoveryServer === 'function',
        },
        project: {
          hasSync: !!project?.sync,
          syncKeys: safeKeys(project?.sync),
          hasObservations: !!project?.observations,
          observationsKeys: safeKeys(project?.observations),
          hasBlobs: !!project?.blobs,
          blobsKeys: safeKeys(project?.blobs),
          hasMember: !!project?.member,
          memberKeys: safeKeys(project?.member),
        }
      },
      timestamp: new Date().toISOString()
    })
  })

  return router
}
