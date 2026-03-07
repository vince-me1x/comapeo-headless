import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import path from 'path'
import { fileURLToPath } from 'url'
import { MapeoManager } from './mapeo-manager.js'
import { projectRoutes } from './routes/projects.js'
import { syncRoutes } from './routes/sync.js'
import { observationsRoutes } from './routes/observations.js'
import { statusRoutes } from './routes/status.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data')
const DEVICE_NAME = process.env.DEVICE_NAME || 'CoMapeoHeadlessServer'

// Middleware
app.use(cors())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

// Initialize Mapeo Manager
let mapeoManager

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    initialized: !!mapeoManager
  })
})

// API Routes
app.use('/api/projects', (req, res, next) => {
  if (!mapeoManager) {
    return res.status(503).json({
      error: 'Server not initialized',
      message: 'Mapeo is still initializing. Try again in a moment.'
    })
  }
  projectRoutes(mapeoManager)(req, res, next)
})

app.use('/api/sync', (req, res, next) => {
  if (!mapeoManager) {
    return res.status(503).json({
      error: 'Server not initialized',
      message: 'Mapeo is still initializing. Try again in a moment.'
    })
  }
  syncRoutes(mapeoManager)(req, res, next)
})

app.use('/api/observations', (req, res, next) => {
  if (!mapeoManager) {
    return res.status(503).json({
      error: 'Server not initialized',
      message: 'Mapeo is still initializing. Try again in a moment.'
    })
  }
  observationsRoutes(mapeoManager)(req, res, next)
})

app.use('/api/status', (req, res, next) => {
  if (!mapeoManager) {
    return res.status(503).json({
      error: 'Server not initialized',
      message: 'Mapeo is still initializing. Try again in a moment.'
    })
  }
  statusRoutes(mapeoManager)(req, res, next)
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err)
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`
  })
})

// Initialize and start server
async function start() {
  try {
    console.log('🚀 Initializing CoMapeo Headless Server...')
    console.log(`📁 Data directory: ${DATA_DIR}`)

    mapeoManager = new MapeoManager(DATA_DIR, DEVICE_NAME)
    const initResult = await mapeoManager.initialize()

    console.log('✅ CoMapeo initialized successfully')
    console.log(`🔐 Device ID: ${initResult.deviceId}`)
    console.log(`🖥️  Device: ${initResult.deviceName}`)

    const server = app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════╗
║  CoMapeo Headless Server Started       ║
╠════════════════════════════════════════╣
║  🌐 Server: http://localhost:${PORT}
║  📊 API: http://localhost:${PORT}/api
║  ❤️  Health: http://localhost:${PORT}/health
║  🔐 Device ID: ${initResult.deviceId}
╚════════════════════════════════════════╝
      `)
    })

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n⏹️  Shutting down gracefully...')
      server.close(async () => {
        await mapeoManager.close()
        console.log('✅ Server closed')
        process.exit(0)
      })
    })

    process.on('SIGTERM', async () => {
      console.log('\n⏹️  Shutting down gracefully...')
      server.close(async () => {
        await mapeoManager.close()
        console.log('✅ Server closed')
        process.exit(0)
      })
    })
  } catch (error) {
    console.error('❌ Failed to initialize CoMapeo:', error.message)
    console.error('Stack trace:', error.stack)
    process.exit(1)
  }
}

start()
