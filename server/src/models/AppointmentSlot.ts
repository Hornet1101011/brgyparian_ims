import mongoose from 'mongoose';

const appointmentSlotSchema = new mongoose.Schema({
  date: { type: String, required: true }, // YYYY-MM-DD
  slot: { type: Number, required: true }, // minute index (e.g., 480 for 08:00, 485 for 08:05)
  inquiryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inquiry', required: true },
  scheduledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

// Unique index per date+slot to prevent overlapping reservations for the same slot
appointmentSlotSchema.index({ date: 1, slot: 1 }, { unique: true });

export const AppointmentSlot = mongoose.model('AppointmentSlot', appointmentSlotSchema);
