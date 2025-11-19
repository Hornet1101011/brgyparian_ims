import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { auth, authorize } from '../middleware/auth';
import { VerificationRequest } from '../models/VerificationRequest';
import mongoose from 'mongoose';
import { ensureBucket, getBucket } from '../utils/gridfs';
import { Message } from '../models/Message';
import { User } from '../models/User';
import { sendToUser, addClient, removeClient } from '../utils/sse.js';

const router = express.Router();

// Use memory storage so we can stream directly into GridFS (no temporary disk files)
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/verification/upload - residents upload up to 2 ID files for verification
router.post('/upload', auth, upload.array('ids', 2), async (req: any, res) => {
  try {
    const user = (req.user as any);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    // If user is already verified, do not accept new verification uploads
    if (user.verified) {
      return res.status(400).json({ message: 'User already verified' });
    }
    // For memory storage, each file has a buffer and originalname
    const filenames: string[] = [];
    // Prefer using shared GridFSBucket instance
    const bucket = ensureBucket('verificationRequests');
    const mongodb = await import('mongodb');
    const ObjectId = mongodb.ObjectId;
    if (!bucket) {
      console.warn('verificationRequests GridFS bucket not available');
    }
    const gridIds: any[] = [];
    for (const f of (req.files || [])) {
      try {
        const originalName = f.originalname || `file_${Date.now()}`;
        filenames.push(originalName);
        const readable = Readable.from(f.buffer);
        if (!bucket) {
          throw new Error('GridFS bucket not available');
        }
        const uploadStream = bucket.openUploadStream(originalName, {
          metadata: { uploadedBy: user._id }
        });
        await new Promise((resolve, reject) => {
          readable.pipe(uploadStream)
            .on('error', (err) => reject(err))
            .on('finish', () => {
              gridIds.push(uploadStream.id);
              resolve(undefined);
            });
        });
      } catch (err) {
        console.warn('GridFS upload failed for file buffer', err);
      }
    }

  const vr = new VerificationRequest({ userId: user._id, files: filenames, gridFileIds: gridIds, status: 'pending' });
    await vr.save();

    // notify the owner via SSE that a verification request was created
    try {
      sendToUser(String(user._id), 'verification-request', vr);
    } catch (e) {}

    // Notify all admins by creating Message entries
    const admins = await User.find({ role: 'admin' });
  const residentName = (user.fullName || user.username || user.email || 'Resident');
  const subject = 'New Verification Request';
  const text = `${residentName} (${(user.barangayID || 'no-brgy')}) submitted verification documents.`;
    for (const admin of admins) {
      // Message model expects senderId and recipientId fields
      // Use CommonJS require to get the correct model if necessary
      const Msg = require('../../models/Message');
      await Msg.create({ senderId: user._id, recipientId: admin._id, subject, body: text });
    }

    return res.json({ message: 'Files uploaded', verificationRequest: vr });
  } catch (err) {
    console.error('Verification upload error', err);
    return res.status(500).json({ message: 'Upload failed', error: String(err) });
  }
});

// Admin: list verification requests
router.get('/admin/requests', auth, authorize('admin'), async (req, res) => {
  try {
    // populated user fields include verification status; cast to any in controllers to avoid strict IUser typing issues
    const reqs = await VerificationRequest.find().sort({ createdAt: -1 }).populate('userId', 'fullName username barangayID verified');
    res.json(reqs);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching requests', error: String(err) });
  }
});

// Resident: get their own verification requests
router.get('/requests/my', auth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    // If the user's profile is already verified, ensure no pending requests remain
    if (user.verified) {
      try {
        // find any pending requests and remove their files + docs
        const pending = await VerificationRequest.find({ userId: user._id, status: 'pending' });
        const mongodb = await import('mongodb');
        const ObjectId = mongodb.ObjectId;
        const bucket = ensureBucket('verificationRequests');
        for (const vr of pending) {
          if (Array.isArray(vr.gridFileIds) && bucket) {
            for (const fid of vr.gridFileIds) {
              try {
                const fileId = typeof fid === 'string' ? new ObjectId(fid) : fid;
                // @ts-ignore
                await bucket.delete(fileId);
              } catch (e) {
                console.warn('Failed to delete GridFS file during cleanup', fid, e && (e as Error).message);
              }
            }
          }
          try {
            await VerificationRequest.deleteOne({ _id: vr._id });
          } catch (e) {
            console.warn('Failed to delete verification request during cleanup', vr._id, e && (e as Error).message);
          }
          try { sendToUser(String(user._id), 'verification-request-deleted', { requestId: String(vr._id) }); } catch (e) {}
        }
      } catch (e) {
        console.warn('Error cleaning up pending verification requests for verified user', e && (e as Error).message);
      }
      return res.json([]);
    }

    const reqs = await VerificationRequest.find({ userId: user._id }).sort({ createdAt: -1 });
    return res.json(reqs);
  } catch (err) {
    console.error('Error fetching my verification requests', err);
    return res.status(500).json({ message: 'Error fetching requests', error: String(err) });
  }
});

// Get a specific verification request by id (owner or admin)
router.get('/requests/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const vr = await VerificationRequest.findById(id).populate('userId', 'fullName username barangayID verified');
    if (!vr) return res.status(404).json({ message: 'Verification request not found' });
    const user = (req as any).user;
    if (String(vr.userId._id || vr.userId) !== String(user._id) && user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }
    return res.json(vr);
  } catch (err) {
    console.error('Error fetching verification request by id', err);
    return res.status(500).json({ message: 'Error fetching request', error: String(err) });
  }
});

// Admin: stream/download a verification file from GridFS by id
router.get('/file/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const db = (mongoose.connection.db as any);
    const mongodb = await import('mongodb');
    const GridFSBucket = mongodb.GridFSBucket;
    const ObjectId = mongodb.ObjectId;
    const bucket = new GridFSBucket(db, { bucketName: 'verificationRequests' });
    const objectId = new ObjectId(id);
    const files = await bucket.find({ _id: objectId }).toArray();
    if (!files || files.length === 0) return res.status(404).send('File not found');
    const file = files[0];
    res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    const stream = bucket.openDownloadStream(objectId);
    stream.on('error', (err) => {
      console.error('GridFS download error', err);
      res.status(500).send('Error streaming file');
    });
    stream.pipe(res);
  } catch (err) {
    console.error('Error streaming verification file', err);
    res.status(500).send('Error');
  }
});

// SSE endpoint: client opens EventSource to receive verification/profile updates for the current user
// EventSource does not support custom headers, so accept a `token` query param as fallback.
router.get('/stream', async (req, res) => {
  try {
    // Prepare SSE response headers early so that even auth failures return a consistent MIME
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    try { res.flushHeaders?.(); } catch (e) {}

    // Try to resolve user from Authorization header, cookie, or query token
    let token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token && req.cookies && (req.cookies as any).token) token = (req.cookies as any).token;
    if (!token && (req.query && req.query.token)) token = String(req.query.token);

    if (!token) {
      // Send a structured SSE error then close
      try {
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ message: 'Please authenticate' })}\n\n`);
      } catch (e) {}
      return res.end();
    }

    try {
      const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'defaultsecret') as { _id: string };
      const { User } = require('../models/User');
      const userDoc = await User.findOne({ _id: decoded._id });
      if (!userDoc) {
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ message: 'Please authenticate' })}\n\n`);
        return res.end();
      }
      const user = {
        _id: userDoc._id,
        username: userDoc.username,
        barangayID: userDoc.barangayID,
        email: userDoc.email,
        address: userDoc.address,
        contactNumber: userDoc.contactNumber,
        role: userDoc.role,
        isActive: userDoc.isActive,
        department: userDoc.department,
        fullName: userDoc.fullName,
        verified: userDoc.verified || false,
      } as any;

      const userId = String(user._id);
      addClient(userId, res as any);
      try {
        res.write(`event: connected\n`);
        res.write(`data: ${JSON.stringify({ connected: true, verified: !!user.verified })}\n\n`);
      } catch (e) {}
      req.on('close', () => {
        try { removeClient(userId, res as any); } catch (e) {}
      });
    } catch (e) {
      // Token verify failed
      try {
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ message: 'Please authenticate' })}\n\n`);
      } catch (ee) {}
      return res.end();
    }
  } catch (err) {
    console.error('SSE stream error', err);
    try { res.end(); } catch (e) {}
  }
});

// Admin: toggle verify user
router.post('/admin/verify-user/:userId', auth, authorize('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { verified } = req.body;
    const user = await User.findById(userId) as any;
    if (!user) return res.status(404).json({ message: 'User not found' });
    // set verified flag (cast to any to avoid TS schema mismatch in project)
    user.set('verified', !!verified);
    await user.save();
    // Optionally update related verification requests
    if (verified) {
      await VerificationRequest.updateMany({ userId: user._id, status: 'pending' }, { status: 'approved', reviewedAt: new Date(), reviewerId: (req as any).user._id });
    }
    const verifiedValue = user.get('verified');
    return res.json({ message: 'User verification updated', user: { _id: user._id, verified: verifiedValue } });
  } catch (err) {
    res.status(500).json({ message: 'Error updating user verification', error: String(err) });
  }
});

// Resident: cancel their own verification request (delete request and files)
router.delete('/requests/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const vr = await VerificationRequest.findById(id);
    if (!vr) return res.status(404).json({ message: 'Verification request not found' });
    const user = (req as any).user;
    // only owner or admin can delete
    if (String(vr.userId) !== String(user._id) && user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // delete associated GridFS files if any
    try {
      const bucket = ensureBucket('verificationRequests');
      const mongodb = await import('mongodb');
      const ObjectId = mongodb.ObjectId;
      if (bucket && Array.isArray(vr.gridFileIds)) {
        for (const fid of vr.gridFileIds) {
          try {
            const fileId = typeof fid === 'string' ? new ObjectId(fid) : fid;
            // GridFSBucket.delete accepts ObjectId
            // @ts-ignore
            await bucket.delete(fileId);
          } catch (e) {
            console.warn('Failed to delete GridFS file', fid, e && (e as Error).message);
          }
        }
      }
    } catch (e) {
      console.warn('Error cleaning GridFS files for verification request', e && (e as Error).message);
    }

    // use model-level delete to satisfy TypeScript typings and avoid deprecated instance.remove
    await VerificationRequest.deleteOne({ _id: vr._id });
    // notify owner that their request was removed
    try {
      sendToUser(String(user._id), 'verification-request-deleted', { requestId: id });
    } catch (e) {}
    return res.json({ message: 'Verification request cancelled' });
  } catch (err) {
    console.error('Error cancelling verification request', err);
    return res.status(500).json({ message: 'Error cancelling request', error: String(err) });
  }
});

// Admin: approve a specific verification request by id
router.post('/admin/requests/:id/approve', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const vr = await VerificationRequest.findById(id);
    if (!vr) return res.status(404).json({ message: 'Verification request not found' });
    // set user verified
    const user = await User.findById(vr.userId) as any;
    if (user) {
      user.set('verified', true);
      await user.save();
    }

    // delete associated GridFS files (we keep behaviour similar to reject)
    try {
      const bucket = ensureBucket('verificationRequests');
      const mongodb = await import('mongodb');
      const ObjectId = mongodb.ObjectId;
      if (bucket && Array.isArray(vr.gridFileIds)) {
        for (const fid of vr.gridFileIds) {
          try {
            const fileId = typeof fid === 'string' ? new ObjectId(fid) : fid;
            // @ts-ignore
            await bucket.delete(fileId);
          } catch (e) {
            console.warn('Failed to delete GridFS file during approve cleanup', fid, e && (e as Error).message);
          }
        }
      }
    } catch (e) {
      console.warn('Error cleaning GridFS files for verification request during approve', e && (e as Error).message);
    }

    // remove the verification request after successful approval
    try {
      await VerificationRequest.deleteOne({ _id: vr._id });
    } catch (e) {
      console.warn('Failed to delete verification request after approve', vr._id, e && (e as Error).message);
    }

    // notify owner about profile update and that their request is removed
    try {
      sendToUser(String(vr.userId), 'profile', { verified: true });
      sendToUser(String(vr.userId), 'verification-request-deleted', { requestId: id });
    } catch (e) {}

    return res.json({ message: 'Verification request approved and removed' });
  } catch (err) {
    console.error('Error approving verification request', err);
    return res.status(500).json({ message: 'Error', error: String(err) });
  }
});

// Admin: reject a specific verification request by id (delete files and request, leave user unverified)
router.post('/admin/requests/:id/reject', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const vr = await VerificationRequest.findById(id);
    if (!vr) return res.status(404).json({ message: 'Verification request not found' });

    // delete GridFS files
    try {
      const bucket = ensureBucket('verificationRequests');
      const mongodb = await import('mongodb');
      const ObjectId = mongodb.ObjectId;
      if (bucket && Array.isArray(vr.gridFileIds)) {
        for (const fid of vr.gridFileIds) {
          try {
            const fileId = typeof fid === 'string' ? new ObjectId(fid) : fid;
            // @ts-ignore
            await bucket.delete(fileId);
          } catch (e) {
            console.warn('Failed to delete GridFS file', fid, e && (e as Error).message);
          }
        }
      }
    } catch (e) {
      console.warn('Error cleaning GridFS files for verification request', e && (e as Error).message);
    }

    // remove request (use model-level delete to satisfy typings)
    await VerificationRequest.deleteOne({ _id: vr._id });

    // ensure user is not marked verified
    const user = await User.findById(vr.userId) as any;
    if (user) {
      user.set('verified', false);
      await user.save();
    }

    // notify owner about deletion and profile update (unverified)
    try {
      sendToUser(String(vr.userId), 'verification-request-deleted', { requestId: id });
      sendToUser(String(vr.userId), 'profile', { verified: false });
    } catch (e) {}

    return res.json({ message: 'Verification request rejected and removed' });
  } catch (err) {
    console.error('Error rejecting verification request', err);
    return res.status(500).json({ message: 'Error', error: String(err) });
  }
});

export default router;
