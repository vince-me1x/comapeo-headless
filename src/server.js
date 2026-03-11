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
import { autoConnectRoutes } from './routes/auto-connect.js'
import { debugRoutes } from './routes/debug.js'
import { debugSyncRoutes } from './routes/debug-sync.js'


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

// Initialize Mapeo Manager (populado após initialize)
let mapeoManager = null

// discovery responder/service handles (for graceful shutdown)
let _discoveryResponder = null
let _discoveryService = null
let _lastDiscoveryInfo = null

// Start peer discovery and advertise via ciao/@homebridge/ciao
async function startPeerDiscoveryAndAdvertise(wrapperManager) {
  try {
    const coreManager = wrapperManager.getMapeo()
    if (!coreManager || typeof coreManager.startLocalPeerDiscoveryServer !== 'function') {
      throw new Error('core manager does not expose startLocalPeerDiscoveryServer')
    }

    const { name, port } = await coreManager.startLocalPeerDiscoveryServer()
    console.log('Started LocalDiscovery server', { name, port })
    _lastDiscoveryInfo = { name, port }

    // dynamic import of ciao package, try both package names for compatibility
    let ciaoModule
    try {
      ciaoModule = await import('ciao')
    } catch (e1) {
      try {
        ciaoModule = await import('@homebridge/ciao')
      } catch (e2) {
        throw new Error("Failed to import ciao. Install '@homebridge/ciao' or 'ciao'.")
      }
    }

    const responderFactory =
      ciaoModule.getResponder || ciaoModule.default?.getResponder || ciaoModule.default

    if (typeof responderFactory !== 'function') {
      throw new Error('ciao.getResponder not found in imported module')
    }

    const responder = responderFactory()
    const service = responder.createService({
      domain: 'local',
      name,
      port,
      protocol: 'tcp',
      type: 'comapeo',
    })

    _discoveryResponder = responder
    _discoveryService = service

    if (typeof service.advertise === 'function') {
      await service.advertise()
    } else if (typeof service.start === 'function') {
      await service.start()
    }

    console.log('📢 Advertised mDNS service comapeo on', { name, port })
  } catch (e) {
    console.warn('⚠️ Failed to start/advertise local discovery:', e?.message || e)
  }
}

async function stopPeerDiscoveryAndAdvertise(wrapperManager) {
  try {
    try {
      const coreManager = wrapperManager?.getMapeo?.()
      if (coreManager && typeof coreManager.stopLocalPeerDiscoveryServer === 'function') {
        await coreManager.stopLocalPeerDiscoveryServer().catch(() => {})
      }
    } catch (ignore) {}

    if (_discoveryResponder) {
      if (typeof _discoveryResponder.shutdown === 'function') {
        await _discoveryResponder.shutdown()
      } else if (typeof _discoveryResponder.close === 'function') {
        await _discoveryResponder.close()
      }
      console.log('✅ mDNS responder shutdown')
      _discoveryResponder = null
      _discoveryService = null
      _lastDiscoveryInfo = null
    }
  } catch (e) {
    console.warn('Error shutting down mDNS responder:', e?.message || e)
  }
}

// Basic endpoints available even before mapeoManager ready
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    initialized: !!mapeoManager,
    version: '1.0.0'
  })
})

app.get('/api/docs', (req, res) => {
  res.json({
    title: 'CoMapeo Headless API',
    version: '1.0.0',
    description: 'Complete REST API for CoMapeo headless server',
    baseUrl: `http://localhost:${PORT}/api`,
  })
})


app.get('/__whoami', (req, res) => {
  res.json({
    ok: true,
    cwd: process.cwd(),
    file: import.meta.url,
    node: process.version,
    time: new Date().toISOString()
  })
})



function describeStack(app) {
  const out = []
  const stack = app?._router?.stack || []

  for (const layer of stack) {
    // direct route
    if (layer?.route?.path) {
      const methods = Object.keys(layer.route.methods || {}).filter((m) => layer.route.methods[m])
      out.push({ type: 'route', path: layer.route.path, methods })
      continue
    }

    // mounted router middleware
    if (layer?.name === 'router' && layer?.handle?.stack) {
      // Express stores mount path in layer.regexp + layer.keys; we can approximate a readable prefix:
      const keys = layer?.keys || []
      const keyNames = keys.map((k) => k?.name).filter(Boolean)

      out.push({
        type: 'router',
        // regexp is ugly but helps confirm the mount prefix exists
        regexp: String(layer.regexp),
        keys: keyNames,
        // also list first few inner routes (paths only)
        inner: (layer.handle.stack || [])
          .filter((l) => l?.route?.path)
          .slice(0, 20)
          .map((l) => ({ path: l.route.path, methods: Object.keys(l.route.methods || {}).filter((m) => l.route.methods[m]) })),
      })
    }
  }
  return out
}

// Lista as rotas que o Express conhece (debug)
app.get('/__routes', (req, res) => {
  try {
    res.json({ ok: true, routes: describeStack(app) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) })
  }
})



// --- Inline debug routes (robust) ---
// raw invites (existing)
app.get('/api/debug/invites', async (req, res) => {
  try {
    if (!mapeoManager) return res.status(503).json({ success: false, message: 'Mapeo manager not initialized' })
    let core
    try { core = mapeoManager.getMapeo() } catch (e) { core = null }
    if (!core || !core.invite || typeof core.invite.getMany !== 'function') {
      return res.status(503).json({ success: false, message: 'Invite API not ready' })
    }
    const invites = core.invite.getMany() || []
    return res.json({ success: true, data: invites, count: invites.length })
  } catch (err) {
    console.error('Debug invites GET error:', err)
    return res.status(500).json({ success: false, message: 'Internal error' })
  }
})

// process pending invites one-shot
app.post('/api/debug/invites/process', async (req, res) => {
  try {
    if (!mapeoManager) return res.status(503).json({ success: false, message: 'Mapeo manager not initialized' })
    let core
    try { core = mapeoManager.getMapeo() } catch (e) { core = null }
    if (!core || !core.invite || typeof core.invite.getMany !== 'function' || typeof core.invite.accept !== 'function') {
      return res.status(503).json({ success: false, message: 'Invite API not ready or not writable' })
    }
    const invites = core.invite.getMany() || []
    const results = []
    for (const inv of invites) {
      const id = inv?.inviteId || '<unknown>'
      if (!inv || inv.state !== 'pending') {
        results.push({ inviteId: id, status: 'skipped', reason: `state=${inv?.state}` })
        continue
      }
      try {
        const projectId = await core.invite.accept(inv)
        console.log(`DEBUG: accepted invite ${id} -> ${projectId}`)
        // try enable sync
        try {
          const project = await mapeoManager.getProject(projectId)
          if (project && project.sync && typeof project.sync.enableSync === 'function') {
            await project.sync.enableSync().catch(() => {})
          }
        } catch (e) {
          console.warn('DEBUG: enabling sync after accept failed:', e?.message || e)
        }
        results.push({ inviteId: id, status: 'accepted', projectId })
      } catch (e) {
        console.warn('DEBUG: accept failed for', id, e?.message || e)
        results.push({ inviteId: id, status: 'error', reason: e?.message || String(e) })
      }
    }
    return res.json({ success: true, results })
  } catch (err) {
    console.error('Debug invites PROCESS error:', err)
    return res.status(500).json({ success: false, message: 'Internal error' })
  }
})

// list local peers detected by core
app.get('/api/debug/peers', async (req, res) => {
  try {
    if (!mapeoManager) return res.status(503).json({ success: false, message: 'Mapeo manager not initialized' })
    let core
    try { core = mapeoManager.getMapeo() } catch (e) { core = null }
    if (!core || typeof core.listLocalPeers !== 'function') {
      return res.status(503).json({ success: false, message: 'Local peers API not ready' })
    }
    const peers = await core.listLocalPeers()
    return res.json({ success: true, data: peers, count: peers.length })
  } catch (err) {
    console.error('Debug peers GET error:', err)
    return res.status(500).json({ success: false, message: 'Internal error' })
  }
})

// core status: fastify address, discovery advertised
app.get('/api/debug/core', async (req, res) => {
  try {
    const fastifyAddress = (mapeoManager && typeof mapeoManager._fastifyAddress !== 'undefined') ? mapeoManager._fastifyAddress : null
    return res.json({
      success: true,
      coreHttpBase: fastifyAddress,
      discoveryAdvertised: !!_discoveryService,
      lastDiscoveryInfo: _lastDiscoveryInfo || null,
    })
  } catch (err) {
    console.error('Debug core GET error:', err)
    return res.status(500).json({ success: false, message: 'Internal error' })
  }
})
// --- end inline debug routes ---

// Mount routers after initialization (so they can receive mapeoManager)
function mountApiRoutes(manager) {
  const checkMapeoInitialized = (req, res, next) => {
    if (!manager) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Mapeo is still initializing. Try again in a moment.',
        timestamp: new Date().toISOString()
      })
    }
    next()
  }
    
  console.log('MOUNTING API ROUTES: auto-connect + debug-sync should be available now')
  app.use('/api/projects', checkMapeoInitialized, projectRoutes(manager))
  app.use('/api/sync', checkMapeoInitialized, syncRoutes(manager))
  app.use('/api/observations', checkMapeoInitialized, observationsRoutes(manager))
  app.use('/api/status', checkMapeoInitialized, statusRoutes(manager))
  app.use('/api/peers', checkMapeoInitialized, peersRoutes(manager))
  app.use('/api/members', checkMapeoInitialized, membersRoutes(manager))
  app.use('/api/blobs', checkMapeoInitialized, blobsRoutes(manager))
  app.use('/api/invites', checkMapeoInitialized, invitesRoutes(manager))
  app.use('/api/auto-connect', checkMapeoInitialized, autoConnectRoutes(manager))
  app.use('/api/debug', checkMapeoInitialized, debugRoutes(manager))
  app.use('/api/debug-sync', checkMapeoInitialized, debugSyncRoutes(manager))


  // Error handling middleware
  app.use((err, req, res, next) => {
      console.error('Error:', err?.message || err)
      res.status(err?.status || 500).json({
	  error: err?.error || 'Internal Server Error',
	  message: err?.message || String(err),
	  timestamp: new Date().toISOString(),
	  details: process.env.NODE_ENV === 'development' ? err?.stack : undefined
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
    
}


// Initialize and start server
async function start() {
  try {
    console.log('🚀 Initializing CoMapeo Headless Server...')
    console.log(`📁 Data directory: ${DATA_DIR}`)

    // initialize wrapper manager
    mapeoManager = new MapeoManager(DATA_DIR, DEVICE_NAME)
    const initResult = await mapeoManager.initialize()

    console.log('✅ CoMapeo initialized successfully')
    console.log(`🔐 Device ID: ${initResult.deviceId}`)
    console.log(`🖥️  Device: ${initResult.deviceName}`)

    // mount API routes now that manager exists
    mountApiRoutes(mapeoManager)

    // Start and advertise local discovery (mDNS). Don't block server start if this fails.
    startPeerDiscoveryAndAdvertise(mapeoManager).catch((e) => {
      console.warn('Failed to start peer discovery:', e?.message || e)
    })

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
        await stopPeerDiscoveryAndAdvertise(mapeoManager).catch((e) => {
          console.warn('Error stopping discovery:', e?.message || e)
        })
        if (mapeoManager) {
          await mapeoManager.close().catch((e) => {
            console.warn('Error closing mapeoManager:', e?.message || e)
          })
        }
        console.log('✅ Server closed')
        process.exit(0)
      })

      setTimeout(() => {
        console.error('⚠️  Forced shutdown after timeout')
        process.exit(1)
      }, 10000)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  } catch (error) {
    console.error('��� Failed to initialize CoMapeo:', error?.message || error)
    console.error('Stack trace:', error?.stack || '')
    process.exit(1)
  }
}

start()
