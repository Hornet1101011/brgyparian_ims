const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const isAdmin = require('../middleware/isAdmin');
const { encryptText, decryptText } = require('../utils/cryptoHelper');
const smtpHelper = require('../utils/smtpHelper');
const gmailHelper = require('../utils/gmailHelper');
const emailProviderHelper = require('../utils/emailProviderHelper');
const settingsLockHelper = require('../utils/settingsLockHelper');
const SystemSetting = require('../models/SystemSetting');
const PublicView = require('../models/PublicView');
const AuditLog = require('../models/AuditLog');
const { createRateLimiter } = require('../middleware/rateLimiter');
const VerificationRequest = require('../models/VerificationRequest');
const mongoose = require('mongoose');
const sse = require('../utils/sse');

// Simple validators
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Log requests to settings routes for debugging (method, url, timestamp, and user id if present)
router.use((req, res, next) => {
  try {
    const ts = new Date().toISOString();
    const userId = req.user && (req.user._id || req.user.id) ? (req.user._id || req.user.id) : 'anon';
    console.log(`[Settings API] ${ts} ${req.method} ${req.originalUrl} user=${userId}`);
  } catch (e) {
    console.error('Settings API logger error', e);
  }
  next();
});

/**
 * UNIFIED EMAIL CONFIGURATION ARCHITECTURE
 * ==========================================
 * 
 * Single Source of Truth: `smtp` field (renamed from SMTP-only to multi-provider storage)
 * 
 * All email providers (custom SMTP, Gmail, Mailtrap, SendGrid, AWS SES) store configuration in `smtp` field:
 * 
 * smtp: {
 *   enabled: boolean,
 *   provider: 'custom' | 'gmail' | 'mailtrap' | 'sendgrid' | 'aws-ses',
 *   fromName: string,
 *   fromEmail: string,
 *   
 *   // Custom SMTP fields
 *   host?: string,
 *   port?: number,
 *   user?: string,
 *   password?: string,    // Sensitive - always removed before sending to client
 *   encryptedPassword?: string,
 *   secure?: boolean,
 *   
 *   // Gmail fields
 *   gmailAddress?: string,
 *   gmailAppPassword?: string,  // Sensitive - always removed before sending to client
 *   
 *   // Mailtrap (uses generic user/password above)
 *   
 *   // SendGrid
 *   sendgridApiKey?: string,    // Sensitive - always removed before sending to client
 *   
 *   // AWS SES
 *   awsAccessKeyId?: string,    // Sensitive - always removed before sending to client
 *   awsSecretAccessKey?: string,  // Sensitive - always removed before sending to client
 *   awsRegion?: string,
 *   
 *   updatedAt?: Date
 * }
 * 
 * BACKWARD COMPATIBILITY
 * ======================
 * 
 * Legacy fields (maintained for migration purposes, READ-ONLY):
 * - `gmail`: Deprecated, use `smtp` instead. Preserved during reads but ignored during writes.
 * - `email`: Deprecated, use `smtp` instead. Preserved during reads but ignored during writes.
 * 
 * Migration Strategy:
 * 1. New writes always go to `smtp` field
 * 2. Reads from `gmail` or `email` are ignored (deprecated)
 * 3. Old data in `gmail`/`email` fields is NOT automatically cleaned up (for rollback safety)
 * 4. Admin should manually verify settings after upgrade
 * 
 * SANITIZATION POLICY
 * ====================
 * All sensitive credentials MUST be removed before sending to client:
 * - password (any provider)
 * - encryptedPassword
 * - gmailAppPassword
 * - sendgridApiKey
 * - awsAccessKeyId
 * - awsSecretAccessKey
 */

// Helper: Remove all sensitive credentials before sending to client
function sanitizeForClient(setting) {
  const s = setting.toObject ? setting.toObject() : { ...setting };
  
  // CANONICAL SOURCE: Sanitize smtp field (all providers stored here)
  if (s.smtp) {
    const sanitized = { ...s.smtp };
    // Remove ALL sensitive credential fields
    delete sanitized.password;              // Custom SMTP password
    delete sanitized.encryptedPassword;     // Custom SMTP encrypted password
    delete sanitized.gmailAppPassword;      // Gmail app password
    delete sanitized.sendgridApiKey;        // SendGrid API key
    delete sanitized.awsAccessKeyId;        // AWS access key
    delete sanitized.awsSecretAccessKey;    // AWS secret key
    s.smtp = sanitized;
  }
  
  // LEGACY FIELDS (READ-ONLY, Deprecated): Kept for backward compatibility only
  // These fields are no longer used for new writes, but preserved for old reads
  if (s.gmail) {
    // Keep only non-sensitive fields from legacy gmail object
    s.gmail = {
      enabled: s.gmail.enabled,
      gmailAddress: s.gmail.gmailAddress,
      displayName: s.gmail.displayName,
      useAppPassword: s.gmail.useAppPassword,
      // Explicitly DO NOT send: password, appPassword, encryptedPassword
    };
  }
  
  if (s.email) {
    // Keep only non-sensitive fields from legacy email object
    const sanitizedEmail = { ...s.email };
    // Remove all credential fields
    delete sanitizedEmail.password;
    delete sanitizedEmail.gmailAppPassword;
    delete sanitizedEmail.sendgridApiKey;
    delete sanitizedEmail.awsAccessKeyId;
    delete sanitizedEmail.awsSecretAccessKey;
    s.email = sanitizedEmail;
  }
  
  return s;
}

// GET /api/settings - Protected endpoint, requires authentication
router.get('/', requireAuth, isAdmin, async (req, res) => {
  try {
    let settings = await SystemSetting.findOne({ docType: { $ne: 'sendgrid_config' } }).lean();
    if (!settings) {
      // return default shape
      settings = new SystemSetting();
    }

    // Load SendGrid config from dedicated document
    const sendgridConfigDoc = await SystemSetting.getSendGridConfig();
    if (sendgridConfigDoc?.sendgridConfig) {
      // Map dedicated document structure to email field for frontend compatibility
      settings.email = {
        enabled: sendgridConfigDoc.sendgridConfig.enabled,
        provider: 'sendgrid',
        sendgrid: {
          apiKey: sendgridConfigDoc.sendgridConfig.apiKey,
          fromEmail: sendgridConfigDoc.sendgridConfig.fromEmail,
          fromName: sendgridConfigDoc.sendgridConfig.fromName
        },
        updatedAt: sendgridConfigDoc.sendgridConfig.updatedAt
      };
      console.log('[Settings GET] Loaded SendGrid config from dedicated document');
    }

    return res.json(sanitizeForClient(settings));
  } catch (err) {
    console.error('GET /api/settings error', err);
    return res.status(500).json({ message: 'Failed to load settings' });
  }
});

// Admin-only debug: return sanitized SMTP config (do NOT include encryptedPassword)
// Use this to verify what SMTP fields are stored in the DB without exposing secrets.
router.get('/smtp-debug', requireAuth, isAdmin, async (req, res) => {
  try {
    const settings = await SystemSetting.findOne().lean();
    if (!settings || !settings.smtp) return res.json({ smtp: null });
    return res.json({ smtp: smtpHelper.sanitizeSMTPConfig(settings.smtp) });
  } catch (err) {
    console.error('GET /api/admin/settings/smtp-debug error', err);
    return res.status(500).json({ message: 'Failed to read SMTP debug info' });
  }
});

// Validate numeric fields helper
function validateSettingsPayload(body) {
  const errors = [];
  if (body.contactEmail && !emailRegex.test(body.contactEmail)) errors.push('Invalid contactEmail');
  if (body.maxDocumentRequestsPerUser != null && !(Number(body.maxDocumentRequestsPerUser) > 0)) errors.push('maxDocumentRequestsPerUser must be > 0');
  if (body.documentProcessingDays != null && !(Number(body.documentProcessingDays) > 0)) errors.push('documentProcessingDays must be > 0');
  if (body.maxAccountsPerIP != null && !(Number(body.maxAccountsPerIP) > 0)) errors.push('maxAccountsPerIP must be > 0');
  return errors;
}

// Helper to record audit
async function recordAudit(userId, action, details, ip) {
  try {
    await AuditLog.create({ userId, action, details, ip });
  } catch (e) {
    console.error('Failed to write audit log', e);
  }
}

// Helper to sync public information to PublicView collection
// This caches barangay and contact info for fast unauthenticated access
async function syncToPublicView(systemSettings) {
  try {
    if (!systemSettings) return;
    
    const publicData = {
      siteName: systemSettings.siteName || '',
      barangayName: systemSettings.barangayName || '',
      barangayAddress: systemSettings.barangayAddress || '',
      contactEmail: systemSettings.contactEmail || '',
      contactPhone: systemSettings.contactPhone || '',
      systemNotice: systemSettings.systemNotice || '',
      lastSyncedAt: new Date(),
      isActive: true
    };
    
    // Upsert: update existing active record, or create new one
    const updated = await PublicView.findOneAndUpdate(
      { isActive: true },
      publicData,
      { new: true, upsert: true }
    );
    
    console.log('[PublicView] Synced public settings successfully');
    return updated;
  } catch (err) {
    console.error('[PublicView] Failed to sync public settings:', err);
    // Don't throw - allow settings to be saved even if PublicView sync fails
  }
}

// PUT /api/settings (full upsert) - Protected endpoint, requires authentication
router.put('/', requireAuth, isAdmin, async (req, res) => {
  try {
    const payload = req.body || {};
    const errors = validateSettingsPayload(payload);
    if (errors.length) return res.status(400).json({ message: 'Validation error', errors });

    // Set secure flag based on securityType
    // ssl -> secure: true (port 465)
    // tls -> secure: false (port 587, STARTTLS)
    // none -> secure: false (port 25, plain)
    if (payload.smtp && payload.smtp.securityType) {
      if (payload.smtp.securityType === 'ssl') {
        payload.smtp.secure = true;
        console.log('[Settings] Set SMTP secure=true for SSL');
      } else if (payload.smtp.securityType === 'tls' || payload.smtp.securityType === 'none') {
        payload.smtp.secure = false;
        console.log('[Settings] Set SMTP secure=false for', payload.smtp.securityType);
      }
    }

    // handle smtp password plaintext
    if (payload.smtp && payload.smtp.password) {
      if (!process.env.SETTINGS_ENCRYPTION_KEY) {
        return res.status(500).json({ message: 'Encryption key not configured' });
      }
      try {
        payload.smtp.encryptedPassword = encryptText(String(payload.smtp.password), process.env.SETTINGS_ENCRYPTION_KEY);
        console.log('[Settings] SMTP password encrypted');
      } catch (e) {
        console.error('Failed to encrypt smtp password', e);
        return res.status(500).json({ message: 'Failed to encrypt smtp password' });
      }
      delete payload.smtp.password;
    }

    // handle smtp app password encryption (Gmail with 2FA)
    if (payload.smtp && payload.smtp.appPassword) {
      if (!process.env.SETTINGS_ENCRYPTION_KEY) {
        return res.status(500).json({ message: 'Encryption key not configured' });
      }
      try {
        payload.smtp.appPassword = encryptText(String(payload.smtp.appPassword), process.env.SETTINGS_ENCRYPTION_KEY);
        console.log('[Settings] SMTP app password encrypted');
      } catch (e) {
        console.error('Failed to encrypt smtp app password', e);
        return res.status(500).json({ message: 'Failed to encrypt smtp app password' });
      }
    }

    // perform upsert
    const before = await SystemSetting.findOne().lean();
    const updated = await SystemSetting.findOneAndUpdate({}, payload, { new: true, upsert: true, setDefaultsOnInsert: true });

    // compute a simple diff for audit
    const diff = { before, after: updated.toObject ? updated.toObject() : updated };
    await recordAudit(req.user?._id, 'update_settings', diff, req.ip || req.headers['x-forwarded-for']);

    // Sync public information to PublicView collection for fast unauthenticated access
    await syncToPublicView(updated);

    // If enableVerifications was turned OFF by this update, perform cleanup of pending verification requests
    try {
      const beforeEnabled = before && typeof before.enableVerifications !== 'undefined' ? !!before.enableVerifications : true;
      const afterEnabled = updated && typeof updated.enableVerifications !== 'undefined' ? !!updated.enableVerifications : true;
      if (beforeEnabled && !afterEnabled) {
        console.log('Settings: enableVerifications set to false — cleaning up pending verification requests');
        try {
          const db = (mongoose.connection && mongoose.connection.db) ? mongoose.connection.db : null;
          const mongodb = require('mongodb');
          const GridFSBucket = mongodb.GridFSBucket;
          const bucket = db ? new GridFSBucket(db, { bucketName: 'verificationRequests' }) : null;
          const pending = await VerificationRequest.find({ status: 'pending' }).lean();
          for (const vr of pending) {
            // delete grid files if present
            if (vr.gridFileIds && Array.isArray(vr.gridFileIds) && bucket) {
              for (const fid of vr.gridFileIds) {
                try {
                  const oid = typeof fid === 'string' ? new mongodb.ObjectId(fid) : fid;
                  await bucket.delete(oid);
                } catch (e) {
                  console.warn('Failed to delete GridFS file during settings disable cleanup', fid, e && e.message);
                }
              }
            }
            try {
              await VerificationRequest.deleteOne({ _id: vr._id });
            } catch (e) {
              console.warn('Failed to delete verification request during settings disable cleanup', vr._id, e && e.message);
            }
            // notify owner via SSE that their request was removed
            try {
              if (vr.userId) sse.sendToUser(String(vr.userId), 'verification-request-deleted', { requestId: String(vr._id) });
            } catch (e) {
              console.warn('Failed to send SSE notification during settings disable cleanup', e && e.message);
            }
          }
        } catch (cleanupErr) {
          console.error('Error during verification cleanup after disable:', cleanupErr && cleanupErr.message);
        }
      }
    } catch (e) {
      console.warn('Error evaluating enableVerifications change for cleanup', e && e.message);
    }

    return res.json(sanitizeForClient(updated));
  } catch (err) {
    console.error('PUT /api/settings error', err);
    return res.status(500).json({ message: 'Failed to save settings' });
  }
});

// PATCH /api/settings (partial update) - Protected endpoint, requires authentication
// PATCH /api/settings (partial update) - Protected endpoint, requires authentication
router.patch('/', requireAuth, isAdmin, async (req, res) => {
  try {
    console.log('[Settings PATCH] Handler called');
    let payload = req.body || {};
    
    // Defensive: Recursively remove all _id fields from payload
    const removeAllIds = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(removeAllIds);
      const cleaned = { ...obj };
      delete cleaned._id;
      for (const key in cleaned) {
        if (cleaned[key] && typeof cleaned[key] === 'object') {
          cleaned[key] = removeAllIds(cleaned[key]);
        }
      }
      return cleaned;
    };
    
    payload = removeAllIds(payload);
    
    console.log('[Settings PATCH] Received payload keys:', Object.keys(payload));

    const errors = validateSettingsPayload(payload);
    if (errors.length) {
      console.error('[Settings PATCH] Validation errors:', errors);
      return res.status(400).json({ message: 'Validation error', errors });
    }

    // Build MongoDB update operations
    const updateOps = { $set: {}, $unset: {} };
    
    // Copy simple fields (excluding email, smtp, gmail)
    for (const [key, value] of Object.entries(payload)) {
      if (key !== 'email' && key !== 'smtp' && key !== 'gmail' && key !== 'emailSettings') {
        updateOps.$set[key] = value;
      }
    }

    // ===== SENDGRID-ONLY EMAIL CONFIGURATION =====
    if (payload.email && payload.email.provider === 'sendgrid') {
      const emailData = payload.email;
      
      console.log('[Settings PATCH - SendGrid] Email config update request:', {
        enabled: emailData.enabled,
        provider: emailData.provider,
        fromEmail: emailData.fromEmail,
        fromName: emailData.fromName,
        hasApiKey: !!emailData.sendgrid?.apiKey || !!emailData.apiKey
      });

      // Helper to detect masked values
      const isMaskedValue = (val) => {
        return typeof val === 'string' && val.length > 0 && /^\*+$/.test(val);
      };

      // Prepare SendGrid config data
      const sendgridData = emailData.sendgrid || emailData;
      let apiKey = sendgridData.apiKey;
      
      // Handle API key masking
      if (isMaskedValue(apiKey)) {
        console.log('[Settings PATCH - SendGrid] apiKey is masked - preserving existing value');
        // Load existing key from database to preserve it
        const existingConfig = await SystemSetting.getSendGridConfig();
        if (existingConfig?.sendgridConfig?.apiKey) {
          apiKey = existingConfig.sendgridConfig.apiKey;
        } else {
          apiKey = '';
        }
      }

      // Validate if enabled: require API key
      if (emailData.enabled && !apiKey) {
        console.warn('[Settings PATCH - SendGrid] Cannot enable SendGrid without API key');
        return res.status(400).json({
          success: false,
          message: 'SendGrid API key is required when enabling email',
          error: 'email.apiKey is required'
        });
      }

      // Save to dedicated SendGrid config document
      try {
        const savedConfig = await SystemSetting.setSendGridConfig({
          enabled: !!emailData.enabled,
          apiKey: apiKey || '',
          fromEmail: sendgridData.fromEmail || '',
          fromName: sendgridData.fromName || 'Barangay System'
        });

        console.log('[Settings PATCH - SendGrid] Saved to dedicated document:', {
          documentId: savedConfig._id,
          docType: savedConfig.docType,
          enabled: savedConfig.sendgridConfig.enabled,
          hasApiKey: !!savedConfig.sendgridConfig.apiKey,
          fromEmail: savedConfig.sendgridConfig.fromEmail,
          updatedAt: savedConfig.sendgridConfig.updatedAt
        });
      } catch (sgError) {
        console.error('[Settings PATCH - SendGrid] Failed to save SendGrid config:', sgError);
        return res.status(500).json({
          success: false,
          message: 'Failed to save SendGrid configuration',
          error: sgError.message
        });
      }

      // IMPORTANT: Remove email from main settings update ops since we're using dedicated document
      delete updateOps.$set['email'];
      delete updateOps.$set['email.enabled'];
      delete updateOps.$set['email.provider'];
      delete updateOps.$set['email.sendgrid'];
      delete updateOps.$set['email.sendgrid.apiKey'];
      delete updateOps.$set['email.sendgrid.fromEmail'];
      delete updateOps.$set['email.sendgrid.fromName'];
      delete updateOps.$set['email.updatedAt'];
      
      // Mark legacy fields for removal
      updateOps.$unset['smtp'] = '';
      updateOps.$unset['gmail'] = '';
      updateOps.$unset['emailSettings'] = '';
      updateOps.$unset['email'] = ''; // Remove old email field from general settings
      console.log('[Settings PATCH] Marked legacy fields for removal: smtp, gmail, emailSettings, email');
    }

    // Get before state for audit
    const before = await SystemSetting.findOne().lean();

    // Execute MongoDB update with $set and $unset
    console.log('[Settings PATCH] Executing MongoDB update with:', {
      '$set fields': Object.keys(updateOps.$set),
      '$unset fields': Object.keys(updateOps.$unset),
      totalSetFields: Object.keys(updateOps.$set).length,
      totalUnsetFields: Object.keys(updateOps.$unset).length
    });

    const updated = await SystemSetting.findOneAndUpdate({}, updateOps, { 
      new: true, 
      upsert: true, 
      setDefaultsOnInsert: true 
    });

    // Verify SendGrid config was saved (check dedicated document)
    if (payload.email && payload.email.provider === 'sendgrid') {
      const savedSGConfig = await SystemSetting.getSendGridConfig();
      console.log('[Settings PATCH - SendGrid] CONFIRMATION: SendGrid config saved to dedicated document:', {
        hasConfig: !!savedSGConfig,
        enabled: savedSGConfig?.sendgridConfig?.enabled,
        hasApiKey: !!savedSGConfig?.sendgridConfig?.apiKey,
        fromEmail: savedSGConfig?.sendgridConfig?.fromEmail,
        fromName: savedSGConfig?.sendgridConfig?.fromName,
        updatedAt: savedSGConfig?.sendgridConfig?.updatedAt
      });
    }

    // Verify legacy fields were removed
    if (!updated?.smtp && !updated?.gmail) {
      console.log('[Settings PATCH] CONFIRMATION: Legacy fields successfully removed from DB (smtp, gmail)');
    } else {
      console.warn('[Settings PATCH] WARNING: Legacy fields still present in DB:', {
        hasSMTP: !!updated?.smtp,
        hasGmail: !!updated?.gmail
      });
    }

    // Record audit trail
    const diff = { before, after: updated.toObject ? updated.toObject() : updated };
    await recordAudit(req.user?._id, 'patch_settings', diff, req.ip || req.headers['x-forwarded-for']);
    
    // Sync public information
    await syncToPublicView(updated);
    
    // Cleanup verification requests if needed
    try {
      const beforeEnabled = before && typeof before.enableVerifications !== 'undefined' ? !!before.enableVerifications : true;
      const afterEnabled = updated && typeof updated.enableVerifications !== 'undefined' ? !!updated.enableVerifications : true;
      if (beforeEnabled && !afterEnabled) {
        console.log('Settings PATCH: enableVerifications set to false — cleaning up pending verification requests');
        try {
          const db = (mongoose.connection && mongoose.connection.db) ? mongoose.connection.db : null;
          const mongodb = require('mongodb');
          const GridFSBucket = mongodb.GridFSBucket;
          const bucket = db ? new GridFSBucket(db, { bucketName: 'verificationRequests' }) : null;
          const pending = await VerificationRequest.find({ status: 'pending' }).lean();
          for (const vr of pending) {
            if (vr.gridFileIds && Array.isArray(vr.gridFileIds) && bucket) {
              for (const fid of vr.gridFileIds) {
                try {
                  const oid = typeof fid === 'string' ? new mongodb.ObjectId(fid) : fid;
                  await bucket.delete(oid);
                } catch (e) {
                  console.warn('Failed to delete GridFS file during settings patch disable cleanup', fid, e && e.message);
                }
              }
            }
            try {
              await VerificationRequest.deleteOne({ _id: vr._id });
            } catch (e) {
              console.warn('Failed to delete verification request during settings patch disable cleanup', vr._id, e && e.message);
            }
            try {
              if (vr.userId) sse.sendToUser(String(vr.userId), 'verification-request-deleted', { requestId: String(vr._id) });
            } catch (e) {
              console.warn('Failed to send SSE notification during settings patch disable cleanup', e && e.message);
            }
          }
        } catch (cleanupErr) {
          console.error('Error during verification cleanup after patch disable:', cleanupErr && cleanupErr.message);
        }
      }
    } catch (e) {
      console.warn('Error evaluating enableVerifications change for patch cleanup', e && e.message);
    }

    return res.json(sanitizeForClient(updated));
  } catch (err) {
    console.error('PATCH /api/settings error:', {
      message: err && err.message,
      stack: err && err.stack,
      name: err && err.name,
    });
    return res.status(500).json({ message: 'Failed to update settings', error: err && err.message });
  }
});

// POST /api/settings/test-smtp - Send test email to verify SMTP configuration
// Protected: requires authentication and admin privileges
router.post('/test-smtp', requireAuth, isAdmin, async (req, res) => {
  try {
    const { to } = req.body || {};
    const settings = await SystemSetting.findOne().lean();

    if (!settings) {
      return res.status(400).json({ 
        success: false, 
        message: 'System settings not found',
        error: 'No settings configured in database'
      });
    }

    // CHECK 1: Verify email sending is not disabled
    if (!settings.email || !settings.email.enabled) {
      console.log('[SMTP Test] Email sending is disabled - rejecting test');
      return res.status(400).json({ 
        success: false,
        provider: 'custom',
        message: 'Email sending is currently disabled',
        error: 'Master email sending switch is disabled. Enable "Email Sending" in Email Behavior Control.',
        validationFailure: 'EMAIL_SENDING_DISABLED'
      });
    }

    // CHECK 2: Verify Custom SMTP provider is configured
    if (!settings.smtp || !settings.smtp.provider || settings.smtp.provider !== 'custom') {
      return res.status(400).json({ 
        success: false,
        message: 'Custom SMTP provider not selected',
        error: 'Custom SMTP is not the active email provider. Select Custom SMTP in Email Settings first.'
      });
    }

    // CHECK 3: Validate provider configuration completeness
    const validation = validateProviderConfiguration('custom', settings.smtp);
    if (!validation.isValid) {
      console.log('[SMTP Test] Configuration validation failed:', validation);
      return res.status(400).json({ 
        success: false,
        provider: 'custom',
        message: 'Custom SMTP configuration incomplete',
        error: `Missing required fields: ${validation.missingFields.join(', ')}`,
        missingFields: validation.missingFields,
        hint: validation.hint,
        validationFailure: 'INCOMPLETE_PROVIDER_CONFIG'
      });
    }

    // Default recipient: provided email > site contact email > admin email
    const recipient = to || settings.contactEmail || (req.user?.email) || null;
    if (!recipient) {
      return res.status(400).json({ 
        success: false,
        provider: 'custom',
        message: 'No recipient email provided',
        error: 'Test email address is required. Provide contact email in System Settings or pass "to" field.'
      });
    }

    try {
      console.log('[SMTP Test] Starting test email send to:', recipient);
      const result = await smtpHelper.sendTestEmail(settings.smtp, {
        to: recipient,
        siteInfo: {
          siteName: settings.siteName,
          contactEmail: settings.contactEmail
        }
      });

      console.log('[SMTP Test] Success - sent to:', recipient, 'MessageId:', result.messageId);
      return res.json({
        success: true,
        provider: 'custom',
        message: 'Test email sent successfully',
        recipient,
        messageId: result.messageId || null,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      const message = err.message || 'Failed to send test email';
      console.error('[SMTP Test] Failed:', message, err);
      
      // Provide provider-specific error hints
      let hint = 'Custom SMTP Error: ';
      if (message.includes('ENOTFOUND') || message.includes('EHOSTUNREACH')) {
        hint += 'DNS resolution failed. Verify SMTP hostname is correct and DNS is accessible.';
      } else if (message.includes('ECONNREFUSED')) {
        hint += 'Connection refused. Verify SMTP port is correct (587 for TLS, 465 for SSL) and server is listening.';
      } else if (message.includes('auth') || message.includes('AUTH') || message.includes('EAUTH')) {
        hint += 'Authentication failed. Verify username and password are correct. Check if credentials have special characters that need URL encoding.';
      } else if (message.includes('TLS') || message.includes('SSL') || message.includes('certificate')) {
        hint += 'TLS/SSL error. Verify certificate validation settings or try different SMTP port. Some servers require secure=true, others secure=false.';
      } else if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
        hint += 'Connection timeout. Verify SMTP server is online and network connectivity is good. Try increasing timeout or checking firewall rules.';
      } else {
        hint += 'Check SMTP server logs for detailed error information. Verify all credentials and settings are correct.';
      }

      return res.status(500).json({ 
        success: false,
        provider: 'custom',
        message: 'Failed to send test email',
        error: message,
        hint,
        recipient
      });
    }
  } catch (err) {
    console.error('POST /api/settings/test-smtp error:', err.message);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: err.message
    });
  }
});

// GET /api/settings/public - Public endpoint for login page and unauthenticated access
// Returns only public-facing system settings (no sensitive data)
// Fetches from PublicView collection for optimal performance (no auth required)
router.get('/public', async (req, res) => {
  try {
    console.log('[DEBUG] GET /api/settings/public called');
    
    // Try to fetch from PublicView collection (cached public data)
    let publicView = await PublicView.findOne({ isActive: true }).lean();
    
    if (publicView) {
      console.log('[DEBUG] PublicView found in cache, returning cached data');
      return res.json({
        siteName: publicView.siteName || '',
        barangayName: publicView.barangayName || '',
        barangayAddress: publicView.barangayAddress || '',
        contactEmail: publicView.contactEmail || '',
        contactPhone: publicView.contactPhone || '',
        systemNotice: publicView.systemNotice || ''
      });
    }
    
    // Fallback: if PublicView doesn't exist, fetch from SystemSetting and create PublicView
    console.log('[DEBUG] PublicView not found, fetching from SystemSetting and creating cache');
    let settings = await SystemSetting.findOne().lean();
    
    if (!settings) {
      // Return minimal default shape
      console.log('[DEBUG] No settings in DB, returning defaults');
      settings = {
        siteName: 'Barangay Information System',
        barangayName: '',
        barangayAddress: '',
        contactEmail: '',
        contactPhone: '',
        systemNotice: ''
      };
    }
    
    // Create PublicView cache from current SystemSetting
    try {
      await syncToPublicView(settings);
      console.log('[DEBUG] Created PublicView cache');
    } catch (syncErr) {
      console.warn('[DEBUG] Failed to create PublicView cache (not critical):', syncErr && syncErr.message);
    }
    
    // Return only public-facing fields (sanitize sensitive data)
    const publicSettings = {
      siteName: settings.siteName || '',
      barangayName: settings.barangayName || '',
      barangayAddress: settings.barangayAddress || '',
      contactEmail: settings.contactEmail || '',
      contactPhone: settings.contactPhone || '',
      systemNotice: settings.systemNotice || ''
    };
    
    console.log('[DEBUG] Returning public settings');
    return res.json(publicSettings);
  } catch (err) {
    console.error('GET /api/settings/public error', err);
    return res.status(500).json({ message: 'Failed to load public settings' });
  }
});

// GET /api/settings/public/barangay-info - Returns barangay information as carousel items
router.get('/public/barangay-info', async (req, res) => {
  try {
    console.log('[DEBUG] GET /api/settings/public/barangay-info called');
    
    // Fetch from PublicView collection
    let publicView = await PublicView.findOne({ isActive: true }).lean();
    
    if (!publicView) {
      // Fallback to SystemSetting
      publicView = await SystemSetting.findOne().lean();
    }
    
    if (!publicView) {
      console.log('[DEBUG] No barangay info found, returning empty array');
      return res.json([]);
    }
    
    // Format as carousel items - one card per information type
    const barangayInfoItems = [];
    
    if (publicView.siteName) {
      barangayInfoItems.push({
        _id: 'site-name',
        label: 'System Name',
        value: publicView.siteName,
        icon: 'home',
        type: 'barangay-info'
      });
    }
    
    if (publicView.barangayName) {
      barangayInfoItems.push({
        _id: 'barangay-name',
        label: 'Barangay Name',
        value: publicView.barangayName,
        icon: 'environment',
        type: 'barangay-info'
      });
    }
    
    if (publicView.barangayAddress) {
      barangayInfoItems.push({
        _id: 'barangay-address',
        label: 'Address',
        value: publicView.barangayAddress,
        icon: 'map',
        type: 'barangay-info'
      });
    }
    
    // If no info available, return array with placeholder
    if (barangayInfoItems.length === 0) {
      return res.json([{
        _id: 'placeholder',
        label: 'Barangay Information',
        value: 'No barangay information configured',
        icon: 'info',
        type: 'barangay-info',
        isPlaceholder: true
      }]);
    }
    
    console.log(`[DEBUG] Returning ${barangayInfoItems.length} barangay info items`);
    return res.json(barangayInfoItems);
  } catch (err) {
    console.error('GET /api/settings/public/barangay-info error', err);
    return res.status(500).json({ message: 'Failed to load barangay info' });
  }
});

// GET /api/settings/public/contact-info - Returns contact information as carousel items
router.get('/public/contact-info', async (req, res) => {
  try {
    console.log('[DEBUG] GET /api/settings/public/contact-info called');
    
    // Fetch from PublicView collection
    let publicView = await PublicView.findOne({ isActive: true }).lean();
    
    if (!publicView) {
      // Fallback to SystemSetting
      publicView = await SystemSetting.findOne().lean();
    }
    
    if (!publicView) {
      console.log('[DEBUG] No contact info found, returning empty array');
      return res.json([]);
    }
    
    // Format as carousel items - one card per contact method
    const contactInfoItems = [];
    
    // Validate email format
    const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    // Validate phone format (7+ digits)
    const isValidPhone = (phone) => /^[\d\s\-\+\(\)]+$/.test(phone) && phone.replace(/\D/g, '').length >= 7;
    
    if (publicView.contactEmail && isValidEmail(publicView.contactEmail)) {
      contactInfoItems.push({
        _id: 'contact-email',
        label: 'Email Address',
        value: publicView.contactEmail,
        icon: 'mail',
        type: 'contact-info',
        contactType: 'email',
        link: `mailto:${publicView.contactEmail}`
      });
    }
    
    if (publicView.contactPhone && isValidPhone(publicView.contactPhone)) {
      contactInfoItems.push({
        _id: 'contact-phone',
        label: 'Phone Number',
        value: publicView.contactPhone,
        icon: 'phone',
        type: 'contact-info',
        contactType: 'phone',
        link: `tel:${publicView.contactPhone}`
      });
    }
    
    // If no contact info available, return array with placeholder
    if (contactInfoItems.length === 0) {
      return res.json([{
        _id: 'placeholder',
        label: 'Contact Information',
        value: 'No contact information configured',
        icon: 'info',
        type: 'contact-info',
        isPlaceholder: true
      }]);
    }
    
    console.log(`[DEBUG] Returning ${contactInfoItems.length} contact info items`);
    return res.json(contactInfoItems);
  } catch (err) {
    console.error('GET /api/settings/public/contact-info error', err);
    return res.status(500).json({ message: 'Failed to load contact info' });
  }
});

// GET /api/settings/email/health - Get email provider health status
router.get('/email/health', requireAuth, isAdmin, async (req, res) => {
  try {
    const settings = await SystemSetting.findOne().lean();
    
    if (!settings || !settings.smtp || !settings.smtp.enabled) {
      return res.json({
        status: 'warning',
        message: 'Email provider not configured or disabled',
        provider: null,
        lastCheckAt: null,
        lastStatus: null,
        lastError: null,
        needsCheck: true
      });
    }

    const { smtp } = settings;
    const healthStatus = {
      status: smtp.lastHealthStatus || 'unknown',
      message: getHealthStatusMessage(smtp.lastHealthStatus),
      provider: smtp.provider,
      lastCheckAt: smtp.lastHealthCheckAt,
      lastError: smtp.lastHealthCheckError || null,
      needsCheck: !smtp.lastHealthCheckAt || (Date.now() - smtp.lastHealthCheckAt.getTime()) > 3600000 // 1 hour
    };

    console.log('[Settings] Email health status retrieved:', {
      provider: smtp.provider,
      status: healthStatus.status,
      lastCheckAt: smtp.lastHealthCheckAt,
      needsCheck: healthStatus.needsCheck
    });

    return res.json(healthStatus);
  } catch (err) {
    console.error('GET /api/settings/email/health error:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve email health status',
      error: err.message
    });
  }
});

// Helper function to get human-readable health status message
function getHealthStatusMessage(status) {
  switch (status) {
    case 'ok':
      return 'Email provider is operational';
    case 'warning':
      return 'Email provider has warnings but may work';
    case 'failed':
      return 'Email provider connectivity check failed';
    case 'unknown':
      return 'Email provider health status not yet checked';
    default:
      return 'Unknown health status';
  }
}

// POST /api/settings/email/health-check - Manually trigger health check
// Accepts emailConfig OR smtp config in request body for testing unsaved settings
// Priority: body.smtp > body.emailConfig > database (if both missing)
router.post('/email/health-check', requireAuth, isAdmin, async (req, res) => {
  try {
    const { emailConfig, smtp } = req.body;
    let configToTest = null;
    let configSource = null;

    // VALIDATION 1: Determine configuration source
    // Priority: body.smtp > body.emailConfig > database fallback
    if (smtp) {
      // Use smtp from request body (highest priority)
      console.log('[Settings] Health check using smtp config from request body');
      configSource = 'request_body_smtp';
      configToTest = smtp;

      // VALIDATION 1a: Validate password from body.smtp.password
      if (!smtp.password) {
        console.error('[Settings] Health check - Missing password in body.smtp');
        return res.status(400).json({
          success: false,
          message: 'Password is required',
          error: 'smtp.password field is required in request body for health check',
          validationField: 'smtp.password',
          configSource: 'request_body_smtp',
          status: 'failed'
        });
      }

      if (typeof smtp.password !== 'string' || smtp.password.trim().length === 0) {
        console.error('[Settings] Health check - Invalid password in body.smtp', {
          passwordType: typeof smtp.password,
          passwordLength: smtp.password?.length || 0
        });
        return res.status(400).json({
          success: false,
          message: 'Password must be a non-empty string',
          error: 'smtp.password must be a valid non-empty string',
          validationField: 'smtp.password',
          configSource: 'request_body_smtp',
          status: 'failed'
        });
      }

      console.log('[Settings] Health check - SMTP password validated from request body', {
        hasPassword: true,
        passwordLength: smtp.password.length
      });
    } else if (emailConfig) {
      // Use emailConfig from request body (second priority)
      console.log('[Settings] Health check using emailConfig from request body');
      configSource = 'request_body_emailConfig';
      configToTest = emailConfig;
    } else {
      // Fall back to database (lowest priority)
      console.log('[Settings] Health check - No smtp or emailConfig in request body, attempting DB fallback');
      const settings = await SystemSetting.findOne();
      
      if (!settings || !settings.smtp) {
        console.error('[Settings] Health check - No SMTP config in DB and no config in request body');
        return res.status(400).json({
          success: false,
          message: 'Email configuration required',
          error: 'emailConfig or smtp field is required in request body, or SMTP must be configured in database',
          validationField: 'configuration',
          configSource: 'none',
          status: 'failed',
          details: 'Provide smtp or emailConfig in request body, or configure SMTP in settings'
        });
      }

      console.log('[Settings] Health check - Using SMTP config from database');
      configSource = 'database';
      configToTest = settings.smtp;
    }

    // VALIDATION 2: Validate that emailConfig/smtp is enabled (for non-database sources)
    if (configToTest.enabled === false && configSource !== 'database') {
      console.error('[Settings] Health check - Configuration is disabled');
      return res.status(400).json({
        success: false,
        message: 'Email provider is disabled',
        error: 'Enable email configuration before performing health check',
        status: 'warning',
        configSource: configSource
      });
    }

    console.log('[Settings] Health check - Configuration source:', {
      source: configSource,
      provider: configToTest.provider
    });

    console.log('[Settings] Triggering manual health check for provider:', configToTest.provider);
    console.log('[Settings] Health check payload:', {
      provider: configToTest.provider,
      fromEmail: configToTest.fromEmail,
      configSource: configSource,
      // Log sanitized version of sensitive fields (just check if present)
      hasAuthFields: !!(configToTest.user || configToTest.password || configToTest.gmailAppPassword || configToTest.sendgridApiKey || configToTest.accessKeyId),
      fromName: configToTest.fromName
    });

    // Perform health check
    const healthResult = await emailProviderHelper.performHealthCheck(configToTest);

    // Only update database if using database settings (not for unsaved configs from request body)
    if (configSource === 'database' && healthResult.status === 'ok') {
      await emailProviderHelper.updateHealthCheckStatus(
        healthResult.status,
        healthResult.error || null
      );
    }

    console.log('[Settings] Health check completed:', {
      provider: healthResult.provider,
      status: healthResult.status,
      durationMs: healthResult.checkDurationMs,
      configSource: configSource,
      fromPayload: configSource !== 'database'
    });

    return res.json({
      success: healthResult.status === 'ok',
      status: healthResult.status,
      message: healthResult.message,
      provider: healthResult.provider,
      error: healthResult.error || null,
      checkDurationMs: healthResult.checkDurationMs,
      timestamp: healthResult.timestamp,
      configSource: configSource
    });
  } catch (err) {
    console.error('[Settings] Manual health check error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to perform health check',
      error: err.message,
      status: 'failed'
    });
  }
});


// ===== GMAIL CONFIGURATION ROUTES =====

// GET /api/settings/gmail - Get Gmail configuration (sanitized)
router.get('/gmail', requireAuth, isAdmin, async (req, res) => {
  try {
    const settings = await SystemSetting.findOne().lean();
    const gmailConfig = settings?.gmail ? gmailHelper.sanitizeGmailConfig(settings.gmail) : null;
    return res.json({ gmail: gmailConfig });
  } catch (err) {
    console.error('GET /api/settings/gmail error:', err);
    return res.status(500).json({ message: 'Failed to load Gmail settings' });
  }
});

// PATCH /api/settings/gmail - Update Gmail configuration
router.patch('/gmail', requireAuth, isAdmin, async (req, res) => {
  try {
    const { gmailAddress, appPassword, password, displayName, useAppPassword, enabled } = req.body;
    
    console.log('[Settings PATCH] Gmail update request received:', {
      enabled,
      gmailAddress,
      displayName,
      hasAppPassword: !!appPassword,
      appPasswordLength: appPassword?.length || 0,
      hasPassword: !!password,
      passwordLength: password?.length || 0,
      useAppPassword,
      allKeysInBody: Object.keys(req.body)
    });
    
    let settings = await SystemSetting.findOne();
    if (!settings) {
      console.log('[Settings PATCH] Creating new settings document');
      settings = new SystemSetting();
      await settings.save();
    }
    
    console.log('[Settings PATCH] Settings document ID:', settings._id);

    // Store passwords as plain text
    let savedAppPassword = settings.gmail?.appPassword || null;
    let savedPassword = settings.gmail?.password || null;
    const appPasswordProvided = appPassword && appPassword.trim();
    const passwordProvided = password && password.trim();
    
    console.log('[Settings PATCH] Password handling:', {
      appPasswordProvided: !!appPasswordProvided,
      appPasswordLength: appPassword?.length || 0,
      passwordProvided: !!passwordProvided,
      passwordLength: password?.length || 0,
      existingAppPassword: !!settings.gmail?.appPassword,
      existingPassword: !!settings.gmail?.password
    });
    
    if (appPasswordProvided) {
      savedAppPassword = appPassword.trim();
      console.log('[Settings PATCH] App password will be stored as plain text:', {
        length: savedAppPassword.length,
        preview: savedAppPassword.substring(0, 5) + '***'
      });
    }
    
    if (passwordProvided) {
      savedPassword = password.trim();
      console.log('[Settings PATCH] Regular password will be stored as plain text:', {
        length: savedPassword.length,
        preview: savedPassword.substring(0, 5) + '***'
      });
    }
    
    // Require at least one password if enabling Gmail
    const hasAnyPassword = savedAppPassword || savedPassword;
    if (enabled && !hasAnyPassword) {
      // If enabling Gmail but no password provided and none exists, that's an error
      return res.status(400).json({ 
        message: 'At least one password is required when enabling Gmail (app password or regular password)',
        errors: ['appPassword or password is required']
      });
    }
    
    // Validate Gmail config only if enabled
    if (enabled) {
      if (!gmailAddress) {
        return res.status(400).json({ 
          message: 'Gmail address is required',
          errors: ['gmailAddress is required']
        });
      }
      if (!gmailAddress.includes('@gmail.com')) {
        return res.status(400).json({ 
          message: 'Must be a valid Gmail address',
          errors: ['Must use @gmail.com address']
        });
      }
      if (!savedAppPassword && !savedPassword) {
        return res.status(400).json({ 
          message: 'At least one password is required',
          errors: ['appPassword or password is required']
        });
      }
    }
    
    console.log('[Settings PATCH] Before save - passwords:', {
      appPassword: savedAppPassword ? `${savedAppPassword.substring(0, 5)}***` : null,
      appPasswordLength: savedAppPassword?.length || 0,
      password: savedPassword ? `${savedPassword.substring(0, 5)}***` : null,
      passwordLength: savedPassword?.length || 0,
      appPasswordType: typeof savedAppPassword,
      passwordType: typeof savedPassword
    });
    
    // Update settings object directly
    settings.gmail = {
      enabled: enabled,
      gmailAddress: gmailAddress,
      displayName: displayName || (gmailAddress && gmailAddress.split('@')[0]) || 'Barangay System',
      useAppPassword: useAppPassword !== false,
      appPassword: savedAppPassword,
      password: savedPassword,
      updatedAt: new Date()
    };
    
    console.log('[Settings PATCH] Updated settings.gmail object:', {
      enabled: settings.gmail.enabled,
      gmailAddress: settings.gmail.gmailAddress,
      hasAppPassword: !!settings.gmail.appPassword,
      passwordLength: settings.gmail.appPassword?.length || 0
    });
    
    // Save using Mongoose .save() for proper document handling
    const savedSettings = await settings.save();
    
    console.log('[Settings PATCH] Save result:', {
      savedId: savedSettings._id,
      gmailEnabled: savedSettings.gmail?.enabled,
      gmailAddress: savedSettings.gmail?.gmailAddress,
      hasPasswordAfterSave: !!savedSettings.gmail?.appPassword,
      passwordLength: savedSettings.gmail?.appPassword?.length || 0
    });
    
    // Fetch fresh document to verify save
    const updated = await SystemSetting.findById(settings._id).lean();
    
    console.log('[Settings PATCH] Verification after save:', {
      enabled: updated?.gmail?.enabled,
      gmailAddress: updated?.gmail?.gmailAddress,
      hasAppPassword: !!updated?.gmail?.appPassword,
      appPasswordValue: updated?.gmail?.appPassword ? `${updated.gmail.appPassword.substring(0, 5)}***` : null,
      appPasswordLength: updated?.gmail?.appPassword?.length || 0,
      hasPassword: !!updated?.gmail?.password,
      passwordValue: updated?.gmail?.password ? `${updated.gmail.password.substring(0, 5)}***` : null,
      passwordLength: updated?.gmail?.password?.length || 0,
      allGmailFields: Object.keys(updated?.gmail || {})
    });
    
    // Record audit
    await recordAudit(req.user._id, 'gmail_config_updated', {
      gmailAddress,
      enabled,
      displayName
    }, req.ip);
    
    console.log('[Settings] Gmail configuration updated by admin:', req.user._id, {
      enabled,
      gmailAddress,
      hasPassword: !!savedAppPassword || !!savedPassword
    });
    
    return res.json({
      success: true,
      gmail: gmailHelper.sanitizeGmailConfig(updated.gmail)
    });
  } catch (err) {
    console.error('PATCH /api/settings/gmail error:', err);
    return res.status(500).json({ message: 'Failed to update Gmail settings', error: err.message });
  }
});

// POST /api/settings/gmail/test - Test Gmail connection
router.post('/gmail/test', requireAuth, isAdmin, async (req, res) => {
  try {
    // Only accept testEmail, fromEmail, senderName from request
    // Passwords come ONLY from database (not from request body for security)
    const { testEmail, fromEmail, senderName } = req.body;
    
    console.log('[Settings] Gmail test request received:', {
      testEmail,
      fromEmail,
      senderName
    });
    
    // Validate test email - if not provided, we'll validate after checking settings
    if (!testEmail) {
      return res.status(400).json({ 
        success: false,
        message: 'Test email address is required',
        error: 'testEmail field is missing from request body'
      });
    }
    
    if (!testEmail.includes('@')) {
      return res.status(400).json({ 
        success: false,
        message: 'Valid test email is required',
        error: 'testEmail must be a valid email address'
      });
    }
    
    const settings = await SystemSetting.findOne().lean();
    
    console.log('[Settings] Retrieved settings from DB:', {
      hasSettings: !!settings,
      hasGmail: !!settings?.gmail,
      gmailEnabled: settings?.gmail?.enabled,
      gmailAddress: settings?.gmail?.gmailAddress,
      hasAppPassword: !!settings?.gmail?.appPassword,
      appPasswordLength: settings?.gmail?.appPassword ? settings.gmail.appPassword.length : 0,
      hasPassword: !!settings?.gmail?.password,
      passwordLength: settings?.gmail?.password ? settings.gmail.password.length : 0,
      gmailObject: settings?.gmail ? Object.keys(settings.gmail) : null,
      allSettingsKeys: settings ? Object.keys(settings) : null
    });
    
    if (!settings) {
      console.error('[Settings] No settings found - returning 400');
      return res.status(400).json({ 
        success: false,
        message: 'System settings not found',
        error: 'No system settings in database'
      });
    }
    
    if (!settings.gmail) {
      console.error('[Settings] No gmail object in settings - returning 400');
      return res.status(400).json({ 
        success: false,
        message: 'Gmail configuration not found',
        error: 'Gmail settings have not been configured yet'
      });
    }
    
    if (!settings.gmail.enabled) {
      console.error('[Settings] Gmail not enabled - returning 400');
      return res.status(400).json({ 
        success: false,
        message: 'Gmail is not enabled',
        error: 'Enable Gmail in settings first'
      });
    }
    
    if (!settings.gmail.gmailAddress) {
      console.error('[Settings] No gmail address - returning 400');
      return res.status(400).json({ 
        success: false,
        message: 'Gmail address is not configured',
        error: 'Gmail address is missing from settings'
      });
    }
    
    if (!settings.gmail.appPassword && !settings.gmail.password) {
      console.error('[Settings] No passwords configured in database - returning 400', {
        hasAppPassword: !!settings.gmail.appPassword,
        hasPassword: !!settings.gmail.password
      });
      return res.status(400).json({ 
        success: false,
        message: 'Gmail password is not configured',
        error: 'Gmail app password or regular password must be saved in settings first'
      });
    }
    
    // Use ONLY database passwords - prefer app password, then fall back to regular password
    const passwordType = settings.gmail.appPassword ? 'appPassword' : 'password';
    
    console.log('[Settings] Test Email Password Selection:', {
      hasDbAppPassword: !!settings.gmail.appPassword,
      dbAppPasswordLength: settings.gmail.appPassword?.length || 0,
      hasDbPassword: !!settings.gmail.password,
      dbPasswordLength: settings.gmail.password?.length || 0,
      usingPasswordType: passwordType,
      source: 'database only'
    });
    
    // CHECK: Verify email sending is not disabled
    if (!settings.email || !settings.email.enabled) {
      console.log('[Settings] Email sending is disabled - rejecting Gmail test');
      return res.status(400).json({ 
        success: false,
        provider: 'gmail',
        message: 'Email sending is currently disabled',
        error: 'Master email sending switch is disabled. Enable "Email Sending" in Email Behavior Control.',
        validationFailure: 'EMAIL_SENDING_DISABLED'
      });
    }

    // CHECK: Verify Gmail provider is actually enabled and selected
    if (!settings.smtp || !settings.smtp.provider || settings.smtp.provider !== 'gmail') {
      console.log('[Settings] Gmail provider not active');
      return res.status(400).json({ 
        success: false,
        provider: 'gmail',
        message: 'Gmail provider is not the active email provider',
        error: 'Gmail must be selected as the active provider in Email Settings to run this test.'
      });
    }

    // CHECK: Validate Gmail configuration completeness
    const validation = validateProviderConfiguration('gmail', settings.gmail);
    if (!validation.isValid) {
      console.log('[Settings] Gmail validation failed:', validation);
      return res.status(400).json({ 
        success: false,
        provider: 'gmail',
        message: 'Gmail configuration incomplete',
        error: `Missing required fields: ${validation.missingFields.join(', ')}`,
        missingFields: validation.missingFields,
        hint: validation.hint,
        validationFailure: 'INCOMPLETE_PROVIDER_CONFIG'
      });
    }

    const gmailConfig = {
      gmailAddress: fromEmail || settings.gmail.gmailAddress,
      displayName: senderName || settings.gmail.displayName || 'Barangay System',
      appPassword: settings.gmail.appPassword,
      password: settings.gmail.password,
      encryptedPassword: settings.gmail.encryptedPassword,
      passwordType // Pass password type for logging
    };
    
    console.log('[Settings] Gmail test config prepared:', {
      gmailAddress: gmailConfig.gmailAddress,
      displayName: gmailConfig.displayName,
      usingPasswordType: gmailConfig.passwordType,
      passwordLength: gmailConfig.appPassword?.length || gmailConfig.password?.length || 0
    });
    
    const result = await gmailHelper.testGmailConnection(gmailConfig, testEmail);
    
    if (!result.success) {
      console.error('[Settings] Gmail test email failed:', {
        error: result.error,
        passwordType,
        testEmail,
        gmailAddress: gmailConfig.gmailAddress
      });
      
      // Provide Gmail-specific error hints
      let hint = 'Gmail Authentication Error: ';
      if (result.error.includes('Invalid') || result.error.includes('invalid')) {
        hint += 'Invalid Gmail address or App Password. Verify both are correct. App Password is 16 characters generated in Google Account Security.';
      } else if (result.error.includes('auth') || result.error.includes('AUTH') || result.error.includes('credentials')) {
        hint += 'Authentication credentials invalid. Ensure you are using a 16-character App Password, not your regular Gmail password. Enable 2FA in Google Account.';
      } else if (result.error.includes('TLS') || result.error.includes('SSL')) {
        hint += 'TLS/SSL connection issue. Verify Google SMTP port 587 is being used and TLS is enabled.';
      } else if (result.error.includes('blocked') || result.error.includes('suspicious')) {
        hint += 'Google blocked the login attempt. Check your Google Account for security notifications. May need to enable "Less secure app access" or verify login in browser.';
      } else {
        hint += 'Check Google Account security settings and ensure this application is authorized. Review Gmail/Google error messages in account activity.';
      }

      return res.status(400).json({
        success: false,
        provider: 'gmail',
        message: 'Gmail test failed',
        error: result.error,
        hint,
        details: result.details || 'Check Gmail security settings and authorization',
        messageId: result.messageId || null
      });
    }
    
    console.log('[Settings] Gmail test email successful:', {
      adminId: req.user._id,
      testEmail,
      gmailAddress: gmailConfig.gmailAddress,
      passwordType,
      messageId: result.messageId
    });
    
    return res.json({
      success: true,
      provider: 'gmail',
      message: 'Test email sent successfully',
      recipient: testEmail,
      messageId: result.messageId || null,
      timestamp: new Date().toISOString(),
      passwordType // Inform client which password was used
    });
  } catch (err) {
    console.error('[Settings] POST /api/settings/gmail/test error:', {
      error: err.message,
      stack: err.stack
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to test Gmail',
      error: err.message
    });
  }
});

// DEBUG ENDPOINT - Test encryption (admin only)
router.post('/test-encryption', requireAuth, isAdmin, async (req, res) => {
  try {
    const testPassword = 'test_password_12345';
    console.log('[Test Encryption] Starting test with password length:', testPassword.length);
    console.log('[Test Encryption] SETTINGS_ENCRYPTION_KEY available:', !!process.env.SETTINGS_ENCRYPTION_KEY);
    console.log('[Test Encryption] SETTINGS_ENCRYPTION_KEY length:', process.env.SETTINGS_ENCRYPTION_KEY ? process.env.SETTINGS_ENCRYPTION_KEY.length : 0);
    
    const encrypted = gmailHelper.encryptGmailPassword(testPassword);
    console.log('[Test Encryption] Encryption result:', {
      success: !!encrypted,
      length: encrypted ? encrypted.length : 0,
      value: encrypted
    });
    
    if (!encrypted) {
      return res.json({
        success: false,
        message: 'Encryption returned null/undefined',
        encryptionKeySet: !!process.env.SETTINGS_ENCRYPTION_KEY
      });
    }
    
    const decrypted = gmailHelper.decryptGmailPassword(encrypted);
    console.log('[Test Encryption] Decryption result:', {
      success: decrypted === testPassword,
      decrypted,
      original: testPassword,
      match: decrypted === testPassword
    });
    
    return res.json({
      success: true,
      message: 'Encryption test successful',
      encryptionKeySet: !!process.env.SETTINGS_ENCRYPTION_KEY,
      encryptionKeyLength: process.env.SETTINGS_ENCRYPTION_KEY ? process.env.SETTINGS_ENCRYPTION_KEY.length : 0,
      testPassword,
      encrypted,
      decrypted,
      decryptionMatches: decrypted === testPassword
    });
  } catch (err) {
    console.error('[Test Encryption] Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Encryption test failed',
      error: err.message
    });
  }
});

// ==================== EMAIL PROVIDER ENDPOINTS ====================

// GET /api/settings/email/providers - Get available email providers
router.get('/email/providers', requireAuth, isAdmin, async (req, res) => {
  try {
    const providers = emailProviderHelper.getAvailableProviders();
    res.json({
      success: true,
      providers
    });
  } catch (err) {
    console.error('[Settings] GET /email/providers error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to get providers',
      error: err.message
    });
  }
});

// GET /api/settings/email - Get current SendGrid email configuration
// Returns SendGrid config with masked API key
router.get('/email', requireAuth, isAdmin, async (req, res) => {
  try {
    const settings = await SystemSetting.findOne().lean();
    
    if (!settings || !settings.email) {
      return res.json({
        success: true,
        email: {
          enabled: false,
          provider: 'sendgrid',
          sendgrid: {
            apiKey: '',
            fromEmail: '',
            fromName: 'Barangay System'
          },
          updatedAt: new Date()
        }
      });
    }

    // Sanitize for client (mask API key)
    const sanitized = {
      enabled: settings.email.enabled || false,
      provider: settings.email.provider || 'sendgrid',
      sendgrid: settings.email.sendgrid ? { ...settings.email.sendgrid } : {
        apiKey: '',
        fromEmail: '',
        fromName: 'Barangay System'
      },
      updatedAt: settings.email.updatedAt || new Date()
    };
    
    if (sanitized.sendgrid?.apiKey) {
      sanitized.sendgrid.apiKey = '********';
    }
    
    console.log('[Settings] GET /email - SendGrid config retrieved:', {
      enabled: sanitized.enabled,
      provider: sanitized.provider,
      fromEmail: sanitized.sendgrid?.fromEmail,
      hasSendgridApiKey: !!sanitized.sendgrid?.apiKey
    });
    
    res.json({
      success: true,
      email: sanitized
    });
  } catch (err) {
    console.error('[Settings] GET /email error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to get email settings',
      error: err.message
    });
  }
});

// PATCH /api/settings/email - Update SendGrid-only email configuration
// Updates email field with SendGrid configuration
router.patch('/email', requireAuth, isAdmin, async (req, res) => {
  try {
    const {
      enabled,
      fromName,
      fromEmail,
      sendgrid
    } = req.body;

    console.log('[Settings] SendGrid email config update request:', {
      enabled,
      fromEmail,
      fromName,
      hasSendgridConfig: !!sendgrid,
      sendgridKeys: sendgrid ? Object.keys(sendgrid) : []
    });

    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = new SystemSetting();
    }

    // Helper to detect masked values
    const isMaskedValue = (val) => {
      return typeof val === 'string' && val.length > 0 && /^\*+$/.test(val);
    };

    // Build SendGrid email config
    // Initialize email config from existing settings or new structure
    const emailConfig = settings.email || {};
    
    // Update top-level properties
    emailConfig.enabled = !!enabled;
    emailConfig.provider = 'sendgrid';
    
    // Initialize sendgrid sub-object if it doesn't exist
    if (!emailConfig.sendgrid) {
      emailConfig.sendgrid = {};
    }

    // Handle SendGrid-specific fields
    if (sendgrid) {
      // Handle API key - preserve existing if masked
      if (sendgrid.apiKey !== undefined) {
        if (isMaskedValue(sendgrid.apiKey)) {
          console.log('[Settings] PATCH /email - SendGrid API key is masked, preserving existing value');
          // Preserve existing value (don't overwrite with masked placeholder)
          if (!emailConfig.sendgrid.apiKey) {
            // Only set if there's no existing value
            console.log('[Settings] PATCH /email - No existing API key to preserve');
          }
        } else if (sendgrid.apiKey && sendgrid.apiKey.length > 0) {
          emailConfig.sendgrid.apiKey = sendgrid.apiKey;
          console.log('[Settings] PATCH /email - SendGrid API key updated:', {
            length: sendgrid.apiKey.length,
            preview: sendgrid.apiKey.substring(0, 8) + '...'
          });
        } else {
          console.log('[Settings] PATCH /email - SendGrid API key is empty, keeping existing');
          // Don't clear the apiKey if it's empty in request
        }
      }

      // Handle fromEmail in sendgrid object
      if (sendgrid.fromEmail) {
        emailConfig.sendgrid.fromEmail = sendgrid.fromEmail;
        console.log('[Settings] PATCH /email - SendGrid fromEmail:', sendgrid.fromEmail);
      }
      
      // Handle fromName in sendgrid object
      if (sendgrid.fromName) {
        emailConfig.sendgrid.fromName = sendgrid.fromName;
        console.log('[Settings] PATCH /email - SendGrid fromName:', sendgrid.fromName);
      }
    }

    // Handle top-level fromEmail and fromName (for backwards compatibility)
    if (fromEmail) {
      emailConfig.sendgrid.fromEmail = fromEmail;
    }
    if (fromName) {
      emailConfig.sendgrid.fromName = fromName;
    }

    // Set defaults for sendgrid sub-object
    if (!emailConfig.sendgrid.fromName) {
      emailConfig.sendgrid.fromName = 'Barangay System';
    }

    // Update timestamp
    emailConfig.updatedAt = new Date();

    // Validate if enabled: require API key
    if (emailConfig.enabled && !emailConfig.sendgrid.apiKey) {
      console.warn('[Settings] PATCH /email - Cannot enable SendGrid without API key');
      return res.status(400).json({
        success: false,
        message: 'SendGrid API key is required when enabling email',
        error: 'sendgrid.apiKey is required'
      });
    }

    // Update the email field in the document
    settings.email = emailConfig;
    settings.markModified('email');
    await settings.save();

    console.log('[Settings] SendGrid email configuration saved:', {
      enabled: emailConfig.enabled,
      provider: emailConfig.provider,
      fromEmail: emailConfig.sendgrid?.fromEmail,
      fromName: emailConfig.sendgrid?.fromName,
      hasSendgridApiKey: !!emailConfig.sendgrid?.apiKey,
      updatedAt: emailConfig.updatedAt
    });

    // Fetch and sanitize for response
    const sanitized = {
      enabled: emailConfig.enabled,
      provider: emailConfig.provider,
      sendgrid: emailConfig.sendgrid ? { ...emailConfig.sendgrid } : {},
      updatedAt: emailConfig.updatedAt
    };
    
    if (sanitized.sendgrid?.apiKey) {
      sanitized.sendgrid.apiKey = '********';
    }

    res.json({
      success: true,
      message: 'SendGrid email settings updated',
      email: sanitized
    });
  } catch (err) {
    console.error('[Settings] PATCH /email error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to update email settings',
      error: err.message
    });
  }
});


// POST /api/settings/email/test - Test email configuration
// Accepts smtp config in request body OR uses activeProvider from database
// Supports multi-provider: mailtrap, sendgrid, gmail
// Priority: body.smtp > database (if body.smtp missing)
router.post('/email/test', requireAuth, isAdmin, async (req, res) => {
  try {
    const { testEmail, emailConfig } = req.body;

    console.log('[Settings] POST /email/test - Test email request:', {
      testEmail,
      hasEmailConfig: !!emailConfig
    });

    // Validation: Test email is required
    if (!testEmail || !testEmail.trim()) {
      console.error('[Settings] POST /email/test - Missing testEmail');
      return res.status(400).json({
        success: false,
        message: 'Test email address is required',
        error: 'testEmail field is required'
      });
    }

    // Validation: Valid email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(testEmail.trim())) {
      console.error('[Settings] POST /email/test - Invalid email format:', testEmail);
      return res.status(400).json({
        success: false,
        message: 'Invalid email address format',
        error: `'${testEmail}' is not a valid email address`
      });
    }

    // Get SendGrid configuration
    let config = null;

    // Helper to extract config from payload
    const getConfigFromPayload = (emailConfig) => {
      if (!emailConfig) return null;
      const sgData = emailConfig.sendgrid || emailConfig;
      // Check if we have a valid API key that is not masked
      if (sgData.apiKey && typeof sgData.apiKey === 'string' && sgData.apiKey.trim() && !/^\*+$/.test(sgData.apiKey)) {
        return {
          apiKey: sgData.apiKey,
          fromEmail: sgData.fromEmail || '',
          fromName: sgData.fromName || 'Barangay System'
        };
      }
      return null;
    };

    // Use configuration from request body ONLY if it has a valid API key (for testing before saving)
    const payloadConfig = getConfigFromPayload(emailConfig);
    if (payloadConfig) {
      console.log('[Settings] POST /email/test - Using emailConfig from request body (has valid API key)');
      config = payloadConfig;
    } else {
      // Load from dedicated SendGrid config document
      console.log('[Settings] POST /email/test - Loading SendGrid config from dedicated document');
      const sgConfigDoc = await SystemSetting.getSendGridConfig();

      if (!sgConfigDoc || !sgConfigDoc.sendgridConfig) {
        console.error('[Settings] POST /email/test - No SendGrid configuration found');
        return res.status(400).json({
          success: false,
          message: 'SendGrid configuration not found',
          error: 'Please save your SendGrid API key in settings before testing. If config is saved, ensure enabled is true.'
        });
      }

      config = sgConfigDoc.sendgridConfig;
    }

    // Validation: SendGrid API key is required
    if (!config.apiKey || typeof config.apiKey !== 'string' || !config.apiKey.trim()) {
      console.error('[Settings] POST /email/test - Missing or invalid SendGrid API key', {
        hasApiKey: !!config.apiKey,
        apiKeyType: typeof config.apiKey,
        apiKeyLength: config.apiKey ? config.apiKey.length : 0
      });
      return res.status(400).json({
        success: false,
        message: 'SendGrid API key is required',
        error: 'API key must be a non-empty string. Please set it in settings.'
      });
    }

    // Validation: FromEmail is required
    if (!config.fromEmail || typeof config.fromEmail !== 'string' || !config.fromEmail.trim()) {
      console.error('[Settings] POST /email/test - Missing or invalid SendGrid fromEmail', {
        hasFromEmail: !!config.fromEmail,
        fromEmailType: typeof config.fromEmail,
        fromEmailLength: config.fromEmail ? config.fromEmail.length : 0
      });
      return res.status(400).json({
        success: false,
        message: 'SendGrid from email is required',
        error: 'From email must be a valid email address. Please set it in settings.'
      });
    }

    console.log('[Settings] POST /email/test - SendGrid config loaded:', {
      hasApiKey: !!config.apiKey,
      apiKeyLength: config.apiKey.length,
      fromEmail: config.fromEmail,
      fromName: config.fromName || 'Barangay System',
      testEmail: testEmail
    });

    // Import SendGrid email service
    const emailService = require('../services/emailService');

    // Send test email
    try {
      const result = await emailService.testSendGridConnection(
        {
          apiKey: config.apiKey,
          fromEmail: config.fromEmail,
          fromName: config.fromName || 'Barangay System'
        },
        testEmail.trim()
      );

      console.log('[Settings] POST /email/test - Test email sent successfully:', {
        messageId: result.details.messageId,
        statusCode: result.details.statusCode,
        to: testEmail
      });

      return res.json({
        success: true,
        message: 'Test email sent successfully',
        details: result.details,
        provider: 'sendgrid'
      });
    } catch (sendError) {
      console.error('[Settings] POST /email/test - Failed to send test email:', {
        message: sendError.message,
        testEmail: testEmail
      });

      return res.status(400).json({
        success: false,
        message: 'Failed to send test email via SendGrid',
        error: sendError.message,
        provider: 'sendgrid',
        hint: 'Verify your SendGrid API key and configuration are correct'
      });
    }
  } catch (err) {
    console.error('[Settings] POST /email/test - Unexpected error:', {
      message: err.message,
      stack: err.stack
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: err.message
    });
  }
});

/**
 * Detect if multiple email providers are configured in a config object
 * Returns array of detected providers - single provider enforcement
 */
function detectMultipleProviders(config) {
  if (!config) return [];
  const detectedProviders = [];
  if (config.host || config.port) detectedProviders.push('custom');
  if (config.gmailAddress || config.gmailAppPassword) detectedProviders.push('gmail');
  if (config.user && config.password && !config.host && !config.gmailAddress) detectedProviders.push('mailtrap');
  if (config.sendgridApiKey) detectedProviders.push('sendgrid');
  if (config.awsAccessKeyId || config.awsSecretAccessKey) detectedProviders.push('aws-ses');
  return detectedProviders;
}

/**
 * Validate provider configuration completeness
 * Returns validation status with missing fields and provider-specific hints
 */
function validateProviderConfiguration(provider, config) {
  if (!provider || !config) {
    return {
      isValid: false,
      missingFields: ['provider'],
      hint: 'No email provider selected. Configure a provider in Email Settings.'
    };
  }

  const missingFields = [];
  let hint = '';

  switch (provider) {
    case 'custom':
      if (!config.host) missingFields.push('host');
      if (!config.port) missingFields.push('port');
      if (!config.user) missingFields.push('user');
      if (!config.password) missingFields.push('password');

      if (missingFields.length > 0) {
        hint = 'Custom SMTP Configuration errors detected: ';
        if (missingFields.includes('host')) hint += 'Check DNS/hostname, ';
        if (missingFields.includes('port')) hint += 'Verify SMTP port (usually 587 or 465), ';
        if (missingFields.includes('user')) hint += 'Provide authentication username, ';
        if (missingFields.includes('password')) hint += 'Provide authentication password, ';
        hint = hint.slice(0, -2) + '.';
        hint += ' Use port 587 for TLS or 465 for SSL. Test TLS certificate validation if connection fails.';
        return { isValid: false, missingFields, hint };
      }

      // Validate port is valid number
      const portNum = Number(config.port);
      if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
        return {
          isValid: false,
          missingFields: ['port'],
          hint: 'SMTP port must be a number between 1-65535. Common ports: 587 (TLS), 465 (SSL), 25 (unencrypted).'
        };
      }

      return { isValid: true, missingFields: [], hint: '' };

    case 'gmail':
      if (!config.gmailAddress) missingFields.push('gmailAddress');
      if (!config.gmailAppPassword) missingFields.push('gmailAppPassword');

      if (missingFields.length > 0) {
        hint = 'Gmail Configuration errors detected: ';
        if (missingFields.includes('gmailAddress')) hint += 'Provide Gmail email address, ';
        if (missingFields.includes('gmailAppPassword')) hint += 'Generate and provide 16-character App Password (not regular password), ';
        hint = hint.slice(0, -2) + '.';
        hint += ' App Passwords are created in Google Account Security settings with 2FA enabled. Never use your regular Gmail password.';
        return { isValid: false, missingFields, hint };
      }

      return { isValid: true, missingFields: [], hint: '' };

    case 'mailtrap':
      if (!config.user) missingFields.push('user');
      if (!config.password) missingFields.push('password');

      if (missingFields.length > 0) {
        hint = 'Mailtrap Configuration errors detected: ';
        if (missingFields.includes('user')) hint += 'Provide Mailtrap username/token, ';
        if (missingFields.includes('password')) hint += 'Provide Mailtrap password, ';
        hint = hint.slice(0, -2) + '.';
        hint += ' Get credentials from your Mailtrap account settings. Verify inbox and credentials are correct.';
        return { isValid: false, missingFields, hint };
      }

      return { isValid: true, missingFields: [], hint: '' };

    case 'sendgrid':
      if (!config.sendgridApiKey) missingFields.push('sendgridApiKey');

      if (missingFields.length > 0) {
        return {
          isValid: false,
          missingFields,
          hint: 'SendGrid API Key not configured. Generate API Key from SendGrid dashboard (API Keys section). Key should start with "SG.".'
        };
      }

      return { isValid: true, missingFields: [], hint: '' };

    case 'aws-ses':
      if (!config.awsAccessKeyId) missingFields.push('awsAccessKeyId');
      if (!config.awsSecretAccessKey) missingFields.push('awsSecretAccessKey');

      if (missingFields.length > 0) {
        hint = 'AWS SES Configuration errors detected: ';
        if (missingFields.includes('awsAccessKeyId')) hint += 'Provide AWS Access Key ID, ';
        if (missingFields.includes('awsSecretAccessKey')) hint += 'Provide AWS Secret Access Key, ';
        hint = hint.slice(0, -2) + '.';
        hint += ' Verify AWS SES is verified and not in sandbox mode. Check IAM permissions for SendEmail action.';
        return { isValid: false, missingFields, hint };
      }

      return { isValid: true, missingFields: [], hint: '' };

    default:
      return {
        isValid: false,
        missingFields: [],
        hint: `Unknown email provider type: "${provider}". Use: custom, gmail, mailtrap, sendgrid, or aws-ses.`
      };
  }
}

/**
 * Remove undefined properties from an object
 * Recursively cleans the object to ensure no undefined values are saved to MongoDB
 */
function removeUndefinedProperties(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip undefined and null values
    if (value === undefined || value === null) {
      continue;
    }

    // Recursively clean nested objects
    if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      cleaned[key] = removeUndefinedProperties(value);
    } else {
      // Include all other values (including false, 0, '', etc.)
      cleaned[key] = value;
    }
  }

  return cleaned;
}

/**
 * Validate provider-specific required fields
 */
function validateProviderConfig(config) {
  const missingFields = [];

  switch (config.provider) {
    case 'custom':
      if (!config.host) missingFields.push('host');
      if (!config.port) missingFields.push('port');
      if (!config.user) missingFields.push('user');
      if (!config.password) missingFields.push('password');
      
      if (missingFields.length > 0) {
        return {
          error: `Missing required fields: ${missingFields.join(', ')}`,
          missingFields: missingFields
        };
      }
      
      // Validate port is valid number in range
      const portNum = Number(config.port);
      if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
        return {
          error: 'Invalid SMTP port (must be 1-65535)',
          field: 'port'
        };
      }
      break;

    case 'gmail':
      if (!config.gmailAddress) missingFields.push('gmailAddress');
      if (!config.gmailAppPassword) missingFields.push('gmailAppPassword');
      
      if (missingFields.length > 0) {
        return {
          error: `Missing required fields: ${missingFields.join(', ')}`,
          missingFields: missingFields
        };
      }
      break;

    case 'mailtrap':
      if (!config.user) missingFields.push('user');
      if (!config.password) missingFields.push('password');
      
      if (missingFields.length > 0) {
        return {
          error: `Missing required fields: ${missingFields.join(', ')}`,
          missingFields: missingFields
        };
      }
      break;

    case 'sendgrid':
      if (!config.sendgridApiKey) missingFields.push('sendgridApiKey');
      
      if (missingFields.length > 0) {
        return {
          error: `Missing required fields: ${missingFields.join(', ')}`,
          missingFields: missingFields
        };
      }
      break;

    case 'aws-ses':
      if (!config.awsAccessKeyId) missingFields.push('awsAccessKeyId');
      if (!config.awsSecretAccessKey) missingFields.push('awsSecretAccessKey');
      
      if (missingFields.length > 0) {
        return {
          error: `Missing required fields: ${missingFields.join(', ')}`,
          missingFields: missingFields
        };
      }
      break;

    default:
      return {
        error: `Unknown provider: ${config.provider}`
      };
  }

  return null; // Validation passed
}

// ==================== SETTINGS LOCK ENDPOINTS ====================

/**
 * POST /api/settings/lock
 * Acquire a lock on settings to prevent concurrent edits
 */
router.post('/lock', requireAuth, isAdmin, async (req, res) => {
  try {
    const userId = req.user._id;
    const userName = req.user.firstName && req.user.lastName 
      ? `${req.user.firstName} ${req.user.lastName}`
      : req.user.email || 'Admin';

    const result = await settingsLockHelper.acquireLock(userId, userName);
    
    if (!result.success) {
      return res.status(409).json(result); // Conflict status for lock not acquired
    }

    return res.json(result);
  } catch (err) {
    console.error('POST /api/settings/lock error', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Error acquiring lock' 
    });
  }
});

/**
 * DELETE /api/settings/lock
 * Release a lock on settings
 */
router.delete('/lock', requireAuth, isAdmin, async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await settingsLockHelper.releaseLock(userId);
    
    return res.json(result);
  } catch (err) {
    console.error('DELETE /api/settings/lock error', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Error releasing lock' 
    });
  }
});

/**
 * GET /api/settings/lock
 * Get current lock status
 */
router.get('/lock', requireAuth, isAdmin, async (req, res) => {
  try {
    const userId = req.user._id;
    const status = await settingsLockHelper.getLockStatus(userId);
    
    return res.json(status);
  } catch (err) {
    console.error('GET /api/settings/lock error', err);
    return res.status(500).json({ 
      isLocked: false,
      message: 'Error checking lock status' 
    });
  }
});

/**
 * POST /api/settings/lock/force-release
 * Force release a lock (admin override, requires higher admin role)
 */
router.post('/lock/force-release', requireAuth, isAdmin, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Optional: Check for super-admin role if you have one
    // For now, allow any admin to force release with logging
    
    const result = await settingsLockHelper.forceReleaseLock(userId);
    
    return res.json(result);
  } catch (err) {
    console.error('POST /api/settings/lock/force-release error', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Error force-releasing lock' 
    });
  }
});

// ==================== END SETTINGS LOCK ENDPOINTS ====================

// ==================== END EMAIL PROVIDER ENDPOINTS ====================

module.exports = router;
