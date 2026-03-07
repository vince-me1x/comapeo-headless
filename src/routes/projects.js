import express from 'express'

export function projectRoutes(mapeoManager) {
  const router = express.Router()

  // List all projects
  router.get('/', async (req, res, next) => {
    try {
      const projects = await mapeoManager.listProjects()
      res.json({
        success: true,
        data: projects,
        count: projects.length
      })
    } catch (error) {
      next(error)
    }
  })

  // Get project details
  router.get('/:projectId', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const project = await mapeoManager.getProject(projectId)

      const info = {
        id: project.projectKey,
        name: project.projectName,
        created: project.createdAt,
        members: project.members ? project.members.length : 0
      }

      res.json({
        success: true,
        data: info
      })
    } catch (error) {
      next(error)
    }
  })

  // Create new project
  router.post('/', async (req, res, next) => {
    try {
      const { name } = req.body

      if (!name) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Project name is required'
        })
      }

      const project = await mapeoManager.createProject({
        name
      })

      res.status(201).json({
        success: true,
        data: {
          id: project.projectKey,
          name: project.projectName,
          created: new Date().toISOString()
        }
      })
    } catch (error) {
      next(error)
    }
  })

  // Get project members
  router.get('/:projectId/members', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const project = await mapeoManager.getProject(projectId)

      const members = await project.member.getMany()

      res.json({
        success: true,
        data: members.map(m => ({
          deviceId: m.deviceId,
          name: m.name,
          role: m.role,
          joinedAt: m.createdAt
        })),
        count: members.length
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}
