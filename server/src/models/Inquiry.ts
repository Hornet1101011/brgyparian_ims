import mongoose, { Document } from 'mongoose';

export interface IInquiry extends Document {
  subject: string;
  message: string;
  type?: string;
  status: 'open' | 'in-progress' | 'resolved';
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
  createdAt: Date;
  updatedAt: Date;
}

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
    enum: ['open', 'in-progress', 'scheduled', 'resolved'],
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
}, {
  timestamps: true,
});

// Guard against recompilation in dev
export const Inquiry: mongoose.Model<IInquiry> = (mongoose.models && (mongoose.models as any).Inquiry)
  ? (mongoose.models as any).Inquiry as mongoose.Model<IInquiry>
  : mongoose.model<IInquiry>('Inquiry', inquirySchema);
