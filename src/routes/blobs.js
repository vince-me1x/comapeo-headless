import express from 'express'

export function blobsRoutes(mapeoManager) {
  const router = express.Router()

  // Upload blob/attachment (best-effort)
  router.post('/project/:projectId', async (req, res, next) => {
    try {
      const { projectId } = req.params
      const project = await mapeoManager.getProject(projectId)
      if (!project) return res.status(404).json({ error: 'Not Found', message: `Project ${projectId} not found` })

      const blobsApi = project?.blobs || project?.blob
      const put =
        blobsApi?.put || blobsApi?.create || blobsApi?.insert || blobsApi?.add

      if (typeof put !== 'function') {
        return res.status(501).json({
          error: 'Not Implemented',
          message: 'Blob upload API not found on project (project.blobs.put/create/insert)'
        })
      }

      const created = await put.call(blobsApi, req.body)
      res.status(201).json({ success: true, data: created, timestamp: new Date().toISOString() })
    } catch (err) {
      next(err)
    }
  })

  // Download blob (best-effort)
  router.get('/project/:projectId/:blobId', async (req, res, next) => {
    try {
      const { projectId, blobId } = req.params
      const project = await mapeoManager.getProject(projectId)
      if (!project) return res.status(404).json({ error: 'Not Found', message: `Project ${projectId} not found` })

      const blobsApi = project?.blobs || project?.blob
      const get =
        blobsApi?.get || blobsApi?.getById || blobsApi?.read

      if (typeof get !== 'function') {
        return res.status(501).json({
          error: 'Not Implemented',
          message: 'Blob download API not found on project (project.blobs.get/getById/read)'
        })
      }

      const blob = await get.call(blobsApi, blobId)

      // We don't know if blob is Buffer/Uint8Array/stream/object in this version; return JSON best-effort
      res.json({ success: true, data: blob, timestamp: new Date().toISOString() })
    } catch (err) {
      next(err)
    }
  })

  // Delete blob (best-effort)
  router.delete('/project/:projectId/:blobId', async (req, res, next) => {
    try {
      const { projectId, blobId } = req.params
      const project = await mapeoManager.getProject(projectId)
      if (!project) return res.status(404).json({ error: 'Not Found', message: `Project ${projectId} not found` })

      const blobsApi = project?.blobs || project?.blob
      const del =
        blobsApi?.delete || blobsApi?.remove || blobsApi?.del

      if (typeof del !== 'function') {
        return res.status(501).json({
          error: 'Not Implemented',
          message: 'Blob delete API not found on project (project.blobs.delete/remove)'
        })
      }

      await del.call(blobsApi, blobId)
      res.json({ success: true, message: 'Blob deleted', data: { id: blobId }, timestamp: new Date().toISOString() })
    } catch (err) {
      next(err)
    }
  })

  return router
}
