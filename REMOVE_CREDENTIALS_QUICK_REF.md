# Remove Hardcoded Credentials - Quick Reference

## What Changed

### The Problem ❌
SMTP credentials (email/password) were hardcoded in environment variables:
- Visible in server logs
- Required server restart to change
- Only worked with Gmail
- Hard to rotate credentials

### The Solution ✅
Moved all SMTP configuration to database with UI to manage it:
- Credentials encrypted and stored in database
- Can change anytime via admin UI without restart
- Supports any SMTP provider
- Easy credential rotation
- Backward compatible with old env vars

---

## What You Need to Do

### Step 1: No Action Required (Backward Compatible)
Your existing setup still works! If environment variables are set:
- `BIMS_EMAIL`
- `BIMS_EMAIL_PASSWORD`

These will continue to work as fallback.

### Step 2: Configure via UI (Recommended)
For better management, configure SMTP via admin panel:

1. Login as admin
2. Go to **System Settings** → **Email Settings**
3. Enter your SMTP details:
   - SMTP Host
   - SMTP Port
   - Security Type
   - SMTP User
   - **App Password** (new field)
4. Click **Update Settings**
5. Test with **Send Test Email**

### Step 3: For Gmail with 2FA (New Feature)
If you have Gmail with 2-factor authentication enabled:

1. Use the new **App Password** field (below SMTP Port)
2. Get app password from: [Google Account Settings](https://myaccount.google.com/apppasswords)
3. Enter it in the **App Password** field
4. Leave password field blank (or use same password in both)

---

## New UI Field

### Location
Below **SMTP Port** field, above **SMTP User** field

### Details
- **Label**: App Password
- **Type**: Password (hidden)
- **Purpose**: Secure password for Gmail accounts with 2FA
- **Optional**: Yes, you can use the password field instead if preferred

### Example Screenshot
```
Email Settings
├── SMTP Host: smtp.gmail.com
├── SMTP Port: 465 | Security Type: SSL
├── App Password: [hidden] ← NEW FIELD
├── SMTP User: your.email@gmail.com
└── [Send Test Email] [Clear Passwords]
```

---

## Configuration Examples

### Gmail with 2FA (Recommended)
```
SMTP Host: smtp.gmail.com
SMTP Port: 465
Security Type: SSL
SMTP User: yourname@gmail.com
App Password: xxxx xxxx xxxx xxxx  (from Google Account Settings)
```

### Gmail without 2FA
```
SMTP Host: smtp.gmail.com
SMTP Port: 587
Security Type: TLS/STARTTLS
SMTP User: yourname@gmail.com
App Password: (leave blank, use regular password)
```

### Custom SMTP Server
```
SMTP Host: mail.example.com
SMTP Port: 587
Security Type: TLS/STARTTLS
SMTP User: your.email@example.com
App Password: your-password-here
```

---

## Key Features

✅ Database-driven configuration  
✅ Passwords encrypted at rest  
✅ No server restart needed to change settings  
✅ Supports any SMTP provider  
✅ Gmail app password support for 2FA  
✅ Backward compatible with environment variables  
✅ Test email button to verify configuration  

---

## How Email System Works Now

```
User sends email
    ↓
System checks: Database settings configured?
    ↓
YES: Use database SMTP settings
│   - Host, port, security, user
│   - Encrypted password/app password
│   - Works with any SMTP provider
│
NO: Fall back to environment variables
    - BIMS_EMAIL & BIMS_EMAIL_PASSWORD
    - Gmail only
    ↓
Send email successfully
```

---

## Troubleshooting

### I see "Encryption key not configured" error
**Solution**: Make sure `.env` file has `SETTINGS_ENCRYPTION_KEY` set (32-byte key)

### Email not sending after changing credentials
**Solution**:
1. Double-check app password is correct
2. For Gmail with 2FA: use app password from Google Account Settings
3. Click "Send Test Email" to verify
4. Check browser console (F12) for errors

### I want to use environment variables again
**Solution**: Just delete the database settings. System will automatically fall back to env vars.

### Which field should I use - password or app password?
**Solution**:
- Gmail with 2FA: Use **App Password** field
- Gmail without 2FA: Use either field (same password)
- Other providers: Use whichever your provider recommends

---

## Security Benefits

| Aspect | Before | After |
|--------|--------|-------|
| Credential Storage | Plain text env vars | Encrypted in database |
| Provider Support | Gmail only | Any SMTP provider |
| Credential Rotation | Server restart needed | Change via UI anytime |
| Visibility | In server logs | Hidden from logs |
| 2FA Support | No app password support | Full app password support |

---

## Files Changed

- `server/src/services/EmailService.ts` - Read from database
- `server/src/models/SystemSetting.ts` - Added appPassword field
- `server/routes/settingsRoutes.js` - Encrypt appPassword
- `client/src/components/admin/SystemSettings.tsx` - Added UI field

---

## Testing

Quick test to verify everything works:

1. Go to System Settings → Email Settings
2. Confirm App Password field appears
3. Enter your SMTP details
4. Click "Update Settings"
5. Click "Send Test Email"
6. Check that email arrives

---

## Summary

✅ Hardcoded credentials removed  
✅ Database-driven SMTP configuration  
✅ New App Password field for Gmail 2FA  
✅ Backward compatible with env vars  
✅ Ready for production  

**Next Step**: Configure your SMTP settings via the admin UI
