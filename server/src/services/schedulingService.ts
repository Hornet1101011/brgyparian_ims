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

export async function validateTimeRange(startTime: string, endTime: string, date: string, inquiryIdOrOptions?: any) {
  // Backwards-compatible: fourth arg may be an inquiryId (string) or an options object
  let inquiryId: any = undefined;
  let residentIds: any[] | undefined = undefined;
  if (typeof inquiryIdOrOptions === 'string' || typeof inquiryIdOrOptions === 'number') {
    inquiryId = inquiryIdOrOptions;
  } else if (inquiryIdOrOptions && typeof inquiryIdOrOptions === 'object') {
    inquiryId = inquiryIdOrOptions.inquiryId;
    residentIds = Array.isArray(inquiryIdOrOptions.residentIds) ? inquiryIdOrOptions.residentIds : undefined;
  }

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

  // When residentIds is provided, only check conflicts for those resident(s).
  const findQuery: any = { date: dateObj };
  if (residentIds && residentIds.length) {
    findQuery.residentId = { $in: residentIds };
  }
  const slots = await AppointmentSlot.find(findQuery).lean();
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

export type ScheduledPayloadEntry = {
  date: string;
  startTime: string;
  endTime: string;
  assignedUsernames?: string[];
};

/**
 * Ensure no resident is double-booked within the same payload.
 * When entries omit assignedUsernames, they are treated as the inquiry primary (same slot as legacy single-resident scheduling).
 */
export function validateScheduledDatesPayload(
  dates: ScheduledPayloadEntry[],
  opts?: { primaryUsername?: string }
) {
  if (!Array.isArray(dates)) return { ok: false, message: 'scheduledDates must be an array' };

  const resolveUserKeys = (d: ScheduledPayloadEntry): string[] => {
    const raw = Array.isArray(d.assignedUsernames)
      ? d.assignedUsernames.map((x: any) => String(x).trim()).filter(Boolean)
      : [];
    if (raw.length) return raw;
    const p = opts?.primaryUsername ? String(opts.primaryUsername).trim() : '';
    return p ? [p] : ['__unassigned__'];
  };

  const byDate = new Map<string, Array<{ s: number; e: number; users: string[] }>>();
  for (const d of dates) {
    if (!d || !d.date || !d.startTime || !d.endTime) return { ok: false, message: 'Invalid scheduledDates payload' };
    const s = toMinutes(d.startTime);
    const e = toMinutes(d.endTime);
    if (Number.isNaN(s) || Number.isNaN(e) || s >= e) return { ok: false, message: 'Start time must be earlier than end time' };
    const users = resolveUserKeys(d);
    const arr = byDate.get(d.date) || [];
    for (const ex of arr) {
      if (!rangesOverlap(s, e, ex.s, ex.e)) continue;
      const setA = new Set(users);
      const setB = new Set(ex.users);
      for (const u of setA) {
        if (setB.has(u)) {
          return { ok: false, message: 'Selected time overlaps an existing schedule' };
        }
      }
    }
    arr.push({ s, e, users });
    byDate.set(d.date, arr);
  }
  return { ok: true };
}

export default {
  validateTimeRange,
  validateScheduledDatesPayload,
};
