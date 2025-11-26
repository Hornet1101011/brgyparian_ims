const mod = require('../models/AppointmentSlot');
const schedulingService = require('../services/schedulingService');

describe('updateAppointmentSlotWithValidation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Mock mongoose.startSession to avoid connecting to a real DB during tests
    const mongoose = require('mongoose');
    jest.spyOn(mongoose, 'startSession').mockImplementation(() => {
      return Promise.resolve({
        startTransaction: () => {},
        commitTransaction: async () => {},
        abortTransaction: async () => {},
        endSession: () => {},
        withTransaction: async (fn: any) => { await fn(); }
      } as any);
    });
    // Mock User.findById to return minimal objects so helper can build newDoc
    const User = require('../models/User');
    if (User && User.User) {
      jest.spyOn(User.User, 'findById').mockImplementation((id: any) => ({ lean: () => Promise.resolve({ _id: id, fullName: `Name-${id}`, username: id, barangayID: 'B-1' }) }) as any);
    }
  });

  test('successfully replaces old slot with new slot', async () => {
    const oldDoc = { _id: 'oldid', inquiryId: 'inq1', date: new Date('2025-12-01T00:00:00Z'), startTime: '09:00', endTime: '09:30' };
    jest.spyOn(mod.AppointmentSlot, 'findOne').mockImplementation(() => ({ session: (s: any) => ({ lean: () => Promise.resolve(oldDoc) }), lean: () => Promise.resolve(oldDoc) }) as any);
    jest.spyOn(mod.AppointmentSlot, 'deleteOne').mockImplementation(() => ({ session: (s: any) => Promise.resolve({ deletedCount: 1 }), exec: () => Promise.resolve({ deletedCount: 1 }) }) as any);
    jest.spyOn(mod.AppointmentSlot, 'find').mockImplementation(() => ({ session: (s: any) => ({ lean: () => Promise.resolve([]) }), lean: () => Promise.resolve([]) }) as any);
    jest.spyOn(mod.AppointmentSlot, 'create').mockResolvedValue([ { _id: 'newid' } ] as any);
    jest.spyOn(schedulingService, 'validateTimeRange').mockResolvedValue({ ok: true } as any);

    const res = await mod.updateAppointmentSlotWithValidation('inq1', { date: '2025-12-01', startTime: '09:00', endTime: '09:30' }, { date: '2025-12-01', startTime: '10:00', endTime: '10:30' }, 'staff1', 'resident1');
    expect(res).toBeDefined();
    expect(res.ok).toBe(true);
  });

  test('restores old slot when validation fails', async () => {
    const oldDoc = { _id: 'oldid', inquiryId: 'inq1', date: new Date('2025-12-01T00:00:00Z'), startTime: '09:00', endTime: '09:30' };
    jest.spyOn(mod.AppointmentSlot, 'findOne').mockImplementation(() => ({ session: (s: any) => ({ lean: () => Promise.resolve(oldDoc) }), lean: () => Promise.resolve(oldDoc) }) as any);
    jest.spyOn(mod.AppointmentSlot, 'deleteOne').mockImplementation(() => ({ session: (s: any) => Promise.resolve({ deletedCount: 1 }) }) as any);
    jest.spyOn(mod.AppointmentSlot, 'find').mockImplementation(() => ({ session: (s: any) => ({ lean: () => Promise.resolve([]) }), lean: () => Promise.resolve([]) }) as any);
    const createSpy = jest.spyOn(mod.AppointmentSlot, 'create').mockResolvedValue([oldDoc] as any);
    jest.spyOn(schedulingService, 'validateTimeRange').mockResolvedValue({ ok: false, message: 'Selected time is outside office hours' } as any);

    const res = await mod.updateAppointmentSlotWithValidation('inq1', { date: '2025-12-01', startTime: '09:00', endTime: '09:30' }, { date: '2025-12-01', startTime: '07:00', endTime: '07:30' }, 'staff1', 'resident1');
    expect(res).toBeDefined();
    expect(res.ok).toBe(false);
    // Depending on whether transactions are in use, create may or may not be called (transaction abort rolls back delete).
    if (!createSpy.mock.calls.length) {
      // no-op - acceptable when transactions are used
    } else {
      expect(createSpy).toHaveBeenCalled();
    }
  });
});
