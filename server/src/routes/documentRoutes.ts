import express, { NextFunction } from 'express';
import { auth, authorize } from '../middleware/auth';
import * as documentController from '../controllers/documentController';

import multer from 'multer';
const upload = multer({ dest: 'uploads/' });

const router = express.Router();

// Generate filled .docx from template and field values
router.post('/:id/generate-filled', documentController.generateFilledDocument);
// Download original .docx file for integrity check
router.get('/original/:id', documentController.downloadOriginalDocument);

// Preview a document (HTML or PDF)
router.get('/preview/:id', documentController.previewDocument);

// Process a document (fill template, generate PDF)
router.post('/:id/process', documentController.processDocument);

// Upload a document
router.post('/upload', upload.single('file'), documentController.uploadDocument);

// List all uploaded files
router.get('/list', documentController.listDocuments);

// Download a file by id
router.get('/file/:id', documentController.downloadDocument);

// Delete a file by id
router.delete('/file/:id', documentController.deleteDocument);

// Create a new document
router.post('/', auth, documentController.createDocument);

// Get all documents (no auth for testing)
router.get('/', documentController.getDocuments);

// Get a specific document
router.get('/:id', auth, documentController.getDocuments); // Should be getDocuments or getDocumentById?

// Update a document (admin and staff only)
router.patch('/:id', auth, authorize('admin', 'staff'), documentController.updateDocument);

// Preview a document
router.get('/preview/:id', documentController.previewDocument);

// GET template configuration (including validations)
router.get('/:fileId/config', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { ObjectId } = mongoose.Types;
    
    const db = mongoose.connection.db;
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database not initialized.' });
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(req.params.fileId)) {
      return res.json({ validations: [], config: {} });
    }

    // Check if templateconfig collection exists
    const collections = await db.listCollections().toArray();
    const hasConfigCollection = collections.some((c: any) => c.name === 'templateconfig');
    
    if (!hasConfigCollection) {
      // Return empty config if collection doesn't exist yet
      return res.json({ validations: [], config: {} });
    }

    const config = await db.collection('templateconfig').findOne({
      templateId: new ObjectId(req.params.fileId)
    });

    res.json({
      validations: config ? (config.validations || []) : [],
      autofillMappings: config ? (config.autofillMappings || {}) : {},
      config: config || {}
    });
  } catch (err) {
    console.error('Error fetching template config:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch template config', error: (err as any).message });
  }
});

// POST template configuration (including validations and autofill mappings)
router.post('/:fileId/config', auth, authorize('admin', 'staff'), async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { ObjectId } = mongoose.Types;
    const { validations, config, autofillMappings } = req.body;

    // Allow either validations array or autofillMappings object
    if (validations && !Array.isArray(validations)) {
      return res.status(400).json({ success: false, message: 'Validations must be an array' });
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(req.params.fileId)) {
      return res.status(400).json({ success: false, message: 'Invalid file ID format' });
    }

    const db = mongoose.connection.db;
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database not initialized.' });
    }

    // Create collection if it doesn't exist
    const collections = await db.listCollections().toArray();
    const hasConfigCollection = collections.some((c: any) => c.name === 'templateconfig');
    
    if (!hasConfigCollection) {
      await db.createCollection('templateconfig');
      console.log('Created templateconfig collection');
    }

    const templateId = new ObjectId(req.params.fileId);

    // Prepare update data
    const updateData: any = {
      templateId,
      updatedAt: new Date(),
      updatedBy: (req as any).user && (req as any).user._id ? (req as any).user._id : undefined
    };

    // Include validations if provided
    if (validations) {
      updateData.validations = validations;
    }

    // Include autofillMappings if provided
    if (autofillMappings) {
      updateData.autofillMappings = autofillMappings;
    }

    // Include config if provided
    if (config) {
      updateData.config = config;
    }

    // Upsert template configuration
    const result = await db.collection('templateconfig').updateOne(
      { templateId },
      { $set: updateData },
      { upsert: true }
    );

    res.json({
      success: true,
      message: 'Template configuration saved',
      matched: result.matchedCount,
      upserted: result.upsertedCount
    });
  } catch (err) {
    console.error('Error saving template config:', err);
    res.status(500).json({ success: false, message: 'Failed to save template config', error: (err as any).message });
  }
});

export default router;
