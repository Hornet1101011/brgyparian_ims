import { axiosInstance } from '../services/api';
import type { AppointmentInquiry, ScheduledAppointment, ConflictItem } from '../types/appointments';

function handleError(err: any): never {
  const status = err?.response?.status;
  const data = err?.response?.data;
  const msg = (data && (data.message || JSON.stringify(data))) || err?.message || 'Unknown error';
  const e = new Error(msg);
  (e as any).status = status;
  (e as any).data = data;
  throw e;
}

export async function getAppointmentInquiries(): Promise<AppointmentInquiry[]> {
  try {
    const resp = await axiosInstance.get('/inquiries');
    const data = resp.data;
    return Array.isArray(data) ? (data as AppointmentInquiry[]).filter(i => (i && i.type === 'SCHEDULE_APPOINTMENT')) : [];
  } catch (err: any) {
    return handleError(err);
  }
}

export async function getAppointmentDetails(inquiryId: string): Promise<AppointmentInquiry | null> {
  try {
    const resp = await axiosInstance.get(`/inquiries/${inquiryId}`);
    return resp.data as AppointmentInquiry;
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    return handleError(err);
  }
}

export async function getScheduledAppointmentsByDate(date: string): Promise<ScheduledAppointment[]> {
  try {
    const all = await getAppointmentInquiries();
    const out: ScheduledAppointment[] = [];
    for (const inq of all) {
      if (!Array.isArray(inq.scheduledDates)) continue;
      for (const sd of inq.scheduledDates) {
        if (sd && sd.date === date) {
          out.push({ date: sd.date, startTime: sd.startTime, endTime: sd.endTime, inquiryId: String(inq._id), residentUsername: inq.username, residentName: inq.createdBy?.fullName });
        }
      }
    }
    return out;
  } catch (err: any) {
    return handleError(err);
  }
}

export async function scheduleAppointment(payload: { id: string; scheduledDates: ScheduledAppointment[] }): Promise<{ success?: boolean; conflicts?: ConflictItem[] } | any> {
  try {
    const { id, scheduledDates } = payload;
    const resp = await axiosInstance.post(`/inquiries/${id}`, { scheduledDates, status: 'scheduled' });
    return resp.data;
  } catch (err: any) {
    return handleError(err);
  }
}

export async function resolveAppointment(inquiryId: string): Promise<any> {
  try {
    const resp = await axiosInstance.patch(`/inquiries/${inquiryId}`, { status: 'resolved' });
    return resp.data;
  } catch (err: any) {
    return handleError(err);
  }
}

export default {
  getAppointmentInquiries,
  getAppointmentDetails,
  getScheduledAppointmentsByDate,
  scheduleAppointment,
  resolveAppointment,
};
