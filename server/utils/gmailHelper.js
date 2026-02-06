const nodemailer = require('nodemailer');
const { decryptText, encryptText } = require('./cryptoHelper');

/**
 * Gmail Helper - Simplified Gmail authentication and transport management
 */

/**
 * Decrypt Gmail app password from encrypted storage
 * @param {string} encryptedPassword - Encrypted password from DB
 * @returns {string} - Decrypted password
 */
function decryptGmailPassword(encryptedPassword) {
  if (!encryptedPassword) return null;
  
  if (!process.env.SETTINGS_ENCRYPTION_KEY) {
    throw new Error('Encryption key not configured');
  }

  try {
    return decryptText(encryptedPassword, process.env.SETTINGS_ENCRYPTION_KEY);
  } catch (err) {
    throw new Error('Failed to decrypt Gmail password: ' + err.message);
  }
}

/**
 * Encrypt Gmail app password for secure storage
 * @param {string} password - Plain text app password
 * @returns {string} - Encrypted password
 */
function encryptGmailPassword(password) {
  if (!password) return null;
  
  if (!process.env.SETTINGS_ENCRYPTION_KEY) {
    console.warn('Encryption key not configured, password will be stored unencrypted');
    return password;
  }

  try {
    return encryptText(String(password), process.env.SETTINGS_ENCRYPTION_KEY);
  } catch (err) {
    throw new Error('Failed to encrypt Gmail password: ' + err.message);
  }
}

/**
 * Create a nodemailer transporter for Gmail
 * @param {Object} gmailConfig - Gmail config from database
 * @returns {Object} - Nodemailer transporter instance
 */
function createGmailTransporter(gmailConfig) {
  if (!gmailConfig || !gmailConfig.gmailAddress) {
    throw new Error('Gmail not configured: missing email address');
  }

  let decryptedPassword = null;
  
  // Try to use appPassword first (for testing), then fall back to encryptedPassword (for production)
  if (gmailConfig.appPassword) {
    decryptedPassword = gmailConfig.appPassword;
  } else if (gmailConfig.encryptedPassword) {
    try {
      decryptedPassword = decryptGmailPassword(gmailConfig.encryptedPassword);
    } catch (err) {
      console.error('Failed to decrypt Gmail password:', err.message);
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
        pass: decryptedPassword
      }
    });

    return transporter;
  } catch (err) {
    throw new Error('Failed to create Gmail transporter: ' + err.message);
  }
}

/**
 * Validate Gmail configuration
 * @param {Object} gmailConfig - Gmail config to validate
 * @returns {Array} - Array of error messages (empty if valid)
 */
function validateGmailConfig(gmailConfig) {
  const errors = [];

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
 * @param {Object} gmailConfig - Gmail configuration
 * @param {string} testEmail - Recipient email for test
 * @returns {Promise<Object>} - Result with success status
 */
async function testGmailConnection(gmailConfig, testEmail) {
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
      html
    });

    return {
      success: true,
      messageId: result.messageId,
      message: 'Test email sent successfully'
    };
  } catch (err) {
    console.error('[GmailHelper] Connection test failed:', err);
    return {
      success: false,
      error: err.message || String(err)
    };
  }
}

/**
 * Sanitize Gmail config for client response (remove sensitive data)
 * @param {Object} config - Gmail config object
 * @returns {Object} - Sanitized config
 */
function sanitizeGmailConfig(config) {
  if (!config) return null;
  
  const sanitized = {
    enabled: config.enabled,
    gmailAddress: config.gmailAddress,
    useAppPassword: config.useAppPassword,
    displayName: config.displayName || config.gmailAddress?.split('@')[0] || ''
    // DO NOT include encryptedPassword or appPassword
  };
  
  return sanitized;
}

module.exports = {
  encryptGmailPassword,
  decryptGmailPassword,
  createGmailTransporter,
  validateGmailConfig,
  testGmailConnection,
  sanitizeGmailConfig
};
