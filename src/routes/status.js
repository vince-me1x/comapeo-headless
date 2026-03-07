import express from 'express'

export function statusRoutes(mapeoManager) {
  const router = express.Router()

  // Get server status
  router.get('/', async (req, res, next) => {
    try {
      if (!mapeoManager) {
        return res.status(503).json({
          error: 'Service Unavailable',
          message: 'Mapeo not initialized'
        })
      }

      const projects = await mapeoManager.listProjects()
      const peers = await mapeoManager.getMapeo().listLocalPeers()

      res.json({
        success: true,
        server: {
          status: 'running',
          initialized: true,
          uptime: process.uptime(),
          version: '1.0.0',
          memory: process.memoryUsage(),
          cpuUsage: process.cpuUsage()
        },
        device: {
          id: mapeoManager.deviceId,
          name: mapeoManager.deviceName
        },
        projects: {
          count: projects.length,
          list: projects.map(p => ({
            id: p.projectId,
            name: p.name,
            status: p.status
          }))
        },
        peers: {
          count: peers.length,
          connected: peers.filter(p => p.status === 'connected').length
        },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('Status error:', error)
      next(error)
    }
  })

  // Get device info
  router.get('/device', async (req, res, next) => {
    try {
      const deviceInfo = mapeoManager.getDeviceInfo()

      res.json({
        success: true,
        device: {
          id: mapeoManager.deviceId,
          ...deviceInfo
        },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      next(error)
    }
  })

  // Update device info
  router.post('/device', async (req, res, next) => {
    try {
      const { name, ...other } = req.body

      await mapeoManager.setDeviceInfo({
        name: name || 'CoMapeoHeadlessServer',
        ...other
      })

      const deviceInfo = mapeoManager.getDeviceInfo()

      res.json({
        success: true,
        message: 'Device info updated',
        device: {
          id: mapeoManager.deviceId,
          ...deviceInfo
        },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}
