const sgMail = require('@sendgrid/mail');
const SystemSetting = require('../models/SystemSetting');
const SendGridConfig = require('../models/SendGridConfig');

/**
 * SendGrid Email Service
 * Handles all email sending operations using SendGrid API exclusively.
 * NO SMTP or Nodemailer usage - SendGrid only.
 */

/**
 * Load SendGrid configuration from database
 * @returns {Promise<Object>} SendGrid configuration object
 * @throws {Error} If SendGrid is not properly configured
 */
async function loadSendGridConfig() {
  try {
    const config = await SendGridConfig.getConfig();
    
    if (!config) {
      throw new Error('No SendGrid configuration found in sendgrid collection');
    }

    if (!config.enabled) {
      throw new Error('SendGrid email sending is disabled');
    }

    const { apiKey, fromEmail, fromName } = config;

    if (!apiKey || apiKey.length === 0) {
      throw new Error('SendGrid API key is missing or empty');
    }

    if (!fromEmail || fromEmail.length === 0) {
      throw new Error('SendGrid fromEmail is missing or empty');
    }

    console.log('[EmailService] SendGrid config loaded successfully:', {
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey.length,
      fromEmail: fromEmail,
      fromName: fromName || 'Barangay System'
    });

    return {
      apiKey,
      fromEmail,
      fromName: fromName || 'Barangay System',
      enabled: true
    };
  } catch (err) {
    console.error('[EmailService] Failed to load SendGrid config:', err.message);
    throw err;
  }
}

/**
 * Send email using SendGrid
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML email body
 * @param {Object} options.settings - SystemSetting document or config object
 * @returns {Promise<Object>} SendGrid response
 * @throws {Error} If configuration is missing or SendGrid API fails
 */
async function sendEmail({ to, subject, html, settings = null }) {
  try {
    // Validate required parameters
    if (!to || !to.trim()) {
      throw new Error('Recipient email address (to) is required');
    }

    if (!subject || !subject.trim()) {
      throw new Error('Email subject is required');
    }

    if (!html || !html.trim()) {
      throw new Error('Email body (html) is required');
    }

    console.log('[EmailService] Email send request:', {
      to,
      subject: subject.substring(0, 50) + '...',
      hasHtml: !!html,
      htmlLength: html.length
    });

    // Load configuration from database if not provided
    let config = settings?.email?.sendgrid ? settings.email.sendgrid : null;
    if (!config) {
      config = await loadSendGridConfig();
    }

    // Validate configuration
    if (!config.apiKey) {
      throw new Error('SendGrid API key not available');
    }

    if (!config.fromEmail) {
      throw new Error('SendGrid fromEmail not configured');
    }

    // Set SendGrid API key
    sgMail.setApiKey(config.apiKey);

    // Build message
    const msg = {
      to: to.trim(),
      from: {
        email: config.fromEmail,
        name: config.fromName || 'Barangay System'
      },
      subject: subject.trim(),
      html: html.trim(),
      replyTo: config.fromEmail
    };

    console.log('[EmailService] Sending email via SendGrid:', {
      to: msg.to,
      from: msg.from.email,
      fromName: msg.from.name,
      subject: msg.subject.substring(0, 50) + '...'
    });

    // Send email
    const response = await sgMail.send(msg);

    console.log('[EmailService] Email sent successfully:', {
      to: msg.to,
      statusCode: response[0]?.statusCode,
      messageId: response[0]?.headers?.['x-message-id']
    });

    return {
      success: true,
      messageId: response[0]?.headers?.['x-message-id'],
      statusCode: response[0]?.statusCode,
      message: 'Email sent successfully'
    };
  } catch (err) {
    // Attempt to capture SendGrid error body (masked) when available
    try {
      const maskString = (s) => {
        if (!s || typeof s !== 'string') return s;
        // Mask SendGrid API keys (start with SG.)
        s = s.replace(/SG\.[A-Za-z0-9_-]{10,}/g, 'SG.[REDACTED]');
        // Mask email local-part (keep domain)
        s = s.replace(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, (m, local, domain) => {
          const maskedLocal = local.length <= 2 ? '*'.repeat(local.length) : local[0] + '*'.repeat(Math.max(1, local.length - 2)) + local[local.length-1];
          return `${maskedLocal}@${domain}`;
        });
        return s;
      };

      const rawBody = err && err.response && err.response.body ? err.response.body : null;
      let maskedBody = null;
      if (rawBody) {
        try {
          const str = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
          maskedBody = maskString(str);
        } catch (e) {
          maskedBody = '[unserializable error body]';
        }
      }

      console.error('[EmailService] Failed to send email:', {
        message: err.message,
        to: to,
        subject: subject?.substring(0, 50),
        sendgridErrorBody: maskedBody
      });
    } catch (logErr) {
      console.error('[EmailService] Failed to send email (no extra info):', err && err.message);
    }

    throw err;
  }
}

/**
 * Test SendGrid connection with provided configuration
 * @param {Object} config - SendGrid configuration to test
 * @param {string} config.apiKey - SendGrid API key
 * @param {string} config.fromEmail - Sender email
 * @param {string} config.fromName - Sender name
 * @param {string} testEmail - Test recipient email
 * @returns {Promise<Object>} Test result
 */
async function testSendGridConnection(config, testEmail) {
  try {
    if (!config || !config.apiKey) {
      throw new Error('SendGrid API key is required for testing');
    }

    if (!config.fromEmail) {
      throw new Error('FromEmail is required for testing');
    }

    if (!testEmail || !testEmail.trim()) {
      throw new Error('Test email recipient is required');
    }

    console.log('[EmailService] Testing SendGrid connection:', {
      hasApiKey: !!config.apiKey,
      apiKeyLength: config.apiKey.length,
      fromEmail: config.fromEmail,
      testEmail: testEmail
    });

    // Set API key
    sgMail.setApiKey(config.apiKey);

    // Build test message
    const msg = {
      to: testEmail.trim(),
      from: {
        email: config.fromEmail,
        name: config.fromName || 'Barangay System'
      },
      subject: 'SendGrid Configuration Test',
      html: `
        <h2>SendGrid Test Email</h2>
        <p>This is a test email to verify SendGrid is properly configured.</p>
        <p><strong>Configuration:</strong></p>
        <ul>
          <li>From Email: ${config.fromEmail}</li>
          <li>From Name: ${config.fromName || 'Barangay System'}</li>
          <li>Sent At: ${new Date().toISOString()}</li>
        </ul>
        <p>If you received this email, SendGrid is working correctly!</p>
      `,
      replyTo: config.fromEmail
    };

    console.log('[EmailService] Sending test email:', {
      to: msg.to,
      from: msg.from.email,
      subject: msg.subject
    });

    // Send test email
    const response = await sgMail.send(msg);

    const result = {
      success: true,
      message: 'Test email sent successfully',
      details: {
        statusCode: response[0]?.statusCode,
        messageId: response[0]?.headers?.['x-message-id'],
        to: testEmail,
        from: config.fromEmail
      }
    };

    console.log('[EmailService] Test email sent successfully:', result.details);
    return result;
  } catch (err) {
    // Mask and log SendGrid error body for debugging
    try {
      const rawBody = err && err.response && err.response.body ? err.response.body : null;
      let maskedBody = null;
      if (rawBody) {
        try {
          const str = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
          // simple masking for API key and emails
          const s = str.replace(/SG\.[A-Za-z0-9_-]{10,}/g, 'SG.[REDACTED]')
                       .replace(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, (m, local, domain) => {
                         const maskedLocal = local.length <= 2 ? '*'.repeat(local.length) : local[0] + '*'.repeat(Math.max(1, local.length - 2)) + local[local.length-1];
                         return `${maskedLocal}@${domain}`;
                       });
          maskedBody = s;
        } catch (e) {
          maskedBody = '[unserializable error body]';
        }
      }

      console.error('[EmailService] SendGrid test failed:', {
        message: err.message,
        code: err.code,
        testEmail: testEmail,
        sendgridErrorBody: maskedBody
      });
    } catch (logErr) {
      console.error('[EmailService] SendGrid test failed (no extra info):', err.message);
    }

    // Provide more helpful error messages for common issues
    let userMessage = err.message || 'Unknown SendGrid error';
    
    if (err.code === 403 || err.message?.includes('403')) {
      userMessage = 'SendGrid rejected the request (403 Forbidden). This usually means: ' +
        '1) The sender email "' + config.fromEmail + '" is not verified in your SendGrid account, ' +
        '2) The API key does not have permission to send from this address, ' +
        'or 3) Your SendGrid domain is not verified. ' +
        'Please verify your sender email in SendGrid dashboard and ensure the API key is correct.';
    } else if (err.code === 401 || err.message?.includes('401')) {
      userMessage = 'SendGrid API key is invalid or unauthorized (401). Please check your API key in SendGrid dashboard.';
    } else if (err.code === 400 || err.message?.includes('400')) {
      userMessage = 'SendGrid request is invalid (400). Please check your configuration.';
    }

    const errorCode = err.code || 'SENDGRID_ERROR';
    throw new Error(`SendGrid test failed: ${userMessage} (${errorCode})`);
  }
}

/**
 * Verify SendGrid is available and configuration is valid
 * @returns {Promise<Object>} Verification result
 */
async function verifySendGridAvailable() {
  try {
    const config = await loadSendGridConfig();
    return {
      available: true,
      configured: true,
      config: {
        hasApiKey: !!config.apiKey,
        apiKeyLength: config.apiKey.length,
        fromEmail: config.fromEmail,
        fromName: config.fromName
      }
    };
  } catch (err) {
    console.warn('[EmailService] SendGrid verification failed:', err.message);
    return {
      available: false,
      configured: false,
      error: err.message
    };
  }
}

module.exports = {
  loadSendGridConfig,
  sendEmail,
  testSendGridConnection,
  verifySendGridAvailable
};
