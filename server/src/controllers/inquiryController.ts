export const getMyInquiries = async (req: any, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const recipientCandidates: any[] = [];
    const sanitizedId = String(user.username || '').trim();
    const email = String(user.email || '').trim();
    const fullName = String(user.fullName || '').trim();
    const barangayID = String(user.barangayID || '').trim();

    if (sanitizedId) {
      recipientCandidates.push({ username: sanitizedId });
      recipientCandidates.push({ recipients: sanitizedId });
    }

    if (email) {
      recipientCandidates.push({ recipientEmails: email });
      recipientCandidates.push({ recipientEmails: new RegExp(`^${email.replace(/[.*+?^${}()|[\\]\\]/g, '$\\$&')}$`, 'i') });
    }

    if (fullName) {
      recipientCandidates.push({ recipients: fullName });
      recipientCandidates.push({ recipients: new RegExp(`^${fullName.replace(/[.*+?^${}()|[\\]\\]/g, '$\\$&')}$`, 'i') });
    }

    if (fullName && barangayID) {
      const formattedFn = `${fullName}(${barangayID})`;
      const formattedFnWithSpace = `${fullName} (${barangayID})`;

      recipientCandidates.push({ recipients: formattedFn });
      recipientCandidates.push({ recipients: formattedFnWithSpace });
      recipientCandidates.push({ recipients: new RegExp(`^${formattedFn.replace(/[.*+?^${}()|[\\]\\]/g, '$\\$&')}$`, 'i') });
      recipientCandidates.push({ recipients: new RegExp(`^(?:${formattedFnWithSpace.replace(/[.*+?^${}()|[\\]\\]/g, '$\\$&')})$`, 'i') });
      recipientCandidates.push({ recipients: new RegExp(`\\(${barangayID.replace(/[.*+?^${}()|[\\]\\]/g, '$\\$&')}\\)$`, 'i') });
    }

    const queryOr = [
      ...recipientCandidates,
      { barangayID: barangayID, username: sanitizedId },
      { barangayID: barangayID, recipients: sanitizedId },
    ].filter(Boolean);

    console.info('[getMyInquiries] resident lookup', {
      user: { username: sanitizedId, email, fullName, barangayID },
      conditions: queryOr
    });

    const inquiries = await Inquiry.find({
      $or: queryOr
    })
      .sort({ createdAt: -1 }).lean();

    console.info('[getMyInquiries] found inquiries count:', (inquiries || []).length);

    // Remove staffNotes for residents (this endpoint is for residents)
    const sanitized = (inquiries || []).map((iq: any) => {
      if (iq && iq.staffNotes) delete iq.staffNotes;
      return iq;
    });
    res.json(sanitized);
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
import { sendMail } from '../services/EmailService';
// Runtime require for sendGridService (used for direct email sending like forget password)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sendGridService: any = require('../../services/emailService.js');

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
    const {
      subject,
      title,
      message,
      type,
      assignedTo,
      assignedRole,
      username: targetUsername,
      barangayID: targetBarangayID,
      residentName: bodyResidentName,
      residentEmail: bodyResidentEmail,
      residentPhone: bodyResidentPhone,
      recipients,
      recipientEmails,
      quick_appointment_type,
      locationType,
      location,
      description,
      urgency,
      status: bodyStatus
    } = req.body;
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

    // Normalize recipients into fullName(barangayID) for quick-appointment display and lookup.
    let normalizedRecipients: string[] | undefined;
    if (recipients) {
      const recipientArray = Array.isArray(recipients) ? recipients : [recipients];
      const strings = recipientArray.map((r: any) => String(r).trim()).filter(Boolean);
      const userDocs = await User.find({
        role: 'resident',
        $or: [
          { username: { $in: strings } },
          { fullName: { $in: strings } }
        ]
      }).lean();
      const recipientMap = new Map<string, string>();
      const recipientByName = new Map<string, { username?: string; fullName?: string; formatted?: string }>();
      for (const u of userDocs) {
        if (!u) continue;
        const fullNameValue = (u.fullName || '').trim();
        const usernameValue = (u.username || '').trim();
        const barangayVal = (u.barangayID || '').trim();

        if (fullNameValue && barangayVal) {
          const formatted = `${fullNameValue}(${barangayVal})`;
          recipientMap.set(usernameValue, formatted);
          recipientMap.set(fullNameValue, formatted);
          recipientMap.set(formatted, formatted); // Also map the formatted version to itself
          recipientByName.set(usernameValue, { username: usernameValue, fullName: fullNameValue, formatted });
          recipientByName.set(fullNameValue, { username: usernameValue, fullName: fullNameValue, formatted });
        } else {
          if (usernameValue) recipientMap.set(usernameValue, usernameValue);
          if (fullNameValue) recipientMap.set(fullNameValue, fullNameValue);
          recipientByName.set(usernameValue, { username: usernameValue, fullName: fullNameValue });
          recipientByName.set(fullNameValue, { username: usernameValue, fullName: fullNameValue });
        }
      }

      const normalizedSet = new Set<string>();
      for (const r of strings) {
        const trimmed = String(r).trim();
        const mapped = recipientMap.has(trimmed) ? recipientMap.get(trimmed)! : trimmed;
        // Only add the mapped (formatted or as-is) version, don't expand to username/fullName
        normalizedSet.add(mapped);
      }
      normalizedRecipients = Array.from(normalizedSet).filter(Boolean);
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

    // Extract resident contact info from payload if provided
    let residentName = bodyResidentName || req.body?.residentName;
    let residentEmail = bodyResidentEmail || req.body?.residentEmail;
    let residentPhone = bodyResidentPhone || req.body?.residentPhone;

    // If contact info not provided, try to fetch from User collection
    if (resolvedUsername && (!residentName || !residentEmail || !residentPhone)) {
      try {
        const resident = await User.findOne({
          username: resolvedUsername,
          barangayID: resolvedBarangayID,
          role: 'resident'
        }).lean();
        if (resident) {
          residentName = residentName || resident.fullName || resident.username;
          residentEmail = residentEmail || resident.email;
          residentPhone = residentPhone || resident.contactNumber;
        }
      } catch (e) {
        console.warn('Failed to fetch resident contact info:', e);
      }
    }

    const inquiry = new Inquiry({
      subject,
      message,
      type: type || 'General',
      assignedTo: Array.isArray(assignedTo) ? assignedTo : [],
      assignedRole: assignedRole || 'staff',
      createdBy: user?._id,
      username: resolvedUsername || user?.username || 'Unknown',
      barangayID: resolvedBarangayID || user?.barangayID || 'Unknown',
      // resident contact points (client-provided preferred, fallback to user lookup)
      residentName,
      residentEmail,
      residentPhone,
      recipients: normalizedRecipients || (Array.isArray(recipients) ? recipients : (recipients ? [recipients] : [])),
      title: title || subject || undefined,
      recipientEmails: Array.isArray(recipientEmails) ? recipientEmails : (recipientEmails ? [recipientEmails] : []),
      quick_appointment_type: quick_appointment_type || undefined,
      locationType: locationType || undefined,
      location: location || undefined,
      description: description || undefined,
      urgency: urgency || undefined,
      status: bodyStatus || ((user && user.role && String(user.role).toLowerCase() === 'resident') ? 'pending' : 'open')
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
      .populate('assignedTo', 'fullName username')
      .lean();
    // If requester is a resident, strip staffNotes from results
    const role = String((req as any).user?.role || '').toLowerCase();
        const sanitized = (inquiries || []).map((iq: any) => {
          if (role.includes('resident')) {
            if (iq && iq.staffNotes) delete iq.staffNotes;
            if (iq && Array.isArray(iq.messages)) iq.messages = iq.messages.filter((m: any) => m.visibleToResident === true);
          }
          return iq;
        });
    res.json(sanitized);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching inquiries', error });
  }
};

export const getInquiryById = async (req: any, res: Response, next: NextFunction) => {
  try {
    const inquiry = await Inquiry.findById(req.params.id)
      .populate('createdBy', 'firstName lastName')
      .populate('assignedTo', 'firstName lastName')
      .lean();
    if (!inquiry) return res.status(404).json({ message: 'Inquiry not found' });

    // Hide staffNotes and filter messages for residents
    const role = String((req as any).user?.role || '').toLowerCase();
    const out: any = inquiry;
    if (role.includes('resident')) {
      if (out.staffNotes) delete out.staffNotes;
      if (Array.isArray(out.messages)) {
        out.messages = out.messages.filter((m: any) => m.visibleToResident === true);
      }
    }
    return res.json(out);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching inquiry', error });
  }
};

export const getInquiryAppointment = async (req: any, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const inquiry: any = await Inquiry.findById(id).lean();
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
          // include optional assignedUsernames (for cluster/multiples/manual assignment from client)
          const assignedUsernames = Array.isArray(sd.assignedUsernames) ? sd.assignedUsernames.map((x:any) => String(x).trim()).filter(Boolean) : [];
          normalized.push({ date: sd.date, startTime: sd.startTime, endTime: sd.endTime, sMin, eMin, assignedUsernames });
        }

        // Validate no internal overlaps within the payload
        const internal = schedulingService.validateScheduledDatesPayload(normalized.map((r: any) => ({ date: r.date, startTime: r.startTime, endTime: r.endTime })));
        if (!internal.ok) return res.status(400).json({ message: internal.message });

        // Additional server-side validation for cluster/multiples/manual distribution logic
        const schedulingOptions = updateBody.schedulingOptions || updateBody.scheduleOptions || {};
        const mode = String(schedulingOptions.mode || '').toLowerCase();
        const multiplesOf = Math.max(1, parseInt(String(schedulingOptions.multiplesOf || schedulingOptions.bundleSize || '1'), 10) || 1);
        const participantsExpected = schedulingOptions.participants ? parseInt(String(schedulingOptions.participants), 10) : null;
        // If mode === 'multiples', require each scheduled range to include assignedUsernames array of length multiplesOf
        if (mode === 'multiples') {
          for (const r of normalized) {
            if (!Array.isArray(r.assignedUsernames) || r.assignedUsernames.length !== multiplesOf) {
              return res.status(400).json({ message: `For multiples mode each scheduledDate must include assignedUsernames array of length ${multiplesOf}.` });
            }
          }
        }
        // If participantsExpected provided and assignedUsernames present, validate counts
        const allAssigned = normalized.reduce((acc: string[], r: any) => acc.concat(Array.isArray(r.assignedUsernames) ? r.assignedUsernames : []), []);
        const uniqueAssigned = Array.from(new Set(allAssigned));
        if (participantsExpected !== null && uniqueAssigned.length > 0 && uniqueAssigned.length !== participantsExpected) {
          return res.status(400).json({ message: `Mismatch: schedulingOptions.participants=${participantsExpected} but assignedUsernames contains ${uniqueAssigned.length} unique users.` });
        }
        // Validate assigned usernames exist as resident users
        if (uniqueAssigned.length > 0) {
          const foundUsers = await User.find({ role: 'resident', username: { $in: uniqueAssigned } }).lean();
          const foundUsernames = new Set((foundUsers || []).map((u:any) => String(u.username)));
          const missing = uniqueAssigned.filter((u:any) => !foundUsernames.has(u));
          if (missing.length) {
            return res.status(400).json({ message: `Unknown resident usernames in assignedUsernames: ${missing.join(', ')}` });
          }
        }

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
            const slotDocs: any[] = [];
            for (const d of normalized) {
              // Allow scheduledDates to include a residentUsername/resident field to assign the slot to a specific resident
              let residentId: any = (saved as any).residentId || (saved as any).createdBy || null;
              let residentName: string | undefined = (saved as any).residentName || (saved as any).username || undefined;
              try {
                const possibleUsername = d.residentUsername || d.username || d.recipientUsername || d.recipient;
                if (possibleUsername) {
                  const found = await User.findOne({ $or: [{ username: possibleUsername }, { email: possibleUsername }] , role: 'resident' }).lean().catch(() => null);
                  if (found) { residentId = found._id; residentName = found.fullName || found.username; }
                }
              } catch (e) {
                // ignore lookup errors and fall back to inquiry-level resident
              }

              slotDocs.push({
                inquiryId: saved._id,
                residentId: residentId || null,
                residentName: residentName || undefined,
                staffId: (req as any).user?._id || null,
                date: new Date(`${d.date}T00:00:00Z`),
                startTime: d.startTime,
                endTime: d.endTime,
              });
            }
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
              // For audit and notifications, group by resident if slots were assigned to multiple residents
              try {
                const notifType = actionType === 'CREATED_APPOINTMENT' ? 'created' : 'edited';
                // Log and gather per-resident scheduled ranges
                const perResident = new Map<string, { residentId?: any; residentName?: string; ranges: any[] }>();
                for (const d of normalized) {
                  // find corresponding slot doc to extract resident assignment
                  const matching = slotDocs.find(s => (new Date(s.date)).toISOString().slice(0,10) === d.date && s.startTime === d.startTime && s.endTime === d.endTime);
                  const rid = matching?.residentId ? String(matching.residentId) : String(residentId || '') ;
                  const rname = matching?.residentName || residentName;
                  if (!perResident.has(rid)) perResident.set(rid, { residentId: matching?.residentId, residentName: rname, ranges: [] });
                  perResident.get(rid)!.ranges.push({ date: d.date, startTime: d.startTime, endTime: d.endTime });
                }

                for (const [rid, info] of perResident.entries()) {
                  for (const rng of info.ranges) {
                    await auditService.logAppointmentChange({
                      staffId,
                      staffName,
                      residentId: info.residentId,
                      residentName: info.residentName,
                      inquiryId: saved._id,
                      action: actionType as any,
                      fromTimeRange: rng.startTime,
                      toTimeRange: rng.endTime,
                    } as any);
                  }
                  // send notification per resident (best-effort)
                  try {
                    await sendAppointmentNotification(info.residentId, notifType as any, { inquiryId: saved._id, scheduledDates: info.ranges });
                  } catch (e) {
                    console.warn('sendAppointmentNotification failed for resident', info.residentId, (e as any)?.message || e);
                  }
                }
              } catch (auditErr) {
                console.warn('Failed to write appointment audit logs or send notifications', auditErr);
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

export const addStaffNote = async (req: any, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const noteText = req.body && typeof req.body.note === 'string' ? String(req.body.note).trim() : '';
    if (!noteText || noteText.length === 0) return res.status(400).json({ message: 'Note text is required.' });

    const inquiry = await Inquiry.findById(id);
    if (!inquiry) return res.status(404).json({ message: 'Inquiry not found' });

    // Only allow staff or admin to add notes — route should already enforce, but double-check
    const role = String((req as any).user?.role || '').toLowerCase();
    if (!(role.includes('staff') || role.includes('admin'))) return res.status(403).json({ message: 'Forbidden' });

    const note = { text: noteText, createdBy: (req as any).user?._id, createdAt: new Date() } as any;
    inquiry.staffNotes = Array.isArray(inquiry.staffNotes) ? inquiry.staffNotes : [];
    inquiry.staffNotes.push(note);

    try {
      await inquiry.save();
    } catch (e) {
      console.error('Failed to save staff note:', e);
      return res.status(500).json({ message: 'Failed to save note' });
    }

    // Return populated notes list (populate staff name)
    const updated = await Inquiry.findById(id).populate('staffNotes.createdBy', 'fullName username').lean();
    const notes = (updated && updated.staffNotes) ? (updated.staffNotes as any[]).map(n => ({
      _id: n._id,
      text: n.text,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      createdBy: n.createdBy?._id || n.createdBy,
      staffName: n.createdBy ? (n.createdBy.fullName || n.createdBy.username) : undefined,
    })) : [];

    return res.json({ notes });
  } catch (err) {
    console.error('Error in addStaffNote:', err);
    return res.status(500).json({ message: 'Failed to add staff note' });
  }
};

export const addMessage = async (req: any, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const msgText = req.body && typeof req.body.message === 'string' ? String(req.body.message).trim() : '';
    if (!msgText || msgText.length === 0) return res.status(400).json({ message: 'Message text is required.' });

    const inquiry = await Inquiry.findById(id);
    if (!inquiry) return res.status(404).json({ message: 'Inquiry not found' });

    // Ensure only staff/admin can send
    const role = String((req as any).user?.role || '').toLowerCase();
    if (!(role.includes('staff') || role.includes('admin'))) return res.status(403).json({ message: 'Forbidden' });

    const msg = { text: msgText, createdBy: (req as any).user?._id, createdAt: new Date(), visibleToResident: true } as any;
    inquiry.messages = Array.isArray(inquiry.messages) ? inquiry.messages : [];
    inquiry.messages.push(msg);

    try {
      await inquiry.save();
    } catch (e) {
      console.error('Failed to save message:', e);
      return res.status(500).json({ message: 'Failed to save message' });
    }

    // Populate createdBy for messages
    const updated = await Inquiry.findById(id).populate('messages.createdBy', 'fullName username').lean();
    const msgs = (updated && updated.messages) ? (updated.messages as any[]).map(m => ({
      _id: m._id,
      text: m.text,
      createdAt: m.createdAt,
      visibleToResident: m.visibleToResident,
      createdBy: m.createdBy?._id || m.createdBy,
      staffName: m.createdBy ? (m.createdBy.fullName || m.createdBy.username) : undefined,
    })) : [];

    // Send a resident notification (best-effort)
    try {
      const resident = await User.findOne({ username: inquiry.username, barangayID: inquiry.barangayID, role: 'resident' }).lean().catch(() => null);
      if (resident) {
        const Notification = require('../../models/Notification');
        await Notification.create({ userId: resident._id, type: 'APPOINTMENT_MESSAGE', title: 'New Appointment Message', message: msgText });
      }
    } catch (notifErr) {
      console.warn('Failed to create notification for message', notifErr);
    }

    return res.json({ messages: msgs });
  } catch (err) {
    console.error('Error in addMessage:', err);
    return res.status(500).json({ message: 'Failed to add message' });
  }
};

export const closeInquiry = async (req: any, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const reason = (req.body && req.body.reason) ? String(req.body.reason).trim() : '';

    const inquiry = await Inquiry.findById(id);
    if (!inquiry) return res.status(404).json({ message: 'Inquiry not found' });

    const curStatus = String(inquiry.status || '').toLowerCase();
    if (curStatus === 'closed') return res.status(400).json({ message: 'Inquiry is already closed.' });

    inquiry.status = 'closed';
    if (reason) inquiry.cancellationReason = reason;
    inquiry.canceledBy = (req as any).user?._id || null;
    inquiry.canceledAt = new Date();

    await inquiry.save();

    // Notify resident of closure
    try {
      const resident = await User.findOne({ username: inquiry.username, barangayID: inquiry.barangayID, role: 'resident' }).catch(() => null);
      if (resident) {
        const Notification = require('../../models/Notification');
        await Notification.create({
          userId: resident._id,
          type: 'inquiries',
          title: 'Inquiry Closed',
          message: `Your inquiry has been closed.${reason ? ' Reason: ' + reason : ''}`
        }).catch((e: any) => console.warn('Failed to create closure notification', e));
      }
    } catch (notifyErr) {
      console.warn('Failed to notify resident of closure', notifyErr);
    }

    return res.json({ success: true, inquiry });
  } catch (err) {
    console.error('Error in closeInquiry:', err);
    return res.status(500).json({ message: 'Error closing inquiry', error: err });
  }
};

export const deleteInquiry = async (req: any, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const inquiry = await Inquiry.findById(id);
    if (!inquiry) return res.status(404).json({ message: 'Inquiry not found' });

    // remove corresponding appointment slot entries for this inquiry
    await AppointmentSlot.deleteMany({ inquiryId: id });

    await Inquiry.deleteOne({ _id: id });

    return res.json({ success: true, message: 'Inquiry deleted' });
  } catch (err) {
    console.error('Error in deleteInquiry:', err);
    return res.status(500).json({ message: 'Error deleting inquiry', error: err });
  }
};

  // Send invite/notification email(s) for an inquiry (staff/admin only)
  export const sendInvite = async (req: any, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id;
      console.log('[sendInvite] ===== STARTING =====');
      console.log('[sendInvite] Inquiry ID:', id);
      
      let inquiry: any;
      try {
        inquiry = await Inquiry.findById(id).lean();
      } catch (e) {
        console.error('[sendInvite] Database error finding inquiry:', e);
        return res.status(500).json({ message: 'Database error finding inquiry', error: String(e) });
      }
      
      if (!inquiry) {
        console.warn('[sendInvite] Inquiry not found:', id);
        return res.status(404).json({ message: 'Inquiry not found' });
      }
      
      console.log('[sendInvite] Inquiry found, collecting emails...');

      // Collect recipient emails: prefer explicit recipientEmails, otherwise resolve recipients to user emails
      let emails: string[] = Array.isArray(inquiry.recipientEmails) ? inquiry.recipientEmails.map(String).filter(Boolean) : [];
      console.log('[sendInvite] recipientEmails from inquiry:', emails);
      
      if ((!emails || emails.length === 0) && Array.isArray(inquiry.recipients) && inquiry.recipients.length) {
        // Try to normalize recipient entries (they may be "Full Name(barangayID)" or username)
        const normalized = inquiry.recipients.map((r: any) => String(r).replace(/\(.+\)$/, '').trim()).filter(Boolean);
        console.log('[sendInvite] Resolving recipients:', normalized);
        try {
          const users = await User.find({ role: 'resident', $or: [{ username: { $in: normalized } }, { fullName: { $in: normalized } }] }).lean();
          emails = users.map((u: any) => String(u.email || '').trim()).filter(Boolean);
          console.log('[sendInvite] Resolved emails from recipients:', emails);
        } catch (e) {
          console.error('[sendInvite] Error resolving recipients to users:', e);
        }
      }

      // As a fallback, if inquiry has residentEmail field, include it
      if ((!emails || emails.length === 0) && inquiry.residentEmail) {
        console.log('[sendInvite] Using residentEmail:', inquiry.residentEmail);
        emails = [String(inquiry.residentEmail).trim()];
      }

      // Still no emails? try to resolve the inquiry's primary username/barangay to a resident user
      if ((!emails || emails.length === 0) && inquiry.username) {
        console.log('[sendInvite] Resolving username:', inquiry.username, 'barangayID:', inquiry.barangayID);
        try {
          const possible = await User.findOne({ username: inquiry.username, barangayID: inquiry.barangayID, role: 'resident' }).lean().catch(() => null);
          if (possible && possible.email) {
            emails = [String(possible.email).trim()];
            console.log('[sendInvite] Resolved email from username:', emails);
          } else {
            console.log('[sendInvite] No user found for username:', inquiry.username);
          }
        } catch (e) {
          console.error('[sendInvite] Error resolving inquiry username:', e);
        }
      }

      console.log('[sendInvite] Final emails array:', emails);
      if (!emails || emails.length === 0) {
        console.warn('[sendInvite] No recipient emails found');
        return res.status(400).json({ message: 'No recipient emails found for this inquiry' });
      }

      // Compose professional HTML email with all details
      const subject = inquiry.title || inquiry.subject || 'Appointment Invitation';
      
      // Build date/time section
      let dateTimeHtml = '';
      if (inquiry.scheduledDates && Array.isArray(inquiry.scheduledDates) && inquiry.scheduledDates.length) {
        dateTimeHtml = `
          <div style="margin: 20px 0; background: #f5f5f5; padding: 15px; border-radius: 5px; border-left: 4px solid #1890ff;">
            <h3 style="margin-top: 0; color: #1890ff;">📅 Scheduled Date(s) & Time(s)</h3>
            <ul style="list-style: none; padding: 0; margin: 10px 0;">
              ${inquiry.scheduledDates.map((s: any) => `
                <li style="margin: 8px 0; font-size: 14px;">
                  <strong>${s.date}</strong> • ${s.startTime} to ${s.endTime}
                </li>
              `).join('')}
            </ul>
          </div>
        `;
      } else if (inquiry.appointmentDates && Array.isArray(inquiry.appointmentDates) && inquiry.appointmentDates.length) {
        dateTimeHtml = `
          <div style="margin: 20px 0; background: #f5f5f5; padding: 15px; border-radius: 5px; border-left: 4px solid #1890ff;">
            <h3 style="margin-top: 0; color: #1890ff;">📅 Preferred Dates</h3>
            <p style="margin: 10px 0; font-size: 14px;">${inquiry.appointmentDates.map((d: string) => d).join(', ')}</p>
          </div>
        `;
      }

      // Build location section
      let locationHtml = '';
      if (inquiry.location) {
        locationHtml = `
          <div style="margin: 20px 0; background: #f0f8f5; padding: 15px; border-radius: 5px; border-left: 4px solid #52c41a;">
            <h3 style="margin-top: 0; color: #52c41a;">📍 Location</h3>
            <p style="margin: 10px 0; font-size: 14px;">${inquiry.location}</p>
          </div>
        `;
      }

      // Build description/details section
      let detailsHtml = '';
      if (inquiry.description || inquiry.message) {
        detailsHtml = `
          <div style="margin: 20px 0; background: #fffbe6; padding: 15px; border-radius: 5px; border-left: 4px solid #faad14;">
            <h3 style="margin-top: 0; color: #faad14;">ℹ️ Appointment Details</h3>
            ${inquiry.description ? `<p style="margin: 10px 0; font-size: 14px;"><strong>Description:</strong> ${inquiry.description}</p>` : ''}
            ${inquiry.message ? `<p style="margin: 10px 0; font-size: 14px;"><strong>Message:</strong> ${inquiry.message}</p>` : ''}
          </div>
        `;
      }

      // Complete professional email template
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%); color: white; padding: 20px; border-radius: 5px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 20px 0; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #999; text-align: center; }
            .cta-button { display: inline-block; background: #1890ff; color: white; padding: 12px 30px; border-radius: 5px; text-decoration: none; margin-top: 20px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✉️ Appointment Invitation</h1>
              <p style="margin: 10px 0 0 0; font-size: 14px;">Barangay Service Request</p>
            </div>

            <div class="content">
              <p style="font-size: 16px;">Dear Valued Resident,</p>
              
              <p style="font-size: 14px; margin: 15px 0;">
                Your appointment request has been processed and a date/time has been scheduled. 
                Please find the details below:
              </p>

              ${dateTimeHtml}
              ${locationHtml}
              ${detailsHtml}

              <p style="margin-top: 30px; padding: 15px; background: #e6f7ff; border-radius: 5px; font-size: 14px;">
                <strong>📌 Next Steps:</strong><br>
                Please log in to your account to confirm your attendance. Your confirmation helps us 
                plan accordingly and ensures the best service for you.
              </p>

              <div style="text-align: center;">
                <a href="${process.env.FRONTEND_URL || 'https://alphaversion.onrender.com'}/resident/dashboard" class="cta-button">
                  View Appointment Details
                </a>
              </div>
            </div>

            <div class="footer">
              <p>
                <strong>Barangay Information Management System</strong><br>
                This is an automated message. Please do not reply to this email.<br>
                For inquiries, please log in to your account or contact the barangay office.
              </p>
            </div>
          </div>
        </body>
        </html>
      `;

      // Send using sendGridService directly (same way forget password does it)
      console.log('[sendInvite] Sending to', emails.length, 'recipient(s)');
      
      try {
        // Send individually to each recipient (or use BCC for multiple)
        if (emails.length === 1) {
          await sendGridService.sendEmail({
            to: emails[0],
            subject,
            html,
            emailType: 'appointment-invite'
          });
          console.log('[sendInvite] Successfully sent invite to', emails[0]);
        } else {
          // Send with first recipient as 'to' and rest as BCC
          const to = emails[0];
          const bcc = emails.slice(1);
          await sendGridService.sendEmail({
            to,
            subject,
            html,
            bcc,
            emailType: 'appointment-invite'
          });
          console.log('[sendInvite] Successfully sent invite to', to, 'with', bcc.length, 'BCC recipients');
        }

        console.log('[sendInvite] ===== SUCCESS - sent to', emails.length, 'recipient(s) =====');
        return res.json({ success: true, sent: emails.length, details: `Sent to ${emails.length} recipient(s)` });
      } catch (mailErr: any) {
        console.error('[sendInvite] sendGridService.sendEmail threw error:', {
          message: mailErr?.message,
          stack: mailErr?.stack,
          full: String(mailErr)
        });
        return res.status(500).json({ 
          message: 'Failed to send invites', 
          details: mailErr?.message || String(mailErr)
        });
      }
    } catch (err: any) {
      console.error('[sendInvite] ===== OUTER ERROR =====', {
        message: err?.message,
        stack: err?.stack,
        full: String(err)
      });
      return res.status(500).json({ 
        message: 'Internal server error', 
        details: err?.message || String(err)
      });
    }
  };

// Debug: this route exists and is ready on server side
export const pingDeleteInquiry = (req: any, res: Response) => {
  console.log(`DELETE /api/inquiries/${req.params.id} called by user`, req.user?.username || 'unknown');
  res.status(200).json({ status: 'ok', id: req.params.id });
};
