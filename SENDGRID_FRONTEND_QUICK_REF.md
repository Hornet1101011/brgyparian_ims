# SystemSettings Frontend Email Refactoring - Quick Reference

## What Changed

### Components Refactored
- ✅ `SendGridSettings.tsx` - Now SendGrid-exclusive with Test Email feature
- ✅ `SystemSettings.tsx` - Sends unified `email` payload to backend

### UI Changes
- ❌ Removed: SMTP, Gmail, Mailtrap configuration UI
- ✅ Added: Test Email button with live configuration testing
- ✅ Enhanced: API key display with masked values
- ✅ Improved: Error messages with helpful hints

---

## Local State Structure

```typescript
interface SendGridConfig {
  enabled: boolean;           // Enable/disable SendGrid
  apiKey: string;             // SendGrid API key
  fromEmail: string;          // Sender email address
  fromName: string;           // Sender display name
}

// In SystemSettings, sent to backend as:
payload.email = {
  enabled: sendgridConfig.enabled,
  provider: 'sendgrid',
  sendgrid: {
    apiKey: sendgridConfig.apiKey,
    fromEmail: sendgridConfig.fromEmail,
    fromName: sendgridConfig.fromName,
  }
}
```

---

## Test Email Feature

### How It Works
1. User enters configuration (API Key, From Email, From Name)
2. User enters test recipient email
3. Clicks "Send Test Email"
4. **No save needed** - uses unsaved config
5. Backend tests with provided credentials
6. Shows success/error toast

### Code Flow
```typescript
handleTestEmail()
  ↓
Validate email format
  ↓
Build emailConfig payload with current form state
  ↓
POST /admin/settings/email/test
  ↓
Show toast (success or error)
  ↓
Clear test email field on success
```

### Payload Sent
```json
{
  "testEmail": "admin@example.com",
  "emailConfig": {
    "enabled": true,
    "provider": "sendgrid",
    "sendgrid": {
      "apiKey": "SG.xxxxx",
      "fromEmail": "noreply@barangay.gov.ph",
      "fromName": "Barangay System"
    }
  }
}
```

---

## API Key Handling

### Display States
| State | Display | When |
|-------|---------|------|
| User editing | Actual value | `apiKeyDirty === true` |
| Existing key (not edited) | `••••••••••••••••` | `hasBackendApiKey === true && apiKeyDirty === false` |
| No key entered | Empty string | `hasBackendApiKey === false && apiKeyDirty === false` |

### Save Behavior
- Only sends API key to backend if user edited it (`apiKeyDirty === true`)
- If user didn't edit but backend has key, sends empty string (preserves existing)
- Validation allows save without API key if backend already has one

---

## Configuration Structure

### Enabled State (SendGrid turned ON)
```
┌─────────────────────────────────────┐
│ ☑ SendGrid Enabled                   │
├─────────────────────────────────────┤
│ API Key: [••••••••••••••••] 👁️      │
│ From Email: noreply@barangay.com    │
│ From Name: Barangay System          │
├─────────────────────────────────────┤
│ 🧪 Test Email Configuration         │
│ Test Email: [               ]        │
│            [Send Test Email]         │
├─────────────────────────────────────┤
│ ℹ️ API Key Security: ...             │
│                                      │
│ [💾 Save Changes]                   │
└─────────────────────────────────────┘
```

### Disabled State (SendGrid turned OFF)
```
┌─────────────────────────────────────┐
│ ☐ Enable SendGrid                   │
├─────────────────────────────────────┤
│ ⚠️ SendGrid is disabled              │
│ Enable SendGrid above...             │
└─────────────────────────────────────┘
```

---

## Common Tasks

### Test SendGrid Configuration (before saving)
1. Fill in API Key, From Email, From Name
2. Enter test recipient email in "Test Email" field
3. Click "Send Test Email" button
4. Check inbox for test email
5. If successful, click "Save Changes" to persist

### Update Existing Configuration
1. Edit fields as needed
2. Click "Send Test Email" to verify
3. Click "Save Changes"
4. Backend automatically updates database

### Rotate API Key
1. Clear "From Email" or other field to mark dirty
2. Or just modify API Key field
3. Test with "Send Test Email" 
4. Save changes
5. New key is stored (old one discarded)

---

## Error Messages

### Validation Errors (shown in form)
- "SendGrid API Key is required when enabled"
- "From Email address is required"
- "From Email must be a valid email address"
- "From Name is required"

### Test Email Errors (shown in toast)
- "Please enter a test email address"
- "Please enter a valid email address"
- "Test email failed: Invalid SendGrid API key"
- "Failed to send test email via SendGrid"

### Save Errors (shown in toast)
- "Failed to save SendGrid settings"

---

## State Management Details

### In SendGridSettings Component
```typescript
// Local form state
const [localConfig, setLocalConfig] = useState<SendGridConfig>(config);

// API key tracking
const [apiKeyDirty, setApiKeyDirty] = useState(false);  // User edited key?

// Test email state
const [isTestingEmail, setIsTestingEmail] = useState(false);  // Currently testing?
const [testEmail, setTestEmail] = useState('');  // Test email input value

// Validation state
const [validationErrors, setValidationErrors] = useState<string[]>([]);

// Save state
const [isSaving, setIsSaving] = useState(false);  // Currently saving?
```

### In SystemSettings Component
```typescript
// Overall SendGrid config
const [sendgridConfig, setSendgridConfig] = useState<SendGridConfig>({...});

// Track if backend has saved API key
const [hasBackendApiKey, setHasBackendApiKey] = useState(false);

// Track if SendGrid settings have changed
const [dirtySendGrid, setDirtySendGrid] = useState(false);

// Original config for dirty state detection
const originalSendgridConfigRef = useRef<SendGridConfig | null>(null);
```

---

## Integration Points

### Backend Endpoints Used

**Load Configuration**
```
GET /admin/settings
Returns: { email: { enabled, provider, sendgrid: {...} } }
```

**Save Configuration**
```
PATCH /admin/settings
Payload: { email: { enabled, provider, sendgrid: {...} } }
```

**Test Email**
```
POST /admin/settings/email/test
Payload: { testEmail, emailConfig: {...} }
Response: { success, message, details, provider }
```

### Services Used
- `axiosInstance` - API calls (includes auth interceptor)
- `adminAPI` - High-level admin endpoints
- `antdMessage` - Toast notifications

---

## Button States

### "Send Test Email" Button

| Condition | State | Reason |
|-----------|-------|--------|
| Missing API Key | Disabled | Can't test without API key |
| Missing From Email | Disabled | Can't test without sender |
| Empty test email | Disabled | Must provide recipient |
| Currently testing | Disabled | Wait for previous test to complete |
| Currently saving | Disabled | Don't test while saving settings |
| All conditions met | Enabled | Ready to test |

### "💾 Save Changes" Button

| Condition | State | Reason |
|-----------|-------|--------|
| Currently saving | Disabled | Wait for previous save to complete |
| Currently testing | Disabled | May block save operations |
| Missing required field (if enabled) | Can click | Validation runs on click |
| All valid | Enabled | Ready to save |

---

## Data Flow

### On Component Mount
```
1. Fetch settings from backend
2. Extract sendgridConfig from response
3. Detect if backend has existing API key
4. Store original config for dirty tracking
5. Populate form fields
6. Mark as not dirty
```

### On Field Change
```
1. Update localConfig state
2. If apiKey field changed, set apiKeyDirty = true
3. If validation errors exist, clear them
4. Form automatically marks as dirty
5. "Save Changes" button stays enabled
```

### On "Send Test Email"
```
1. Validate test email format
2. Build emailConfig with current form values
3. POST /admin/settings/email/test
4. If success: show toast, clear test email field
5. If error: show toast with error message
6. Settings NOT saved (doesn't persist)
```

### On "Save Changes"
```
1. Validate all required fields
2. If validation fails: show error toast
3. If valid:
   a. Build payload with current config
   b. PATCH /admin/settings
   c. Update originalSendgridConfigRef
   d. Clear dirty flag
   e. Show success toast
4. Update hasBackendApiKey if key was saved
```

---

## Key Features Checklist

✅ SendGrid-exclusive UI (no multi-provider complexity)
✅ Test email before save
✅ API key security (masked display, encrypted storage)
✅ Validation with clear error messages
✅ Responsive design (desktop & mobile)
✅ Toast notifications (success, error, info)
✅ Loading states (spinners, disabled buttons)
✅ Dirty state tracking (only save when changed)
✅ Optimistic updates (update local state immediately)
✅ Helpful hints for common errors

---

## Troubleshooting

### "Send Test Email" button is disabled
- ✓ Enter API Key
- ✓ Enter From Email
- ✓ Enter test recipient email
- Wait for any in-progress test to complete

### API key shows as empty after refresh
- This is expected - backend never sends full API key
- API key still saved (only masked value shown)
- Leave blank when saving if not changing key

### Test email shows "Invalid API key" error
- Verify API key is correct (copy from SendGrid dashboard)
- Check API key hasn't expired
- Ensure account has API key access

### Changes not saving
- Check that no validation errors are shown
- Ensure "Save Changes" button is clicked (not disabled)
- Check browser console for errors
- Verify user has admin permissions

---

## Migration Notes

### From Old Multi-Provider UI
- Old `EmailSettings.tsx` component no longer used
- Old `CustomSmtpSettings.tsx` completely removed
- Old `EmailProviderStatus.tsx` no longer needed
- Old Mailtrap, Gmail configuration is ignored
- All new saves go to `email.sendgrid` structure

### Database
- Old data in `smtp` and `gmail` fields is preserved (safe)
- New code only uses `email` field
- Can migrate old data later if needed
- No breaking changes to existing documents

---

**Version**: 1.0  
**Updated**: February 15, 2026
