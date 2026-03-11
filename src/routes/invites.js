import express from 'express'

export function invitesRoutes(mapeoManager) {
  const router = express.Router()

  // List invites
  router.get('/', async (req, res, next) => {
    try {
      const core = mapeoManager.getMapeo()
      if (!core?.invite?.getMany) {
        return res.status(503).json({ error: 'Service Unavailable', message: 'Invite API not ready' })
      }
      const invites = core.invite.getMany() || []
      res.json({ success: true, data: invites, count: invites.length, timestamp: new Date().toISOString() })
    } catch (err) {
      next(err)
    }
  })

  // Accept by inviteId (best-effort lookup)
  router.post('/:inviteId/accept', async (req, res, next) => {
    try {
      const { inviteId } = req.params
      const core = mapeoManager.getMapeo()
      if (!core?.invite?.getMany || !core?.invite?.accept) {
        return res.status(503).json({ error: 'Service Unavailable', message: 'Invite API not ready or not writable' })
      }

      const invites = core.invite.getMany() || []
      const invite = invites.find((i) => i?.inviteId === inviteId)

      if (!invite) {
        return res.status(404).json({ error: 'Not Found', message: `Invite ${inviteId} not found` })
      }

      const projectId = await core.invite.accept(invite)

      // Enable sync once joined
      try {
        const project = await mapeoManager.getProject(projectId)
        if (project?.sync?.enableSync) await project.sync.enableSync()
      } catch {}

      res.json({ success: true, message: 'Invite accepted', data: { inviteId, projectId }, timestamp: new Date().toISOString() })
    } catch (err) {
      next(err)
    }
  })

  // Reject (if API exists)
  router.post('/:inviteId/reject', async (req, res, next) => {
    try {
      const { inviteId } = req.params
      const core = mapeoManager.getMapeo()
      const reject = core?.invite?.reject
      if (!core?.invite?.getMany || typeof reject !== 'function') {
        return res.status(501).json({
          error: 'Not Implemented',
          message: 'Invite reject API not available in this @comapeo/core version'
        })
      }

      const invites = core.invite.getMany() || []
      const invite = invites.find((i) => i?.inviteId === inviteId)

      if (!invite) {
        return res.status(404).json({ error: 'Not Found', message: `Invite ${inviteId} not found` })
      }

      await reject(invite)

      res.json({ success: true, message: 'Invite rejected', data: { inviteId }, timestamp: new Date().toISOString() })
    } catch (err) {
      next(err)
    }
  })

  return router
}
