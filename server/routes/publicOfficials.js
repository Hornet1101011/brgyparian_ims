const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

const Official = require('../models/Official');

// GridFS bucket for barangay officials photos
let barangayOfficialsBucket;
mongoose.connection.on('connected', () => {
  barangayOfficialsBucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'barangayOfficials' });
});

// Public: GET /api/officials - list basic official info for public pages (no auth)
router.get('/', async (req, res) => {
  try {
    console.log('[publicOfficials] GET / - fetching officials from database');
    // Sort by displayOrder first (for reordering), then by createdAt for fallback
    const list = await Official.find()
      .select('name title term photo photoFileId photoPath photoContentType createdAt displayOrder')
      .sort({ displayOrder: 1, createdAt: -1 });
    console.log('[publicOfficials] Found', list.length, 'officials');
    // Build absolute base URL from request (respecting proxies)
    const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
    const host = req.get('x-forwarded-host') || req.get('host');
    const base = host ? `${proto}://${host}` : '';
    // send minimal data suitable for public display, include a full photoUrl when available
    const mapped = list.map(o => {
      const hasPhoto = !!o.photoFileId || !!o.photo || !!o.photoPath;
      const photoUrl = hasPhoto && base ? `${base}/api/officials/${o._id}/photo` : undefined;
      return { _id: o._id, name: o.name, title: o.title, term: o.term, hasPhoto, photoUrl, displayOrder: o.displayOrder };
    });
    console.log('[publicOfficials] Returning', mapped.length, 'officials');
    res.json(mapped);
  } catch (err) {
    console.error('[publicOfficials] ERROR:', err && err.message ? err.message : err, '\nFull error:', err);
    res.status(500).json({ message: 'Failed to list officials', error: err && err.message ? err.message : String(err) });
  }
});

// Public: GET /api/officials/:id/photo - serve stored photo from GridFS, embedded, or fallback to path
router.get('/:id/photo', async (req, res) => {
  try {
    const id = req.params.id;
    const official = await Official.findById(id).select('photoFileId photo photoContentType photoPath');
    if (!official) return res.status(404).send('Not found');
    
    // Try GridFS first (new storage method)
    if (official.photoFileId && barangayOfficialsBucket) {
      try {
        res.setHeader('Content-Type', official.photoContentType || 'image/jpeg');
        return barangayOfficialsBucket.openDownloadStream(official.photoFileId).pipe(res);
      } catch (err) {
        console.warn('Failed to serve photo from GridFS, trying fallback', err);
      }
    }
    
    // Fallback to embedded photo (legacy)
    if (official.photo && official.photoContentType) {
      res.setHeader('Content-Type', official.photoContentType);
      return res.send(official.photo);
    }
    
    // Fallback to disk file (legacy)
    if (official.photoPath) {
      const p = path.join(process.cwd(), official.photoPath);
      if (fs.existsSync(p)) return res.sendFile(p);
    }
    return res.status(404).send('No photo');
  } catch (err) {
    console.error('Failed to serve public official photo', err);
    return res.status(500).send('Error');
  }
});

module.exports = router;
