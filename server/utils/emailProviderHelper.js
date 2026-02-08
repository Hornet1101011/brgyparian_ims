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
/**
 * Normalize SMTP configuration
 * - Automatically sets secure flag based on port (465=SSL, 587=TLS)
 * - Converts port to number
 * - Validates port range
 * @param {Object} config - Raw SMTP config
 * @returns {Object} - Normalized config
 */
function normalizeSmtpConfig(config) {
  if (!config || config.provider !== 'custom') {
    return config;
  }

  const normalized = { ...config };
  
  // Convert port to number
  if (config.port) {
    const portNum = Number(config.port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      throw new Error(`Invalid SMTP port: must be a number between 1 and 65535, got ${config.port}`);
    }
    normalized.port = portNum;
  }

  // Auto-set secure flag based on port if not explicitly set
  if (normalized.port && typeof config.secure !== 'boolean') {
    // Port 465 = Implicit TLS (secure=true)
    // Port 587 = STARTTLS (secure=false)
    // Port 25 = Plain SMTP (secure=false)
    if (normalized.port === 465) {
      normalized.secure = true;
      console.log(`[EmailProvider] SMTP: Auto-set secure=true for port ${normalized.port} (SSL/TLS implicit)`);
    } else if (normalized.port === 587) {
      normalized.secure = false;
      console.log(`[EmailProvider] SMTP: Auto-set secure=false for port ${normalized.port} (STARTTLS)`);
    } else {
      // Default to false for other ports (25, 2525, etc.)
      normalized.secure = false;
      console.log(`[EmailProvider] SMTP: Auto-set secure=false for port ${normalized.port} (default)`);
    }
  } else if (normalized.port && typeof config.secure === 'boolean') {
    // Explicit secure setting provided - validate against common port conventions
    const isStandardSslPort = normalized.port === 465;
    const isStandardTlsPort = normalized.port === 587;
    
    if (isStandardSslPort && !config.secure) {
      console.warn(`[EmailProvider] SMTP: Warning - port ${normalized.port} typically uses secure=true, but secure=${config.secure} was explicitly set`);
    } else if (isStandardTlsPort && config.secure) {
      console.warn(`[EmailProvider] SMTP: Warning - port ${normalized.port} typically uses secure=false, but secure=${config.secure} was explicitly set`);
    }
    normalized.secure = config.secure;
  } else {
    // No port info or no secure flag - default to false
    normalized.secure = typeof config.secure === 'boolean' ? config.secure : false;
  }

  return normalized;
}

/**
 * Validate Custom SMTP configuration
 * @param {Object} config - SMTP config to validate
 * @returns {Object} - { isValid: boolean, error?: string, missingFields?: string[] }
 */
function validateCustomSmtpConfig(config) {
  const errors = [];

  if (!config.host) {
    errors.push('host');
  }

  if (!config.port) {
    errors.push('port');
  } else {
    const portNum = Number(config.port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      return {
        isValid: false,
        error: `Invalid SMTP port: must be between 1 and 65535, got ${config.port}`,
        invalidField: 'port'
      };
    }
  }

  if (!config.user) {
    errors.push('user');
  }

  if (!config.password) {
    errors.push('password');
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      error: `Missing required fields: ${errors.join(', ')}`,
      missingFields: errors
    };
  }

  return { isValid: true };
}

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

  // Normalize configuration (auto-set secure flag based on port)
  const normalized = normalizeSmtpConfig(config);

  // Validate normalized config
  const validation = validateCustomSmtpConfig(normalized);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  console.log(`[EmailProvider] Custom SMTP: Creating transporter for ${normalized.host}:${normalized.port} (secure=${normalized.secure})`);

  // DEBUG: Log SMTP configuration details (passwords masked)
  console.log('[EmailProvider] DEBUG: Custom SMTP Configuration:', {
    provider: 'custom',
    host: normalized.host,
    port: normalized.port,
    secure: normalized.secure,
    username: normalized.user ? `${normalized.user.substring(0, 3)}***` : '(none)',
    hasPassword: !!normalized.password
  });

  const transportConfig = {
    host: normalized.host,
    port: normalized.port,
    secure: normalized.secure,
    connectionTimeout: 10000,
    socketTimeout: 10000
  };

  // Add authentication if credentials provided
  if (normalized.user && normalized.password) {
    transportConfig.auth = {
      user: normalized.user,
      pass: normalized.password
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

    // Normalize custom SMTP configuration (auto-set secure flag based on port)
    let normalizedConfig = emailConfig;
    if (emailConfig.provider === 'custom') {
      try {
        normalizedConfig = normalizeSmtpConfig(emailConfig);
        console.log('[EmailProvider] SMTP config normalized for test:', {
          port: normalizedConfig.port,
          secure: normalizedConfig.secure,
          autoNormalized: normalizedConfig.secure !== emailConfig.secure
        });
      } catch (normalizeErr) {
        console.error('[EmailProvider] Failed to normalize SMTP config:', normalizeErr.message);
        throw new Error(`SMTP config normalization failed: ${normalizeErr.message}`);
      }
    }

    console.log(`[EmailProvider] Sending test email to ${testEmail} using ${normalizedConfig.provider}`);

    // DEBUG: Log email configuration being tested
    console.log('[EmailProvider] DEBUG: Email config for test:', {
      provider: normalizedConfig.provider,
      enabled: normalizedConfig.enabled,
      fromName: normalizedConfig.fromName,
      fromEmail: normalizedConfig.fromEmail,
      ...(normalizedConfig.provider === 'custom' && {
        host: normalizedConfig.host,
        port: normalizedConfig.port,
        secure: normalizedConfig.secure,
        username: normalizedConfig.user ? `${normalizedConfig.user.substring(0, 3)}***` : '(none)',
        hasPassword: !!normalizedConfig.password
      }),
      ...(normalizedConfig.provider === 'gmail' && {
        gmailAddress: normalizedConfig.gmailAddress,
        hasAppPassword: !!normalizedConfig.gmailAppPassword
      })
    });

    const transporter = createEmailTransporter(normalizedConfig);
    
    // Verify SMTP connection before sending
    console.log('[EmailProvider] Verifying SMTP connection...');
    try {
      await transporter.verify();
      console.log('[EmailProvider] SMTP connection verified successfully');
      console.log('[EmailProvider] DEBUG: Verification successful for provider:', normalizedConfig.provider);
    } catch (verifyErr) {
      console.error('[EmailProvider] SMTP verification failed:', verifyErr.message);
      
      // Return detailed verification error
      const verificationError = {
        success: false,
        error: `SMTP verification failed: ${verifyErr.message}`,
        verificationDetails: {
          message: verifyErr.message,
          code: verifyErr.code,
          command: verifyErr.command
        },
        provider: normalizedConfig.provider,
        hint: getSmtpVerificationHint(normalizedConfig.provider, verifyErr)
      };
      
      return verificationError;
    }
    
    const fromName = normalizedConfig.fromName || 'Barangay System';
    const fromEmail = normalizedConfig.fromEmail || normalizedConfig.gmailAddress || normalizedConfig.user;
    const from = `${fromName} <${fromEmail}>`;

    const html = `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
          <h2>Email Configuration Test</h2>
          <p>This is a test email to verify your email provider configuration.</p>
          <p><strong>Provider:</strong> ${normalizedConfig.provider.toUpperCase()}</p>
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
      subject: `Email Configuration Test - ${normalizedConfig.provider.toUpperCase()}`,
      html
    });

    console.log('[EmailProvider] Test email sent successfully:', result.messageId);
    console.log('[EmailProvider] DEBUG: Test email delivery details:', {
      provider: normalizedConfig.provider,
      recipient: testEmail,
      messageId: result.messageId,
      timestamp: new Date().toISOString()
    });
    
    return { 
      success: true, 
      messageId: result.messageId,
      provider: emailConfig.provider
    };
  } catch (err) {
    console.error('[EmailProvider] Test email failed:', err.message);
    console.error('[EmailProvider] DEBUG: Test email error details:', {
      provider: emailConfig.provider,
      error: err.message,
      errorCode: err.code,
      timestamp: new Date().toISOString()
    });
    
    return {
      success: false,
      error: err.message,
      provider: emailConfig.provider
    };
  }
}

/**
 * Get helpful error message for SMTP verification failures
 */
function getSmtpVerificationHint(provider, error) {
  if (provider === 'custom') {
    const msg = error.message.toLowerCase();
    if (msg.includes('econnrefused') || msg.includes('refused')) {
      return 'Cannot connect to SMTP server. Check host and port are correct.';
    }
    if (msg.includes('timeout')) {
      return 'Connection timeout. SMTP server is not responding. Check firewall rules.';
    }
    if (msg.includes('auth') || msg.includes('invalid credentials')) {
      return 'Authentication failed. Check username and password.';
    }
    if (msg.includes('tls') || msg.includes('ssl')) {
      return 'TLS/SSL error. Try toggling the "Secure (TLS/SSL)" setting.';
    }
    return 'Check SMTP configuration: host, port, credentials, and TLS setting.';
  }
  
  if (provider === 'gmail') {
    return 'Check Gmail address and app password are correct. Enable "Less secure app access" if needed.';
  }
  
  if (provider === 'mailtrap') {
    return 'Check Mailtrap username and password are correct.';
  }
  
  if (provider === 'sendgrid') {
    return 'Check SendGrid API key is correct and valid.';
  }
  
  if (provider === 'aws-ses') {
    return 'Check AWS access key, secret key, and region are correct.';
  }
  
  return 'Check provider credentials and configuration.';
}

/**
 * Sanitize email config for client (remove sensitive data)
 */
function sanitizeEmailConfig(config) {
  if (!config) {
    return {
      enabled: false,
      provider: 'custom',
      fromName: 'Barangay System',
      fromEmail: '',
      // Provider-specific defaults
      host: '',
      port: 587,
      user: '',
      gmailAddress: '',
      awsRegion: '',
      sendgridApiKey: '',
      mailtrapKey: ''
    };
  }
  
  const sanitized = {
    enabled: config.enabled || false,
    provider: config.provider || 'custom',
    fromName: config.fromName || 'Barangay System',
    fromEmail: config.fromEmail || ''
  };

  // Add provider-specific fields - all non-sensitive fields
  // NOTE: Passwords/API keys/secrets are EXCLUDED for security
  
  if (config.provider === 'gmail') {
    sanitized.gmailAddress = config.gmailAddress || '';
  } else if (config.provider === 'mailtrap') {
    sanitized.user = config.user || '';
    // mailtrapKey is sensitive - excluded
  } else if (config.provider === 'sendgrid') {
    // sendgridApiKey is sensitive - excluded
  } else if (config.provider === 'aws-ses') {
    sanitized.awsRegion = config.awsRegion || '';
    // awsAccessKeyId and awsSecretAccessKey are sensitive - excluded
  } else if (config.provider === 'custom') {
    sanitized.host = config.host || '';
    sanitized.port = config.port || 587;
    sanitized.user = config.user || '';
    sanitized.secure = typeof config.secure === 'boolean' ? config.secure : false;
    // password is sensitive - excluded
  }

  return sanitized;
}

/**
 * Simulate sending an email without actually calling the provider
 * Used for testing email configuration without risking real sends
 * @param {Object} emailConfig - Email configuration
 * @param {Object} emailOptions - Email options (to, subject, html, etc.)
 * @param {boolean} logToDatabase - Whether to log to EmailLog collection
 * @returns {Promise<Object>} - Result with simulated send details
 */
async function simulateSendEmail(emailConfig, emailOptions, logToDatabase = false) {
  try {
    if (!emailConfig || !emailConfig.provider) {
      throw new Error('Email provider not configured');
    }

    if (!emailOptions || !emailOptions.to || !emailOptions.subject) {
      throw new Error('Email recipient and subject are required');
    }

    const simulatedMessageId = `dry-run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log('[EmailProvider] DRY-RUN MODE: Simulating email send', {
      provider: emailConfig.provider,
      recipient: emailOptions.to,
      subject: emailOptions.subject,
      from: emailConfig.fromEmail || 'noreply@barangay.local',
      simulatedMessageId,
      htmlLength: emailOptions.html ? emailOptions.html.length : 0
    });

    // Log simulated email to database if requested
    if (logToDatabase) {
      try {
        const { EmailLog } = require('../src/models/EmailLog');
        const emailLog = new EmailLog({
          recipient: emailOptions.to,
          subject: emailOptions.subject,
          status: 'sent', // Dry-run emails are marked as "sent"
          messageId: simulatedMessageId,
          emailType: emailOptions.emailType || 'generic',
          bccRecipientsCount: emailOptions.bccRecipientsCount || 0,
          dateSent: new Date(),
          errorMessage: '[DRY-RUN MODE] Simulated email - not actually sent'
        });
        
        await emailLog.save();
        console.log('[EmailProvider] DRY-RUN: Logged simulated email to EmailLog collection', {
          recipient: emailOptions.to,
          messageId: simulatedMessageId
        });
      } catch (logErr) {
        console.warn('[EmailProvider] DRY-RUN: Failed to log email to database:', logErr.message);
      }
    } else {
      // Log to console if not logging to database
      console.log('[EmailProvider] DRY-RUN: Email not logged to database (logToDatabase=false)');
    }

    return {
      success: true,
      isDryRun: true,
      messageId: simulatedMessageId,
      provider: emailConfig.provider,
      recipient: emailOptions.to,
      subject: emailOptions.subject,
      mode: 'dry-run'
    };
  } catch (err) {
    console.error('[EmailProvider] DRY-RUN simulation error:', err.message);
    throw err;
  }
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

/**
 * Perform health check on email provider connectivity
 * @param {Object} emailConfig - Email provider configuration
 * @returns {Promise<Object>} Health check result with status, timestamp, and error if any
 */
async function performHealthCheck(emailConfig) {
  const healthCheckStart = Date.now();
  
  try {
    if (!emailConfig || !emailConfig.enabled || !emailConfig.provider) {
      console.log('[EmailProvider] Health check skipped: email provider not configured');
      return {
        status: 'warning',
        message: 'Email provider not configured',
        provider: null,
        checkDurationMs: Date.now() - healthCheckStart,
        timestamp: new Date()
      };
    }

    console.log('[EmailProvider] Starting health check for provider:', emailConfig.provider);

    // Create transporter for connectivity test
    const transporter = createEmailTransporter(emailConfig);
    
    // Verify connection with timeout
    console.log('[EmailProvider] Verifying SMTP connection...');
    const verifyPromise = transporter.verify();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Health check timeout (30s)')), 30000)
    );

    try {
      await Promise.race([verifyPromise, timeoutPromise]);
    } catch (raceErr) {
      throw raceErr;
    }

    console.log('[EmailProvider] Health check passed for provider:', emailConfig.provider);

    return {
      status: 'ok',
      message: 'Email provider connectivity verified',
      provider: emailConfig.provider,
      checkDurationMs: Date.now() - healthCheckStart,
      timestamp: new Date()
    };
  } catch (err) {
    const errorMessage = err.message || String(err);
    console.error('[EmailProvider] Health check failed:', {
      provider: emailConfig?.provider,
      error: errorMessage,
      code: err.code,
      command: err.command
    });

    return {
      status: 'failed',
      message: 'Email provider connectivity check failed',
      provider: emailConfig?.provider,
      error: errorMessage,
      checkDurationMs: Date.now() - healthCheckStart,
      timestamp: new Date()
    };
  }
}

/**
 * Update health check status in database
 * @param {string} healthStatus - 'ok', 'warning', or 'failed'
 * @param {string} [error] - Optional error message
 * @returns {Promise<Object>} Updated settings
 */
async function updateHealthCheckStatus(healthStatus, error = null) {
  try {
    const { SystemSetting } = require('../models/SystemSetting');
    if (!SystemSetting) {
      console.warn('[EmailProvider] SystemSetting model not available');
      return null;
    }

    const update = {
      'smtp.lastHealthCheckAt': new Date(),
      'smtp.lastHealthStatus': healthStatus
    };

    if (error) {
      update['smtp.lastHealthCheckError'] = error;
    }

    const settings = await SystemSetting.findOneAndUpdate({}, { $set: update }, { new: true });
    
    console.log('[EmailProvider] Health check status updated:', {
      status: healthStatus,
      timestamp: new Date().toISOString(),
      hasError: !!error
    });

    return settings;
  } catch (err) {
    console.error('[EmailProvider] Failed to update health check status:', err.message);
    return null;
  }
}

module.exports = {
  createEmailTransporter,
  sendTestEmail,
  simulateSendEmail,
  sanitizeEmailConfig,
  getAvailableProviders,
  getProviderConfig,
  encryptEmailPassword,
  decryptEmailPassword,
  performHealthCheck,
  updateHealthCheckStatus,
  normalizeSmtpConfig,
  validateCustomSmtpConfig,
  PROVIDER_CONFIGS
};
