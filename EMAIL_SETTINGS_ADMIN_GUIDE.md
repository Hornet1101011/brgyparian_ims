# Email Settings Admin Quick Reference

## API Endpoints

### Get Current Email Settings
```bash
GET /api/settings/email
```
**Authorization**: Admin only

**Response Example**:
```json
{
  "enabled": true,
  "enablePasswordResetEmails": true,
  "enableOtpEmails": true,
  "enableDocumentNotificationEmails": true,
  "enableAnnouncementEmails": true,
  "enableAnnouncementBcc": true,
  "recipientEmailsPerBatch": 100,
  "retryFailedEmails": true,
  "retryAttempts": 3,
  "retryDelayMinutes": 5
}
```

### Update Email Settings
```bash
PATCH /api/settings/email
```
**Authorization**: Admin only

**Request Body** (update any fields):
```json
{
  "enabled": true,
  "enablePasswordResetEmails": true,
  "enableOtpEmails": false,
  "enableDocumentNotificationEmails": true,
  "enableAnnouncementEmails": true,
  "enableAnnouncementBcc": true,
  "recipientEmailsPerBatch": 100,
  "retryFailedEmails": true,
  "retryAttempts": 3,
  "retryDelayMinutes": 5
}
```

## Common Admin Tasks

### 1. Disable All Emails (Emergency)
```json
{
  "enabled": false
}
```

### 2. Disable Password Reset Emails
```json
{
  "enablePasswordResetEmails": false
}
```

### 3. Disable OTP Emails
```json
{
  "enableOtpEmails": false
}
```

### 4. Disable Announcements
```json
{
  "enableAnnouncementEmails": false
}
```

### 5. Disable Document Notifications
```json
{
  "enableDocumentNotificationEmails": false
}
```

### 6. Send Announcements as Individual Emails (Not BCC)
```json
{
  "enableAnnouncementBcc": false
}
```

### 7. Change Announcement Batch Size
```json
{
  "recipientEmailsPerBatch": 50
}
```

## Email Types Explanation

| Email Type | Used When | Default |
|---|---|---|
| **Password Reset** | User requests password reset | ✅ Enabled |
| **OTP** | User tries to login or auth with OTP | ✅ Enabled |
| **Document Notification** | Admin approves/rejects document request | ✅ Enabled |
| **Announcement** | Admin posts announcement to residents | ✅ Enabled |

## Setting Explanation

| Setting | Description | Default |
|---|---|---|
| **enabled** | Master on/off switch for all emails | true |
| **enablePasswordResetEmails** | Allow password reset emails | true |
| **enableOtpEmails** | Allow OTP authentication emails | true |
| **enableDocumentNotificationEmails** | Allow document approval/rejection emails | true |
| **enableAnnouncementEmails** | Allow announcement emails | true |
| **enableAnnouncementBcc** | Send announcements via BCC (privacy) or individual emails | true |
| **recipientEmailsPerBatch** | Max recipients per batch (for future batching) | 100 |
| **retryFailedEmails** | Retry failed emails automatically | true |
| **retryAttempts** | Number of retry attempts | 3 |
| **retryDelayMinutes** | Delay between retry attempts | 5 |

## Monitoring Email Activity

### Check Email Log
View all emails sent/failed in the system:
```bash
GET /api/admin/email-logs
```

### Filter by Status
```bash
GET /api/admin/email-logs?status=sent
GET /api/admin/email-logs?status=failed
GET /api/admin/email-logs?status=skipped
```

### Check Audit Trail
View all settings changes:
```bash
GET /api/admin/audit-logs
```

## Validation Rules

When updating settings:
- `recipientEmailsPerBatch` must be > 0
- `retryAttempts` must be >= 0
- `retryDelayMinutes` must be > 0
- All boolean fields accept `true` or `false`

## Examples

### Disable OTP emails during maintenance
```bash
curl -X PATCH http://localhost:5000/api/settings/email \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enableOtpEmails": false}'
```

### Re-enable all emails after maintenance
```bash
curl -X PATCH http://localhost:5000/api/settings/email \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

### Increase announcement batch size to 200
```bash
curl -X PATCH http://localhost:5000/api/settings/email \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recipientEmailsPerBatch": 200}'
```

## What Happens When Email is Disabled?

When an admin disables an email type:

1. **Email is NOT sent** to recipients
2. **Activity is still logged** in EmailLog as "skipped"
3. **Audit trail is recorded** of the setting change
4. **User sees no error** - system fails gracefully
5. **Admin can re-enable anytime** - no code deployment needed

Example EmailLog entry for skipped email:
```json
{
  "recipient": "user@example.com",
  "subject": "Your password reset link",
  "status": "sent",
  "errorMessage": "Skipped: Email type disabled",
  "emailType": "password-reset",
  "dateSent": "2024-01-15T10:30:00Z"
}
```

## Troubleshooting

**Q: I disabled password reset emails but users can still request them?**
A: The reset request endpoint still works, but the email won't be sent. Users need to re-enable in settings.

**Q: Why are announcements showing as "skipped" in the log?**
A: Check if `enableAnnouncementEmails` is set to false. Also check if global `enabled` is false.

**Q: How do I see what changed in email settings?**
A: Check `/api/admin/audit-logs` for a history of all settings changes with before/after values.

**Q: Can I batch announcements to different groups?**
A: Not yet - currently all announcements go to all active residents. This is a planned enhancement.

## Best Practices

1. **Always keep password reset enabled** unless in emergency
2. **Test setting changes** with a test announcement before disabling
3. **Monitor email logs** for errors after changing settings
4. **Document changes** when disabling emails for maintenance
5. **Re-enable promptly** after maintenance window ends
