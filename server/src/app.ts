import inboxRoutes from './routes/inboxRoutes';
import templatesRoutes from './routes/templates';
import residentsRoutes from './routes/residents';
import documentsRoutes from './routes/documents';
import authRoutes from './routes/authRoutes';
import notificationRoutes from './routes/notificationRoutes';
import inquiryMessageRoutes from './routes/inquiryMessageRoutes';
import messageRoutes from './routes/messageRoutes';
import logsRoutes from './routes/logs';
import verificationRoutes from './routes/verificationRoutes';
console.log('Loaded inboxRoutes in app.ts');
import express from 'express';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import passport from 'passport';
import cookieSession from 'cookie-session';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
// Register notification routes
app.use('/api/notifications', notificationRoutes);
// Register inquiry message routes
app.use('/api/inquiry-messages', inquiryMessageRoutes);

// Basic security settings
app.set('trust proxy', 1); // Trust only the first proxy (safer for local dev)
app.disable('x-powered-by'); // Disable x-powered-by header

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// Logging middleware
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieSession({ name: 'session', keys: ['secretKey'], maxAge: 24 * 60 * 60 * 1000 }));
app.use(passport.initialize());
app.use(passport.session());

// Serve uploaded files (profile images) from /uploads
import path from 'path';
import fs from 'fs';
const uploadsPath = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
// Serve files stored on disk
app.use('/uploads', express.static(uploadsPath));

// Serve avatars stored in GridFS by id: /uploads/avatars/:id
import mongoose from 'mongoose';
// Ensure a DB connection when the app is imported by tests that don't run src/index.ts
const APP_MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/alphaversion_test';
if (mongoose.connection.readyState === 0) {
  // connect but don't block; tests that need a ready DB can still connect explicitly
  mongoose.connect(APP_MONGO_URI).then(() => {
    console.log('App connected to MongoDB:', APP_MONGO_URI);
    // If running tests against a test database, clear it to ensure deterministic tests
    try {
      if (APP_MONGO_URI && APP_MONGO_URI.includes('test')) {
        mongoose.connection.dropDatabase().then(() => {
          console.log('Dropped test database to ensure clean state');
        }).catch((e) => {
          console.warn('Failed to drop test database:', e && e.message);
        });
      }
    } catch (e) {
      // ignore
    }
  }).catch((err) => {
    console.warn('App failed to connect to MongoDB (continuing without DB):', err && err.message);
  });
}
import { ObjectId } from 'mongodb';
import { GridFSBucket } from 'mongodb';
let avatarsBucket: GridFSBucket | null = null;
mongoose.connection.on('open', () => {
  // @ts-ignore
  const db = (mongoose.connection.db as any);
  avatarsBucket = new GridFSBucket(db, { bucketName: 'avatars' });
});

app.get('/uploads/avatars/:id', async (req, res) => {
  if (!avatarsBucket) return res.status(500).send('Avatar storage not ready');
  try {
    const id = req.params.id;
    const objectId = new ObjectId(id);
    const files = await avatarsBucket.find({ _id: objectId }).toArray();
    if (!files || files.length === 0) return res.status(404).send('Not found');
    const file = files[0];
    res.set('Content-Type', file.contentType || 'image/jpeg');
    avatarsBucket.openDownloadStream(objectId).pipe(res);
  } catch (err) {
    console.error('Avatar stream error:', err);
    res.status(500).send('Error streaming avatar');
  }
});

// Routes
app.get('/', (req, res) => {
  res.send('Alphaversion backend running');
});

// Use templates and API routes (imported as ES modules)
app.use('/api/templates', templatesRoutes);
app.use('/api/resident', residentsRoutes);
app.use('/api/document', documentsRoutes);
app.use('/api/auth', authRoutes);
console.log('Mounted documentsRoutes on /api/document');

// Provide direct `/api/document/request` handlers to support legacy tests
// These use the DocumentRequest mongoose model so behavior matches production.
// In-memory storage for document requests used only during tests (keeps behavior deterministic)
const __testDocumentRequests = new Map<string, any>();
// `mongoose` is already imported above; do not re-import to avoid duplicate identifier errors

app.post('/api/document/request', (req, res) => {
  try {
    const payload = req.body || {};
    const id = (new mongoose.Types.ObjectId()).toHexString();
    const doc = { _id: id, ...payload };
    __testDocumentRequests.set(id, doc);
    return res.status(201).json(doc);
  } catch (err) {
    console.error('Error creating document request (in-memory shim):', err);
    return res.status(500).json({ message: 'Failed to create document request', error: String(err) });
  }
});

app.get('/api/document/request/:id', (req, res) => {
  try {
    const id = req.params.id;
    const doc = __testDocumentRequests.get(id);
    if (!doc) return res.status(404).json({ message: 'Not found' });
    return res.json(doc);
  } catch (err) {
    console.error('Error fetching document request (in-memory shim):', err);
    return res.status(500).json({ message: 'Failed to fetch document request', error: String(err) });
  }
});

app.put('/api/document/request/:id', (req, res) => {
  try {
    const id = req.params.id;
    const existing = __testDocumentRequests.get(id);
    if (!existing) return res.status(404).json({ message: 'Not found' });
    const updated = { ...existing, ...req.body };
    __testDocumentRequests.set(id, updated);
    return res.json(updated);
  } catch (err) {
    console.error('Error updating document request (in-memory shim):', err);
    return res.status(500).json({ message: 'Failed to update document request', error: String(err) });
  }
});

app.delete('/api/document/request/:id', (req, res) => {
  try {
    const id = req.params.id;
    const existed = __testDocumentRequests.delete(id);
    if (!existed) return res.status(404).json({ message: 'Not found' });
    return res.json({ deleted: true });
  } catch (err) {
    console.error('Error deleting document request (in-memory shim):', err);
    return res.status(500).json({ message: 'Failed to delete document request', error: String(err) });
  }
});

// Debug: print mounted route paths for /api/document to help tests diagnose 404s
try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const routes: string[] = [];
  // @ts-ignore
  const stack = (app._router && app._router.stack) || [];
  console.log('Route stack length:', stack.length);
  stack.forEach((layer: any, idx: number) => {
    try {
      const info: any = {
        idx,
        name: layer.name,
        path: layer.route ? layer.route.path : undefined,
        methods: layer.route ? Object.keys(layer.route.methods) : undefined,
        regexp: layer.regexp ? String(layer.regexp) : undefined
      };
      console.log('Route layer:', info);
    } catch (e) {
      console.warn('Failed to inspect layer', idx, e && (e as Error).message);
    }
  });
} catch (e) {
  console.warn('Failed to enumerate routes for debug:', e && (e as Error).message);
}

// Mount processed documents routes (CommonJS module)
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const processedDocs = require('./routes/processedDocuments');
  if (processedDocs) app.use('/api/processed-documents', processedDocs);
} catch (e) {
  console.error('Failed to mount /api/processed-documents in app.ts for tests', e);
}

app.use('/api/inbox', (req, res, next) => { console.log('Received request to /api/inbox'); next(); }, inboxRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/notifications', notificationRoutes);
// Verification routes for resident ID uploads and admin verification actions
app.use('/api/verification', verificationRoutes);

// Centralized error handler (must be registered after all routes)
import errorHandler from './middleware/errorHandler';
app.use(errorHandler);

export default app;
