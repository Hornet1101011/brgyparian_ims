import { AppointmentAuditLog } from '../models/AppointmentAuditLog';
import { User } from '../models/User';

/**
 * Log an appointment creation or edit action.
 * staff: user object or id
 * resident: user object or id
 */
export async function logAppointmentChange(options: {
  staffId: any,
  staffName?: string,
  residentId: any,
  residentName?: string,
  inquiryId?: any,
  action: 'CREATED_APPOINTMENT' | 'EDITED_APPOINTMENT',
  fromTimeRange?: string,
  toTimeRange?: string,
}) {
  try {
    const doc: any = {
      staffId: options.staffId,
      staffName: options.staffName,
      residentId: options.residentId,
      residentName: options.residentName,
      inquiryId: options.inquiryId,
      action: options.action,
      fromTimeRange: options.fromTimeRange,
      toTimeRange: options.toTimeRange
    };
    const created = await AppointmentAuditLog.create(doc);
    return created;
  } catch (err) {
    console.error('Failed to write appointment audit log', err);
    // Do not throw — logging should not break user flow
    return null;
  }
}

export default { logAppointmentChange };
