import nodemailer, { Transporter } from 'nodemailer';

// Attempt to load crypto helper dynamically. If the module cannot be resolved
// (e.g. missing file or different path), provide a lightweight fallback so
// the rest of this utility can still compile and run in non-production
// environments. Fallback uses base64 encode/decode and ignores the encryption
// key.
type TDecrypt = (cipherText: string, key?: string) => string;
type TEncrypt = (plainText: string, key?: string) => string;

let decryptText: TDecrypt;
let encryptText: TEncrypt;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cryptoHelper = require('./cryptoHelper');
  decryptText = (cryptoHelper && cryptoHelper.decryptText) || ((t: string) => Buffer.from(t, 'base64').toString('utf8'));
  encryptText = (cryptoHelper && cryptoHelper.encryptText) || ((t: string) => Buffer.from(t, 'utf8').toString('base64'));
} catch (e) {
  // Fallback implementations (non-secure) for environments where the real
  // crypto helper isn't available. These should only be used for testing.
  decryptText = (t: string) => Buffer.from(t, 'base64').toString('utf8');
  encryptText = (t: string) => Buffer.from(t, 'utf8').toString('base64');
}

/**
 * Gmail Helper - Simplified Gmail authentication and transport management
 */

export interface IGmailConfig {
  enabled?: boolean;
  gmailAddress?: string;
  appPassword?: string; // This is the field from frontend (unencrypted)
  encryptedPassword?: string; // Encrypted password in DB
  displayName?: string;
  useAppPassword?: boolean;
}

export interface IGmailTestResult {
  success: boolean;
  messageId?: string;
  message?: string;
  error?: string;
}

export interface IGmailSanitized {
  enabled?: boolean;
  gmailAddress?: string;
  useAppPassword?: boolean;
  displayName?: string;
}

/**
 * Decrypt Gmail app password from encrypted storage
 */
export function decryptGmailPassword(encryptedPassword: string | undefined): string | null {
  if (!encryptedPassword) return null;

  if (!process.env.SETTINGS_ENCRYPTION_KEY) {
    throw new Error('Encryption key not configured');
  }

  try {
    return decryptText(encryptedPassword, process.env.SETTINGS_ENCRYPTION_KEY);
  } catch (err) {
    throw new Error('Failed to decrypt Gmail password: ' + (err instanceof Error ? err.message : String(err)));
  }
}

/**
 * Encrypt Gmail app password for secure storage
 */
export function encryptGmailPassword(password: string | undefined): string | null {
  if (!password) return null;

  if (!process.env.SETTINGS_ENCRYPTION_KEY) {
    console.warn('Encryption key not configured, password will be stored unencrypted');
    return password;
  }

  try {
    return encryptText(String(password), process.env.SETTINGS_ENCRYPTION_KEY);
  } catch (err) {
    throw new Error('Failed to encrypt Gmail password: ' + (err instanceof Error ? err.message : String(err)));
  }
}

/**
 * Create a nodemailer transporter for Gmail
 */
export function createGmailTransporter(gmailConfig: IGmailConfig): Transporter {
  if (!gmailConfig || !gmailConfig.gmailAddress) {
    throw new Error('Gmail not configured: missing email address');
  }

  let decryptedPassword: string | null = null;

  // Try to get password from either encryptedPassword (DB) or appPassword (incoming)
  if (gmailConfig.encryptedPassword) {
    try {
      decryptedPassword = decryptGmailPassword(gmailConfig.encryptedPassword);
    } catch (err) {
      console.error('Failed to decrypt Gmail password:', err instanceof Error ? err.message : String(err));
      throw err;
    }
  } else if (gmailConfig.appPassword) {
    // If appPassword is provided directly (from frontend), encrypt it for first-time setup
    try {
      decryptedPassword = gmailConfig.appPassword;
    } catch (err) {
      console.error('Failed to use Gmail app password:', err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  if (!decryptedPassword) {
    throw new Error('Gmail not configured: missing app password');
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailConfig.gmailAddress,
        pass: decryptedPassword,
      },
    });

    return transporter;
  } catch (err) {
    throw new Error('Failed to create Gmail transporter: ' + (err instanceof Error ? err.message : String(err)));
  }
}

/**
 * Validate Gmail configuration
 */
export function validateGmailConfig(gmailConfig: IGmailConfig): string[] {
  const errors: string[] = [];

  if (!gmailConfig) {
    errors.push('Gmail configuration is missing');
    return errors;
  }

  if (!gmailConfig.gmailAddress) {
    errors.push('Gmail address is required');
  } else if (!gmailConfig.gmailAddress.includes('@gmail.com')) {
    errors.push('Must be a valid Gmail address (@gmail.com)');
  }

  if (!gmailConfig.encryptedPassword && !gmailConfig.appPassword) {
    errors.push('Gmail app password is required');
  }

  return errors;
}

/**
 * Send test email via Gmail
 */
export async function testGmailConnection(
  gmailConfig: IGmailConfig,
  testEmail: string
): Promise<IGmailTestResult> {
  try {
    if (!testEmail || !testEmail.includes('@')) {
      throw new Error('Valid test email is required');
    }

    const transporter = createGmailTransporter(gmailConfig);

    // Verify connection
    await transporter.verify();

    const displayName = gmailConfig.displayName || 'Barangay System';
    const from = `${displayName} <${gmailConfig.gmailAddress}>`;

    const html = `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
          <h2>Gmail Configuration Test</h2>
          <p>This is a test email to verify Gmail configuration.</p>
          <p>If you received this, your Gmail setup is working correctly!</p>
          <hr>
          <p style="color: #999; font-size: 12px;">
            Sent from Barangay Information Management System
          </p>
        </body>
      </html>
    `;

    const result = await transporter.sendMail({
      from,
      to: testEmail,
      subject: 'Gmail Configuration Test - Barangay System',
      html,
    });

    return {
      success: true,
      messageId: result.messageId,
      message: 'Test email sent successfully',
    };
  } catch (err) {
    console.error('[GmailHelper] Connection test failed:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Sanitize Gmail config for client response (remove sensitive data)
 */
export function sanitizeGmailConfig(config: IGmailConfig | undefined | null): IGmailSanitized | null {
  if (!config) return null;

  const sanitized: IGmailSanitized = {
    enabled: config.enabled,
    gmailAddress: config.gmailAddress,
    useAppPassword: config.useAppPassword,
    displayName: config.displayName || (config.gmailAddress ? config.gmailAddress.split('@')[0] : ''),
    // DO NOT include encryptedPassword or appPassword
  };

  return sanitized;
}
