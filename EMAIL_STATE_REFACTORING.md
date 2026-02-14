# Email State Refactoring - Implementation Guide

## Overview

Successfully refactored the email-related state in SystemSettings.tsx by:
1. Creating a new custom hook `useEmailSettings` in `/hooks/useEmailSettings.ts`
2. Consolidating multiple separate state objects into unified `EmailState` interface
3. Providing methods for updating provider fields, toggling visibility, and tracking dirty states
4. Ensuring provider field isolation to prevent data leakage between providers

---

## New Hook: `useEmailSettings`

**Location:** `client/src/hooks/useEmailSettings.ts`

### EmailState Interface

Unified interface combining all email configuration:

```typescript
interface EmailState {
  // Email provider configuration
  enabled: boolean;
  provider: EmailProvider;  // 'custom' | 'gmail' | 'mailtrap' | 'sendgrid' | 'aws-ses'
  fromName: string;
  fromEmail: string;

  // Custom SMTP fields
  host: string;
  port: number;
  user: string;
  password: string;
  secure: boolean;

  // Gmail fields
  gmailAppPassword: string;

  // SendGrid fields
  sendgridApiKey: string;

  // AWS SES fields
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsRegion: string;

  // Email behaviors
  enablePasswordResetEmails: boolean;
  enableOtpEmails: boolean;
  enableDocumentNotificationEmails: boolean;
  enableAnnouncementEmails: boolean;
  enableAnnouncementBcc: boolean;
  recipientEmailsPerBatch: number;
  retryFailedEmails: boolean;
  retryAttempts: number;
  retryDelayMinutes: number;
  dryRunMode: boolean;

  // Dirty state tracking per provider
  passwordDirty: Record<EmailProvider, boolean>;

  // Track which providers have passwords saved on backend
  backendHasPassword: Record<EmailProvider, boolean>;

  // Visibility toggles for password fields
  passwordVisibility: Record<EmailProvider, boolean>;
}
```

### Hook Methods

**1. updateField(field: keyof EmailState, value: any)**
- Update a single field in emailState
- Automatically handles provider changes and clears non-provider fields
- Tracks password dirty states when password fields are edited
- Stores real passwords in internal ref

```typescript
// Example
updateField('password', 'newPassword123');
updateField('provider', 'sendgrid');  // Auto-clears custom SMTP fields
```

**2. updateFields(updates: Partial<EmailState>)**
- Update multiple fields at once
- Efficient for bulk updates

```typescript
updateFields({
  fromName: 'New Name',
  fromEmail: 'new@email.com',
  port: 465
});
```

**3. togglePasswordVisibility(provider: EmailProvider)**
- Toggle password visibility for specific provider
- Independent visibility per provider

```typescript
togglePasswordVisibility('custom');  // Show/hide custom SMTP password
```

**4. markPasswordDirty(provider: EmailProvider, isDirty: boolean)**
- Explicitly mark password as dirty/clean
- Used when loading data from backend

```typescript
markPasswordDirty('gmail', true);  // Mark Gmail password as edited
```

**5. setBackendHasPassword(provider: EmailProvider, hasPassword: boolean)**
- Track which providers have saved passwords on backend
- Used for UI feedback

```typescript
setBackendHasPassword('mailtrap', true);  // Backend has mailtrap password
```

**6. resetPasswordStates(provider: EmailProvider)**
- Reset password-related state for specific provider
- Clears password dirty flag and visibility

```typescript
resetPasswordStates('gmail');  // Clear gmail password state
```

**7. resetAllPasswordStates()**
- Reset password states for all providers
- Used when switching providers

```typescript
resetAllPasswordStates();  // Clear all password dirty/visibility flags
```

**8. getPassword(): string**
- Get real password for current provider
- Fetches from internal ref (not state)

```typescript
const password = getPassword();  // Get current provider's password
```

**9. getPasswords(): Record<EmailProvider, string>**
- Get all real passwords
- Use with caution - for payload building only

```typescript
const allPasswords = getPasswords();  // Get all provider passwords
```

**10. clearNonProviderFields()**
- Remove fields not relevant to current provider
- Prevents data leakage between providers

```typescript
clearNonProviderFields();  // Keep only selected provider's fields
```

**11. createCleanProviderConfig(provider: EmailProvider)**
- Create clean config with only provider-specific fields
- Used when switching providers

```typescript
const cleanConfig = createCleanProviderConfig('sendgrid');
// Returns only SendGrid-relevant fields
```

---

## Key Features

### 1. Provider-Specific Field Isolation

When provider changes, **all fields from other providers are automatically cleared**:

```typescript
// Before: Has custom SMTP fields
{
  provider: 'custom',
  host: 'smtp.example.com',
  port: 587,
  user: 'admin',
  password: '***',
  ...
}

// After updateField('provider', 'gmail'): Fields cleared
{
  provider: 'gmail',
  fromName: 'Barangay System',
  fromEmail: '',
  gmailAppPassword: '',
  // All custom SMTP fields removed!
  ...
}
```

### 2. Password Dirty Tracking Per Provider

Track which provider's password has been edited:

```typescript
// User edits custom SMTP password
emailState.passwordDirty = {
  custom: true,      // Password edited
  gmail: false,
  mailtrap: false
}

// When saving, only custom password included in payload
// Other providers' passwords untouched
```

### 3. Real Password Storage (Internal Ref)

- Passwords stored in internal ref, not in React state
- Prevents unnecessary re-renders
- Keeps UI separate from password storage

```typescript
// Internally, passwords stored as:
passwordsRef.current = {
  custom: 'realPassword123',
  gmail: 'appPassword456',
  mailtrap: 'mailtrapPass789'
}

// emailState shows masks: '***'
```

### 4. Backend Password Tracking

- Track which providers have passwords saved on backend
- Show appropriate UI feedback

```typescript
emailState.backendHasPassword = {
  custom: true,  // Backend has this password
  gmail: false,  // No password saved yet
  mailtrap: false
}
```

---

## Migration Guide: SystemSettings.tsx

### Before (Old Code)
```typescript
// Multiple state variables
const [emailConfig, setEmailConfig] = useState({...});
const [passwordModified, setPasswordModified] = useState({...});
const [passwordDirty, setPasswordDirty] = useState({...});
const [smtpPasswords, setSmtpPasswords] = useState({...});
const [backendHasPassword, setBackendHasPassword] = useState({...});

// Scattered logic
if (emailConfig.provider === 'custom') {
  // Custom logic
} else if (emailConfig.provider === 'gmail') {
  // Gmail logic
}
```

### After (New Code)
```typescript
// Single hook
const { emailState, updateField, togglePasswordVisibility, ... } = useEmailSettings();

// Cleaner logic
const currentProvider = emailState.provider;
const isPasswordDirty = emailState.passwordDirty[currentProvider];
const hasBackendPassword = emailState.backendHasPassword[currentProvider];
```

### Key Replacements

| Old | New |
|-----|-----|
| `emailConfig.provider` | `emailState.provider` |
| `emailConfig.password` | `emailState.password` / `getPassword()` |
| `passwordDirty.custom` | `emailState.passwordDirty['custom']` |
| `backendHasPassword.gmail` | `emailState.backendHasPassword['gmail']` |
| `setEmailConfig(prev => ({...}))` | `updateField('fieldName', value)` |
| `setPasswordModified({...})` | `markPasswordDirty(provider, isDirty)` |
| `togglePasswordVisibility(provider)` | `togglePasswordVisibility(provider)` |

---

## Usage Example

```typescript
import { useEmailSettings, defaultEmailState } from '../../hooks/useEmailSettings';

function MyComponent() {
  const {
    emailState,
    updateField,
    togglePasswordVisibility,
    markPasswordDirty,
    getPassword,
  } = useEmailSettings(defaultEmailState);

  // Update password field
  const handlePasswordChange = (event) => {
    updateField('password', event.target.value);
  };

  // Switch provider
  const handleProviderChange = (newProvider) => {
    updateField('provider', newProvider);
    // Automatically clears non-provider fields!
  };

  // Toggle password visibility
  const handleToggleVisibility = () => {
    togglePasswordVisibility(emailState.provider);
  };

  // Save logic
  const handleSave = () => {
    const payload = {
      ...emailState,
      // Only password if dirty
      password: emailState.passwordDirty[emailState.provider] 
        ? getPassword() 
        : undefined
    };
    // Save payload
  };

  return (
    <div>
      <select value={emailState.provider} onChange={e => handleProviderChange(e.target.value)}>
        <option value="custom">Custom SMTP</option>
        <option value="gmail">Gmail</option>
        <option value="sendgrid">SendGrid</option>
      </select>

      {emailState.provider === 'custom' && (
        <>
          <input 
            value={emailState.host}
            onChange={e => updateField('host', e.target.value)}
          />
          <input
            type={emailState.passwordVisibility['custom'] ? 'text' : 'password'}
            value={emailState.password}
            onChange={handlePasswordChange}
          />
          <button onClick={handleToggleVisibility}>
            {emailState.passwordVisibility['custom'] ? 'Hide' : 'Show'}
          </button>
        </>
      )}

      {emailState.provider === 'gmail' && (
        <input
          type="password"
          value={emailState.gmailAppPassword}
          onChange={e => updateField('gmailAppPassword', e.target.value)}
        />
      )}
    </div>
  );
}
```

---

## Benefits of Refactoring

### ✅ **Consolidated State**
- Single EmailState instead of 5 separate states
- Easier to pass around and reason about
- Type-safe with TypeScript interface

### ✅ **Centralized Logic**
- All email settings logic in one hook
- Reusable across components
- Easier to test

### ✅ **Provider Field Isolation**
- Automatic clearing of non-provider fields
- Prevents data leakage between providers
- Safer to switch providers

### ✅ **Better Password Handling**
- Per-provider dirty tracking
- Real passwords in internal ref
- Masked values in state for safety

### ✅ **Improved DX**
- Clear hook interface with specific methods
- Less boilerplate in component
- Easier to debug and maintain

### ✅ **Performance**
- Passwords in ref don't trigger re-renders
- Memoized selectors prevent unnecessary updates
- Clean separation of concerns

---

## Files Modified

- ✅ Created: `/client/src/hooks/useEmailSettings.ts` (new hook)
- ⏳ Updated: `/client/src/components/admin/SystemSettings.tsx` (partially - in progress)
  - Added import for hook and EmailState type
  - Replaced separate state variables with hook usage
  - Remaining: Update all references throughout component

---

## Next Steps

1. ✅ Create useEmailSettings hook
2. ✅ Update import in SystemSettings.tsx
3. ✅ Replace state initialization with hook
4. ⏳ Update all functions that reference old states:
   - getEmailConfigForHealthCheck
   - handleEmailConfigChange
   - handleGmailSettingsChange
   - performSave
   - All child components passing emailConfig
5. ⏳ Test all provider switching workflows
6. ⏳ Verify password dirty tracking works
7. ⏳ Ensure no data leakage between providers
8. ⏳ Run full test suite

---

## Rollback Plan

If issues arise, the old state management code is still available for reference. The hook maintains compatibility with the old logic patterns.

---

**Status:** Hook created and partially integrated. Ready for continued refactoring of SystemSettings.tsx functions.
