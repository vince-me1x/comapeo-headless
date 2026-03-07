import express from 'express'

export function projectRoutes(mapeoManager) {
  const router = express.Router()

  // Função auxiliar para aguardar projeto estar pronto
  async function waitForProjectReady(project, timeout = 5000) {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      if (project.observations && project.member) {
        return true
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return false
  }

  // List all projects
  router.get('/', async (req, res, next) => {
    try {
      const projects = await mapeoManager.listProjects()
      res.json({
        success: true,
        data: projects.map(p => ({
          id: p.projectId,
          name: p.name,
          description: p.projectDescription,
          color: p.projectColor,
          status: p.status,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          memberCount: p.memberCount || 1
        })),
        count: projects.length,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('List projects error:', error)
      next(error)
    }
  })

  // Create new project
  router.post('/', async (req, res, next) => {
    try {
      const { name, description, color } = req.body

      if (!name) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Project name is required'
        })
      }

      console.log('Creating project:', name)

      const projectId = await mapeoManager.createProject({
        name,
        projectDescription: description,
        projectColor: color
      })

      console.log('Project created:', projectId)

      // Aguardar o projeto ficar completamente pronto
      const project = await mapeoManager.getProject(projectId)
      const isReady = await waitForProjectReady(project)

      if (!isReady) {
        console.warn('Project may not be fully initialized, but returning ID')
      }

      res.status(201).json({
        success: true,
        data: {
          id: projectId,
          name,
          description,
          color,
          createdAt: new Date().toISOString()
        },
        message: 'Project created successfully',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('Create project error:', error)
      next(error)
    }
  })

  // Get project details
  router.get('/:projectId', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const project = await mapeoManager.getProject(projectId)

      if (!project) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Project ${projectId} not found`
        })
      }

      let settings = {}
      try {
        if (project.$getProjectSettings) {
          settings = await project.$getProjectSettings()
        }
      } catch (error) {
        console.warn('Could not get project settings:', error.message)
      }

      res.json({
        success: true,
        data: {
          id: projectId,
          name: settings?.name || 'Unnamed Project',
          description: settings?.projectDescription,
          color: settings?.projectColor,
          createdAt: settings?.createdAt,
          updatedAt: settings?.updatedAt
        },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('Get project error:', error)
      next(error)
    }
  })

  // Get project configuration
  router.get('/:projectId/config', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const project = await mapeoManager.getProject(projectId)

      if (!project) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Project ${projectId} not found`
        })
      }

      let settings = {}
      try {
        if (project.$getProjectSettings) {
          settings = await project.$getProjectSettings()
        }
      } catch (error) {
        console.warn('Could not get project settings:', error.message)
      }

      res.json({
        success: true,
        data: {
          projectId,
          settings: settings || {}
        },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('Get config error:', error)
      next(error)
    }
  })

  // Update project settings
  router.put('/:projectId', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const { name, description, color } = req.body

      const project = await mapeoManager.getProject(projectId)

      if (!project) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Project ${projectId} not found`
        })
      }

      if (project.$setProjectSettings) {
        await project.$setProjectSettings({
          name: name || undefined,
          projectDescription: description || undefined,
          projectColor: color || undefined
        })
      }

      res.json({
        success: true,
        message: 'Project updated successfully',
        data: {
          id: projectId,
          name,
          description,
          color
        },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('Update project error:', error)
      next(error)
    }
  })

  // Get project members
  router.get('/:projectId/members', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const project = await mapeoManager.getProject(projectId)

      if (!project) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Project ${projectId} not found`
        })
      }

      let members = []
      try {
        if (project.member?.getMany) {
          members = await project.member.getMany()
        }
      } catch (error) {
        console.warn('Error getting members:', error.message)
      }

      res.json({
        success: true,
        data: (members || []).map(m => ({
          deviceId: m.deviceId,
          name: m.name,
          role: m.role,
          joinedAt: m.createdAt,
          lastSeen: m.lastSeen
        })),
        count: (members || []).length,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('Get members error:', error)
      next(error)
    }
  })

  // Delete project
  router.delete('/:projectId', async (req, res, next) => {
    try {
      const { projectId } = req.params

      await mapeoManager.getMapeo().leaveProject(projectId)

      res.json({
        success: true,
        message: 'Project deleted successfully',
        data: { id: projectId },
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('Delete project error:', error)
      next(error)
    }
  })

  return router
}
