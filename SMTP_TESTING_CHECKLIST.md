# SMTP Enhancement Testing Checklist

## Pre-Testing Setup

- [ ] Verify `server/utils/smtpHelper.js` exists and contains all helper functions
- [ ] Verify `server/routes/settingsRoutes.js` imports the smtpHelper module
- [ ] Ensure `SETTINGS_ENCRYPTION_KEY` environment variable is configured
- [ ] Verify SMTP credentials are correctly configured in database

## Unit Testing

### 1. SMTP Configuration Validation
```javascript
// Test: validateSMTPConfig()
const smtpHelper = require('../utils/smtpHelper');

// Valid config
const validConfig = {
  host: 'smtp.gmail.com',
  port: 587,
  user: 'test@gmail.com',
  encryptedPassword: 'encrypted_value'
};
const errors1 = smtpHelper.validateSMTPConfig(validConfig);
// Expected: [] (empty array)

// Invalid config (missing host)
const errors2 = smtpHelper.validateSMTPConfig({ port: 587 });
// Expected: ["SMTP host is required"]

// Invalid port
const errors3 = smtpHelper.validateSMTPConfig({
  host: 'smtp.gmail.com',
  port: 99999
});
// Expected: Array containing port error
```

### 2. Password Encryption/Decryption
```javascript
// Test: encryptSMTPPassword() and decryptSMTPPassword()
const password = 'MySecurePassword123';

const encrypted = smtpHelper.encryptSMTPPassword(password);
// Expected: encrypted string (not equal to original)

const decrypted = smtpHelper.decryptSMTPPassword(encrypted);
// Expected: 'MySecurePassword123' (matches original)
```

### 3. SMTP Config Sanitization
```javascript
// Test: sanitizeSMTPConfig()
const dbConfig = {
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  user: 'test@gmail.com',
  encryptedPassword: 'secret_encrypted_value',
  fromName: 'My System'
};

const sanitized = smtpHelper.sanitizeSMTPConfig(dbConfig);
// Expected: {
//   host: 'smtp.gmail.com',
//   port: 587,
//   secure: false,
//   user: 'test@gmail.com',
//   passwordSet: true,
//   fromName: 'My System'
// }
// Note: encryptedPassword should NOT be in response
```

## API Testing

### 4. GET /api/settings/smtp-debug
```bash
curl -X GET http://localhost:5000/api/settings/smtp-debug \
  -H "Authorization: Bearer <admin-token>"
```

Expected Response:
```json
{
  "smtp": {
    "host": "smtp.gmail.com",
    "port": 587,
    "secure": false,
    "user": "test@gmail.com",
    "passwordSet": true,
    "fromName": "My System"
  }
}
```

### 5. PATCH /api/settings - Update SMTP
```bash
curl -X PATCH http://localhost:5000/api/settings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "smtp": {
      "host": "smtp.gmail.com",
      "port": 587,
      "secure": false,
      "user": "myemail@gmail.com",
      "password": "myapppassword",
      "fromName": "My Barangay"
    }
  }'
```

Expected Response:
- Status: 200 OK
- SMTP config updated with encrypted password
- No plain text password in response

### 6. POST /api/settings/test-smtp - Send Test Email
```bash
curl -X POST http://localhost:5000/api/settings/test-smtp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "to": "admin@example.com"
  }'
```

**Test Case 1: With valid SMTP config**
- Expected Status: 200 OK
- Expected Response: `{ "success": true, "message": "Test email sent successfully" }`
- Expected: Email received at provided address within 30 seconds

**Test Case 2: Without recipient email**
- Expected Status: 400 Bad Request
- Expected Response: `{ "success": false, "message": "No recipient email provided" }`

**Test Case 3: SMTP not configured**
- Expected Status: 400 Bad Request
- Expected Response: `{ "success": false, "message": "SMTP not configured" }`

**Test Case 4: Invalid SMTP credentials**
- Expected Status: 500 Internal Server Error
- Expected Response: `{ "success": false, "message": "Authentication failed" }`

**Test Case 5: Using default contact email**
```bash
# Don't provide 'to' field - should use site's contactEmail
curl -X POST http://localhost:5000/api/settings/test-smtp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{}'
```
- Expected: Email sent to contactEmail from system settings

## Email Content Testing

### 7. Verify Test Email Format
When test email is received:

- [ ] Email subject contains "Test Email -"
- [ ] Email contains site name
- [ ] Email has professional HTML formatting
- [ ] Email contains timestamp
- [ ] From address matches SMTP user or contact email
- [ ] From name matches `fromName` or site name

## Error Handling Testing

### 8. Error Messages
- [ ] Invalid SMTP config returns clear validation errors
- [ ] Decryption errors have descriptive messages
- [ ] Connection errors show specific SMTP error
- [ ] All errors are logged to console

### 9. Authorization
- [ ] Unauthenticated users cannot access `/api/settings`
- [ ] Non-admin users cannot update SMTP settings
- [ ] Non-admin users cannot send test emails
- [ ] Only admins can access `/api/settings/smtp-debug`

## Performance Testing

### 10. Test Email Response Time
```javascript
const start = Date.now();
// Make test-smtp request
const duration = Date.now() - start;
console.log(`Test email response: ${duration}ms`);
// Expected: < 15000ms (15 seconds)
```

## Logging and Debugging

### 11. Enable Debug Logging
```bash
# Set DEBUG_SMTP environment variable
export DEBUG_SMTP=1
npm start
```

Then run test-smtp:
- [ ] Nodemailer debug logs appear in console
- [ ] SMTP connection details are logged
- [ ] Password masked in logs (not shown)
- [ ] SMTP communication details visible

### 12. Check Server Logs
After successful test email:
```
[SMTP Test] Success - sent to: admin@example.com
```

## Integration Testing

### 13. SMTP Helper Integration
```javascript
// Test importing and using in another file
const smtpHelper = require('../utils/smtpHelper');
const SystemSetting = require('../models/SystemSetting');

// Simulate: another route wants to send email
const settings = await SystemSetting.findOne();
const transporter = smtpHelper.createTransporter(settings.smtp);
await transporter.sendMail({ /* email options */ });
// Expected: Works without errors
```

## Regression Testing

### 14. Existing Functionality
- [ ] Regular settings updates still work
- [ ] GET /api/settings returns properly sanitized data
- [ ] Settings appear correct in UI
- [ ] No existing tests are broken
- [ ] Audit logs capture changes

## Sign-Off Checklist

- [ ] All test cases pass
- [ ] No console errors when running tests
- [ ] Email received successfully in all valid scenarios
- [ ] Error messages are clear and helpful
- [ ] Code is clean and follows existing patterns
- [ ] Documentation is clear and complete
- [ ] No security issues identified
- [ ] Performance is acceptable

## Known Issues / Notes

- Password encrypted in database before storage
- Fallback support for legacy plaintext passwords
- SMTP timeout set to 6 seconds for test email
- Debug logging available via DEBUG_SMTP env var
- Sanitized data never includes passwords

---

**Testing Date:** ________________
**Tested By:** ________________
**Status:** [ ] PASS [ ] FAIL
**Notes:** 
```




```

---

**Last Updated:** January 25, 2026
