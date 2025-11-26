import dayjs from 'dayjs';

type TimeRange = { start: string; end: string };

const OFFICE_START = '08:00';
const OFFICE_END = '17:00';
const LUNCH_START = '12:00';
const LUNCH_END = '13:00';

function toDayjs(t: string) {
  // parse as time on arbitrary same day
  return dayjs().hour(Number(t.split(':')[0])).minute(Number(t.split(':')[1])).second(0).millisecond(0);
}

export function isOverlapping(startA: string | dayjs.Dayjs, endA: string | dayjs.Dayjs, startB: string | dayjs.Dayjs, endB: string | dayjs.Dayjs) {
  const a0 = typeof startA === 'string' ? toDayjs(startA) : startA;
  const a1 = typeof endA === 'string' ? toDayjs(endA) : endA;
  const b0 = typeof startB === 'string' ? toDayjs(startB) : startB;
  const b1 = typeof endB === 'string' ? toDayjs(endB) : endB;
  if (!a0 || !a1 || !b0 || !b1) return false;
  return a0.isBefore(b1) && a1.isAfter(b0);
}

// Clamp a given time range to office hours. Returns null if after clamping there's no valid interval.
export function clampToOfficeHours(range: TimeRange): TimeRange | null {
  const s = toDayjs(range.start);
  const e = toDayjs(range.end);
  const os = toDayjs(OFFICE_START);
  const oe = toDayjs(OFFICE_END);
  const startClamped = s.isBefore(os) ? os : s;
  const endClamped = e.isAfter(oe) ? oe : e;
  if (!startClamped.isBefore(endClamped)) return null;
  return { start: startClamped.format('HH:mm'), end: endClamped.format('HH:mm') };
}

// Remove lunch break from the provided range. Returns an array of ranges (possibly split around lunch).
export function removeLunchBreak(range: TimeRange): TimeRange[] {
  const s = toDayjs(range.start);
  const e = toDayjs(range.end);
  const ls = toDayjs(LUNCH_START);
  const le = toDayjs(LUNCH_END);
  // No overlap with lunch
  if (!isOverlapping(s, e, ls, le)) return [{ start: s.format('HH:mm'), end: e.format('HH:mm') }];
  const out: TimeRange[] = [];
  // part before lunch
  if (s.isBefore(ls)) {
    const beforeEnd = ls.isBefore(e) ? ls : e;
    if (s.isBefore(beforeEnd)) out.push({ start: s.format('HH:mm'), end: beforeEnd.format('HH:mm') });
  }
  // part after lunch
  if (e.isAfter(le)) {
    const afterStart = le.isAfter(s) ? le : s;
    if (afterStart.isBefore(e)) out.push({ start: afterStart.format('HH:mm'), end: e.format('HH:mm') });
  }
  return out;
}

export default { isOverlapping, clampToOfficeHours, removeLunchBreak };
