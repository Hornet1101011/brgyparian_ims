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

app.use('/api/inbox', (req, res, next) => { console.log('Received request to /api/inbox'); next(); }, inboxRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/notifications', notificationRoutes);
// Verification routes for resident ID uploads and admin verification actions
app.use('/api/verification', verificationRoutes);

export default app;
