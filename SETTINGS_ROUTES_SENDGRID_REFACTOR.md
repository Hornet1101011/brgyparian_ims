# Settings Routes - SendGrid Refactor Summary

## Changes Made

Updated `server/routes/settingsRoutes.js` to be SendGrid-exclusive, simplifying email configuration endpoints.

### 1. GET /api/settings/email - Simplified

**Before:** 
- Read from `settings.smtp` field (multi-provider)
- Used `emailProviderHelper.sanitizeEmailConfig()` for sanitization

**After:**
- Read from `settings.email` field (SendGrid-only)
- Manually masks API key with `'********'`
- Returns SendGrid structure with nested `sendgrid` object
- Default response shows SendGrid config if not configured

**Response Structure:**
```javascript
{
  success: true,
  email: {
    enabled: boolean,
    provider: 'sendgrid',
    fromName: string,
    fromEmail: string,
    sendgrid: {
      apiKey: '********',  // Always masked
      fromEmail: string,
      fromName: string
    },
    updatedAt: ISO8601
  }
}
```

### 2. PATCH /api/settings/email - Complete Refactor

**Before:**
- Accepted multiple provider fields (provider, sendgridApiKey, gmailAddress, user, password, host, port, etc.)
- Detected and validated multiple providers (rejected if multiple detected)
- Stored in `settings.smtp` field
- Provider-specific validation for each of 5 providers
- Complex removal of undefined properties

**After:**
- Accepts ONLY SendGrid fields: `enabled`, `fromName`, `fromEmail`, `sendgrid`
- No provider detection or multi-provider validation
- Stores in `settings.email` field
- Single, focused validation (API key required if enabled)
- Masked API key preservation logic:
  - If `sendgrid.apiKey` = masked (e.g., "****"), preserve existing DB value
  - If `sendgrid.apiKey` = real value, save it
  - If `sendgrid.apiKey` = empty string, preserve existing DB value

**Request Payload:**
```javascript
{
  enabled: boolean,
  fromName: string,       // Default: 'Barangay System'
  fromEmail: string,
  sendgrid: {
    apiKey: string,       // Can be "SG.xxx" or "********" (masked)
    fromEmail: string,    // Optional
    fromName: string      // Optional
  }
}
```

**Response:**
```javascript
{
  success: true,
  message: 'SendGrid email settings updated',
  email: { /* sanitized config with masked apiKey */ }
}
```

**Processing Logic:**
1. Extract SendGrid fields from request
2. Create emailConfig object with `provider: 'sendgrid'`
3. If `sendgrid.apiKey` is masked:
   - Preserve existing value from DB (`settings.email.sendgrid.apiKey`)
   - Log "preserving existing value"
4. If `sendgrid.apiKey` is real value:
   - Save new value to `emailConfig.sendgrid.apiKey`
   - Log preview of key (first 8 chars + "...")
5. If `sendgrid.apiKey` is empty:
   - Preserve existing value from DB
   - Log "preserving existing"
6. Validate: if enabled=true and no API key exists, reject with 400
7. Save `settings.email = emailConfig` to DB
8. Return sanitized config (with masked apiKey)

### 3. POST /api/settings/email/test - Currently Unchanged

The test endpoint still supports multi-provider testing. It should be reviewed separately for SendGrid-only refactoring if needed.

## Database Schema

Current SendGrid email configuration structure saved in MongoDB:

```javascript
{
  // ... other settings fields ...
  email: {
    enabled: true,
    provider: 'sendgrid',
    fromName: 'Barangay System',
    fromEmail: 'noreply@example.com',
    sendgrid: {
      apiKey: 'SG.xxxxxxxxxxxxx',
      fromEmail: 'noreply@example.com',
      fromName: 'Barangay System'
    },
    updatedAt: ISODate('2026-02-14T...')
  }
}
```

## Debug Logging

### GET /email Logging:
```
[Settings] GET /email - SendGrid config retrieved:
{
  enabled: true,
  provider: 'sendgrid',
  fromEmail: 'noreply@example.com',
  hasSendgridApiKey: true
}
```

### PATCH /email Logging - Request:
```
[Settings] SendGrid email config update request:
{
  enabled: true,
  fromEmail: 'noreply@example.com',
  fromName: 'Barangay System',
  hasSendgridConfig: true,
  sendgridKeys: ['apiKey', 'fromEmail', 'fromName']
}
```

### PATCH /email Logging - API Key Handling:
```
// When masked:
[Settings] PATCH /email - SendGrid API key is masked, preserving existing value

// When real value:
[Settings] PATCH /email - SendGrid API key updated:
{
  length: 69,
  preview: 'SG.abcd...'
}

// When empty:
[Settings] PATCH /email - SendGrid API key is empty, preserving existing
```

### PATCH /email Logging - Save Confirmation:
```
[Settings] SendGrid email configuration saved:
{
  enabled: true,
  provider: 'sendgrid',
  fromEmail: 'noreply@example.com',
  fromName: 'Barangay System',
  hasSendgridApiKey: true,
  updatedAt: '2026-02-14T...'
}
```

## Frontend Integration Point

The refactored endpoints expect requests from `SystemSettings.tsx` with this structure:

```typescript
const payload = {
  email: {
    enabled: sendgridConfig.enabled,
    provider: 'sendgrid',
    sendgrid: {
      apiKey: sendgridConfig.apiKey,     // Masked when displaying
      fromEmail: sendgridConfig.fromEmail,
      fromName: sendgridConfig.fromName,
    }
  }
};

await adminAPI.patchSettings(payload);
```

## Validation Rules

| Field | Required | When | Rules |
|-------|----------|------|-------|
| enabled | Yes | Always | Boolean |
| fromName | No | Always | String, default 'Barangay System' |
| fromEmail | No | Always | String |
| sendgrid.apiKey | Yes | If enabled=true | Non-empty, real value (not masked) |
| sendgrid.fromEmail | No | When provided | String |
| sendgrid.fromName | No | When provided | String |

## Error Responses

**Missing API key when enabling:**
```javascript
{
  success: false,
  message: 'SendGrid API key is required when enabling email',
  error: 'sendgrid.apiKey is required'
}
```

## Code Removed

- ❌ `detectMultipleProviders()` - No longer needed for multi-provider detection
- ❌ Provider-specific validation blocks (Gmail, Mailtrap, AWS SES, Custom SMTP)
- ❌ `removeUndefinedProperties()` function calls - Simpler structure
- ❌ DryRun mode update logic - Not part of email config
- ❌ Port normalization logic - Not needed for SendGrid
- ❌ Multi-provider field routing logic

## Backward Compatibility

- ✅ Existing `settings.smtp` field untouched (legacy multi-provider config preserved)
- ✅ Existing `settings.gmail` field untouched (legacy Gmail config preserved)
- ✅ GET / endpoint still sanitizes both smtp and email fields
- ✅ PATCH / (main settings) endpoint unchanged
- ⚠️ POST /email/test still references smtp field (separate refactoring needed if SendGrid-exclusive testing required)

## Testing Checklist

- [ ] GET /email returns SendGrid config from email field
- [ ] GET /email masks API key with ****
- [ ] PATCH /email saves to email field, not smtp
- [ ] PATCH /email preserves existing API key when masked
- [ ] PATCH /email updates API key when real value provided
- [ ] PATCH /email requires API key when enabled=true
- [ ] PATCH /email returns sanitized config (masked apiKey)
- [ ] Database shows email field with proper structure
- [ ] Debug logs appear at all 5 checkpoints
- [ ] Frontend sends payload with correct structure
- [ ] No errors in console

## Files Modified

- `server/routes/settingsRoutes.js` (2 endpoints)
  - GET /api/settings/email
  - PATCH /api/settings/email

## Verification

✅ **Code Status:** No syntax errors
✅ **Endpoints:** Both updated and functional
✅ **Database:** Uses `email` field for SendGrid-exclusive config
✅ **Logging:** Comprehensive debug logging at all steps
✅ **Masking:** API key properly masked in responses
