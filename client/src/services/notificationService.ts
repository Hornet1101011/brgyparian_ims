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
    ...n,
    category: n.category || n.type,
    type: n.type || n.category,
  }));
};

const markAsRead = async (id: string): Promise<MarkAsReadResponse> => {
  const res = await axiosInstance.post<MarkAsReadResponse>(`/notifications/${id}/read`);
  return res.data;
};

const markAllAsRead = async (): Promise<MarkAllAsReadResponse> => {
  const res = await axiosInstance.post<MarkAllAsReadResponse>(`/notifications/read-all`);
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
