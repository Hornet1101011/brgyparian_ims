# SendGrid Settings Endpoints - Quick Reference

## Endpoints Updated

### GET /api/settings/email
**Returns current SendGrid email configuration**

```bash
curl -X GET http://localhost:5000/api/settings/email \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "success": true,
  "email": {
    "enabled": true,
    "provider": "sendgrid",
    "fromName": "Barangay System",
    "fromEmail": "noreply@example.com",
    "sendgrid": {
      "apiKey": "********",
      "fromEmail": "noreply@example.com",
      "fromName": "Barangay System"
    },
    "updatedAt": "2026-02-14T10:30:00.000Z"
  }
}
```

---

### PATCH /api/settings/email
**Update SendGrid email configuration**

```bash
curl -X PATCH http://localhost:5000/api/settings/email \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "fromName": "Barangay System",
    "fromEmail": "noreply@barangay.local",
    "sendgrid": {
      "apiKey": "SG.your_actual_api_key_here",
      "fromEmail": "noreply@barangay.local",
      "fromName": "Barangay System"
    }
  }'
```

**Masked API Key (Preserve Existing):**
```json
{
  "enabled": true,
  "fromName": "New Name",
  "sendgrid": {
    "apiKey": "********"
  }
}
```
→ API key will NOT be updated, existing value in DB preserved

**Response:**
```json
{
  "success": true,
  "message": "SendGrid email settings updated",
  "email": {
    "enabled": true,
    "provider": "sendgrid",
    "fromName": "Barangay System",
    "fromEmail": "noreply@barangay.local",
    "sendgrid": {
      "apiKey": "********",
      "fromEmail": "noreply@barangay.local",
      "fromName": "Barangay System"
    },
    "updatedAt": "2026-02-14T10:35:00.000Z"
  }
}
```

---

## Key Features

✅ **SendGrid-Only**
- No provider selection
- No multi-provider detection
- Simplified validation

✅ **Masked API Keys**
- API key always masked in responses
- Pattern: `"********"` (8 asterisks)
- Client can't see actual key for security

✅ **Smart Preservation**
- If request has masked apiKey → preserves existing DB value
- If request has real apiKey → updates with new value
- If request has empty string → preserves existing DB value

✅ **Proper Logging**
- Logs when API key is masked
- Logs when API key is updated (with preview)
- Logs when API key is preserved
- Logs final saved configuration

## Database Structure

Saved in `SystemSettings.email`:
```javascript
{
  enabled: Boolean,
  provider: 'sendgrid',
  fromName: String,
  fromEmail: String,
  sendgrid: {
    apiKey: String,        // Never exposed to client
    fromEmail: String,
    fromName: String
  },
  updatedAt: Date
}
```

## Client Usage (React)

```typescript
// From SystemSettings.tsx
const handleSendGridSave = async () => {
  const payload = {
    email: {
      enabled: sendgridConfig.enabled,
      fromName: sendgridConfig.fromName,
      fromEmail: sendgridConfig.fromEmail,
      sendgrid: {
        apiKey: sendgridConfig.apiKey,     // May be "SG.xxx" or "********"
        fromEmail: sendgridConfig.fromEmail,
        fromName: sendgridConfig.fromName
      }
    }
  };
  
  await adminAPI.updateSystemSettings(payload);
  // OR
  await fetch('/api/settings/email', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload.email)
  });
};
```

## Validation

**✓ Valid Requests:**
- `{ enabled: true, sendgrid: { apiKey: "SG.xxx" } }` → Save new key
- `{ enabled: true, sendgrid: { apiKey: "********" } }` → Preserve existing
- `{ enabled: false, sendgrid: {} }` → Disable email
- `{ fromName: "New Name", sendgrid: { apiKey: "********" } }` → Update name only

**✗ Invalid Requests:**
- `{ enabled: true, sendgrid: { } }` → 400 Bad Request (missing API key)
- `{ enabled: true, sendgrid: { apiKey: "" } }` → 400 Bad Request (empty key)

## Debug Logs in Console

```
[Settings] SendGrid email config update request: { ... }
[Settings] PATCH /email - SendGrid API key is masked, preserving existing value
[Settings] PATCH /email - SendGrid API key updated: { length: 69, preview: 'SG.abcd...' }
[Settings] SendGrid email configuration saved: { ... }
```

## Error Handling

**Validation Error - Missing API Key:**
```json
{
  "success": false,
  "message": "SendGrid API key is required when enabling email",
  "error": "sendgrid.apiKey is required"
}
```

**Other Errors:**
```json
{
  "success": false,
  "message": "Failed to update email settings",
  "error": "<error message>"
}
```

## Implementation Status

✅ GET /email - SendGrid-only, returns masked config
✅ PATCH /email - SendGrid-only, preserves masked keys
⏳ POST /email/test - Multi-provider (separate refactoring task)

