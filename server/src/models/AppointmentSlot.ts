import mongoose from 'mongoose';
import { User } from './User';

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
