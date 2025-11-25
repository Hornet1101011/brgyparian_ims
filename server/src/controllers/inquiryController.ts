export const getMyInquiries = async (req: any, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    // Find inquiries by username and barangayID
    const inquiries = await Inquiry.find({ username: user.username, barangayID: user.barangayID })
      .sort({ createdAt: -1 });
    res.json(inquiries);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching resident inquiries', error });
  }
};
import { Request, Response, NextFunction } from 'express';
import path from 'path';
import mongoose from 'mongoose';
import { Inquiry } from '../models/Inquiry';
import { io } from '../index';
import { User } from '../models/User';
import { Message } from '../models/Message';
import { Notification } from '../models/Notification';
import { AppointmentSlot } from '../models/AppointmentSlot';
import { handleSaveError } from '../utils/handleSaveError';

export const createInquiry = async (req: any, res: Response, next: NextFunction) => {
  try {
    // Accept assignedTo (array of user IDs) and/or assignedRole
    const { subject, message, type, assignedTo, assignedRole, username: targetUsername, barangayID: targetBarangayID } = req.body;
    const user = (req as any).user;

    // Resolve recipient username/barangayID. Prefer explicit client-provided fields.
    let resolvedUsername = targetUsername;
    let resolvedBarangayID = targetBarangayID;

    // Diagnostic: log incoming body for debugging
    try {
      console.info('createInquiry incoming body:', { bodySample: { subject, message, targetUsername, targetBarangayID, assignedTo, assignedRole }, rawBodyKeys: Object.keys(req.body || {}) });
    } catch (e) {
      // ignore logging errors
    }

    // If client didn't provide username, attempt to infer from request body or uploaded metadata
    if (!resolvedUsername) {
      // Try to detect a username in other body fields (legacy clients might send 'username' elsewhere)
      if (req.body && (req.body.recipientUsername || req.body.toUsername)) {
        resolvedUsername = req.body.recipientUsername || req.body.toUsername;
      }
    }

    // If still missing, try to match by createdBy info (if the client attached createdBy as object)
    if (!resolvedUsername && req.body && req.body.createdBy) {
      if (typeof req.body.createdBy === 'string') {
        resolvedUsername = req.body.createdBy;
      } else if (req.body.createdBy.username) {
        resolvedUsername = req.body.createdBy.username;
      }
    }

    // If a username-like identifier is present (could be email or id), try to find canonical resident
    if (resolvedUsername) {
      try {
        // Look up by username or email or _id
        const possibleResident = await User.findOne({
          role: 'resident',
          $or: [ { username: resolvedUsername }, { email: resolvedUsername }, { _id: resolvedUsername } ]
        }).lean();
        if (possibleResident) {
          resolvedUsername = possibleResident.username;
          resolvedBarangayID = resolvedBarangayID || possibleResident.barangayID;
        }
      } catch (e) {
        // ignore lookup errors
      }
    }

    // Last-ditch: try to find a resident by matching a name in the subject/message to a user record
    if (!resolvedUsername && (subject || message)) {
      try {
        const nameCandidate = (subject || message).toString().slice(0, 200);
        const regex = new RegExp(nameCandidate.split(' ').slice(0,3).join('|'), 'i');
        const possible = await User.findOne({
          role: 'resident',
          $or: [ { fullName: { $regex: regex } }, { username: { $regex: regex } } ]
        }).lean();
        if (possible && possible.username) {
          resolvedUsername = possible.username;
          resolvedBarangayID = resolvedBarangayID || possible.barangayID;
        }
      } catch (e) {
        // ignore inference errors
        console.warn('Failed to infer resident username for inquiry creation', e);
      }
    }

    // Diagnostic: log what we resolved before creating inquiry
    try {
      console.info('createInquiry resolved recipient', { resolvedUsername, resolvedBarangayID, fallbackToStaff: (!resolvedUsername) });
    } catch (e) {}

    // If this is a staff/admin creating a thread and we couldn't resolve a recipient,
    // return an error so staff must explicitly select a resident instead of silently
    // saving the inquiry under the staff account (which prevents the resident from seeing it).
    try {
      const roleStr = (user && user.role) ? String(user.role).toLowerCase() : '';
      const isStaffLike = roleStr.includes('staff') || roleStr.includes('admin');
      if (isStaffLike && !resolvedUsername) {
        return res.status(400).json({ message: 'Recipient not resolved. Please select a resident to send this message to.' });
      }
    } catch (e) {
      // ignore
    }

    const inquiry = new Inquiry({
      subject,
      message,
      type: type || 'General',
      assignedTo: Array.isArray(assignedTo) ? assignedTo : [],
      assignedRole: assignedRole || 'staff',
      createdBy: user?._id,
      // Use resolvedUsername/barangayID if available; otherwise fall back to staff user (legacy behavior)
      username: resolvedUsername || user?.username || 'Unknown',
      barangayID: resolvedBarangayID || user?.barangayID || 'Unknown',
      // If a resident created the inquiry, mark it as 'pending' so staff know it needs review.
      // Other creators (staff/admin/system) will default to 'open'.
      status: (user && user.role && String(user.role).toLowerCase() === 'resident') ? 'pending' : 'open'
    });
    // Parse optional appointmentDates sent as form fields (supports `appointmentDates[]` or `appointmentDates`)
    try {
      const rawDates = req.body && (req.body.appointmentDates || req.body['appointmentDates[]']);
      if (rawDates) {
        const arr = Array.isArray(rawDates) ? rawDates : [rawDates];
        const now = new Date(); now.setHours(0,0,0,0);
        const validStrings: string[] = [];
        for (const s of arr) {
          if (!s) continue;
          try {
            const d = new Date(s);
            if (isNaN(d.getTime())) continue;
            const dStart = new Date(d);
            dStart.setHours(0,0,0,0);
            // Enforce future-or-today and weekday-only
            if (dStart < now) continue;
            const wk = dStart.getDay();
            if (wk === 0 || wk === 6) continue;
            const key = dStart.toISOString().slice(0,10);
            validStrings.push(key);
          } catch (ignore) {
            // skip invalid
          }
        }
        // Deduplicate, respect client-side limit (store up to 3)
        const unique = Array.from(new Set(validStrings));
        if (unique.length) inquiry.appointmentDates = unique.slice(0, 3);
      }
    } catch (e) {
      // non-fatal: ignore parsing errors and continue
      console.warn('Failed to parse appointmentDates for inquiry:', e);
    }
    // If files were uploaded via multer (router uses upload.array('attachments')) save metadata
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const host = req.get('host');
      const proto = req.protocol;
      inquiry.attachments = (req.files as any[]).map(f => ({
        filename: f.originalname,
        path: f.path,
        url: `${proto}://${host}/uploads/inquiries/${path.basename(f.path)}`,
        contentType: f.mimetype,
        size: f.size,
        uploadedAt: new Date()
      }));
    }
    try {
      await inquiry.save();
    } catch (err) {
      if (handleSaveError(err, res)) return;
      console.error('Error creating inquiry:', err);
      return res.status(500).json({ message: 'Error creating inquiry', error: err });
    }
    // Notify assigned staff
    const Notification = require('../../models/Notification');
    if (Array.isArray(assignedTo)) {
      for (const staffId of assignedTo) {
        await Notification.create({
          userId: staffId,
          type: 'inquiries',
          title: 'New Inquiry',
          message: `New inquiry submitted: ${subject}`
        });
      }
    }
    res.status(201).json(inquiry);
  } catch (error) {
    res.status(500).json({ message: 'Error creating inquiry', error });
  }
};

export const getAllInquiries = async (req: any, res: Response, next: NextFunction) => {
  try {
    // Only show inquiries assigned to the user or their role
    const user = req.user;
    let filter: any = {};
    if (user) {
      // Make staff inbox more permissive: include inquiries explicitly assigned to the user,
      // inquiries assigned to the user's role, and also inquiries that have no assignedRole
      // or an empty assignedRole (so staff don't miss unassigned submissions).
      filter = {
        $or: [
          { assignedTo: user._id },
          { assignedRole: user.role },
          { assignedRole: { $exists: false } },
          { assignedRole: '' },
          { assignedRole: null }
        ]
      };
    }
    const inquiries = await Inquiry.find(filter)
      .populate('createdBy', 'fullName username')
      .populate('assignedTo', 'fullName username');
    res.json(inquiries);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching inquiries', error });
  }
};

export const getInquiryById = async (req: any, res: Response, next: NextFunction) => {
  try {
    const inquiry = await Inquiry.findById(req.params.id)
      .populate('createdBy', 'firstName lastName')
      .populate('assignedTo', 'firstName lastName');
    if (!inquiry) {
      return res.status(404).json({ message: 'Inquiry not found' });
    }
    res.json(inquiry);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching inquiry', error });
  }
};

export const updateInquiry = async (req: any, res: Response, next: NextFunction) => {
  try {
    // Prepare update body and validate appointmentDates if supplied
    const updateBody: any = { ...req.body };
    try {
      const rawDates = updateBody.appointmentDates || updateBody['appointmentDates[]'];
      if (rawDates !== undefined) {
        const arr = Array.isArray(rawDates) ? rawDates : [rawDates];
        const now = new Date(); now.setHours(0,0,0,0);
        const validStrings: string[] = [];
        for (const s of arr) {
          if (!s) continue;
          try {
            const d = new Date(s);
            if (isNaN(d.getTime())) continue;
            const dStart = new Date(d);
            dStart.setHours(0,0,0,0);
            // enforce future-or-today and weekday-only
            if (dStart < now) continue;
            const wk = dStart.getDay();
            if (wk === 0 || wk === 6) continue;
            validStrings.push(dStart.toISOString().slice(0,10));
          } catch (ignore) { }
        }
        const unique = Array.from(new Set(validStrings));
        // If client provided appointmentDates but none are valid, reject the update
        if (arr.length > 0 && unique.length === 0) {
          return res.status(400).json({ message: 'Invalid appointmentDates: must be valid future weekdays in YYYY-MM-DD format.' });
        }
        if (unique.length) updateBody.appointmentDates = unique.slice(0, 3);
        else updateBody.appointmentDates = [];
      }
    } catch (e) {
      console.warn('Failed to validate appointmentDates on update:', e);
    }

    // Fetch existing inquiry to detect status transitions and for safety checks
    const beforeInquiry = await Inquiry.findById(req.params.id).lean();
    if (!beforeInquiry) return res.status(404).json({ message: 'Inquiry not found' });


    // If scheduledDates are being added, perform minute-precise atomic reservation
    let inquiry: any = null;
    const scheduledProvided = updateBody.scheduledDates && Array.isArray(updateBody.scheduledDates) && updateBody.scheduledDates.length > 0;
    if (scheduledProvided) {
      // Normalize and validate each scheduled slot
      const normalizeToMinutes = (t: string) => {
        const parts = String(t || '').split(':');
        if (parts.length < 2) return NaN;
        const hh = parseInt(parts[0], 10);
        const mm = parseInt(parts[1], 10);
        if (Number.isNaN(hh) || Number.isNaN(mm)) return NaN;
        return hh * 60 + mm;
      };

      const OFFICE_START = 8 * 60; // 480
      const OFFICE_END = 17 * 60; // 1020
      const LUNCH_START = 12 * 60; // 720
      const LUNCH_END = 13 * 60; // 780
      const SLOT_STEP = 5; // 5-minute buckets for atomic insertion

      // Build all slot docs to insert and run validation checks
      const slotDocs: Array<any> = [];
      for (const slot of updateBody.scheduledDates) {
        if (!slot || !slot.date || !slot.startTime || !slot.endTime) {
          return res.status(400).json({ message: 'Each scheduledDate must include date, startTime and endTime' });
        }
        const sMin = normalizeToMinutes(slot.startTime);
        const eMin = normalizeToMinutes(slot.endTime);
        if (Number.isNaN(sMin) || Number.isNaN(eMin) || sMin >= eMin) {
          return res.status(400).json({ message: `Invalid time range for ${slot.date}` });
        }
        if (sMin < OFFICE_START || eMin > OFFICE_END) {
          return res.status(400).json({ message: `Time range for ${slot.date} must be within office hours 08:00-17:00` });
        }
        // disallow lunch overlap
        if (sMin < LUNCH_END && eMin > LUNCH_START) {
          return res.status(400).json({ message: `Time range for ${slot.date} must not overlap lunch break 12:00-13:00` });
        }

          // generate slot integers (minute values at SLOT_STEP granularity)
          for (let m = sMin; m < eMin; m += SLOT_STEP) {
            slotDocs.push({
              date: slot.date,
              slot: m,
              inquiryId: req.params.id,
              scheduledBy: (req as any).user?._id,
              // Resident info: try to get from the existing inquiry; fallback to request body
              residentName: (beforeInquiry && (beforeInquiry as any).createdBy && (beforeInquiry as any).createdBy.fullName) || (beforeInquiry && (beforeInquiry as any).username) || undefined,
              residentUsername: (beforeInquiry && (beforeInquiry as any).username) || undefined,
              residentBarangayID: (beforeInquiry && (beforeInquiry as any).barangayID) || undefined,
              // Staff info (who confirmed)
              scheduledByUsername: (req as any).user?.username || undefined,
              scheduledByBarangayID: (req as any).user?.barangayID || undefined,
              // appointment-level time range
              appointmentStartTime: slot.startTime,
              appointmentEndTime: slot.endTime
            });
          }
      }

      // Attempt an atomic reservation using MongoDB transactions and the AppointmentSlot unique index
      let session: any = null;
      // Before attempting inserts, ensure there are no existing appointments matching
      // the same date + appointmentStartTime + appointmentEndTime for a different inquiry.
      try {
        const seenRanges = new Set<string>();
        const duplicateCheckPromises: Array<Promise<any>> = [];
        for (const slot of updateBody.scheduledDates) {
          const key = `${slot.date}|${slot.startTime}|${slot.endTime}`;
          if (seenRanges.has(key)) continue;
          seenRanges.add(key);
          // check if an appointment with same date and range exists but for a different inquiry
          duplicateCheckPromises.push(AppointmentSlot.findOne({
            date: slot.date,
            appointmentStartTime: slot.startTime,
            appointmentEndTime: slot.endTime
          }).lean());
        }
        const dupResults = await Promise.all(duplicateCheckPromises);
        for (const r of dupResults) {
          if (r && String((r as any).inquiryId) !== String(req.params.id)) {
            return res.status(409).json({ message: 'Duplicate appointment exists for the selected date and time range' });
          }
        }
      } catch (dupErr) {
        console.warn('Duplicate-range pre-check failed, continuing to attempt scheduling:', (dupErr as any)?.message || dupErr);
      }
      try {
        session = await mongoose.startSession();
        session.startTransaction();
        // Remove prior slots for this inquiry (reschedule case)
        await AppointmentSlot.deleteMany({ inquiryId: req.params.id }).session(session);
        // Insert new slots; unique index on {date, slot} ensures no overlap
        if (slotDocs.length > 0) {
          await AppointmentSlot.insertMany(slotDocs, { ordered: true, session });
        }
        // Update the inquiry with scheduledDates and scheduledBy inside the same transaction
        updateBody.scheduledBy = (req as any).user?._id || updateBody.scheduledBy;
        inquiry = await Inquiry.findByIdAndUpdate(req.params.id, updateBody, { new: true, session });
        if (!inquiry) {
          // Shouldn't happen; abort
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({ message: 'Inquiry not found' });
        }
        await session.commitTransaction();
        session.endSession();
      } catch (txErr: any) {
        try { if (session) { await session.abortTransaction(); session.endSession(); } } catch (e) { }
        // Duplicate key error means some slot was already taken
        if (txErr && txErr.code === 11000) {
          return res.status(409).json({ message: 'Scheduling conflict: one or more time slots already taken' });
        }
        // If transactions are not supported or other error, attempt best-effort non-transactional reservation
        console.warn('Transaction-based scheduling failed, attempting non-transactional fallback:', txErr && txErr.message);
        try {
          // remove any previous slots for this inquiry (best-effort)
          await AppointmentSlot.deleteMany({ inquiryId: req.params.id });
          // try to insert without a session; duplicate key will throw if any slot taken
          if (slotDocs.length > 0) {
            await AppointmentSlot.insertMany(slotDocs, { ordered: true });
          }
          // update inquiry normally
          inquiry = await Inquiry.findByIdAndUpdate(req.params.id, updateBody, { new: true });
          if (!inquiry) {
            // rollback: remove inserted slots
            try { await AppointmentSlot.deleteMany({ inquiryId: req.params.id }); } catch (e) { }
            return res.status(404).json({ message: 'Inquiry not found' });
          }
        } catch (fbErr: any) {
          // If duplicate key => conflict
          if (fbErr && fbErr.code === 11000) {
            // cleanup any partial inserts
            try { await AppointmentSlot.deleteMany({ inquiryId: req.params.id }); } catch (e) { }
            return res.status(409).json({ message: 'Scheduling conflict: one or more time slots already taken' });
          }
          console.error('Non-transactional fallback scheduling failed:', fbErr && (fbErr.message || fbErr));
          // cleanup any partial inserts
          try { await AppointmentSlot.deleteMany({ inquiryId: req.params.id }); } catch (e) { }
          return res.status(500).json({ message: 'Failed to schedule appointment', error: fbErr && (fbErr.message || fbErr) });
        }
      }
    } else {
      // No scheduledDates provided — perform a normal update
      inquiry = await Inquiry.findByIdAndUpdate(req.params.id, updateBody, { new: true });
      if (!inquiry) {
        return res.status(404).json({ message: 'Inquiry not found' });
      }
    }

    // If this is a transition to 'scheduled' and scheduledDates were provided, notify the resident
    try {
      const beforeStatus = String((beforeInquiry as any).status);
      const afterStatus = String((inquiry as any).status);
      const scheduledProvided = updateBody.scheduledDates && Array.isArray(updateBody.scheduledDates) && updateBody.scheduledDates.length > 0;
      if (beforeStatus !== 'scheduled' && afterStatus === 'scheduled' && scheduledProvided) {
        // find resident user
        const resident = await User.findOne({ username: inquiry.username, barangayID: inquiry.barangayID, role: 'resident' });
        const notifMessage = `Your appointment has been scheduled for ${inquiry.scheduledDates?.map((s:any) => `${s.date} ${s.startTime}-${s.endTime}`).join('; ')}`;
        if (resident) {
          await Notification.create({
            userId: resident._id,
            type: 'inquiries',
            title: 'Appointment Scheduled',
            message: notifMessage,
            data: { inquiryId: inquiry._id, scheduledDates: inquiry.scheduledDates }
          });
          // emit socket event for real-time updates
          try {
            io.to(String(resident._id)).emit('inquiryScheduled', { inquiryId: inquiry._id, scheduledDates: inquiry.scheduledDates });
          } catch (e) {
            // non-fatal
            console.warn('Failed to emit socket event for scheduled inquiry', (e as any)?.message || e);
          }
        }
      }
    } catch (notifyErr) {
      console.warn('Failed during post-schedule notification step', (notifyErr as any)?.message || notifyErr);
    }

    res.json(inquiry);
  } catch (error) {
    // Log the full error on the server for debugging, but return a safe
    // string message to the client to avoid serializing complex error objects.
    console.error('Error in updateInquiry:', error && (error as any).stack ? (error as any).stack : error);
    const errMsg = error && (error as any).message ? (error as any).message : String(error);
    res.status(500).json({ message: 'Error updating inquiry', error: errMsg });
  }
};

export const addResponse = async (req: any, res: Response, next: NextFunction) => {
// ...existing code...
module.exports = {
  createInquiry,
  getAllInquiries,
  getInquiryById,
  updateInquiry,
  addResponse,
  getMyInquiries,
};
  try {
    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) {
      return res.status(404).json({ message: 'Inquiry not found' });
    }

    const responseText = req.body.text || req.body.response;
    if (!responseText) {
      return res.status(400).json({ message: 'Response text is required.' });
    }
    const responseEntry: any = {
      text: responseText,
      createdBy: (req as any).user._id,
      createdAt: new Date(),
    };

    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const host = req.get('host');
      const proto = req.protocol;
      responseEntry.attachments = (req.files as any[]).map(f => ({
        filename: f.originalname,
        path: f.path,
        url: `${proto}://${host}/uploads/inquiries/${path.basename(f.path)}`,
        contentType: f.mimetype,
        size: f.size,
        uploadedAt: new Date()
      }));
    }

    inquiry.responses?.push(responseEntry);

    try {
      await inquiry.save();
    } catch (err) {
      if (handleSaveError(err, res)) return;
      console.error('Error saving inquiry response:', err);
      return res.status(500).json({ message: 'Error adding response', error: err });
    }

    // Find the resident user by username and barangayID
    const { username, barangayID } = inquiry;
    let resident;
    try {
      resident = await User.findOne({ username, barangayID, role: 'resident' });
    } catch (userErr) {
      console.error('Error finding resident:', userErr);
    }

    // Optionally, emit a socket event to notify the resident in real-time
    if (resident) {
      io.to(resident._id.toString()).emit('inquiryResponse', {
        inquiryId: req.params.id,
        responder: (req as any).user._id,
        response: responseText,
      });
    }

    // Notify resident
    const Notification = require('../../models/Notification');
    if (resident) {
      await Notification.create({
        userId: resident._id,
        type: 'inquiries',
        title: 'Inquiry Reply',
        message: `Staff replied to your inquiry: ${responseText}`
      });
    }
    res.json(inquiry);
  } catch (error) {
    console.error('Error in addResponse:', error);
    res.status(500).json({ message: 'Error adding response', error });
  }
};
