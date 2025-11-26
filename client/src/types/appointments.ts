// Scheduling-related TypeScript interfaces

export interface TimeRange {
  start?: string;
  end?: string;
}

export type AvailableDate = string; // UI currently uses string dates (ISO 'YYYY-MM-DD')

export interface ScheduledAppointment {
  date: string;
  startTime: string;
  endTime: string;
  inquiryId?: string;
  residentUsername?: string;
  residentName?: string;
}

export interface ResidentInfo {
  username?: string;
  fullName?: string;
  contactNumber?: string;
  address?: string;
  barangayID?: string;
}

export interface StaffUser {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
}

export interface AppointmentInquiry {
  _id: string | number;
  type?: string;
  status?: string;
  appointmentDates?: string[]; // requested dates (ISO strings)
  scheduledDates?: Array<{ date: string; startTime: string; endTime: string }>;
  username?: string;
  createdBy?: ResidentInfo;
  // allow other server-provided fields as optional
  [k: string]: any;
}

export interface ConflictItem {
  inquiryId?: string | number;
  username?: string | null;
  residentName?: string | null;
  date?: string;
  startTime?: string;
  endTime?: string;
}
