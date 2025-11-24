// Minute-level scheduling helpers
export const toMinutes = (hhmm: string) => {
  const parts = String(hhmm || '').split(':').map(x => parseInt(x, 10));
  if (parts.length < 2) return NaN;
  const [hh, mm] = parts;
  if (Number.isNaN(hh) || Number.isNaN(mm)) return NaN;
  return hh * 60 + mm;
};

export const rangesOverlap = (aStartMin: number, aEndMin: number, bStartMin: number, bEndMin: number) => {
  return aStartMin < bEndMin && aEndMin > bStartMin;
};

export const slotOverlapsAny = (candidate: { start: string; end: string }, existing: Array<{ start: string; end: string }>) => {
  const s = toMinutes(candidate.start);
  const e = toMinutes(candidate.end);
  if (Number.isNaN(s) || Number.isNaN(e)) return false;
  for (const ex of existing) {
    const es = toMinutes(ex.start);
    const ee = toMinutes(ex.end);
    if (Number.isNaN(es) || Number.isNaN(ee)) continue;
    if (rangesOverlap(s, e, es, ee)) return true;
  }
  return false;
};

export default {
  toMinutes,
  rangesOverlap,
  slotOverlapsAny,
};
