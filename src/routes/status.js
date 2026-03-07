import express from 'express'

export function statusRoutes(mapeoManager) {
  const router = express.Router()

  // Get server status
  router.get('/', async (req, res, next) => {
    try {
      const projects = await mapeoManager.listProjects()
      const deviceInfo = mapeoManager.getDeviceInfo()

      res.json({
        success: true,
        server: {
          status: 'running',
          initialized: true,
          uptime: process.uptime(),
          memory: process.memoryUsage()
        },
        device: {
          id: mapeoManager.deviceId,
          ...deviceInfo
        },
        projects: {
          count: projects.length,
          list: projects.map(p => ({
            id: p.projectId,
            name: p.name,
            status: p.status
          }))
        }
      })
    } catch (error) {
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
        }
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
        }
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}
