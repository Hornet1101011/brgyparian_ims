import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { auth, authorize } from '../middleware/auth';
import { handleSaveError } from '../utils/handleSaveError';
import { VerificationRequest } from '../models/VerificationRequest';
import mongoose from 'mongoose';
import { ensureBucket, getBucket } from '../utils/gridfs';
import { Message } from '../models/Message';
import { Notification } from '../models/Notification';
import { User } from '../models/User';
import { sendToUser, addClient, removeClient } from '../utils/sse.js';
import SystemSettingModel from '../models/SystemSetting';

const router = express.Router();

// Use memory storage so we can stream directly into GridFS (no temporary disk files)
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/verification/upload - residents upload up to 3 ID files for verification
router.post('/upload', auth, upload.array('ids', 3), async (req: any, res) => {
  try {
    // if verifications are globally disabled, reject uploads
    try {
      const settings = await SystemSettingModel.findOne().lean();
      if (settings && settings.enableVerifications === false) {
        return res.status(403).json({ message: 'Verifications are currently disabled' });
      }
    } catch (se) {
      // ignore and continue if settings lookup fails
    }
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
      return res.status(500).json({ message: 'Storage for verification requests is not available' });
    }
    const gridIds: any[] = [];
    // collect declared file types from form-data (e.g. repeated `fileTypes` fields)
    const submittedTypes = (req.body && req.body.fileTypes) ? (Array.isArray(req.body.fileTypes) ? req.body.fileTypes : [req.body.fileTypes]) : [];
    for (let idx = 0; idx < (req.files || []).length; idx++) {
      const f = req.files[idx];
      try {
        const originalName = f.originalname || `file_${Date.now()}`;
        filenames.push(originalName);
        const readable = Readable.from(f.buffer);
        if (!bucket) {
          throw new Error('GridFS bucket not available');
        }
        // include declared fileType in GridFS metadata when provided
        const declaredType = submittedTypes[idx] || null;
        const uploadStream = bucket.openUploadStream(originalName, {
          metadata: { uploadedBy: user._id, barangayID: user.barangayID, fileType: declaredType }
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
    // If the resident already has a pending verification request, replace its files instead
    let vr: any = null;
    try {
      const existing = await VerificationRequest.findOne({ userId: user._id, status: 'pending' });
      if (existing) {
        // remove old GridFS files
        try {
          if (Array.isArray(existing.gridFileIds) && existing.gridFileIds.length > 0) {
            for (const fid of existing.gridFileIds) {
              try {
                const fileId = typeof fid === 'string' ? new ObjectId(fid) : fid;
                // @ts-ignore
                await bucket.delete(fileId);
              } catch (e) {
                console.warn('Failed to delete old GridFS file while replacing verification request', fid, e && (e as Error).message);
              }
            }
          }
        } catch (e) {
          console.warn('Error cleaning old GridFS files for existing verification request', e && (e as Error).message);
        }
        // build structured filesMeta for the request (prefer fileTypes from form-data)
        const filesMeta = filenames.map((fn, idx) => ({ filename: fn, gridFileId: gridIds[idx], fileType: submittedTypes[idx] || null, barangayID: user.barangayID || existing.barangayID }));

        existing.files = filenames;
        existing.gridFileIds = gridIds;
        existing.filesMeta = filesMeta;
        existing.barangayID = user.barangayID || existing.barangayID;
        existing.createdAt = new Date();
        existing.status = 'pending';
        try {
          await existing.save();
        } catch (err: any) {
          if (handleSaveError(err, res)) return;
          throw err;
        }
        vr = existing;
      } else {
        const filesMeta = filenames.map((fn, idx) => ({ filename: fn, gridFileId: gridIds[idx], fileType: submittedTypes[idx] || null, barangayID: user.barangayID }));
        vr = new VerificationRequest({ userId: user._id, barangayID: user.barangayID, files: filenames, gridFileIds: gridIds, filesMeta, status: 'pending' });
        try {
          await vr.save();
        } catch (err: any) {
          if (handleSaveError(err, res)) return;
          throw err;
        }
      }
    } catch (err) {
      throw err;
    }

    // notify the owner via SSE that a verification request was created
    try {
      sendToUser(String(user._id), 'verification-request', vr);
    } catch (e) {}

    // Notify all admins by creating Message entries and Notifications
    const admins = await User.find({ role: 'admin' });
    const residentName = (user.fullName || user.username || user.email || 'Resident');
    const subject = 'New Verification Request';
    const text = `${residentName} (${(user.barangayID || 'no-brgy')}) submitted verification documents.`;
    for (const admin of admins) {
      try {
        // Message model uses `from`, `to`, `subject` and `text` fields; include sender's barangayID
        await Message.create({ from: user._id, to: admin._id, subject, text, barangayID: user.barangayID });
      } catch (merr) {
        console.warn('Failed to create admin message for verification request', merr && (merr as Error).message);
      }
      try {
        await Notification.create({
          user: admin._id,
          type: 'verification_request',
          title: subject,
          message: text,
          data: { requestId: vr._id?.toString(), userId: user._id.toString(), barangayID: user.barangayID },
          read: false,
        });
      } catch (nerr) {
        console.warn('Failed to create admin notification for verification request', nerr && (nerr as Error).message);
      }
    }

    // normalize gridFileIds to strings for client convenience and include per-file metadata
    const vrObj: any = vr.toObject ? vr.toObject() : vr;
    if (Array.isArray(vrObj.gridFileIds)) vrObj.gridFileIds = vrObj.gridFileIds.map((g: any) => String(g));
    // Build files metadata array pairing filenames with their grid ids and the sender's barangayID
    const filesMeta = filenames.map((fn, idx) => ({ filename: fn, gridFileId: String(gridIds[idx] || ''), fileType: (Array.isArray(req.body?.fileTypes) ? req.body.fileTypes[idx] : (req.body?.fileTypes || null)), barangayID: user.barangayID }));
    vrObj.filesMeta = filesMeta;
    return res.json({ message: 'Files uploaded', verificationRequest: vrObj });
  } catch (err) {
    console.error('Verification upload error', err);
    return res.status(500).json({ message: 'Upload failed', error: String(err) });
  }
});

// Admin: list verification requests
router.get('/admin/requests', auth, authorize('admin'), async (req, res) => {
  try {
    // if verifications are disabled, hide requests (return empty list)
    try {
      const settings = await SystemSettingModel.findOne().lean();
      if (settings && settings.enableVerifications === false) return res.json([]);
    } catch (se) {}
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
    // If verifications are disabled, hide any pending requests and don't prompt residents
    try {
      const settings = await SystemSettingModel.findOne().lean();
      if (settings && settings.enableVerifications === false) {
        return res.json([]);
      }
    } catch (se) {}
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
    // normalize gridFileIds to strings and attach filesMeta for client convenience
    const mapped = (reqs || []).map((vr: any) => {
      const obj = vr.toObject ? vr.toObject() : vr;
      if (Array.isArray(obj.gridFileIds)) obj.gridFileIds = obj.gridFileIds.map((g: any) => String(g));
      // Prefer already-stored structured filesMeta; otherwise, construct from legacy arrays
      if (Array.isArray(obj.filesMeta) && obj.filesMeta.length > 0) {
        obj.filesMeta = obj.filesMeta.map((fm: any) => ({ filename: fm.filename, gridFileId: String(fm.gridFileId || ''), fileType: fm.fileType || null, barangayID: fm.barangayID || obj.barangayID }));
      } else {
        const filesMeta = (obj.files || []).map((fn: any, idx: number) => ({ filename: fn, gridFileId: String((obj.gridFileIds && obj.gridFileIds[idx]) || ''), fileType: null, barangayID: obj.barangayID }));
        obj.filesMeta = filesMeta;
      }
      return obj;
    });
    return res.json(mapped);
  } catch (err) {
    console.error('Error fetching my verification requests', err);
    return res.status(500).json({ message: 'Error fetching requests', error: String(err) });
  }
});

// Get a specific verification request by id (owner or admin)
router.get('/requests/:id', auth, async (req, res) => {
  try {
    // If verifications disabled, respond as not found so UI hides it
    try {
      const settings = await SystemSettingModel.findOne().lean();
      if (settings && settings.enableVerifications === false) return res.status(404).json({ message: 'Not found' });
    } catch (se) {}
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
    // If verifications disabled, don't allow file download
    try {
      const settings = await SystemSettingModel.findOne().lean();
      if (settings && settings.enableVerifications === false) return res.status(404).send('Not found');
    } catch (se) {}
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
    // If verifications are disabled, disallow manual toggles via verify-user endpoint
    try {
      const settings = await SystemSettingModel.findOne().lean();
      if (settings && settings.enableVerifications === false) return res.status(403).json({ message: 'Verifications are disabled' });
    } catch (se) {}
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
    // Notify the user that their verified status was changed by admin
    try {
      await Notification.create({
        user: user._id,
        type: 'verification_manual_update',
        title: 'Account verified',
        message: `Your account verified status has been set to ${verifiedValue ? 'true' : 'false'} by an administrator.`,
        data: { userId: user._id.toString(), verified: !!verifiedValue },
        read: false,
      });
    } catch (nerr) {
      console.warn('Failed to create notification for user verification toggle', nerr && (nerr as Error).message);
    }
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
    // If verifications disabled, prevent approve actions
    try {
      const settings = await SystemSettingModel.findOne().lean();
      if (settings && settings.enableVerifications === false) return res.status(403).json({ message: 'Verifications are disabled' });
    } catch (se) {}
    const { id } = req.params;
    const vr = await VerificationRequest.findById(id);
    if (!vr) return res.status(404).json({ message: 'Verification request not found' });
    // set user verified
    const user = await User.findById(vr.userId) as any;
    if (user) {
      user.set('verified', true);
      try {
        await user.save();
      } catch (err: any) {
        if (handleSaveError(err, res)) return res.status(500).json({ message: 'Error updating user verification' });
        throw err;
      }
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

    // Create a notification for the user to inform them their verification was approved
    try {
      await Notification.create({
        user: vr.userId,
        type: 'verification_result',
        title: 'Verification Approved',
        message: 'Your verification request has been approved by an administrator.',
        data: { requestId: id, approved: true },
        read: false,
      });
    } catch (nerr) {
      console.warn('Failed to create user notification for verification approval', nerr && (nerr as Error).message);
    }

    return res.json({ message: 'Verification request approved and removed' });
  } catch (err) {
    console.error('Error approving verification request', err);
    return res.status(500).json({ message: 'Error', error: String(err) });
  }
});

// Admin: reject a specific verification request by id (delete files and request, leave user unverified)
router.post('/admin/requests/:id/reject', auth, authorize('admin'), async (req, res) => {
  try {
    // If verifications disabled, prevent reject actions
    try {
      const settings = await SystemSettingModel.findOne().lean();
      if (settings && settings.enableVerifications === false) return res.status(403).json({ message: 'Verifications are disabled' });
    } catch (se) {}
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
      try {
        await user.save();
      } catch (err: any) {
        if (handleSaveError(err, res)) return res.status(500).json({ message: 'Error updating user verification' });
        throw err;
      }
    }

    // notify owner about deletion and profile update (unverified)
    try {
      sendToUser(String(vr.userId), 'verification-request-deleted', { requestId: id });
      sendToUser(String(vr.userId), 'profile', { verified: false });
    } catch (e) {}

    // Notify the user that their verification request was rejected
    try {
      await Notification.create({
        user: vr.userId,
        type: 'verification_result',
        title: 'Verification Rejected',
        message: 'Your verification request has been reviewed and rejected by an administrator.',
        data: { requestId: id, approved: false },
        read: false,
      });
    } catch (nerr) {
      console.warn('Failed to create user notification for verification rejection', nerr && (nerr as Error).message);
    }

    return res.json({ message: 'Verification request rejected and removed' });
  } catch (err) {
    console.error('Error rejecting verification request', err);
    return res.status(500).json({ message: 'Error', error: String(err) });
  }
});

// Admin: unapprove (revert) a previously approved verification. This will
// mark the user as unverified and attempt to update any related verification
// request records back to a non-approved state. This is a best-effort revert
// since approved requests are typically removed during approval.
router.post('/admin/requests/:id/unapprove', auth, authorize('admin'), async (req, res) => {
  try {
    // If verifications are disabled, disallow manual toggles
    try {
      const settings = await SystemSettingModel.findOne().lean();
      if (settings && settings.enableVerifications === false) return res.status(403).json({ message: 'Verifications are disabled' });
    } catch (se) {}

    const { id } = req.params;
    // Try to locate a verification request by id to resolve the affected user
    let vr = null;
    try {
      vr = await VerificationRequest.findById(id);
    } catch (e) {
      vr = null;
    }

    // If we couldn't find a request, allow caller to pass a userId in body as fallback
    const userId = vr ? vr.userId : (req.body && req.body.userId) ? req.body.userId : null;
    if (!userId) return res.status(404).json({ message: 'Verification request or user not found' });

    const user = await User.findById(userId) as any;
    if (!user) return res.status(404).json({ message: 'User not found' });

    // mark user as unverified
    user.set('verified', false);
    try {
      await user.save();
    } catch (err: any) {
      if (handleSaveError(err, res)) return res.status(500).json({ message: 'Error updating user verification' });
      throw err;
    }

    // Try to revert any verification request records for this user that were marked approved.
    try {
      await VerificationRequest.updateMany({ userId: user._id, status: 'approved' }, { status: 'pending', reviewedAt: null, reviewerId: null });
    } catch (e) {
      // non-fatal
      console.warn('Failed to revert verification request states for user', user._id, e && (e as Error).message);
    }

    // Notify user about manual unverify
    try {
      await Notification.create({
        user: user._id,
        type: 'verification_manual_update',
        title: 'Account Unverified',
        message: 'An administrator has reverted your verified status. Your account is no longer verified.',
        data: { userId: user._id.toString(), verified: false },
        read: false,
      });
    } catch (nerr) {
      console.warn('Failed to create notification for user unverify', nerr && (nerr as Error).message);
    }

    // send SSE profile update
    try {
      sendToUser(String(user._id), 'profile', { verified: false });
    } catch (e) {}

    return res.json({ message: 'User unverified', user: { _id: user._id, verified: false } });
  } catch (err) {
    console.error('Error unapproving verification request', err);
    return res.status(500).json({ message: 'Error', error: String(err) });
  }
});

export default router;
