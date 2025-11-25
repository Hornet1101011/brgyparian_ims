import mongoose from 'mongoose';

const appointmentSlotSchema = new mongoose.Schema({
  date: { type: String, required: true }, // YYYY-MM-DD
  slot: { type: Number, required: true }, // minute index (e.g., 480 for 08:00, 485 for 08:05)
  inquiryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inquiry', required: true },
  scheduledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Resident info for easier lookup and admin reporting
  residentName: { type: String },
  residentUsername: { type: String },
  residentBarangayID: { type: String },
  // Staff user info who confirmed the appointment (username + barangayID)
  scheduledByUsername: { type: String },
  scheduledByBarangayID: { type: String },
  // Appointment-level details (the time range that this slot is part of)
  appointmentStartTime: { type: String }, // e.g. '08:30'
  appointmentEndTime: { type: String },   // e.g. '08:45'
  createdAt: { type: Date, default: Date.now }
});

// Unique index per date+slot to prevent overlapping reservations for the same slot
appointmentSlotSchema.index({ date: 1, slot: 1 }, { unique: true });

// Guard against recompilation in dev (nodemon / ts-node)
export const AppointmentSlot: mongoose.Model<any> = (mongoose.models && (mongoose.models as any).AppointmentSlot)
  ? (mongoose.models as any).AppointmentSlot as mongoose.Model<any>
  : mongoose.model('AppointmentSlot', appointmentSlotSchema);
