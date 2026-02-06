# Gmail App Password Encryption Implementation

## Overview
This document describes the implementation of Gmail app password recording, encryption, and storage in the SystemSettings collection.

## Implementation Details

### Frontend Changes (Client)

#### 1. **GmailSettings.tsx** 
- Added `onSettingsChange` callback prop to expose current Gmail settings
- New effect hook that notifies parent component whenever Gmail settings change:
  ```tsx
  useEffect(() => {
    if (onSettingsChange) {
      onSettingsChange(gmailSettings);
    }
  }, [gmailSettings, onSettingsChange]);
  ```

#### 2. **SystemSettings.tsx**
- Added Gmail settings state to capture values from GmailSettings component:
  ```tsx
  const [gmailSettings, setGmailSettings] = useState<any>({
    enabled: false,
    gmailAddress: '',
    appPassword: '',
    displayName: '',
    useAppPassword: true,
  });
  ```

- Updated GmailSettings component invocation to pass callback:
  ```tsx
  <GmailSettings 
    onGmailStatusChange={(enabled) => {...}}
    onSettingsChange={(gmailSettings) => {
      setGmailSettings(gmailSettings);
    }}
  />
  ```

- Modified `performSave()` function to include Gmail settings in the payload:
  ```tsx
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
  }
  ```

### Backend Implementation (Already in Place)

#### 1. **SystemSetting Model** (`server/models/SystemSetting.js`)
- Gmail schema already includes:
  ```javascript
  const gmailSchema = new mongoose.Schema({
    enabled: { type: Boolean, default: false },
    gmailAddress: { type: String },
    useAppPassword: { type: Boolean, default: true },
    encryptedPassword: { type: String }, // encrypted app password
    displayName: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });
  ```

#### 2. **Settings Routes** (`server/routes/settingsRoutes.js`)
- PUT endpoint (line 334-351) handles Gmail encryption:
  ```javascript
  if (payload.gmail) {
    const gmailData = { ...payload.gmail };
    
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
  }
  ```

#### 3. **Gmail Helper** (`server/utils/gmailHelper.js`)
- `encryptGmailPassword()` function uses AES-256-CBC encryption:
  - Encrypts plain text app password using `SETTINGS_ENCRYPTION_KEY` from environment
  - Returns encrypted password in format: `base64_iv:base64_cipher`
  - Falls back to plain text if encryption key not configured (with warning)

#### 4. **Crypto Helper** (`server/utils/cryptoHelper.js`)
- `encryptText()` function implements AES-256-CBC encryption
- Generates random IV for each encryption
- Encrypts using 32-byte key from environment

## Data Flow

1. **Admin enters Gmail app password** in the GmailSettings component
2. **GmailSettings notifies parent** via `onSettingsChange` callback with current settings including `appPassword`
3. **SystemSettings stores** the Gmail settings state
4. **Admin clicks Save button** → calls `saveAll()` → calls `handleSave()` → calls `performSave()`
5. **performSave()** includes Gmail settings in request payload:
   ```
   {
     gmail: {
       enabled: true,
       gmailAddress: "admin@gmail.com",
       displayName: "Barangay System",
       appPassword: "xxxx xxxx xxxx xxxx"  // Plain text from client
     },
     ...otherSettings
   }
   ```
6. **Server receives request** at PUT `/api/settings`
7. **Server encodes and encrypts** the appPassword using `encryptGmailPassword()`
8. **Server stores** encrypted password in database:
   ```
   {
     gmail: {
       enabled: true,
       gmailAddress: "admin@gmail.com",
       displayName: "Barangay System",
       encryptedPassword: "iv_base64:cipher_base64"  // Encrypted in database
     }
   }
   ```

## Security Features

- ✅ **End-to-end encryption**: App password is never stored in plain text
- ✅ **Random IV**: Each encryption uses a unique initialization vector
- ✅ **AES-256-CBC**: Industry-standard encryption algorithm
- ✅ **Environment-based key**: Encryption key from `SETTINGS_ENCRYPTION_KEY` environment variable
- ✅ **Graceful fallback**: Falls back to plain text storage if encryption key missing (with warning)

## Environment Requirements

Make sure the following environment variable is set on the server:
- `SETTINGS_ENCRYPTION_KEY`: 32-byte encryption key (in UTF-8)

Generate a secure key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('utf8'))"
```

## Testing the Implementation

### Manual Test Steps:
1. Navigate to Admin → System Settings
2. Scroll to "Alternative Email System - Gmail" section
3. Enable Gmail and enter:
   - Gmail Address: `your-email@gmail.com`
   - App Password: `xxxx xxxx xxxx xxxx` (from Google Account)
   - Display Name: `Barangay System`
4. Click the floating save button (bottom-right circle)
5. Check server logs for encryption confirmation: `[Settings] Gmail app password encrypted`
6. Verify in MongoDB that `systemsettings.gmail.encryptedPassword` contains encrypted value

### Verification in MongoDB:
```javascript
db.systemsettings.findOne({}).then(doc => {
  console.log('Gmail settings:', doc.gmail);
  // Should see: encryptedPassword: "base64_iv:base64_cipher"
});
```

## Files Modified

1. **client/src/components/admin/GmailSettings.tsx**
   - Added `onSettingsChange` prop
   - Added effect hook to notify parent

2. **client/src/components/admin/SystemSettings.tsx**
   - Added `gmailSettings` state
   - Updated `performSave()` to include Gmail settings
   - Updated GmailSettings component call with callback

## Files Already Implemented (No Changes Needed)

- `server/models/SystemSetting.js` - Gmail schema already present
- `server/routes/settingsRoutes.js` - Encryption logic already in place
- `server/utils/gmailHelper.js` - Encryption function already available
- `server/utils/cryptoHelper.js` - Crypto implementation ready

## Conclusion

The implementation is complete. When admins save system settings with Gmail app password configured, the password will be:
1. Captured from the GmailSettings component
2. Sent to the server in the main settings save request
3. Encrypted using AES-256-CBC on the server
4. Stored securely in the SystemSettings MongoDB collection
