import schedulingService from '../services/schedulingService';
import { AppointmentSlot } from '../models/AppointmentSlot';

describe('schedulingService.validateTimeRange', () => {
  test('rejects start >= end', async () => {
    const res = await schedulingService.validateTimeRange('10:00', '09:30', '2025-12-01');
    expect(res.ok).toBe(false);
    expect(res.message).toBe('Start time must be earlier than end time');
  });

  test('rejects outside office hours (early)', async () => {
    const res = await schedulingService.validateTimeRange('07:30', '08:30', '2025-12-01');
    expect(res.ok).toBe(false);
    expect(res.message).toBe('Selected time is outside office hours');
  });

  test('rejects crossing lunch break', async () => {
    const res = await schedulingService.validateTimeRange('11:30', '13:30', '2025-12-01');
    expect(res.ok).toBe(false);
    expect(res.message).toBe('Selected time is outside office hours');
  });

  test('detects overlap with existing AppointmentSlot', async () => {
    // mock AppointmentSlot.find to return an overlapping slot
    const spy = jest.spyOn(AppointmentSlot, 'find' as any).mockResolvedValue([{ date: new Date('2025-12-01T00:00:00Z'), startTime: '09:00', endTime: '09:30', inquiryId: 'other' }]);
    const res = await schedulingService.validateTimeRange('09:15', '09:45', '2025-12-01', 'current');
    expect(res.ok).toBe(false);
    expect(res.message).toBe('Selected time overlaps an existing schedule');
    spy.mockRestore();
  });
});

describe('schedulingService.validateScheduledDatesPayload', () => {
  test('rejects overlapping ranges within the same payload', () => {
    const arr = [
      { date: '2025-12-01', startTime: '09:00', endTime: '09:30' },
      { date: '2025-12-01', startTime: '09:20', endTime: '09:50' }
    ];
    const res = schedulingService.validateScheduledDatesPayload(arr);
    expect(res.ok).toBe(false);
    expect(res.message).toBe('Selected time overlaps an existing schedule');
  });

  test('accepts non-overlapping ranges on same date', () => {
    const arr = [
      { date: '2025-12-01', startTime: '09:00', endTime: '09:30' },
      { date: '2025-12-01', startTime: '09:35', endTime: '10:00' }
    ];
    const res = schedulingService.validateScheduledDatesPayload(arr);
    expect(res.ok).toBe(true);
  });
});
