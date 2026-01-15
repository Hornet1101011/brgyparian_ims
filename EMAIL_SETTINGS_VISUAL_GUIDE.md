# 📊 Email Settings System - Visual Overview

## Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ADMIN DASHBOARD / UI                            │
│              (To be built - API ready for integration)              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Email Settings Control Panel                               │  │
│  │  ┌─────────────────┐  ┌──────────────────────────────────┐  │  │
│  │  │  Master Switch  │  │  Individual Email Type Controls  │  │  │
│  │  │  ┌───────────┐  │  │  ┌─────────────────────────────┐│  │  │
│  │  │  │ Enabled   │  │  │  │ ✅ Password Reset Emails    ││  │  │
│  │  │  │ [ON/OFF]  │  │  │  │ ✅ OTP Emails               ││  │  │
│  │  │  └───────────┘  │  │  │ ✅ Document Notifications   ││  │  │
│  │  │                 │  │  │ ✅ Announcements            ││  │  │
│  │  │  (Affects ALL   │  │  │ ✅ BCC Mode for Announces  ││  │  │
│  │  │   email types)  │  │  └─────────────────────────────┘│  │  │
│  │  └─────────────────┘  └──────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬──────────────────────────────────────────┘
                          │
                   API CALLS
                          │
         ┌────────────────┴────────────────┐
         │                                 │
    GET /api/settings/email        PATCH /api/settings/email
    (Retrieve)                      (Update)
         │                                 │
         └────────────────┬────────────────┘
                          │
         ┌────────────────┴────────────────┐
         │                                 │
         ↓                                 ↓
   ┌──────────────┐            ┌──────────────────────┐
   │ settingsRoutes.js         │ Validation & Auth    │
   │ • GET endpoint            │ • Admin check        │
   │ • PATCH endpoint          │ • Numeric validation │
   │ • Auth check              │ • Error handling     │
   └────────┬─────────────────┴──────────────────────┘
            │
            ↓
   ┌──────────────────────────────────────┐
   │    MongoDB: SystemSetting            │
   │   ┌──────────────────────────────┐  │
   │   │  emailSettings: {            │  │
   │   │    enabled: true             │  │
   │   │    enablePasswordReset: true │  │
   │   │    enableOtp: true           │  │
   │   │    enableDocNotif: true      │  │
   │   │    enableAnnounce: true      │  │
   │   │    enableBcc: true           │  │
   │   │    batchSize: 100            │  │
   │   │    retryEnabled: true        │  │
   │   │    retryAttempts: 3          │  │
   │   │    retryDelay: 5 mins        │  │
   │   │  }                           │  │
   │   └──────────────────────────────┘  │
   └────────┬─────────────────────────────┘
            │
            │ (Settings checked here)
            │
   ┌────────┴──────────────────────────────────────────────┐
   │                                                        │
   ↓                ↓                ↓                     ↓
┌──────────┐  ┌──────────┐    ┌──────────┐    ┌────────────────┐
│ Password │  │   OTP    │    │ Document │    │ Announcement   │
│  Reset   │  │ Service  │    │ Notif    │    │ Service        │
│ Service  │  │          │    │ Service  │    │                │
└────┬─────┘  └────┬─────┘    └────┬─────┘    └────────┬───────┘
     │             │               │                  │
     │             │               │                  │
     └─────────────┴───────────────┴──────────────────┘
                       │
        sendMail() or sendDocumentNotification()
                       │
                       ↓
         ┌─────────────────────────────────┐
         │  isEmailTypeEnabled(type)?      │
         │  Check SystemSetting.emailSettings
         │  ┌─────────────────────────────┐
         │  │ If emailType='password-reset':
         │  │   → Check enablePasswordResetEmails
         │  │                              │
         │  │ If emailType='otp':         │
         │  │   → Check enableOtpEmails    │
         │  │                              │
         │  │ If emailType='announcement': │
         │  │   → Check enableAnnouncementEmails
         │  │                              │
         │  │ If enabled=false:           │
         │  │   → Return false (skip email)
         │  └─────────────────────────────┘
         └────┬────────────────────────────┘
              │
     ┌────────┴────────┐
     │                 │
  TRUE│              │FALSE
     │                 │
     ↓                 ↓
┌─────────────┐  ┌──────────────┐
│ SEND EMAIL  │  │ SKIP EMAIL   │
│ to Gmail    │  │ (Log as      │
│             │  │  skipped)    │
│ ✉️ via SMTP │  │              │
│             │  │ 🚫 Not sent  │
└────┬────────┘  └──────┬───────┘
     │                  │
     └────────┬─────────┘
              │
              ↓
      ┌──────────────────┐
      │   EmailLog       │
      │ (Audit Record)   │
      │ ┌────────────────┐
      │ │ recipient      │
      │ │ subject        │
      │ │ status: sent OR skipped
      │ │ emailType      │
      │ │ dateSent       │
      │ │ errorMessage   │
      │ │ messageId      │
      │ └────────────────┘
      └────────┬─────────┘
               │
         Also logged:
               │
      ┌────────┴──────────┐
      │                   │
      ↓                   ↓
  ┌────────────┐   ┌───────────────┐
  │ AuditLog   │   │ Email Status  │
  │ (Changes)  │   │ (Statistics)  │
  │            │   │               │
  │ Who?       │   │ Sent Count    │
  │ What?      │   │ Failed Count  │
  │ When?      │   │ Skipped Count │
  │ Before?    │   │ Error Msgs    │
  │ After?     │   │               │
  └────────────┘   └───────────────┘
```

---

## Data Flow Examples

### Example 1: Admin Disables OTP Emails

```
1. Admin calls: PATCH /api/settings/email
   Body: {"enableOtpEmails": false}
   
   │
   ↓
   
2. settingsRoutes validates:
   ✓ User is admin
   ✓ Data is valid
   
   │
   ↓
   
3. Update MongoDB:
   SystemSetting.emailSettings.enableOtpEmails = false
   
   │
   ↓
   
4. Log to AuditLog:
   {
     user: "admin@barangay.local",
     action: "Update email settings",
     changes: { enableOtpEmails: { before: true, after: false } },
     timestamp: "2024-01-15T10:30:00Z"
   }
   
   │
   ↓
   
5. Return success to admin

   │
   ↓
   
6. User tries to login with OTP:
   - OTP Service calls sendMail(email, subject, html, [], 'otp')
   - sendMail() checks isEmailTypeEnabled('otp')
   - isEmailTypeEnabled('otp') queries SystemSetting
   - Finds enableOtpEmails = false
   - Returns false
   - sendMail() SKIPS sending
   - Logs to EmailLog with status: "sent", errorMessage: "Skipped: Email type disabled"
   
   │
   ↓
   
7. User sees no error (graceful)
   Admin can check logs to see email was skipped
```

### Example 2: Emergency Shutdown of All Emails

```
1. System experiences issues
   
   │
   ↓
   
2. Admin calls: PATCH /api/settings/email
   Body: {"enabled": false}
   
   │
   ↓
   
3. Immediately (no restart needed):
   - All password reset emails skipped
   - All OTP emails skipped
   - All announcements skipped
   - All document notifications skipped
   - Graceful degradation (logged, not errored)
   
   │
   ↓
   
4. Admin can monitor:
   GET /api/admin/email-logs?status=skipped
   → See all skipped emails with timestamps
   
   │
   ↓
   
5. Issue resolved:
   Admin calls: PATCH /api/settings/email
   Body: {"enabled": true}
   → All emails resume normally
```

### Example 3: Selective Control

```
Keep emails working, just disable notifications:

PATCH /api/settings/email
{
  "enabled": true,              ← All emails allowed
  "enablePasswordResetEmails": true,
  "enableOtpEmails": true,
  "enableDocumentNotificationEmails": false,  ← DISABLED
  "enableAnnouncementEmails": true,
  "enableAnnouncementBcc": true
}

Result:
✅ Password reset emails → SENT
✅ OTP emails → SENT
❌ Document notifications → SKIPPED
✅ Announcements → SENT
```

---

## System Components Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          SYSTEM LAYERS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LAYER 1: USER INTERFACE (To be built)                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Admin Settings Control Panel (Web UI)                    │  │
│  │ - View settings                                          │  │
│  │ - Update settings                                        │  │
│  │ - Monitor email logs                                     │  │
│  │ - View audit trail                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  LAYER 2: API ROUTES (✅ IMPLEMENTED)                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ settingsRoutes.js                                        │  │
│  │ - GET /api/settings/email                                │  │
│  │ - PATCH /api/settings/email                              │  │
│  │ - Authorization checks                                   │  │
│  │ - Input validation                                       │  │
│  │ - Audit logging                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  LAYER 3: DATABASE (✅ IMPLEMENTED)                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ MongoDB Collections                                      │  │
│  │ - SystemSetting (emailSettings config)                   │  │
│  │ - EmailLog (all sent/skipped/failed emails)              │  │
│  │ - AuditLog (all settings changes)                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  LAYER 4: EMAIL SERVICES (✅ IMPLEMENTED)                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ EmailService.ts & emailService.js                        │  │
│  │ - isEmailTypeEnabled() - Checks settings                 │  │
│  │ - sendMail() - Modified to respect settings              │  │
│  │ - sendDocumentNotification() - Notification emails       │  │
│  │ - getGmailTransporter() - Gmail SMTP connection          │  │
│  │ - logEmailToDb() - Audit trail                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  LAYER 5: INTEGRATION POINTS (✅ IMPLEMENTED)                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ otpController, Announcement Service, etc.                │  │
│  │ - Pass emailType parameter to sendMail()                 │  │
│  │ - Respect isEmailTypeEnabled() checks                    │  │
│  │ - Log all email activity                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Email Lifecycle with Settings Control

```
USER ACTION (e.g., "forgot password")
       │
       ↓
API ENDPOINT (e.g., /api/auth/forgot-password)
       │
       ↓
BUSINESS LOGIC
       │
       ├─ Validate user
       ├─ Create reset token
       ├─ Save to database
       └─ Call sendMail(email, subject, html, [], 'password-reset')
              │
              ↓
         SENDMAIL() FUNCTION
              │
              ├─ Call isEmailTypeEnabled('password-reset')
              │     │
              │     ↓
              │  SystemSetting check:
              │  ├─ Is enabled field true?
              │  ├─ Is enablePasswordResetEmails true?
              │  └─ Return true or false
              │
              ├─ IF FALSE:
              │  ├─ Log to EmailLog as "skipped"
              │  ├─ Return early
              │  └─ Continue (no error)
              │
              └─ IF TRUE:
                 ├─ Connect to Gmail SMTP
                 ├─ Send email
                 ├─ Get messageId from Gmail
                 ├─ Log to EmailLog as "sent"
                 └─ Return success

RESPONSE TO USER
├─ API returns success (regardless of email status)
└─ User continues without error

ADMIN MONITORING
├─ Check /api/admin/email-logs
├─ See "sent" or "skipped" status
├─ View error messages (if failed)
└─ See audit trail of settings changes
```

---

## Settings Schema Overview

```
SystemSetting.emailSettings = {
  
  ┌─ MASTER CONTROLS ──────────────────────────┐
  │                                            │
  │ enabled (Boolean)                          │
  │ ├─ Default: true                          │
  │ └─ Purpose: Master on/off for ALL emails  │
  │                                            │
  └────────────────────────────────────────────┘
  
  ┌─ EMAIL TYPE CONTROLS ──────────────────────┐
  │                                            │
  │ enablePasswordResetEmails (Boolean)       │
  │ ├─ Default: true                          │
  │ └─ Controls: Forgot password emails       │
  │                                            │
  │ enableOtpEmails (Boolean)                 │
  │ ├─ Default: true                          │
  │ └─ Controls: OTP/2FA emails               │
  │                                            │
  │ enableDocumentNotificationEmails (Boolean)│
  │ ├─ Default: true                          │
  │ └─ Controls: Doc approved/rejected emails │
  │                                            │
  │ enableAnnouncementEmails (Boolean)        │
  │ ├─ Default: true                          │
  │ └─ Controls: Admin announcements          │
  │                                            │
  │ enableAnnouncementBcc (Boolean)           │
  │ ├─ Default: true                          │
  │ └─ Controls: BCC mode (true) vs individual│
  │                                            │
  └────────────────────────────────────────────┘
  
  ┌─ BEHAVIOR CONFIGURATION ───────────────────┐
  │                                            │
  │ recipientEmailsPerBatch (Number)          │
  │ ├─ Default: 100                           │
  │ └─ Purpose: Batch size for announcements  │
  │                                            │
  │ retryFailedEmails (Boolean)               │
  │ ├─ Default: true                          │
  │ └─ Purpose: Enable retry on failure       │
  │                                            │
  │ retryAttempts (Number)                    │
  │ ├─ Default: 3                             │
  │ └─ Purpose: Max retry attempts            │
  │                                            │
  │ retryDelayMinutes (Number)                │
  │ ├─ Default: 5                             │
  │ └─ Purpose: Wait time between retries     │
  │                                            │
  └────────────────────────────────────────────┘
}
```

---

## Admin Action Flow

```
┌──────────────────────────┐
│  ADMIN DECISION          │
│  (What to change?)       │
└────────────┬─────────────┘
             │
    ┌────────┴────────────────────────────┐
    │                                     │
    ↓                                     ↓
┌────────────────┐              ┌──────────────────┐
│ Emergency:     │              │ Maintenance:     │
│ Disable ALL    │              │ Disable specific │
│                │              │ type             │
│ PATCH /api/    │              │                  │
│ settings/email │              │ PATCH /api/      │
│ {              │              │ settings/email   │
│  "enabled":    │              │ {                │
│  false         │              │  "enable...":    │
│ }              │              │  false           │
│                │              │ }                │
└────────┬───────┘              └────────┬─────────┘
         │                               │
         └───────────────┬───────────────┘
                         │
                         ↓
                 ┌──────────────────────┐
                 │ settingsRoutes.js    │
                 │ PATCH endpoint       │
                 │ 1. Validate auth     │
                 │ 2. Validate data     │
                 │ 3. Update MongoDB    │
                 │ 4. Log to AuditLog   │
                 │ 5. Return result     │
                 └──────────┬───────────┘
                            │
                            ↓
                 ┌──────────────────────┐
                 │ Admin sees response  │
                 │ {                    │
                 │   success: true,     │
                 │   changes: {...}     │
                 │ }                    │
                 └──────────┬───────────┘
                            │
                            ↓
            ┌───────────────────────────────┐
            │ Settings take effect          │
            │ (NO RESTART NEEDED!)          │
            │                               │
            │ Next email send will check    │
            │ new settings automatically    │
            └──────────────┬────────────────┘
                           │
                           ↓
            ┌──────────────────────────────┐
            │ Admin can monitor results:   │
            │                              │
            │ 1. Check email logs:         │
            │    GET /api/admin/email-logs │
            │    → See sent/skipped status │
            │                              │
            │ 2. Check audit trail:        │
            │    GET /api/admin/audit-logs │
            │    → See all changes made    │
            │                              │
            │ 3. Verify in action:         │
            │    Send test email           │
            │    → Confirm behavior        │
            └──────────────────────────────┘
```

---

## Production Deployment Diagram

```
┌─────────────────────────────────────────────────────────┐
│              PRODUCTION DEPLOYMENT                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ✅ Tested: TypeScript builds successfully            │
│  ✅ Secure: Admin-only endpoints                      │
│  ✅ Documented: 6 comprehensive guides                │
│  ✅ Compatible: No breaking changes                   │
│  ✅ Reliable: Comprehensive error handling            │
│  ✅ Auditable: Complete audit trail                   │
│                                                         │
│  DEPLOYMENT STEPS:                                     │
│  1. npm run build              ← Verify compilation   │
│  2. Deploy code to server                             │
│  3. Restart application                               │
│  4. Test GET /api/settings/email                      │
│  5. Test PATCH /api/settings/email                    │
│  6. Monitor /api/admin/email-logs                     │
│  7. Go live!                                          │
│                                                         │
│  ZERO DOWNTIME UPDATES:                              │
│  After deployment, admin can change email behavior    │
│  without any restart or redeployment:                │
│  - Just call PATCH /api/settings/email                │
│  - Settings take effect immediately                   │
│  - No interruption to service                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Documentation Quick Links

```
┌─────────────────────────────────────────────┐
│        FIND THE RIGHT DOCUMENTATION         │
├─────────────────────────────────────────────┤
│                                             │
│  👤 I'm an Administrator:                   │
│  → EMAIL_SETTINGS_ADMIN_GUIDE.md            │
│     • How to use the API                    │
│     • Common tasks                          │
│     • Troubleshooting                       │
│                                             │
│  👨‍💻 I'm a Developer:                       │
│  → EMAIL_SETTINGS_IMPLEMENTATION.md         │
│     • Technical details                     │
│     • Code structure                        │
│     • Integration points                    │
│                                             │
│  🏛️  I'm an Architect:                      │
│  → EMAIL_SYSTEM_ARCHITECTURE.md             │
│     • System design                         │
│     • Data flows                            │
│     • Performance                           │
│                                             │
│  ✅ I Need to Verify Completion:            │
│  → EMAIL_SETTINGS_CHECKLIST.md              │
│     • Requirements verified                 │
│     • All items checked                     │
│     • Ready for QA                          │
│                                             │
│  📋 I Want a Summary:                       │
│  → EMAIL_SETTINGS_CHANGES_SUMMARY.md        │
│     • What changed                          │
│     • How it works                          │
│     • Examples                              │
│                                             │
│  🧭 I Need Navigation:                      │
│  → EMAIL_SETTINGS_INDEX.md                  │
│     • All guides linked                     │
│     • Quick start                           │
│     • Feature overview                      │
│                                             │
│  📊 This Document (Visual Overview):        │
│  → EMAIL_SETTINGS_VISUAL_GUIDE.md           │
│     • Architecture diagrams                 │
│     • Data flows                            │
│     • System components                     │
│                                             │
│  🎯 Final Status:                           │
│  → EMAIL_SETTINGS_FINAL_SUMMARY.md          │
│     • Complete summary                      │
│     • Status verification                   │
│     • Ready to deploy                       │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Summary

**Status**: ✅ **COMPLETE**

**Visual Overview Provided**:
- System architecture diagram
- Data flow examples  
- Component relationships
- Settings schema
- Admin action flow
- Production deployment plan
- Documentation navigation

**Key Insight**: All admin controls are API-based. No code changes needed to modify email behavior. Settings take effect immediately without server restart.

**Next Step**: Build admin UI that calls the provided API endpoints to make settings management even more user-friendly!
