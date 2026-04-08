import {
  initNotificationSocket,
  onNotificationEvent,
  offNotificationEvent,
  getSocket,
} from './notificationSocket';
import { axiosInstance } from './api';

export type Notification = {
  id: string;
  title: string;
  message: string;
  type?: 'documents' | 'inquiries' | 'system' | string;
  category?: 'documents' | 'inquiries' | 'system' | string;
  read: boolean;
  createdAt: string;
};

export type GetNotificationsResponse = Notification[];

export type MarkAsReadResponse = {
  success: boolean;
  notification?: Notification;
};

export type MarkAllAsReadResponse = {
  success: boolean;
  updatedCount: number;
};

const getNotifications = async (): Promise<GetNotificationsResponse> => {
  const res = await axiosInstance.get('/notifications');
  // If backend returns { data, total, ... }, extract data
  let notifications = Array.isArray(res.data)
    ? res.data
    : res.data.data;
  if (!Array.isArray(notifications)) return [];
  return notifications.map((n: any) => ({
    // normalize id vs _id so callers can reliably use `id`
    id: n.id || (n._id ? String(n._id) : undefined),
    ...n,
    category: n.category || n.type,
    type: n.type || n.category,
  }));
};

const markAsRead = async (id: string): Promise<MarkAsReadResponse> => {
  const res = await axiosInstance.patch<MarkAsReadResponse>(`/notifications/mark-read/${id}`);
  return res.data;
};

// Accept an array of ids to mark as read. If empty/undefined, server will return 400.
const markAllAsRead = async (ids?: string[]): Promise<MarkAllAsReadResponse> => {
  const payload = { ids: Array.isArray(ids) ? ids : [] };
  const res = await axiosInstance.patch<MarkAllAsReadResponse>(`/notifications/mark-read`, payload);
  return res.data;
};

export const notificationService = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  // Real-time helpers
  initNotificationSocket,
  onNotificationEvent,
  offNotificationEvent,
  getSocket,
};
