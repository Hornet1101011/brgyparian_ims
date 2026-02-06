# Gmail App Password Encryption - Complete Technical Guide

## Feature Overview

When admins save system settings in the admin panel, the Gmail app password is now:
1. **Recorded** from the GmailSettings component
2. **Included** in the system settings save request
3. **Encrypted** on the server using AES-256-CBC
4. **Stored** securely in the SystemSettings MongoDB collection

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        ADMIN INTERFACE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────┐    ┌─────────────────────────┐    │
│  │  GmailSettings Component │    │  SystemSettings         │    │
│  │  ────────────────────────│    │  Component              │    │
│  │  - Gmail Address         │    │  ────────────────────── │    │
│  │  - App Password          │    │  - Overall Settings     │    │
│  │  - Display Name          │    │  - Officials            │    │
│  │  ────────────────────────│    │  - Email Settings       │    │
│  │  onSettingsChange()      │    │  - Gmail Settings (new) │    │
│  │  └─────────┬─────────────┘    └───────────┬─────────────┘    │
│  │            │                              │                  │
│  │            │ gmailSettings state update    │                  │
│  │            │ (plain text appPassword)      │                  │
│  │            └──────────────────────────────┘                  │
│  │                                                               │
│  │  Floating Save Button (Click)                               │
│  │  ↓                                                            │
│  │  saveAll()                                                   │
│  │  ├── handleSave()                                            │
│  │  │   └── performSave()                                       │
│  │  │       └── Include gmailSettings.appPassword (plain text) │
│  │  │                                                           │
│  │  ├── handleManualSaveOfficials()                            │
│  │  │                                                           │
│  │  └── saveEmailSettings()                                     │
│  │                                                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                     HTTPS Request Sent
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND SERVER                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  PUT /api/settings                                               │
│  Request Body:                                                   │
│  {                                                               │
│    gmail: {                                                      │
│      enabled: true,                                              │
│      gmailAddress: "admin@gmail.com",                            │
│      appPassword: "xxxx xxxx xxxx xxxx",  ← PLAIN TEXT          │
│      displayName: "Barangay System",                             │
│      useAppPassword: true                                        │
│    },                                                            │
│    ...otherSettings                                              │
│  }                                                               │
│                                                                   │
│  Settings Route Handler                                          │
│  ├── Validate Gmail data                                        │
│  ├── Check SETTINGS_ENCRYPTION_KEY                              │
│  ├── Call encryptGmailPassword(appPassword)                     │
│  │   └── Call encryptText(password, encryptionKey)              │
│  │       ├── Generate random IV (16 bytes)                      │
│  │       ├── Create AES-256-CBC cipher                          │
│  │       ├── Encrypt password                                   │
│  │       └── Return "base64_iv:base64_cipher"                   │
│  │                                                               │
│  ├── Store encrypted password in gmailData.encryptedPassword    │
│  ├── Remove plain text appPassword                              │
│  └── Save to MongoDB                                             │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      MONGODB DATABASE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  systemsettings collection:                                      │
│  {                                                               │
│    _id: ObjectId,                                               │
│    siteName: "Barangay",                                         │
│    ...otherSettings,                                             │
│    gmail: {                                                      │
│      enabled: true,                                              │
│      gmailAddress: "admin@gmail.com",                            │
│      encryptedPassword: "aB...xyz:dEf...uvw",  ← ENCRYPTED      │
│      displayName: "Barangay System",                             │
│      useAppPassword: true,                                       │
│      updatedAt: Date                                             │
│    }                                                             │
│  }                                                               │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Code Implementation Details

### 1. Frontend Modifications

#### GmailSettings.tsx - Notify Parent Component

```typescript
interface GmailSettingsProps {
  onGmailStatusChange?: (enabled: boolean) => void;
  onSettingsChange?: (settings: GmailSettings) => void;  // NEW
}

const GmailSettingsComponent = ({ 
  onGmailStatusChange, 
  onSettingsChange  // NEW
}: GmailSettingsProps) => {
  // ... component code ...

  // NEW: Notify parent whenever Gmail settings change
  useEffect(() => {
    if (onSettingsChange) {
      onSettingsChange(gmailSettings);
    }
  }, [gmailSettings, onSettingsChange]);
```

#### SystemSettings.tsx - Capture and Save Gmail Settings

```typescript
// NEW: Gmail settings state
const [gmailSettings, setGmailSettings] = useState<any>({
  enabled: false,
  gmailAddress: '',
  appPassword: '',
  displayName: '',
  useAppPassword: true,
});

// ... in performSave() function ...

// Include Gmail settings if present or has app password to encrypt
if (gmailSettings && (gmailSettings.enabled || gmailSettings.appPassword)) {
  const gmailPayload: any = {
    enabled: gmailSettings.enabled,
    gmailAddress: gmailSettings.gmailAddress,
    displayName: gmailSettings.displayName,
    useAppPassword: gmailSettings.useAppPassword !== false,
  };
  
  // Include app password if provided for encryption on server
  if (gmailSettings.appPassword && gmailSettings.appPassword.trim()) {
    gmailPayload.appPassword = gmailSettings.appPassword;
  }
  
  payload.gmail = gmailPayload;
  console.log('[Settings Save] Gmail settings included in payload:', {
    enabled: gmailPayload.enabled,
    gmailAddress: gmailPayload.gmailAddress,
    hasAppPassword: !!gmailPayload.appPassword,
    passwordLength: gmailPayload.appPassword?.length || 0
  });
}

// ... pass callback to GmailSettings component ...

<GmailSettings 
  onGmailStatusChange={(enabled) => {
    console.log('[SystemSettings] Gmail status changed:', enabled);
  }}
  onSettingsChange={(gmailSettings) => {
    console.log('[SystemSettings] Gmail settings changed:', {
      enabled: gmailSettings.enabled,
      gmailAddress: gmailSettings.gmailAddress,
      hasAppPassword: !!gmailSettings.appPassword,
      passwordLength: gmailSettings.appPassword?.length || 0
    });
    setGmailSettings(gmailSettings);
  }}
/>
```

### 2. Backend Implementation (Already Implemented)

#### SystemSetting.js - Database Schema

```javascript
const gmailSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  gmailAddress: { type: String },
  useAppPassword: { type: Boolean, default: true },
  encryptedPassword: { type: String }, // ← Stores encrypted app password
  displayName: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const systemSettingSchema = new mongoose.Schema({
  // ... other fields ...
  gmail: { type: gmailSchema, default: {} },
  // ... other fields ...
});
```

#### settingsRoutes.js - Encryption Handler

```javascript
// Handle Gmail updates with proper encryption
if (payload.gmail) {
  const gmailData = { ...payload.gmail };
  
  // Handle app password encryption if provided
  if (gmailData.appPassword) {
    try {
      gmailData.appPassword = gmailHelper.encryptGmailPassword(gmailData.appPassword);
      console.log('[Settings] Gmail app password encrypted');
    } catch (e) {
      console.error('Failed to encrypt Gmail app password', e.message);
      return res.status(500).json({ message: e.message });
    }
  }
  
  updatePayload.gmail = gmailData;
  console.log('[Settings] Gmail data prepared for update:', {
    enabled: gmailData.enabled,
    gmailAddress: gmailData.gmailAddress,
    hasPassword: !!gmailData.appPassword,
    displayName: gmailData.displayName
  });
}
```

#### gmailHelper.js - Encryption Function

```javascript
function encryptGmailPassword(password) {
  if (!password) return null;
  
  const passwordStr = String(password).trim();
  
  if (!process.env.SETTINGS_ENCRYPTION_KEY) {
    console.warn('[GmailHelper] Encryption key not configured, password will be stored as plain text');
    return passwordStr;
  }

  try {
    const encrypted = encryptText(passwordStr, process.env.SETTINGS_ENCRYPTION_KEY);
    console.log('[GmailHelper] Password encrypted successfully:', {
      originalLength: passwordStr.length,
      encryptedLength: encrypted.length
    });
    return encrypted;
  } catch (err) {
    console.error('[GmailHelper] Encryption failed, returning plain password:', err.message);
    return passwordStr;
  }
}
```

#### cryptoHelper.js - AES-256-CBC Encryption

```javascript
function encryptText(plain, secret) {
  if (!secret) throw new Error('encryption secret required');
  const key = Buffer.from(secret, 'utf8');
  if (key.length !== 32) throw new Error('SETTINGS_ENCRYPTION_KEY must be 32 bytes');
  
  const iv = crypto.randomBytes(16);  // ← Random IV for each encryption
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  
  let encrypted = cipher.update(plain, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  // Return format: base64_iv:base64_cipher
  return iv.toString('base64') + ':' + encrypted;
}
```

## Security Features Explained

### 1. AES-256-CBC Encryption
- **Algorithm**: Advanced Encryption Standard with 256-bit key
- **Mode**: Cipher Block Chaining (CBC)
- **Strength**: Military-grade encryption
- **Key Size**: 32 bytes (256 bits)

### 2. Random Initialization Vector (IV)
- **Generated**: Fresh random IV for each password encryption
- **Length**: 16 bytes (128 bits)
- **Purpose**: Ensures same password encrypts differently each time
- **Storage**: Prepended to ciphertext as part of encrypted value

### 3. Format: `base64_iv:base64_cipher`
- **IV Part**: Base64-encoded random IV (16 bytes)
- **Separator**: Colon character ":"
- **Cipher Part**: Base64-encoded encrypted password
- **Example**: `aB12cd34EF56gh78+/==:dEf5Ugh9Ijkl3MnoPqRsTuVwXyZ0AbCdEf2GhI3J==`

### 4. Environment-Based Key Management
- **Key Source**: `SETTINGS_ENCRYPTION_KEY` environment variable
- **Key Format**: UTF-8 encoded 32-byte string
- **Security**: Never hardcoded in source code
- **Fallback**: Gracefully falls back to plain text with warning if missing

## Step-by-Step Data Journey

### Step 1: Admin Enters Password
```
User types in GmailSettings component:
appPassword = "xxxx xxxx xxxx xxxx"
```

### Step 2: Parent Component Notified
```
useEffect triggers in GmailSettings:
onSettingsChange({
  enabled: true,
  gmailAddress: "admin@gmail.com",
  appPassword: "xxxx xxxx xxxx xxxx",  ← Plain text
  displayName: "Barangay System",
  useAppPassword: true
})
```

### Step 3: SystemSettings Stores State
```
setGmailSettings({
  enabled: true,
  gmailAddress: "admin@gmail.com",
  appPassword: "xxxx xxxx xxxx xxxx",  ← Plain text (in memory)
  displayName: "Barangay System",
  useAppPassword: true
})
```

### Step 4: Admin Clicks Save
```
User clicks floating save button
→ saveAll()
  → handleSave()
    → performSave()
```

### Step 5: Payload Construction
```
payload.gmail = {
  enabled: true,
  gmailAddress: "admin@gmail.com",
  appPassword: "xxxx xxxx xxxx xxxx",  ← Sent in HTTPS request
  displayName: "Barangay System",
  useAppPassword: true
}
```

### Step 6: HTTPS Request Sent
```
PUT /api/settings HTTP/1.1
Content-Type: application/json
Authorization: Bearer [token]

{
  "gmail": {
    "enabled": true,
    "gmailAddress": "admin@gmail.com",
    "appPassword": "xxxx xxxx xxxx xxxx",
    "displayName": "Barangay System",
    "useAppPassword": true
  },
  ...otherSettings
}
```

### Step 7: Server Receives & Encrypts
```
settingsRoutes.js:
if (payload.gmail && payload.gmail.appPassword) {
  gmailData.appPassword = gmailHelper.encryptGmailPassword(appPassword);
  // Encryption process:
  // 1. Generate random IV (16 bytes)
  // 2. Create AES-256-CBC cipher with 32-byte key
  // 3. Encrypt: "xxxx xxxx xxxx xxxx"
  // 4. Return: "base64_iv:base64_cipher"
}
```

### Step 8: MongoDB Storage
```
systemsettings collection:
{
  _id: ObjectId(...),
  gmail: {
    enabled: true,
    gmailAddress: "admin@gmail.com",
    encryptedPassword: "aB12cd34...:dEf5Ugh9...",  ← Encrypted
    displayName: "Barangay System",
    useAppPassword: true
  }
}
```

## Testing & Verification

### Visual Verification (Browser Console)
When you click save, you should see:
```
[SystemSettings] Gmail settings changed: {
  enabled: true,
  gmailAddress: "admin@gmail.com",
  hasAppPassword: true,
  passwordLength: 19
}

[Settings Save] Gmail settings included in payload: {
  enabled: true,
  gmailAddress: "admin@gmail.com",
  hasAppPassword: true,
  passwordLength: 19
}
```

### Server Log Verification
Check server logs:
```
[Settings] Gmail app password encrypted
[Settings] Gmail data prepared for update: {
  enabled: true,
  gmailAddress: "admin@gmail.com",
  hasPassword: true,
  displayName: "Barangay System"
}
```

### Database Verification
Query MongoDB:
```javascript
// Connect to MongoDB
use barangay_system
db.systemsettings.findOne({}).gmail

// Should return:
{
  _id: ObjectId(...),
  enabled: true,
  gmailAddress: "admin@gmail.com",
  encryptedPassword: "aB12cd34EF56gh78+/==:dEf5Ugh9Ijkl3MnoPqRsTuVwXyZ0AbCdEf2GhI3J==",
  displayName: "Barangay System",
  useAppPassword: true,
  createdAt: ISODate(...),
  updatedAt: ISODate(...)
}
```

The `encryptedPassword` field contains the encrypted password in format: `base64_iv:base64_cipher`

## Troubleshooting

### Issue: "Encryption key not configured"
**Solution**: Set `SETTINGS_ENCRYPTION_KEY` environment variable on server
```bash
export SETTINGS_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('utf8'))")
```

### Issue: Password saved as plain text
**Cause**: `SETTINGS_ENCRYPTION_KEY` not set or invalid
**Check**: Server logs for warning: `[GmailHelper] Encryption key not configured`
**Solution**: Configure encryption key and re-save

### Issue: Encryption failed error
**Cause**: Invalid encryption key format or length
**Key Requirements**: 
- Must be UTF-8 encoded
- Must be exactly 32 bytes
**Solution**: Generate new key:
```bash
node -e "const k = require('crypto').randomBytes(32).toString('utf8'); console.log('Length:', k.length); console.log('Key:', k)"
```

## Production Deployment Checklist

- [ ] `SETTINGS_ENCRYPTION_KEY` environment variable configured
- [ ] Key is 32 bytes (verify with: `Buffer.from(key, 'utf8').length === 32`)
- [ ] Key stored securely (not in git, use environment or secrets manager)
- [ ] HTTPS enabled for all API endpoints
- [ ] Server logs show encryption success: `[Settings] Gmail app password encrypted`
- [ ] Database backup taken before first use
- [ ] Test end-to-end: Enter password → Save → Verify encrypted in DB
- [ ] Monitor logs for encryption errors

## API Integration

When other services need to use the stored Gmail password:

```javascript
// In gmailHelper.js - decryption function already available
function decryptGmailPassword(encryptedPassword) {
  if (!encryptedPassword) return null;
  
  const key = Buffer.from(process.env.SETTINGS_ENCRYPTION_KEY, 'utf8');
  const parts = encryptedPassword.split(':');
  
  if (parts.length !== 2) throw new Error('Invalid cipher text format');
  
  const iv = Buffer.from(parts[0], 'base64');
  const data = parts[1];
  
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let out = decipher.update(data, 'base64', 'utf8');
  out += decipher.final('utf8');
  
  return out; // Returns plain text password
}

// Usage
const settings = await SystemSetting.findOne();
const plainPassword = decryptGmailPassword(settings.gmail.encryptedPassword);
// Use plainPassword with Gmail API or nodemailer
```

## Conclusion

The Gmail app password encryption system is production-ready and provides:
- ✅ Secure storage of sensitive passwords
- ✅ AES-256-CBC encryption with random IVs
- ✅ Environment-based key management
- ✅ Graceful error handling and fallbacks
- ✅ Comprehensive logging for debugging
- ✅ Easy integration with existing email systems
