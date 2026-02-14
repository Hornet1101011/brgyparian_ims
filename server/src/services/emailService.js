const sgMail = require('@sendgrid/mail');
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
      return true;
    }

    const settings = await SystemSettingModel.findOne();
    if (!settings || !settings.email?.enabled) {
      console.log('[EmailService] Email is disabled in system settings');
      return false;
    }

    // Currently all email types use the same enabled flag for SendGrid
    // Can be extended later if needed
    return true;
  } catch (err) {
    console.error('[EmailService] Error checking email type enabled:', err.message);
    return true; // Fail open
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
async function isDryRunModeEnabled() {
  try {
    const SystemSettingModel = getSystemSettingModel();
    if (!SystemSettingModel) {
      return false;
    }
    
    const settings = await SystemSettingModel.findOne().lean();
    return settings?.dryRunMode === true;
  } catch (err) {
    console.warn('[EmailService] Error checking dry-run mode:', err.message);
    return false;
  }
}

/**
 * Initialize and return a Gmail SMTP transporter (legacy function for backward compatibility)
 * Caches the transporter instance to avoid recreating it
 * @returns {object} Nodemailer transporter
 * @throws {Error} If Gmail credentials are missing
 */
function getGmailTransporter() {
  throw new Error('[EmailService] getGmailTransporter is no longer supported. Use SendGrid exclusively.');
}

/**
 * Load SendGrid configuration from SystemSettings
 * @returns {Promise<{apiKey: string, fromEmail: string, fromName: string}>}
 * @throws {Error} If configuration is invalid
 */
async function loadSendGridConfig() {
  try {
    const SystemSettingModel = getSystemSettingModel();
    if (!SystemSettingModel) {
      throw new Error('SystemSetting model not available');
    }

    const settings = await SystemSettingModel.findOne().lean();
    
    if (!settings) {
      throw new Error('No system settings found in database');
    }

    // Check if email is enabled
    if (!settings.email?.enabled) {
      throw new Error('Email is currently disabled in system settings');
    }

    // Verify SendGrid configuration exists
    const sendgridConfig = settings.email?.sendgrid;
    if (!sendgridConfig) {
      throw new Error('SendGrid configuration not found in system settings');
    }

    // Verify API key exists
    if (!sendgridConfig.apiKey || sendgridConfig.apiKey.trim() === '') {
      throw new Error('SendGrid API key is not configured');
    }

    // Verify from email is configured
    if (!sendgridConfig.fromEmail || sendgridConfig.fromEmail.trim() === '') {
      throw new Error('SendGrid from email is not configured');
    }

    console.log('[EmailService] SendGrid config loaded:', {
      provider: 'sendgrid',
      fromEmail: sendgridConfig.fromEmail,
      fromName: sendgridConfig.fromName,
      hasApiKey: !!sendgridConfig.apiKey,
    });

    return {
      apiKey: sendgridConfig.apiKey,
      fromEmail: sendgridConfig.fromEmail,
      fromName: sendgridConfig.fromName || 'Barangay System',
    };
  } catch (err) {
    console.error('[EmailService] Failed to load SendGrid configuration:', err.message);
    throw err;
  }
}

/**
 * Send email using SendGrid
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML email content
 * @param {string} [text] - Plain text email content
 * @param {string[]} [bcc] - Optional BCC recipients array
 * @param {string} [emailType] - Type of email for logging
 * @returns {Promise<{messageId: string}>}
 * @throws {Error} If email sending fails
 */
async function sendEmail({ to, subject, html, text, bcc, emailType }) {
  const startTime = Date.now();
  
  try {
    console.log('[EmailService] Starting email send process:', {
      recipient: to,
      subject,
      emailType,
      timestamp: new Date().toISOString(),
    });

    // Check if this email type is enabled
    const enabled = await isEmailTypeEnabled(emailType);
    if (!enabled) {
      console.log(`[EmailService] Skipped: Email type "${emailType}" disabled`);
      await logEmail(to, subject, true, 'Email type disabled', 'skipped', emailType, bcc?.length || 0);
      return { messageId: 'skipped' };
    }

    // Check if dry-run mode is enabled
    const dryRunEnabled = await isDryRunModeEnabled();
    if (dryRunEnabled) {
      const simulatedMessageId = `dry-run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log('[EmailService] DRY-RUN MODE: Simulating email send', {
        recipient: to,
        subject,
        emailType,
        simulatedMessageId,
        duration: `${Date.now() - startTime}ms`,
      });
      
      await logEmail(to, subject, true, 'DRY-RUN MODE: simulated send', simulatedMessageId, emailType, bcc?.length || 0);
      return { messageId: simulatedMessageId, isDryRun: true };
    }

    // Load SendGrid configuration from database
    const config = await loadSendGridConfig();
    
    // Initialize SendGrid with API key
    sgMail.setApiKey(config.apiKey);

    // Build message
    const message = {
      to,
      from: {
        email: config.fromEmail,
        name: config.fromName,
      },
      subject,
      text: text || null,
      html,
    };

    // Add BCC if provided
    if (bcc && Array.isArray(bcc) && bcc.length > 0) {
      message.bcc = bcc;
      console.log(`[EmailService] Adding ${bcc.length} BCC recipients`);
    }

    console.log('[EmailService] Sending email via SendGrid:', {
      recipient: to,
      from: `${config.fromName} <${config.fromEmail}>`,
      subject,
      hasHtml: !!html,
      hasText: !!text,
      bccCount: bcc?.length || 0,
    });

    // Send email
    const response = await sgMail.send(message);
    
    // Extract message ID from response
    const messageId = response[0]?.headers?.['x-message-id'] || `sendgrid-${Date.now()}`;
    
    console.log('[EmailService] Email sent successfully via SendGrid:', {
      messageId,
      recipient: to,
      subject,
      statusCode: response[0]?.statusCode,
      duration: `${Date.now() - startTime}ms`,
    });

    // Log the successful send
    await logEmail(to, subject, true, null, messageId, emailType, bcc?.length || 0);

    return { messageId };
  } catch (err) {
    console.error('[EmailService] Failed to send email via SendGrid:', {
      recipient: to,
      subject,
      error: err.message,
      code: err.code,
      duration: `${Date.now() - startTime}ms`,
    });

    // Log the failure
    await logEmail(to, subject, false, err.message, null, emailType, bcc?.length || 0);

    throw err;
  }
}

/**
 * Send document notification email
 * @param {string} to - Recipient email
 * @param {string} status - 'approved' or 'rejected'
 * @param {string} documentType - Type of document
 * @param {string} [notes] - Optional notes
 * @returns {Promise<{messageId: string}>}
 */
async function sendDocumentNotification(to, status, documentType, notes) {
  const subject = `Your document request has been ${status}`;
  const html = `
    <p>Dear user,</p>
    <p>Your request for <strong>${documentType}</strong> has been <strong>${status}</strong>.</p>
    ${notes ? `<p>Notes: ${notes}</p>` : ''}
    <p>If you have questions, please contact support.</p>
    <p>Thank you.</p>
  `;

  return sendEmail({
    to,
    subject,
    html,
    emailType: 'document-notification',
  });
}

/**
 * Send generic email (alias for sendEmail for backward compatibility)
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML content
 * @param {string[]} [bcc] - BCC recipients
 * @param {string} [emailType] - Email type
 * @returns {Promise<{messageId: string}>}
 */
async function sendMail(to, subject, html, bcc, emailType) {
  return sendEmail({
    to,
    subject,
    html,
    bcc,
    emailType: emailType || 'generic',
  });
}

/**
 * Test SendGrid connection and configuration
 * @returns {Promise<{success: boolean, message: string, error?: string}>}
 */
async function testSendGridConnection() {
  try {
    console.log('[EmailService] Testing SendGrid configuration...');

    // Load configuration
    const config = await loadSendGridConfig();

    // Initialize SendGrid
    sgMail.setApiKey(config.apiKey);

    // Test by sending a test email to the configured from address
    const testMessage = {
      to: config.fromEmail,
      from: {
        email: config.fromEmail,
        name: config.fromName,
      },
      subject: 'SendGrid Connection Test',
      text: 'This is a test email to verify SendGrid is properly configured.',
      html: '<p>This is a test email to verify SendGrid is properly configured.</p>',
    };

    const response = await sgMail.send(testMessage);

    const result = {
      success: true,
      message: 'SendGrid connection successful',
      config: {
        provider: 'sendgrid',
        fromEmail: config.fromEmail,
        fromName: config.fromName,
        statusCode: response[0]?.statusCode,
      },
    };

    console.log('[EmailService] SendGrid test passed:', result);
    return result;
  } catch (err) {
    const result = {
      success: false,
      message: 'SendGrid connection failed',
      error: err.message,
    };

    console.error('[EmailService] SendGrid test failed:', result);
    return result;
  }
}

module.exports = {
  sendEmail,
  sendMail,
  sendDocumentNotification,
  testSendGridConnection,
  isEmailTypeEnabled,
  isDryRunModeEnabled,
  logEmail,
  loadSendGridConfig,
};
