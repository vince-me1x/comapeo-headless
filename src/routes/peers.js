import express from 'express'

export function peersRoutes(mapeoManager) {
  const router = express.Router()

  // List local peers detected by core discovery
  router.get('/list', async (req, res, next) => {
    try {
      const core = mapeoManager.getMapeo()
      if (!core?.listLocalPeers) {
        return res.status(503).json({ error: 'Service Unavailable', message: 'Local peers API not ready' })
      }
      const peers = await core.listLocalPeers()
      res.json({ success: true, data: peers, count: peers.length, timestamp: new Date().toISOString() })
    } catch (err) {
      next(err)
    }
  })

  // Start discovery server (core)
  router.post('/discovery/start', async (req, res, next) => {
    try {
      const core = mapeoManager.getMapeo()
      if (!core?.startLocalPeerDiscoveryServer) {
        return res.status(501).json({
          error: 'Not Implemented',
          message: 'startLocalPeerDiscoveryServer not available in this @comapeo/core version'
        })
      }

      const info = await core.startLocalPeerDiscoveryServer()
      res.json({ success: true, message: 'Discovery started', data: info, timestamp: new Date().toISOString() })
    } catch (err) {
      next(err)
    }
  })

  // Stop discovery server (core)
  router.post('/discovery/stop', async (req, res, next) => {
    try {
      const core = mapeoManager.getMapeo()
      if (!core?.stopLocalPeerDiscoveryServer) {
        return res.status(501).json({
          error: 'Not Implemented',
          message: 'stopLocalPeerDiscoveryServer not available in this @comapeo/core version'
        })
      }

      await core.stopLocalPeerDiscoveryServer()
      res.json({ success: true, message: 'Discovery stopped', timestamp: new Date().toISOString() })
    } catch (err) {
      next(err)
    }
  })

  // Connect to a peer (best-effort)
  // Body: { deviceId, ... } - depends on core API availability
  router.post('/connect', async (req, res, next) => {
    try {
      const core = mapeoManager.getMapeo()
      const fn = core?.connectToLocalPeer || core?.connectToPeer
      if (typeof fn !== 'function') {
        return res.status(501).json({
          error: 'Not Implemented',
          message: 'connectToLocalPeer/connectToPeer not available in this @comapeo/core version'
        })
      }

      const result = await fn.call(core, req.body)
      res.json({ success: true, message: 'Connect attempted', data: result, timestamp: new Date().toISOString() })
    } catch (err) {
      next(err)
    }
  })

  return router
}
