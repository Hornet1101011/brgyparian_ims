# Test Email Endpoint Configuration Priority System

**Date:** February 8, 2026  
**File Modified:** `server/routes/settingsRoutes.js`  
**Endpoint:** POST `/api/settings/email/test` (Lines 2108-2310)

## Overview

Updated the test email endpoint to accept SMTP configuration from three sources with clear priority ordering, allowing for more flexible testing workflows without requiring database updates.

## Configuration Priority

The endpoint now accepts configuration from three sources with this priority:

```
1. request body: body.smtp (HIGHEST PRIORITY)
   └─> Validates: password must be non-empty string
   
2. request body: body.emailConfig (LEGACY SUPPORT)
   └─> For backward compatibility
   
3. database: SystemSetting.findOne().smtp (FALLBACK)
   └─> Only used if both body.smtp and body.emailConfig are missing
```

## New Parameters

### `body.smtp` (NEW - Highest Priority)
Complete SMTP configuration object in request body.

**Required Fields:**
- `host`: SMTP server hostname
- `port`: SMTP server port (1-65535)
- `username` or `user`: SMTP username
- `password`: SMTP password (must be non-empty string)
- `fromEmail`: Sender email address
- `provider`: Email provider type (e.g., 'custom')

**Example Request:**
```json
{
  "testEmail": "test@example.com",
  "smtp": {
    "host": "smtp.gmail.com",
    "port": 587,
    "username": "sender@gmail.com",
    "password": "real-password-123",
    "fromEmail": "sender@gmail.com",
    "provider": "custom",
    "secure": false
  }
}
```

### `body.emailConfig` (LEGACY - Second Priority)
For backward compatibility with existing code.

**Behavior:**
- Accepted if `body.smtp` is not provided
- Same validation as before
- Still requires all fields in request (no DB fallback when provided)

### Database Fallback (LOWEST PRIORITY)
If neither `body.smtp` nor `body.emailConfig` provided, uses database config.

**Conditions:**
- Both `body.smtp` and `body.emailConfig` must be missing/falsy
- Database must have `SystemSetting.smtp` configured
- Uses exact config from database

## Validation Flow

### Step 1: Determine Configuration Source
```javascript
if (body.smtp) {
  configSource = 'request_body_smtp';
  // VALIDATE: password must be non-empty string
} else if (body.emailConfig) {
  configSource = 'request_body_emailConfig';
} else {
  // Query database for SMTP config
  configSource = 'database';
}
```

### Step 2: Validate SMTP Password (If from body.smtp)
```javascript
if (!smtp.password) {
  // Error: Password required
}

if (typeof smtp.password !== 'string' || smtp.password.trim().length === 0) {
  // Error: Password must be non-empty string
}
```

### Step 3: Standard Validations
- Required fields check (host, port, username, password, fromEmail)
- Port range validation (1-65535)
- Provider validation
- Field normalization (user/username)

## Response Format

### Success Response
```json
{
  "success": true,
  "message": "Test email sent successfully",
  "provider": "custom",
  "messageId": "unique-message-id",
  "testEmail": "recipient@example.com",
  "configSource": "request_body_smtp"
}
```

### Error Response (Missing Password)
```json
{
  "success": false,
  "message": "Password is required",
  "error": "smtp.password field is required in request body",
  "validationField": "smtp.password",
  "configSource": "request_body_smtp"
}
```

### Error Response (Invalid Password)
```json
{
  "success": false,
  "message": "Password must be a non-empty string",
  "error": "smtp.password must be a valid non-empty string",
  "validationField": "smtp.password",
  "configSource": "request_body_smtp"
}
```

### Error Response (No Configuration Found)
```json
{
  "success": false,
  "message": "Email configuration required",
  "error": "emailConfig or smtp field is required in request body, or SMTP must be configured in database",
  "validationField": "configuration",
  "configSource": "none",
  "details": "Provide smtp or emailConfig in request body, or configure SMTP in settings"
}
```

## Configuration Source Logging

All logs now include `configSource` field:

| Source | Value | Description |
|--------|-------|-------------|
| Request body (smtp) | `request_body_smtp` | Using body.smtp parameter |
| Request body (emailConfig) | `request_body_emailConfig` | Using body.emailConfig parameter |
| Database | `database` | Fetched from SystemSetting.smtp |
| None | `none` | No configuration available |

**Log Examples:**
```
[Settings] POST /email/test - Using smtp config from request body
[Settings] POST /email/test - SMTP password validated from request body {hasPassword: true, passwordLength: 18}
[Settings] POST /email/test - Using emailConfig from request body
[Settings] POST /email/test - Using SMTP config from database
[Settings] POST /email/test - Configuration source: {source: "request_body_smtp", provider: "custom"}
```

## Use Cases

### Use Case 1: Test Unsaved SMTP Configuration
**Goal:** Test SMTP settings before saving to database

**Request:**
```json
{
  "testEmail": "admin@example.com",
  "smtp": {
    "host": "smtp.newmail.com",
    "port": 587,
    "username": "newaccount@newmail.com",
    "password": "test-password-123",
    "fromEmail": "newaccount@newmail.com",
    "provider": "custom"
  }
}
```

**Benefit:**
- Test new config without saving
- Validate settings before committing
- No database modifications needed

### Use Case 2: Test Saved Configuration (Database Fallback)
**Goal:** Verify current database configuration

**Request:**
```json
{
  "testEmail": "admin@example.com"
}
```

**Behavior:**
- `body.smtp` is missing
- `body.emailConfig` is missing
- Endpoint queries database for saved SMTP config
- Uses exact database config

**Benefit:**
- Minimal request payload
- Tests current saved settings
- Verifies SMTP connection

### Use Case 3: Backend Compatibility (Existing Code)
**Goal:** Maintain compatibility with existing implementations

**Request:**
```json
{
  "testEmail": "admin@example.com",
  "emailConfig": {
    "host": "smtp.example.com",
    "port": 587,
    "username": "user@example.com",
    "password": "password-123",
    "fromEmail": "user@example.com",
    "provider": "custom"
  }
}
```

**Behavior:**
- `body.smtp` is missing
- `body.emailConfig` is provided
- Uses emailConfig (legacy path)
- Full validation applied

**Benefit:**
- Backward compatible
- Existing implementations still work
- No breaking changes

## Security Considerations

1. **Password Validation**
   - Passwords from `body.smtp` are validated before use
   - Must be non-empty string
   - Type-checked before processing

2. **No Silent Fallback**
   - Explicit logging of configuration source
   - Error messages indicate missing config
   - No assumption of config availability

3. **Clear Priority**
   - Request body takes priority over database
   - Prevents database injection attacks
   - Explicit source tracking in responses

4. **Sanitization**
   - Response includes `configSource` but never echoes passwords
   - Passwords always logged as boolean/length only
   - Never included in error messages or responses

## Migration Path

### For New Implementations
Use the `smtp` parameter:
```javascript
// New code - use body.smtp
const response = await axios.post('/api/settings/email/test', {
  testEmail: 'test@example.com',
  smtp: {
    host, port, username, password, fromEmail, provider, secure
  }
});
```

### For Existing Implementations
No changes required:
```javascript
// Old code still works - uses body.emailConfig
const response = await axios.post('/api/settings/email/test', {
  testEmail: 'test@example.com',
  emailConfig: {
    host, port, username, password, fromEmail, provider
  }
});
```

### For Database-Only Configuration
Omit both body parameters:
```javascript
// Uses database fallback
const response = await axios.post('/api/settings/email/test', {
  testEmail: 'test@example.com'
});
```

## Testing Checklist

- [ ] Test with `body.smtp` provided (highest priority)
- [ ] Test with `body.emailConfig` provided (legacy path)
- [ ] Test with neither body param (database fallback)
- [ ] Test password validation for `body.smtp`
  - [ ] Missing password
  - [ ] Empty string password
  - [ ] Valid password
- [ ] Test priority ordering (smtp > emailConfig > database)
- [ ] Verify `configSource` in responses
- [ ] Verify `configSource` in logs
- [ ] Test with missing database config
- [ ] Verify backward compatibility with existing code
- [ ] Confirm no breaking changes to responses
- [ ] Test field normalization (user/username)
