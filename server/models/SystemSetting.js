const mongoose = require('mongoose');

// Base schema for all system settings documents
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
  
  // Settings locking mechanism for concurrent edit prevention
  settingsLock: {
    isLocked: { type: Boolean, default: false },
    lockedBy: { type: String }, // Admin user ID who acquired the lock
    lockedAt: { type: Date }, // Timestamp when lock was acquired
    lockOwnerName: { type: String }, // Display name of lock owner for UI
  },
  
  // Document type discriminator - allows multiple document types in same collection
  docType: {
    type: String,
    enum: ['general', 'sendgrid_config'],
    default: 'general',
    index: true
  }
}, { timestamps: true });

// SendGrid-specific schema (embedded in main document)
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
  apiKey: { 
    type: String,
    default: '',
    description: 'SendGrid API key for authentication'
  },
  fromEmail: { 
    type: String,
    default: '',
    description: 'Default sender email address'
  },
  fromName: { 
    type: String, 
    default: 'Barangay System',
    description: 'Default sender display name'
  },
  updatedAt: { 
    type: Date, 
    default: Date.now,
    description: 'Timestamp of last configuration update'
  }
}, { _id: false });

// Add SendGrid config field to schema (for legacy support/migration)
systemSettingSchema.add({
  email: {
    type: sendgridConfigSchema,
    default: () => ({
      enabled: false,
      provider: 'sendgrid',
      apiKey: '',
      fromEmail: '',
      fromName: 'Barangay System',
      updatedAt: new Date()
    })
  }
});

// Add SendGrid-specific fields to schema (for dedicated SendGrid doc)
systemSettingSchema.add({
  sendgridConfig: {
    type: sendgridConfigSchema,
    description: 'SendGrid configuration (for dedicated sendgrid_config document type)'
  }
});

// Prevent OverwriteModelError when this file is required multiple times (e.g. ts-node/nodemon)
const model = mongoose.models && mongoose.models.SystemSetting
  ? mongoose.model('SystemSetting')
  : mongoose.model('SystemSetting', systemSettingSchema);

// Export both the model and a helper to get/create SendGrid config
module.exports = model;
module.exports.SystemSetting = model;
module.exports.getSendGridConfig = async function() {
  return await model.findOne({ docType: 'sendgrid_config' });
};
module.exports.setSendGridConfig = async function(configData) {
  // Upsert: find existing sendgrid_config document, or create new one
  const updated = await model.findOneAndUpdate(
    { docType: 'sendgrid_config' },
    {
      $set: {
        docType: 'sendgrid_config',
        sendgridConfig: {
          enabled: configData.enabled !== undefined ? configData.enabled : false,
          provider: 'sendgrid',
          apiKey: configData.apiKey || '',
          fromEmail: configData.fromEmail || '',
          fromName: configData.fromName || 'Barangay System',
          updatedAt: new Date()
        }
      }
    },
    {
      new: true,
      upsert: true, // Create if doesn't exist
      setDefaultsOnInsert: true
    }
  );
  return updated;
};
module.exports.deleteSendGridConfig = async function() {
  return await model.deleteOne({ docType: 'sendgrid_config' });
};
