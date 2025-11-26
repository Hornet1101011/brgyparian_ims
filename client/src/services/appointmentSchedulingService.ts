import appointmentsAPI from '../api/appointments';
import { normalizeToMinutes, rangesOverlap, isValidOfficeRange, ExistingRange, ScheduledDate, ConflictItem } from '../components/staff/appointments/utils';
import type { AppointmentInquiry, ScheduledAppointment } from '../types/appointments';

// Pure helper functions for staff appointment scheduling UI.

// 1) Filter pending inquiries (pure)
export const filterPendingInquiries = (inquiries: AppointmentInquiry[] = []): AppointmentInquiry[] => {
  if (!Array.isArray(inquiries)) return [];
  return inquiries.filter(i => i && String(i.status).toLowerCase() === 'pending');
};

// 2) Build map of existing scheduled ranges by date from inquiries (pure)
export const buildExistingScheduledByDate = (inquiries: AppointmentInquiry[] = [], excludeInquiryId?: string): Record<string, ExistingRange[]> => {
  const map: Record<string, ExistingRange[]> = {};
  for (const inq of (inquiries || [])) {
    if (!inq) continue;
    if (excludeInquiryId && String(inq._id) === String(excludeInquiryId)) continue;
    if (!Array.isArray(inq.scheduledDates)) continue;
    for (const sd of inq.scheduledDates) {
      if (!sd || !sd.date) continue;
      map[sd.date] = map[sd.date] || [];
      map[sd.date].push({ start: sd.startTime, end: sd.endTime, inquiryId: String(inq._id), residentUsername: inq.username, residentName: inq.createdBy?.fullName });
    }
  }
  return map;
};

// 3) Validate selected time ranges (pure)
export const validateSelections = (selectedDates: string[], timeRanges: Record<string, { start?: string; end?: string }>, existingByDate: Record<string, ExistingRange[]> = {}) => {
  if (!Array.isArray(selectedDates) || selectedDates.length === 0) return { ok: false, msg: 'No dates selected' };
  for (const d of selectedDates) {
    const r = timeRanges[d];
    if (!r || !r.start || !r.end) return { ok: false, msg: `Please supply time range for ${d}` };
    if (!isValidOfficeRange(r.start, r.end)) return { ok: false, msg: `Time range for ${d} is invalid or outside office hours` };
    const existing = existingByDate[d] || [];
    for (const ex of existing) {
      if (rangesOverlap(r.start, r.end, ex.start, ex.end)) {
        return { ok: false, msg: `Selected time ${r.start}-${r.end} overlaps existing appointment ${ex.start}-${ex.end} on ${d}` };
      }
    }
  }
  return { ok: true };
};

// 4) Find conflicts between desired scheduledDates and existing scheduled map (pure)
export const findConflicts = (scheduledDates: ScheduledDate[], existingByDate: Record<string, ExistingRange[]>, excludeInquiryId?: string): ConflictItem[] => {
  const conflicts: ConflictItem[] = [];
  for (const sd of scheduledDates || []) {
    if (!sd || !sd.date || !sd.startTime || !sd.endTime) continue;
    const existing = existingByDate[sd.date] || [];
    for (const ex of existing) {
      if (excludeInquiryId && String(ex.inquiryId) === String(excludeInquiryId)) continue;
      if (rangesOverlap(sd.startTime, sd.endTime, ex.start, ex.end)) {
        conflicts.push({ inquiryId: ex.inquiryId, username: ex.residentUsername || undefined, residentName: ex.residentName || undefined, date: sd.date, startTime: ex.start, endTime: ex.end });
      }
    }
  }
  return conflicts;
};

// 5) Compute disabled minute ranges (as [start,end) minute pairs) from existing ranges (pure)
export const computeDisabledRanges = (existingRanges: ExistingRange[]): Array<{ start: number; end: number }> => {
  const out: Array<{ start: number; end: number }> = [];
  for (const r of existingRanges || []) {
    const s = normalizeToMinutes(r.start);
    const e = normalizeToMinutes(r.end);
    if (Number.isNaN(s) || Number.isNaN(e) || s >= e) continue;
    out.push({ start: s, end: e });
  }
  // merge overlapping
  out.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const seg of out) {
    if (merged.length === 0) merged.push({ ...seg });
    else {
      const last = merged[merged.length - 1];
      if (seg.start <= last.end) {
        last.end = Math.max(last.end, seg.end);
      } else merged.push({ ...seg });
    }
  }
  return merged;
};

// 6) Map UI selections to scheduled payload (pure)
export const mapSelectionsToScheduledDates = (selectedDates: string[], timeRanges: Record<string, { start?: string; end?: string }>): ScheduledDate[] => {
  const out: ScheduledDate[] = [];
  for (const d of selectedDates || []) {
    const r = timeRanges[d];
    if (!r || !r.start || !r.end) continue;
    out.push({ date: d, startTime: r.start, endTime: r.end });
  }
  return out;
};

// 7) Prepare payload for server (pure)
export const prepareSchedulePayload = (scheduledDates: ScheduledDate[]) => ({ scheduledDates, status: 'scheduled' as const });

// 8) Thin wrapper to save scheduled appointments (impure, side-effect)
export const saveScheduledAppointments = async (inquiryId: string, scheduledDates: ScheduledDate[]) => {
  // delegates to central API wrapper
  return appointmentsAPI.scheduleAppointment({ id: inquiryId, scheduledDates: scheduledDates as any });
};

export default {
  filterPendingInquiries,
  buildExistingScheduledByDate,
  validateSelections,
  findConflicts,
  computeDisabledRanges,
  mapSelectionsToScheduledDates,
  prepareSchedulePayload,
  saveScheduledAppointments,
};
