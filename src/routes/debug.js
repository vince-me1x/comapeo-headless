import express from 'express'

export function debugRoutes(mapeoManager) {
  const router = express.Router()

  // Return raw invites array (for inspection)
  router.get('/invites', async (req, res, next) => {
    try {
      if (!mapeoManager) {
        return res.status(503).json({ success: false, message: 'Mapeo manager not initialized' })
      }
      const core = (() => {
        try {
          return mapeoManager.getMapeo()
        } catch (e) {
          return null
        }
      })()
      if (!core || !core.invite || typeof core.invite.getMany !== 'function') {
        return res.status(503).json({ success: false, message: 'Invite API not ready' })
      }
      let invites = []
      try {
        invites = core.invite.getMany() || []
      } catch (e) {
        console.warn('Error reading invites (debug):', e?.message || e)
        return res.status(500).json({ success: false, message: 'Failed to read invites' })
      }
      return res.json({ success: true, data: invites, count: invites.length })
    } catch (err) {
      next(err)
    }
  })

  // Force processing/accepting of pending invites (one-shot)
  router.post('/invites/process', async (req, res, next) => {
    try {
      if (!mapeoManager) {
        return res.status(503).json({ success: false, message: 'Mapeo manager not initialized' })
      }
      const core = (() => {
        try {
          return mapeoManager.getMapeo()
        } catch (e) {
          return null
        }
      })()
      if (!core || !core.invite || typeof core.invite.getMany !== 'function' || typeof core.invite.accept !== 'function') {
        return res.status(503).json({ success: false, message: 'Invite API not ready or not writable' })
      }

      let invites = []
      try {
        invites = core.invite.getMany() || []
      } catch (e) {
        console.warn('Error reading invites (process):', e?.message || e)
        return res.status(500).json({ success: false, message: 'Failed to read invites' })
      }

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
          // after accept, attempt to enable sync on project if available
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
      next(err)
    }
  })

  return router
}
