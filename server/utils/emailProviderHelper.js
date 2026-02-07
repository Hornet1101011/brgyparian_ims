const nodemailer = require('nodemailer');
const { decryptText, encryptText } = require('./cryptoHelper');

/**
 * Email Provider Helper - Support for multiple email/SMTP providers
 * Supports: Gmail, Mailtrap, SendGrid, AWS SES, and custom SMTP
 */

// Provider-specific configurations with defaults
const PROVIDER_CONFIGS = {
  gmail: {
    name: 'Gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requiresAuth: true,
    authField: 'gmailAppPassword',
    fields: ['gmailAddress', 'gmailAppPassword']
  },
  mailtrap: {
    name: 'Mailtrap',
    host: 'smtp.mailtrap.io',
    port: 587,
    secure: false,
    requiresAuth: true,
    authField: 'password',
    fields: ['user', 'password']
  },
  sendgrid: {
    name: 'SendGrid',
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    requiresAuth: true,
    authField: 'sendgridApiKey',
    fields: ['sendgridApiKey'],
    user: 'apikey' // SendGrid uses 'apikey' as username
  },
  'aws-ses': {
    name: 'AWS SES',
    host: 'email-smtp.{region}.amazonaws.com',
    port: 587,
    secure: false,
    requiresAuth: true,
    authField: 'awsSecretAccessKey',
    fields: ['awsAccessKeyId', 'awsSecretAccessKey', 'awsRegion']
  },
  custom: {
    name: 'Custom SMTP',
    requiresAuth: true,
    fields: ['host', 'port', 'secure', 'user', 'password']
  }
};

/**
 * Get provider configuration
 * @param {string} provider - Provider name (gmail, mailtrap, sendgrid, aws-ses, custom)
 * @returns {Object} - Provider config
 */
function getProviderConfig(provider) {
  return PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.custom;
}

/**
 * Decrypt email password
 * @param {string} encryptedPassword - Encrypted password
 * @returns {string} - Decrypted password
 */
function decryptEmailPassword(encryptedPassword) {
  if (!encryptedPassword) return null;
  
  if (!process.env.SETTINGS_ENCRYPTION_KEY) {
    // If no encryption key, assume plain text
    return encryptedPassword;
  }

  try {
    return decryptText(encryptedPassword, process.env.SETTINGS_ENCRYPTION_KEY);
  } catch (err) {
    console.warn('[EmailProvider] Decryption failed, treating as plain text:', err.message);
    return encryptedPassword;
  }
}

/**
 * Encrypt email password
 * @param {string} password - Plain text password
 * @returns {string} - Encrypted password
 */
function encryptEmailPassword(password) {
  if (!password) return null;
  
  if (!process.env.SETTINGS_ENCRYPTION_KEY) {
    return password; // Store as plain text if no encryption key
  }

  try {
    return encryptText(String(password), process.env.SETTINGS_ENCRYPTION_KEY);
  } catch (err) {
    console.warn('[EmailProvider] Encryption failed, storing as plain text:', err.message);
    return password;
  }
}

/**
 * Create email transporter based on provider
 * @param {Object} emailConfig - Email configuration from database
 * @returns {Object} - Nodemailer transporter
 */
function createEmailTransporter(emailConfig) {
  if (!emailConfig || !emailConfig.provider) {
    throw new Error('Email provider not configured');
  }

  const provider = emailConfig.provider;
  const providerConfig = getProviderConfig(provider);

  console.log(`[EmailProvider] Creating transporter for provider: ${provider}`);

  try {
    switch (provider) {
      case 'gmail':
        return createGmailTransporter(emailConfig);
      
      case 'mailtrap':
        return createMailtrapTransporter(emailConfig);
      
      case 'sendgrid':
        return createSendgridTransporter(emailConfig);
      
      case 'aws-ses':
        return createAwsTransporter(emailConfig);
      
      case 'custom':
        return createCustomSmtpTransporter(emailConfig);
      
      default:
        throw new Error(`Unknown email provider: ${provider}`);
    }
  } catch (err) {
    throw new Error(`Failed to create transporter for ${provider}: ${err.message}`);
  }
}

/**
 * Create Gmail transporter
 */
function createGmailTransporter(config) {
  if (!config.gmailAddress || !config.gmailAppPassword) {
    throw new Error('Gmail requires address and app password');
  }

  console.log('[EmailProvider] Gmail: Creating transporter with app password');

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.gmailAddress,
      pass: config.gmailAppPassword
    },
    connectionTimeout: 10000,
    socketTimeout: 10000
  });
}

/**
 * Create Mailtrap transporter
 */
function createMailtrapTransporter(config) {
  if (!config.user || !config.password) {
    throw new Error('Mailtrap requires username and password');
  }

  console.log('[EmailProvider] Mailtrap: Creating SMTP transporter');

  return nodemailer.createTransport({
    host: 'smtp.mailtrap.io',
    port: 587,
    secure: false,
    auth: {
      user: config.user,
      pass: config.password
    },
    connectionTimeout: 10000,
    socketTimeout: 10000
  });
}

/**
 * Create SendGrid transporter
 */
function createSendgridTransporter(config) {
  if (!config.sendgridApiKey) {
    throw new Error('SendGrid requires API key');
  }

  console.log('[EmailProvider] SendGrid: Creating SMTP transporter with API key');

  return nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    auth: {
      user: 'apikey',
      pass: config.sendgridApiKey
    },
    connectionTimeout: 10000,
    socketTimeout: 10000
  });
}

/**
 * Create AWS SES transporter
 */
function createAwsTransporter(config) {
  if (!config.awsAccessKeyId || !config.awsSecretAccessKey) {
    throw new Error('AWS SES requires access key and secret key');
  }

  const region = config.awsRegion || 'us-east-1';
  const host = `email-smtp.${region}.amazonaws.com`;

  console.log(`[EmailProvider] AWS SES: Creating transporter for region ${region}`);

  return nodemailer.createTransport({
    host,
    port: 587,
    secure: false,
    auth: {
      user: config.awsAccessKeyId,
      pass: config.awsSecretAccessKey
    },
    connectionTimeout: 10000,
    socketTimeout: 10000
  });
}

/**
 * Create custom SMTP transporter
 */
function createCustomSmtpTransporter(config) {
  if (!config.host || !config.port) {
    throw new Error('Custom SMTP requires host and port');
  }

  console.log(`[EmailProvider] Custom SMTP: Creating transporter for ${config.host}:${config.port}`);

  const transportConfig = {
    host: config.host,
    port: config.port,
    secure: !!config.secure,
    connectionTimeout: 10000,
    socketTimeout: 10000
  };

  if (config.user && config.password) {
    transportConfig.auth = {
      user: config.user,
      pass: config.password
    };
  }

  return nodemailer.createTransport(transportConfig);
}

/**
 * Send test email
 * @param {Object} emailConfig - Email configuration
 * @param {string} testEmail - Recipient email
 * @returns {Promise<Object>} - Result with success status
 */
async function sendTestEmail(emailConfig, testEmail) {
  try {
    if (!testEmail || !testEmail.includes('@')) {
      throw new Error('Valid test email required');
    }

    console.log(`[EmailProvider] Sending test email to ${testEmail} using ${emailConfig.provider}`);

    const transporter = createEmailTransporter(emailConfig);
    
    // Verify connection
    console.log('[EmailProvider] Verifying SMTP connection...');
    await transporter.verify();
    console.log('[EmailProvider] SMTP connection verified');
    
    const fromName = emailConfig.fromName || 'Barangay System';
    const fromEmail = emailConfig.fromEmail || emailConfig.gmailAddress || emailConfig.user;
    const from = `${fromName} <${fromEmail}>`;

    const html = `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
          <h2>Email Configuration Test</h2>
          <p>This is a test email to verify your email provider configuration.</p>
          <p><strong>Provider:</strong> ${emailConfig.provider.toUpperCase()}</p>
          <p>If you received this, your email setup is working correctly!</p>
          <hr>
          <p style="color: #999; font-size: 12px;">
            Sent from Barangay Information Management System
          </p>
        </body>
      </html>
    `;

    console.log('[EmailProvider] Sending test email...');
    const result = await transporter.sendMail({
      from,
      to: testEmail,
      subject: `Email Configuration Test - ${emailConfig.provider.toUpperCase()}`,
      html
    });

    console.log('[EmailProvider] Test email sent successfully:', result.messageId);
    return { 
      success: true, 
      messageId: result.messageId,
      provider: emailConfig.provider
    };
  } catch (err) {
    console.error('[EmailProvider] Test email failed:', err.message);
    return {
      success: false,
      error: err.message,
      provider: emailConfig.provider
    };
  }
}

/**
 * Sanitize email config for client (remove sensitive data)
 */
function sanitizeEmailConfig(config) {
  if (!config) return null;
  
  const sanitized = {
    enabled: config.enabled,
    provider: config.provider,
    fromName: config.fromName,
    fromEmail: config.fromEmail
  };

  // Only show non-sensitive info for display
  if (config.provider === 'gmail') {
    sanitized.gmailAddress = config.gmailAddress;
  } else if (config.provider === 'mailtrap') {
    sanitized.user = config.user;
  } else if (config.provider === 'aws-ses') {
    sanitized.awsRegion = config.awsRegion;
  } else if (config.provider === 'custom') {
    sanitized.host = config.host;
    sanitized.port = config.port;
    sanitized.user = config.user;
  }

  return sanitized;
}

/**
 * Get available provider options
 */
function getAvailableProviders() {
  return Object.entries(PROVIDER_CONFIGS).map(([key, config]) => ({
    id: key,
    name: config.name,
    fields: config.fields || []
  }));
}

module.exports = {
  createEmailTransporter,
  sendTestEmail,
  sanitizeEmailConfig,
  getAvailableProviders,
  getProviderConfig,
  encryptEmailPassword,
  decryptEmailPassword,
  PROVIDER_CONFIGS
};
