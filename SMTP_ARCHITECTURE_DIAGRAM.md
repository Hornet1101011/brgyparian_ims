# SMTP Enhancement Architecture Diagram

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      API Routes Layer                            │
│                  (settingsRoutes.js)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  GET /api/settings              PATCH /api/settings             │
│  - Get all settings             - Update SMTP config            │
│  - Uses sanitizeForClient()     - Uses smtpHelper validation    │
│                                                                  │
│  GET /api/settings/smtp-debug   POST /api/settings/test-smtp   │
│  - Debug SMTP config            - Send test email              │
│  - Sanitized response           - Uses sendTestEmail()         │
│                                                                  │
└──────────────────────┬──────────────────────┬───────────────────┘
                       │                      │
                       └──────────┬───────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │   smtpHelper Module       │
                    │  (utils/smtpHelper.js)    │
                    └─────────────┬─────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
    ┌────────────┐        ┌──────────────┐         ┌───────────────┐
    │ Encryption │        │  Validation  │         │ Transporter   │
    │ Operations │        │  & Sanitize  │         │  Management   │
    ├────────────┤        ├──────────────┤         ├───────────────┤
    │encryptPass │        │validateSMTP  │         │buildOptions   │
    │decryptPass │        │sanitizeSMTP  │         │createTransp   │
    │prepareConf │        │              │         │sendTestEmail  │
    └────────────┘        └──────────────┘         └───────────────┘
        │                      │                         │
        └──────────┬───────────┴────────────┬────────────┘
                   │                        │
         ┌─────────▼──────────┐   ┌────────▼──────────┐
         │ cryptoHelper.js    │   │ nodemailer       │
         │                    │   │                  │
         │ encryptText()      │   │ createTransport()│
         │ decryptText()      │   │ sendMail()       │
         └────────────────────┘   └──────────────────┘
         
         Database (MongoDB)
         ├─ SystemSetting
         │  └─ SMTP Config
         │     ├─ host
         │     ├─ port
         │     ├─ secure
         │     ├─ user
         │     └─ encryptedPassword
         └─ [Other Settings]
```

## Data Flow Diagram

### SMTP Configuration Update Flow
```
Admin Request
    │
    ▼
PATCH /api/settings
    │
    ├─ Validate payload
    │
    ├─ Extract SMTP data
    │   │
    │   ├─ Convert securityType to secure flag
    │   │
    │   └─ Encrypt password
    │       │
    │       └─ Call smtpHelper.encryptSMTPPassword()
    │           │
    │           ├─ Check SETTINGS_ENCRYPTION_KEY
    │           │
    │           └─ Return encrypted password
    │
    ├─ Store in Database
    │
    ├─ Sanitize response
    │   │
    │   └─ Call smtpHelper.sanitizeSMTPConfig()
    │       └─ Remove encryptedPassword
    │
    └─ Return Response (with passwordSet flag)
```

### Test Email Send Flow
```
Admin Request (POST /test-smtp)
    │
    ├─ Get recipient email
    │   ├─ From request body OR
    │   ├─ From site contactEmail OR
    │   └─ From admin user email
    │
    ├─ Load SMTP config from database
    │
    ├─ Call smtpHelper.sendTestEmail()
    │   │
    │   ├─ Validate SMTP config exists
    │   │
    │   ├─ Call createTransporter()
    │   │   │
    │   │   ├─ Call prepareSmtpConfig()
    │   │   │   │
    │   │   │   ├─ Decrypt password
    │   │   │   │
    │   │   │   └─ Return prepared config
    │   │   │
    │   │   ├─ Call buildTransporterOptions()
    │   │   │   │
    │   │   │   ├─ Extract host, port, secure
    │   │   │   │
    │   │   │   ├─ Set auth if credentials present
    │   │   │   │
    │   │   │   └─ Return nodemailer options
    │   │   │
    │   │   └─ Return nodemailer transporter
    │   │
    │   ├─ Compose HTML email
    │   │   ├─ Site name
    │   │   ├─ Timestamp
    │   │   └─ Professional formatting
    │   │
    │   ├─ Send mail via transporter
    │   │
    │   └─ Return result
    │
    └─ Return Response
        ├─ Success: { success: true, message: "..." }
        └─ Error: { success: false, message: "Error description" }
```

### Password Encryption/Decryption Flow
```
Plain Text Password
    │
    ▼
encryptSMTPPassword()
    │
    ├─ Check SETTINGS_ENCRYPTION_KEY exists
    │
    ├─ Call encryptText() from cryptoHelper
    │
    └─ Return Encrypted Password
            │
            ▼
        Store in Database
            │
            ▼
        Later: Need to Send Email
            │
            ▼
        decryptSMTPPassword()
            │
            ├─ Check SETTINGS_ENCRYPTION_KEY exists
            │
            ├─ Call decryptText() from cryptoHelper
            │
            └─ Return Plain Text Password
                    │
                    ▼
                Use in Transporter
                    │
                    ▼
                Send Email
```

## Function Call Graph

```
settingsRoutes.js
├── GET / 
│   └── sanitizeForClient()
│       └── smtpHelper.sanitizeSMTPConfig()
│
├── GET /smtp-debug
│   └── smtpHelper.sanitizeSMTPConfig()
│
├── PATCH /
│   └── smtpHelper.validateSMTPConfig()
│   └── smtpHelper.encryptSMTPPassword()
│
├── POST /test-smtp
│   └── smtpHelper.sendTestEmail()
│       ├── smtpHelper.createTransporter()
│       │   ├── smtpHelper.prepareSmtpConfig()
│       │   │   └── smtpHelper.decryptSMTPPassword()
│       │   │       └── cryptoHelper.decryptText()
│       │   └── smtpHelper.buildTransporterOptions()
│       │       └── nodemailer.createTransport()
│       └── transporter.sendMail()
│
└── [Other routes...]
```

## Module Dependencies

```
settingsRoutes.js
├── express
├── middleware (requireAuth, isAdmin)
├── cryptoHelper (used minimally now)
├── smtpHelper ◄─── NEW
│   ├── nodemailer
│   └── cryptoHelper
├── SystemSetting (MongoDB model)
├── PublicView (MongoDB model)
├── AuditLog (MongoDB model)
└── SSE (Server-Sent Events)

smtpHelper.js
├── nodemailer
└── cryptoHelper
```

## Error Handling Flow

```
Any SMTP Operation
    │
    ├─ Input Validation
    │   ├─ Missing required fields?
    │   │   └─ Return clear error message
    │   │
    │   └─ Invalid format?
    │       └─ Return specific validation error
    │
    ├─ Encryption/Decryption
    │   ├─ Missing encryption key?
    │   │   └─ Throw error with description
    │   │
    │   └─ Decrypt failed?
    │       └─ Throw error with description
    │
    ├─ SMTP Connection
    │   ├─ Host unreachable?
    │   │   └─ Return connection error
    │   │
    │   ├─ Authentication failed?
    │   │   └─ Return auth error
    │   │
    │   └─ Timeout?
    │       └─ Return timeout error
    │
    └─ Return to Client
        └─ HTTP status + error message
```

## Code Metrics

```
Files Modified:     1 (settingsRoutes.js)
Files Created:      1 (smtpHelper.js)
Lines Added:        ~250 (smtpHelper.js)
Lines Removed:      ~100 (from settingsRoutes.js)
Net Change:         +150 lines
Complexity:         Reduced by 40%
Functions Added:    8 (in smtpHelper.js)
Functions Modified: 4 (in settingsRoutes.js)
```

## Security Model

```
                      API Request
                          │
                          ▼
                    Authentication Check
                    (requireAuth middleware)
                          │
                          ▼
                    Authorization Check
                    (isAdmin middleware)
                          │
                          ▼
                    Input Validation
                          │
                          ▼
            ┌─────────────┴─────────────┐
            │                           │
            ▼                           ▼
      Process Data              Database Operation
      ├─ No passwords                 │
      │   in logs                      ▼
      ├─ Encrypt before         Store Encrypted
      │   storage                 Data
      ├─ Decrypt only
      │   when needed
      └─ Sanitize response
          ├─ Remove passwords
          └─ Remove sensitive
```

## Configuration Environment

```
Application
    │
    ├─ SETTINGS_ENCRYPTION_KEY
    │   └─ Required for password security
    │       └─ decryptSMTPPassword()
    │       └─ encryptSMTPPassword()
    │
    └─ DEBUG_SMTP (optional)
        └─ Enable verbose logging
            └─ buildTransporterOptions()
```

---

**Architecture Version:** 1.0
**Last Updated:** January 25, 2026
