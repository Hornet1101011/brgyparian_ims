import { Router, Request, Response } from 'express';
import { GridFSBucket } from 'mongodb';
import mongoose from 'mongoose';

const router = Router();

// Setup multer for handling file uploads
let upload: any;
try {
  const multer = require('multer');
  upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit
} catch (e) {
  console.warn('Multer not available for processedDocuments, file uploads may fail:', e);
}

/**
 * GET /api/processed-documents
 * List all processed documents metadata
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      return res.status(500).json({ message: 'Database not available' });
    }

    const filesColl = db.collection('processed_documents.files');
    const files = await filesColl.find({}).toArray();

    return res.json({
      items: files.map(f => ({
        _id: f._id,
        filename: f.filename,
        length: f.length,
        uploadDate: f.uploadDate,
        contentType: f.contentType,
        metadata: f.metadata || {}
      }))
    });
  } catch (err) {
    console.error('Error listing processed documents:', err);
    return res.status(500).json({ message: 'Failed to list processed documents', error: (err as Error).message });
  }
});

/**
 * GET /api/processed-documents/:id/raw
 * Download raw processed document from GridFS
 */
router.get('/:id/raw', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = mongoose.connection.db;

    if (!db) {
      return res.status(500).json({ message: 'Database not available' });
    }

    const { ObjectId } = mongoose.Types;
    let objectId: mongoose.Types.ObjectId;

    try {
      objectId = new ObjectId(id as string);
    } catch (e) {
      return res.status(400).json({ message: 'Invalid document ID' });
    }

    const bucket = new GridFSBucket(db as any, { bucketName: 'processed_documents' });

    // Check if file exists
    const filesColl = db.collection('processed_documents.files');
    const fileDoc = await filesColl.findOne({ _id: objectId });

    if (!fileDoc) {
      return res.status(404).json({ message: `Processed document ${id} not found` });
    }

    // Set response headers
    res.setHeader('Content-Type', fileDoc.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', fileDoc.length);
    res.setHeader('Content-Disposition', `inline; filename="${fileDoc.filename || 'document'}"`);

    // Stream file from GridFS
    const downloadStream = bucket.openDownloadStream(objectId);

    downloadStream.pipe(res);

    downloadStream.on('error', (err) => {
      console.error('Error downloading processed document:', err);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error downloading document' });
      }
    });
  } catch (err) {
    console.error('Error in GET processed document:', err);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to retrieve processed document', error: (err as Error).message });
    }
  }
});

/**
 * POST /api/processed-documents/upload
 * Upload a processed document to GridFS
 * 
 * Expected form data:
 * - file: binary file data
 * - sourceTemplateId (optional): reference to source template
 * - requestId (optional): reference to document request
 */
router.post('/upload', upload ? upload.single('file') : [], async (req: Request, res: Response) => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      return res.status(500).json({ message: 'Database not available' });
    }

    // Get file from multer middleware
    if (!req.file) {
      return res.status(400).json({ message: 'No file provided' });
    }

    const fileBuffer = req.file.buffer;
    const filename = req.file.originalname || `processed_${Date.now()}.docx`;
    const contentType = req.file.mimetype || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    // Extract optional metadata
    const metadata = {
      sourceTemplateId: req.body.sourceTemplateId || null,
      requestId: req.body.requestId || null,
      uploadedAt: new Date(),
      uploadedBy: (req as any).user?._id || null
    };

    // Create GridFS bucket and upload stream
    const bucket = new GridFSBucket(db as any, { bucketName: 'processed_documents' });

    // Upload file to GridFS
    const uploadStream = bucket.openUploadStream(filename, {
      contentType,
      metadata
    });

    uploadStream.on('error', (err) => {
      console.error('GridFS upload error:', err);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to upload file to GridFS', error: err.message });
      }
    });

    uploadStream.on('finish', (file: any) => {
      console.log(`[Processed Documents] ✓ Uploaded ${filename} to GridFS bucket processed_documents with ID ${file._id}`);
      return res.json({
        success: true,
        message: 'File uploaded successfully',
        id: file._id,
        filename: file.filename,
        size: file.length,
        contentType: file.contentType
      });
    });

    // Write file buffer to upload stream
    uploadStream.end(fileBuffer);

  } catch (err) {
    console.error('Error in POST /upload processed document:', err);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to upload processed document', error: (err as Error).message });
    }
  }
});

/**
 * GET /api/processed-documents/:id
 * Get metadata for processed document
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = mongoose.connection.db;

    if (!db) {
      return res.status(500).json({ message: 'Database not available' });
    }

    const { ObjectId } = mongoose.Types;
    let objectId: mongoose.Types.ObjectId;

    try {
      objectId = new ObjectId(id as string);
    } catch (e) {
      return res.status(400).json({ message: 'Invalid document ID' });
    }

    const filesColl = db.collection('processed_documents.files');
    const fileDoc = await filesColl.findOne({ _id: objectId });

    if (!fileDoc) {
      return res.status(404).json({ message: `Processed document ${id} not found` });
    }

    return res.json({
      _id: fileDoc._id,
      filename: fileDoc.filename,
      length: fileDoc.length,
      uploadDate: fileDoc.uploadDate,
      contentType: fileDoc.contentType,
      metadata: fileDoc.metadata || {}
    });
  } catch (err) {
    console.error('Error getting processed document metadata:', err);
    return res.status(500).json({ message: 'Failed to retrieve document metadata', error: (err as Error).message });
  }
});

export = router;
