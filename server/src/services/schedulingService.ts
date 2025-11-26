import { toMinutes, rangesOverlap } from '../utils/scheduling';
import { AppointmentSlot } from '../models/AppointmentSlot';

// Helper: convert 'YYYY-MM-DD' to Date at UTC midnight
const dateStringToUtcDate = (d: string) => {
  if (!d) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00Z` : d;
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return null;
  return dt;
};

export async function validateTimeRange(startTime: string, endTime: string, date: string, inquiryId?: any) {
  const s = toMinutes(startTime);
  const e = toMinutes(endTime);
  if (Number.isNaN(s) || Number.isNaN(e) || s >= e) {
    return { ok: false, message: 'Start time must be earlier than end time' };
  }

  // Office hours: 08:00-12:00 and 13:00-17:00
  const OFFICE_START = 8 * 60; // 480
  const OFFICE_MID = 12 * 60; // 720
  const OFFICE_MID_END = 13 * 60; // 780
  const OFFICE_END = 17 * 60; // 1020

  // crossing lunch break or outside both office windows
  const withinMorning = s >= OFFICE_START && e <= OFFICE_MID;
  const withinAfternoon = s >= OFFICE_MID_END && e <= OFFICE_END;
  if (!(withinMorning || withinAfternoon)) {
    return { ok: false, message: 'Selected time is outside office hours' };
  }

  // Check against persisted AppointmentSlot entries for the date
  const dateObj = dateStringToUtcDate(date);
  if (!dateObj) return { ok: false, message: 'Selected time is outside office hours' };

  const slots = await AppointmentSlot.find({ date: dateObj }).lean();
  for (const slot of slots || []) {
    // skip same inquiry's own slots
    if (inquiryId && String(slot.inquiryId) === String(inquiryId)) continue;
    const os = toMinutes(slot.startTime);
    const oe = toMinutes(slot.endTime);
    if (Number.isNaN(os) || Number.isNaN(oe)) continue;
    if (rangesOverlap(s, e, os, oe)) {
      return { ok: false, message: 'Selected time overlaps an existing schedule' };
    }
  }

  return { ok: true };
}

// Validate a set of scheduledDates for an inquiry payload to ensure no internal overlaps
export function validateScheduledDatesPayload(dates: Array<{ date: string; startTime: string; endTime: string }>) {
  if (!Array.isArray(dates)) return { ok: false, message: 'scheduledDates must be an array' };
  // ensure no overlapping ranges within the same payload for the same date
  // group by date
  const byDate = new Map<string, Array<{ s: number; e: number }>>();
  for (const d of dates) {
    if (!d || !d.date || !d.startTime || !d.endTime) return { ok: false, message: 'Invalid scheduledDates payload' };
    const s = toMinutes(d.startTime);
    const e = toMinutes(d.endTime);
    if (Number.isNaN(s) || Number.isNaN(e) || s >= e) return { ok: false, message: 'Start time must be earlier than end time' };
    const arr = byDate.get(d.date) || [];
    // check overlap against existing entries for this date
    for (const ex of arr) {
      if (rangesOverlap(s, e, ex.s, ex.e)) return { ok: false, message: 'Selected time overlaps an existing schedule' };
    }
    arr.push({ s, e });
    byDate.set(d.date, arr);
  }
  return { ok: true };
}

export default {
  validateTimeRange,
  validateScheduledDatesPayload,
};
