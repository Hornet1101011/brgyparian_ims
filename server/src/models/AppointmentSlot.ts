import { User } from './User';
import { toMinutes, rangesOverlap } from '../utils/scheduling';
import schedulingService from '../services/schedulingService';
import mongoose from 'mongoose';

// This collection stores a copy of scheduled date/time ranges (one document per range)
const appointmentSlotSchema = new mongoose.Schema({
  inquiryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inquiry', required: true },
  residentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  residentName: { type: String },
  residentBarangayID: { type: String },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  staffName: { type: String },
  staffBarangayID: { type: String },
  // store date as a date-only value (YYYY-MM-DD -> stored at UTC midnight)
  date: { type: Date, required: true },
  startTime: { type: String, required: true }, // 'HH:mm'
  endTime: { type: String, required: true },   // 'HH:mm'
}, {
  timestamps: true,
  collection: 'AppointmentSlots'
});

// Optional index to quickly find slots by inquiry
appointmentSlotSchema.index({ inquiryId: 1 });
appointmentSlotSchema.index({ date: 1 });
// Ensure uniqueness per inquiry/date/startTime to avoid accidental duplicates
appointmentSlotSchema.index({ inquiryId: 1, date: 1, startTime: 1 }, { unique: true });

// Guard against recompilation in dev (nodemon / ts-node)
export const AppointmentSlot: mongoose.Model<any> = (mongoose.models && (mongoose.models as any).AppointmentSlot)
  ? (mongoose.models as any).AppointmentSlot as mongoose.Model<any>
  : mongoose.model('AppointmentSlot', appointmentSlotSchema);

// Helper: convert 'YYYY-MM-DD' to Date at UTC midnight
const dateStringToUtcDate = (d: string) => {
  if (!d) return null;
  // ensure format 'YYYY-MM-DD' -> add T00:00:00Z to force UTC midnight
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00Z` : (d);
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return null;
  return dt;
};

// Upsert appointment slots for an inquiry: overwrite existing and insert new entries
export async function upsertAppointmentSlots(inquiryId: any, staffId: any, residentId: any, scheduledDates: Array<any>) {
  // Load resident and staff info (lean)
  const [resident, staff] = await Promise.all([
    residentId ? User.findById(residentId).lean() : null,
    staffId ? User.findById(staffId).lean() : null,
  ]);

  // Normalize scheduledDates: array of { date, startTime, endTime }
  const toInsert: any[] = [];
  if (Array.isArray(scheduledDates)) {
    for (const sd of scheduledDates) {
      if (!sd || !sd.date || !sd.startTime || !sd.endTime) continue;
      const dateObj = dateStringToUtcDate(sd.date);
      if (!dateObj) continue;
      toInsert.push({
        inquiryId,
        residentId,
        residentName: resident?.fullName || resident?.username || undefined,
        residentBarangayID: resident?.barangayID || undefined,
        staffId,
        staffName: staff?.fullName || staff?.username || undefined,
        staffBarangayID: staff?.barangayID || undefined,
        date: dateObj,
        startTime: sd.startTime,
        endTime: sd.endTime,
      });
    }
  }

  // Overwrite existing slots for this inquiry
  await AppointmentSlot.deleteMany({ inquiryId });

  if (toInsert.length === 0) return [];

  // Deduplicate by (inquiryId, date ISO, startTime) to avoid accidental duplicate objects
  const seen = new Set<string>();
  const deduped: any[] = [];
  for (const t of toInsert) {
    const key = `${String(t.inquiryId)}|${(t.date instanceof Date) ? t.date.toISOString().slice(0,10) : String(t.date)}|${t.startTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(t);
  }

  if (deduped.length === 0) return [];

  // Use insertMany for bulk insert. We set ordered=true to fail fast if a uniqueness violation occurs,
  // however since we deleted existing docs this should not normally happen. Keeping ordered ensures predictable behavior.
  const inserted = await AppointmentSlot.insertMany(deduped, { ordered: true });
  return inserted.map(doc => doc.toObject());
}

// Read helpers
export async function getSlotsByInquiryId(inquiryId: any) {
  return AppointmentSlot.find({ inquiryId }).lean();
}

export async function deleteSlotsByInquiryId(inquiryId: any) {
  const res = await AppointmentSlot.deleteMany({ inquiryId });
  return res;
}

// Update a single appointment slot with validation and concurrency protection.
// Steps:
// 1. Temporarily remove the old slot (within a transaction if supported).
// 2. Validate the new slot (office hours + no overlap with any other persisted slot, including other slots of same inquiry).
// 3. If validation passes, insert the new slot and commit.
// 4. If validation fails, restore the old slot (or abort transaction) and return an error message.
export async function updateAppointmentSlotWithValidation(
  inquiryId: any,
  oldSlot: { date: string; startTime: string; endTime: string },
  newSlot: { date: string; startTime: string; endTime: string },
  staffId: any,
  residentId: any
) {
  // Normalize dates
  const oldDateObj = dateStringToUtcDate(oldSlot.date);
  const newDateObj = dateStringToUtcDate(newSlot.date);
  if (!oldDateObj || !newDateObj) return { ok: false, message: 'Invalid date format' };

  // Attempt to use a Mongo transaction for concurrency safety
  let session: mongoose.ClientSession | null = null;
  let usedTransaction = false;
  let backupDoc: any = null;
  try {
    try {
      session = await mongoose.startSession();
      session.startTransaction();
      usedTransaction = true;
    } catch (e) {
      // Transactions may not be supported (standalone mongod). Fall back to non-transactional mode.
      session = null;
      usedTransaction = false;
    }

    // Find the exact old slot document (within session if available)
    const oldQuery: any = { inquiryId, date: oldDateObj, startTime: oldSlot.startTime, endTime: oldSlot.endTime };
    let oldDoc: any = null;
    if (session) {
      oldDoc = await AppointmentSlot.findOne(oldQuery).session(session as any).lean();
    } else {
      oldDoc = await AppointmentSlot.findOne(oldQuery).lean();
    }
    if (!oldDoc) {
      if (usedTransaction && session) { await session.abortTransaction(); session.endSession(); }
      return { ok: false, message: 'Original appointment slot not found' };
    }
    backupDoc = oldDoc;

    // Remove the old slot (delete) so validation does not consider it occupied.
    if (session) {
      await AppointmentSlot.deleteOne({ _id: oldDoc._id }).session(session as any);
    } else {
      await AppointmentSlot.deleteOne({ _id: oldDoc._id });
    }

    // Validate office hours and basic constraints using schedulingService (this checks start<end and office hours)
    const v = await schedulingService.validateTimeRange(newSlot.startTime, newSlot.endTime, newSlot.date);
    if (!v.ok) {
      // Restore old slot (if not in transaction)
      if (!usedTransaction) {
        try { await AppointmentSlot.create([backupDoc]); } catch (re) { console.warn('Failed to restore old slot after validation failure', re); }
      } else {
        // aborting transaction will rollback the delete
        if (session) { await session.abortTransaction(); session.endSession(); }
      }
      return { ok: false, message: v.message || 'Validation failed' };
    }

    // Additional overlap check against persisted slots (including other slots from same inquiry)
    const otherSlots = session ? await AppointmentSlot.find({ date: newDateObj }).session(session as any).lean() : await AppointmentSlot.find({ date: newDateObj }).lean();
    const ns = toMinutes(newSlot.startTime);
    const ne = toMinutes(newSlot.endTime);
    for (const s of otherSlots || []) {
      // If this is the same slot we removed, skip
      if (backupDoc && String(s._id) === String(backupDoc._id)) continue;
      const os = toMinutes(s.startTime);
      const oe = toMinutes(s.endTime);
      if (Number.isNaN(os) || Number.isNaN(oe)) continue;
      if (rangesOverlap(ns, ne, os, oe)) {
        // conflict
        if (!usedTransaction) {
          try { await AppointmentSlot.create([backupDoc]); } catch (re) { console.warn('Failed to restore old slot after overlap conflict', re); }
        } else {
          if (session) { await session.abortTransaction(); session.endSession(); }
        }
        return { ok: false, message: 'The selected time range is no longer available.' };
      }
    }

    // Insert new slot document
    const staff = staffId ? await User.findById(staffId).lean() : null;
    const resident = residentId ? await User.findById(residentId).lean() : null;
    const newDoc = {
      inquiryId,
      residentId,
      residentName: resident?.fullName || resident?.username || undefined,
      residentBarangayID: resident?.barangayID || undefined,
      staffId,
      staffName: staff?.fullName || staff?.username || undefined,
      staffBarangayID: staff?.barangayID || undefined,
      date: newDateObj,
      startTime: newSlot.startTime,
      endTime: newSlot.endTime,
    };

    if (session) {
      await AppointmentSlot.create([newDoc], { session: session as any });
      await session.commitTransaction();
      session.endSession();
    } else {
      await AppointmentSlot.create([newDoc]);
    }

    return { ok: true };
  } catch (err) {
    console.error('updateAppointmentSlotWithValidation error', err && (err as any).message || err);
    // Attempt to restore old slot if we deleted it and not in transaction
    try {
      if (!usedTransaction && backupDoc) {
        await AppointmentSlot.create([backupDoc]);
      }
    } catch (restoreErr) {
      console.warn('Failed to restore old appointment slot after error', restoreErr);
    }
    if (session) {
      try { await session.abortTransaction(); session.endSession(); } catch (e) { /* ignore */ }
    }
    return { ok: false, message: 'Failed to update appointment slot' };
  }
}
