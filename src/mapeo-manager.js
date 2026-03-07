import { randomBytes } from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { MapeoManager as ComapeoMapeoManager } from '@comapeo/core'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const ROOT_KEY_FILE = 'root-key.hex'
const DEVICE_NAME_FILE = 'device-info.json'

export class MapeoManager {
  constructor(dataDir, deviceName = 'CoMapeoHeadlessServer') {
    this.dataDir = dataDir
    this.deviceName = deviceName
    this.mapeo = null
    this.projects = new Map()
    this.rootKeyPath = path.join(dataDir, ROOT_KEY_FILE)
    this.deviceInfoPath = path.join(dataDir, DEVICE_NAME_FILE)
  }

  /**
   * Gera ou carrega a rootKey persisted
   * @returns {Buffer} 16 bytes de random data para identificar o device
   */
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

    // Gerar nova rootKey (16 bytes)
    const newRootKey = randomBytes(16)
    await writeFile(this.rootKeyPath, newRootKey.toString('hex'), 'utf-8')
    console.log('✅ Generated and saved new root key')
    return newRootKey
  }

  /**
   * Gera ou carrega informações do dispositivo
   */
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

  async initialize() {
    console.log('🔧 Initializing CoMapeo Headless Server...')
    console.log(`📁 Data directory: ${this.dataDir}`)

    // Criar diretório base
    await mkdir(this.dataDir, { recursive: true })

    // Obter ou criar rootKey
    const rootKey = await this.getOrCreateRootKey()
    console.log(`🔑 Device ID: ${rootKey.toString('hex').slice(0, 16)}...`)

    // Obter ou criar device info
    const deviceInfo = await this.getOrCreateDeviceInfo()
    console.log(`🖥️  Device Name: ${deviceInfo.name}`)

    // Pastas necessárias
    const dbFolder = path.join(this.dataDir, 'databases')
    const coreStorage = path.join(this.dataDir, 'cores')

    // Criar pastas
    await mkdir(dbFolder, { recursive: true })
    await mkdir(coreStorage, { recursive: true })

    // Pasta de migrações do @comapeo/core
    const corePackagePath = require.resolve('@comapeo/core/package.json')
    const corePath = path.dirname(corePackagePath)
    const clientMigrationsFolder = path.join(corePath, 'drizzle', 'client')
    const projectMigrationsFolder = path.join(corePath, 'drizzle', 'project')

    console.log('📦 Loading migration schemas...')

    try {
      // Criar instância do Fastify (obrigatório)
      const { default: fastify } = await import('fastify')
      const fastifyInstance = fastify({ logger: false })

      // Inicializar MapeoManager
      this.mapeo = new ComapeoMapeoManager({
        rootKey,
        dbFolder,
        projectMigrationsFolder,
        clientMigrationsFolder,
        coreStorage,
        fastify: fastifyInstance,
      })

      console.log('✅ CoMapeo initialized successfully')
      console.log('📋 Configuration:')
      console.log(`   - Root Key (stored): ${this.rootKeyPath}`)
      console.log(`   - Database Folder: ${dbFolder}`)
      console.log(`   - Core Storage: ${coreStorage}`)
      console.log(`   - Migrations: ${projectMigrationsFolder}`)

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

    if (this.projects.has(projectId)) {
      return this.projects.get(projectId)
    }

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
    if (this.mapeo) {
      this.projects.clear()
      try {
        await this.mapeo.close()
        console.log('✅ Mapeo closed successfully')
      } catch (error) {
        console.error('Error closing Mapeo:', error.message)
      }
    }
  }
}
