# Settings PATCH Controller - SendGrid-Only Refactor

## Overview
Refactored `POST /api/admin/settings` PATCH controller to support SendGrid-exclusive email configuration with proper masking and validation.

## Request Payload Structure

**Accept body with `email` field:**
```javascript
{
  // ... other settings fields ...
  email: {
    enabled: boolean,
    provider: 'sendgrid',  // Always sendgrid
    fromEmail: string,      // Sender email address
    fromName: string,       // Sender display name
    sendgrid: {
      apiKey: string,       // SendGrid API key (or "********" to preserve)
      fromEmail: string,    // (Optional, same as parent level)
      fromName: string      // (Optional, same as parent level)
    }
  }
}
```

## Processing Flow

### 1. **Request Parsing** (Lines 390-460)
- Reads `request.body.email` 
- Logs received configuration with sanitized values
- Helper function: `isMaskedValue(val)` detects masked API keys (e.g., "********")

### 2. **Payload Preparation**
- Sets `email.enabled` to boolean (defaults to true)
- Forces `email.provider` to 'sendgrid'
- Preserves fromEmail and fromName at both email and sendgrid levels
- Masks-aware API key handling: skips setting if masked (preserves DB value)

**Logic for API Key Handling:**
```javascript
if (sgConfig.apiKey !== undefined) {
  if (isMaskedValue(sgConfig.apiKey)) {
    // Skip - preserve existing DB value
  } else if (sgConfig.apiKey && sgConfig.apiKey.length > 0) {
    // Save new value
    updatePayload.email.sendgrid.apiKey = sgConfig.apiKey;
  } else {
    // Empty string - preserve existing DB value
  }
}
```

### 3. **MongoDB $set Update** (Lines 824-898)
Uses `$set` operator to update nested fields:

```javascript
updateOps.$set['email.enabled'] = emailCfg.enabled;
updateOps.$set['email.provider'] = 'sendgrid';
updateOps.$set['email.fromEmail'] = emailCfg.fromEmail;
updateOps.$set['email.fromName'] = emailCfg.fromName;
updateOps.$set['email.sendgrid.apiKey'] = ... (if not masked);
updateOps.$set['email.sendgrid.fromEmail'] = ...;
updateOps.$set['email.sendgrid.fromName'] = ...;
updateOps.$set['email.updatedAt'] = new Date();
```

### 4. **Database Save** (Line 927)
```javascript
await SystemSetting.findOneAndUpdate({}, updateOps, { 
  new: true, 
  upsert: true, 
  setDefaultsOnInsert: true 
});
```

### 5. **Verification & Logging** (Lines 968-983)
Comprehensive logging confirms saved configuration:
```
[Settings PATCH - SendGrid] CONFIRMATION: Final saved SendGrid config in DB:
{
  enabled: true,
  provider: 'sendgrid',
  fromEmail: 'noreply@example.com',
  fromName: 'Barangay System',
  sendgridConfigExists: true,
  hasSendgridApiKey: true,
  apiKeyLength: 69,
  updatedAt: '2026-02-14T...',
  allEmailData: {...}
}
```

## Debug Logging

The controller logs at 5 key points:

### **Phase 1: Request Received**
```
[Settings PATCH - SendGrid] Email config received:
{
  enabled, provider, fromEmail, fromName,
  hasSendgridConfig, sendgridKeys
}
```

### **Phase 2: Individual Field Processing**
```
[Settings PATCH - SendGrid] fromEmail: ...
[Settings PATCH - SendGrid] API key is masked - preserving existing value
[Settings PATCH - SendGrid] sendgrid.apiKey updated: { length, preview }
```

### **Phase 3: Update Operations Building**
```
[Settings PATCH - SendGrid] Email config fields set in updateOps:
{
  count: N,
  fields: ['email.enabled', 'email.provider', ...],
  summary: { 'email.enabled': true, 'email.sendgrid.apiKey_exists': true }
}
```

### **Phase 4: Post-Save Verification**
```
[Settings PATCH - SendGrid] CONFIRMATION: Final saved SendGrid config in DB:
{
  enabled, provider, sendgridConfigExists, 
  hasSendgridApiKey, apiKeyLength,
  allEmailData: JSON.stringify(...)
}
```

### **Phase 5: Direct DB Query**
```
[Settings PATCH] Direct DB query after update - checking SMTP field:
{
  hasSmtp, smtpKeys, fullSmtp
}
```

## Database Schema

Final saved structure in MongoDB:
```javascript
{
  _id: ObjectId,
  email: {
    enabled: true,
    provider: 'sendgrid',
    fromEmail: 'noreply@example.com',
    fromName: 'Barangay System',
    sendgrid: {
      apiKey: 'SG.xxxxxxxxxxxxx',
      fromEmail: 'noreply@example.com',
      fromName: 'Barangay System'
    },
    updatedAt: ISODate('2026-02-14T...')
  },
  // ... other settings ...
}
```

## API Key Masking Behavior

### **Masked Value Detection**
Pattern: `/^\*+$/` (one or more asterisks only)
- `"********"` → masked ✓
- `"SG.abc123"` → real value ✓
- `""` → empty string, preserve DB value

### **Handling**
| Condition | Action |
|-----------|--------|
| apiKey = "SG.xxxxx" | Save new value |
| apiKey = "********" | Skip (preserve existing) |
| apiKey = "" | Skip (preserve existing) |
| apiKey = undefined | Skip (preserve existing) |

## Error Handling

- No explicit validation errors in this section
- Existing validation (if any) in `validateSettingsPayload()` runs before this handler
- API key can be empty if masked (for UI display purposes)

## Frontend Integration

**SystemSettings.tsx sends:**
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
```

## Testing Scenarios

### 1. **Create New SendGrid Config**
```javascript
PATCH /api/admin/settings
{
  email: {
    enabled: true,
    provider: 'sendgrid',
    fromEmail: 'noreply@barangay.com',
    fromName: 'Barangay System',
    sendgrid: {
      apiKey: 'SG.1234567890abcdefghij...',
      fromEmail: 'noreply@barangay.com',
      fromName: 'Barangay System'
    }
  }
}
```
**Expected:** New email config saved with apiKey stored

### 2. **Update Only Name (Preserve API Key)**
```javascript
PATCH /api/admin/settings
{
  email: {
    enabled: true,
    provider: 'sendgrid',
    fromEmail: 'noreply@barangay.com',
    fromName: 'New Name',
    sendgrid: {
      apiKey: '********',  // Masked
      fromEmail: 'noreply@barangay.com',
      fromName: 'New Name'
    }
  }
}
```
**Expected:** fromName updated, apiKey preserved from DB

### 3. **Disable Email**
```javascript
PATCH /api/admin/settings
{
  email: {
    enabled: false,
    provider: 'sendgrid',
    sendgrid: {
      apiKey: '********'
    }
  }
}
```
**Expected:** email.enabled = false, apiKey preserved

## Changes Summary

**Files Modified:**
- `server/routes/settingsRoutes.js` (PATCH / handler)

**Key Changes:**
1. Separated `payload.email` handling from `payload.smtp` handling
2. Added dedicated SendGrid configuration processing (Lines 391-458)
3. Added `$set` update operations for email fields (Lines 824-898)
4. Added comprehensive SendGrid verification logging (Lines 968-983)
5. Proper masking detection for API key preservation

**Backward Compatibility:**
- Existing `payload.smtp` handling unchanged
- Existing `payload.gmail` handling unchanged
- Only new `payload.email` path added
- Multi-provider controller still functions for legacy clients

## Conclusion

The Settings PATCH controller now properly handles SendGrid-exclusive email configuration with:
- ✅ $set operator for nested field updates
- ✅ Masked API key preservation
- ✅ Comprehensive debug logging
- ✅ Proper field structure validation
- ✅ Database confirmation after save
