const mongoose = require('mongoose');

/**
 * SendGrid Configuration Model
 * Dedicated collection for SendGrid email configuration
 * Ensures only one SendGrid config document exists
 */

const sendGridConfigSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: false,
      description: 'Whether SendGrid email sending is enabled'
    },
    provider: {
      type: String,
      enum: ['sendgrid'],
      default: 'sendgrid',
      description: 'Email provider type'
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
    createdAt: {
      type: Date,
      default: Date.now,
      description: 'When config was created'
    },
    updatedAt: {
      type: Date,
      default: Date.now,
      description: 'When config was last updated'
    }
  },
  {
    collection: 'sendgrid',
    timestamps: true,
    strict: true
  }
);

// Prevent OverwriteModelError when this file is required multiple times
const model = mongoose.models && mongoose.models.SendGridConfig
  ? mongoose.model('SendGridConfig')
  : mongoose.model('SendGridConfig', sendGridConfigSchema);

// Export the model
module.exports = model;

/**
 * Helper method: Get SendGrid configuration
 * Returns the single SendGrid config document
 */
module.exports.getConfig = async function() {
  try {
    let config = await model.findOne().lean();
    
    if (!config) {
      console.log('[SendGridConfig] No config found, creating default');
      // Create default config if none exists
      config = await model.create({
        enabled: false,
        provider: 'sendgrid',
        apiKey: '',
        fromEmail: '',
        fromName: 'Barangay System'
      });
      console.log('[SendGridConfig] Default config created');
    }
    
    return config;
  } catch (err) {
    console.error('[SendGridConfig] Error getting config:', err.message);
    throw err;
  }
};

/**
 * Helper method: Save/update SendGrid configuration
 * Uses upsert to ensure only one document exists
 */
module.exports.saveConfig = async function(configData) {
  try {
    // Delete existing configs first to ensure only one
    await model.deleteMany({});
    
    // Create new config
    const saved = await model.create({
      enabled: configData.enabled !== undefined ? configData.enabled : false,
      provider: 'sendgrid',
      apiKey: configData.apiKey || '',
      fromEmail: configData.fromEmail || '',
      fromName: configData.fromName || 'Barangay System',
      updatedAt: new Date()
    });

    console.log('[SendGridConfig] Config saved successfully:', {
      enabled: saved.enabled,
      hasApiKey: !!saved.apiKey,
      fromEmail: saved.fromEmail,
      fromName: saved.fromName
    });

    return saved;
  } catch (err) {
    console.error('[SendGridConfig] Error saving config:', err.message);
    throw err;
  }
};

/**
 * Helper method: Delete SendGrid configuration
 */
module.exports.deleteConfig = async function() {
  try {
    const result = await model.deleteMany({});
    console.log('[SendGridConfig] Config deleted');
    return result;
  } catch (err) {
    console.error('[SendGridConfig] Error deleting config:', err.message);
    throw err;
  }
};

/**
 * Helper method: Initialize collection
 * Ensures collection exists and has at least one config
 */
module.exports.initialize = async function() {
  try {
    const count = await model.countDocuments();
    
    if (count === 0) {
      console.log('[SendGridConfig] Initializing SendGrid collection with default config');
      await model.create({
        enabled: false,
        provider: 'sendgrid',
        apiKey: '',
        fromEmail: '',
        fromName: 'Barangay System'
      });
    }
    
    console.log('[SendGridConfig] Collection initialized, document count:', count + (count === 0 ? 1 : 0));
  } catch (err) {
    console.error('[SendGridConfig] Error initializing collection:', err.message);
    throw err;
  }
};
