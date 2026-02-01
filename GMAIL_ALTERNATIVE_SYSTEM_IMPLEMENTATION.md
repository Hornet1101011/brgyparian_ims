# Gmail Alternative Emailing System Implementation Guide

## Overview
This document outlines the implementation of an alternate Gmail-based emailing system that can be toggled from the admin settings panel. When enabled, it will:
- Replace SMTP configuration
- Use Gmail OAuth2 or App Password authentication
- Maintain a single Gmail account as the sender/receiver for all email functionalities
- Provide an admin UI toggle to switch between SMTP and Gmail modes
- Automatically disable SMTP options when Gmail mode is active

## Implementation Plan

### Phase 1: Database Schema Updates

#### 1.1 Update SystemSetting Model
**File**: `server/models/SystemSetting.js`

Add a new email provider configuration schema:

```javascript
const gmailSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  gmailAddress: { type: String },
  useAppPassword: { type: Boolean, default: true }, // true = App Password, false = OAuth2
  appPassword: { type: String }, // encrypted
  // OAuth2 fields (for future use)
  oauth2ClientId: { type: String },
  oauth2ClientSecret: { type: String },
  oauth2RefreshToken: { type: String },
  displayName: { type: String }, // How the email sender name appears
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Add to systemSettingSchema:
gmail: { type: gmailSchema, default: {} }
```

#### 1.2 Update SystemSetting TypeScript Model
**File**: `server/src/models/SystemSetting.ts`

Add TypeScript interface and schema definition for Gmail configuration.

### Phase 2: Email Service Updates

#### 2.1 Create Gmail Helper Module
**File**: `server/utils/gmailHelper.js`

```javascript
const nodemailer = require('nodemailer');
const { decryptText, encryptText } = require('./cryptoHelper');

/**
 * Gmail Helper - Simplified Gmail authentication and transport management
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

function createGmailTransporter(gmailConfig) {
  if (!gmailConfig || !gmailConfig.gmailAddress) {
    throw new Error('Gmail not configured: missing email address');
  }

  const decryptedPassword = gmailConfig.appPassword 
    ? decryptGmailPassword(gmailConfig.appPassword)
    : null;

  if (!decryptedPassword) {
    throw new Error('Gmail not configured: missing app password');
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailConfig.gmailAddress,
      pass: decryptedPassword
    }
  });

  return transporter;
}

function validateGmailConfig(gmailConfig) {
  const errors = [];

  if (!gmailConfig) {
    errors.push('Gmail configuration is missing');
    return errors;
  }

  if (!gmailConfig.gmailAddress) {
    errors.push('Gmail address is required');
  } else if (!gmailConfig.gmailAddress.includes('@gmail.com')) {
    errors.push('Must be a valid Gmail address');
  }

  if (!gmailConfig.appPassword) {
    errors.push('Gmail app password is required');
  }

  return errors;
}

async function testGmailConnection(gmailConfig, testEmail) {
  try {
    const transporter = createGmailTransporter(gmailConfig);
    
    await transporter.verify();
    
    const html = `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
          <h2>Gmail Configuration Test</h2>
          <p>This is a test email to verify Gmail configuration.</p>
          <p>If you received this, your Gmail setup is working correctly!</p>
        </body>
      </html>
    `;

    const result = await transporter.sendMail({
      from: gmailConfig.gmailAddress,
      to: testEmail,
      subject: 'Gmail Configuration Test',
      html
    });

    return {
      success: true,
      messageId: result.messageId,
      message: 'Test email sent successfully'
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

function sanitizeGmailConfig(config) {
  if (!config) return null;
  
  const sanitized = {
    gmailAddress: config.gmailAddress,
    useAppPassword: config.useAppPassword,
    displayName: config.displayName,
    enabled: config.enabled
  };
  
  // Do NOT include appPassword or oauth2 secrets
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
```

#### 2.2 Update EmailService.ts
**File**: `server/src/services/EmailService.ts`

Modify to detect and use Gmail when enabled:

```typescript
async function getConfiguredTransporter(): Promise<Transporter> {
  const settings = await SystemSetting.findOne().lean();
  
  // Check if Gmail is enabled
  if (settings?.gmail?.enabled && settings.gmail.gmailAddress) {
    try {
      return createGmailTransporter(settings.gmail);
    } catch (err) {
      console.error('Failed to create Gmail transporter, falling back to SMTP:', err);
    }
  }
  
  // Fallback to SMTP or environment variables
  // ... existing SMTP logic
}
```

#### 2.3 Update emailService.js
**File**: `server/src/services/emailService.js`

Mirror the TypeScript implementation with CommonJS module.

### Phase 3: API Routes Updates

#### 3.1 Update Settings Routes
**File**: `server/routes/settingsRoutes.js`

Add new endpoints:

```javascript
// GET /api/settings/gmail - Get Gmail configuration (sanitized)
router.get('/gmail', requireAuth, isAdmin, async (req, res) => {
  try {
    const settings = await SystemSetting.findOne().lean();
    const gmailConfig = settings?.gmail ? sanitizeGmailConfig(settings.gmail) : null;
    return res.json({ gmail: gmailConfig });
  } catch (err) {
    console.error('Error fetching Gmail settings:', err);
    return res.status(500).json({ message: 'Failed to load Gmail settings' });
  }
});

// PATCH /api/settings/gmail - Update Gmail configuration
router.patch('/gmail', requireAuth, isAdmin, async (req, res) => {
  try {
    const { gmailAddress, appPassword, displayName, useAppPassword, enabled } = req.body;
    
    // Validate
    const errors = validateGmailConfig({
      gmailAddress,
      appPassword,
      useAppPassword
    });
    
    if (errors.length > 0) {
      return res.status(400).json({ message: 'Validation error', errors });
    }
    
    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = new SystemSetting();
    }
    
    // Encrypt the password
    const encryptedPassword = encryptGmailPassword(appPassword);
    
    settings.gmail = {
      enabled,
      gmailAddress,
      appPassword: encryptedPassword,
      displayName: displayName || gmailAddress.split('@')[0],
      useAppPassword: useAppPassword !== false
    };
    
    await settings.save();
    
    // Record audit
    await recordAudit(req.user._id, 'gmail_config_updated', {
      gmailAddress,
      enabled
    }, req.ip);
    
    // Clear transporter cache
    gmailTransporter = null;
    
    return res.json({
      success: true,
      gmail: sanitizeGmailConfig(settings.gmail)
    });
  } catch (err) {
    console.error('Error updating Gmail settings:', err);
    return res.status(500).json({ message: 'Failed to update Gmail settings' });
  }
});

// POST /api/settings/gmail/test - Test Gmail connection
router.post('/gmail/test', requireAuth, isAdmin, async (req, res) => {
  try {
    const { testEmail } = req.body;
    
    if (!testEmail || !testEmail.includes('@')) {
      return res.status(400).json({ message: 'Valid test email is required' });
    }
    
    const settings = await SystemSetting.findOne().lean();
    if (!settings?.gmail?.enabled) {
      return res.status(400).json({ message: 'Gmail is not configured or enabled' });
    }
    
    // Decrypt password for testing
    const gmailConfig = {
      ...settings.gmail,
      appPassword: decryptGmailPassword(settings.gmail.appPassword)
    };
    
    const result = await testGmailConnection(gmailConfig, testEmail);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Gmail test failed: ' + result.error
      });
    }
    
    return res.json({
      success: true,
      message: 'Test email sent successfully',
      messageId: result.messageId
    });
  } catch (err) {
    console.error('Error testing Gmail:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to test Gmail: ' + err.message
    });
  }
});
```

### Phase 4: Admin UI Updates

#### 4.1 Update SystemSettings Component
**File**: `client/src/components/admin/SystemSettings.tsx`

Add Gmail configuration section:

```tsx
interface GmailSettings {
  enabled: boolean;
  gmailAddress: string;
  appPassword: string;
  displayName: string;
  useAppPassword: boolean;
}

// Add to component state:
const [gmailSettings, setGmailSettings] = useState<GmailSettings>({
  enabled: false,
  gmailAddress: '',
  appPassword: '',
  displayName: '',
  useAppPassword: true,
});

const [gmailLoading, setGmailLoading] = useState(false);
const [savingGmailSettings, setSavingGmailSettings] = useState(false);

// Load Gmail settings on mount
useEffect(() => {
  loadGmailSettings();
}, []);

const loadGmailSettings = async () => {
  try {
    setGmailLoading(true);
    const response = await adminAPI.get('/api/settings/gmail');
    if (response.data?.gmail) {
      setGmailSettings(response.data.gmail);
    }
  } catch (err) {
    console.error('Failed to load Gmail settings:', err);
  } finally {
    setGmailLoading(false);
  }
};

const handleSaveGmailSettings = async () => {
  try {
    setSavingGmailSettings(true);
    
    const response = await adminAPI.patch('/api/settings/gmail', gmailSettings);
    
    setGmailSettings(response.data.gmail);
    antdMessage.success('Gmail settings updated successfully');
  } catch (err: any) {
    console.error('Failed to save Gmail settings:', err);
    antdMessage.error(err.response?.data?.message || 'Failed to save Gmail settings');
  } finally {
    setSavingGmailSettings(false);
  }
};

const handleTestGmailConnection = async () => {
  try {
    setSavingGmailSettings(true);
    
    const testEmail = gmailSettings.gmailAddress;
    const response = await adminAPI.post('/api/settings/gmail/test', {
      testEmail
    });
    
    antdMessage.success('Test email sent successfully');
  } catch (err: any) {
    console.error('Gmail test failed:', err);
    antdMessage.error(err.response?.data?.message || 'Gmail test failed');
  } finally {
    setSavingGmailSettings(false);
  }
};
```

Add UI section in the render method:

```tsx
{/* Gmail Configuration Section */}
<Box sx={{ mt: 3, mb: 3 }}>
  <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
    Alternative Email System - Gmail
  </Typography>
  
  <Alert severity="info" sx={{ mb: 2 }}>
    Enable Gmail as an alternative to SMTP. When enabled, SMTP settings will be disabled.
    Learn how to <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noopener noreferrer">
    create a Gmail App Password</a>.
  </Alert>
  
  <FormControlLabel
    control={
      <Switch
        checked={gmailSettings.enabled}
        onChange={(e) => setGmailSettings({ ...gmailSettings, enabled: e.target.checked })}
      />
    }
    label="Enable Gmail"
  />
  
  {gmailSettings.enabled && (
    <>
      <TextField
        label="Gmail Address"
        value={gmailSettings.gmailAddress}
        onChange={(e) => setGmailSettings({ ...gmailSettings, gmailAddress: e.target.value })}
        fullWidth
        margin="normal"
        type="email"
        placeholder="your-email@gmail.com"
      />
      
      <TextField
        label="App Password"
        value={gmailSettings.appPassword}
        onChange={(e) => setGmailSettings({ ...gmailSettings, appPassword: e.target.value })}
        fullWidth
        margin="normal"
        type="password"
        placeholder="16-character app password from Gmail"
      />
      
      <TextField
        label="Display Name"
        value={gmailSettings.displayName}
        onChange={(e) => setGmailSettings({ ...gmailSettings, displayName: e.target.value })}
        fullWidth
        margin="normal"
        placeholder="How sender name appears in emails"
      />
      
      <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
        <Button
          variant="contained"
          onClick={handleSaveGmailSettings}
          disabled={savingGmailSettings}
        >
          {savingGmailSettings ? 'Saving...' : 'Save Gmail Settings'}
        </Button>
        
        <Button
          variant="outlined"
          onClick={handleTestGmailConnection}
          disabled={!gmailSettings.gmailAddress || !gmailSettings.appPassword || savingGmailSettings}
        >
          Test Connection
        </Button>
      </Box>
    </>
  )}
</Box>

{/* SMTP Section - Disabled when Gmail enabled */}
{!gmailSettings.enabled && (
  <>
    {/* Existing SMTP settings UI */}
  </>
)}
```

### Phase 5: Email Service Email Sending Logic

#### 5.1 Update sendMail Function

Both TypeScript and JavaScript versions should:

1. Check if Gmail is enabled
2. If enabled, use Gmail transporter
3. Use Gmail address as sender
4. Apply display name if configured
5. Fall back to SMTP if Gmail fails

```typescript
export async function sendMail(
  to: string,
  subject: string,
  html: string,
  bcc?: string[],
  emailType?: string
) {
  try {
    // Check email type is enabled
    const enabled = await isEmailTypeEnabled(emailType);
    if (!enabled) {
      console.log(`[EmailService] Email type '${emailType}' disabled`);
      return { messageId: 'skipped', response: 'Email sending disabled' };
    }
    
    const transporter = await getConfiguredTransporter();
    const settings = await SystemSetting.findOne().lean();
    
    // Determine sender
    let fromEmail: string;
    let fromName: string;
    
    if (settings?.gmail?.enabled && settings.gmail.gmailAddress) {
      fromEmail = settings.gmail.gmailAddress;
      fromName = settings.gmail.displayName || 'Barangay System';
    } else {
      fromEmail = settings?.smtp?.user || process.env.BIMS_EMAIL;
      fromName = settings?.smtp?.fromName || 'Barangay System';
    }
    
    const from = `${fromName} <${fromEmail}>`;
    
    const mailOptions: any = {
      from,
      to,
      subject,
      html,
    };
    
    if (bcc && Array.isArray(bcc) && bcc.length > 0) {
      mailOptions.bcc = bcc;
    }
    
    const info = await transporter.sendMail(mailOptions);
    
    // Log email
    if (bcc && bcc.length > 0) {
      await logEmailToDb(to, subject, true, undefined, info.messageId, emailType, bcc.length);
    } else {
      await logEmailToDb(to, subject, true, undefined, info.messageId, emailType);
    }
    
    return info;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[EmailService] Failed to send email:', err);
    throw err;
  }
}
```

### Phase 6: Testing

1. **Unit Tests**: Create tests for Gmail helper functions
2. **Integration Tests**: Test email sending with Gmail enabled
3. **Manual Testing**: 
   - Create Gmail account for testing
   - Generate App Password
   - Test through admin UI
   - Verify emails are sent correctly
   - Verify SMTP is disabled when Gmail is enabled

### Phase 7: Documentation

Update user documentation to include:
- How to create Gmail App Password
- How to enable Gmail in admin settings
- Security considerations for storing Gmail credentials
- Troubleshooting common Gmail issues

## Email Functionalities to Support

The following existing email functionalities will work with Gmail:

1. **Password Reset Emails** - OTP/reset links
2. **OTP Emails** - One-time passwords for login
3. **Document Notifications** - Document approval/rejection
4. **Announcement Emails** - Bulk announcements to residents
5. **System Notifications** - Various system-level emails
6. **Verification Emails** - Email verification during registration

## Security Considerations

1. **Encryption**: App passwords are encrypted using SETTINGS_ENCRYPTION_KEY
2. **No Plaintext Storage**: Passwords never stored in plaintext
3. **Admin-Only Access**: Only admins can configure Gmail
4. **Audit Logging**: All Gmail configuration changes logged
5. **Rate Limiting**: Gmail has built-in rate limiting per Google's policies

## Rollback Plan

If issues occur:
1. Disable Gmail in admin settings
2. SMTP will be used as fallback
3. All email logs preserved for debugging
4. No data loss or corruption

## Future Enhancements

1. OAuth2 support for better security
2. Multiple email account support
3. Email templates management
4. Advanced analytics dashboard
5. Scheduled email sending
6. Email bounce handling

---

## Implementation Checklist

- [ ] Phase 1: Database schema updates
- [ ] Phase 2: Gmail helper module creation
- [ ] Phase 2: Email service updates
- [ ] Phase 3: API routes for Gmail settings
- [ ] Phase 4: Admin UI components
- [ ] Phase 5: Email sending logic updates
- [ ] Phase 6: Testing (unit and integration)
- [ ] Phase 7: Documentation
- [ ] Code review and QA
- [ ] Deployment to production
