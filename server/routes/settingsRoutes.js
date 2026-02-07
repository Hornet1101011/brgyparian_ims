const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const isAdmin = require('../middleware/isAdmin');
const { encryptText, decryptText } = require('../utils/cryptoHelper');
const smtpHelper = require('../utils/smtpHelper');
const gmailHelper = require('../utils/gmailHelper');
const emailProviderHelper = require('../utils/emailProviderHelper');
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

// Helper: filter smtp password presence
function sanitizeForClient(setting) {
  const s = setting.toObject ? setting.toObject() : { ...setting };
  if (s.smtp) {
    s.smtp = smtpHelper.sanitizeSMTPConfig(s.smtp);
  }
  // Sanitize Gmail settings - remove encrypted password before sending to client
  if (s.gmail && s.gmail.encryptedPassword) {
    s.gmail = {
      enabled: s.gmail.enabled,
      gmailAddress: s.gmail.gmailAddress,
      displayName: s.gmail.displayName,
      useAppPassword: s.gmail.useAppPassword,
      // Do NOT send encryptedPassword to client
    };
  }
  // Sanitize email provider settings - mask password if present
  if (s.email && s.email.password) {
    s.email = {
      ...s.email,
      password: s.email.password ? '***MASKED***' : undefined
    };
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

    // Handle email provider configuration
    if (payload.email) {
      updatePayload.email = payload.email;
      console.log('[Settings] Email provider config updated:', {
        provider: payload.email.provider,
        enabled: payload.email.enabled,
        fromName: payload.email.fromName,
        fromEmail: payload.email.fromEmail,
        keys: Object.keys(payload.email)
      });
    }
    
    // Handle SMTP updates with proper nesting
    if (payload.smtp) {
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
      if (key !== 'gmail' && key !== 'email') {
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

    // Explicitly set each email provider field to ensure Mongoose saves them properly
    if (updatePayload.email) {
      console.log('[Settings PATCH] Setting individual email provider fields:', {
        'email.enabled': updatePayload.email.enabled,
        'email.provider': updatePayload.email.provider,
        'email.fromName': updatePayload.email.fromName,
        'email.fromEmail': updatePayload.email.fromEmail,
        'email_keys': Object.keys(updatePayload.email)
      });
      
      // Set individual email fields to ensure nested object is properly saved
      updateOps.$set['email.enabled'] = updatePayload.email.enabled;
      updateOps.$set['email.provider'] = updatePayload.email.provider;
      updateOps.$set['email.fromName'] = updatePayload.email.fromName;
      updateOps.$set['email.fromEmail'] = updatePayload.email.fromEmail;
      updateOps.$set['email.host'] = updatePayload.email.host;
      updateOps.$set['email.port'] = updatePayload.email.port;
      updateOps.$set['email.secure'] = updatePayload.email.secure;
      updateOps.$set['email.user'] = updatePayload.email.user;
      updateOps.$set['email.password'] = updatePayload.email.password;
      
      // Include provider-specific fields if present
      if (updatePayload.email.gmailAddress) updateOps.$set['email.gmailAddress'] = updatePayload.email.gmailAddress;
      if (updatePayload.email.gmailAppPassword) updateOps.$set['email.gmailAppPassword'] = updatePayload.email.gmailAppPassword;
      if (updatePayload.email.sendgridApiKey) updateOps.$set['email.sendgridApiKey'] = updatePayload.email.sendgridApiKey;
      if (updatePayload.email.awsAccessKeyId) updateOps.$set['email.awsAccessKeyId'] = updatePayload.email.awsAccessKeyId;
      if (updatePayload.email.awsSecretAccessKey) updateOps.$set['email.awsSecretAccessKey'] = updatePayload.email.awsSecretAccessKey;
      if (updatePayload.email.awsRegion) updateOps.$set['email.awsRegion'] = updatePayload.email.awsRegion;
      
      console.log('[Settings PATCH] Email config fields set in updateOps:', Object.keys(updateOps.$set).filter(k => k.startsWith('email.')));
    }
    
    // Log the COMPLETE updateOps.$set before MongoDB operation to verify email fields are included
    const emailFieldsInOps = Object.keys(updateOps.$set).filter(k => k.startsWith('email.'));
    console.log('[Settings PATCH] COMPLETE updateOps before MongoDB update:', {
      totalFields: Object.keys(updateOps.$set).length,
      emailFieldCount: emailFieldsInOps.length,
      emailFieldsPresent: emailFieldsInOps,
      sampleEmailValues: {
        'email.enabled': updateOps.$set['email.enabled'],
        'email.provider': updateOps.$set['email.provider'],
        'email.host': updateOps.$set['email.host']
      }
    });
    
    const updated = await SystemSetting.findOneAndUpdate({}, updateOps, { new: true, upsert: true, setDefaultsOnInsert: true });
    
    // Immediately query the database directly to verify what was actually saved
    const dbCheck = await SystemSetting.findOne().lean();
    console.log('[Settings PATCH] Direct DB query after update - checking email field:', {
      hasEmail: !!dbCheck?.email,
      emailKeys: dbCheck?.email ? Object.keys(dbCheck.email) : [],
      fullEmail: dbCheck?.email ? JSON.stringify(dbCheck.email, null, 2) : 'null'
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

    if (!settings || !settings.smtp || !settings.smtp.host) {
      return res.status(400).json({ success: false, message: 'SMTP not configured' });
    }

    // Default recipient: provided email > site contact email > admin email
    const recipient = to || settings.contactEmail || (req.user?.email) || null;
    if (!recipient) {
      return res.status(400).json({ success: false, message: 'No recipient email provided' });
    }

    try {
      const result = await smtpHelper.sendTestEmail(settings.smtp, {
        to: recipient,
        siteInfo: {
          siteName: settings.siteName,
          contactEmail: settings.contactEmail
        }
      });

      console.log('[SMTP Test] Success - sent to:', recipient);
      return res.json(result);
    } catch (err) {
      const message = err.message || 'Failed to send test email';
      console.error('[SMTP Test] Failed:', message);
      return res.status(500).json({ success: false, message });
    }
  } catch (err) {
    console.error('POST /api/settings/test-smtp error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
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
    const passwordToUse = settings.gmail.appPassword || settings.gmail.password;
    const passwordType = settings.gmail.appPassword ? 'appPassword (from database)' : 'password (from database)';
    
    console.log('[Settings] Test Email Password Selection:', {
      hasDbAppPassword: !!settings.gmail.appPassword,
      dbAppPasswordLength: settings.gmail.appPassword?.length || 0,
      hasDbPassword: !!settings.gmail.password,
      dbPasswordLength: settings.gmail.password?.length || 0,
      usingPasswordType: passwordType,
      selectedPasswordLength: passwordToUse.length,
      source: 'database only'
    });
    
    console.log('[Settings] Test Email Password Selection:', {
      hasAppPassword,
      appPasswordLength: settings.gmail.appPassword?.length || 0,
      hasRegularPassword,
      regularPasswordLength: settings.gmail.password?.length || 0,
      usingPasswordType: passwordType,
      selectedPasswordLength: passwordToUse.length,
      priority: 'appPassword > password'
    });
    
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
      passwordLength: gmailConfig.appPassword.length
    });
    
    const result = await gmailHelper.testGmailConnection(gmailConfig, testEmail);
    
    if (!result.success) {
      console.error('[Settings] Gmail test email failed:', {
        error: result.error,
        passwordType,
        testEmail,
        gmailAddress: gmailConfig.gmailAddress
      });
      return res.status(400).json({
        success: false,
        message: 'Gmail test failed',
        error: result.error,
        details: result.details || 'Check server logs for more information'
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
      message: 'Test email sent successfully',
      messageId: result.messageId,
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
router.get('/email', requireAuth, isAdmin, async (req, res) => {
  try {
    const settings = await SystemSetting.findOne().lean();
    
    if (!settings || !settings.email) {
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
    const sanitized = emailProviderHelper.sanitizeEmailConfig(settings.email);
    
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
router.patch('/email', requireAuth, isAdmin, async (req, res) => {
  try {
    const {
      enabled,
      provider,
      fromName,
      fromEmail,
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

    console.log('[Settings] Email config update request:', {
      enabled,
      provider,
      fromName,
      fromEmail,
      hasGmailAppPassword: !!gmailAppPassword,
      hasPassword: !!password,
      hasSendgridApiKey: !!sendgridApiKey,
      hasAwsKeys: !!(awsAccessKeyId && awsSecretAccessKey)
    });

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

      if (provider === 'custom' && (!host || !port)) {
        return res.status(400).json({
          success: false,
          message: 'Custom SMTP requires host and port',
          error: 'host and port are required'
        });
      }
    }

    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = new SystemSetting();
    }

    // Build email config
    const emailConfig = {
      enabled,
      provider,
      fromName: fromName || 'Barangay System',
      fromEmail: fromEmail || gmailAddress || user,
      updatedAt: new Date()
    };

    // Add provider-specific fields
    if (provider === 'gmail') {
      emailConfig.gmailAddress = gmailAddress;
      emailConfig.gmailAppPassword = gmailAppPassword;
    } else if (provider === 'mailtrap') {
      emailConfig.user = user;
      emailConfig.password = password;
    } else if (provider === 'sendgrid') {
      emailConfig.sendgridApiKey = sendgridApiKey;
    } else if (provider === 'aws-ses') {
      emailConfig.awsAccessKeyId = awsAccessKeyId;
      emailConfig.awsSecretAccessKey = awsSecretAccessKey;
      emailConfig.awsRegion = awsRegion || 'us-east-1';
    } else if (provider === 'custom') {
      emailConfig.host = host;
      emailConfig.port = port;
      emailConfig.secure = !!secure;
      emailConfig.user = user;
      emailConfig.password = password;
    }

    settings.email = emailConfig;
    await settings.save();

    console.log('[Settings] Email configuration updated:', {
      enabled,
      provider,
      fromName,
      fromEmail
    });

    res.json({
      success: true,
      message: 'Email settings updated',
      email: emailProviderHelper.sanitizeEmailConfig(settings.email)
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
router.post('/email/test', requireAuth, isAdmin, async (req, res) => {
  try {
    const { testEmail } = req.body;

    if (!testEmail || !testEmail.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'Valid test email required',
        error: 'testEmail must be a valid email address'
      });
    }

    const settings = await SystemSetting.findOne().lean();

    if (!settings || !settings.email || !settings.email.enabled) {
      return res.status(400).json({
        success: false,
        message: 'Email provider not configured or disabled',
        error: 'Enable email and configure provider settings first'
      });
    }

    if (!settings.email.provider) {
      return res.status(400).json({
        success: false,
        message: 'No email provider selected',
        error: 'Select an email provider in settings'
      });
    }

    console.log('[Settings] Sending test email using provider:', settings.email.provider);

    const result = await emailProviderHelper.sendTestEmail(settings.email, testEmail);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: `${settings.email.provider} test failed`,
        error: result.error,
        provider: result.provider
      });
    }

    console.log('[Settings] Test email sent successfully via', settings.email.provider);

    res.json({
      success: true,
      message: 'Test email sent successfully',
      provider: result.provider,
      messageId: result.messageId
    });
  } catch (err) {
    console.error('[Settings] POST /email/test error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: err.message
    });
  }
});

// ==================== END EMAIL PROVIDER ENDPOINTS ====================

module.exports = router;
