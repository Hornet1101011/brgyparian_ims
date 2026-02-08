# System Settings Complete Documentation

## Overview

The System Settings system is a comprehensive configuration management module for the Barangay Information System. It handles all administrative configurations including barangay information, email provider settings, email behavior controls, officials management, and system-wide policies.

**Last Updated:** February 8, 2026  
**Version:** 2.0 (Unified Email Provider Architecture)  
**Architecture:** React 18 Frontend + Express.js Backend with MongoDB

---

## Table of Contents

1. [Frontend Components](#frontend-components)
2. [Backend Routes & APIs](#backend-routes--apis)
3. [Email System](#email-system)
4. [Officials Management](#officials-management)
5. [Data Models](#data-models)
6. [Key Functions](#key-functions)
7. [State Management](#state-management)
8. [Error Handling](#error-handling)
9. [Security Considerations](#security-considerations)

---

## Frontend Components

### 1. Main Component: `SystemSettings.tsx`

**Location:** `/client/src/components/admin/SystemSettings.tsx`

**Purpose:** Master settings management component that renders all system configuration sections and handles form state, saving, and persistence.

#### State Variables:

| State | Type | Purpose |
|-------|------|---------|
| `settings` | `SystemSettingsData` | Basic system settings (site name, barangay info, contact details, policies) |
| `loading` | `boolean` | Indicates if settings are being loaded from backend |
| `saving` | `boolean` | Indicates if save operation is in progress |
| `emailSettings` | `EmailSettings` | Email sending behavior configuration (enable/disable per type) |
| `emailProviderConfig` | `object` | Unified email provider configuration (provider, credentials, sender info) |
| `gmailSettings` | `object` | Gmail-specific settings captured from GmailSettings component |
| `officials` | `Official[]` | Array of barangay officials with photos and ordering |
| `officialsLoading` | `boolean` | Indicates if officials are being loaded |
| `savingOfficials` | `boolean` | Indicates if officials are being saved |
| `confirmDisableOpen` | `boolean` | Controls confirmation dialog for disabling verifications |
| `manualSaveError` | `string \| null` | Error message from manual save operation |
| `highlightedIds` | `string[]` | IDs of officials to highlight (for UX feedback) |
| `dirty` | `boolean` | Indicates if current settings differ from original |

#### Core Functions:

##### `fetchSettings(signal?: AbortSignal)`
- **Purpose:** Load system settings and officials from backend
- **Behavior:**
  - Uses `adminAPI.getSystemSettings()` with fallback to `axiosInstance`
  - Maps backend SMTP field to unified `emailProviderConfig` state
  - Detects provider type (gmail or custom) and maps fields accordingly
  - Passwords never populated from backend (security)
  - Loads officials from `adminAPI.getOfficials()` or fallback
- **Handles:**
  - AbortSignal for cleanup on unmount
  - Fallback when adminAPI fails
  - Safe defaults for missing data
- **Logging:** Extensive debug logs for SMTP field mapping

##### `performSave()`
- **Purpose:** Internal API call to save all settings to backend
- **Payload Structure:**
  ```javascript
  {
    siteName,
    barangayName,
    barangayAddress,
    contactEmail,
    contactPhone,
    systemNotice,
    maintenanceMode,
    allowRegistrations,
    maxDocumentRequestsPerUser,
    documentProcessingDays,
    enableVerifications,
    maxAccountsPerIP,
    emailSettings,
    email: emailProviderConfig  // UNIFIED EMAIL CONFIG PATH
  }
  ```
- **Field Mapping:** Client typo `maintainanceMode` → server `maintenanceMode`
- **Email Handling:** Complete `emailProviderConfig` sent to `/settings/email` endpoint
- **Post-Save Actions:**
  - Clears sensitive passwords from state
  - Records to original settings reference
  - Clears dirty flag
  - Shows success message
- **Error Handling:** Catches and reports via antdMessage

##### `handleSave()`
- **Purpose:** Public handler invoked by Save button
- **Verification Logic:**
  - Detects if `enableVerifications` toggled from true → false
  - Shows confirmation dialog to prevent accidental deletion
  - Calls `performSave()` after confirmation
- **Safety:** Prevents destructive cleanup without admin confirmation

##### `handleManualSaveOfficials()`
- **Purpose:** Fallback save for officials with auto-retry
- **Operations Per Official:**
  - If `_id` starts with 'new-': Creates new official
  - Otherwise: Updates existing official
- **Fallback Mechanism:**
  - If update fails, keeps local copy for retry
- **Refresh:** Fetches fresh officials list from server after save
- **Error Handling:** Sets `manualSaveError` state, shows message

##### `saveAll()`
- **Purpose:** Combined save for both settings and officials
- **Execution:** Sequential calls to `handleSave()` then `handleManualSaveOfficials()`
- **Used By:** Floating save button

#### Callback Functions:

- **`handleEmailConfigChange(config)`:** Captures email provider config from EmailSettings component
- **`handleGmailSettingsChange(emailConfig)`:** Captures Gmail config changes from GmailSettings component
- **`handleGmailStatusChange(enabled)`:** Tracks Gmail enable/disable status
- **`handleDeleteOfficial(id)`:** Deletes official from database and updates UI
- **`onAddOfficial()`:** Creates new temporary official with `_id` like `new-{timestamp}`

#### Effects:

1. **Initial Load:** Fetches settings and officials on mount
2. **Preview URL Scroll:** Scrolls preview container when new officials added
3. **New Official Highlighting:** Highlights newly added officials for 2.5 seconds
4. **Dirty Flag:** Compares current settings to original, sets dirty flag if changed

---

### 2. Component: `EmailSettings.tsx`

**Location:** `/client/src/components/admin/EmailSettings.tsx`

**Purpose:** Basic email provider selection and global sender information configuration. Renders ONLY common fields needed across all providers.

#### Props:
```typescript
interface Props {
  onConfigChange?: (config: EmailConfig) => void;
}
```

#### Features:

1. **Enable Email Sending:** Master checkbox to enable/disable email functionality
2. **Email Provider Dropdown:** Select from:
   - Custom SMTP
   - Gmail
   - Mailtrap
   - SendGrid
   - AWS SES
3. **Sender Information:**
   - From Name (defaults to "Barangay System")
   - From Email (required for email to work)
4. **Conditional UI:** Info alert when email enabled
5. **Provider-Specific Config Note:** Alert explains where provider-specific fields are configured

#### State:
- `config`: EmailConfig object with `enabled`, `provider`, `fromName`, `fromEmail`
- `providers`: Array of available email providers

#### Functions:
- **`loadProviders()`:** Fetches available providers from `/settings/email/providers`
- **`handleConfigChange(field, value)`:** Updates config and notifies parent via callback

#### Rendering:
- Material-UI Card with CardHeader
- Styled TextField for From Name and Email
- Material-UI Select for provider dropdown
- Informational alerts with guidance text

---

### 3. Component: `CustomSmtpSettings.tsx`

**Location:** `/client/src/components/admin/CustomSmtpSettings.tsx`

**Purpose:** Advanced SMTP configuration component. Handles all custom SMTP fields and test email functionality for SMTP provider.

#### Props:
```typescript
interface Props {
  emailConfig: EmailConfig;
  setEmailConfig: (config: EmailConfig) => void;
}
```

#### Features:

1. **Enable Toggle:** Enables/disables custom SMTP configuration section
2. **SMTP Server Settings:**
   - Host (server address)
   - Port (1-65535 validation)
   - Username
   - Password (masked input with visibility toggle)
3. **Security Settings:**
   - TLS/SSL Toggle (changes port behavior)
4. **Test Email Section:**
   - Recipient email input (optional, defaults to fromEmail)
   - Send Test Email button with loading state
   - Success/error feedback

#### Key Functions:

##### `handleTestSmtpConnection()`
- **Validation:**
  - Host and port must be configured
  - Username required if password set
  - Test email address must be valid
- **Request Body:**
  ```javascript
  {
    testEmail: recipientEmail,
    senderName: emailConfig.fromName,
    fromEmail: emailConfig.fromEmail
  }
  ```
- **Endpoint:** `POST /settings/email/test`
- **Success:** Shows success message, clears test email input
- **Error:** Shows detailed error with hints from backend

#### State:
- `showPassword`: Controls password visibility
- `testing`: Loading state during test
- `testEmailAddress`: Input for test recipient email
- `passwordSavedBefore`: Tracks if password was previously saved

#### Rendering:
- Material-UI Paper card with section title "Advanced SMTP Configuration"
- Styled TextField components for all inputs
- FormControlLabel switches for configuration toggles
- Test Email UI with loading button

---

### 4. Component: `GmailSettings.tsx`

**Location:** `/client/src/components/admin/GmailSettings.tsx`

**Purpose:** Gmail-specific configuration component. Handles Gmail address, app password, and test email functionality.

#### Props:
```typescript
interface Props {
  onGmailStatusChange?: (enabled: boolean) => void;
  onEmailConfigChange?: (config: any) => void;
}
```

#### Features:

1. **Gmail Address Input:** Validates @gmail.com domain
2. **App Password Input:** Masked input with visibility toggle
3. **Connection Test Section:**
   - Test email recipient input
   - Send Test Email button with loading state
4. **Gmail Connection Verification:** Via `handleTestGmailConnection()`

#### Key Functions:

##### `handleTestGmailConnection()`
- **Request Body:**
  ```javascript
  {
    testEmail: recipientEmail,
    fromEmail: gmailAddress,
    senderName: displayName
  }
  ```
- **Endpoint:** `POST /settings/gmail/test` or `POST /settings/email/test` (unified)
- **Password Handling:** Uses password from database ONLY (not from request body)
- **Error Handling:** Detailed error messages with hints for common issues

#### Rendering:
- Material-UI Paper card
- Email input field with @gmail.com validation
- Password input with visibility toggle
- Test email UI
- Connection status display

---

### 5. Nested Sub-Component: `OfficialsReorder.tsx`

**Location:** `/client/src/components/admin/OfficialsReorder.tsx`

**Purpose:** Drag-and-drop reordering, photo upload, and management of barangay officials.

#### Props:
```typescript
interface Props {
  officials: Official[];
  onOfficialUpdate: (officials: Official[]) => void;
  onAddOfficial: () => void;
  onDeleteOfficial: (id: string) => void;
  officialsLoading: boolean;
  savingOfficials: boolean;
  autoSaveTimers: React.MutableRefObject<Record<string, number>>;
  onNameChange: (id: string, value: string) => void;
  onTitleChange: (id: string, value: string) => void;
  onTermChange: (id: string, value: string) => void;
  previewUrlsRef: React.MutableRefObject<Record<string, string>>;
  manualSaveError: string | null;
}
```

#### Features:

1. **Drag-and-Drop Reordering:** Using React Sortable
2. **Photo Upload:** Upload and preview official photos
3. **Name, Title, Term Editing:** Text inputs for official info
4. **Auto-Save:** Debounced save on field change
5. **Manual Save Button:** Fallback save for officials
6. **Delete Official:** With API call to backend

#### Rendering:
- List of official items with drag handles
- Input fields for name, title, term
- Photo upload button and preview
- Delete button per official
- Add Official button

---

## Backend Routes & APIs

### Base Path: `/api/settings` or `/admin/settings`

All routes require `requireAuth` and `isAdmin` middleware unless noted otherwise.

---

### 1. **GET /api/settings** (or `/admin/settings`)

**Purpose:** Retrieve all system settings

**Authentication:** Required (Admin only)

**Response:**
```json
{
  "siteName": "string",
  "barangayName": "string",
  "barangayAddress": "string",
  "contactEmail": "string",
  "contactPhone": "string",
  "systemNotice": "string",
  "maintainanceMode": "boolean",
  "allowNewRegistrations": "boolean",
  "requireEmailVerification": "boolean",
  "maxDocumentRequests": "number",
  "documentProcessingDays": "number",
  "allowMultipleAccountsPerIP": "boolean",
  "maxAccountsPerIP": "number",
  "enableVerifications": "boolean",
  "smtp": { /* sanitized SMTP config */ },
  "emailSettings": { /* email behavior config */ },
  "gmail": { /* Gmail config - passwords masked */ }
}
```

**Sanitization:**
- Passwords returned as `***MASKED***`
- Encrypted passwords not sent to client
- All non-sensitive fields included

---

### 2. **GET /api/settings/smtp-debug**

**Purpose:** Debug endpoint for admin to view SMTP configuration without passwords

**Authentication:** Required (Admin only)

**Response:**
```json
{
  "smtp": {
    "enabled": "boolean",
    "provider": "string",
    "host": "string",
    "port": "number",
    "user": "string",
    /* no password or encryptedPassword */
  }
}
```

---

### 3. **PUT /api/settings** (Full Upsert)

**Purpose:** Replace entire settings document

**Authentication:** Required (Admin only)

**Request Body:** Full settings object with all fields

**Validation:**
- Contact email format validation
- Numeric fields > 0
- Max accounts per IP > 0
- Document processing days > 0

**SMTP Password Handling:**
- If `payload.smtp.password` provided: Encrypted and stored as `encryptedPassword`
- If `payload.smtp.appPassword` provided: Encrypted
- Original `password` field deleted from payload

**Security Type Conversion:**
- `ssl` → `secure: true` (port 465)
- `tls` → `secure: false` (port 587, STARTTLS)
- `none` → `secure: false` (port 25)

**Post-Save Actions:**
1. Records audit log with before/after diff
2. Syncs public information to PublicView collection
3. If `enableVerifications` toggled false:
   - Deletes all pending verification requests
   - Deletes GridFS files for those requests
   - Sends SSE notifications to affected users

**Response:** Sanitized settings object

---

### 4. **PATCH /api/settings** (Partial Update)

**Purpose:** Partially update settings without replacing entire document

**Authentication:** Required (Admin only)

**Request Body:** Any subset of settings fields to update

**Special Handling:**

#### Email Provider Config (`payload.email`):
- Stored in `smtp` field (which persists reliably)
- All provider-specific fields saved (gmail, custom SMTP, etc.)
- Sanitized before MongoDB save (undefined properties removed)

#### Gmail Config (`payload.gmail`):
- Stored in `gmail` field
- App password stored as plain text
- Regular password stored as plain text
- Requires at least one password if enabling
- Each gmail field explicitly set in MongoDB $set operation

#### SMTP Config (`payload.smtp`, legacy):
- If `payload.email` not provided but `payload.smtp` is:
  - Validated against `smtpHelper.validateSMTPConfig()`
  - Passwords encrypted
  - `securityType` converted to `secure` boolean

**Validation:**
- Email config provider must be valid
- Custom SMTP: all required fields (host, port, user, password) must be present
- Gmail: address and app password required if enabled
- Port validation: 1-65535
- No _id fields allowed in payload (removed defensively)

**Explicit Field Setting:**
- Uses MongoDB `$set` operator
- Individual fields explicitly set for nested objects
- Ensures Mongoose saves all fields properly

**Response:** Sanitized updated settings

---

### 5. **POST /api/settings/test-smtp** (Legacy)

**Purpose:** Send test email using configured SMTP

**Authentication:** Required (Admin only)

**Request Body:**
```json
{
  "to": "test@example.com" /* optional, defaults to contactEmail */
}
```

**Validation:**
- SMTP must be configured (host required)
- Recipient email required

**Response:**
```json
{
  "success": true,
  "message": "Test email sent successfully"
}
```

---

### 6. **GET /api/settings/public** (Unauthenticated)

**Purpose:** Retrieve public-facing settings for login page

**Authentication:** Not required

**Response:**
```json
{
  "siteName": "string",
  "barangayName": "string",
  "barangayAddress": "string",
  "contactEmail": "string",
  "contactPhone": "string",
  "systemNotice": "string"
}
```

**Optimization:**
- Fetches from PublicView collection cache when available
- Falls back to SystemSetting if cache missing
- Auto-creates PublicView cache on first fetch
- No sensitive data exposed

---

### 7. **GET /api/settings/public/barangay-info** (Unauthenticated)

**Purpose:** Return barangay information as carousel items

**Authentication:** Not required

**Response:**
```json
[
  {
    "_id": "site-name",
    "label": "System Name",
    "value": "string",
    "icon": "home",
    "type": "barangay-info"
  },
  {
    "_id": "barangay-name",
    "label": "Barangay Name",
    "value": "string",
    "icon": "environment",
    "type": "barangay-info"
  },
  /* ... more items ... */
]
```

---

### 8. **GET /api/settings/public/contact-info** (Unauthenticated)

**Purpose:** Return contact information as carousel items with validation

**Authentication:** Not required

**Validation:**
- Email format: `^[^\s@]+@[^\s@]+\.[^\s@]+$`
- Phone format: 7+ digits (allows spaces, dashes, parens, +)

**Response:**
```json
[
  {
    "_id": "contact-email",
    "label": "Email Address",
    "value": "string",
    "icon": "mail",
    "type": "contact-info",
    "contactType": "email",
    "link": "mailto:..."
  },
  {
    "_id": "contact-phone",
    "label": "Phone Number",
    "value": "string",
    "icon": "phone",
    "type": "contact-info",
    "contactType": "phone",
    "link": "tel:..."
  }
]
```

**Note:** Invalid contact info (wrong format) not included in response

---

## Email System

### 1. **Email Settings Control** (`EmailSettings` state/config)

Controls automatic sending of different email types:

| Setting | Default | Purpose |
|---------|---------|---------|
| `enabled` | `true` | Master switch for all email sending |
| `enablePasswordResetEmails` | `true` | Password reset request emails |
| `enableOtpEmails` | `true` | 2FA/OTP verification emails |
| `enableDocumentNotificationEmails` | `true` | Document approval/rejection emails |
| `enableAnnouncementEmails` | `true` | System announcements to residents |
| `enableAnnouncementBcc` | `true` | Use BCC for announcements (privacy) |
| `recipientEmailsPerBatch` | `100` | Max recipients per batch send |
| `retryFailedEmails` | `true` | Retry failed email sends |
| `retryAttempts` | `3` | Number of retry attempts |
| `retryDelayMinutes` | `5` | Minutes between retries |

---

### 2. **Email Provider Configuration** (Unified `emailProviderConfig`)

#### Provider Types:

##### **Custom SMTP**
```javascript
{
  enabled: true,
  provider: 'custom',
  fromName: 'Barangay System',
  fromEmail: 'noreply@example.com',
  host: 'smtp.example.com',
  port: 587,
  user: 'username',
  password: 'encrypted_password',
  secure: false  // TLS/SSL setting
}
```

##### **Gmail**
```javascript
{
  enabled: true,
  provider: 'gmail',
  fromName: 'Barangay System',
  fromEmail: 'admin@gmail.com',
  gmailAddress: 'admin@gmail.com',
  gmailAppPassword: 'plain_text_app_password'
}
```

##### **Mailtrap**
```javascript
{
  enabled: true,
  provider: 'mailtrap',
  fromName: 'Barangay System',
  fromEmail: 'noreply@example.com',
  user: 'mailtrap_username',
  password: 'mailtrap_password'
}
```

##### **SendGrid**
```javascript
{
  enabled: true,
  provider: 'sendgrid',
  fromName: 'Barangay System',
  fromEmail: 'noreply@example.com',
  sendgridApiKey: 'SG.xxx...'
}
```

##### **AWS SES**
```javascript
{
  enabled: true,
  provider: 'aws-ses',
  fromName: 'Barangay System',
  fromEmail: 'noreply@example.com',
  awsAccessKeyId: 'AKIA...',
  awsSecretAccessKey: 'xxx...',
  awsRegion: 'us-east-1'
}
```

---

### 3. **Email Provider Routes**

#### **GET /api/settings/email/providers**

Returns list of available email providers.

**Response:**
```json
{
  "success": true,
  "providers": [
    { "id": "custom", "name": "Custom SMTP" },
    { "id": "gmail", "name": "Gmail" },
    { "id": "mailtrap", "name": "Mailtrap" },
    { "id": "sendgrid", "name": "SendGrid" },
    { "id": "aws-ses", "name": "AWS SES" }
  ]
}
```

---

#### **GET /api/settings/email**

Get current email configuration.

**Response:**
```json
{
  "success": true,
  "email": {
    /* sanitized email provider config with passwords masked */
  }
}
```

---

#### **PATCH /api/settings/email**

Update email provider configuration.

**Request Body:**
```json
{
  "enabled": true,
  "provider": "custom",
  "fromName": "string",
  "fromEmail": "string",
  
  /* Custom SMTP fields */
  "host": "string",
  "port": "number",
  "secure": "boolean",
  "user": "string",
  "password": "string",
  
  /* Gmail fields */
  "gmailAddress": "string",
  "gmailAppPassword": "string",
  
  /* Mailtrap fields */
  /* (user, password already listed above) */
  
  /* SendGrid fields */
  "sendgridApiKey": "string",
  
  /* AWS SES fields */
  "awsAccessKeyId": "string",
  "awsSecretAccessKey": "string",
  "awsRegion": "string"
}
```

**Validation Per Provider:**

- **Custom SMTP:** host, port (1-65535), user, password all required
- **Gmail:** gmailAddress (must be @gmail.com), gmailAppPassword required
- **Mailtrap:** user, password required
- **SendGrid:** sendgridApiKey required
- **AWS SES:** awsAccessKeyId, awsSecretAccessKey required

**Response:**
```json
{
  "success": true,
  "message": "Email settings updated",
  "email": { /* sanitized config */ }
}
```

---

#### **POST /api/settings/email/test**

Test email provider configuration.

**Request Body:**
```json
{
  "testEmail": "recipient@example.com",
  "emailConfig": { /* optional, uses DB config if omitted */ }
}
```

**Validation:**
- testEmail must be valid email address
- emailConfig must be enabled and have provider selected
- Provider-specific fields must be configured

**Response:**
```json
{
  "success": true,
  "message": "Test email sent successfully",
  "provider": "custom",
  "messageId": "string"
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Custom SMTP test failed",
  "error": "Connection refused",
  "provider": "custom"
}
```

---

### 4. **Gmail Configuration Routes** (Legacy/Deprecated)

#### **GET /api/settings/gmail**

Get Gmail configuration (sanitized).

#### **PATCH /api/settings/gmail**

Update Gmail configuration separately.

#### **POST /api/settings/gmail/test**

Test Gmail connection.

**Note:** These routes are now superseded by unified email provider routes but maintained for backward compatibility.

---

### 5. **Email Behavior Control Routes**

#### **GET /api/settings/email** (Email Settings)

Get email behavior settings.

**Response:**
```json
{
  "enabled": "boolean",
  "enablePasswordResetEmails": "boolean",
  "enableOtpEmails": "boolean",
  /* ... other email settings ... */
}
```

---

#### **PATCH /api/settings/email** (Email Settings)

Update email behavior settings.

**Request Body:** Any subset of email settings fields

**Validation:**
- `recipientEmailsPerBatch` > 0
- `retryAttempts` >= 0
- `retryDelayMinutes` > 0

**Fields Updated with `emailSettings.` prefix:**
```javascript
{
  "emailSettings.enabled": true,
  "emailSettings.enablePasswordResetEmails": true,
  /* ... */
}
```

---

## Officials Management

### Backend Routes

#### **GET /admin/officials**

Get all barangay officials.

**Response:**
```json
[
  {
    "_id": "ObjectId",
    "name": "string",
    "title": "string",
    "term": "string",
    "photoUrl": "string",
    "displayOrder": "number"
  }
]
```

---

#### **POST /admin/officials**

Create new official.

**Request Body:**
```json
{
  "name": "string",
  "title": "string",
  "term": "string"
}
```

**Response:** Created official object with `_id`

---

#### **PUT /admin/officials/:id** or **PATCH /admin/officials/:id**

Update existing official.

**Request Body:**
```json
{
  "name": "string",
  "title": "string",
  "term": "string"
}
```

**Response:** Updated official object

---

#### **DELETE /admin/officials/:id**

Delete official.

**Response:**
```json
{
  "message": "Official deleted"
}
```

---

#### **POST /admin/officials/:id/photo**

Upload official photo.

**Request:** FormData with `photo` file

**Response:**
```json
{
  "_id": "ObjectId",
  "photoUrl": "string",
  /* ... official data ... */
}
```

---

### Frontend Officials Management

**Component:** `OfficialsReorder.tsx`

**Features:**
1. **Drag-and-Drop Reordering:** Change display order
2. **Photo Upload:** Upload and preview photos
3. **Edit Fields:** Name, title, term inline
4. **Auto-Save:** Debounced save on field changes
5. **Manual Save:** Fallback button
6. **Delete:** Remove officials
7. **Highlight New:** Newly added officials highlighted briefly

**State Management:**
- Officials array managed in SystemSettings parent
- Changes propagated via callbacks
- Auto-save timers managed via ref to prevent cleanup issues

---

## Data Models

### **SystemSetting (MongoDB Schema)**

```javascript
{
  _id: ObjectId,
  
  // Barangay Information
  siteName: String,
  barangayName: String,
  barangayAddress: String,
  
  // Contact Information
  contactEmail: String,
  contactPhone: String,
  
  // System Policies
  maintainanceMode: Boolean,  // Note: Typo kept for backwards compatibility
  allowNewRegistrations: Boolean,
  requireEmailVerification: Boolean,
  maxDocumentRequests: Number,
  documentProcessingDays: Number,
  allowMultipleAccountsPerIP: Boolean,
  maxAccountsPerIP: Number,
  enableVerifications: Boolean,
  systemNotice: String,
  
  // Email Settings
  emailSettings: {
    enabled: Boolean,
    enablePasswordResetEmails: Boolean,
    enableOtpEmails: Boolean,
    enableDocumentNotificationEmails: Boolean,
    enableAnnouncementEmails: Boolean,
    enableAnnouncementBcc: Boolean,
    recipientEmailsPerBatch: Number,
    retryFailedEmails: Boolean,
    retryAttempts: Number,
    retryDelayMinutes: Number
  },
  
  // Email Provider Configuration (saved in smtp field)
  smtp: {
    enabled: Boolean,
    provider: String,  // 'custom', 'gmail', 'mailtrap', 'sendgrid', 'aws-ses'
    fromName: String,
    fromEmail: String,
    
    // Custom SMTP
    host: String,
    port: Number,
    user: String,
    password: String,
    encryptedPassword: String,
    secure: Boolean,
    
    // Gmail
    gmailAddress: String,
    gmailAppPassword: String,
    
    // Mailtrap
    // (uses user, password above)
    
    // SendGrid
    sendgridApiKey: String,
    
    // AWS SES
    awsAccessKeyId: String,
    awsSecretAccessKey: String,
    awsRegion: String,
    
    updatedAt: Date
  },
  
  // Gmail Config (legacy, maintained separately)
  gmail: {
    enabled: Boolean,
    gmailAddress: String,
    displayName: String,
    useAppPassword: Boolean,
    appPassword: String,
    password: String,
    updatedAt: Date
  },
  
  // Email Provider Config (legacy, may be deprecated)
  email: {
    enabled: Boolean,
    provider: String,
    /* ... fields ... */
  },
  
  createdAt: Date,
  updatedAt: Date
}
```

---

### **Official (MongoDB Schema)**

```javascript
{
  _id: ObjectId,
  name: String,
  title: String,
  term: String,
  photoUrl: String,       // URL to uploaded photo
  photoPath: String,      // File system path
  displayOrder: Number,   // For ordering
  createdAt: Date,
  updatedAt: Date
}
```

---

### **PublicView (MongoDB Schema - Cache)**

```javascript
{
  _id: ObjectId,
  siteName: String,
  barangayName: String,
  barangayAddress: String,
  contactEmail: String,
  contactPhone: String,
  systemNotice: String,
  isActive: Boolean,
  lastSyncedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

---

### **AuditLog (MongoDB Schema)**

```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  action: String,  // 'update_settings', 'patch_settings', 'gmail_config_updated', etc.
  details: Object, // Diff or change details
  ip: String,
  createdAt: Date
}
```

---

## Key Functions

### Frontend Utilities

#### **`handleConfigChange(field, value)`** (EmailSettings)
Updates email provider config field and notifies parent via callback.

#### **`handleTestSmtpConnection()`** (CustomSmtpSettings)
Validates SMTP config, sends test email to `/settings/email/test`, shows feedback.

#### **`handleTestGmailConnection()`** (GmailSettings)
Validates Gmail config, sends test email, shows feedback.

---

### Backend Utilities

#### **`sanitizeForClient(setting)`**
Removes passwords and sensitive data from settings object before sending to client.

#### **`validateSettingsPayload(body)`**
Validates numeric fields, email format, and ranges. Returns array of errors.

#### **`recordAudit(userId, action, details, ip)`**
Creates AuditLog entry for tracking admin actions.

#### **`syncToPublicView(systemSettings)`**
Copies public settings to PublicView collection for unauthenticated access cache.

#### **`removeUndefinedProperties(obj)`**
Recursively removes undefined/null properties from objects before MongoDB save.

#### **`validateProviderConfig(config)`**
Validates provider-specific required fields. Returns error object if validation fails.

---

## State Management

### Frontend State Flow

1. **Initialization:**
   - `fetchSettings()` → Backend `/settings`
   - Maps response to `settings`, `emailProviderConfig`, `gmailSettings`, `officials`

2. **User Edits:**
   - User changes field → state updates via `setSettings()`, `setEmailSettings()`, etc.
   - Dirty flag computed via useEffect comparing to original

3. **Provider Selection:**
   - User selects provider → `handleEmailConfigChange()` called
   - If `provider === 'custom'`: `CustomSmtpSettings` conditionally renders
   - If `provider === 'gmail'`: `GmailSettings` conditionally renders

4. **Save:**
   - User clicks floating save button → `saveAll()`
   - `handleSave()` → `performSave()` → `adminAPI.updateSystemSettings(payload)`
   - Payload includes complete `emailProviderConfig` with unified save path

5. **Component Communication:**
   - Parent (SystemSettings) owns state
   - Child components (EmailSettings, CustomSmtpSettings, GmailSettings) use callbacks
   - No direct state mutations between siblings

---

## Error Handling

### Frontend Error Handling

1. **Load Errors:**
   - Try adminAPI, fallback to axiosInstance
   - Show error message via antdMessage.error()
   - Set error state

2. **Save Errors:**
   - Catch in performSave()
   - Show error message
   - Log to console

3. **Validation Errors:**
   - Show in component UI (disabled buttons, helper text)
   - Backend validates and returns error details

4. **Test Email Errors:**
   - Show detailed error with hints
   - Suggests actions based on error type

---

### Backend Error Handling

1. **400 Bad Request:**
   - Invalid input (validation failed)
   - Missing required fields
   - Invalid email provider
   - Port out of range

2. **500 Internal Server Error:**
   - Database operation failed
   - Encryption/decryption failed
   - SMTP connection failed
   - Email sending failed

3. **Error Response Format:**
```json
{
  "success": false,
  "message": "Human-readable error message",
  "error": "Detailed error description",
  "missingFields": ["field1", "field2"],  /* optional */
  "field": "fieldName"  /* optional, if specific field error */
}
```

---

## Security Considerations

### Password Security

1. **Never Sent to Client:**
   - Backend never returns passwords to client
   - Only encrypted/masked versions sent
   - Client uses values from request body for testing

2. **Encryption at Rest:**
   - SMTP passwords encrypted before MongoDB save
   - Encryption key from `SETTINGS_ENCRYPTION_KEY` env var
   - Uses crypto utilities for encryption/decryption

3. **Test Email Passwords:**
   - Test endpoint uses passwords ONLY from database
   - Does NOT accept passwords in request body for security
   - Falls back to stored password if none in request

4. **Plain Text Passwords:**
   - Gmail app passwords stored as plain text (acceptable for stored credentials)
   - Regular passwords stored as plain text
   - Should ideally be encrypted (future enhancement)

---

### Authorization

1. **All Admin Endpoints Require:**
   - `requireAuth` middleware (must be logged in)
   - `isAdmin` middleware (user.isAdmin === true)

2. **Public Endpoints (No Auth):**
   - `/api/settings/public`
   - `/api/settings/public/barangay-info`
   - `/api/settings/public/contact-info`

3. **Audit Trail:**
   - All admin changes logged with user ID and timestamp
   - Admin can review changes via audit logs

---

### Data Validation

1. **Email Validation:**
   - Format: `^[^\s@]+@[^\s@]+\.[^\s@]+$`
   - Phone format: 7+ digits

2. **Numeric Validation:**
   - All numeric fields must be > 0
   - Port must be 1-65535
   - Max accounts per IP must be 1-100

3. **SMTP Port Validation:**
   - Common ports: 25 (plain), 587 (STARTTLS), 465 (SSL)
   - Allowed range: 1-65535

4. **Payload Sanitization:**
   - All _id fields removed defensively
   - Undefined properties removed before save
   - Only expected fields processed

---

### Destructive Operations

1. **Disabling Verifications:**
   - Confirmation dialog required
   - Permanently deletes pending requests
   - Deletes uploaded files from GridFS
   - Users notified via SSE

2. **Audit Trail:**
   - Before/after diff recorded
   - Admin ID and timestamp tracked
   - Reversal requires admin to re-enable

---

## Configuration Environment Variables

Required for production deployment:

```bash
# Email encryption
SETTINGS_ENCRYPTION_KEY=<32-char-minimum-key>

# Gmail configuration
GMAIL_CLIENT_ID=<client-id>
GMAIL_CLIENT_SECRET=<client-secret>
GMAIL_REDIRECT_URI=<redirect-uri>

# SendGrid (if using SendGrid provider)
SENDGRID_API_KEY=<api-key>

# AWS (if using SES provider)
AWS_ACCESS_KEY_ID=<key>
AWS_SECRET_ACCESS_KEY=<key>
AWS_REGION=<region>

# MongoDB
MONGODB_URI=<connection-string>
```

---

## Testing Checklist

- [ ] Load settings page, verify all fields populate from DB
- [ ] Edit basic settings (site name, barangay info), save, reload to verify persistence
- [ ] Change email provider from custom → gmail → mailtrap, verify fields change
- [ ] Configure custom SMTP, test email connection, verify success/error message
- [ ] Configure Gmail, test email connection, verify app password used
- [ ] Send test email to different recipient, verify arrives
- [ ] Disable email sending, verify master switch disables all email types
- [ ] Enable email sending with validation disabled, verify toggle works
- [ ] Edit officials, verify auto-save and manual save both work
- [ ] Reorder officials, verify display order persists
- [ ] Upload official photo, verify preview and upload success
- [ ] Delete official, verify deletion and UI update
- [ ] Add new official, verify highlighted briefly and saved
- [ ] Enable verification then disable, verify confirmation dialog and cleanup
- [ ] Refresh page mid-edit, verify save not triggered unexpectedly
- [ ] Test with incomplete config (missing required fields), verify validation errors
- [ ] Logout and view public settings, verify only public data shown
- [ ] Check audit logs for all admin actions, verify proper tracking

---

## Performance Optimizations

1. **PublicView Cache:** Unauthenticated public endpoint uses cached data instead of querying SystemSetting each time

2. **Debounced Officials Save:** Auto-save on field change debounced to avoid excessive API calls

3. **Conditional Component Rendering:** Email config components render only when needed based on provider selection

4. **Lazy Loading:** Officials load separately from settings, don't block settings load

5. **Shallow Comparisons:** Dirty flag computed only when settings change

---

## Future Enhancements

1. **Password Encryption for Gmail:** Encrypt Gmail app passwords at rest (currently plain text)

2. **Email Queue & Retry Logic:** Implement queue for failed emails with automatic retry

3. **Email Template Management:** Admin UI to customize email templates

4. **Rate Limiting:** Limit email sends per minute/hour

5. **Email Logging:** Track all sent emails with delivery status

6. **Backup & Restore:** Settings backup/restore functionality

7. **Settings Versioning:** Track all historical setting changes

8. **Multi-Tenancy:** Support for multiple organizations

---

## References

- **Frontend:** React 18, Material-UI, Ant Design
- **Backend:** Express.js, Node.js 14+
- **Database:** MongoDB with Mongoose ODM
- **Security:** bcrypt for password hashing, crypto for encryption
- **Email:** Nodemailer for SMTP, Gmail API, SendGrid API, AWS SES

---

**Document Version:** 2.0  
**Last Updated:** February 8, 2026  
**Author:** Development Team  
**Status:** Production Ready
