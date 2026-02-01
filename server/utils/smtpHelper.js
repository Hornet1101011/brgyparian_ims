const nodemailer = require('nodemailer');
const { decryptText, encryptText } = require('./cryptoHelper');

/**
 * SMTP Helper - Simplified email and SMTP management
 */

/**
 * Build SMTP transporter configuration from stored settings
 * @param {Object} smtpConfig - SMTP config from database
 * @returns {Object} - Options for nodemailer.createTransport()
 */
function buildTransporterOptions(smtpConfig) {
  if (!smtpConfig || !smtpConfig.host) {
    throw new Error('SMTP not configured: missing host');
  }

  const options = {
    host: smtpConfig.host,
    port: smtpConfig.port || 587,
    secure: !!smtpConfig.secure
  };

  // Set auth if credentials provided
  if (smtpConfig.user && smtpConfig.decryptedPassword) {
    options.auth = {
      user: smtpConfig.user,
      pass: smtpConfig.decryptedPassword
    };
  }

  // Optional TLS settings for self-signed certificates
  if (smtpConfig.tls && typeof smtpConfig.tls === 'object') {
    options.tls = smtpConfig.tls;
  }

  // Enable debug logging if DEBUG_SMTP is set
  if (process.env.DEBUG_SMTP) {
    options.logger = true;
    options.debug = true;
  }

  return options;
}

/**
 * Decrypt SMTP password from encrypted storage
 * @param {string} encryptedPassword - Encrypted password from DB
 * @returns {string} - Decrypted password
 */
function decryptSMTPPassword(encryptedPassword) {
  if (!encryptedPassword) return null;
  
  if (!process.env.SETTINGS_ENCRYPTION_KEY) {
    throw new Error('Encryption key not configured');
  }

  try {
    return decryptText(encryptedPassword, process.env.SETTINGS_ENCRYPTION_KEY);
  } catch (err) {
    throw new Error('Failed to decrypt SMTP password: ' + err.message);
  }
}

/**
 * Encrypt SMTP password for secure storage
 * @param {string} password - Plain text password
 * @returns {string} - Encrypted password
 */
function encryptSMTPPassword(password) {
  if (!password) return null;
  
  if (!process.env.SETTINGS_ENCRYPTION_KEY) {
    console.warn('Encryption key not configured, password will be stored unencrypted');
    return password;
  }

  try {
    return encryptText(String(password), process.env.SETTINGS_ENCRYPTION_KEY);
  } catch (err) {
    throw new Error('Failed to encrypt SMTP password: ' + err.message);
  }
}

/**
 * Get ready-to-use SMTP config with decrypted password
 * @param {Object} smtpConfig - Raw SMTP config from database
 * @returns {Object} - SMTP config with decrypted password
 */
function prepareSmtpConfig(smtpConfig) {
  if (!smtpConfig) return null;

  const prepared = { ...smtpConfig };

  // Decrypt password if encrypted
  if (smtpConfig.encryptedPassword) {
    try {
      prepared.decryptedPassword = decryptSMTPPassword(smtpConfig.encryptedPassword);
      delete prepared.encryptedPassword;
    } catch (err) {
      console.error('Failed to decrypt SMTP password:', err.message);
      throw err;
    }
  } else if (smtpConfig.password) {
    // Fallback for legacy plaintext passwords
    prepared.decryptedPassword = smtpConfig.password;
    delete prepared.password;
  }

  return prepared;
}

/**
 * Create a nodemailer transporter from SMTP config
 * @param {Object} smtpConfig - Raw SMTP config from database
 * @returns {Object} - Nodemailer transporter instance
 */
function createTransporter(smtpConfig) {
  try {
    const prepared = prepareSmtpConfig(smtpConfig);
    const options = buildTransporterOptions(prepared);
    return nodemailer.createTransport(options);
  } catch (err) {
    throw new Error('Failed to create transporter: ' + err.message);
  }
}

/**
 * Validate SMTP configuration
 * @param {Object} smtpConfig - SMTP config to validate
 * @returns {Array} - Array of error messages (empty if valid)
 */
function validateSMTPConfig(smtpConfig) {
  const errors = [];

  if (!smtpConfig) {
    errors.push('SMTP configuration is missing');
    return errors;
  }

  // Only validate host if provided (allow partial updates)
  if (smtpConfig.host === '' || (smtpConfig.host && typeof smtpConfig.host !== 'string')) {
    errors.push('SMTP host must be a non-empty string if provided');
  }

  // Only validate port if provided
  if (smtpConfig.port && (smtpConfig.port < 1 || smtpConfig.port > 65535)) {
    errors.push('SMTP port must be between 1 and 65535');
  }

  // Only require password if user is being specified
  if (smtpConfig.user && !smtpConfig.encryptedPassword && !smtpConfig.password) {
    errors.push('SMTP password is required when user is specified');
  }

  return errors;
}

/**
 * Format SMTP config for API responses (sanitizes sensitive data)
 * @param {Object} smtpConfig - Raw SMTP config
 * @returns {Object} - Sanitized config for client
 */
function sanitizeSMTPConfig(smtpConfig) {
  if (!smtpConfig) return null;

  return {
    host: smtpConfig.host || null,
    port: smtpConfig.port || 587,
    secure: !!smtpConfig.secure,
    user: smtpConfig.user || null,
    passwordSet: !!(smtpConfig.encryptedPassword || smtpConfig.password),
    fromName: smtpConfig.fromName || null
  };
}

/**
 * Send test email via SMTP
 * @param {Object} smtpConfig - SMTP configuration from database
 * @param {Object} options - Options for test email
 *   - to: recipient email (required)
 *   - siteInfo: site name and contact info for email body
 * @returns {Promise<Object>} - Result with success status and message
 */
async function sendTestEmail(smtpConfig, options = {}) {
  const { to, siteInfo = {} } = options;

  if (!to) {
    throw new Error('Recipient email is required');
  }

  if (!smtpConfig || !smtpConfig.host) {
    throw new Error('SMTP not configured');
  }

  try {
    const transporter = createTransporter(smtpConfig);
    const siteName = siteInfo.siteName || 'Barangay System';
    const html = `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
          <h2>Test Email from ${siteName}</h2>
          <p>This is a test email to verify SMTP configuration.</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="font-size: 12px; color: #999;">
            Sent: ${new Date().toISOString()}<br>
            Site: ${siteName}
          </p>
        </body>
      </html>
    `;

    const fromEmail = smtpConfig.user || siteInfo.contactEmail || 'noreply@barangay.local';
    const fromName = smtpConfig.fromName || siteName;

    await transporter.sendMail({
      from: `${fromName} <${fromEmail}>`,
      to,
      subject: `Test Email - ${siteName}`,
      html
    });

    return {
      success: true,
      message: 'Test email sent successfully'
    };
  } catch (err) {
    const message = err.message || 'Unknown SMTP error';
    console.error('SMTP test failed:', message);
    throw new Error(message);
  }
}

module.exports = {
  buildTransporterOptions,
  decryptSMTPPassword,
  encryptSMTPPassword,
  prepareSmtpConfig,
  createTransporter,
  validateSMTPConfig,
  sanitizeSMTPConfig,
  sendTestEmail
};
