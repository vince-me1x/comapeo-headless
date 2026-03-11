/* UPDATED: processed-invites with TTL to avoid stale caching that prevented re-accepting re-sent invites */
import util from 'util'
import { randomBytes } from 'crypto'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import { mkdir, readFile, writeFile, appendFile } from 'fs/promises'
import { existsSync } from 'fs'
import { MapeoManager as ComapeoMapeoManager } from '@comapeo/core'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const ROOT_KEY_FILE = 'root-key.hex'
const DEVICE_NAME_FILE = 'device-info.json'
const INVITE_DEBUG_LOG = '/tmp/comapeo-invite-debug.log'

// TTL (ms) to keep an invite marked as processed before allowing re-processing
const PROCESSED_INVITE_TTL = 10 * 60 * 1000 // 10 minutes

// How long to keep retrying enableSync after joining a project
const ENABLE_SYNC_RETRY_TTL = 3 * 60 * 1000 // 3 minutes
const ENABLE_SYNC_RETRY_INTERVAL = 1000 // 1 second

export class MapeoManager {
  constructor(dataDir, deviceName = 'CoMapeoHeadlessServer') {
    this.dataDir = dataDir
    this.deviceName = deviceName
    this.mapeo = null
    this.projects = new Map()
    this.rootKeyPath = path.join(dataDir, ROOT_KEY_FILE)
    this.deviceInfoPath = path.join(dataDir, DEVICE_NAME_FILE)

    this._fastifyInstance = null
    this._fastifyAddress = null
    this._fastifyListening = false

    // processedInvites: Map<inviteId, timestamp>
    // we expire entries after PROCESSED_INVITE_TTL so re-sent invites can be retried
    this._processedInvites = new Map()

    this._invitePollIntervalMs = 5000
    this._invitePollHandle = null
    this._stopping = false

    // projectId -> timeoutHandle (avoid duplicate retry loops)
    this._enableSyncJobs = new Map()
  }

  async _appendDebugLog(prefix, obj) {
    try {
      const s = `${new Date().toISOString()} ${prefix}\n${util.inspect(obj, { depth: null })}\n\n`
      await appendFile(INVITE_DEBUG_LOG, s).catch(() => {})
    } catch {}
  }

  _dumpInvite(invite) {
    try {
      console.log('INVITE DUMP:', util.inspect(invite, { depth: null }))
    } catch (e) {
      console.log('INVITE DUMP fallback:', String(invite))
    }
    this._appendDebugLog('INVITE', invite).catch(() => {})
  }

  _isInviteRecentlyProcessed(inviteId) {
    const ts = this._processedInvites.get(inviteId)
    if (!ts) return false
    if (Date.now() - ts > PROCESSED_INVITE_TTL) {
      // expired: remove entry and allow re-processing
      this._processedInvites.delete(inviteId)
      return false
    }
    return true
  }

  _markInviteProcessed(inviteId) {
    try {
      this._processedInvites.set(inviteId, Date.now())
    } catch {}
  }

  async getOrCreateRootKey() {
    if (existsSync(this.rootKeyPath)) {
      try {
        const hexKey = await readFile(this.rootKeyPath, 'utf-8')
        console.log('✅ Loaded existing root key')
        return Buffer.from(hexKey.trim(), 'hex')
      } catch (error) {
        console.warn('Failed to load root key, generating new one:', error.message)
      }
    }
    const newRootKey = randomBytes(16)
    await writeFile(this.rootKeyPath, newRootKey.toString('hex'), 'utf-8')
    console.log('✅ Generated and saved new root key')
    return newRootKey
  }

  async getOrCreateDeviceInfo() {
    if (existsSync(this.deviceInfoPath)) {
      try {
        const data = await readFile(this.deviceInfoPath, 'utf-8')
        const deviceInfo = JSON.parse(data)
        console.log('✅ Loaded existing device info')
        return deviceInfo
      } catch (error) {
        console.warn('Failed to load device info, creating new one:', error.message)
      }
    }
    const deviceInfo = {
      name: this.deviceName,
      createdAt: new Date().toISOString(),
      version: '1.0.0',
    }
    await writeFile(this.deviceInfoPath, JSON.stringify(deviceInfo, null, 2), 'utf-8')
    console.log('✅ Generated and saved device info')
    return deviceInfo
  }

  _findLocalIPv4() {
    const nets = os.networkInterfaces()
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address
        }
      }
    }
    return null
  }

  _formatServerAddress(server) {
    try {
      const address = server.address()
      if (!address) return null
      if (typeof address === 'string') return address
      let host = address.address
      const port = address.port
      if (!host) return null
      if (host === '0.0.0.0' || host === '::') {
        const localIp = this._findLocalIPv4()
        if (localIp) host = localIp
        else host = '0.0.0.0'
      }
      if (host.indexOf(':') !== -1 && host[0] !== '[') {
        return `http://[${host}]:${port}`
      } else {
        return `http://${host}:${port}`
      }
    } catch (e) {
      return null
    }
  }

  async _waitForInviteApi({ timeout = 10000, interval = 500 } = {}) {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      try {
        const core = this.mapeo
        if (core && core.invite && typeof core.invite.getMany === 'function' && typeof core.invite.on === 'function') {
          return core.invite
        }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, interval))
    }
    return null
  }

  async _waitForProjectExists(projectId, { timeout = 60000, interval = 500 } = {}) {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      try {
        const project = await this.mapeo.getProject(projectId)
        if (project) return project
      } catch (e) {}
      await new Promise((r) => setTimeout(r, interval))
    }
    return null
  }

  async _enableProjectSyncWithRetry(project, { timeout = 20000, interval = 500 } = {}) {
    if (!project) return false

    const start = Date.now()

    // Try enableSync (may throw until sync API ready)
    while (Date.now() - start < timeout) {
      try {
        if (project?.sync && typeof project.sync.enableSync === 'function') {
          await project.sync.enableSync().catch(() => {})
        }
        if (project?.sync && typeof project.sync.getState === 'function') {
          const state = project.sync.getState()
          if (state?.data && state.data.isSyncEnabled) {
            console.log(`🔁 Data sync active for project ${project.projectPublicId || project.projectId || '(unknown)'}`)
            return true
          }
          // Sometimes initial sync is what starts first
          if (state?.initial && state.initial.isSyncEnabled) {
            console.log(`🔁 Initial sync active for project ${project.projectPublicId || project.projectId || '(unknown)'}`)
            return true
          }
        }
      } catch (e) {
        // swallow and retry
      }
      await new Promise((r) => setTimeout(r, interval))
    }

    console.warn(`⚠️ Timeout waiting for sync to become active for project ${project.projectPublicId || project.projectId || '(unknown)'}`)
    return false
  }

  _scheduleEnableSync(projectId) {
    if (!projectId) return
    if (this._enableSyncJobs.has(projectId)) return

    const startedAt = Date.now()
    console.log('🧵 Scheduling background enableSync for project', projectId)

    const handle = setInterval(async () => {
      if (this._stopping) return
      if (Date.now() - startedAt > ENABLE_SYNC_RETRY_TTL) {
        clearInterval(handle)
        this._enableSyncJobs.delete(projectId)
        console.warn('🧵 enableSync background job TTL expired for project', projectId)
        return
      }

      try {
        const project = await this.mapeo.getProject(projectId)
        if (!project) return

        const ok = await this._enableProjectSyncWithRetry(project, { timeout: 3000, interval: 300 })
        if (ok) {
          clearInterval(handle)
          this._enableSyncJobs.delete(projectId)
          console.log('✅ Background enableSync done for project', projectId)
        }
      } catch (e) {
        // keep trying
      }
    }, ENABLE_SYNC_RETRY_INTERVAL)

    this._enableSyncJobs.set(projectId, handle)
  }

  async _handleInvite(invite) {
    try {
      if (!invite || !invite.inviteId) return
      const inviteId = invite.inviteId

      // check recent processed cache with TTL
      if (this._isInviteRecentlyProcessed(inviteId)) {
        console.log('Skipping invite (recently processed):', inviteId)
        await this._appendDebugLog('SKIP_RECENT', { inviteId }).catch(() => {})
        return
      }

      // only accept when pending
      if (invite.state !== 'pending') {
        // mark as processed (final state) so we don't retry repeatedly
        this._markInviteProcessed(inviteId)
        await this._appendDebugLog('SKIP_NON_PENDING', { inviteId, state: invite.state }).catch(() => {})
        return
      }

      const core = this.mapeo
      if (!core || !core.invite || typeof core.invite.accept !== 'function') {
        console.warn('Invite API not available to accept invite', inviteId)
        await this._appendDebugLog('ACCEPT_FAIL_NO_API', invite).catch(() => {})
        return
      }

      // Dump invite for debug
      this._dumpInvite(invite)
      await this._appendDebugLog('ATTEMPT_ACCEPT', invite).catch(() => {})

      let projectId
      try {
        projectId = await core.invite.accept(invite)
        console.log(`✅ Auto-accepted invite ${inviteId} -> project ${projectId}`)
        // mark processed only after successful accept
        this._markInviteProcessed(inviteId)
        await this._appendDebugLog('ACCEPT_SUCCESS', { inviteId, projectId }).catch(() => {})
      } catch (e) {
        // do NOT mark processed on transient error - allow retries
        console.warn('Invite accept failed for', inviteId, e?.message || e)
        await this._appendDebugLog('ACCEPT_ERROR', { invite, error: util.inspect(e, { depth: 2 }) }).catch(() => {})
        return
      }

      // Critical fix: don't require project.sync to exist immediately.
      // Wait for project to exist, then schedule background enableSync retries.
      try {
        const project = await this._waitForProjectExists(projectId, { timeout: 60000, interval: 500 })
        if (!project) {
          console.warn('Project still not available after accept (will retry in background):', projectId)
        }
        this._scheduleEnableSync(projectId)
      } catch (e) {
        console.warn('Error scheduling enableSync after accepting invite:', e?.message || e)
      }
    } catch (e) {
      console.warn('Error in _handleInvite:', e?.message || e)
      await this._appendDebugLog('HANDLE_INVITE_ERROR', { error: util.inspect(e, { depth: 2 }) }).catch(() => {})
    }
  }

  _startInvitePoller() {
    if (this._invitePollHandle) return
    this._invitePollHandle = setInterval(async () => {
      if (this._stopping) return
      try {
        const core = this.mapeo
        if (!core || !core.invite || typeof core.invite.getMany !== 'function') return
        const invites = core.invite.getMany() || []
        if (invites.length === 0) {
          await this._appendDebugLog('POLL_HEARTBEAT', { timestamp: Date.now(), count: 0 }).catch(() => {})
          return
        }
        console.log(`Invite poller: found ${invites.length} invites`)
        await this._appendDebugLog('POLL_FOUND', invites).catch(() => {})
        for (const inv of invites) {
          try {
            this._dumpInvite(inv)
            await this._handleInvite(inv)
          } catch (e) {
            console.warn('Invite poller error handling invite', inv?.inviteId, e?.message || e)
            await this._appendDebugLog('POLL_HANDLE_ERROR', { invite: inv, error: util.inspect(e, { depth: 1 }) }).catch(() => {})
          }
        }
      } catch (e) {
        console.warn('Invite poller error:', e?.message || e)
      }
    }, this._invitePollIntervalMs)
    console.log('Invite poller started (every', this._invitePollIntervalMs, 'ms)')
  }

  _stopInvitePoller() {
    if (this._invitePollHandle) {
      clearInterval(this._invitePollHandle)
      this._invitePollHandle = null
      console.log('Invite poller stopped')
    }
  }

  async initialize() {
    console.log('🔧 Initializing CoMapeo Headless Server...')
    console.log(`📁 Data directory: ${this.dataDir}`)
    await mkdir(this.dataDir, { recursive: true })

    const rootKey = await this.getOrCreateRootKey()
    console.log(`🔑 Device ID: ${rootKey.toString('hex').slice(0, 16)}...`)

    const deviceInfo = await this.getOrCreateDeviceInfo()
    console.log(`🖥️  Device Name: ${deviceInfo.name}`)

    const dbFolder = path.join(this.dataDir, 'databases')
    const coreStorage = path.join(this.dataDir, 'cores')
    await mkdir(dbFolder, { recursive: true })
    await mkdir(coreStorage, { recursive: true })

    const corePackagePath = require.resolve('@comapeo/core/package.json')
    const corePath = path.dirname(corePackagePath)
    const clientMigrationsFolder = path.join(corePath, 'drizzle', 'client')
    const projectMigrationsFolder = path.join(corePath, 'drizzle', 'project')

    console.log('📦 Loading migration schemas...')

    try {
      const { default: fastify } = await import('fastify')
      const fastifyInstance = fastify({ logger: false })

      this._fastifyInstance = fastifyInstance
      this._fastifyListening = false
      this._fastifyAddress = null
      this._stopping = false

      this.mapeo = new ComapeoMapeoManager({
        rootKey,
        dbFolder,
        projectMigrationsFolder,
        clientMigrationsFolder,
        coreStorage,
        fastify: fastifyInstance,
      })

      try {
        const inviteApi = await this._waitForInviteApi({ timeout: 15000, interval: 500 })
        if (inviteApi) {
          console.log('Invite API ready — processing existing invites and attaching listeners')
          try {
            const existingInvites = typeof inviteApi.getMany === 'function' ? inviteApi.getMany() : []
            console.log(`Found ${existingInvites.length} existing invites`)
            await this._appendDebugLog('EXISTING_INVITES', existingInvites).catch(() => {})
            for (const inv of existingInvites) {
              try {
                this._dumpInvite(inv)
                await this._handleInvite(inv)
              } catch (e) {
                console.warn('Failed to handle existing invite', inv?.inviteId, e?.message || e)
                await this._appendDebugLog('EXISTING_HANDLE_ERROR', { invite: inv, error: util.inspect(e, { depth: 1 }) }).catch(() => {})
              }
            }
          } catch (e) {
            console.warn('Error while processing existing invites:', e?.message || e)
          }

          try {
            inviteApi.on('invite-received', async (invite) => {
              console.log('Event: invite-received', invite?.inviteId)
              this._dumpInvite(invite)
              await this._appendDebugLog('EVENT_INVITE_RECEIVED', invite).catch(() => {})
              await this._handleInvite(invite).catch((e) => {
                console.warn('Error handling invite-received', e?.message || e)
              })
            })
            inviteApi.on('invite-updated', async (invite) => {
              console.log('Event: invite-updated', invite?.inviteId, 'state=', invite?.state)
              this._dumpInvite(invite)
              await this._appendDebugLog('EVENT_INVITE_UPDATED', invite).catch(() => {})
              if (invite && invite.state === 'pending') {
                await this._handleInvite(invite).catch((e) => {
                  console.warn('Error handling invite-updated', e?.message || e)
                })
              }
            })
            console.log('Invite listeners attached')
          } catch (e) {
            console.warn('Error attaching invite listeners:', e?.message || e)
          }

          this._startInvitePoller()
        } else {
          console.warn('Invite API not available within timeout; invite auto-accept disabled for this run')
          await this._appendDebugLog('INVITE_API_TIMEOUT', { timeout: 15000 }).catch(() => {})
        }
      } catch (e) {
        console.warn('Invite auto-accept setup failed:', e?.message || e)
      }

      // On startup, also schedule sync enable for any existing projects
      try {
        if (this.mapeo && typeof this.mapeo.listProjects === 'function') {
          const projectIds = await this.mapeo.listProjects()
          for (const pid of projectIds) {
            this._scheduleEnableSync(pid)
          }
        }
      } catch (e) {
        console.warn('Failed to iterate existing projects to enable sync:', e?.message || e)
      }

      try {
        const listenOptions = { port: 0, host: '0.0.0.0' }
        await fastifyInstance.listen(listenOptions)
        this._fastifyListening = true
        const addr = this._formatServerAddress(fastifyInstance.server)
        this._fastifyAddress = addr
        console.log('✅ Fastify started for @comapeo/core at', addr)
      } catch (e) {
        console.warn('⚠️ Fastify could not be started (core HTTP endpoints may be unavailable):', e?.message || e)
      }

      console.log('✅ CoMapeo initialized successfully')
      console.log('📋 Configuration:')
      console.log(`   - Root Key (stored): ${this.rootKeyPath}`)
      console.log(`   - Database Folder: ${dbFolder}`)
      console.log(`   - Core Storage: ${coreStorage}`)
      console.log(`   - Migrations: ${projectMigrationsFolder}`)
      if (this._fastifyAddress) {
        console.log(`   - Core HTTP base: ${this._fastifyAddress}`)
      } else {
        console.log('   - Core HTTP base: (not listening)')
      }

      return {
        success: true,
        deviceId: rootKey.toString('hex').slice(0, 16),
        deviceName: deviceInfo.name,
      }
    } catch (error) {
      console.error('❌ Failed to initialize MapeoManager:', error.message)
      console.error('Stack:', error.stack)
      throw error
    }
  }

  getMapeo() {
    if (!this.mapeo) {
      throw new Error('Mapeo not initialized. Call initialize() first.')
    }
    return this.mapeo
  }

  get deviceId() {
    if (!this.mapeo) {
      throw new Error('Mapeo not initialized')
    }
    return this.mapeo.deviceId
  }

  async getProject(projectId) {
    if (!this.mapeo) {
      throw new Error('Mapeo not initialized')
    }
    if (this.projects.has(projectId)) return this.projects.get(projectId)
    try {
      const project = await this.mapeo.getProject(projectId)
      this.projects.set(projectId, project)
      return project
    } catch (error) {
      console.warn(`Project ${projectId} not found:`, error.message)
      return null
    }
  }

  async listProjects() {
    if (!this.mapeo) {
      throw new Error('Mapeo not initialized')
    }
    try {
      return await this.mapeo.listProjects()
    } catch (error) {
      console.error('Error listing projects:', error.message)
      return []
    }
  }

  async createProject(options = {}) {
    if (!this.mapeo) {
      throw new Error('Mapeo not initialized')
    }
    try {
      const projectId = await this.mapeo.createProject({
        name: options.name || 'New Project',
        ...options,
      })
      console.log(`✅ Project created: ${projectId}`)
      return projectId
    } catch (error) {
      console.error('Error creating project:', error.message)
      throw error
    }
  }

  async setDeviceInfo(deviceInfo) {
    if (!this.mapeo) {
      throw new Error('Mapeo not initialized')
    }
    try {
      await this.mapeo.setDeviceInfo({
        name: deviceInfo.name || this.deviceName,
        ...deviceInfo,
      })
      console.log('✅ Device info updated')
    } catch (error) {
      console.error('Error setting device info:', error.message)
      throw error
    }
  }

  getDeviceInfo() {
    if (!this.mapeo) {
      throw new Error('Mapeo not initialized')
    }
    return this.mapeo.getDeviceInfo()
  }

  async close() {
    this._stopping = true
    this._stopInvitePoller()

    // stop enableSync jobs
    for (const handle of this._enableSyncJobs.values()) {
      try { clearInterval(handle) } catch {}
    }
    this._enableSyncJobs.clear()

    if (this.mapeo) {
      this.projects.clear()
      try {
        await this.mapeo.close()
        console.log('✅ Mapeo closed successfully')
      } catch (error) {
        console.error('Error closing Mapeo:', error.message)
      }
    }

    if (this._fastifyInstance) {
      try {
        if (this._fastifyListening) {
          await this._fastifyInstance.close()
          console.log('✅ Fastify closed successfully')
        } else {
          await this._fastifyInstance.close()
          console.log('✅ Fastify instance closed (was not listening)')
        }
      } catch (error) {
        console.error('Error closing Fastify:', error?.message || error)
      } finally {
        this._fastifyInstance = null
        this._fastifyAddress = null
        this._fastifyListening = false
      }
    }
  }
}
