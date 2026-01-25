# SMTP Helper Quick Reference

## Import Statement
```javascript
const smtpHelper = require('../utils/smtpHelper');
```

## Function Reference

### 1. Validate SMTP Configuration
```javascript
const errors = smtpHelper.validateSMTPConfig(smtpConfig);
// Returns: Array of error strings
// Usage: Check if SMTP config is valid before using
```

### 2. Encrypt Password
```javascript
const encrypted = smtpHelper.encryptSMTPPassword('mypassword');
// Returns: Encrypted password string
// Throws: Error if SETTINGS_ENCRYPTION_KEY not set
```

### 3. Decrypt Password
```javascript
const decrypted = smtpHelper.decryptSMTPPassword(encryptedPassword);
// Returns: Decrypted password string
// Throws: Error if decryption fails
```

### 4. Prepare SMTP Config
```javascript
const prepared = smtpHelper.prepareSmtpConfig(dbSmtpConfig);
// Returns: SMTP config with decryptedPassword property
// Automatically handles encryption key and fallbacks
```

### 5. Create Transporter
```javascript
const transporter = smtpHelper.createTransporter(dbSmtpConfig);
// Returns: Nodemailer transporter ready to use
// Usage: await transporter.sendMail({ ... })
```

### 6. Build Transporter Options
```javascript
const options = smtpHelper.buildTransporterOptions(preparedConfig);
// Returns: Raw options object for nodemailer
// Usage: Advanced, usually use createTransporter() instead
```

### 7. Sanitize for API Response
```javascript
const sanitized = smtpHelper.sanitizeSMTPConfig(dbSmtpConfig);
// Returns: { host, port, secure, user, passwordSet, fromName }
// Usage: Remove sensitive data before sending to client
```

### 8. Send Test Email
```javascript
const result = await smtpHelper.sendTestEmail(dbSmtpConfig, {
  to: 'admin@example.com',
  siteInfo: {
    siteName: 'My Barangay',
    contactEmail: 'contact@barangay.local'
  }
});
// Returns: { success: true, message: '...' }
// Throws: Error with descriptive message on failure
```

## Common Patterns

### Pattern 1: Validate and Test SMTP
```javascript
const smtpConfig = settings.smtp;
const errors = smtpHelper.validateSMTPConfig(smtpConfig);

if (errors.length > 0) {
  return res.json({ valid: false, errors });
}

try {
  const result = await smtpHelper.sendTestEmail(smtpConfig, {
    to: req.user.email,
    siteInfo: settings
  });
  return res.json(result);
} catch (err) {
  return res.status(500).json({ success: false, message: err.message });
}
```

### Pattern 2: Send Email in Your Code
```javascript
try {
  const settings = await SystemSetting.findOne();
  const transporter = smtpHelper.createTransporter(settings.smtp);
  
  await transporter.sendMail({
    from: `${settings.siteName} <${settings.contactEmail}>`,
    to: userEmail,
    subject: 'Welcome!',
    html: '<p>Welcome to our system</p>'
  });
  
  console.log('Email sent successfully');
} catch (err) {
  console.error('Email send failed:', err.message);
}
```

### Pattern 3: Get Sanitized SMTP for Client
```javascript
const setting = await SystemSetting.findOne();
const sanitized = smtpHelper.sanitizeSMTPConfig(setting.smtp);
res.json({ smtp: sanitized });
```

## SMTP Config Object Properties

**Database Storage:**
- `host` - SMTP server hostname
- `port` - SMTP port (usually 587 or 465)
- `secure` - Boolean (true for SSL/465, false for TLS/587)
- `user` - SMTP authentication username
- `encryptedPassword` - Encrypted password
- `fromName` - Display name for From field

**Sanitized Response:**
- `host` - SMTP hostname
- `port` - SMTP port
- `secure` - TLS/SSL flag
- `user` - SMTP username
- `passwordSet` - Boolean indicating if password exists
- `fromName` - Display name

## Error Handling

All helper functions that throw errors provide clear messages:

```javascript
try {
  const transporter = smtpHelper.createTransporter(config);
} catch (err) {
  console.error(err.message);
  // Examples:
  // "SMTP not configured: missing host"
  // "Failed to decrypt SMTP password: Invalid encryption key"
  // "Encryption key not configured"
}
```

## Environment Variables

**SETTINGS_ENCRYPTION_KEY** (Optional but recommended)
- Used for encrypting/decrypting passwords
- If not set, passwords stored unencrypted
- Should be set in production

**DEBUG_SMTP** (Optional)
- Enable SMTP debugging if set to truthy value
- Adds verbose logging to transporter

## Testing

```bash
# Test SMTP endpoint
curl -X POST http://localhost:5000/api/settings/test-smtp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"to":"admin@example.com"}'
```

Response on success:
```json
{
  "success": true,
  "message": "Test email sent successfully"
}
```

Response on error:
```json
{
  "success": false,
  "message": "SMTP not configured"
}
```

---

**Last Updated:** January 25, 2026
