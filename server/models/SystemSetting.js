const mongoose = require('mongoose');

// Mailtrap provider schema
const mailtrapSchema = new mongoose.Schema({
  host: { type: String },
  port: { type: Number },
  secure: { type: Boolean }, // TLS/SSL
  user: { type: String },
  password: { type: String }, // Plain text password for SMTP
  fromName: { type: String, default: 'Barangay System' },
  fromEmail: { type: String }, // Sender email address
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false });

// SendGrid provider schema
const sendgridSchema = new mongoose.Schema({
  apiKey: { type: String }, // SendGrid API key
  fromName: { type: String, default: 'Barangay System' },
  fromEmail: { type: String }, // Sender email address
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false });

// Gmail provider schema
const gmailProviderSchema = new mongoose.Schema({
  host: { type: String },
  port: { type: Number },
  secure: { type: Boolean }, // TLS/SSL
  user: { type: String },
  password: { type: String }, // Gmail app password
  fromName: { type: String, default: 'Barangay System' },
  fromEmail: { type: String }, // Sender email address
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false });

// Unified SMTP configuration with support for multiple providers
const smtpSchema = new mongoose.Schema({
  // Active provider selection
  activeProvider: { 
    type: String, 
    enum: ['mailtrap', 'sendgrid', 'gmail'], 
    default: 'mailtrap'
  },
  enabled: { type: Boolean, default: false },
  
  // Provider-specific configurations
  mailtrap: { type: mailtrapSchema, default: {} },
  sendgrid: { type: sendgridSchema, default: {} },
  gmail: { type: gmailProviderSchema, default: {} },
  
  // Metadata
  testEmailSent: { type: Date },
  testEmailStatus: { type: String }, // 'success', 'failed', 'pending'
  // Health check status
  lastHealthCheckAt: { type: Date }, // Timestamp of last health check
  lastHealthStatus: { type: String, enum: ['ok', 'warning', 'failed'], default: null }, // 'ok', 'warning', or 'failed'
  lastHealthCheckError: { type: String }, // Error message from last failed check
  
  // Deprecated fields (kept for backward compatibility with old format)
  provider: { 
    type: String, 
    enum: ['gmail', 'mailtrap', 'sendgrid', 'aws-ses', 'custom'], 
    default: null // Will be null for new installations
  },
  host: { type: String },
  port: { type: Number },
  secure: { type: Boolean },
  user: { type: String },
  password: { type: String },
  encryptedPassword: { type: String },
  fromName: { type: String },
  fromEmail: { type: String },
  gmailAppPassword: { type: String },
  gmailAddress: { type: String },
  sendgridApiKey: { type: String },
  awsAccessKeyId: { type: String },
  awsSecretAccessKey: { type: String },
  awsRegion: { type: String, default: 'us-east-1' },
}, { _id: false });

const gmailSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  gmailAddress: { type: String },
  useAppPassword: { type: Boolean, default: true },
  appPassword: { type: String }, // Gmail app password (plain text)
  password: { type: String }, // Regular Gmail password (fallback if app password not available)
  displayName: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

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
  // Unified email/SMTP settings with support for multiple providers
  email: { type: smtpSchema, default: {} },
  // Keep smtp and gmail for backwards compatibility (deprecated)
  smtp: { type: smtpSchema, default: {} },
  gmail: { type: gmailSchema, default: {} },
  
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
