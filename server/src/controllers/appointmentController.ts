import { Request, Response } from 'express';
import { AppointmentSlot } from '../models/AppointmentSlot';
import { toMinutes } from '../utils/scheduling';

// Helper: build UTC midnight Date for a YYYY-MM-DD string
const dateStringToUtcDate = (d: string) => {
  if (!d) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00Z` : d;
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return null;
  return dt;
};

export const getTodaySummary = async (req: Request, res: Response) => {
  try {
    // Determine today's date string in UTC
    const todayStr = new Date().toISOString().slice(0, 10);
    const dateObj = dateStringToUtcDate(todayStr);
    if (!dateObj) return res.status(500).json({ message: 'Failed to compute today' });

    // Fetch all appointment slots for today
    const slots = await AppointmentSlot.find({ date: dateObj }).lean();

    // Total scheduled (number of distinct slot documents)
    const totalScheduledToday = (slots || []).length;

    // Compute reserved minutes
    let reservedMinutes = 0;
    for (const s of slots || []) {
      try {
        const a = toMinutes(s.startTime);
        const b = toMinutes(s.endTime);
        if (!Number.isNaN(a) && !Number.isNaN(b) && b > a) reservedMinutes += (b - a);
      } catch (e) { /* ignore malformed entries */ }
    }

    // Office hours total minutes: 08:00-12:00 and 13:00-17:00 -> 480 minutes
    const OFFICE_TOTAL_MINUTES = (12 - 8) * 60 + (17 - 13) * 60; // 480

    // Present available slots as number of 30-minute blocks remaining
    const SLOT_BLOCK_MIN = 30;
    const freeMinutes = Math.max(0, OFFICE_TOTAL_MINUTES - reservedMinutes);
    const totalAvailableSlotsToday = Math.floor(freeMinutes / SLOT_BLOCK_MIN);

    // Upcoming in next 2 hours (only today's slots)
    const nowUtc = new Date();
    const nowMinutes = toMinutes(nowUtc.toISOString().slice(11, 16));
    const limitMinutes = nowMinutes + 120;
    const nextAppointments = (slots || [])
      .filter((s: any) => {
        const sm = toMinutes(s.startTime);
        return !Number.isNaN(sm) && sm >= nowMinutes && sm <= limitMinutes;
      })
      .map((s: any) => ({ residentName: s.residentName || s.residentUsername || s.resident || 'Unknown', startTime: s.startTime, endTime: s.endTime }));

    res.json({ totalScheduledToday, totalAvailableSlotsToday, nextAppointments });
  } catch (error) {
    console.error('Error in getTodaySummary:', error);
    res.status(500).json({ message: 'Error computing summary' });
  }
};

export const getSlotsInRange = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query as any;
    if (!startDate || !endDate) return res.status(400).json({ message: 'startDate and endDate query params required (YYYY-MM-DD)' });
    const s = dateStringToUtcDate(startDate);
    const e = dateStringToUtcDate(endDate);
    if (!s || !e) return res.status(400).json({ message: 'Invalid date format; use YYYY-MM-DD' });
    // inclusive range: find slots with date >= s && date <= e
    const slots = await AppointmentSlot.find({ date: { $gte: s, $lte: e } }).lean();
    const out = (slots || []).map((slt: any) => ({
      _id: slt._id,
      inquiryId: slt.inquiryId,
      residentId: slt.residentId,
      residentName: slt.residentName || slt.residentUsername || null,
      staffId: slt.staffId || null,
      staffName: slt.staffName || null,
      date: slt.date ? (new Date(slt.date)).toISOString().slice(0,10) : null,
      startTime: slt.startTime,
      endTime: slt.endTime
    })).filter((x: any) => x.date !== null);
    return res.json({ slots: out });
  } catch (error) {
    console.error('Error in getSlotsInRange:', error);
    return res.status(500).json({ message: 'Error fetching slots' });
  }
};

export default {
  getTodaySummary,
  getSlotsInRange
};
