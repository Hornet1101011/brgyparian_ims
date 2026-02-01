const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const isAdmin = require('../middleware/isAdmin');
const { encryptText, decryptText } = require('../utils/cryptoHelper');
const smtpHelper = require('../utils/smtpHelper');
const gmailHelper = require('../utils/gmailHelper');
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
    const payload = req.body || {};
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
      if (key === 'smtp' || key === 'emailSettings' || key === 'gmail') {
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
      
      // Handle app password encryption if provided
      if (gmailData.appPassword) {
        try {
          gmailData.appPassword = gmailHelper.encryptGmailPassword(gmailData.appPassword);
          console.log('[Settings] Gmail app password encrypted');
        } catch (e) {
          console.error('Failed to encrypt Gmail app password', e.message);
          return res.status(500).json({ message: e.message });
        }
      }
      
      updatePayload.gmail = gmailData;
      console.log('[Settings] Gmail data prepared for update:', {
        enabled: gmailData.enabled,
        gmailAddress: gmailData.gmailAddress,
        hasPassword: !!gmailData.appPassword,
        displayName: gmailData.displayName
      });
    }

    const before = await SystemSetting.findOne().lean();
    const updated = await SystemSetting.findOneAndUpdate({}, { $set: updatePayload }, { new: true, upsert: true, setDefaultsOnInsert: true });
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
    const payload = req.body || {};
    
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
    const { gmailAddress, appPassword, displayName, useAppPassword, enabled } = req.body;
    
    // Validate Gmail config
    const config = {
      gmailAddress,
      appPassword,
      useAppPassword: useAppPassword !== false
    };
    
    const errors = gmailHelper.validateGmailConfig(config);
    if (errors.length > 0) {
      return res.status(400).json({ message: 'Validation error', errors });
    }
    
    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = new SystemSetting();
    }
    
    // Encrypt the app password
    const encryptedPassword = gmailHelper.encryptGmailPassword(appPassword);
    
    settings.gmail = {
      enabled,
      gmailAddress,
      encryptedPassword: encryptedPassword,
      displayName: displayName || gmailAddress.split('@')[0],
      useAppPassword: useAppPassword !== false
    };
    
    const updated = await settings.save();
    
    // Record audit
    await recordAudit(req.user._id, 'gmail_config_updated', {
      gmailAddress,
      enabled,
      displayName
    }, req.ip);
    
    console.log('[Settings] Gmail configuration updated by admin:', req.user._id);
    
    // Clear transporter cache so next email uses new config
    // This is done by the email service itself when it detects settings have changed
    
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
    const { testEmail } = req.body;
    
    if (!testEmail || !testEmail.includes('@')) {
      return res.status(400).json({ message: 'Valid test email is required' });
    }
    
    const settings = await SystemSetting.findOne().lean();
    if (!settings?.gmail?.enabled || !settings.gmail.gmailAddress) {
      return res.status(400).json({ message: 'Gmail is not configured or enabled' });
    }
    
    // Prepare config for testing (decrypt password)
    const gmailConfig = {
      ...settings.gmail,
      appPassword: settings.gmail.encryptedPassword ? 
        gmailHelper.decryptGmailPassword(settings.gmail.encryptedPassword) : null
    };
    
    const result = await gmailHelper.testGmailConnection(gmailConfig, testEmail);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Gmail test failed',
        error: result.error
      });
    }
    
    console.log('[Settings] Gmail test successful by admin:', req.user._id);
    
    return res.json({
      success: true,
      message: 'Test email sent successfully',
      messageId: result.messageId
    });
  } catch (err) {
    console.error('POST /api/settings/gmail/test error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to test Gmail',
      error: err.message
    });
  }
});

module.exports = router;
