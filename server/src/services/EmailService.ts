import nodemailer from 'nodemailer';
import mongoose from 'mongoose';
import SystemSettingModel, { ISystemSetting } from '../models/SystemSetting';

// crypto helper (encrypt/decrypt) - commonjs module
// use require to match existing module.exports in utils
// eslint-disable-next-line @typescript-eslint/no-var-requires
// helper lives outside of src at server/utils/cryptoHelper.js
const cryptoHelper = require('../../utils/cryptoHelper');

type SmtpConfig = {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from?: string;
};

async function resolveSmtpConfig(): Promise<SmtpConfig | null> {
  // Prefer environment variables if provided
  const envHost = process.env.SMTP_HOST;
  if (envHost) {
    const config = {
      host: envHost,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      user: process.env.SMTP_USER || 'brgystaff0001@gmail.com',
      pass: process.env.SMTP_PASS || 'fprr ownw kpbl fbgg',
      from: process.env.SMTP_FROM || process.env.SMTP_USER || 'brgystaff0001@gmail.com',
    };
    console.log('[EmailService] Using environment SMTP config:', {
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.user,
    });
    return config;
  }

  // fallback: read from SystemSetting document in DB
  try {
    // Ensure mongoose connection exists before querying
    if (mongoose.connection.readyState === 0) {
      // no DB connection
      console.log('[EmailService] MongoDB not connected for DB config fallback');
      return null;
    }
    const settings = await SystemSettingModel.findOne().lean<ISystemSetting>().exec();
    if (!settings || !settings.smtp || !settings.smtp.host) {
      console.log('[EmailService] No SMTP settings found in DB');
      return null;
    }
    const passEncrypted = (settings.smtp as any).encryptedPassword;
    let pass: string | undefined = undefined;
    if (passEncrypted && process.env.SETTINGS_ENCRYPTION_KEY) {
      try {
        pass = cryptoHelper.decryptText(passEncrypted, process.env.SETTINGS_ENCRYPTION_KEY);
      } catch (e) {
        console.error('[EmailService] Failed to decrypt SMTP password from SystemSetting:', e);
      }
    }
    const config = {
      host: settings.smtp.host || 'smtp.gmail.com',
      port: settings.smtp.port || 587,
      secure: !!settings.smtp.secure,
      user: settings.smtp.user || 'brgystaff0001@gmail.com',
      pass: pass || 'fprr ownw kpbl fbgg',
      from: settings.smtp.fromName || settings.smtp.user || 'brgystaff0001@gmail.com',
    };
    console.log('[EmailService] Using DB SMTP config:', {
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.user,
    });
    return config;
  } catch (err) {
    console.error('[EmailService] resolveSmtpConfig error:', err);
    return null;
  }
}

function createTransporterFromConfig(cfg: SmtpConfig) {
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure === true, // true for 465, false for other ports
    // Only supply auth when both user and pass are available. Supplying a user without a pass
    // causes Nodemailer to try PLAIN auth with missing credentials which produces a 'Missing credentials for "PLAIN"' error.
    auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
  console.log('[EmailService] Created transporter with config:', {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user && cfg.pass ? 'configured' : 'none',
  });
  return transport;
}

export async function sendDocumentNotification(
  to: string,
  status: 'approved' | 'rejected',
  documentType: string,
  notes?: string
) {
  const cfg = await resolveSmtpConfig();
  if (!cfg) {
    console.error('[EmailService] No SMTP config available; cannot send document notification');
    return;
  }
  // Validate credentials before attempting to send. If user is provided without a pass,
  // avoid attempting an authenticated login which will fail with a PLAIN credential error.
  if (cfg.user && !cfg.pass) {
    console.error('[EmailService] SMTP configuration incomplete: user is set but pass is missing. Aborting send.');
    throw new Error('SMTP configuration incomplete (missing password)');
  }
  const transporter = createTransporterFromConfig(cfg);
  const subject = `Your document request has been ${status}`;
  const body = `
    <p>Dear user,</p>
    <p>Your request for <strong>${documentType}</strong> has been <strong>${status}</strong>.</p>
    ${notes ? `<p>Notes: ${notes}</p>` : ''}
    <p>If you have questions, please contact support.</p>
    <p>Thank you.</p>
  `;
  try {
    console.log('[EmailService] Sending document notification to:', to);
    const result = await transporter.sendMail({
      from: cfg.from || cfg.user,
      to,
      subject,
      html: body,
    });
    console.log('[EmailService] Document notification sent successfully:', result.messageId);
  } catch (err) {
    console.error('[EmailService] Failed to send document notification:', err);
    throw err;
  }
}

export async function sendMail(to: string, subject: string, html: string) {
  const cfg = await resolveSmtpConfig();
  if (!cfg) {
    console.error('[EmailService] No SMTP config available; cannot send email to:', to);
    throw new Error('SMTP configuration not available');
  }
  if (cfg.user && !cfg.pass) {
    console.error('[EmailService] SMTP configuration incomplete: user is set but pass is missing. Aborting send.');
    throw new Error('SMTP configuration incomplete (missing password)');
  }
  const transporter = createTransporterFromConfig(cfg);
  try {
    console.log('[EmailService] Sending email to:', to, 'Subject:', subject);
    const result = await transporter.sendMail({
      from: cfg.from || cfg.user,
      to,
      subject,
      html,
    });
    console.log('[EmailService] Email sent successfully:', result.messageId);
    return result;
  } catch (err) {
    console.error('[EmailService] Failed to send email to', to, ':', err);
    throw err;
  }
}

export async function testSmtpConnection(): Promise<{ success: boolean; message: string; config?: any; error?: string }> {
  console.log('[EmailService] Testing SMTP connection...');
  try {
    const cfg = await resolveSmtpConfig();
    if (!cfg) {
      return { success: false, message: 'No SMTP config found' };
    }
    
    console.log('[EmailService] SMTP Config:', {
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      user: cfg.user ? `${cfg.user.substring(0, 5)}...` : 'none',
    });

    const transporter = createTransporterFromConfig(cfg);
    const info = await transporter.verify();
    
    console.log('[EmailService] SMTP verification result:', info);
    
    if (info) {
      return {
        success: true,
        message: 'SMTP connection successful',
        config: {
          host: cfg.host,
          port: cfg.port,
          secure: cfg.secure,
          user: cfg.user,
        }
      };
    } else {
      return { success: false, message: 'SMTP verification failed', error: 'transporter.verify() returned false' };
    }
  } catch (err: any) {
    console.error('[EmailService] SMTP connection test failed:', err);
    return {
      success: false,
      message: 'SMTP connection failed',
      error: err?.message || String(err)
    };
  }
}
