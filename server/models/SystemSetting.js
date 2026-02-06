const mongoose = require('mongoose');

const smtpSchema = new mongoose.Schema({
  host: { type: String },
  port: { type: Number },
  secure: { type: Boolean },
  user: { type: String },
  encryptedPassword: { type: String },
  fromName: { type: String },
});

const gmailSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  gmailAddress: { type: String },
  useAppPassword: { type: Boolean, default: true },
  appPassword: { type: String }, // Gmail app password (plain text)
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
  smtp: { type: smtpSchema, default: {} },
  gmail: { type: gmailSchema, default: {} },
}, { timestamps: true });

// Prevent OverwriteModelError when this file is required multiple times (e.g. ts-node/nodemon)
module.exports = mongoose.models && mongoose.models.SystemSetting
  ? mongoose.model('SystemSetting')
  : mongoose.model('SystemSetting', systemSettingSchema);
