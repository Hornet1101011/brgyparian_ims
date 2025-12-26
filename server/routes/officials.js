const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const isAdmin = require('../middleware/isAdmin');
const Official = require('../models/Official');
const AuditLog = require('../models/AuditLog');

// GridFS bucket for barangay officials photos
let barangayOfficialsBucket;
mongoose.connection.on('connected', () => {
  barangayOfficialsBucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'barangayOfficials' });
});

// Ensure upload dir exists
const uploadDir = path.join(process.cwd(), 'uploads', 'officials');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.\-]/g,'_')}`)
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } }); // 2MB limit

async function recordAudit(userId, action, details, ip) {
  try {
    await AuditLog.create({ userId, action, details, ip });
  } catch (e) {
    console.error('Failed to write audit log for officials', e);
  }
}

// POST /admin/officials/reorder - update display order
router.post('/reorder', isAdmin, async (req, res) => {
  try {
    const { order } = req.body; // Array of official IDs in desired order
    if (!Array.isArray(order)) {
      return res.status(400).json({ message: 'order must be an array of official IDs' });
    }
    
    // Update displayOrder for each official
    for (let i = 0; i < order.length; i++) {
      await Official.findByIdAndUpdate(order[i], { displayOrder: i });
    }
    
    const updated = await Official.find().sort({ displayOrder: 1, createdAt: -1 });
    await recordAudit(req.user && (req.user._id || req.user.id), 'reorder_officials', { order }, req.ip || req.headers['x-forwarded-for']);
    res.json({ message: 'Reordered', officials: updated });
  } catch (err) {
    console.error('Failed to reorder officials', err);
    res.status(500).json({ message: 'Failed to reorder officials' });
  }
});

// GET /admin/officials - list
router.get('/', isAdmin, async (req, res) => {
  try {
    const list = await Official.find().sort({ displayOrder: 1, createdAt: -1 });
    res.json(list);
  } catch (err) {
    console.error('Failed to list officials', err);
    res.status(500).json({ message: 'Failed to list officials' });
  }
});

// POST /admin/officials - create
router.post('/', isAdmin, async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.name || payload.name.toString().trim() === '') return res.status(400).json({ message: 'Name is required' });
    const doc = new Official({
      name: payload.name,
      title: payload.title,
      term: payload.term,
      createdBy: req.user && (req.user._id || req.user.id)
    });
    await doc.save();
    await recordAudit(req.user && (req.user._id || req.user.id), 'create_official', { officialId: doc._id, payload }, req.ip || req.headers['x-forwarded-for']);
    res.json(doc);
  } catch (err) {
    console.error('Failed to create official', err);
    res.status(500).json({ message: 'Failed to create official' });
  }
});

// PUT /admin/officials/:id - update
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const payload = req.body || {};
    const official = await Official.findById(id);
    if (!official) return res.status(404).json({ message: 'Official not found' });
    
    // Update basic fields
    let changed = false;
    ['name','title','term'].forEach(k => { 
      if (payload[k] !== undefined && official[k] !== payload[k]) {
        official[k] = payload[k];
        changed = true;
      }
    });
    
    await official.save();
    
    // Update GridFS metadata if photo exists and details changed
    if (changed && official.photoFileId && barangayOfficialsBucket) {
      try {
        // Update the files.metadata in GridFS
        const db = mongoose.connection.db;
        if (db) {
          await db.collection('barangayOfficials.files').updateOne(
            { _id: official.photoFileId },
            { 
              $set: { 
                'metadata.officialName': official.name,
                'metadata.officialTitle': official.title,
                'metadata.officialTerm': official.term,
                'metadata.updatedAt': new Date().toISOString()
              }
            }
          );
        }
      } catch (e) {
        console.warn('Failed to update GridFS metadata', e);
        // Don't fail the request if metadata update fails
      }
    }
    
    await recordAudit(req.user && (req.user._id || req.user.id), 'update_official', { officialId: id, payload }, req.ip || req.headers['x-forwarded-for']);
    res.json(official);
  } catch (err) {
    console.error('Failed to update official', err);
    res.status(500).json({ message: 'Failed to update official' });
  }
});

// DELETE /admin/officials/:id
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const official = await Official.findById(id);
    if (!official) return res.status(404).json({ message: 'Official not found' });
    // remove photo from GridFS if present
    if (official.photoFileId && barangayOfficialsBucket) {
      try {
        await barangayOfficialsBucket.delete(official.photoFileId);
      } catch (e) { console.warn('Failed to delete GridFS photo', e); }
    }
    // remove legacy photo file if present
    if (official.photoPath) {
      try {
        const p = path.join(process.cwd(), official.photoPath);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (e) { /* ignore */ }
    }
    await official.deleteOne();
    await recordAudit(req.user && (req.user._id || req.user.id), 'delete_official', { officialId: id }, req.ip || req.headers['x-forwarded-for']);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Failed to delete official', err);
    res.status(500).json({ message: 'Failed to delete official' });
  }
});

// POST /admin/officials/:id/photo - upload photo to GridFS
router.post('/:id/photo', isAdmin, upload.single('photo'), async (req, res) => {
  try {
    const id = req.params.id;
    const official = await Official.findById(id);
    if (!official) return res.status(404).json({ message: 'Official not found' });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    
    if (!barangayOfficialsBucket) {
      return res.status(500).json({ message: 'GridFS bucket not initialized' });
    }
    
    try {
      // Delete old photo from GridFS if exists
      if (official.photoFileId) {
        try {
          await barangayOfficialsBucket.delete(official.photoFileId);
        } catch (e) { console.warn('Failed to delete old GridFS photo', e); }
      }
      
      // Read file buffer and upload to GridFS with full metadata
      const buf = fs.readFileSync(req.file.path);
      const uploadStream = barangayOfficialsBucket.openUploadStream(
        `official_${id}_${Date.now()}`,
        { 
          metadata: { 
            officialId: id,
            officialName: official.name,
            officialTitle: official.title,
            officialTerm: official.term,
            originalName: req.file.originalname,
            uploadedAt: new Date().toISOString(),
            uploadedBy: req.user && (req.user._id || req.user.id)
          } 
        }
      );
      
      uploadStream.on('error', (err) => {
        console.error('GridFS upload error', err);
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        res.status(500).json({ message: 'Failed to upload to storage' });
      });
      
      uploadStream.on('finish', async () => {
        try {
          // Update official with GridFS file ID
          official.photoFileId = uploadStream.id;
          official.photoContentType = req.file.mimetype;
          // Clear old embedded photo if exists
          official.photo = undefined;
          const saved = await official.save();
          
          // Remove temporary disk file
          try { fs.unlinkSync(req.file.path); } catch (e) {}
          
          await recordAudit(req.user && (req.user._id || req.user.id), 'upload_official_photo', { officialId: id }, req.ip || req.headers['x-forwarded-for']);
          // Return the updated official with photoFileId so client knows photo is available
          res.json({ message: 'Uploaded', official: saved });
        } catch (e) {
          console.error('Failed to update official with GridFS file ID', e);
          res.status(500).json({ message: 'Failed to save photo metadata' });
        }
      });
      
      uploadStream.write(buf);
      uploadStream.end();
    } catch (e) {
      console.error('Failed to upload photo to GridFS', e);
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(500).json({ message: 'Failed to upload photo' });
    }
  } catch (err) {
    console.error('Failed to upload official photo', err);
    res.status(500).json({ message: 'Failed to upload photo' });
  }
});

// GET /admin/officials/:id/photo - serve photo from GridFS or fallback to embedded
router.get('/:id/photo', async (req, res) => {
  try {
    const id = req.params.id;
    const official = await Official.findById(id).select('photoFileId photo photoContentType');
    if (!official) return res.status(404).send('Not found');
    
    // Set cache headers to allow browser caching for performance
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
    
    // Try GridFS first (new storage)
    if (official.photoFileId && barangayOfficialsBucket) {
      try {
        res.setHeader('Content-Type', official.photoContentType || 'image/jpeg');
        const stream = barangayOfficialsBucket.openDownloadStream(official.photoFileId);
        stream.on('error', (err) => {
          console.warn('GridFS stream error, trying fallback', err);
          // Fallback to embedded photo on stream error
          if (official.photo && official.photoContentType) {
            res.setHeader('Content-Type', official.photoContentType);
            return res.send(official.photo);
          }
          res.status(404).send('No photo');
        });
        return stream.pipe(res);
      } catch (err) {
        console.warn('Failed to serve photo from GridFS, trying fallback', err);
      }
    }
    
    // Fallback to embedded photo (legacy)
    if (official.photo && official.photoContentType) {
      res.setHeader('Content-Type', official.photoContentType);
      return res.send(official.photo);
    }
    
    res.status(404).send('No photo');
  } catch (err) {
    console.error('Failed to serve official photo', err);
    return res.status(500).send('Error');
  }
});

// GET /admin/officials/:id/metadata - get GridFS metadata for debugging
router.get('/:id/metadata', isAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const official = await Official.findById(id).select('photoFileId name title term photoContentType');
    if (!official) return res.status(404).json({ message: 'Official not found' });
    
    if (!official.photoFileId) return res.json({ message: 'No photo stored', official });
    
    // Retrieve GridFS file metadata
    if (barangayOfficialsBucket) {
      try {
        const db = mongoose.connection.db;
        const fileInfo = await db.collection('barangayOfficials.files').findOne({ _id: official.photoFileId });
        return res.json({ 
          message: 'GridFS metadata found',
          officialData: {
            _id: official._id,
            name: official.name,
            title: official.title,
            term: official.term,
            photoFileId: official.photoFileId,
            photoContentType: official.photoContentType
          },
          gridfsMetadata: fileInfo ? {
            _id: fileInfo._id,
            filename: fileInfo.filename,
            length: fileInfo.length,
            uploadDate: fileInfo.uploadDate,
            metadata: fileInfo.metadata
          } : null
        });
      } catch (err) {
        console.warn('Failed to retrieve GridFS metadata', err);
        return res.status(500).json({ message: 'Failed to retrieve GridFS metadata', error: err.message });
      }
    }
    
    res.status(500).json({ message: 'GridFS bucket not initialized' });
  } catch (err) {
    console.error('Failed to get official metadata', err);
    return res.status(500).json({ message: 'Error', error: err.message });
  }
});

// GET /admin/officials/verify/all - verify all officials have GridFS metadata
router.get('/verify/all', isAdmin, async (req, res) => {
  try {
    const officials = await Official.find({ photoFileId: { $exists: true, $ne: null } }).select('_id photoFileId name title term');
    
    if (officials.length === 0) {
      return res.json({ message: 'No officials with photos found', count: 0 });
    }
    
    const db = mongoose.connection.db;
    const gridfsFiles = await db.collection('barangayOfficials.files').find({ _id: { $in: officials.map(o => o.photoFileId) } }).toArray();
    
    const results = officials.map(official => {
      const gridfsFile = gridfsFiles.find(f => f._id.toString() === official.photoFileId.toString());
      return {
        officialId: official._id,
        name: official.name,
        title: official.title,
        photoFileId: official.photoFileId,
        inGridFS: !!gridfsFile,
        gridfsMetadata: gridfsFile ? {
          filename: gridfsFile.filename,
          uploadDate: gridfsFile.uploadDate,
          size: gridfsFile.length,
          metadata: gridfsFile.metadata
        } : null
      };
    });
    
    const allHaveMetadata = results.every(r => r.gridfsMetadata && r.gridfsMetadata.metadata);
    res.json({ 
      message: 'Verification complete',
      totalOfficials: results.length,
      allHaveMetadata,
      results
    });
  } catch (err) {
    console.error('Failed to verify officials', err);
    return res.status(500).json({ message: 'Error', error: err.message });
  }
});

module.exports = router;
