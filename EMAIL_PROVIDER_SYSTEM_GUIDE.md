# Email Provider System - Complete Implementation

## Overview
A comprehensive, multi-provider email system that supports Gmail, Mailtrap, SendGrid, AWS SES, and custom SMTP servers.

## Supported Email Providers

### 1. **Gmail**
- **Use Case**: For Gmail accounts, especially those with 2FA enabled
- **Required Fields**:
  - Gmail Address (your@gmail.com)
  - Gmail App Password (16-character app-specific password)
- **Configuration**:
  - Automatic SMTP configuration (smtp.gmail.com:587)
  - TLS security
- **Best For**: Small organizations, personal use, development environments

### 2. **Mailtrap**
- **Use Case**: Development and testing email without sending real emails
- **Required Fields**:
  - Username (from Mailtrap account)
  - Password (from Mailtrap credentials)
- **Configuration**:
  - SMTP: smtp.mailtrap.io:587
  - TLS security
  - All emails sent to Mailtrap inbox instead of real recipients
- **Best For**: Development, testing, staging environments

### 3. **SendGrid**
- **Use Case**: Professional email delivery at scale
- **Required Fields**:
  - SendGrid API Key (SG.xxx format, NOT a regular SendGrid API key)
- **Configuration**:
  - SMTP: smtp.sendgrid.net:587
  - TLS security
  - Username automatically set to "apikey"
- **Best For**: Production environments, high-volume sending, enterprise features
- **Important**: Must create an API key, not use regular account key

### 4. **AWS SES (Simple Email Service)**
- **Use Case**: AWS-based email delivery
- **Required Fields**:
  - AWS Access Key ID
  - AWS Secret Access Key
  - AWS Region (default: us-east-1)
- **Configuration**:
  - SMTP: email-smtp.{region}.amazonaws.com:587
  - TLS security
- **Prerequisites**:
  - IAM user with SES permissions
  - Verified sender email in AWS SES
  - Approve sender domain or email
- **Best For**: AWS-integrated applications, enterprise deployments

### 5. **Custom SMTP**
- **Use Case**: Any other SMTP server (Office365, Google Workspace, Postmark, etc.)
- **Required Fields**:
  - SMTP Host (smtp.example.com)
  - SMTP Port (typically 587 or 465)
  - Username
  - Password
  - Secure (checkbox for TLS/SSL)
- **Configuration**:
  - Fully customizable
  - Support for TLS (Port 587) and SSL (Port 465)
- **Best For**: Flexibility, migrating from other systems, specialized email providers

## Database Schema

### Email Configuration Document
```javascript
{
  enabled: Boolean,           // Master enable/disable
  provider: String,           // 'gmail' | 'mailtrap' | 'sendgrid' | 'aws-ses' | 'custom'
  
  // Common fields
  fromName: String,           // Sender name (e.g., "Barangay System")
  fromEmail: String,          // Sender email address
  
  // Gmail-specific
  gmailAddress: String,
  gmailAppPassword: String,
  
  // Mailtrap-specific
  user: String,               // Mailtrap username
  password: String,           // Mailtrap password
  
  // SendGrid-specific
  sendgridApiKey: String,
  
  // AWS SES-specific
  awsAccessKeyId: String,
  awsSecretAccessKey: String,
  awsRegion: String,
  
  // Custom SMTP-specific
  host: String,
  port: Number,
  secure: Boolean,            // TLS/SSL
  user: String,
  password: String,
  
  // Metadata
  createdAt: Date,
  updatedAt: Date,
  testEmailSent: Date,
  testEmailStatus: String     // 'success' | 'failed' | 'pending'
}
```

## API Endpoints

### GET `/api/settings/email/providers`
**Purpose**: Get list of available email providers
**Response**:
```json
{
  "success": true,
  "providers": [
    { "id": "gmail", "name": "Gmail", "fields": ["gmailAddress", "gmailAppPassword"] },
    { "id": "mailtrap", "name": "Mailtrap", "fields": ["user", "password"] },
    // ... more providers
  ]
}
```

### GET `/api/settings/email`
**Purpose**: Get current email configuration (sanitized, no passwords)
**Response**:
```json
{
  "success": true,
  "email": {
    "enabled": true,
    "provider": "gmail",
    "fromName": "Barangay System",
    "fromEmail": "noreply@example.com",
    "gmailAddress": "barangay@gmail.com"
  }
}
```

### PATCH `/api/settings/email`
**Purpose**: Update email configuration
**Request Body**: Full email config object with credentials
**Response**: Sanitized email config

### POST `/api/settings/email/test`
**Purpose**: Send test email to verify configuration
**Request Body**: `{ testEmail: "test@example.com" }`
**Response**:
```json
{
  "success": true,
  "message": "Test email sent successfully",
  "provider": "gmail",
  "messageId": "message-id-from-provider"
}
```

## Frontend Features

### Email Settings Component
- **Provider Selection**: Dropdown to choose email provider
- **Dynamic Fields**: Form fields change based on selected provider
- **From Information**: Set sender name and email globally
- **Password Security**:
  - Passwords masked by default
  - Show/hide toggle for each password field
  - Not displayed after save (security)
- **Test Email**: 
  - Enter recipient email
  - Send test email to verify configuration
  - Visual feedback on success/failure
- **Provider-Specific Help**: Inline help text for each provider with setup tips

## Frontend UI
Located in: `client/src/components/admin/EmailSettings.tsx`

Features:
- Material-UI Card component with Material Design
- Provider selection dropdown with descriptions
- Dynamic form fields based on provider
- Secure password visibility toggle
- Test email functionality
- Visual indicators for provider requirements
- Loading and saving states with spinners
- Error/success messages with Ant Design message system

## Backend Implementation

### Core Files
1. **Model**: `server/models/SystemSetting.js`
   - Enhanced SMTP schema with multi-provider support

2. **Helper**: `server/utils/emailProviderHelper.js`
   - Provider-specific transporter creation
   - Email sending logic for each provider
   - Password encryption/decryption
   - Sanitization for client

3. **Routes**: `server/routes/settingsRoutes.js`
   - New endpoints for email provider management
   - Validation for provider-specific requirements
   - Test email endpoint

## Setting Up Each Provider

### Gmail
1. Enable 2-Factor Authentication in Google Account
2. Create an App Password (not your regular password)
3. Copy the 16-character app password
4. Enter in Email Settings form

### Mailtrap
1. Sign up at https://mailtrap.io
2. Create a new inbox
3. Copy credentials from Mailtrap dashboard
4. Enter username and password

### SendGrid
1. Sign up at https://sendgrid.com
2. Create an API key (Settings > API Keys > Create API Key)
3. **Important**: Use the full API key (starts with SG.), not regular account key
4. Copy and paste into SendGrid API Key field

### AWS SES
1. Set up AWS Account and IAM user
2. Grant SES permissions to the IAM user
3. Verify your sender domain/email in SES console
4. Generate access key and secret key
5. Enter all three: Access Key, Secret Key, and Region

### Custom SMTP
1. Get SMTP details from your email provider
2. Typically includes: host, port, username, password
3. Determine if TLS (port 587) or SSL (port 465)
4. Enter all details in Custom SMTP section

## Security Considerations

✅ **Implemented**:
- Passwords not displayed after save
- Secure input fields (masked by default)
- Show/hide toggle for visibility
- Passwords can be encrypted in database (optional)
- Sensitive data not returned to frontend
- Admin-only access to email settings

⚠️ **Important**:
- Store API keys securely (use environment variables for production)
- Regenerate API keys periodically
- Never commit credentials to git
- Use application-specific passwords for Gmail (not your main password)

## Testing Email Configuration

1. Go to System Settings → Email Settings
2. Select your email provider
3. Fill in required credentials
4. Click "Save Settings"
5. Enter a test email address in "Test Configuration" section
6. Click "Send Test Email"
7. Check the recipient inbox for test email
8. Verify it shows provider name in subject (e.g., "GMAIL Configuration Test")

## Troubleshooting

| Provider | Common Issues | Solutions |
|----------|---------------|-----------|
| Gmail | "Invalid credentials" | Use 16-char App Password, not main password. Enable 2FA first. |
| Mailtrap | Emails not appearing | Check Mailtrap inbox in browser. Make sure credentials are correct. |
| SendGrid | "Invalid credentials" | Ensure using full API key (SG.xxx), not account key. Check key has mail send permission. |
| AWS SES | "Access denied" | Verify IAM user has SES permissions. Check sender email is verified in SES. |
| Custom SMTP | Connection timeout | Verify host and port are correct. Check firewall allows outbound SMTP. |

## Usage in Application

All email-sending functionality throughout the application now uses:
1. Check if email provider is enabled
2. Load provider configuration from database
3. Create appropriate transporter based on provider
4. Send email through transporter
5. Handle provider-specific errors

Example for future implementations:
```javascript
const emailConfig = await SystemSetting.findOne().select('email');
if (emailConfig.email.enabled) {
  const transporter = createEmailTransporter(emailConfig.email);
  await transporter.sendMail({ to, subject, html });
}
```

## Future Enhancements

- [ ] Multiple email provider fallback (primary + backup)
- [ ] Provider-specific templates
- [ ] Email logging and analytics
- [ ] Bounce/complaint handling
- [ ] Rate limiting per provider
- [ ] Scheduled email sending
- [ ] Email queue management
- [ ] Provider health monitoring

## Migration from Old System

If migrating from Gmail-only system:
1. Data is preserved in `gmail` field (backwards compatible)
2. New emails use `email` field with provider selection
3. No need to update existing Gmail configuration
4. Can coexist during transition period

---

**Last Updated**: February 7, 2026
**Status**: ✅ Complete and Deployed
