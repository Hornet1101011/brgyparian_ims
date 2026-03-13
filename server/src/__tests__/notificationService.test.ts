import { sendAppointmentNotification } from '../services/notificationService';
import { Notification } from '../models/Notification';
import { User } from '../models/User';

// jest will auto-mock requires if we use jest.mock
jest.mock('../services/EmailService', () => ({
  sendMail: jest.fn(() => Promise.resolve({ success: true }))
}));

describe('notificationService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates a notification and sends email when appointment notification is called', async () => {
    const residentId = 'resident123';
    const details = { scheduledDates: [{ date: '2026-03-14', startTime: '10:00', endTime: '10:30' }] };

    // spy on Notification.create and User.findById
    const notifSpy = jest.spyOn(Notification, 'create').mockResolvedValue({} as any);
    const userSpy = jest.spyOn(User, 'findById' as any).mockResolvedValue({ email: 'user@example.com' } as any);

    const { sendMail } = require('../services/EmailService');

    await sendAppointmentNotification(residentId, 'created', details);

    expect(notifSpy).toHaveBeenCalledWith(expect.objectContaining({ userId: residentId, type: 'appointments' }));
    expect(userSpy).toHaveBeenCalledWith(residentId);
    expect(sendMail).toHaveBeenCalledWith(
      'user@example.com',
      expect.any(String),
      expect.stringContaining('Your appointment has been scheduled'),
      [],
      'appointment'
    );
  });
});