# MongoDB SystemSettings Collection - SendGrid Integration

## Database Schema (SystemSetting.js)

The `email` field in the SystemSettings collection follows the `smtpSchema` structure:

```javascript
const smtpSchema = new mongoose.Schema({
  activeProvider: { type: String, enum: ['mailtrap', 'sendgrid', 'gmail'], default: 'mailtrap' },
  enabled: { type: Boolean, default: false },
  
  // Provider-specific configurations (nested objects)
  mailtrap: { type: mailtrapSchema, default: {} },
  sendgrid: { type: sendgridSchema, default: {} },
  gmail: { type: gmailProviderSchema, default: {} },
  
  // Additional metadata fields...
}, { _id: false });

// SendGrid sub-schema
const sendgridSchema = new mongoose.Schema({
  apiKey: { type: String },
  fromName: { type: String, default: 'Barangay System' },
  fromEmail: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false });

// In SystemSetting document
email: { type: smtpSchema, default: {} }
```

## MongoDB Document Structure

### Empty/Uninitialized State
```json
{
  "email": {}
}
```

### Initialized SendGrid Configuration
```json
{
  "email": {
    "enabled": true,
    "activeProvider": "sendgrid",
    "sendgrid": {
      "apiKey": "SG.xxxxxxxxxxxxx...",
      "fromName": "Barangay System",
      "fromEmail": "noreply@barangay.com",
      "createdAt": "2026-02-14T10:00:00.000Z",
      "updatedAt": "2026-02-14T10:00:00.000Z"
    },
    "mailtrap": {},
    "gmail": {}
  }
}
```

## API Endpoints

### GET /api/settings/email
**Purpose**: Retrieve current SendGrid email configuration (with masked API key)

**Response Structure**:
```json
{
  "success": true,
  "email": {
    "enabled": true,
    "activeProvider": "sendgrid",
    "sendgrid": {
      "apiKey": "********",  // MASKED for security
      "fromName": "Barangay System",
      "fromEmail": "noreply@barangay.com"
    }
  }
}
```

**Database Query**:
- Reads from: `SystemSetting.email` field
- Uses `.lean()` for read-only performance
- Sanitizes response by masking `sendgrid.apiKey`

### PATCH /api/settings/email
**Purpose**: Update SendGrid email configuration

**Expected Request Structure**:
```json
{
  "enabled": true,
  "fromName": "Barangay System",
  "fromEmail": "noreply@barangay.com",
  "sendgrid": {
    "apiKey": "SG.xxxxxxxxxxxxx...",  // New key OR "********" to preserve existing
    "fromEmail": "noreply@barangay.com",
    "fromName": "Barangay System"
  }
}
```

**Database Update Process**:
1. Fetches SystemSetting document (NOT lean - needs to be a Mongoose document)
2. Accesses `settings.email` field (or initializes as empty object)
3. Updates nested structure:
   - `email.enabled` = request.enabled
   - `email.activeProvider` = 'sendgrid'
   - `email.sendgrid.apiKey` = request.sendgrid.apiKey (if not masked)
   - `email.sendgrid.fromName` = request.sendgrid.fromName
   - `email.sendgrid.fromEmail` = request.sendgrid.fromEmail
4. Calls `settings.markModified('email')` to tell Mongoose the nested field changed
5. Calls `await settings.save()` to persist to MongoDB

**Response Structure**:
```json
{
  "success": true,
  "message": "SendGrid email settings updated",
  "email": {
    "enabled": true,
    "activeProvider": "sendgrid",
    "sendgrid": {
      "apiKey": "********",  // ALWAYS masked in response
      "fromName": "Barangay System",
      "fromEmail": "noreply@barangay.com"
    }
  }
}
```

**Validation Rules**:
- If `enabled = true`, then `sendgrid.apiKey` is required and must be non-empty
- Returns HTTP 400 if validation fails
- Detects masked values (all asterisks) and preserves existing key instead of overwriting

## Key Implementation Details

### Masked API Key Preservation
The API key is sensitive, so the frontend receives it masked as `"********"`. When the frontend sends the config back:
1. **New API Key**: If the value is NOT all asterisks, treat as new key and save it
2. **Preserved Key**: If the value IS all asterisks (masked), don't overwrite - keep existing
3. **Empty Key**: If empty string, also don't overwrite - keep existing

```javascript
const isMaskedValue = (val) => {
  return typeof val === 'string' && val.length > 0 && /^\*+$/.test(val);
};
```

### Mongoose Document Handling
- **GET /email**: Uses `.lean()` for read-only access (faster, returns plain object)
- **PATCH /email**: Does NOT use `.lean()` (returns Mongoose document), so we can:
  - Call `settings.markModified('email')` to track nested object changes
  - Call `await settings.save()` to persist changes

## Data Flow Diagram

```
Frontend SystemSettings.tsx
         ↓
    [User enters SendGrid config]
         ↓
    PATCH /api/settings/email
         ↓
    settingsRoutes.js handler
         ↓
    await SystemSetting.findOne()  [NOT lean - returns Mongoose doc]
         ↓
    settings.email = emailConfig    [Update nested object]
    settings.markModified('email')  [Mark for persistence]
    await settings.save()           [Save to MongoDB]
         ↓
    MongoDB: db.systemsettings { email: { enabled, activeProvider, sendgrid: { apiKey, ... } } }
         ↓
    Response with masked apiKey
         ↓
    Frontend SystemSettings.tsx
         ↓
    GET /api/settings/email  [Fetch current config]
         ↓
    settingsRoutes.js handler
         ↓
    await SystemSetting.findOne().lean()  [Read-only]
         ↓
    Sanitize: mask sendgrid.apiKey as "********"
         ↓
    Response
         ↓
    Frontend displays configuration
```

## Testing Verification

### 1. MongoDB Document Check
```javascript
// In MongoDB shell
db.systemsettings.findOne({ }, { email: 1 })

// Expected output:
{
  "_id": ObjectId("..."),
  "email": {
    "enabled": true,
    "activeProvider": "sendgrid",
    "sendgrid": {
      "apiKey": "SG.xxxxxxxxxxxxx...",
      "fromName": "Barangay System",
      "fromEmail": "noreply@barangay.com",
      "createdAt": ISODate("..."),
      "updatedAt": ISODate("...")
    }
  }
}
```

### 2. API Response Check
**GET /api/settings/email**:
```bash
curl -H "Authorization: Bearer <token>" \
     http://localhost:5000/api/settings/email

# Should return (with masked API key):
{
  "success": true,
  "email": {
    "enabled": true,
    "activeProvider": "sendgrid",
    "sendgrid": {
      "apiKey": "********",
      "fromName": "Barangay System",
      "fromEmail": "noreply@barangay.com"
    }
  }
}
```

### 3. Save Configuration Check
**PATCH /api/settings/email**:
```bash
curl -X PATCH \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{
       "enabled": true,
       "fromName": "Barangay System",
       "fromEmail": "noreply@barangay.com",
       "sendgrid": {
         "apiKey": "SG.new-key-here",
         "fromEmail": "noreply@barangay.com",
         "fromName": "Barangay System"
       }
     }' \
     http://localhost:5000/api/settings/email

# Should return:
{
  "success": true,
  "message": "SendGrid email settings updated",
  "email": {
    "enabled": true,
    "activeProvider": "sendgrid",
    "sendgrid": {
      "apiKey": "********",
      "fromName": "Barangay System",
      "fromEmail": "noreply@barangay.com"
    }
  }
}
```

## Files Modified

- `server/routes/settingsRoutes.js`:
  - Updated GET /email handler to properly read from `email` field with correct structure
  - Updated PATCH /email handler to properly save to `email` field matching MongoDB schema
  - Fixed email config object to match `smtpSchema` structure (not a flat object)
  - Added `markModified('email')` call before save for Mongoose to detect nested changes

## Summary

✅ **Database Structure**: Uses `smtpSchema` with `activeProvider` and nested `sendgrid` object
✅ **API Handlers**: GET and PATCH endpoints align with MongoDB schema
✅ **Masked API Keys**: Properly preserved when frontend sends back masked values
✅ **Mongoose Document**: PATCH handler uses non-lean documents to enable `.save()`
✅ **Configuration Persistence**: Changes are properly saved to MongoDB in correct location

---

**Status**: Ready for testing - SendGrid configuration will now persist correctly to MongoDB
