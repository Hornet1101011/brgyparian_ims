const nodemailer = require('nodemailer');
const gmailHelper = require('../../../utils/gmailHelper');

/**
 * Gmail SMTP Transporter
 * Uses environment variables BIMS_EMAIL and BIMS_EMAIL_PASSWORD or Gmail config
 * This transporter is reusable across the entire application
 */

let gmailTransporter = null;
let EmailLog = null;
let SystemSetting = null;

/**
 * Initialize SystemSetting model (lazy load to avoid circular dependencies)
 */
function getSystemSettingModel() {
  if (!SystemSetting) {
    try {
      SystemSetting = require('../models/SystemSetting');
      if (SystemSetting.default) {
        SystemSetting = SystemSetting.default;
      }
    } catch (err) {
      console.warn('[EmailService] Failed to load SystemSetting model for email settings:', err.message);
    }
  }
  return SystemSetting;
}

/**
 * Check if an email type is enabled based on SystemSetting configuration
 * @param {string} [emailType] - Type of email (password-reset, otp, document-notification, announcement)
 * @returns {Promise<boolean>} True if email type is enabled
 */
async function isEmailTypeEnabled(emailType) {
  try {
    const SystemSettingModel = getSystemSettingModel();
    if (!SystemSettingModel) {
      console.warn('[EmailService] SystemSetting model not available, allowing email');
      return true; // Fail open - allow email if settings can't be read
    }

    const settings = await SystemSettingModel.findOne();
    if (!settings || !settings.emailSettings) {
      console.warn('[EmailService] No email settings found, allowing email');
      return true; // Fail open
    }

    // Check global enable flag
    if (!settings.emailSettings.enabled) {
      console.log('[EmailService] Global email sending disabled');
      return false;
    }

    // Check specific email type flags
    switch (emailType) {
      case 'password-reset':
        return settings.emailSettings.enablePasswordResetEmails !== false;
      case 'otp':
        return settings.emailSettings.enableOtpEmails !== false;
      case 'document-notification':
        return settings.emailSettings.enableDocumentNotificationEmails !== false;
      case 'announcement':
        return settings.emailSettings.enableAnnouncementEmails !== false;
      default:
        // For generic emails or unknown types, check if global is enabled
        return settings.emailSettings.enabled !== false;
    }
  } catch (err) {
    console.error('[EmailService] Error checking email settings:', err.message);
    return true; // Fail open - allow email if there's an error
  }
}

/**
 * Initialize EmailLog model (lazy load to avoid circular dependencies)
 */
function getEmailLogModel() {
  if (!EmailLog) {
    try {
      // Note: This requires EmailLog model to be compiled, so we lazy load it
      EmailLog = require('../models/EmailLog').EmailLog;
    } catch (err) {
      console.warn('[EmailService] Failed to load EmailLog model for logging:', err.message);
    }
  }
  return EmailLog;
}

/**
 * Log email sending attempt to database
 * @param {string} recipient - Email recipient
 * @param {string} subject - Email subject
 * @param {boolean} success - Whether email was sent successfully
 * @param {string} [error] - Error message if failed
 * @param {string} [messageId] - Nodemailer message ID if successful
 * @param {string} [emailType] - Type of email (password-reset, announcement, etc.)
 * @param {number} [bccCount] - Number of BCC recipients
 */
async function logEmail(recipient, subject, success, error, messageId, emailType, bccCount) {
  try {
    const EmailLogModel = getEmailLogModel();
    if (!EmailLogModel) {
      console.warn('[EmailService] EmailLog model not available for logging');
      return;
    }

    await EmailLogModel.create({
      recipient: recipient || 'unknown',
      subject: subject || 'No subject',
      status: success ? 'sent' : 'failed',
      errorMessage: error || null,
      messageId: messageId || null,
      emailType: emailType || 'generic',
      bccRecipientsCount: bccCount || 0,
    });

    console.log(`[EmailService] Email log created for ${recipient} (${emailType})`);
  } catch (logErr) {
    // Don't fail the email process if logging fails
    console.error('[EmailService] Failed to log email:', logErr.message);
  }
}

/**
 * Initialize and return a transporter based on settings
 * Priority: Gmail (if enabled) > SMTP (from database) > Environment variables
 * @returns {object} Nodemailer transporter
 * @throws {Error} If no credentials configured
 */
async function getConfiguredTransporter() {
  // Clear cache to get fresh transporter
  gmailTransporter = null;

  try {
    // First, check if Gmail is enabled
    const SystemSettingModel = getSystemSettingModel();
    const settings = SystemSettingModel ? await SystemSettingModel.findOne().lean() : null;
    
    if (settings?.gmail?.enabled && settings.gmail.gmailAddress) {
      try {
        console.log('[EmailService] Creating transporter using Gmail configuration');
        gmailTransporter = gmailHelper.createGmailTransporter(settings.gmail);
        return gmailTransporter;
      } catch (err) {
        console.error('[EmailService] Failed to create Gmail transporter:', err.message);
        console.log('[EmailService] Falling back to SMTP or environment variables');
      }
    }
    
    // Try SMTP from database
    if (settings?.smtp?.host && settings.smtp.port && settings.smtp.user) {
      const decryptedPassword = settings.smtp.appPassword || settings.smtp.encryptedPassword;
      
      if (decryptedPassword) {
        console.log(`[EmailService] Creating transporter from database SMTP settings (${settings.smtp.host}:${settings.smtp.port})`);

        gmailTransporter = nodemailer.createTransport({
          host: settings.smtp.host,
          port: settings.smtp.port,
          secure: settings.smtp.secure === true,
          auth: {
            user: settings.smtp.user,
            pass: decryptedPassword,
          },
          tls: {
            rejectUnauthorized: false,
          },
        });

        return gmailTransporter;
      } else {
        console.warn('[EmailService] SMTP settings found in database but no password configured, falling back to environment variables');
      }
    }
  } catch (err) {
    console.warn('[EmailService] Failed to load settings from database, falling back to environment variables:', err.message);
  }

  // Fallback to environment variables
  const email = process.env.BIMS_EMAIL || process.env.SMTP_USER;
  const password = process.env.BIMS_EMAIL_PASSWORD || process.env.SMTP_PASSWORD;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '465');
  const smtpSecure = process.env.SMTP_SECURITY === 'SSL' ? true : (smtpPort === 465 ? true : false);

  if (!email || !password) {
    const error = new Error(
      'Missing email credentials. Please configure Gmail or SMTP settings in admin settings or set BIMS_EMAIL and BIMS_EMAIL_PASSWORD environment variables.'
    );
    console.error('[EmailService] ' + error.message);
    throw error;
  }

  try {
    gmailTransporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: email,
        pass: password,
      },
      connectionTimeout: 30000,
      socketTimeout: 30000,
      greetingTimeout: 30000,
      pool: {
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000,
        rateLimit: 14,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    console.log('[EmailService] SMTP transporter initialized successfully', `(${smtpHost}:${smtpPort})`);
    return gmailTransporter;
  } catch (err) {
    console.error('[EmailService] Failed to initialize transporter:', err);
    throw err;
  }
}

/**
 * Initialize and return a Gmail SMTP transporter (legacy function for backward compatibility)
 * Caches the transporter instance to avoid recreating it
 * @returns {object} Nodemailer transporter
 * @throws {Error} If Gmail credentials are missing
 */
function getGmailTransporter() {
  if (gmailTransporter) {
    return gmailTransporter;
  }

  // Support both BIMS_EMAIL/BIMS_EMAIL_PASSWORD and SMTP_USER/SMTP_PASSWORD
  const email = process.env.BIMS_EMAIL || process.env.SMTP_USER;
  const password = process.env.BIMS_EMAIL_PASSWORD || process.env.SMTP_PASSWORD;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '465');
  const smtpSecure = process.env.SMTP_SECURITY === 'SSL' ? true : (smtpPort === 465 ? true : false);

  if (!email || !password) {
    const error = new Error(
      'Missing email credentials. Please configure SMTP settings in admin settings or set BIMS_EMAIL and BIMS_EMAIL_PASSWORD environment variables.'
    );
    console.error('[EmailService] ' + error.message);
    throw error;
  }

  try {
    gmailTransporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: email,
        pass: password,
      },
      connectionTimeout: 30000,
      socketTimeout: 30000,
      greetingTimeout: 30000,
      pool: {
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000,
        rateLimit: 14,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    console.log('[EmailService] SMTP transporter initialized successfully', `(${smtpHost}:${smtpPort})`);
    return gmailTransporter;
  } catch (err) {
    console.error('[EmailService] Failed to initialize Gmail transporter:', err);
    throw err;
  }
}

/**
 * Export the reusable Gmail transporter
 * Can be imported and used directly: const { emailTransporter } = require('./emailService')
 * @returns {object} Nodemailer transporter
 */
const emailTransporter = () => {
  try {
    return getGmailTransporter();
  } catch (err) {
    console.error('[EmailService] Error in emailTransporter:', err);
    throw err;
  }
};

/**
 * Send a document approval/rejection notification
 * @param {string} to - Recipient email address
 * @param {string} status - 'approved' or 'rejected'
 * @param {string} documentType - Type of document
 * @param {string} [notes] - Optional notes for rejection
 */
async function sendDocumentNotification(to, status, documentType, notes) {
  try {
    const transporter = await getConfiguredTransporter();
    const SystemSettingModel = getSystemSettingModel();
    const settings = SystemSettingModel ? await SystemSettingModel.findOne().lean() : null;
    
    // Determine sender based on whether Gmail or SMTP is active
    let fromEmail;
    let fromName;
    
    if (settings?.gmail?.enabled && settings.gmail.gmailAddress) {
      fromEmail = settings.gmail.gmailAddress;
      fromName = settings.gmail.displayName || 'Barangay System';
    } else {
      fromEmail = settings?.smtp?.user || process.env.BIMS_EMAIL;
      fromName = settings?.smtp?.fromName || 'Barangay System';
    }
    
    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    const subject = `Your document request has been ${status}`;
    const body = `
      <p>Dear user,</p>
      <p>Your request for <strong>${documentType}</strong> has been <strong>${status}</strong>.</p>
      ${notes ? `<p>Notes: ${notes}</p>` : ''}
      <p>If you have questions, please contact support.</p>
      <p>Thank you.</p>
    `;

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html: body,
    });

    console.log('[EmailService] Document notification sent:', info.messageId);
    
    // Log the email
    await logEmail(to, subject, true, null, info.messageId, 'document-notification');
    
    return info;
  } catch (err) {
    console.error('[EmailService] Failed to send document notification:', err);
    
    // Log the failure
    await logEmail(to, `Your document request has been ${status}`, false, err.message || String(err), null, 'document-notification');
    
    throw err;
  }
}

/**
 * Send a generic email
 * @param {string} to - Primary recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML email content
 * @param {string[]} [bcc] - Optional BCC recipients array
 * @param {string} [emailType] - Type of email for logging (password-reset, otp, announcement, generic)
 */
async function sendMail(to, subject, html, bcc, emailType) {
  try {
    // Check if this email type is enabled
    const enabled = await isEmailTypeEnabled(emailType);
    if (!enabled) {
      console.log(`[EmailService] Skipped: Email type "${emailType}" disabled in settings`);
      await logEmail(to, subject, true, 'Skipped: Email type disabled', 'skipped', emailType, bcc ? bcc.length : 0);
      return { messageId: 'skipped', response: 'Email sending disabled for this type' };
    }

    const transporter = await getConfiguredTransporter();
    const SystemSettingModel = getSystemSettingModel();
    const settings = SystemSettingModel ? await SystemSettingModel.findOne().lean() : null;
    
    // Determine sender based on whether Gmail or SMTP is active
    let fromEmail;
    let fromName;
    
    if (settings?.gmail?.enabled && settings.gmail.gmailAddress) {
      fromEmail = settings.gmail.gmailAddress;
      fromName = settings.gmail.displayName || 'Barangay System';
    } else {
      fromEmail = settings?.smtp?.user || process.env.BIMS_EMAIL;
      fromName = settings?.smtp?.fromName || 'Barangay System';
    }
    
    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    const mailOptions = {
      from,
      to,
      subject,
      html,
    };

    // Add BCC if provided
    if (bcc && Array.isArray(bcc) && bcc.length > 0) {
      mailOptions.bcc = bcc;
    }

    const info = await transporter.sendMail(mailOptions);

    console.log('[EmailService] Email sent:', info.messageId, bcc ? `(BCC to ${bcc.length} recipients)` : '');
    
    // Log the email
    if (bcc && bcc.length > 0) {
      // For BCC emails, log once with count
      await logEmail(to, subject, true, null, info.messageId, emailType || 'generic', bcc.length);
    } else {
      // For regular emails, log individual recipient
      await logEmail(to, subject, true, null, info.messageId, emailType || 'generic');
    }
    
    return info;
  } catch (err) {
    console.error('[EmailService] Failed to send email:', err);
    
    // Log the failure
    if (bcc && bcc.length > 0) {
      await logEmail(to, subject, false, err.message || String(err), null, emailType || 'generic', bcc.length);
    } else {
      await logEmail(to, subject, false, err.message || String(err), null, emailType || 'generic');
    }
    
    throw err;
  }
}

/**
 * Test the Gmail SMTP connection
 * @returns {Promise<object>} Test result with success status and details
 */
async function testSmtpConnection() {
  try {
    const transporter = getGmailTransporter();
    await transporter.verify();

    const result = {
      success: true,
      message: 'Gmail SMTP connection successful',
      config: {
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        user: process.env.BIMS_EMAIL,
      },
    };

    console.log('[EmailService] SMTP connection test passed');
    return result;
  } catch (err) {
    const result = {
      success: false,
      message: 'Gmail SMTP connection failed',
      error: err.message,
    };

    console.error('[EmailService] SMTP connection test failed:', err);
    return result;
  }
}

module.exports = {
  emailTransporter,
  sendDocumentNotification,
  sendMail,
  testSmtpConnection,
  getGmailTransporter,
  logEmail,
  isEmailTypeEnabled,
  getConfiguredTransporter,
};
