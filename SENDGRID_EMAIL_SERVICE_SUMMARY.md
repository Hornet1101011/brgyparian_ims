# emailService.js - SendGrid Implementation Summary

## Overview
Successfully created a SendGrid-exclusive email service (`emailService.js`) that replaces the legacy Nodemailer-based multi-provider system with clean, focused SendGrid integration.

## File Statistics
- **Location**: `server/src/services/emailService.js`
- **Lines**: 409 (down from 550+ with Nodemailer code)
- **Dependencies**: `@sendgrid/mail` (already installed in package.json)
- **Modules Removed**: Nodemailer, gmailHelper dependencies

## Core Functions

### 1. `loadSendGridConfig()`
Loads SendGrid configuration from SystemSettings database.

**Process**:
1. Retrieves SystemSetting document from MongoDB
2. Validates `email.enabled` flag
3. Verifies SendGrid configuration exists at `email.sendgrid`
4. Checks API key is not empty
5. Checks fromEmail is configured
6. Returns config object with apiKey, fromEmail, fromName

**Returns**:
```javascript
{
  apiKey: "SG.xxxxx",
  fromEmail: "noreply@barangay.local",
  fromName: "Barangay System"
}
```

**Throws**: Descriptive error if any validation fails

---

### 2. `sendEmail({ to, subject, html, text, bcc, emailType })`
Main email sending function using SendGrid.

**Steps**:
1. **Validation**: Checks if email type is enabled
2. **Dry-Run Check**: Returns simulated ID if dry-run mode is active
3. **Config Load**: Loads SendGrid configuration from database
4. **API Key Init**: Sets SendGrid API key via `sgMail.setApiKey(apiKey)`
5. **Message Build**: Constructs message object:
   ```javascript
   {
     to,
     from: { email: fromEmail, name: fromName },
     subject,
     text,
     html,
     bcc  // optional
   }
   ```
6. **Send**: Calls `sgMail.send(message)`
7. **Logging**: Logs success/failure to EmailLog collection
8. **Return**: Returns object with messageId

**Logging Includes**:
- Recipient email
- Subject
- Email type
- Success/failure status
- Error message (if failed)
- BCC count
- SendGrid status code
- Duration in milliseconds

**Error Handling**:
- Catches SendGrid API errors
- Logs failures to database
- Re-throws error to caller
- Includes timing information for debugging

---

### 3. `sendMail(to, subject, html, bcc, emailType)` 
Backward-compatible wrapper around `sendEmail()`.

**Purpose**: Maintains existing API for legacy code that uses positional arguments

**Usage**:
```javascript
await sendMail('user@email.com', 'Subject', '<p>HTML</p>', ['bcc@email.com'], 'generic');
```

---

### 4. `sendDocumentNotification(to, status, documentType, notes)`
Specialized function for document approval/rejection emails.

**Generates**:
- Automatic subject: "Your document request has been [approved|rejected]"
- Formatted HTML body with document type and notes
- Logs as 'document-notification' type

**Usage**:
```javascript
await sendDocumentNotification(
  'resident@email.com',
  'approved',
  'Birth Certificate',
  'Approved without issues'
);
```

---

### 5. `isEmailTypeEnabled(emailType)`
Checks if email sending is enabled in system settings.

**Behavior**:
- Returns false if `email.enabled` is false
- Returns true otherwise (all email types use same flag)
- Fails open (returns true) if settings unavailable
- Logs warnings for missing models

---

### 6. `isDryRunModeEnabled()`
Checks if dry-run mode is enabled in system settings.

**Behavior**:
- Returns `settings.dryRunMode` boolean value
- Simulates email send without actually calling SendGrid
- Returns simulated message ID for testing

---

### 7. `testSendGridConnection()`
Tests SendGrid configuration and connectivity.

**Steps**:
1. Loads SendGrid configuration
2. Sets API key
3. Sends test email to configured from address
4. Returns success/failure result with details

**Response**:
```javascript
{
  success: true,
  message: "SendGrid connection successful",
  config: {
    provider: "sendgrid",
    fromEmail: "noreply@barangay.local",
    fromName: "Barangay System",
    statusCode: 202
  }
}
```

---

### 8. `logEmail(recipient, subject, success, error, messageId, emailType, bccCount)`
Logs all email sending attempts to database.

**Records**:
- Recipient email
- Subject
- Success/failure status
- Error message (if applicable)
- SendGrid message ID
- Email type classification
- BCC recipient count

**Non-blocking**: Errors in logging don't affect email sending

---

## Database Dependencies

### SystemSetting Model
Expects structure:
```javascript
{
  email: {
    enabled: Boolean,
    provider: "sendgrid",  // always "sendgrid"
    sendgrid: {
      apiKey: String,      // SendGrid API key
      fromEmail: String,   // From email address
      fromName: String     // Display name
    }
  },
  dryRunMode: Boolean      // Optional: simulate sends
}
```

### EmailLog Model
Creates documents with:
```javascript
{
  recipient: String,
  subject: String,
  status: "sent" | "failed",
  errorMessage: String,    // null if success
  messageId: String,       // SendGrid message ID
  emailType: String,       // Classification
  bccRecipientsCount: Number,
  createdAt: Date          // Auto-added by Mongoose
}
```

---

## Logging Output Examples

### Successful Send
```
[EmailService] Starting email send process: {
  recipient: 'user@email.com',
  subject: 'Password Reset',
  emailType: 'password-reset',
  timestamp: '2026-02-14T10:30:00Z'
}

[EmailService] SendGrid config loaded: {
  provider: 'sendgrid',
  fromEmail: 'noreply@barangay.local',
  fromName: 'Barangay System',
  hasApiKey: true
}

[EmailService] Sending email via SendGrid: {
  recipient: 'user@email.com',
  from: 'Barangay System <noreply@barangay.local>',
  subject: 'Password Reset',
  hasHtml: true,
  hasText: false,
  bccCount: 0
}

[EmailService] Email sent successfully via SendGrid: {
  messageId: 'sendgrid-1707899400000',
  recipient: 'user@email.com',
  subject: 'Password Reset',
  statusCode: 202,
  duration: '245ms'
}
```

### Configuration Error
```
[EmailService] Failed to load SendGrid configuration: SendGrid API key is not configured
[EmailService] Failed to send email via SendGrid: {
  recipient: 'user@email.com',
  subject: 'Password Reset',
  error: 'SendGrid API key is not configured',
  duration: '12ms'
}
```

### Dry-Run Mode
```
[EmailService] DRY-RUN MODE: Simulating email send {
  recipient: 'user@email.com',
  subject: 'Password Reset',
  emailType: 'password-reset',
  simulatedMessageId: 'dry-run-1707899400000-a1b2c3d4',
  duration: '5ms'
}
```

---

## Exported Functions

```javascript
module.exports = {
  sendEmail,                    // Main function
  sendMail,                     // Legacy alias
  sendDocumentNotification,     // Document emails
  testSendGridConnection,       // Connection test
  isEmailTypeEnabled,           // Feature flag check
  isDryRunModeEnabled,          // Dry-run check
  logEmail,                     // Manual logging
  loadSendGridConfig,           // Config loader
};
```

---

## Error Handling

### Configuration Errors
- Missing SystemSetting model → warns, fails open
- Email disabled → logged, returns success
- Missing SendGrid config → throws error
- Missing API key → throws error
- Missing from email → throws error

### Send Errors
- API errors → logged to database, re-thrown
- Network errors → logged, error message captured
- Validation errors → logged with timing info

### Logging Errors
- Model unavailable → warns, doesn't block send
- Database error → error logged, email still sent

---

## Backward Compatibility

| Old Function | New Replacement | Status |
|---|---|---|
| `getGmailTransporter()` | REMOVED | Throws error |
| `emailTransporter()` | REMOVED | Throws error |
| `getConfiguredTransporter()` | REMOVED | Not needed |
| `testSmtpConnection()` | `testSendGridConnection()` | Updated |
| `sendMail()` | `sendMail()` | Same API |
| `sendDocumentNotification()` | `sendDocumentNotification()` | Same API |
| `isEmailTypeEnabled()` | `isEmailTypeEnabled()` | Simplified |
| `isDryRunModeEnabled()` | `isDryRunModeEnabled()` | Same |
| `logEmail()` | `logEmail()` | Same |

---

## Usage Examples

### Send Password Reset Email
```javascript
const { sendMail } = require('./emailService');

await sendMail(
  'user@email.com',
  'Reset Your Password',
  '<p>Click <a href="...">here</a> to reset your password</p>',
  null,
  'password-reset'
);
```

### Send Document Notification
```javascript
const { sendDocumentNotification } = require('./emailService');

await sendDocumentNotification(
  'resident@email.com',
  'approved',
  'Birth Certificate',
  'Your document has been verified and is ready for pickup'
);
```

### Send Email with BCC
```javascript
const { sendEmail } = require('./emailService');

await sendEmail({
  to: 'primary@email.com',
  subject: 'Monthly Report',
  html: '<p>See attached report</p>',
  bcc: ['admin@barangay.local', 'supervisor@barangay.local'],
  emailType: 'announcement'
});
```

### Test Connection
```javascript
const { testSendGridConnection } = require('./emailService');

const result = await testSendGridConnection();
if (result.success) {
  console.log('SendGrid is configured and working!');
} else {
  console.error('SendGrid test failed:', result.error);
}
```

---

## Important Notes

1. **@sendgrid/mail already installed** - No npm install needed
2. **API key stored in SystemSettings** - Loaded from database, never hardcoded
3. **All logs are asynchronous** - Won't block email sending if database is slow
4. **Dry-run mode for testing** - Test without actually sending emails
5. **BCC support** - Built-in for announcements to multiple recipients
6. **Message ID tracking** - Every email gets a unique SendGrid message ID
7. **Backward compatible** - Existing code using `sendMail()` still works
8. **Clean error messages** - Specific errors help debug configuration issues

---

## Migration Notes from Nodemailer

| Aspect | Nodemailer | SendGrid |
|--------|-----------|----------|
| Config Storage | Database + Environment | Database only |
| Supported Providers | 5 (SMTP, Gmail, AWS, Mailtrap) | 1 (SendGrid) |
| API Setup | Transporter per provider | Single `setApiKey()` |
| Message Format | Nodemailer format | SendGrid format |
| Testing | `transporter.verify()` | Actual test send |
| BCC Support | Yes | Yes |
| Rate Limiting | Built-in pool | SendGrid handles |
| Message IDs | Nodemailer format | SendGrid header |
