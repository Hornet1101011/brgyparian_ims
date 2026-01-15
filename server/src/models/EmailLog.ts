import mongoose from 'mongoose';

const emailLogSchema = new mongoose.Schema({
  recipient: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  subject: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: String,
    enum: ['sent', 'failed'],
    required: true,
  },
  errorMessage: {
    type: String,
    default: null,
  },
  dateSent: {
    type: Date,
    default: Date.now,
  },
  // Additional metadata for debugging
  messageId: {
    type: String,
    default: null,
  },
  // Track email type for reporting
  emailType: {
    type: String,
    enum: ['password-reset', 'otp', 'document-notification', 'announcement', 'generic'],
    default: 'generic',
  },
  // For BCC emails, we store the primary recipient here and count in a separate field
  bccRecipientsCount: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

// Create index for querying logs by date
emailLogSchema.index({ dateSent: -1 });
// Create index for querying by recipient
emailLogSchema.index({ recipient: 1 });
// Create index for querying by status
emailLogSchema.index({ status: 1 });
// TTL index: automatically delete logs older than 90 days
emailLogSchema.index({ dateSent: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

// Guard against recompilation in dev
export const EmailLog: mongoose.Model<any> = (mongoose.models && (mongoose.models as any).EmailLog)
  ? (mongoose.models as any).EmailLog as mongoose.Model<any>
  : mongoose.model('EmailLog', emailLogSchema);
