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
import { sendAppointmentNotification } from '../services/notificationService';
import { AppointmentSlot } from '../models/AppointmentSlot';
import { AppointmentAuditLog } from '../models/AppointmentAuditLog';
import { handleSaveError } from '../utils/handleSaveError';
import { rangesOverlap } from '../utils/scheduling';
import schedulingService from '../services/schedulingService';
import auditService from '../services/auditService';

// Helper: convert HH:MM to minutes since midnight
const normalizeToMinutes = (t?: string) => {
  if (!t) return NaN;
  const parts = String(t).split(':');
  if (parts.length < 2) return NaN;
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return NaN;
  return hh * 60 + mm;
};

// Helper: find overlapping appointment slots for a given date/time range
async function findConflictsForRange(date: string, startTime: string, endTime: string, excludeInquiryId?: string) {
  const sMin = normalizeToMinutes(startTime);
  const eMin = normalizeToMinutes(endTime);
  if (Number.isNaN(sMin) || Number.isNaN(eMin) || sMin >= eMin) return [];
  // Query AppointmentSlot for any minute buckets that overlap [sMin, eMin)
  const overlapping = await AppointmentSlot.find({ date, slot: { $gte: sMin, $lt: eMin } }).lean();
  const byInquiry = new Map<string, { date: string; startTime?: string; endTime?: string }>();
  for (const o of overlapping || []) {
    if (!o) continue;
    const otherId = String(o.inquiryId || '');
    if (!otherId || (excludeInquiryId && otherId === String(excludeInquiryId))) continue;
    if (!byInquiry.has(otherId)) {
      byInquiry.set(otherId, { date: o.date, startTime: o.appointmentStartTime || undefined, endTime: o.appointmentEndTime || undefined });
    }
  }
  if (byInquiry.size === 0) return [];
  const conflicts: any[] = [];
  const ids = Array.from(byInquiry.keys());
  const inqs = await Inquiry.find({ _id: { $in: ids } }).populate('createdBy', 'fullName username').lean();
  for (const id of ids) {
    const info = byInquiry.get(id)!;
    const inq = (inqs || []).find((x: any) => String(x._id) === String(id));
    conflicts.push({ inquiryId: id, username: inq?.username || null, residentName: (inq && (inq as any).createdBy && (inq as any).createdBy.fullName) || null, date: info.date, startTime: info.startTime, endTime: info.endTime });
  }
  return conflicts;
}

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

export const getInquiryAppointment = async (req: any, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const inquiry = await Inquiry.findById(id).lean();
    if (!inquiry) return res.status(404).json({ message: 'Inquiry not found' });

    // fetch appointment slot copies
    const slots = await AppointmentSlot.find({ inquiryId: id }).lean();
    const formatted = (slots || []).map((s: any) => ({
      date: s.date ? (new Date(s.date)).toISOString().slice(0,10) : null,
      startTime: s.startTime,
      endTime: s.endTime
    })).filter((s: any) => s.date !== null);

    return res.json({ inquiry, slots: formatted });
  } catch (err) {
    console.error('Failed to get inquiry appointment details:', err);
    return res.status(500).json({ message: 'Failed to fetch appointment details' });
  }
};

export const getSlotsByDate = async (req: any, res: Response) => {
  try {
    const date = req.query.date as string;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: 'date query param required as YYYY-MM-DD' });
    const dt = new Date(`${date}T00:00:00Z`);
    if (isNaN(dt.getTime())) return res.status(400).json({ message: 'invalid date' });
    const slots = await AppointmentSlot.find({ date: dt }).lean();
    const out = (slots || []).map((s: any) => ({ date: (new Date(s.date)).toISOString().slice(0,10), startTime: s.startTime, endTime: s.endTime, residentName: s.residentName || s.residentUsername || null }));
    return res.json({ slots: out });
  } catch (err) {
    console.error('Failed to fetch slots by date', err);
    return res.status(500).json({ message: 'Failed to fetch slots' });
  }
};

export const getAppointmentAuditLogs = async (req: any, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '25'), 10)));
    const q = (req.query.q || '').toString().trim();
    const filter: any = {};
    // Only appointment audit actions
    filter.action = { $in: ['CREATED_APPOINTMENT', 'EDITED_APPOINTMENT'] };
    if (q) {
      // text search on staffName or residentName
      filter.$text = { $search: q };
    }
    const total = await AppointmentAuditLog.countDocuments(filter);
    const docs = await (AppointmentAuditLog as any).find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    return res.json({ total, page, limit, logs: docs });
  } catch (err) {
    console.error('Failed to fetch appointment audit logs', err);
    return res.status(500).json({ message: 'Failed to fetch audit logs' });
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
      // Helper: save schedule in one operation (replace inquiry.scheduledDates and save once)
      const saveSchedule = async (inquiryDoc: any, normalized: any[]) => {
        inquiryDoc.scheduledDates = normalized.map((r: any) => ({ date: r.date, startTime: r.startTime, endTime: r.endTime }));
        inquiryDoc.scheduledBy = (req as any).user?._id || inquiryDoc.scheduledBy;
        await inquiryDoc.save();
        return inquiryDoc;
      };

      // Begin validation flow: normalize and validate payload, check internal overlaps and against persisted slots
      let normalized: any[] = [];
      try {
        const arr = updateBody.scheduledDates;
        if (!Array.isArray(arr)) return res.status(400).json({ message: 'scheduledDates must be an array' });
        const seenRange = new Set<string>();
        for (const sd of arr) {
          if (!sd || !sd.date || !sd.startTime || !sd.endTime) return res.status(400).json({ message: 'Each scheduledDate must include date, startTime and endTime' });
          const key = `${sd.date}|${sd.startTime}|${sd.endTime}`;
          if (seenRange.has(key)) continue; // drop exact duplicate
          seenRange.add(key);
          const sMin = normalizeToMinutes(sd.startTime);
          const eMin = normalizeToMinutes(sd.endTime);
          if (Number.isNaN(sMin) || Number.isNaN(eMin) || sMin >= eMin) return res.status(400).json({ message: 'Start time must be earlier than end time' });
          normalized.push({ date: sd.date, startTime: sd.startTime, endTime: sd.endTime, sMin, eMin });
        }

        // Validate no internal overlaps within the payload
        const internal = schedulingService.validateScheduledDatesPayload(normalized.map((r: any) => ({ date: r.date, startTime: r.startTime, endTime: r.endTime })));
        if (!internal.ok) return res.status(400).json({ message: internal.message });

        // Validate each range against office hours and existing AppointmentSlot entries
        for (const r of normalized) {
          const vt = await schedulingService.validateTimeRange(r.startTime, r.endTime, r.date, req.params.id);
          if (!vt.ok) return res.status(400).json({ message: vt.message });
        }

        // No conflicts — perform single save operation (build minute slots and save)
        // Load inquiry document (not lean) so we can call save()
        const inquiryDoc = await Inquiry.findById(req.params.id);
        if (!inquiryDoc) return res.status(404).json({ message: 'Inquiry not found' });
        console.info('Final scheduledDates to save:', normalized.map((r: any) => ({ date: r.date, startTime: r.startTime, endTime: r.endTime })));
            try {
              // Set status and save once
              inquiryDoc.status = 'scheduled';
              const saved = await saveSchedule(inquiryDoc, normalized);

          // Replace AppointmentSlot copies for this inquiry
          try {
            await AppointmentSlot.deleteMany({ inquiryId: saved._id });
            const slotDocs = normalized.map((d: any) => ({
              inquiryId: saved._id,
              residentId: (saved as any).residentId || (saved as any).createdBy || null,
              staffId: (req as any).user?._id || null,
              date: new Date(`${d.date}T00:00:00Z`),
              startTime: d.startTime,
              endTime: d.endTime,
            }));
            if (slotDocs.length) {
              await AppointmentSlot.insertMany(slotDocs);
            }
            // Audit log each scheduled range (created or edited)
            try {
              const staffId = (req as any).user?._id || null;
              const staffName = (req as any).user?.fullName || (req as any).user?.username || undefined;
              // find resident id/name if possible
              let residentId = (saved as any).residentId || undefined;
              let residentName = (saved as any).residentName || (saved as any).username || undefined;
              if (!residentId) {
                try {
                  const resident = await User.findOne({ username: saved.username, barangayID: saved.barangayID, role: 'resident' }).lean();
                  if (resident) { residentId = resident._id; residentName = resident.fullName || resident.username; }
                } catch (e) { /* ignore */ }
              }
              const actionType = (String(beforeInquiry?.status) !== 'scheduled') ? 'CREATED_APPOINTMENT' : 'EDITED_APPOINTMENT';
              for (const d of normalized) {
                // log each range separately
                await auditService.logAppointmentChange({
                  staffId,
                  staffName,
                  residentId,
                  residentName,
                  inquiryId: saved._id,
                  action: actionType as any,
                  fromTimeRange: d.startTime,
                  toTimeRange: d.endTime,
                });
              }
              // Send resident notification (non-blocking) summarizing scheduled ranges
              try {
                const notifType = actionType === 'CREATED_APPOINTMENT' ? 'created' : 'edited';
                await sendAppointmentNotification(residentId, notifType as any, { inquiryId: saved._id, scheduledDates: saved.scheduledDates });
              } catch (e) {
                // swallow notification errors - already handled inside helper but be defensive
                console.warn('sendAppointmentNotification failed', (e as any)?.message || e);
              }
            } catch (auditErr) {
              console.warn('Failed to write appointment audit logs', auditErr);
            }
          } catch (slotErr) {
            console.error('Failed to update AppointmentSlot copies:', slotErr && ((slotErr as any).message || slotErr));
            return res.status(500).json({ message: 'Failed to update appointment slots', error: slotErr && ((slotErr as any).message || slotErr) });
          }

          return res.json({ success: true, message: 'Appointment scheduled', inquiryId: String(saved._id), scheduledDates: saved.scheduledDates });
        } catch (saveErr: any) {
          // If duplicate key or other conflict arises during insert, return 409 with details
          if (saveErr && saveErr.code === 11000) {
            console.warn('Conflict during saveSchedule:', saveErr.message || saveErr);
            return res.status(409).json({ message: 'Scheduling conflict: one or more time slots already taken' });
          }
          console.error('Failed to save schedule:', saveErr && (saveErr.message || saveErr));
          return res.status(500).json({ message: 'Failed to schedule appointment', error: saveErr && (saveErr.message || saveErr) });
        }
      } catch (vErr: any) {
        // validation threw a structured error
        if (vErr && vErr.status && vErr.message) return res.status(vErr.status).json({ message: vErr.message });
        console.error('Error validating schedule payload:', vErr && vErr.message ? vErr.message : vErr);
        return res.status(400).json({ message: 'Invalid scheduledDates payload' });
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
        if (resident) {
          try {
            await sendAppointmentNotification(resident._id, 'created', { inquiryId: inquiry._id, scheduledDates: inquiry.scheduledDates });
          } catch (e) {
            console.warn('sendAppointmentNotification failed in post-update path', (e as any)?.message || e);
          }
        }
      }
      // If appointment moved out of scheduled (canceled or otherwise), notify resident as canceled
      if (beforeStatus === 'scheduled' && afterStatus !== 'scheduled') {
        const resident = await User.findOne({ username: inquiry.username, barangayID: inquiry.barangayID, role: 'resident' });
        if (resident) {
          try {
            await sendAppointmentNotification(resident._id, 'canceled', { inquiryId: inquiry._id });
          } catch (e) {
            console.warn('sendAppointmentNotification failed for cancellation', (e as any)?.message || e);
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

export const checkAvailability = async (req: any, res: Response, next: NextFunction) => {
  try {
    const scheduled = req.body && req.body.scheduledDates && Array.isArray(req.body.scheduledDates) ? req.body.scheduledDates : null;
    if (!scheduled || scheduled.length === 0) return res.status(400).json({ message: 'scheduledDates required' });
    const conflicts: any[] = [];
    for (const sd of scheduled) {
      if (!sd || !sd.date || !sd.startTime || !sd.endTime) continue;
      const c = await findConflictsForRange(sd.date, sd.startTime, sd.endTime, req.params.id);
      if (c && c.length) conflicts.push(...c);
    }
    if (conflicts.length > 0) return res.status(409).json({ message: 'Scheduling conflict', conflicts });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Error in checkAvailability:', error);
    res.status(500).json({ message: 'Error checking availability' });
  }
};

export const cancelInquiry = async (req: any, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const reason = (req.body && req.body.reason) ? String(req.body.reason).trim() : '';
    if (!reason || reason.length < 10) return res.status(400).json({ message: 'Cancellation reason is required (minimum 10 characters).' });

    const inquiry = await Inquiry.findById(id);
    if (!inquiry) return res.status(404).json({ message: 'Inquiry not found' });

    const curStatus = String(inquiry.status || '').toLowerCase();
    if (curStatus === 'canceled') return res.status(400).json({ message: 'Appointment is already canceled.' });
    if (curStatus === 'resolved') return res.status(400).json({ message: 'Cannot cancel a resolved inquiry.' });

    inquiry.status = 'canceled';
    inquiry.cancellationReason = reason;
    inquiry.canceledBy = (req as any).user?._id || null;
    inquiry.canceledAt = new Date();

    await inquiry.save();

    await AppointmentSlot.deleteMany({ inquiryId: inquiry._id }).catch((e) => {
      console.warn('Failed to release appointment slots after cancellation', e);
    });

    try {
      const staffId = (req as any).user?._id || null;
      const staffName = (req as any).user?.fullName || (req as any).user?.username || undefined;
      let residentId = (inquiry as any).residentId || undefined;
      let residentName = (inquiry as any).residentName || (inquiry as any).username || undefined;
      if (!residentId) {
        const resident = await User.findOne({ username: inquiry.username, barangayID: inquiry.barangayID, role: 'resident' }).lean().catch(() => null);
        if (resident) { residentId = resident._id; residentName = resident.fullName || resident.username; }
      }
      if (auditService && typeof (auditService as any).logAppointmentChange === 'function') {
        await (auditService as any).logAppointmentChange({
          staffId,
          staffName,
          residentId,
          residentName,
          inquiryId: inquiry._id,
          action: 'CANCELED_APPOINTMENT',
        } as any);
      }
    } catch (auditErr) {
      console.warn('Failed to write cancellation audit log', auditErr);
    }

    try {
      const resident = await User.findOne({ username: inquiry.username, barangayID: inquiry.barangayID, role: 'resident' }).catch(() => null);
      if (resident) {
        await sendAppointmentNotification(resident._id, 'canceled', { inquiryId: inquiry._id, reason }).catch((e) => {
          console.warn('sendAppointmentNotification failed for cancellation', e);
        });
      }
    } catch (notifyErr) {
      console.warn('Failed to notify resident of cancellation', notifyErr);
    }

    return res.json({ success: true, inquiry });
  } catch (err) {
    console.error('Error in cancelInquiry:', err);
    return res.status(500).json({ message: 'Failed to cancel appointment' });
  }
};

export const addResponse = async (req: any, res: Response, next: NextFunction) => {
  // ...existing code...
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
