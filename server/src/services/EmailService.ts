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
    const port = Number(process.env.SMTP_PORT) || 465; // Default to 465 (SSL) - better for Render
    return {
      host: envHost,
      port: port,
      secure: port === 465 || port === 993, // 465/993 = SSL, 587/25 = TLS
      user: process.env.SMTP_USER || 'brgystaff0001@gmail.com',
      pass: process.env.SMTP_PASS || 'fprr ownw kpbl fbgg',
      from: process.env.SMTP_FROM || process.env.SMTP_USER || 'brgystaff0001@gmail.com',
    };
  }

  // fallback: read from SystemSetting document in DB
  try {
    // Ensure mongoose connection exists before querying
    if (mongoose.connection.readyState === 0) {
      // no DB connection
      return null;
    }
    const settings = await SystemSettingModel.findOne().lean<ISystemSetting>().exec();
    if (!settings || !settings.smtp || !settings.smtp.host) return null;
    const passEncrypted = (settings.smtp as any).encryptedPassword;
    let pass: string | undefined = undefined;
    if (passEncrypted && process.env.SETTINGS_ENCRYPTION_KEY) {
      try {
        pass = cryptoHelper.decryptText(passEncrypted, process.env.SETTINGS_ENCRYPTION_KEY);
      } catch (e) {
        console.error('Failed to decrypt SMTP password from SystemSetting:', e);
      }
    }
    const port = settings.smtp.port || 465; // Default to 465 (SSL) - better for Render
    return {
      host: settings.smtp.host || 'smtp.gmail.com',
      port: port,
      secure: port === 465 || port === 993 || !!settings.smtp.secure,
      user: settings.smtp.user || 'brgystaff0001@gmail.com',
      pass: pass || 'fprr ownw kpbl fbgg',
      from: settings.smtp.fromName || settings.smtp.user || 'brgystaff0001@gmail.com',
    };
  } catch (err) {
    console.error('resolveSmtpConfig error', err);
    return null;
  }
}

function createTransporterFromConfig(cfg: SmtpConfig) {
  const transportOptions: any = {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure === true, // true for 465, false for other ports
    auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
    // Connection settings to work around Render firewall issues
    connectionTimeout: 30000, // 30 seconds (increased from default 2000)
    socketTimeout: 30000,     // 30 seconds
    greetingTimeout: 30000,   // 30 seconds
    pool: {
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 14, // ~14 messages per second
    },
    // TLS settings
    tls: {
      rejectUnauthorized: false, // Allow self-signed certs as fallback
    },
  };
  return nodemailer.createTransport(transportOptions);
}

export async function sendDocumentNotification(
  to: string,
  status: 'approved' | 'rejected',
  documentType: string,
  notes?: string
) {
  const cfg = await resolveSmtpConfig();
  if (!cfg) {
    console.error('No SMTP config available; cannot send document notification');
    return;
  }
  // Validate credentials before attempting to send. If user is provided without a pass,
  // avoid attempting an authenticated login which will fail with a PLAIN credential error.
  if (cfg.user && !cfg.pass) {
    console.error('SMTP configuration incomplete: user is set but pass is missing. Aborting send.');
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
  await transporter.sendMail({
    from: cfg.from || cfg.user,
    to,
    subject,
    html: body,
  });
}

export async function sendMail(to: string, subject: string, html: string) {
  const cfg = await resolveSmtpConfig();
  if (!cfg) {
    console.error('No SMTP config available; cannot send email');
    return;
  }
  if (cfg.user && !cfg.pass) {
    console.error('SMTP configuration incomplete: user is set but pass is missing. Aborting send.');
    throw new Error('SMTP configuration incomplete (missing password)');
  }
  const transporter = createTransporterFromConfig(cfg);
  await transporter.sendMail({
    from: cfg.from || cfg.user,
    to,
    subject,
    html,
  });
}

export async function testSmtpConnection() {
  try {
    const cfg = await resolveSmtpConfig();
    if (!cfg) {
      return { success: false, message: 'No SMTP configuration found' };
    }
    
    const transporter = createTransporterFromConfig(cfg);
    await transporter.verify();
    
    return {
      success: true,
      message: 'SMTP connection successful',
      config: {
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        user: cfg.user,
        from: cfg.from
      }
    };
  } catch (err) {
    console.error('SMTP test connection error:', err);
    return {
      success: false,
      message: 'SMTP connection failed',
      error: (err as any).message
    };
  }
}
