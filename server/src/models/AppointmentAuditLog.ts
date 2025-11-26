import mongoose from 'mongoose';

const appointmentAuditSchema = new mongoose.Schema({
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  staffName: { type: String },
  residentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  residentName: { type: String },
  inquiryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inquiry' },
  action: { type: String, enum: ['CREATED_APPOINTMENT', 'EDITED_APPOINTMENT', 'CANCELED_APPOINTMENT'], required: true },
  fromTimeRange: { type: String },
  toTimeRange: { type: String },
}, {
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'AppointmentAuditLogs'
});

// Indexes for fast search
appointmentAuditSchema.index({ staffId: 1 });
appointmentAuditSchema.index({ residentId: 1 });
appointmentAuditSchema.index({ staffName: 'text', residentName: 'text' });

export const AppointmentAuditLog = (mongoose.models && (mongoose.models as any).AppointmentAuditLog)
  ? (mongoose.models as any).AppointmentAuditLog as mongoose.Model<any>
  : mongoose.model('AppointmentAuditLog', appointmentAuditSchema);

export default AppointmentAuditLog;
