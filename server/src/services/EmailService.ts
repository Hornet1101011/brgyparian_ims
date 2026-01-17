import nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import { EmailLog } from '../models/EmailLog';
import SystemSetting from '../models/SystemSetting';

/**
 * Gmail SMTP Transporter
 * Uses environment variables BIMS_EMAIL and BIMS_EMAIL_PASSWORD
 * This transporter is reusable across the entire application
 */

let gmailTransporter: Transporter | null = null;

/**
 * Check if email sending is enabled for a specific email type
 */
async function isEmailTypeEnabled(emailType?: string): Promise<boolean> {
  try {
    const settings = await SystemSetting.findOne().lean();
    
    // If email system is disabled globally, return false
    if (settings?.emailSettings?.enabled === false) {
      console.log('[EmailService] Email system is globally disabled');
      return false;
    }
    
    // Check specific email type settings
    if (emailType === 'password-reset' && settings?.emailSettings?.enablePasswordResetEmails === false) {
      return false;
    }
    if (emailType === 'otp' && settings?.emailSettings?.enableOtpEmails === false) {
      return false;
    }
    if (emailType === 'document-notification' && settings?.emailSettings?.enableDocumentNotificationEmails === false) {
      return false;
    }
    if (emailType === 'announcement' && settings?.emailSettings?.enableAnnouncementEmails === false) {
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('[EmailService] Failed to check email settings:', err);
    // Default to true if we can't read settings (allow sending)
    return true;
  }
}

/**
 * Log email sending attempt to database
 */
async function logEmailToDb(
  recipient: string,
  subject: string,
  success: boolean,
  error?: string,
  messageId?: string,
  emailType?: string,
  bccCount?: number
) {
  try {
    await EmailLog.create({
      recipient: recipient || 'unknown',
      subject: subject || 'No subject',
      status: success ? 'sent' : 'failed',
      errorMessage: error || null,
      messageId: messageId || null,
      emailType: emailType || 'generic',
      bccRecipientsCount: bccCount || 0,
    });
  } catch (logErr) {
    // Don't fail the email process if logging fails
    console.error('[EmailService] Failed to log email to database:', logErr instanceof Error ? logErr.message : logErr);
  }
}

/**
 * Initialize and return a Gmail SMTP transporter
 * Caches the transporter instance to avoid recreating it
 */
function getGmailTransporter(): Transporter {
  if (gmailTransporter) {
    return gmailTransporter;
  }

  const email = process.env.BIMS_EMAIL;
  const password = process.env.BIMS_EMAIL_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Missing Gmail credentials. Please set BIMS_EMAIL and BIMS_EMAIL_PASSWORD environment variables.'
    );
  }

  gmailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: email,
      pass: password, // Use App Password for Gmail accounts with 2FA enabled
    },
    // TLS settings
    tls: {
      rejectUnauthorized: false,
    },
  });

  return gmailTransporter;
}

/**
 * Get a transporter configured from database SMTP settings (preferred)
 * Falls back to hardcoded Gmail credentials if database settings are empty
 */
async function getConfiguredTransporter(): Promise<Transporter> {
  try {
    // Try to load SMTP settings from database first
    const settings = await SystemSetting.findOne().lean();
    if (settings?.smtp?.host && settings?.smtp?.user && settings?.smtp?.encryptedPassword) {
      // Decrypt the password
      const encryptionKey = process.env.SETTINGS_ENCRYPTION_KEY;
      if (!encryptionKey) {
        console.warn('[EmailService] SETTINGS_ENCRYPTION_KEY not set, cannot decrypt SMTP password');
        return getGmailTransporter();
      }

      try {
        const { decryptText } = require('../utils/cryptoHelper');
        const decryptedPassword = decryptText(settings.smtp.encryptedPassword, encryptionKey);

        console.log('[EmailService] Using custom SMTP settings from database');
        return nodemailer.createTransport({
          host: settings.smtp.host,
          port: settings.smtp.port || 587,
          secure: settings.smtp.secure !== false, // Default to true for security
          auth: {
            user: settings.smtp.user,
            pass: decryptedPassword,
          },
          // Connection timeout settings
          connectionTimeout: 10000, // 10 seconds to establish connection
          socketTimeout: 10000, // 10 seconds for socket operations
          // Allow self-signed certificates for testing
          tls: {
            rejectUnauthorized: false,
          },
        });
      } catch (decryptErr) {
        console.error('[EmailService] Failed to decrypt SMTP password:', decryptErr);
        return getGmailTransporter();
      }
    }
  } catch (err) {
    console.warn('[EmailService] Failed to load SMTP settings from database, falling back to Gmail:', err);
  }

  // Fallback to hardcoded Gmail credentials
  return getGmailTransporter();
}

/**
 * Export the reusable Gmail transporter
 * Can be imported and used directly: import { emailTransporter } from './EmailService'
 */
export const emailTransporter = (): Transporter => {
  return getGmailTransporter();
};


/**
 * Send a document approval/rejection notification
 */
export async function sendDocumentNotification(
  to: string,
  status: 'approved' | 'rejected',
  documentType: string,
  notes?: string
) {
  try {
    const transporter = getGmailTransporter();
    const email = process.env.BIMS_EMAIL;
    const subject = `Your document request has been ${status}`;
    const body = `
      <p>Dear user,</p>
      <p>Your request for <strong>${documentType}</strong> has been <strong>${status}</strong>.</p>
      ${notes ? `<p>Notes: ${notes}</p>` : ''}
      <p>If you have questions, please contact support.</p>
      <p>Thank you.</p>
    `;
    const info = await transporter.sendMail({
      from: email,
      to,
      subject,
      html: body,
    });
    
    // Log success
    await logEmailToDb(to, subject, true, undefined, info.messageId, 'document-notification');
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    
    // Log failure
    await logEmailToDb(to, `Your document request has been ${status}`, false, errorMsg, undefined, 'document-notification');
    
    console.error('Failed to send document notification:', err);
    throw err;
  }
}

/**
 * Send a generic email
 */
export async function sendMail(to: string, subject: string, html: string, bcc?: string[], emailType?: string) {
  try {
    // Check if this email type is enabled
    const enabled = await isEmailTypeEnabled(emailType);
    if (!enabled) {
      console.log(`[EmailService] Email type '${emailType || 'generic'}' is disabled in settings. Skipping send.`);
      // Log as skipped (we can track disabled emails)
      if (bcc && bcc.length > 0) {
        await logEmailToDb(to, subject, true, 'Skipped: Email type disabled', undefined, emailType || 'generic', bcc.length);
      } else {
        await logEmailToDb(to, subject, true, 'Skipped: Email type disabled', undefined, emailType || 'generic');
      }
      return { messageId: 'skipped', response: 'Email sending disabled for this type' };
    }
    
    // Use configured transporter (database SMTP settings with fallback to Gmail)
    const transporter = await getConfiguredTransporter();
    const settings = await SystemSetting.findOne().lean();
    
    // Use configured SMTP user, or fallback to BIMS_EMAIL
    let fromEmail = settings?.smtp?.user || process.env.BIMS_EMAIL;
    let fromName = settings?.smtp?.fromName || 'Barangay Information System';

    const mailOptions: any = {
      from: `${fromName} <${fromEmail}>`,
      to,
      subject,
      html,
    };

    // Add BCC if provided
    if (bcc && Array.isArray(bcc) && bcc.length > 0) {
      mailOptions.bcc = bcc;
    }

    const info = await transporter.sendMail(mailOptions);
    
    // Log email
    if (bcc && bcc.length > 0) {
      // For BCC emails, log once with count
      await logEmailToDb(to, subject, true, undefined, info.messageId, emailType || 'generic', bcc.length);
    } else {
      // For regular emails, log individual recipient
      await logEmailToDb(to, subject, true, undefined, info.messageId, emailType || 'generic');
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    
    // Log failure
    if (bcc && bcc.length > 0) {
      await logEmailToDb(to, subject, false, errorMsg, undefined, emailType || 'generic', bcc.length);
    } else {
      await logEmailToDb(to, subject, false, errorMsg, undefined, emailType || 'generic');
    }
    
    console.error('Failed to send email:', err);
    throw err;
  }
}

/**
 * Test the Gmail SMTP connection
 */
export async function testSmtpConnection() {
  try {
    const transporter = getGmailTransporter();
    await transporter.verify();

    return {
      success: true,
      message: 'Gmail SMTP connection successful',
      config: {
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        user: process.env.BIMS_EMAIL,
      },
    };
  } catch (err) {
    console.error('Gmail SMTP test connection error:', err);
    return {
      success: false,
      message: 'Gmail SMTP connection failed',
      error: (err as any).message,
    };
  }
}
