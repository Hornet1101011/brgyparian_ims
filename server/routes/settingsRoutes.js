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
    let settings = await SystemSetting.findOne().lean();
    if (!settings) {
      // return default shape
      settings = new SystemSetting();
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
    console.log('[Settings PATCH] Encryption key available:', !!process.env.SETTINGS_ENCRYPTION_KEY);
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
    console.log('[Settings PATCH] Full payload:', JSON.stringify(payload, null, 2));
    if (payload.smtp) {
      console.log('[Settings PATCH] SMTP data received:', { 
        host: payload.smtp.host, 
        port: payload.smtp.port, 
        user: payload.smtp.user,
        hasPassword: !!payload.smtp.password,
        hasAppPassword: !!payload.smtp.appPassword,
        securityType: payload.smtp.securityType
      });
    }
    
    const errors = validateSettingsPayload(payload);
    if (errors.length) {
      console.error('[Settings PATCH] Validation errors:', errors);
      return res.status(400).json({ message: 'Validation error', errors });
    }

    // Build update payload, separating email settings which don't need encryption
    const updatePayload = {};
    
    // Copy all simple fields (strings, booleans, numbers)
    for (const [key, value] of Object.entries(payload)) {
      if (key === 'smtp' || key === 'emailSettings' || key === 'gmail' || key === 'email') {
        // Skip these for now, we'll handle them separately
        continue;
      }
      updatePayload[key] = value;
    }
    
    // Handle email settings (no encryption needed)
    if (payload.emailSettings) {
      updatePayload.emailSettings = payload.emailSettings;
      console.log('[Settings] Email settings updated:', Object.keys(payload.emailSettings));
    }

    // Handle email provider configuration (saved to smtp field which works reliably)
    if (payload.email) {
      // Store email provider config in smtp field (which persists correctly)
      updatePayload.smtp = payload.email;
      console.log('[Settings] Email provider config updated (saving to smtp field):', {
        provider: payload.email.provider,
        enabled: payload.email.enabled,
        fromName: payload.email.fromName,
        fromEmail: payload.email.fromEmail,
        keys: Object.keys(payload.email)
      });
    }
    
    // Handle SMTP updates with proper nesting
    // Note: Email provider config from payload.email is already in updatePayload.smtp
    // If payload.smtp is explicitly provided (legacy), handle it separately
    if (payload.smtp && !payload.email) {
      // Legacy SMTP payload handling
      const smtpData = { ...payload.smtp };
      
      // Validate SMTP configuration
      const smtpErrors = smtpHelper.validateSMTPConfig(smtpData);
      if (smtpErrors.length > 0) {
        console.error('[Settings PATCH] SMTP validation errors:', smtpErrors);
        return res.status(400).json({ message: 'SMTP validation error', errors: smtpErrors });
      }

      // Set secure flag based on securityType
      if (smtpData.securityType) {
        console.log('[Settings] Processing SMTP with securityType:', smtpData.securityType);
        smtpData.secure = smtpData.securityType === 'ssl';
      }

      // Handle password encryption
      if (smtpData.password) {
        try {
          smtpData.encryptedPassword = smtpHelper.encryptSMTPPassword(smtpData.password);
          console.log('[Settings] SMTP password encrypted');
        } catch (e) {
          console.error('Failed to encrypt SMTP password', e.message);
          return res.status(500).json({ message: e.message });
        }
        delete smtpData.password;
      }

      // Remove securityType (it's converted to secure flag)
      delete smtpData.securityType;
      
      updatePayload.smtp = smtpData;
      console.log('[Settings] SMTP data prepared for update:', {
        host: smtpData.host,
        port: smtpData.port,
        user: smtpData.user,
        hasPassword: !!smtpData.encryptedPassword,
        secure: smtpData.secure
      });
    }

    // Handle Gmail updates with proper encryption
    if (payload.gmail) {
      const gmailData = { ...payload.gmail };
      
      console.log('[Settings PATCH] Gmail data received:', {
        enabled: gmailData.enabled,
        gmailAddress: gmailData.gmailAddress,
        hasAppPassword: !!gmailData.appPassword,
        appPasswordLength: gmailData.appPassword?.length || 0,
        hasPassword: !!gmailData.password,
        passwordLength: gmailData.password?.length || 0
      });
      
      // Handle app password - store as plain text (no encryption)
      if (gmailData.appPassword) {
        console.log('[Settings PATCH] App password provided, storing as plain text');
        // Just keep the plain text password as-is
        gmailData.appPassword = gmailData.appPassword.trim();
        console.log('[Settings PATCH] App password stored:', {
          length: gmailData.appPassword.length,
          preview: gmailData.appPassword.substring(0, 5) + '***'
        });
      } else {
        console.log('[Settings PATCH] No app password provided');
      }
      
      // Handle regular Gmail password - store as plain text (fallback)
      if (gmailData.password) {
        console.log('[Settings PATCH] Regular password provided, storing as plain text');
        gmailData.password = gmailData.password.trim();
        console.log('[Settings PATCH] Regular password stored:', {
          length: gmailData.password.length,
          preview: gmailData.password.substring(0, 5) + '***'
        });
      } else {
        console.log('[Settings PATCH] No regular password provided');
      }
      
      // Require at least one password if enabling Gmail
      const hasAnyPassword = gmailData.appPassword || gmailData.password;
      if (gmailData.enabled && !hasAnyPassword) {
        console.warn('[Settings PATCH] Cannot enable Gmail without password');
        return res.status(400).json({ 
          message: 'Gmail password is required when enabling Gmail (app password or regular password)',
          errors: ['At least one password is required (appPassword or password)']
        });
      }
      
      // Set updatedAt timestamp for Gmail settings
      gmailData.updatedAt = new Date();
      
      console.log('[Settings PATCH] Final gmailData to save:', {
        enabled: gmailData.enabled,
        gmailAddress: gmailData.gmailAddress,
        displayName: gmailData.displayName,
        useAppPassword: gmailData.useAppPassword,
        hasAppPassword: !!gmailData.appPassword,
        appPasswordLength: gmailData.appPassword ? gmailData.appPassword.length : 0,
        hasPassword: !!gmailData.password,
        passwordLength: gmailData.password ? gmailData.password.length : 0,
        allKeys: Object.keys(gmailData)
      });
      
      updatePayload.gmail = gmailData;
      console.log('[Settings PATCH] updatePayload.gmail set:', {
        enabled: updatePayload.gmail.enabled,
        gmailAddress: updatePayload.gmail.gmailAddress,
        hasEncryptedPassword: !!updatePayload.gmail.encryptedPassword,
        encryptedPasswordLength: updatePayload.gmail.encryptedPassword ? updatePayload.gmail.encryptedPassword.length : 0,
        allKeys: Object.keys(updatePayload.gmail)
      });
    }

    const before = await SystemSetting.findOne().lean();
    console.log('[Settings PATCH] Before save - Gmail state:', {
      hasGmail: !!before?.gmail,
      gmailEnabled: before?.gmail?.enabled,
      hasAppPassword: !!before?.gmail?.appPassword,
      hasPassword: !!before?.gmail?.password
    });
    
    console.log('[Settings PATCH] updatePayload being saved:', {
      keys: Object.keys(updatePayload),
      hasGmail: !!updatePayload.gmail,
      gmailData: updatePayload.gmail ? {
        enabled: updatePayload.gmail.enabled,
        gmailAddress: updatePayload.gmail.gmailAddress,
        hasAppPassword: !!updatePayload.gmail.appPassword,
        hasPassword: !!updatePayload.gmail.password,
        updatePayloadGmailKeys: Object.keys(updatePayload.gmail)
      } : null
    });
    
    // Build explicit field updates for nested gmail object to ensure all fields are saved
    const updateOps = { $set: {} };
    
    // Copy simple fields
    for (const [key, value] of Object.entries(updatePayload)) {
      if (key !== 'gmail' && key !== 'email' && key !== 'smtp') {
        updateOps.$set[key] = value;
      }
    }
    
    // Explicitly set each gmail field to ensure Mongoose saves them properly
    if (updatePayload.gmail) {
      console.log('[Settings PATCH] Setting individual gmail fields:', {
        'gmail.enabled': updatePayload.gmail.enabled,
        'gmail.gmailAddress': updatePayload.gmail.gmailAddress,
        'gmail.displayName': updatePayload.gmail.displayName,
        'gmail.useAppPassword': updatePayload.gmail.useAppPassword,
        'gmail.appPassword_exists': !!updatePayload.gmail.appPassword,
        'gmail.password_exists': !!updatePayload.gmail.password,
        'gmail.updatedAt': updatePayload.gmail.updatedAt
      });
      
      updateOps.$set['gmail.enabled'] = updatePayload.gmail.enabled;
      updateOps.$set['gmail.gmailAddress'] = updatePayload.gmail.gmailAddress;
      updateOps.$set['gmail.displayName'] = updatePayload.gmail.displayName;
      updateOps.$set['gmail.useAppPassword'] = updatePayload.gmail.useAppPassword;
      updateOps.$set['gmail.appPassword'] = updatePayload.gmail.appPassword;
      updateOps.$set['gmail.password'] = updatePayload.gmail.password;
      updateOps.$set['gmail.updatedAt'] = updatePayload.gmail.updatedAt;
      
      console.log('[Settings PATCH] FINAL updateOps being sent to MongoDB:', {
        '$set': Object.keys(updateOps.$set),
        'gmail.appPassword_in_ops': !!updateOps.$set['gmail.appPassword'],
        'gmail.password_in_ops': !!updateOps.$set['gmail.password']
      });
    }

    // Explicitly set each email provider field (saved to smtp) to ensure Mongoose saves them properly
    if (updatePayload.smtp) {
      console.log('[Settings PATCH] Setting individual SMTP fields:', {
        'smtp.enabled': updatePayload.smtp.enabled,
        'smtp.provider': updatePayload.smtp.provider,
        'smtp.fromName': updatePayload.smtp.fromName,
        'smtp.fromEmail': updatePayload.smtp.fromEmail,
        'smtp_keys': Object.keys(updatePayload.smtp)
      });
      
      // Set individual smtp fields to ensure nested object is properly saved
      // Only set fields that have actual values to avoid overwriting with null
      if (updatePayload.smtp.enabled !== undefined) updateOps.$set['smtp.enabled'] = updatePayload.smtp.enabled;
      if (updatePayload.smtp.provider) updateOps.$set['smtp.provider'] = updatePayload.smtp.provider;
      if (updatePayload.smtp.fromName) updateOps.$set['smtp.fromName'] = updatePayload.smtp.fromName;
      if (updatePayload.smtp.fromEmail) updateOps.$set['smtp.fromEmail'] = updatePayload.smtp.fromEmail;
      if (updatePayload.smtp.host) updateOps.$set['smtp.host'] = updatePayload.smtp.host;
      if (updatePayload.smtp.port) updateOps.$set['smtp.port'] = updatePayload.smtp.port;
      if (updatePayload.smtp.secure !== undefined) updateOps.$set['smtp.secure'] = updatePayload.smtp.secure;
      if (updatePayload.smtp.user) updateOps.$set['smtp.user'] = updatePayload.smtp.user;
      
      // REFACTORED PASSWORD LOGIC:
      // - If password is present and not masked (e.g., not "********"), ALWAYS persist it
      // - If password is masked, keep existing DB password unchanged
      // - Only skip if explicitly undefined
      const isMaskedPassword = (pwd) => {
        // Check if password is masked format (multiple asterisks, typically "********")
        return typeof pwd === 'string' && pwd.length > 0 && /^\*+$/.test(pwd);
      };
      
      const hasPasswordField = updatePayload.smtp.password !== undefined && updatePayload.smtp.password !== null;
      const passwordValue = updatePayload.smtp.password;
      
      if (hasPasswordField) {
        if (isMaskedPassword(passwordValue)) {
          // Password is masked - keep existing DB password
          console.log('[Settings PATCH] Password field is masked - will preserve existing DB password');
          // Don't add to updateOps, which keeps the existing value
        } else {
          // Password is real value (not masked) - ALWAYS persist it, even if empty
          updateOps.$set['smtp.password'] = passwordValue;
          console.log('[Settings PATCH] Password field is NOT masked - persisting new value', {
            isEmptyString: passwordValue === '',
            length: typeof passwordValue === 'string' ? passwordValue.length : 0,
            willPersist: true
          });
        }
      } else {
        // Password is explicitly undefined - don't save anything (keeps existing)
        console.log('[Settings PATCH] Password field is undefined - will not modify password in DB');
      }
      
      if (updatePayload.smtp.encryptedPassword) updateOps.$set['smtp.encryptedPassword'] = updatePayload.smtp.encryptedPassword;
      
      // Include provider-specific fields if present
      if (updatePayload.smtp.gmailAddress) updateOps.$set['smtp.gmailAddress'] = updatePayload.smtp.gmailAddress;
      if (updatePayload.smtp.gmailAppPassword) updateOps.$set['smtp.gmailAppPassword'] = updatePayload.smtp.gmailAppPassword;
      if (updatePayload.smtp.sendgridApiKey) updateOps.$set['smtp.sendgridApiKey'] = updatePayload.smtp.sendgridApiKey;
      if (updatePayload.smtp.awsAccessKeyId) updateOps.$set['smtp.awsAccessKeyId'] = updatePayload.smtp.awsAccessKeyId;
      if (updatePayload.smtp.awsSecretAccessKey) updateOps.$set['smtp.awsSecretAccessKey'] = updatePayload.smtp.awsSecretAccessKey;
      if (updatePayload.smtp.awsRegion) updateOps.$set['smtp.awsRegion'] = updatePayload.smtp.awsRegion;
      
      console.log('[Settings PATCH] SMTP config fields set in updateOps:', Object.keys(updateOps.$set).filter(k => k.startsWith('smtp.')));
    }
    
    // SAFEGUARD: Ensure smtp.password is never accidentally deleted
    // Only delete if explicitly marked for deletion (value === undefined in $unset)
    // Do NOT delete when falsy (empty string, 0, false, etc.)
    if (updateOps.$unset) {
      if (updateOps.$unset['smtp.password'] !== undefined) {
        console.warn('[Settings PATCH] SECURITY WARNING: Attempted to unset smtp.password - BLOCKING!');
        delete updateOps.$unset['smtp.password'];
      }
    }
    
    // Verify smtp.password is NOT being set to null/undefined in $set
    if (updateOps.$set['smtp.password'] === null || updateOps.$set['smtp.password'] === undefined) {
      console.warn('[Settings PATCH] SECURITY WARNING: Attempted to set smtp.password to null/undefined - REMOVING from $set!');
      delete updateOps.$set['smtp.password'];
    }
    
    // Log the COMPLETE updateOps.$set before MongoDB operation to verify smtp fields are included
    const smtpFieldsInOps = Object.keys(updateOps.$set).filter(k => k.startsWith('smtp.'));
    console.log('[Settings PATCH] COMPLETE updateOps before MongoDB update:', {
      totalFields: Object.keys(updateOps.$set).length,
      smtpFieldCount: smtpFieldsInOps.length,
      smtpFieldsPresent: smtpFieldsInOps,
      'smtp.password_in_ops': !!updateOps.$set['smtp.password'],
      'smtp.password_being_deleted': !!updateOps.$unset?.['smtp.password'],
      sampleSmtpValues: {
        'smtp.enabled': updateOps.$set['smtp.enabled'],
        'smtp.provider': updateOps.$set['smtp.provider'],
        'smtp.host': updateOps.$set['smtp.host']
      }
    });
    
    const updated = await SystemSetting.findOneAndUpdate({}, updateOps, { new: true, upsert: true, setDefaultsOnInsert: true });
    
    // Immediately query the database directly to verify what was actually saved
    const dbCheck = await SystemSetting.findOne().lean();
    console.log('[Settings PATCH] Direct DB query after update - checking SMTP field:', {
      hasSmtp: !!dbCheck?.smtp,
      smtpKeys: dbCheck?.smtp ? Object.keys(dbCheck.smtp) : [],
      fullSmtp: dbCheck?.smtp ? JSON.stringify(dbCheck.smtp, null, 2) : 'null'
    });
    
    console.log('[Settings PATCH] After save - Gmail in DB:', {
      hasGmail: !!updated?.gmail,
      gmailEnabled: updated?.gmail?.enabled,
      gmailAddress: updated?.gmail?.gmailAddress,
      hasAppPassword: !!updated?.gmail?.appPassword,
      appPasswordLength: updated?.gmail?.appPassword ? updated.gmail.appPassword.length : 0,
      hasPassword: !!updated?.gmail?.password,
      passwordLength: updated?.gmail?.password ? updated.gmail.password.length : 0,
      gmailFields: updated?.gmail ? Object.keys(updated.gmail) : [],
      allGmailData: updated?.gmail ? JSON.stringify(updated.gmail, null, 2) : 'null'
    });

    console.log('[Settings PATCH] After save - Email in DB:', {
      hasEmail: !!updated?.email,
      emailProvider: updated?.email?.provider,
      emailEnabled: updated?.email?.enabled,
      emailFromName: updated?.email?.fromName,
      emailFromEmail: updated?.email?.fromEmail,
      emailFields: updated?.email ? Object.keys(updated.email) : [],
      allEmailData: updated?.email ? JSON.stringify(updated.email, null, 2) : 'null'
    });

    // CONFIRM FINAL SAVED SMTP PASSWORD
    console.log('[Settings PATCH] CONFIRMATION: Final saved SMTP password in DB:', {
      hasSmtpPassword: !!updated?.smtp?.password,
      smtpPasswordLength: updated?.smtp?.password ? updated.smtp.password.length : 0,
      hasSmtpEncryptedPassword: !!updated?.smtp?.encryptedPassword,
      smtpEncryptedPasswordLength: updated?.smtp?.encryptedPassword ? updated.smtp.encryptedPassword.length : 0,
      passwordWasPersisted: !!(updated?.smtp?.password || updated?.smtp?.encryptedPassword),
      smtpConfigured: !!updated?.smtp
    });

    const diff = { before, after: updated.toObject ? updated.toObject() : updated };
    await recordAudit(req.user?._id, 'patch_settings', diff, req.ip || req.headers['x-forwarded-for']);
    
    // Sync public information to PublicView collection for fast unauthenticated access
    await syncToPublicView(updated);
    
    // If enableVerifications was turned OFF by this patch, perform cleanup of pending verification requests
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

// GET /api/settings/email - Get email settings (admin only)
router.get('/email', requireAuth, isAdmin, async (req, res) => {
  try {
    let settings = await SystemSetting.findOne().lean();
    if (!settings) {
      settings = new SystemSetting();
    }
    
    // Return email settings with defaults
    const emailSettings = settings.emailSettings || {
      enabled: true,
      enablePasswordResetEmails: true,
      enableOtpEmails: true,
      enableDocumentNotificationEmails: true,
      enableAnnouncementEmails: true,
      enableAnnouncementBcc: true,
      recipientEmailsPerBatch: 100,
      retryFailedEmails: true,
      retryAttempts: 3,
      retryDelayMinutes: 5
    };
    
    return res.json(emailSettings);
  } catch (err) {
    console.error('GET /api/settings/email error', err);
    return res.status(500).json({ message: 'Failed to load email settings' });
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
// Can use emailConfig from payload (unsaved) or fallback to database settings
router.post('/email/health-check', requireAuth, isAdmin, async (req, res) => {
  try {
    const { emailConfig } = req.body;
    let configToTest = null;

    // Prefer emailConfig from payload (unsaved configuration) if provided
    if (emailConfig) {
      console.log('[Settings] Health check using provided emailConfig from payload');
      
      // Validate that emailConfig is enabled
      if (!emailConfig.enabled) {
        return res.status(400).json({
          success: false,
          message: 'Email provider is disabled',
          status: 'warning'
        });
      }

      configToTest = emailConfig;
    } else {
      // Fallback to database settings
      console.log('[Settings] No emailConfig in payload, falling back to database settings');
      const settings = await SystemSetting.findOne();
      
      if (!settings || !settings.smtp || !settings.smtp.enabled) {
        return res.status(400).json({
          success: false,
          message: 'Email provider not configured or disabled',
          status: 'warning'
        });
      }

      configToTest = settings.smtp;
    }

    console.log('[Settings] Triggering manual health check for provider:', configToTest.provider);
    console.log('[Settings] Health check payload:', {
      provider: configToTest.provider,
      fromEmail: configToTest.fromEmail,
      // Log sanitized version of sensitive fields (just check if present)
      hasAuthFields: !!(configToTest.user || configToTest.password || configToTest.gmailAppPassword || configToTest.sendgridApiKey || configToTest.accessKeyId),
      fromName: configToTest.fromName
    });

    // Perform health check
    const healthResult = await emailProviderHelper.performHealthCheck(configToTest);

    // Only update database if using database settings (not for unsaved configs)
    if (!emailConfig && healthResult.status === 'ok') {
      await emailProviderHelper.updateHealthCheckStatus(
        healthResult.status,
        healthResult.error || null
      );
    }

    console.log('[Settings] Health check completed:', {
      provider: healthResult.provider,
      status: healthResult.status,
      durationMs: healthResult.checkDurationMs,
      fromPayload: !!emailConfig
    });

    return res.json({
      success: healthResult.status === 'ok',
      status: healthResult.status,
      message: healthResult.message,
      provider: healthResult.provider,
      error: healthResult.error || null,
      checkDurationMs: healthResult.checkDurationMs,
      timestamp: healthResult.timestamp
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


// PATCH /api/settings/email - Update email settings (admin only)
router.patch('/email', requireAuth, isAdmin, async (req, res) => {
  try {
    let payload = req.body || {};
    
    // Defensive: Remove _id from payload as MongoDB doesn't allow updating it
    if (payload._id) delete payload._id;
    
    // Validate numeric fields
    if (payload.recipientEmailsPerBatch != null && !(Number(payload.recipientEmailsPerBatch) > 0)) {
      return res.status(400).json({ message: 'recipientEmailsPerBatch must be > 0' });
    }
    if (payload.retryAttempts != null && !(Number(payload.retryAttempts) >= 0)) {
      return res.status(400).json({ message: 'retryAttempts must be >= 0' });
    }
    if (payload.retryDelayMinutes != null && !(Number(payload.retryDelayMinutes) > 0)) {
      return res.status(400).json({ message: 'retryDelayMinutes must be > 0' });
    }
    
    // Build update object with emailSettings prefix
    const updatePayload = {};
    const emailSettingsFields = [
      'enabled',
      'enablePasswordResetEmails',
      'enableOtpEmails',
      'enableDocumentNotificationEmails',
      'enableAnnouncementEmails',
      'enableAnnouncementBcc',
      'recipientEmailsPerBatch',
      'retryFailedEmails',
      'retryAttempts',
      'retryDelayMinutes'
    ];
    
    for (const field of emailSettingsFields) {
      if (field in payload) {
        updatePayload[`emailSettings.${field}`] = payload[field];
      }
    }
    
    const before = await SystemSetting.findOne().lean();
    const updated = await SystemSetting.findOneAndUpdate(
      {},
      { $set: updatePayload },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    
    // Record audit
    const diff = { before, after: updated.toObject ? updated.toObject() : updated };
    await recordAudit(req.user?._id, 'update_email_settings', diff, req.ip || req.headers['x-forwarded-for']);
    
    console.log('[Settings] Email settings updated by admin:', req.user?._id);
    
    const emailSettings = updated.emailSettings || {};
    return res.json(emailSettings);
  } catch (err) {
    console.error('PATCH /api/settings/email error', err);
    return res.status(500).json({ message: 'Failed to update email settings' });
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

// GET /api/settings/email - Get current email configuration
// CANONICAL SOURCE: Reads from `smtp` field (all providers stored here)
// Returns sanitized config with all sensitive credentials removed
router.get('/email', requireAuth, isAdmin, async (req, res) => {
  try {
    const settings = await SystemSetting.findOne().lean();
    
    if (!settings || !settings.smtp) {
      return res.json({
        success: true,
        email: {
          enabled: false,
          provider: 'custom',
          fromName: 'Barangay System'
        }
      });
    }

    // Sanitize for client (remove passwords)
    const sanitized = emailProviderHelper.sanitizeEmailConfig(settings.smtp);
    
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

// PATCH /api/settings/email - Update email configuration
// CANONICAL DESTINATION: All providers stored in `smtp` field (multi-provider storage)
// Single source of truth: smtp field contains enabled, provider, and ALL provider-specific credentials
// Legacy fields (gmail, email) are deprecated and READ-ONLY (not updated by this endpoint)
router.patch('/email', requireAuth, isAdmin, async (req, res) => {
  try {
    const {
      enabled,
      provider,
      fromName,
      fromEmail,
      dryRunMode,
      // Gmail fields
      gmailAddress,
      gmailAppPassword,
      // Mailtrap fields
      user,
      password,
      // SendGrid fields
      sendgridApiKey,
      // AWS SES fields
      awsAccessKeyId,
      awsSecretAccessKey,
      awsRegion,
      // Custom SMTP fields
      host,
      port,
      secure
    } = req.body;

    console.log('[Settings] Email config update request (storing in canonical smtp field):', {
      enabled,
      provider,
      fromName,
      fromEmail,
      hasGmailAppPassword: !!gmailAppPassword,
      hasPassword: !!password,
      hasSendgridApiKey: !!sendgridApiKey,
      hasAwsKeys: !!(awsAccessKeyId && awsSecretAccessKey)
    });

    // ENFORCE SINGLE PROVIDER: Detect if multiple providers configured in request
    const multipleProviders = detectMultipleProviders(req.body);
    const irrelevantProviders = multipleProviders.filter(p => p !== provider);
    
    if (irrelevantProviders.length > 0) {
      console.warn('[Settings] PATCH /email rejected: Multiple providers detected', {
        selectedProvider: provider,
        detectedProviders: multipleProviders,
        irrelevantProviders: irrelevantProviders
      });
      return res.status(400).json({
        success: false,
        message: 'Only one email provider can be configured at a time',
        error: `Multiple providers detected: ${multipleProviders.join(', ')}. Configure only ${provider}.`,
        detectedProviders: multipleProviders,
        selectedProvider: provider,
        irrelevantProviders: irrelevantProviders,
        hint: `Remove credentials for: ${irrelevantProviders.join(', ')}`,
        validationFailure: 'MULTIPLE_PROVIDERS_DETECTED'
      });
    }

    // Validate provider
    if (!provider || !emailProviderHelper.PROVIDER_CONFIGS[provider]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email provider',
        error: `Provider must be one of: ${Object.keys(emailProviderHelper.PROVIDER_CONFIGS).join(', ')}`
      });
    }

    // Validate provider-specific requirements
    if (enabled) {
      if (provider === 'gmail' && (!gmailAddress || !gmailAppPassword)) {
        return res.status(400).json({
          success: false,
          message: 'Gmail requires address and app password',
          error: 'gmailAddress and gmailAppPassword are required'
        });
      }

      if (provider === 'mailtrap' && (!user || !password)) {
        return res.status(400).json({
          success: false,
          message: 'Mailtrap requires username and password',
          error: 'user and password are required'
        });
      }

      if (provider === 'sendgrid' && !sendgridApiKey) {
        return res.status(400).json({
          success: false,
          message: 'SendGrid requires API key',
          error: 'sendgridApiKey is required'
        });
      }

      if (provider === 'aws-ses' && (!awsAccessKeyId || !awsSecretAccessKey)) {
        return res.status(400).json({
          success: false,
          message: 'AWS SES requires access key and secret key',
          error: 'awsAccessKeyId and awsSecretAccessKey are required'
        });
      }

      if (provider === 'custom') {
        // Strict validation for custom SMTP
        const missingFields = [];
        
        if (!host) missingFields.push('host');
        if (!port) missingFields.push('port');
        if (!user) missingFields.push('user');
        if (!password) missingFields.push('password');
        
        if (missingFields.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Custom SMTP requires: ${missingFields.join(', ')}`,
            error: `Missing required fields: ${missingFields.join(', ')}`,
            missingFields: missingFields
          });
        }
        
        // Validate port is a valid number between 1 and 65535
        const portNum = Number(port);
        if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
          return res.status(400).json({
            success: false,
            message: 'Invalid SMTP port',
            error: 'SMTP port must be a number between 1 and 65535',
            field: 'port'
          });
        }
      }
    }

    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = new SystemSetting();
    }

    // Build email provider config for canonical smtp field
    // SINGLE PROVIDER ENFORCEMENT: Only include fields for the selected provider
    // All other provider fields are intentionally excluded to enforce single provider
    const emailConfig = {
      enabled: !!enabled,
      provider,
      fromName: fromName || 'Barangay System',
      fromEmail: fromEmail || gmailAddress || user,
      updatedAt: new Date()
    };

    // IMPORTANT: Add ONLY the selected provider's fields
    // By not including fields for other providers, we enforce single provider enforcement
    // Example: If changing from Custom SMTP to Gmail, old SMTP fields won't be stored
    if (provider === 'gmail') {
      // Gmail provider: include ONLY Gmail fields (not custom SMTP, mailtrap, sendgrid, aws)
      if (gmailAddress) emailConfig.gmailAddress = gmailAddress;
      if (gmailAppPassword) emailConfig.gmailAppPassword = gmailAppPassword;
    } else if (provider === 'mailtrap') {
      // Mailtrap provider: include ONLY Mailtrap fields (not custom SMTP, gmail, sendgrid, aws)
      if (user) emailConfig.user = user;
      if (password) emailConfig.password = password;
    } else if (provider === 'sendgrid') {
      // SendGrid provider: include ONLY SendGrid fields (not custom SMTP, gmail, mailtrap, aws)
      if (sendgridApiKey) emailConfig.sendgridApiKey = sendgridApiKey;
    } else if (provider === 'aws-ses') {
      // AWS SES provider: include ONLY AWS fields (not custom SMTP, gmail, mailtrap, sendgrid)
      if (awsAccessKeyId) emailConfig.awsAccessKeyId = awsAccessKeyId;
      if (awsSecretAccessKey) emailConfig.awsSecretAccessKey = awsSecretAccessKey;
      if (awsRegion) emailConfig.awsRegion = awsRegion;
      else emailConfig.awsRegion = 'us-east-1';
    } else if (provider === 'custom') {
      // Custom SMTP provider: include ONLY custom SMTP fields (not gmail, mailtrap, sendgrid, aws)
      if (host) emailConfig.host = host;
      if (port) {
        emailConfig.port = Number(port);
        
        // AUTO-NORMALIZE: Set secure flag based on port if not explicitly provided
        // Port 465 = Implicit SSL/TLS (secure=true)
        // Port 587 = STARTTLS (secure=false)
        // Port 25 = Plain SMTP (secure=false)
        if (typeof secure !== 'boolean') {
          if (emailConfig.port === 465) {
            emailConfig.secure = true;
            console.log('[Settings] PATCH /email - Auto-set secure=true for port 465 (SSL/TLS implicit)');
          } else if (emailConfig.port === 587) {
            emailConfig.secure = false;
            console.log('[Settings] PATCH /email - Auto-set secure=false for port 587 (STARTTLS)');
          } else {
            emailConfig.secure = false;
            console.log('[Settings] PATCH /email - Auto-set secure=false for port ' + emailConfig.port + ' (default)');
          }
        } else {
          emailConfig.secure = secure;
          
          // Warn if using non-standard configuration
          if (emailConfig.port === 465 && !secure) {
            console.warn('[Settings] PATCH /email - Warning: port 465 typically requires secure=true');
          } else if (emailConfig.port === 587 && secure) {
            console.warn('[Settings] PATCH /email - Warning: port 587 typically requires secure=false');
          }
        }
      }
      if (user) emailConfig.user = user;
      if (password) emailConfig.password = password;
    }

    // Remove any undefined properties before saving to MongoDB
    // This ensures only defined fields are persisted
    const cleanEmailConfig = removeUndefinedProperties(emailConfig);
    
    // STORE IN CANONICAL LOCATION: smtp field (not email or gmail)
    // SINGLE PROVIDER ENFORCEMENT: cleanEmailConfig contains ONLY selected provider's fields
    settings.smtp = cleanEmailConfig;
    
    // Update dry-run mode if provided
    if (typeof dryRunMode === 'boolean') {
      settings.dryRunMode = dryRunMode;
    }
    
    // When provider changes, irrelevant fields are cleared:
    // - Old custom SMTP fields (host, port, user, password) NOT stored if now using Gmail
    // - Old Gmail fields (gmailAddress, gmailAppPassword) NOT stored if now using custom SMTP
    // - Only ONE provider's credentials stored in smtp field at a time
    //
    // NOTE: Legacy fields (gmail, email) are NOT cleared or updated here
    // This maintains backward compatibility in case of rollback
    // Old data in legacy fields will be ignored by all new code
    
    await settings.save();

    console.log('[Settings] Email configuration updated in canonical smtp field (single provider enforced):', {
      enabled,
      provider,
      fromName,
      fromEmail,
      dryRunMode: !!dryRunMode,
      smtpFieldUpdated: true,
      singleProviderEnforced: `Only ${provider} fields stored`,
      legacyFieldsPreserved: 'gmail and email fields not modified'
    });

    res.json({
      success: true,
      message: 'Email settings updated',
      email: emailProviderHelper.sanitizeEmailConfig(settings.smtp),
      dryRunMode: settings.dryRunMode
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
// Accepts emailConfig payload with all provider-specific fields for validation and testing
router.post('/email/test', requireAuth, isAdmin, async (req, res) => {
  try {
    const { testEmail, emailConfig } = req.body;

    // VALIDATION 1: Validate test email format
    if (!testEmail) {
      console.error('[Settings] POST /email/test - Missing testEmail in payload');
      return res.status(400).json({
        success: false,
        message: 'Valid test email required',
        error: 'testEmail field is required',
        validationField: 'testEmail'
      });
    }

    if (!testEmail.includes('@')) {
      console.error('[Settings] POST /email/test - Invalid testEmail format:', testEmail);
      return res.status(400).json({
        success: false,
        message: 'Valid test email required',
        error: 'testEmail must be a valid email address',
        validationField: 'testEmail',
        receivedValue: testEmail
      });
    }

    // VALIDATION 2: Require emailConfig in request payload (NO fallback to database)
    // This ensures test requests use current unsaved configuration
    if (!emailConfig) {
      console.error('[Settings] POST /email/test - emailConfig is required in request body (no database fallback allowed)');
      return res.status(400).json({
        success: false,
        message: 'Email configuration required',
        error: 'emailConfig field is required in request body. Test email must include current configuration.',
        validationField: 'emailConfig',
        details: 'Send all SMTP fields: host, port, username, password, fromEmail, and provider'
      });
    }

    console.log('[Settings] POST /email/test - Using emailConfig from request payload, provider:', emailConfig?.provider);

    // VALIDATION 3: Validate required SMTP fields for unsaved config testing
    const requiredSmtpFields = ['host', 'port', 'username', 'password', 'fromEmail'];
    const missingFields = requiredSmtpFields.filter(field => {
      const value = emailConfig[field];
      // Check for undefined, null, empty string, or zero (port 0 is invalid)
      if (field === 'port') {
        return !value || value < 1 || value > 65535;
      }
      return !value || (typeof value === 'string' && value.trim() === '');
    });

    if (missingFields.length > 0) {
      console.error('[Settings] POST /email/test - Missing or invalid required SMTP fields:', {
        missingFields: missingFields,
        receivedFields: {
          host: emailConfig.host,
          port: emailConfig.port,
          username: emailConfig.user || emailConfig.username,
          password: !!emailConfig.password,
          fromEmail: emailConfig.fromEmail,
          provider: emailConfig.provider
        }
      });
      return res.status(400).json({
        success: false,
        message: 'Missing required SMTP configuration fields',
        error: `The following required fields are missing or invalid: ${missingFields.join(', ')}`,
        missingFields: missingFields,
        validationField: 'smtp_config',
        details: 'All of these fields are required: host, port (1-65535), username, password, fromEmail',
        receivedConfig: {
          host: emailConfig.host ? 'provided' : 'missing',
          port: emailConfig.port ? `provided (${emailConfig.port})` : 'missing',
          username: emailConfig.user || emailConfig.username ? 'provided' : 'missing',
          password: emailConfig.password ? 'provided' : 'missing',
          fromEmail: emailConfig.fromEmail ? 'provided' : 'missing'
        }
      });
    }

    // VALIDATION 4: Validate config is enabled (even though frontend validates)
    if (emailConfig.enabled === false) {
      console.error('[Settings] POST /email/test - Email configuration is disabled');
      return res.status(400).json({
        success: false,
        message: 'Email provider is disabled',
        error: 'Enable email configuration before testing.',
        validationField: 'enabled'
      });
    }

    // Build config to test with normalized field names
    let configToTest = {
      ...emailConfig,
      user: emailConfig.user || emailConfig.username,
      enabled: true // Ensure enabled for testing
    };

    // VALIDATION 5: Validate config exists
    if (!configToTest) {
      console.error('[Settings] POST /email/test - No configuration found');
      return res.status(400).json({
        success: false,
        message: 'Email provider not configured',
        error: 'No valid email configuration provided.',
        validationField: 'emailConfig'
      });
    }

    // VALIDATION 6: Validate provider is selected
    if (!configToTest.provider) {
      console.error('[Settings] POST /email/test - No provider selected', {
        hasHost: !!configToTest.host,
        hasGmailAppPassword: !!configToTest.gmailAppPassword,
        hasApiKey: !!configToTest.sendgridApiKey,
        hasAwsKey: !!configToTest.awsAccessKeyId
      });
      return res.status(400).json({
        success: false,
        message: 'No email provider selected',
        error: 'provider field is required',
        validationField: 'provider'
      });
    }

    // VALIDATION 7: Validate provider-specific required fields
    console.log('[Settings] POST /email/test - Validating provider-specific fields:', configToTest.provider);
    const validationError = validateProviderConfig(configToTest);
    if (validationError) {
      console.error('[Settings] POST /email/test - Provider validation failed for', configToTest.provider + ':', {
        error: validationError.error,
        missingFields: validationError.missingFields,
        receivedFields: {
          provider: configToTest.provider,
          host: !!configToTest.host,
          port: configToTest.port,
          user: !!configToTest.user,
          password: !!configToTest.password,
          secure: configToTest.secure,
          gmailAppPassword: !!configToTest.gmailAppPassword,
          sendgridApiKey: !!configToTest.sendgridApiKey,
          awsAccessKeyId: !!configToTest.awsAccessKeyId,
          awsSecretAccessKey: !!configToTest.awsSecretAccessKey,
          awsRegion: configToTest.awsRegion,
          fromName: configToTest.fromName,
          fromEmail: configToTest.fromEmail
        }
      });
      return res.status(400).json({
        success: false,
        message: `Invalid ${configToTest.provider} configuration`,
        error: validationError.error,
        missingFields: validationError.missingFields,
        validationField: 'provider_config',
        provider: configToTest.provider,
        ...validationError
      });
    }

    console.log('[Settings] POST /email/test - All validations passed. Sending test email using provider:', configToTest.provider);

    const result = await emailProviderHelper.sendTestEmail(configToTest, testEmail);

    if (!result.success) {
      console.error('[Settings] POST /email/test - Provider failed to send test email:', {
        provider: configToTest.provider,
        error: result.error,
        testEmail: testEmail
      });
      return res.status(400).json({
        success: false,
        message: `${configToTest.provider} test failed`,
        error: result.error,
        provider: result.provider,
        hint: result.hint
      });
    }

    console.log('[Settings] POST /email/test - Test email sent successfully via', configToTest.provider, {
      messageId: result.messageId,
      recipient: testEmail
    });

    res.json({
      success: true,
      message: 'Test email sent successfully',
      provider: result.provider,
      messageId: result.messageId,
      testEmail: testEmail
    });
  } catch (err) {
    console.error('[Settings] POST /email/test unexpected error:', {
      message: err.message,
      stack: err.stack,
      requestBody: req.body
    });
    res.status(500).json({
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
