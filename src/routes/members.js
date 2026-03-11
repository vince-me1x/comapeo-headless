import express from 'express'

export function membersRoutes(mapeoManager) {
  const router = express.Router()

  // List project members
  router.get('/project/:projectId', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const project = await mapeoManager.getProject(projectId)
      if (!project) return res.status(404).json({ error: 'Not Found', message: `Project ${projectId} not found` })

      const getMany = project?.member?.getMany
      if (typeof getMany !== 'function') {
        return res.status(501).json({
          error: 'Not Implemented',
          message: 'project.member.getMany not available in this @comapeo/core version'
        })
      }

      const members = (await getMany.call(project.member)) || []
      res.json({ success: true, data: members, count: members.length, timestamp: new Date().toISOString() })
    } catch (err) {
      next(err)
    }
  })

  // Invite member (best-effort: depends on core API)
  router.post('/project/:projectId/invite', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const project = await mapeoManager.getProject(projectId)
      if (!project) return res.status(404).json({ error: 'Not Found', message: `Project ${projectId} not found` })

      const inviteFn =
        project?.member?.invite || project?.member?.createInvite || project?.invites?.create

      if (typeof inviteFn !== 'function') {
        return res.status(501).json({
          error: 'Not Implemented',
          message: 'No invite API found on project (member.invite/createInvite)'
        })
      }

      const invite = await inviteFn.call(project.member || project.invites || project, req.body)
      res.json({ success: true, message: 'Invite created', data: invite, timestamp: new Date().toISOString() })
    } catch (err) {
      next(err)
    }
  })

  // Roles (if available)
  router.get('/project/:projectId/roles', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const project = await mapeoManager.getProject(projectId)
      if (!project) return res.status(404).json({ error: 'Not Found', message: `Project ${projectId} not found` })

      const roles = project?.member?.roles || project?.member?.getRoles?.()
      res.json({ success: true, data: roles || null, timestamp: new Date().toISOString() })
    } catch (err) {
      next(err)
    }
  })

  return router
}
