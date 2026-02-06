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
  if (!encryptedPassword) {
    console.log('[GmailHelper.decryptGmailPassword] No encrypted password provided');
    return null;
  }
  
  // If encryption key is not configured, assume password is stored unencrypted
  if (!process.env.SETTINGS_ENCRYPTION_KEY) {
    console.warn('[GmailHelper.decryptGmailPassword] Encryption key not configured, treating password as unencrypted');
    return encryptedPassword;
  }

  try {
    console.log('[GmailHelper.decryptGmailPassword] Attempting decryption with key length:', process.env.SETTINGS_ENCRYPTION_KEY.length);
    const decrypted = decryptText(encryptedPassword, process.env.SETTINGS_ENCRYPTION_KEY);
    console.log('[GmailHelper.decryptGmailPassword] Decryption successful:', {
      decryptedLength: decrypted.length,
      preview: decrypted.substring(0, 20) + '...'
    });
    return decrypted;
  } catch (err) {
    // If decryption fails, it might be an unencrypted password
    console.warn('[GmailHelper.decryptGmailPassword] Decryption failed, treating as unencrypted password:', {
      error: err.message,
      encryptedLength: encryptedPassword.length,
      returningAsIs: true
    });
    return encryptedPassword;
  }
}

/**
 * Encrypt Gmail app password for secure storage
 * @param {string} password - Plain text app password
 * @returns {string} - Encrypted password or plain password if no encryption key
 */
function encryptGmailPassword(password) {
  if (!password) {
    console.log('[GmailHelper.encryptGmailPassword] Password is null/empty, returning null');
    return null;
  }
  
  const passwordStr = String(password).trim();
  
  if (!passwordStr) {
    console.log('[GmailHelper.encryptGmailPassword] Password string is empty after trim, returning null');
    return null;
  }

  if (!process.env.SETTINGS_ENCRYPTION_KEY) {
    console.warn('[GmailHelper] Encryption key not configured, password will be stored as plain text:', {
      passwordLength: passwordStr.length,
      returning: 'plain password'
    });
    return passwordStr;
  }

  try {
    const encrypted = encryptText(passwordStr, process.env.SETTINGS_ENCRYPTION_KEY);
    if (!encrypted) {
      console.error('[GmailHelper.encryptGmailPassword] encryptText returned null/undefined, falling back to plain password');
      return passwordStr;
    }
    console.log('[GmailHelper] Password encrypted successfully:', {
      originalLength: passwordStr.length,
      encryptedLength: encrypted.length,
      encryptedStart: encrypted.substring(0, 20) + '...'
    });
    return encrypted;
  } catch (err) {
    console.error('[GmailHelper] Encryption failed, falling back to plain password:', {
      error: err.message,
      stack: err.stack,
      passwordLength: passwordStr.length
    });
    // Fall back to returning plain password instead of throwing
    return passwordStr;
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

  let passwordToUse = null;
  let passwordSource = null;
  
  // Priority: appPassword > password > encryptedPassword (for backwards compatibility)
  if (gmailConfig.appPassword) {
    passwordToUse = gmailConfig.appPassword;
    passwordSource = 'appPassword';
    console.log('[GmailTransporter] Using appPassword from config');
  } else if (gmailConfig.password) {
    passwordToUse = gmailConfig.password;
    passwordSource = 'password';
    console.log('[GmailTransporter] Using regular password from config');
  } else if (gmailConfig.encryptedPassword) {
    try {
      passwordToUse = decryptGmailPassword(gmailConfig.encryptedPassword);
      passwordSource = 'encryptedPassword (decrypted)';
      console.log('[GmailTransporter] Decrypted encryptedPassword successfully');
    } catch (err) {
      console.error('[GmailTransporter] Failed to decrypt Gmail password:', err.message);
      throw err;
    }
  }

  if (!passwordToUse) {
    throw new Error('Gmail not configured: missing password (appPassword, password, or encryptedPassword required)');
  }

  try {
    console.log('[GmailTransporter] Creating nodemailer transporter:', {
      gmailAddress: gmailConfig.gmailAddress,
      passwordSource,
      passwordLength: passwordToUse.length
    });
    
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailConfig.gmailAddress,
        pass: passwordToUse
      },
      connectionTimeout: 10000,
      socketTimeout: 10000
    });

    console.log('[GmailTransporter] Transporter created successfully using', passwordSource);
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

    console.log('[GmailHelper] Creating transporter for test...');
    const transporter = createGmailTransporter(gmailConfig);
    
    // Verify connection
    console.log('[GmailHelper] Verifying SMTP connection...');
    await transporter.verify();
    console.log('[GmailHelper] SMTP connection verified successfully');
    
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

    console.log('[GmailHelper] Sending test email to:', testEmail);
    const result = await transporter.sendMail({
      from,
      to: testEmail,
      subject: 'Gmail Configuration Test - Barangay System',
      html
    });

    console.log('[GmailHelper] Test email sent:', result && (result.response || result.messageId));
    return { success: true, info: result };
  } catch (err) {
    console.error('[GmailHelper] Test email failed:', err && err.message);
    return {
      success: false,
      error: err && err.message,
      statusCode: err && err.statusCode,
      response: err && err.response
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
