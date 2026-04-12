import nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import { EmailLog } from '../models/EmailLog';
import SystemSetting from '../models/SystemSetting';
import { createGmailTransporter, decryptGmailPassword, sanitizeGmailConfig } from '../utils/gmailHelper';
import sgMail from '@sendgrid/mail';

// Don't load sendGridService on module init - will load config on demand
let sendGridService: any = null;

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
 * Initialize and return a transporter based on settings from database
 * Priority: Gmail (if enabled) > SMTP (from database) > Environment variables
 * Caches the transporter instance to avoid recreating it
 */
async function getConfiguredTransporter(): Promise<Transporter> {
  // Clear cache to get fresh transporter
  gmailTransporter = null;

  try {
    // First, check if Gmail is enabled
    const settings = await SystemSetting.findOne().lean();
    
    if (settings?.gmail?.enabled && settings.gmail.gmailAddress) {
      try {
        console.log('[EmailService] Creating transporter using Gmail configuration');
        gmailTransporter = createGmailTransporter(settings.gmail);
        return gmailTransporter;
      } catch (err) {
        console.error('[EmailService] Failed to create Gmail transporter:', err instanceof Error ? err.message : err);
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
          secure: settings.smtp.secure === true, // Use SSL/TLS if secure is true
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
    console.warn('[EmailService] Failed to load settings from database, falling back to environment variables:', 
      err instanceof Error ? err.message : err);
  }

  // Fallback to environment variables (legacy behavior)
  // Support both BIMS_EMAIL/BIMS_EMAIL_PASSWORD and SMTP_USER/SMTP_PASSWORD
  const email = process.env.BIMS_EMAIL || process.env.SMTP_USER;
  const password = process.env.BIMS_EMAIL_PASSWORD || process.env.SMTP_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Missing email credentials. Please configure Gmail or SMTP settings in admin settings or set BIMS_EMAIL and BIMS_EMAIL_PASSWORD environment variables.'
    );
  }

  // If using SMTP_* variables, create a custom transport; otherwise use Gmail service
  const smtpHost = process.env.SMTP_HOST;
  if (smtpHost) {
    const smtpPort = parseInt(process.env.SMTP_PORT || '465');
    const smtpSecure = process.env.SMTP_SECURITY === 'SSL' ? true : (smtpPort === 465 ? true : false);
    
    console.log(`[EmailService] Creating transporter from SMTP environment variables (${smtpHost}:${smtpPort})`);

    gmailTransporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: email,
        pass: password,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  } else {
    // Default to Gmail service (legacy)
    console.log('[EmailService] Creating transporter from environment variables (Gmail service)');

    gmailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: email,
        pass: password, // Use App Password for Gmail accounts with 2FA enabled
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  return gmailTransporter;
}

/**
 * Export a function that returns a promise of the configured transporter
 * Can be imported and used directly: import { emailTransporter } from './EmailService'
 */
export const emailTransporter = async (): Promise<Transporter> => {
  return getConfiguredTransporter();
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
    const transporter = await getConfiguredTransporter();
    const settings = await SystemSetting.findOne().lean();
    
    // Determine sender based on whether Gmail or SMTP is active
    let fromEmail: string | undefined;
    let fromName: string;
    
    if (settings?.gmail?.enabled && settings.gmail.gmailAddress) {
      fromEmail = settings.gmail.gmailAddress;
      fromName = settings.gmail.displayName || 'Barangay System';
    } else {
      fromEmail = settings?.smtp?.user || process.env.BIMS_EMAIL || 'noreply@barangay.system';
      fromName = settings?.smtp?.fromName || 'Barangay System';
    }
    
    const from = fromName && fromEmail ? `${fromName} <${fromEmail}>` : (fromEmail || 'noreply@barangay.system');
    
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
export async function sendMail(
  to: string,
  subject: string,
  html: string,
  bcc?: string[],
  emailType?: string,
  // attachments: array of { filename, content (Buffer|string), contentType, cid, disposition }
  attachments?: Array<{ filename?: string; content: Buffer | string; contentType?: string; cid?: string; disposition?: string }>
) {
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
    
    const settings = await SystemSetting.findOne().lean();

    // If SendGrid is configured and enabled, prefer SendGrid
    try {
      // Robustly load SendGrid configuration.
      // Try module from expected location, then try resolving from project root (useful when running from dist),
      // finally fall back to SystemSetting.getSendGridConfig helper.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      let SendGridConfigModule: any = null;
      let sgCfg: any = null;

      try {
        // Primary location (when model was copied into dist or running from src)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        SendGridConfigModule = require('../models/SendGridConfig.js');
      } catch (requireErr1) {
        try {
          // Fallback: resolve from server root (handles compiled dist paths)
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const path = require('path');
          // __dirname is e.g. .../server/dist/services when running compiled code
          // Resolve to .../server/models/SendGridConfig.js which exists in the repo
          // and may not have been copied into dist during build.
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          SendGridConfigModule = require(path.resolve(__dirname, '..', '..', 'models', 'SendGridConfig.js'));
        } catch (requireErr2) {
          console.warn('[EmailService] SendGridConfig require attempts failed, will try SystemSetting.getSendGridConfig', requireErr1, requireErr2);
        }
      }

      if (SendGridConfigModule && typeof SendGridConfigModule.getConfig === 'function') {
        sgCfg = await SendGridConfigModule.getConfig();
        // If the module returned a wrapper document (e.g., a SystemSetting doc), extract nested config
        if (sgCfg && sgCfg.sendgridConfig) sgCfg = sgCfg.sendgridConfig;
      }

      // If still not found, try reading from SystemSetting helper (legacy location)
      if (!sgCfg || !sgCfg.apiKey) {
        try {
          const sysSg = await (SystemSetting as any).getSendGridConfig();
          if (sysSg && sysSg.sendgridConfig) {
            sgCfg = sysSg.sendgridConfig;
          } else if (sysSg && sysSg.apiKey) {
            // handle case where sendgrid fields are on the document root
            sgCfg = sysSg;
          }
        } catch (sysErr) {
          // ignore - we'll fallback to SMTP/Gmail later
          console.warn('[EmailService] SystemSetting.getSendGridConfig failed', sysErr instanceof Error ? sysErr.message : sysErr);
        }
      }

      console.log('[EmailService] SendGrid branch check:', {
        sgConfigPresent: !!sgCfg,
        sgEnabled: !!(sgCfg && sgCfg.enabled),
        hasApiKey: !!(sgCfg && sgCfg.apiKey),
        fromEmail: sgCfg?.fromEmail || null
      });

      if (sgCfg && sgCfg.enabled && sgCfg.apiKey) {
        try {
          console.log('[EmailService] Using SendGrid for sending email');
          // Set SendGrid API key
          sgMail.setApiKey(sgCfg.apiKey);

          // Compose BCC string if needed
          let sgMailOptions: any = {
            to,
            from: sgCfg.fromEmail || 'noreply@barangay.system',
            subject,
            html,
          };

          // Add BCC if provided
          if (bcc && Array.isArray(bcc) && bcc.length > 0) {
            sgMailOptions.bcc = bcc;
          }

          // Add attachments for SendGrid: convert Buffer content to base64
          if (attachments && Array.isArray(attachments) && attachments.length > 0) {
            sgMailOptions.attachments = attachments.map((att: any) => ({
              content: Buffer.isBuffer(att.content) ? att.content.toString('base64') : (typeof att.content === 'string' ? Buffer.from(att.content).toString('base64') : ''),
              filename: att.filename || 'attachment',
              type: att.contentType || att.type || 'application/octet-stream',
              disposition: att.disposition || 'inline',
              content_id: att.cid || att.contentId || undefined,
            }));
          }

          // Debug: log attachment metadata (without content)
          try {
            console.debug('[EmailService] SendGrid attachments meta:', (sgMailOptions.attachments || []).map((a: any) => ({ filename: a.filename, type: a.type, disposition: a.disposition, content_id: a.content_id })));
          } catch (e) {}

          await sgMail.send(sgMailOptions);

          // Log email as sent
          await logEmailToDb(to, subject, true, undefined, undefined, emailType || 'generic', bcc ? bcc.length : 0);
          return { success: true, message: 'Email sent via SendGrid' };
        } catch (innerSgErr: any) {
          console.error('[EmailService] SendGrid send failed:', innerSgErr && (innerSgErr.message || innerSgErr));
          // Let the outer catch/fallback handle continuing to SMTP
          throw innerSgErr;
        }
      }
    } catch (sgErr: any) {
      console.warn('[EmailService] SendGrid send attempt failed, falling back to SMTP/Gmail transporter', sgErr instanceof Error ? sgErr.message : sgErr);
      // continue to fallback transporter below
    }

    const transporter = await getConfiguredTransporter();
    
    // Determine sender based on whether Gmail or SMTP is active
    let fromEmail: string | undefined;
    let fromName: string;
    
    if (settings?.gmail?.enabled && settings.gmail.gmailAddress) {
      fromEmail = settings.gmail.gmailAddress;
      fromName = settings.gmail.displayName || 'Barangay System';
    } else {
      fromEmail = settings?.smtp?.user || process.env.BIMS_EMAIL || 'noreply@barangay.system';
      fromName = settings?.smtp?.fromName || 'Barangay System';
    }
    
    const from = fromName && fromEmail ? `${fromName} <${fromEmail}>` : (fromEmail || 'noreply@barangay.system');

    const mailOptions: any = {
      from,
      to,
      subject,
      html,
    };

    // Add BCC if provided
    if (bcc && Array.isArray(bcc) && bcc.length > 0) {
      mailOptions.bcc = bcc;
    }

    // Add attachments for nodemailer transport (Buffers allowed)
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      mailOptions.attachments = attachments.map((att: any) => ({
        filename: att.filename || 'attachment',
        content: att.content,
        contentType: att.contentType || att.type,
        cid: att.cid,
        contentDisposition: att.disposition || (att.cid ? 'inline' : 'attachment'),
      }));
    }

    // Debug: log nodemailer attachment metadata
    try {
      console.debug('[EmailService] Nodemailer attachments meta:', (mailOptions.attachments || []).map((a: any) => ({ filename: a.filename, contentType: a.contentType, cid: a.cid, contentDisposition: a.contentDisposition })));
    } catch (e) {}

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
 * Test the configured SMTP connection
 */
export async function testSmtpConnection() {
  try {
    const transporter = await getConfiguredTransporter();
    await transporter.verify();

    const settings = await SystemSetting.findOne().lean();
    return {
      success: true,
      message: 'SMTP connection successful',
      config: {
        host: settings?.smtp?.host || 'smtp.gmail.com',
        port: settings?.smtp?.port || 465,
        secure: settings?.smtp?.secure || true,
        user: settings?.smtp?.user || process.env.BIMS_EMAIL,
      },
    };
  } catch (err) {
    console.error('SMTP test connection error:', err);
    return {
      success: false,
      message: 'SMTP connection failed',
      error: (err as any).message,
    };
  }
}
