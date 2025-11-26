// Utility types and helpers for appointment scheduling
export type ExistingRange = { start: string; end: string; inquiryId?: string; residentUsername?: string; residentName?: string };
export type ScheduledDate = { date: string; startTime: string; endTime: string };
export type ConflictItem = { inquiryId?: string; username?: string | null; residentName?: string | null; date?: string; startTime?: string; endTime?: string };

export const normalizeToMinutes = (t?: string) => {
  if (!t) return NaN;
  const parts = String(t).split(':');
  if (parts.length < 2) return NaN;
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return NaN;
  return hh * 60 + mm;
};

export const rangesOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string) => {
  const sA = normalizeToMinutes(aStart);
  const eA = normalizeToMinutes(aEnd);
  const sB = normalizeToMinutes(bStart);
  const eB = normalizeToMinutes(bEnd);
  if (Number.isNaN(sA) || Number.isNaN(eA) || Number.isNaN(sB) || Number.isNaN(eB)) return false;
  return sA < eB && eA > sB;
};

export const isValidOfficeRange = (start: string | undefined, end: string | undefined) => {
  if (!start || !end) return false;
  const OFFICE_START = 8 * 60;
  const OFFICE_END = 17 * 60;
  const s = normalizeToMinutes(start);
  const e = normalizeToMinutes(end);
  if (Number.isNaN(s) || Number.isNaN(e) || s >= e) return false;
  if (s < OFFICE_START || e > OFFICE_END) return false;
  // avoid lunch
  const LUNCH_START = 12 * 60;
  const LUNCH_END = 13 * 60;
  if (s < LUNCH_END && e > LUNCH_START) return false;
  return true;
};
