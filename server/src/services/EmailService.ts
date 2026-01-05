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
    const port = Number(process.env.SMTP_PORT) || 587;
    const config = {
      host: envHost,
      port: port,
      secure: port === 465, // SSL on 465, TLS on 587
      user: process.env.SMTP_USER || 'apikey',
      pass: process.env.SMTP_PASS || '',
      from: process.env.SMTP_FROM || 'brgystaff0001@gmail.com',
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
      console.log('[EmailService] No SMTP settings found in DB, using SendGrid defaults');
      // Return SendGrid defaults
      return {
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false, // TLS on 587
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY || '',
        from: 'brgystaff0001@gmail.com',
      };
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
      host: settings.smtp.host || 'smtp.sendgrid.net',
      port: settings.smtp.port || 587,
      secure: !!settings.smtp.secure,
      user: settings.smtp.user || 'apikey',
      pass: pass || process.env.SENDGRID_API_KEY || '',
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
  // Determine secure flag based on port
  let secure = cfg.port === 465; // SSL on port 465, TLS (STARTTLS) on 587
  
  const transportConfig: any = {
    host: cfg.host,
    port: cfg.port,
    secure: secure,
    // Only supply auth when both user and pass are available
    auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
    // Connection pooling and extended timeouts for unreliable networks
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
    rateDelta: 2000,
    rateLimit: 5,
    connectionTimeout: 20000, // 20 seconds
    socketTimeout: 20000, // 20 seconds
    greetingTimeout: 10000, // 10 seconds
  };

  // Add TLS config for STARTTLS (port 587)
  if (!secure && cfg.port === 587) {
    transportConfig.tls = {
      rejectUnauthorized: false, // Allow self-signed certs
    };
  }

  console.log('[EmailService] Creating transporter with config:', {
    host: cfg.host,
    port: cfg.port,
    secure: secure,
    protocol: secure ? 'SSL' : (cfg.port === 587 ? 'STARTTLS' : 'PLAIN'),
    auth: cfg.user && cfg.pass ? 'configured' : 'none',
    timeouts: `${transportConfig.connectionTimeout}ms connection, ${transportConfig.socketTimeout}ms socket`,
  });

  const transport = nodemailer.createTransport(transportConfig);
  
  // Verify connection on creation (non-blocking)
  setImmediate(() => {
    transport.verify((err, success) => {
      if (err) {
        console.error('[EmailService] Transporter verification failed:', err.message);
      } else if (success) {
        console.log('[EmailService] SMTP connection verified successfully');
      }
    });
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

export async function sendMail(to: string, subject: string, html: string, retries: number = 3): Promise<any> {
  const cfg = await resolveSmtpConfig();
  if (!cfg) {
    console.error('[EmailService] No SMTP config available; cannot send email to:', to);
    throw new Error('SMTP configuration not available');
  }
  if (cfg.user && !cfg.pass) {
    console.error('[EmailService] SMTP configuration incomplete: user is set but pass is missing. Aborting send.');
    throw new Error('SMTP configuration incomplete (missing password)');
  }

  let lastError: any;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[EmailService] Attempt ${attempt}/${retries} - Sending email to:`, to, 'Subject:', subject);
      
      const transporter = createTransporterFromConfig(cfg);
      const result = await transporter.sendMail({
        from: cfg.from || cfg.user,
        to,
        subject,
        html,
      });
      
      console.log('[EmailService] Email sent successfully:', result.messageId);
      transporter.close(); // Close connection after sending
      return result;
    } catch (err: any) {
      lastError = err;
      console.error(`[EmailService] Attempt ${attempt}/${retries} failed:`, err.message);
      
      // Don't retry on auth errors
      if (err.message && (err.message.includes('Invalid login') || err.message.includes('Authentication failed'))) {
        console.error('[EmailService] Authentication error - will not retry');
        throw err;
      }
      
      // Wait before retrying
      if (attempt < retries) {
        const delay = Math.min(1000 * attempt, 5000); // 1s, 2s, 3s, 4s, 5s
        console.log(`[EmailService] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error('[EmailService] Failed to send email after', retries, 'attempts');
  throw lastError || new Error('Failed to send email');
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
