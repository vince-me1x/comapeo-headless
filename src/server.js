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
import { peersRoutes } from './routes/peers.js'
import { membersRoutes } from './routes/members.js'
import { blobsRoutes } from './routes/blobs.js'
import { invitesRoutes } from './routes/invites.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data')
const DEVICE_NAME = process.env.DEVICE_NAME || 'CoMapeoHeadlessServer'

// Middleware
app.use(cors())
app.use(bodyParser.json({ limit: '50mb' }))
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }))

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`)
  })
  next()
})

// Initialize Mapeo Manager
let mapeoManager

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    initialized: !!mapeoManager,
    version: '1.0.0'
  })
})

// API Documentation endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    title: 'CoMapeo Headless API',
    version: '1.0.0',
    description: 'Complete REST API for CoMapeo headless server',
    baseUrl: `http://localhost:${PORT}/api`,
    endpoints: {
      projects: {
        'GET /projects': 'List all projects',
        'POST /projects': 'Create new project',
        'GET /projects/:projectId': 'Get project details',
        'DELETE /projects/:projectId': 'Delete project',
        'GET /projects/:projectId/members': 'List project members',
        'GET /projects/:projectId/config': 'Get project configuration'
      },
      observations: {
        'GET /observations/project/:projectId': 'List observations',
        'POST /observations/project/:projectId': 'Create observation',
        'GET /observations/project/:projectId/:observationId': 'Get observation',
        'PUT /observations/project/:projectId/:observationId': 'Update observation',
        'DELETE /observations/project/:projectId/:observationId': 'Delete observation'
      },
      sync: {
        'GET /sync/status/:projectId': 'Get sync status',
        'POST /sync/:projectId/enable': 'Enable sync',
        'POST /sync/:projectId/disable': 'Disable sync',
        'POST /sync/:projectId/wait': 'Wait for sync completion'
      },
      peers: {
        'GET /peers/list': 'List local peers',
        'POST /peers/discovery/start': 'Start peer discovery',
        'POST /peers/discovery/stop': 'Stop peer discovery',
        'POST /peers/connect': 'Connect to peer'
      },
      members: {
        'GET /members/project/:projectId': 'List project members',
        'POST /members/project/:projectId/invite': 'Invite member',
        'GET /members/project/:projectId/roles': 'Get available roles'
      },
      blobs: {
        'POST /blobs/project/:projectId': 'Upload blob/attachment',
        'GET /blobs/project/:projectId/:blobId': 'Download blob',
        'DELETE /blobs/project/:projectId/:blobId': 'Delete blob'
      },
      invites: {
        'GET /invites': 'List pending invites',
        'POST /invites/:inviteId/accept': 'Accept invite',
        'POST /invites/:inviteId/reject': 'Reject invite'
      },
      status: {
        'GET /status': 'Get server status',
        'GET /status/device': 'Get device info',
        'POST /status/device': 'Update device info'
      }
    }
  })
})

// Middleware para verificar se Mapeo está inicializado
const checkMapeoInitialized = (req, res, next) => {
  if (!mapeoManager) {
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'Mapeo is still initializing. Try again in a moment.',
      timestamp: new Date().toISOString()
    })
  }
  next()
}

// API Routes - passar mapeoManager como callback
app.use('/api/projects', checkMapeoInitialized, (req, res, next) => {
  projectRoutes(mapeoManager)(req, res, next)
})

app.use('/api/sync', checkMapeoInitialized, (req, res, next) => {
  syncRoutes(mapeoManager)(req, res, next)
})

app.use('/api/observations', checkMapeoInitialized, (req, res, next) => {
  observationsRoutes(mapeoManager)(req, res, next)
})

app.use('/api/status', checkMapeoInitialized, (req, res, next) => {
  statusRoutes(mapeoManager)(req, res, next)
})

app.use('/api/peers', checkMapeoInitialized, (req, res, next) => {
  peersRoutes(mapeoManager)(req, res, next)
})

app.use('/api/members', checkMapeoInitialized, (req, res, next) => {
  membersRoutes(mapeoManager)(req, res, next)
})

app.use('/api/blobs', checkMapeoInitialized, (req, res, next) => {
  blobsRoutes(mapeoManager)(req, res, next)
})

app.use('/api/invites', checkMapeoInitialized, (req, res, next) => {
  invitesRoutes(mapeoManager)(req, res, next)
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message)
  res.status(err.status || 500).json({
    error: err.error || 'Internal Server Error',
    message: err.message,
    timestamp: new Date().toISOString(),
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString()
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
╔════════════════════════════════════════════════╗
║     CoMapeo Headless Server v1.0.0              ║
╠════════════════════════════════════════════════╣
║  🌐 Server: http://localhost:${PORT}
║  📊 API: http://localhost:${PORT}/api
║  📖 Docs: http://localhost:${PORT}/api/docs
║  ❤️  Health: http://localhost:${PORT}/health
║  🔐 Device ID: ${initResult.deviceId}
║  👤 Device: ${initResult.deviceName}
╚════════════════════════════════════════════════╝
      `)
    })

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\n⏹️  Shutting down gracefully...')
      server.close(async () => {
        await mapeoManager.close()
        console.log('✅ Server closed')
        process.exit(0)
      })

      // Force shutdown after 10 seconds
      setTimeout(() => {
        console.error('⚠️  Forced shutdown after timeout')
        process.exit(1)
      }, 10000)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  } catch (error) {
    console.error('❌ Failed to initialize CoMapeo:', error.message)
    console.error('Stack trace:', error.stack)
    process.exit(1)
  }
}

start()
