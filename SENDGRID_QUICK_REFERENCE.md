# SendGrid emailService.js - Quick Reference

## Installation Status
✅ `@sendgrid/mail` is already in `package.json` (v8.1.6)

## File Location
`server/src/services/emailService.js` - 409 lines

## Replaces
- Legacy Nodemailer-based multi-provider system
- gmailHelper dependency
- Transporter caching logic

## Key Functions

### sendEmail({ to, subject, html, text, bcc, emailType })
Main function using SendGrid API.

```javascript
const { sendEmail } = require('./src/services/emailService');

const result = await sendEmail({
  to: 'user@email.com',
  subject: 'Welcome to Barangay System',
  html: '<p>Welcome!</p>',
  text: 'Welcome!',
  bcc: ['admin@barangay.local'],
  emailType: 'generic'
});

console.log('Message ID:', result.messageId);
```

### sendMail(to, subject, html, bcc, emailType)
Legacy-compatible function for existing code.

```javascript
const { sendMail } = require('./src/services/emailService');

await sendMail(
  'user@email.com',
  'Password Reset',
  '<p><a href="...">Reset Password</a></p>',
  null,
  'password-reset'
);
```

### sendDocumentNotification(to, status, documentType, notes)
Special function for document status emails.

```javascript
const { sendDocumentNotification } = require('./src/services/emailService');

await sendDocumentNotification(
  'resident@email.com',
  'approved',
  'Marriage Certificate',
  'Ready for pickup at office'
);
```

### testSendGridConnection()
Test the SendGrid configuration.

```javascript
const { testSendGridConnection } = require('./src/services/emailService');

const result = await testSendGridConnection();
if (result.success) {
  console.log('✓ SendGrid is working');
} else {
  console.error('✗ SendGrid error:', result.error);
}
```

## Data Flow

```
Controller/Route
    ↓
sendMail() / sendEmail()
    ↓
isEmailTypeEnabled() → Check settings
    ↓
isDryRunModeEnabled() → Simulate if needed
    ↓
loadSendGridConfig() → Load from DB
    ↓
sgMail.setApiKey(key) → Initialize SDK
    ↓
sgMail.send(message) → Send via API
    ↓
logEmail() → Log result to DB
    ↓
Return { messageId }
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Email disabled in settings | Logged as 'skipped', returns success |
| Dry-run mode enabled | Simulates send, returns fake messageId |
| Missing API key | Throws error, logged to database |
| SendGrid API error | Error logged, re-thrown to caller |
| Database unavailable | Fails open (allows email) |
| Logging fails | Warns, doesn't block email send |

## Configuration Requirements

SystemSetting document must contain:

```javascript
{
  email: {
    enabled: true,          // Must be true
    provider: 'sendgrid',   // Fixed value
    sendgrid: {
      apiKey: 'SG.xxxxx...',        // Required: SendGrid API key
      fromEmail: 'noreply@site.com', // Required: From address
      fromName: 'Barangay System'    // Optional: Display name
    }
  },
  dryRunMode: false  // Optional: Set true to simulate sends
}
```

## Logging

Every email attempt is logged to `EmailLog` collection:

```javascript
{
  recipient: 'user@email.com',
  subject: 'Email Subject',
  status: 'sent' or 'failed',
  errorMessage: null or 'Error text',
  messageId: 'sendgrid-xxxxx',
  emailType: 'generic',
  bccRecipientsCount: 0,
  createdAt: ISODate
}
```

## Example Usage in Controller

```javascript
const { sendEmail } = require('../services/emailService');

async function resetPassword(req, res) {
  try {
    const user = await User.findById(req.body.userId);
    
    // Generate reset token
    const resetToken = generateToken();
    user.passwordResetToken = resetToken;
    await user.save();
    
    // Send email
    await sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      html: `
        <p>Click the link below to reset your password:</p>
        <a href="${process.env.FRONTEND_URL}/reset/${resetToken}">
          Reset Password
        </a>
        <p>This link expires in 1 hour.</p>
      `,
      emailType: 'password-reset'
    });
    
    res.json({ message: 'Password reset email sent' });
  } catch (err) {
    console.error('Password reset error:', err);
    res.status(500).json({ error: err.message });
  }
}
```

## Performance Notes

- ✅ Non-blocking logging (async)
- ✅ Single API key initialization per send
- ✅ Configurable via database (no restart needed)
- ✅ Dry-run mode for testing
- ✅ BCC support for bulk notifications
- ✅ Message ID tracking for debugging

## Removed Features

❌ SMTP support
❌ Gmail transporter
❌ Mailtrap support
❌ AWS SES support
❌ Transporter caching
❌ Multiple provider logic

## SendGrid Documentation

- API Docs: https://docs.sendgrid.com/api-reference/
- Mail Send API: https://docs.sendgrid.com/api-reference/mail-send/
- Authentication: API key in SendGrid account settings

## Troubleshooting

**"SendGrid API key is not configured"**
→ Set `email.sendgrid.apiKey` in SystemSettings

**"SendGrid from email is not configured"**
→ Set `email.sendgrid.fromEmail` in SystemSettings

**"Email is currently disabled"**
→ Set `email.enabled: true` in SystemSettings

**No emails being sent but no errors**
→ Check `dryRunMode` flag in SystemSettings (should be false)

**"SystemSetting model not available"**
→ Service will fail open, allowing emails through
→ Check that models are properly loaded when service is used
