const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const Official = require('../models/Official');

// Public: GET /api/officials - list basic official info for public pages (no auth)
router.get('/', async (req, res) => {
  try {
    const list = await Official.find().select('name title term photo photoPath photoContentType createdAt').sort({ createdAt: -1 });
    // Build absolute base URL from request (respecting proxies)
    const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
    const host = req.get('x-forwarded-host') || req.get('host');
    const base = host ? `${proto}://${host}` : '';
    // send minimal data suitable for public display, include a full photoUrl when available
    const mapped = list.map(o => {
      const hasPhoto = !!o.photo || !!o.photoPath;
      const photoUrl = hasPhoto && base ? `${base}/api/officials/${o._id}/photo` : undefined;
      return { _id: o._id, name: o.name, title: o.title, term: o.term, hasPhoto, photoUrl };
    });
    res.json(mapped);
  } catch (err) {
    console.error('Failed to list public officials', err);
    res.status(500).json({ message: 'Failed to list officials' });
  }
});

// Public: GET /api/officials/:id/photo - serve stored photo bytes or fallback to path
router.get('/:id/photo', async (req, res) => {
  try {
    const id = req.params.id;
    const official = await Official.findById(id).select('photo photoContentType photoPath');
    if (!official) return res.status(404).send('Not found');
    if (official.photo && official.photoContentType) {
      res.setHeader('Content-Type', official.photoContentType);
      return res.send(official.photo);
    }
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
