# System Settings Complete Documentation

## Overview

The System Settings system is a comprehensive configuration management module for the Barangay Information System. It handles all administrative configurations including barangay information, multi-provider email configuration, email behavior controls, officials management, and system-wide policies.

**Last Updated:** February 14, 2026  
**Version:** 3.0 (Multi-Provider Email Architecture with Dynamic Provider Routing)  
**Architecture:** React 18 Frontend + Express.js Backend with MongoDB  
**Key Features:** Simultaneous multi-provider configuration storage, dynamic provider selection, provider-specific validation, password dirty tracking

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

## What's New in Version 3.0

### Major Changes

1. **Multi-Provider Email Architecture** ✅
   - Support for simultaneous storage of three email providers: Mailtrap, SendGrid, Gmail
   - Database schema now includes `activeProvider` enum and nested provider objects
   - Each provider maintains completely independent configuration
   - No data loss when switching providers

2. **Dynamic Provider Routing** ✅
   - Backend intelligently detects active provider from request or database
   - Endpoints route to correct provider configuration based on `activeProvider`
   - MongoDB $set with nested paths ensures isolation (e.g., `'smtp.mailtrap.password'`)
   - Provider-specific validation rules applied per provider

3. **Provider-Specific Frontend Forms** ✅
   - CustomSmtpSettings component now shows conditional forms based on selected provider
   - **Mailtrap Form:** SMTP fields (host, port, user, password), sender info, TLS/SSL
   - **SendGrid Form:** API key, sender info only (no SMTP fields needed)
   - **Gmail Form:** Gmail address, app password, sender info, with validation helpers
   - Test email button works independently for each provider

4. **Password Dirty Tracking** ✅
   - Per-provider password change tracking via `providerPasswordDirty` object
   - Passwords only sent to backend when `passwordDirty === true` for that provider
   - Prevents accidental password transmission when user only edited other fields
   - Backend detects masked passwords (`***`) and refuses to overwrite

5. **Enhanced Test Email Endpoint** ✅
   - Configuration source priority: request body > database (with fallback)
   - Provider detection with 'mailtrap' as default
   - Provider name returned in response for clarity (e.g., "sent successfully via sendgrid")
   - Provider-specific error messages and recovery hints
   - Comprehensive logging for debugging (source, provider, validation results)

### Files Modified

- **Frontend:** `client/src/components/admin/CustomSmtpSettings.tsx` - Complete rewrite (774 lines)
- **Backend:** `server/routes/settingsRoutes.js` - POST /email/test endpoint refactored (lines 2327-2630)
- **Database:** MongoDB schema updated with nested provider objects and activeProvider field
- **Documentation:** Comprehensive update to reflect multi-provider architecture

### Backward Compatibility

- ✅ Old database records without `activeProvider` default to 'mailtrap'
- ✅ Old single-provider payload structures still accepted
- ✅ PATCH endpoint with old structure still works
- ✅ Test email works without request body `activeProvider`
- ✅ No data loss when migrating to multi-provider schema

### Performance Improvements

- Only active provider config sent to backend (smaller payloads)
- Frontend validates only selected provider fields (faster validation)
- Conditional rendering ensures unused forms don't render in DOM

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

**Purpose:** Advanced multi-provider email configuration component with provider-specific forms, conditional rendering, and test email functionality.

#### Props:
```typescript
interface Props {
  emailConfig: EmailConfig;
  setEmailConfig: (config: EmailConfig) => void;
  smtpPasswordProp?: string;  // Real SMTP password from parent component
  passwordDirty?: boolean;  // Tracks if password field has been edited by user
  hasBackendPassword?: boolean;  // Whether backend has a saved password
}
```

#### Features:

1. **Enable Toggle:** Enables/disables custom SMTP configuration section
2. **Multi-Provider Selector:** Dropdown to choose between:
   - Mailtrap
   - SendGrid
   - Gmail
3. **Provider-Specific Conditional Forms:**
   - Only relevant fields shown based on selected provider
   - Each provider has independent configuration state
   - Password visibility toggles per provider

#### Provider-Specific Forms:

##### **Mailtrap Configuration Form**
- From Name & From Email (sender info)
- SMTP Host, Port, Username, Password
- TLS/SSL security toggle
- Test email functionality

##### **SendGrid Configuration Form**
- From Name & From Email (sender info)
- SendGrid API Key only (no SMTP fields)
- Password visibility toggle for API key
- Test email functionality

##### **Gmail Configuration Form**
- Gmail Address (@gmail.com validation)
- From Name & From Email
- App Password (16-character from Google Account)
- Helper link to generate app password
- Password visibility toggle
- Test email functionality

#### Key Functions:

##### `handleTestSmtpConnection()`
- **Validation:**
  - Provider-specific required fields checked
  - Mailtrap: host, port, user, password, fromEmail required
  - SendGrid: apiKey, fromEmail required
  - Gmail: user (Gmail address), password (app password), fromEmail required
- **Validation on button disabled state:**
  - Button disabled when any required field missing
  - Different disabled conditions per provider
- **Request Body:**
  - Includes only active provider config
  - Routes based on selectedProvider
  - Uses provider-specific data from state
- **Endpoint:** `POST /settings/email/test` (now with multi-provider support)
- **Success:** Shows success message with provider name
- **Error:** Shows detailed error with hints and missing fields

#### State Variables:

| State | Type | Purpose |
|-------|------|---------|
| `selectedProvider` | `'mailtrap' \| 'sendgrid' \| 'gmail'` | Currently selected provider for UI display |
| `mailtrapConfig` | `object` | Mailtrap-specific config (host, port, user, password, fromEmail, fromName, secure) |
| `sendgridConfig` | `object` | SendGrid-specific config (apiKey, fromEmail, fromName) |
| `gmailConfig` | `object` | Gmail-specific config (user, password, fromEmail, fromName, host, port, secure) |
| `providerPasswordDirty` | `object` | Tracks if password/apiKey edited for each provider |
| `smtpPasswordVisible` | `boolean` | Controls password visibility toggle |
| `testing` | `boolean` | Loading state during test email send |
| `testEmailAddress` | `string` | Input field for test email recipient |

#### Data Flow:

1. **Initialization:** Default provider 'mailtrap' with empty config objects
2. **Provider Selection:** User selects provider → `setSelectedProvider()` updates
3. **Form Rendering:** Only selected provider's form renders conditionally
4. **Field Changes:** Updates corresponding provider config state object
5. **Password Dirty Tracking:** When user edits password field → `providerPasswordDirty[provider] = true`
6. **Test Email:** Uses current provider config from state (not saved)
7. **Save:** Parent component sends activeProvider + current provider config to backend

#### Rendering:

- Material-UI Paper card with section title "Advanced SMTP Configuration"
- Styled TextField components for all inputs
- FormControl Select with MenuItem options for provider dropdown
- Conditional blocks:
  - `{selectedProvider === 'mailtrap' && <Box>...Mailtrap form...</Box>}`
  - `{selectedProvider === 'sendgrid' && <Box>...SendGrid form...</Box>}`
  - `{selectedProvider === 'gmail' && <Box>...Gmail form...</Box>}`
- Test Email UI with provider-specific validation and loading button

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

### 4. **PATCH /api/settings** (Partial Update with Multi-Provider Support)

**Purpose:** Partially update settings without replacing entire document. Handles multi-provider email config with dynamic routing.

**Authentication:** Required (Admin only)

**Request Body:** Any subset of settings fields to update

**Special Handling - Multi-Provider Email Config:**

#### Provider Detection:
```javascript
const activeProvider = payload.smtp?.activeProvider || 'mailtrap';
// Detects which provider config to save
```

#### Dynamic Field Routing:

**For Mailtrap:**
```javascript
$set = {
  'smtp.activeProvider': 'mailtrap',
  'smtp.mailtrap.host': value,
  'smtp.mailtrap.port': value,
  'smtp.mailtrap.user': value,
  'smtp.mailtrap.password': encrypted(value),
  'smtp.mailtrap.fromEmail': value,
  'smtp.mailtrap.fromName': value,
  'smtp.mailtrap.secure': value
}
```

**For SendGrid:**
```javascript
$set = {
  'smtp.activeProvider': 'sendgrid',
  'smtp.sendgrid.apiKey': encrypted(value),
  'smtp.sendgrid.fromEmail': value,
  'smtp.sendgrid.fromName': value
}
```

**For Gmail:**
```javascript
$set = {
  'smtp.activeProvider': 'gmail',
  'smtp.gmail.host': 'smtp.gmail.com',
  'smtp.gmail.port': 587,
  'smtp.gmail.user': value,
  'smtp.gmail.password': encrypted(value),
  'smtp.gmail.fromEmail': value,
  'smtp.gmail.fromName': value,
  'smtp.gmail.secure': true
}
```

#### Password Masking Detection:
- Regex test: `/^\*+$/` detects masked values
- If masked detected: Preserves existing password, does NOT overwrite with placeholder
- Prevents accidental password loss

#### Isolation Guarantee:
- Only updates nested fields for active provider
- Other provider configs completely untouched
- Ensures: Saving Mailtrap config doesn't affect SendGrid config

**Validation:**
- Provider-specific required fields validation
- Email format validation
- Port validation: 1-65535
- No _id fields allowed in payload

**Response:** Sanitized updated settings with activeProvider and provider config

---

### 5. **POST /api/settings/email/test** (Multi-Provider Test Email)

**Purpose:** Send test email using configured provider with dynamic provider routing

**Authentication:** Required (Admin only)

**Request Body:**
```json
{
  "testEmail": "recipient@example.com",
  "smtp": {
    "activeProvider": "mailtrap",
    "mailtrap": {
      "host": "smtp.mailtrap.io",
      "port": 465,
      "user": "username",
      "password": "password",
      "fromEmail": "noreply@example.com"
    }
  }
}
```

**Configuration Source Priority:**
```
1. body.smtp (highest) - Test provided config
2. database fallback (lowest) - Use saved active provider config
```

**Provider Detection Logic:**
```javascript
// Detect active provider
const activeProvider = body.smtp?.activeProvider || settings.smtp.activeProvider || 'mailtrap';

// Route to correct config
if (activeProvider === 'mailtrap') {
  providerConfig = body.smtp?.mailtrap || settings.smtp.mailtrap;
} else if (activeProvider === 'sendgrid') {
  providerConfig = body.smtp?.sendgrid || settings.smtp.sendgrid;
} else if (activeProvider === 'gmail') {
  providerConfig = body.smtp?.gmail || settings.smtp.gmail;
}
```

**Provider-Specific Validation:**

| Provider | Required Fields | Validation |
|----------|-----------------|-----------|
| Mailtrap | host, port, user, password, fromEmail | SMTP fields must all be present |
| SendGrid | apiKey, fromEmail | API key must start with 'SG.' |
| Gmail | user (Gmail address), password (app password), fromEmail | Must have valid Gmail address |

**Validation Response (Error):**
```json
{
  "success": false,
  "message": "Invalid mailtrap configuration",
  "error": "Mailtrap requires: password, fromEmail",
  "missingFields": ["password", "fromEmail"],
  "provider": "mailtrap",
  "configSource": "request_body"
}
```

**Email Sending Process:**

1. **For Mailtrap/Gmail (SMTP):**
   - Creates Nodemailer transporter with SMTP config
   - Sets: host, port, secure, auth (user/pass)
   - Sends via `transporter.sendMail()`

2. **For SendGrid:**
   - Placeholder implementation (future: SendGrid API client)
   - Returns success if config is valid

**Successful Response:**
```json
{
  "success": true,
  "message": "Test email sent successfully via mailtrap",
  "provider": "mailtrap",
  "configSource": "request_body",
  "testEmail": "admin@example.com",
  "messageId": "messageId123"
}
```

**Error Handling:**

| Error | Cause | Solution |
|-------|-------|----------|
| ECONNREFUSED | Cannot connect to host:port | Verify host and port correct |
| ENOTFOUND | Host DNS lookup failed | Check hostname spelling |
| Authentication failed | Wrong credentials | Verify username and password |
| Config incomplete | Missing required fields | See missingFields in response |

**Comprehensive Logging:**
```javascript
console.log('[Settings] POST /email/test - Configuration source:', {
  source: configSource,  // 'request_body' or 'database'
  activeProvider: activeProvider,
  hasProviderConfig: !!providerConfig
});

console.log('[Settings] POST /email/test - All validations passed. Sending via:', {
  provider: activeProvider,
  configSource: configSource,
  toEmail: testEmail
});

console.log('[Settings] POST /email/test - Test email sent successfully via', activeProvider, {
  configSource: configSource,
  messageId: emailResult.messageId,
  recipient: testEmail
});
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

### 1. **Multi-Provider Architecture Overview**

The email system now supports simultaneous configuration of multiple email providers with dynamic provider selection. This allows:
- **Storing all provider configs at once** without overwriting each other
- **Switching providers** by updating activeProvider enum
- **Testing individual providers** without affecting others
- **Isolated credentials** - each provider has its own configuration object
- **No data loss** - switching providers doesn't erase previous configs

#### Key Architectural Principles:

1. **Active Provider Selection:**
   - Single activeProvider enum field: 'mailtrap' | 'sendgrid' | 'gmail'
   - Only this provider used for actual email sending
   - Easy to switch without data migration

2. **Nested Configuration Objects:**
   - Each provider stored in its own nested object
   - `smtp.mailtrap.*` for Mailtrap settings
   - `smtp.sendgrid.*` for SendGrid settings
   - `smtp.gmail.*` for Gmail settings
   - Complete isolation prevents accidental overwrites

3. **Provider-Specific Validation:**
   - Each provider validates only its required fields
   - Mailtrap requires: host, port, user, password, fromEmail
   - SendGrid requires: apiKey, fromEmail
   - Gmail requires: user (Gmail address), password (app password), fromEmail

4. **Dynamic Provider Routing:**
   - Backend detects activeProvider and routes to correct config
   - Frontend shows only selected provider's form
   - Test email endpoint dynamically routes to correct validation and sending logic

---

### 2. **Email Settings Control** (`EmailSettings` state/config)

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

### 3. **Email Provider Configuration** (Multi-Provider `smtp.activeProvider + nested objects`)

#### Provider Types and Nested Storage:

##### **Mailtrap** (stored in `smtp.mailtrap`)
```javascript
{
  host: 'smtp.mailtrap.io',
  port: 465,
  user: 'mailtrap_username',
  password: 'encrypted_password',
  fromEmail: 'noreply@example.com',
  fromName: 'Barangay System',
  secure: true
}
```

##### **SendGrid** (stored in `smtp.sendgrid`)
```javascript
{
  apiKey: 'SG.xxx...',  // encrypted
  fromEmail: 'noreply@example.com',
  fromName: 'Barangay System'
}
```

##### **Gmail** (stored in `smtp.gmail`)
```javascript
{
  host: 'smtp.gmail.com',
  port: 587,
  user: 'admin@gmail.com',  // Gmail address
  password: 'xxxxxxxxxxxxxxxx',  // 16-char app password, encrypted
  fromEmail: 'admin@gmail.com',
  fromName: 'Barangay System',
  secure: true
}
```

#### Active Provider Storage:
```javascript
smtp: {
  activeProvider: 'mailtrap',  // Currently active provider
  mailtrap: { /* Mailtrap config */ },
  sendgrid: { /* SendGrid config */ },
  gmail: { /* Gmail config */ }
}
```

---

### 4. **Provider Configuration Routes**

#### **GET /api/settings/email/providers**

Returns list of available email providers.

**Response:**
```json
{
  "success": true,
  "providers": [
    { "id": "mailtrap", "name": "Mailtrap" },
    { "id": "sendgrid", "name": "SendGrid" },
    { "id": "gmail", "name": "Gmail" }
  ]
}
```

---

#### **GET /api/settings/email**

Get current email configuration (sanitized).

**Response:**
```json
{
  "success": true,
  "email": {
    "activeProvider": "mailtrap",
    "mailtrap": {
      "host": "smtp.mailtrap.io",
      "port": 465,
      "user": "username",
      "password": "***MASKED***",
      "fromEmail": "noreply@example.com",
      "fromName": "Barangay System"
    },
    "sendgrid": {
      "apiKey": "***MASKED***",
      "fromEmail": "noreply@example.com",
      "fromName": "Barangay System"
    },
    "gmail": {
      "user": "admin@gmail.com",
      "password": "***MASKED***",
      "fromEmail": "admin@gmail.com",
      "fromName": "Barangay System"
    }
  }
}
```

---

#### **PATCH /api/settings/email**

Update email provider configuration with dynamic routing.

**Request Body (Mailtrap Example):**
```json
{
  "activeProvider": "mailtrap",
  "mailtrap": {
    "host": "smtp.mailtrap.io",
    "port": 465,
    "user": "username",
    "password": "new_password",
    "fromEmail": "noreply@example.com",
    "fromName": "Barangay System",
    "secure": true
  }
}
```

**Dynamic Routing Logic:**
```javascript
// Detect active provider from payload
const activeProvider = payload.activeProvider || payload.smtp?.activeProvider;

// Route to correct provider-specific fields
if (activeProvider === 'mailtrap') {
  updateOps.$set['smtp.activeProvider'] = 'mailtrap';
  updateOps.$set['smtp.mailtrap.host'] = payload.mailtrap.host;
  updateOps.$set['smtp.mailtrap.port'] = payload.mailtrap.port;
  // ... rest of mailtrap fields
} else if (activeProvider === 'sendgrid') {
  updateOps.$set['smtp.activeProvider'] = 'sendgrid';
  updateOps.$set['smtp.sendgrid.apiKey'] = encrypted(payload.sendgrid.apiKey);
  // ... rest of sendgrid fields
} else if (activeProvider === 'gmail') {
  updateOps.$set['smtp.activeProvider'] = 'gmail';
  updateOps.$set['smtp.gmail.user'] = payload.gmail.user;
  // ... rest of gmail fields
}
```

**Key Features:**
- Updates ONLY active provider, never touches other providers
- Masks values detected via `/^\*+$/` regex (prevents accidental overwrite)
- Sets nested paths explicitly to ensure Mongoose saves correctly

**Validation Per Provider:**

- **Mailtrap:** host, port (1-65535), user, password all required
- **SendGrid:** apiKey required  
- **Gmail:** user (Gmail address), password (app password) required

**Response:**
```json
{
  "success": true,
  "message": "Email settings updated successfully via mailtrap",
  "activeProvider": "mailtrap",
  "email": { /* sanitized config */ }
}
```

---

#### **POST /api/settings/email/test** (See Detailed Section Above)

Test email provider configuration with dynamic provider routing and provider-specific validation.

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

### **SystemSetting (MongoDB Schema - Multi-Provider)**

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
  
  // Multi-Provider Email Configuration
  smtp: {
    activeProvider: Enum(['mailtrap', 'sendgrid', 'gmail']),  // Currently active provider
    
    // Mailtrap Configuration (nested object)
    mailtrap: {
      host: String,
      port: Number,
      user: String,
      password: String,
      fromEmail: String,
      fromName: String,
      secure: Boolean
    },
    
    // SendGrid Configuration (nested object)
    sendgrid: {
      apiKey: String,
      fromEmail: String,
      fromName: String
    },
    
    // Gmail Configuration (nested object)
    gmail: {
      host: String,  // 'smtp.gmail.com'
      port: Number,  // 587
      user: String,  // Gmail address
      password: String,  // App password
      fromEmail: String,
      fromName: String,
      secure: Boolean  // true
    },
    
    // Metadata (shared across providers)
    lastHealthCheck: Date,
    testEmailStatus: String,  // 'success' or 'failed'
    enabled: Boolean,
    updatedAt: Date
  },
  
  // Gmail Config (legacy, maintained for compatibility)
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

**Key Features:**
1. **Active Provider Selection:** `activeProvider` enum controls which provider is used for sending
2. **Isolated Provider Objects:** Each provider has its own nested object (`smtp.mailtrap.*`, `smtp.sendgrid.*`, `smtp.gmail.*`)
3. **No Interference:** Updating one provider's config doesn't touch other providers
4. **Shared Metadata:** `lastHealthCheck`, `testEmailStatus`, `enabled` apply to all providers
5. **Backward Compatibility:** Legacy `gmail` and `email` fields maintained

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

### Frontend State Flow (Multi-Provider Architecture)

1. **Initialization:**
   - `fetchSettings()` → Backend `/settings`
   - Maps response to `settings`, `emailProviderConfig`, `officials`
   - Detects `smtp.activeProvider` from backend

2. **Provider Selection:**
   - User selects provider in CustomSmtpSettings dropdown
   - `setSelectedProvider()` updates local state
   - Only selected provider's form conditionally renders

3. **Provider-Specific State Objects:**
   - `mailtrapConfig`: Independent Mailtrap configuration state
   - `sendgridConfig`: Independent SendGrid configuration state
   - `gmailConfig`: Independent Gmail configuration state
   - Each updated only when that provider is selected

4. **Password Dirty Tracking Per Provider:**
   - `providerPasswordDirty`: Object tracking dirty state for each provider
   ```javascript
   {
     mailtrap: false,
     sendgrid: false,
     gmail: false
   }
   ```
   - When user edits password field: `providerPasswordDirty[provider] = true`
   - Only sends password in requests when dirty=true
   - Prevents accidental password transmission when not changed

5. **Test Email Workflow:**
   - User clicks "Send Test Email" button
   - Validates current provider's required fields
   - Builds payload with only active provider config
   - Sends to `POST /settings/email/test`
   - Backend routes to correct provider logic
   - Shows response with provider name

6. **Save Workflow:**
   - User clicks "Save Settings" button
   - Parent component (SystemSettings) prepares unified payload:
   ```javascript
   {
     activeProvider: selectedProvider,
     [selectedProvider + 'Config']: currentProviderConfig,
     // Only active provider config included
   }
   ```
   - Sends to `PATCH /settings` endpoint
   - Backend uses dynamic routing to save to correct nested object
   - Response includes all provider configs (masked passwords)

7. **Component Communication:**
   - Parent (SystemSettings) owns multi-provider state
   - CustomSmtpSettings manages provider-specific forms
   - EmailSettings manages common fields (from name/email)
   - Callbacks pass data up to parent for unified save

#### Provider-Specific State Management Example:

```javascript
// Mailtrap selected
const [selectedProvider, setSelectedProvider] = useState('mailtrap');
const [mailtrapConfig, setMailtrapConfig] = useState({
  host: 'smtp.mailtrap.io',
  port: 2525,
  user: '',
  password: '',
  fromEmail: '',
  fromName: 'Barangay System',
  secure: true
});

// User edits password field
const handlePasswordChange = (e) => {
  setMailtrapConfig({ ...mailtrapConfig, password: e.target.value });
  setProviderPasswordDirty({ ...providerPasswordDirty, mailtrap: true });
};

// Save payload only includes Mailtrap config
const savePayload = {
  activeProvider: 'mailtrap',
  mailtrapConfig: mailtrapConfig
  // sendgridConfig and gmailConfig NOT included
};
```

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
   - Backend never returns real passwords to client
   - Only `***MASKED***` values sent to frontend
   - Client uses passwords ONLY from request body (not database)

2. **Password Dirty Tracking:**
   - Frontend tracks if user edited password field per provider
   - Password only included in request if `passwordDirty === true`
   - Prevents accidental password transmission when unchanged
   - Backend detects masked values via `/^\*+$/` regex to prevent overwrites

3. **Encryption at Rest:**
   - SMTP passwords encrypted before MongoDB save using `SETTINGS_ENCRYPTION_KEY`
   - SendGrid API keys encrypted
   - Gmail app passwords encrypted (though initially stored as plain text for compatibility)
   - Uses Node.js crypto utilities for AES-256 encryption

4. **Per-Provider Password Isolation:**
   - Each provider has independent password field
   - Updating one provider password doesn't affect others
   - Mailtrap password: `smtp.mailtrap.password`
   - SendGrid API key: `smtp.sendgrid.apiKey`
   - Gmail app password: `smtp.gmail.password`

5. **Test Email Password Handling:**
   - Test email endpoint accepts passwords only in request body
   - Test email endpoint uses passwords from request (not database fallback)
   - Prevents test without explicit password entry by user
   - Password validation: Non-empty string, not masked pattern

---

### Authorization

1. **All Admin Email Endpoints Require:**
   - `requireAuth` middleware (must be logged in)
   - `isAdmin` middleware (user.isAdmin === true)

2. **Public Endpoints (No Auth):**
   - `GET /api/settings/public` - Barangay info only
   - `GET /api/settings/public/barangay-info` - Carousel data
   - `GET /api/settings/public/contact-info` - Contact data

3. **Audit Trail:**
   - All admin email config changes logged in AuditLog
   - Includes before/after diff, user ID, timestamp
   - Admin can review changes via audit logs

---

### Data Validation

1. **Multi-Provider Email Validation:**
   - Mailtrap: All SMTP fields required (host, port, user, password, fromEmail)
   - SendGrid: apiKey required and must start with 'SG.'
   - Gmail: User must be @gmail.com, app password must be 16 chars

2. **Email Validation:**
   - Format: `^[^\s@]+@[^\s@]+\.[^\s@]+$`
   - Phone format: 7+ digits (allows spaces, dashes, parens, +)

3. **Numeric Validation:**
   - All numeric fields must be > 0
   - Port must be 1-65535
   - Max accounts per IP must be 1-100

4. **Payload Sanitization:**
   - All _id fields removed defensively
   - Undefined properties removed before save
   - Only expected fields processed
   - Nested paths validated for provider-specific objects

---

### Destructive Operations

1. **Disabling Verifications:**
   - Confirmation dialog required
   - Permanently deletes pending requests
   - Deletes uploaded files from GridFS
   - Users notified via SSE

2. **Provider Switching:**
   - Previous provider configs preserved (not deleted)
   - Can switch back without data loss
   - Only activeProvider enum changes, nested objects untouched

3. **Audit Trail:**
   - Before/after diff recorded
   - Admin ID and timestamp tracked
   - Reversal requires admin to manually switch back

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

### Frontend Component Tests (CustomSmtpSettings.tsx)

#### Provider Selection
- [ ] Provider dropdown displays all three options: Mailtrap, SendGrid, Gmail
- [ ] Switching provider hides previous form and shows correct form
- [ ] Selected provider is properly stored in state
- [ ] Page refresh maintains selected provider from database

#### Mailtrap Form Tests
- [ ] Form displays when Mailtrap selected: Host, Port, Username, Password, From Name, From Email, TLS/SSL
- [ ] Host field accepts alphanumeric and dots (e.g., "smtp.mailtrap.io")
- [ ] Port field accepts 1-65535
- [ ] Password visibility toggle hides/shows actual password
- [ ] TLS/SSL toggle updates secureConnection state
- [ ] Test email button enabled when all required fields have values
- [ ] Test email button disabled when any required field is empty
- [ ] Password dirty tracking: password marked dirty when edited
- [ ] Password dirty cleared after successful save
- [ ] From Email field validates email format

#### SendGrid Form Tests
- [ ] Form displays when SendGrid selected: API Key, From Name, From Email
- [ ] API Key field accepts only alphanumeric and hyphens
- [ ] API Key visibility toggle hides/shows actual key
- [ ] API Key field must start with "SG." for valid SendGrid API keys
- [ ] Test email button enabled when all required fields have values
- [ ] Test email button disabled when any required field is empty
- [ ] Password dirty tracking: apiKey marked dirty when edited
- [ ] Password dirty cleared after successful save
- [ ] From Email field validates email format

#### Gmail Form Tests
- [ ] Form displays when Gmail selected: Gmail Address, App Password, From Name, From Email
- [ ] Gmail Address field validates @gmail.com domain
- [ ] Gmail Address field shows error if non-@gmail.com entered
- [ ] App Password field accepts exactly 16 characters (spaces allowed, removed on save)
- [ ] App Password field shows helper link: "Generate App Password"
- [ ] App Password visibility toggle hides/shows actual password
- [ ] From Email field can be different from Gmail Address (good for branding)
- [ ] Test email button enabled when all required fields have values
- [ ] Test email button disabled when any required field is empty
- [ ] Password dirty tracking: password marked dirty when edited
- [ ] Password dirty cleared after successful save

#### General Form Tests
- [ ] Clearing provider password field doesn't clear other providers' passwords
- [ ] From Name field accepts any text (optional)
- [ ] From Email field accepts any valid email format
- [ ] Form shows loading state during save
- [ ] Error messages display for invalid fields
- [ ] Success message displays after save
- [ ] Form data persists after reload

---

### Backend API Tests (POST /api/settings/email/test)

#### Mailtrap Provider Tests
- [ ] Test with valid Mailtrap credentials returns 200 OK
- [ ] Response includes: `{ success: true, message: "Test email sent successfully via mailtrap" }`
- [ ] Missing host returns 400 with error: `["smtp.mailtrap.host"]`
- [ ] Missing port returns 400 with error: `["smtp.mailtrap.port"]`
- [ ] Missing user returns 400 with error: `["smtp.mailtrap.user"]`
- [ ] Missing password returns 400 with error: `["smtp.mailtrap.password"]`
- [ ] Missing fromEmail returns 400 with error: `["smtp.mailtrap.fromEmail"]`
- [ ] Invalid host (ENOTFOUND) returns 500 with hint: "Host not found"
- [ ] Connection refused (ECONNREFUSED) returns 500 with hint: "Cannot connect to host:port"
- [ ] Invalid credentials returns 500 with hint: "Invalid email credentials"
- [ ] Request body credentials override database credentials
- [ ] Secure connection toggle (TLS/SSL) is respected
- [ ] From Name is included in email

#### SendGrid Provider Tests
- [ ] Test with valid SendGrid API key returns 200 OK
- [ ] Response includes: `{ success: true, message: "Test email sent successfully via sendgrid" }`
- [ ] Missing apiKey returns 400 with error: `["smtp.sendgrid.apiKey"]`
- [ ] Missing fromEmail returns 400 with error: `["smtp.sendgrid.fromEmail"]`
- [ ] Invalid API key returns 500 with hint: "Invalid SendGrid API key"
- [ ] API key must start with "SG." for validation
- [ ] Request body credentials override database credentials
- [ ] From Name is included in email
- [ ] Email address supports full format: "From Name <from@email.com>"

#### Gmail Provider Tests
- [ ] Test with valid Gmail app password returns 200 OK
- [ ] Response includes: `{ success: true, message: "Test email sent successfully via gmail" }`
- [ ] Missing user returns 400 with error: `["smtp.gmail.user"]`
- [ ] Missing password returns 400 with error: `["smtp.gmail.password"]`
- [ ] Missing fromEmail returns 400 with error: `["smtp.gmail.fromEmail"]`
- [ ] User must be @gmail.com format
- [ ] App password must be 16 characters (test endpoint accepts without spaces removed)
- [ ] Invalid app password returns 500 with hint: "Invalid Gmail app password"
- [ ] Fixed host "smtp.gmail.com" and port 465 used automatically
- [ ] Request body credentials override database credentials
- [ ] From Name is included in email

#### Provider Detection Tests
- [ ] Request body activeProvider takes priority over database
- [ ] Database activeProvider used if not in request body
- [ ] Default to 'mailtrap' if no activeProvider specified anywhere
- [ ] Provider name returned in response message
- [ ] Switching activeProvider doesn't affect other provider configs

#### Multi-Provider Isolation Tests
- [ ] Saving Mailtrap config doesn't modify SendGrid or Gmail configs
- [ ] Saving SendGrid config doesn't modify Mailtrap or Gmail configs
- [ ] Saving Gmail config doesn't modify Mailtrap or SendGrid configs
- [ ] Switching between providers preserves all provider configs
- [ ] Deleting activeProvider from request doesn't affect database value

#### Password Handling Tests
- [ ] Masked passwords (`***`) in request are detected and not saved
- [ ] Real passwords are encrypted before database save
- [ ] Backend never returns real passwords to client
- [ ] Database stores encrypted passwords
- [ ] Passwords are decrypted for test email sending
- [ ] Password dirty tracking prevents accidental overwrites

---

### PATCH /api/settings/email Tests

#### Provider-Specific Save Tests
- [ ] Saving Mailtrap config via `smtp.mailtrap.*` paths
- [ ] Saving SendGrid config via `smtp.sendgrid.*` paths
- [ ] Saving Gmail config via `smtp.gmail.*` paths
- [ ] Only activeProvider is included in save request
- [ ] Switching activeProvider immediately routes to new provider config
- [ ] All three providers can have simultaneous configurations

#### Password Update Tests
- [ ] Password only saved if `providerPasswordDirty === true`
- [ ] Masked passwords detected and not overwritten
- [ ] Password updates encrypted before storage
- [ ] Password updates isolated to active provider only

#### Validation Tests
- [ ] Active provider required fields validated on save
- [ ] Inactive provider fields not validated
- [ ] Invalid email in fromEmail returns 400
- [ ] Invalid port number returns 400
- [ ] Empty string values handled correctly

---

### End-to-End Scenarios

#### Scenario 1: Switch from Mailtrap to SendGrid
- [ ] User has Mailtrap configured and working
- [ ] User switches to SendGrid in dropdown
- [ ] Mailtrap form hides, SendGrid form shows
- [ ] User enters SendGrid API key and sender info
- [ ] Test email sent via SendGrid succeeds
- [ ] Save button sends only SendGrid config
- [ ] activeProvider updates to 'sendgrid'
- [ ] Mailtrap config preserved in database
- [ ] User can switch back to Mailtrap without re-entering data

#### Scenario 2: Multiple Providers Configured (Disaster Recovery)
- [ ] Admin configures all three providers
- [ ] Primary provider (Mailtrap) fails
- [ ] Admin quickly switches activeProvider to SendGrid
- [ ] SendGrid sends emails without reconfiguration
- [ ] Original Mailtrap config still intact if needed
- [ ] Switch takes seconds without data re-entry

#### Scenario 3: Test Before Save
- [ ] User modifies Mailtrap credentials
- [ ] Clicks "Test Email" before saving
- [ ] Backend uses request body credentials (not database)
- [ ] Test succeeds with new credentials
- [ ] User saves settings
- [ ] Subsequent tests use saved credentials

#### Scenario 4: Invalid Credentials Recovery
- [ ] User enters invalid host for Mailtrap
- [ ] Test email fails with specific error hint
- [ ] User corrects host
- [ ] Test email succeeds
- [ ] Save button available
- [ ] Settings updated with corrected host

#### Scenario 5: Password Dirty Tracking
- [ ] User loads page with existing Mailtrap password (shows as ***)
- [ ] User doesn't edit password field
- [ ] User changes "From Name" field
- [ ] User clicks Save
- [ ] Request includes new From Name
- [ ] Request does NOT include password (passwordDirty === false)
- [ ] Database password unchanged
- [ ] If user DID edit password field, then request includes it (passwordDirty === true)

---

### Integration Tests (Full Workflow)

#### Admin Settings Creation
- [ ] New admin accesses email settings
- [ ] All three provider forms available
- [ ] Can configure Mailtrap first
- [ ] Can test Mailtrap without saving
- [ ] Settings persist after save
- [ ] Page refresh maintains settings

#### Provider Configuration
- [ ] All three providers fully configurable
- [ ] Each provider validates independently
- [ ] Test endpoint works for each provider
- [ ] Configuration isolation maintained
- [ ] No cross-provider data leakage

#### Email Sending via Nodemailer
- [ ] Mailtrap configured credentials used for SMTP connection
- [ ] SendGrid API used directly (no Nodemailer fallback needed)
- [ ] Gmail SMTP connection works with app password
- [ ] Test email received in specified inbox
- [ ] Subject, body, and attachments formatted correctly

---

### Regression Tests

#### Backward Compatibility
- [ ] Old database records without activeProvider default to 'mailtrap'
- [ ] Old Mailtrap-only configs still work
- [ ] Old single-provider payload structure still accepted
- [ ] PATCH endpoint with old structure still works
- [ ] Test email works without request body activeProvider

#### Migration Safety
- [ ] No data lost when migrating to multi-provider schema
- [ ] Existing Mailtrap configs preserved
- [ ] New providers added without breaking old configs
- [ ] Switching between old/new client versions doesn't corrupt data

---

### System-Wide Tests

- [ ] Load settings page, verify all fields populate from DB
- [ ] Edit basic settings (site name, barangay info), save, reload to verify persistence
- [ ] Configure all three providers simultaneously
- [ ] Switch activeProvider and verify correct form/validation
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

6. **Multi-Provider Isolation:** Only active provider config sent to backend, reducing payload size

7. **Provider-Specific Validation:** Frontend validates only fields for selected provider, not all three

---

## Future Enhancements

### Email System Improvements

1. **Health-Check Endpoint Refactoring:** 
   - Apply same multi-provider routing logic to GET /api/settings/health endpoint
   - Per-provider health status response (e.g., "mailtrap": "connected", "sendgrid": "error")
   - Continuous provider health monitoring

2. **Email Queue & Retry Logic:** 
   - Implement queue for failed emails with automatic retry
   - Provider fallback: if primary fails, try secondary
   - Configurable retry intervals and max attempts

3. **Email Template Management:** 
   - Admin UI to customize email templates per email type (verification, notifications, etc.)
   - Provider-specific template tweaks

4. **Rate Limiting:** 
   - Limit email sends per minute/hour per provider
   - Provider-specific rate limits

5. **Email Logging:** 
   - Track all sent emails with delivery status
   - Provider name, credentials used, error details
   - Email audit trail for compliance

6. **Provider Health Dashboard:** 
   - Real-time status indicator for each provider
   - Recent failures and recovery info
   - Provider failover history

### Configuration & Security

7. **Gmail App Password Encryption:** 
   - Currently stored as plain text, should be encrypted at rest (low priority - already secure in transit)

8. **Backup & Restore:** 
   - Settings backup/restore functionality with version control
   - Disaster recovery snapshots

9. **Settings Versioning:** 
   - Track all historical setting changes
   - Admin can view/compare old configurations
   - One-click rollback to previous settings

10. **Audit Trail Enhancement:**
    - Track which provider was active when change made
    - Provider-specific change history
    - Email delivery audit log

### Multi-Tenancy & Scaling

11. **Multi-Tenancy:** 
    - Support for multiple organizations with separate email providers
    - Org-specific email configurations

12. **Provider Quotas & Usage Tracking:**
    - Track emails sent per provider per day/month
    - Alert when approaching quota
    - Usage analytics dashboard

### Developer Experience

13. **Email Provider Testing Tool:**
    - Batch test all three providers simultaneously
    - Generate detailed health report
    - Export configuration for documentation

14. **Settings Migration Tool:**
    - Migrate settings from one deployment to another
    - Provider configuration export/import
    - Rollback migrations if needed

15. **Configuration Validation CLI:**
    - Command-line tool to validate email configuration
    - Check provider connectivity and credentials
    - Report issues before deployment

---

## Known Limitations & Workarounds

1. **Gmail App Passwords:**
   - Cannot use regular Gmail password (2FA blocks it)
   - Requires Google Account password or app-specific password
   - Workaround: Provide clear UI instructions with "Generate App Password" link

2. **SendGrid Rate Limiting:**
   - SendGrid API has rate limits (100K emails/day on free tier)
   - Workaround: Implement queuing and rate limiting on backend

3. **Mailtrap Testing Limitations:**
   - Cannot actually deliver emails to real inboxes (testing only)
   - Workaround: Use for development/staging, production uses real provider

4. **Provider Configuration Switching:**
   - Switching providers mid-stream may cause in-flight email delivery issues
   - Workaround: Admin should coordinate switches with support team, test before activating

5. **Password Storage:**
   - Encryption key must be secure and backed up separately
   - Loss of encryption key means passwords unrecoverable
   - Workaround: Implement key rotation and secure backup procedures

---

## References

- **Frontend:** React 18, Material-UI, Ant Design, TypeScript
- **Backend:** Express.js, Node.js 14+, TypeScript
- **Database:** MongoDB with Mongoose ODM
- **Email:** Nodemailer for SMTP, Gmail API, SendGrid API
- **Security:** bcrypt for password hashing, crypto module for AES-256 encryption
- **Documentation:** Markdown, Visual Studio Code

---

**Document Version:** 3.0 (Multi-Provider Email Architecture)  
**Last Updated:** 2024  
**Status:** Production Ready  
**Last Updated:** February 8, 2026  
**Author:** Development Team  
**Status:** Production Ready
