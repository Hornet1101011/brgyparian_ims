import { Notification } from '../models/Notification';
import { FilterQuery } from 'mongoose';

interface GetNotificationsOptions {
  userId: string;
  page?: number;
  limit?: number;
  search?: string;
  type?: 'documents' | 'inquiries' | 'system' | 'all';
  sort?: string;
}

export async function getNotifications({ userId, page = 1, limit = 10, search = '', type = 'all', sort = '-createdAt' }: GetNotificationsOptions) {
  // Accept both `userId` and legacy `user` field names so older seeded docs are returned
  const filter: FilterQuery<any> = { $or: [{ userId }, { user: userId }] };
  if (type && type !== 'all') filter.type = type;
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { message: { $regex: search, $options: 'i' } },
    ];
  }
  const total = await Notification.countDocuments(filter);
  const data = await Notification.find(filter)
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit);
  return {
    data,
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

export async function markAsRead(id: string) {
  return Notification.findByIdAndUpdate(id, { read: true });
}

export async function markManyAsRead(ids: string[]) {
  return Notification.updateMany({ _id: { $in: ids } }, { read: true });
}

export async function deleteNotification(id: string) {
  return Notification.findByIdAndDelete(id);
}

export async function deleteManyNotifications(ids: string[]) {
  return Notification.deleteMany({ _id: { $in: ids } });
}

// Send appointment-related notification to a resident and emit socket event.
// Quiet-fail: any errors are caught and logged but not thrown so callers remain unaffected.
export async function sendAppointmentNotification(residentId: any, type: 'created' | 'edited' | 'canceled', details: any) {
  try {
    if (!residentId) return;
    const titleMap: Record<string, string> = {
      created: 'Appointment Scheduled',
      edited: 'Appointment Updated',
      canceled: 'Appointment Canceled'
    };
    const msgMap: Record<string, (d: any) => string> = {
      created: (d: any) => {
        if (Array.isArray(d?.scheduledDates) && d.scheduledDates.length) {
          return `Your appointment has been scheduled for ${d.scheduledDates.map((s: any) => `${s.date}, ${s.startTime} – ${s.endTime}`).join('; ')}`;
        }
        if (d?.date && d?.startTime && d?.endTime) return `Your appointment has been scheduled for ${d.date}, ${d.startTime} – ${d.endTime}`;
        return 'Your appointment has been scheduled.';
      },
      edited: (d: any) => {
        if (Array.isArray(d?.scheduledDates) && d.scheduledDates.length) {
          return `Your appointment has been updated to ${d.scheduledDates.map((s: any) => `${s.date}, ${s.startTime} – ${s.endTime}`).join('; ')}`;
        }
        if (d?.date && d?.startTime && d?.endTime) return `Your appointment has been updated to ${d.date}, ${d.startTime} – ${d.endTime}`;
        return 'Your appointment has been updated.';
      },
      canceled: (d: any) => `Your appointment has been canceled.`
    };

    const title = titleMap[type] || 'Appointment Notification';
    const message = (msgMap[type] || (() => 'Appointment update'))(details || {});

    // Create Notification document for resident (non-blocking)
    try {
      await Notification.create({
        userId: residentId,
        type: 'appointments',
        title,
        message,
        data: details || {}
      });
    } catch (e) {
      console.warn('Failed to create appointment Notification document', (e as any)?.message || e);
    }

    // Emit socket event for real-time updates if io is available
    try {
      // Importing io here to avoid circular import at module load time in some cases
      const { io } = require('../index');
      if (io && typeof io.to === 'function') {
        io.to(String(residentId)).emit('appointment:updated', { type, details });
      }
    } catch (e) {
      console.warn('Failed to emit appointment socket event', (e as any)?.message || e);
    }
  } catch (err) {
    // ensure this function never throws to callers
    console.warn('sendAppointmentNotification encountered error', (err as any)?.message || err);
  }
}
