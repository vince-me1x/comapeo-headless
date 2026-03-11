import express from 'express'

export function autoConnectRoutes(mapeoManager) {
  const router = express.Router()

  // Try to connect to a known deviceId (e.g., invitorDeviceId from invite)
  router.post('/connect', async (req, res, next) => {
    try {
      const { deviceId } = req.body || {}
      if (!deviceId) {
        return res.status(400).json({ error: 'Bad Request', message: 'deviceId is required' })
      }

      const core = mapeoManager.getMapeo()
      const connectFn = core?.connectToLocalPeer || core?.connectToPeer || core?.connect

      if (typeof connectFn !== 'function') {
        return res.status(501).json({
          error: 'Not Implemented',
          message: 'No connect function found on core (connectToLocalPeer/connectToPeer/connect)'
        })
      }

      const result = await connectFn.call(core, { deviceId })
      const peers = (typeof core.listLocalPeers === 'function') ? await core.listLocalPeers() : null

      res.json({
        success: true,
        message: 'Connect attempted',
        data: { result, peers },
        timestamp: new Date().toISOString()
      })
    } catch (e) {
      next(e)
    }
  })

  return router
}
