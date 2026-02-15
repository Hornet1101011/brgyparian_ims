const mongoose = require('mongoose');

// SendGrid-only email configuration schema
const sendgridConfigSchema = new mongoose.Schema({
  enabled: { 
    type: Boolean, 
    default: false,
    description: 'Whether email sending is enabled via SendGrid'
  },
  provider: { 
    type: String, 
    enum: ['sendgrid'],
    default: 'sendgrid',
    immutable: true,
    description: 'Email provider (SendGrid only)'
  },
  sendgrid: {
    apiKey: { 
      type: String,
      description: 'SendGrid API key for authentication'
    },
    fromEmail: { 
      type: String,
      description: 'Default sender email address'
    },
    fromName: { 
      type: String, 
      default: 'Barangay System',
      description: 'Default sender display name'
    }
  },
  updatedAt: { 
    type: Date, 
    default: Date.now,
    description: 'Timestamp of last configuration update'
  }
}, { _id: false });

const systemSettingSchema = new mongoose.Schema({
  siteName: { type: String },
  barangayName: { type: String },
  barangayAddress: { type: String },
  contactEmail: { type: String },
  contactPhone: { type: String },
  maintenanceMode: { type: Boolean, default: false },
  allowRegistrations: { type: Boolean, default: true },
  requireEmailVerification: { type: Boolean, default: true },
  maxDocumentRequestsPerUser: { type: Number, default: 5 },
  documentProcessingDays: { type: Number, default: 3 },
  // Rate-limit / abuse prevention: whether multiple accounts from same IP are allowed
  allowMultipleAccountsPerIP: { type: Boolean, default: false },
  // Maximum number of accounts allowed per IP when the above is enabled
  maxAccountsPerIP: { type: Number, default: 1 },
  systemNotice: { type: String },
  // Email dry-run mode: simulate email sends without calling provider
  // When enabled, emails are logged but not actually sent
  dryRunMode: { type: Boolean, default: false },
  // SendGrid-only email configuration
  email: { 
    type: sendgridConfigSchema, 
    default: () => ({
      enabled: false,
      provider: 'sendgrid',
      sendgrid: {
        apiKey: '',
        fromEmail: '',
        fromName: 'Barangay System'
      },
      updatedAt: new Date()
    })
  },
  
  // Settings locking mechanism for concurrent edit prevention
  settingsLock: {
    isLocked: { type: Boolean, default: false },
    lockedBy: { type: String }, // Admin user ID who acquired the lock
    lockedAt: { type: Date }, // Timestamp when lock was acquired
    lockOwnerName: { type: String }, // Display name of lock owner for UI
  },
}, { timestamps: true });

// Prevent OverwriteModelError when this file is required multiple times (e.g. ts-node/nodemon)
module.exports = mongoose.models && mongoose.models.SystemSetting
  ? mongoose.model('SystemSetting')
  : mongoose.model('SystemSetting', systemSettingSchema);
