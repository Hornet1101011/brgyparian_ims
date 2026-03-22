import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IStaffNote {
  _id: Types.ObjectId;
  text: string;
  createdBy: Types.ObjectId;
  createdByName?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface IStaffMessage {
  text: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  visibleToResident?: boolean;
}

export interface IInquiry extends Document {
  subject: string;
  message: string;
  type?: string;
  status: 'open' | 'pending' | 'in-progress' | 'scheduled' | 'resolved' | 'canceled' | 'closed';
  createdBy: mongoose.Types.ObjectId;
  username: string;
  barangayID: string;
  assignedTo?: mongoose.Types.ObjectId;
  responses?: Array<{
    text: string;
    createdBy: mongoose.Types.ObjectId;
    authorName?: string;
    authorRole?: string;
    createdAt: Date;
    attachments?: Array<{
      filename: string;
      path?: string;
      url?: string;
      contentType?: string;
      size?: number;
      uploadedAt?: Date;
    }>;
  }>;
  attachments?: Array<{
    filename: string;
    path?: string;
    url?: string;
    contentType?: string;
    size?: number;
    uploadedAt?: Date;
  }>;
  // Optional preferred appointment dates supplied by residents (stored as YYYY-MM-DD strings)
  appointmentDates?: string[];
  // scheduledDates contains the actual scheduled slots set by staff
  scheduledDates?: Array<{ date: string; startTime: string; endTime: string }>;
  scheduledBy?: mongoose.Types.ObjectId;
  cancellationReason?: string;
  canceledBy?: mongoose.Types.ObjectId;
  canceledAt?: Date;
  staffNotes?: IStaffNote[];
  messages?: IStaffMessage[];
  // Quick appointment fields
  recipients?: string[]; // Array of usernames for multi-recipient appointments
  recipientEmails?: string[]; // Array of emails for multi-recipient appointments
  quick_appointment_type?: string; // 'single' | 'multiple' | 'mass'
  locationType?: string; // 'on-site' | 'virtual' | 'hybrid'
  location?: string; // Address or location details
  description?: string; // Appointment description
  urgency?: string; // 'normal' | 'high' | 'low'
  createdAt: Date;
  updatedAt: Date;
}

// define schema for embedded staff note subdocument
const StaffNoteSchema = new Schema<IStaffNote>(
  {
    text: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

const inquirySchema = new mongoose.Schema({
  subject: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: false,
    default: 'General'
  },
  message: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['open', 'pending', 'in-progress', 'scheduled', 'resolved', 'canceled', 'closed'],
    default: 'open',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  username: {
    type: String,
    required: true,
  },
  barangayID: {
    type: String,
    required: true,
    trim: true,
    set: (v: any) => require('../utils/validation').normalizeBarangayID(v),
    validate: {
      validator: (v: any) => require('../utils/validation').validateBarangayID(v),
      message: 'Invalid barangayID format'
    }
  },
  // Store resident contact info for appointment details display
  residentName: {
    type: String,
  },
  residentEmail: {
    type: String,
  },
  residentPhone: {
    type: String,
  },
  assignedTo: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  assignedRole: {
    type: String,
    enum: ['admin', 'staff', 'resident'],
    required: false,
  },
  responses: [{
    text: {
      type: String,
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Store display author name and role for client rendering convenience
    authorName: { type: String },
    authorRole: { type: String },
    attachments: [{
      filename: { type: String },
      path: { type: String },
      url: { type: String },
      contentType: { type: String },
      size: { type: Number },
      uploadedAt: { type: Date, default: Date.now }
    }],
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }],
  attachments: [{
    filename: { type: String },
    path: { type: String },
    url: { type: String },
    contentType: { type: String },
    size: { type: Number },
    uploadedAt: { type: Date, default: Date.now }
  }],
  // Preferred appointment dates (optional) - store as YYYY-MM-DD strings
  appointmentDates: [{ type: String }],
  // Actual scheduled appointment slots added by staff
  scheduledDates: [{ date: String, startTime: String, endTime: String }],
  scheduledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancellationReason: { type: String },
  canceledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  canceledAt: { type: Date },
  // Internal staff-only notes (embedded subdocuments)
  staffNotes: { type: [StaffNoteSchema], default: [] },
  // Messages that staff can send to the resident (resident-visible when flagged)
  messages: [{
    text: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
    visibleToResident: { type: Boolean, default: true }
  }],
  // Quick appointment fields
  recipients: [{ type: String }], // Array of usernames for multi-recipient appointments
  recipientEmails: [{ type: String }], // Array of emails for multi-recipient appointments
  quick_appointment_type: { type: String }, // 'single' | 'multiple' | 'mass'
  locationType: { type: String }, // 'on-site' | 'virtual' | 'hybrid'
  location: { type: String }, // Address or location details
  description: { type: String }, // Appointment description
  urgency: { type: String }, // 'normal' | 'high' | 'low'
}, {
  timestamps: true,
});


// Guard against recompilation in dev
export const Inquiry: mongoose.Model<IInquiry> = (mongoose.models && (mongoose.models as any).Inquiry)
  ? (mongoose.models as any).Inquiry as mongoose.Model<IInquiry>
  : mongoose.model<IInquiry>('Inquiry', inquirySchema);
