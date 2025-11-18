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

const router = express.Router();

// Use memory storage so we can stream directly into GridFS (no temporary disk files)
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/verification/upload - residents upload up to 2 ID files for verification
router.post('/upload', auth, upload.array('ids', 2), async (req: any, res) => {
  try {
    const user = (req.user as any);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
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
    vr.status = 'approved';
    vr.reviewedAt = new Date();
    vr.reviewerId = (req as any).user._id;
    await vr.save();

    // set user verified
    const user = await User.findById(vr.userId) as any;
    if (user) {
      user.set('verified', true);
      await user.save();
    }

    return res.json({ message: 'Verification request approved' });
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

    return res.json({ message: 'Verification request rejected and removed' });
  } catch (err) {
    console.error('Error rejecting verification request', err);
    return res.status(500).json({ message: 'Error', error: String(err) });
  }
});

export default router;
