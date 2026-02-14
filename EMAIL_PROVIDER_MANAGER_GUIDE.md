# EmailProviderManager Utility - Comprehensive Guide

## Overview

The `EmailProviderManager` is a centralized utility for managing SMTP and email provider configurations across the Barangay System. It provides:

- **Provider Metadata**: Required fields, default ports, common ports per provider
- **Validation**: Comprehensive validation rules for all provider types
- **Normalization**: Automatic configuration normalization (port → secure mapping, field name normalization)
- **Helper Methods**: Password masking detection, field formatting, validation summaries

## File Location

```
client/src/utils/EmailProviderManager.ts
```

## Supported Providers

### 1. Custom SMTP Provider
```typescript
{
  requiredFields: ['host', 'port', 'user', 'password', 'fromEmail'],
  defaultPort: 587,
  commonPorts: [25, 465, 587, 2525, 3025],
  supportsSecure: true
}
```

### 2. Mailtrap (SMTP)
```typescript
{
  requiredFields: ['host', 'port', 'user', 'password', 'fromEmail'],
  defaultPort: 2525,
  commonPorts: [465, 587, 2525],
  supportsSecure: true
}
```

### 3. SendGrid (API)
```typescript
{
  requiredFields: ['apiKey', 'fromEmail'],
  defaultPort: 0,  // Not applicable
  commonPorts: [],
  supportsSecure: false
}
```

### 4. Gmail (SMTP)
```typescript
{
  requiredFields: ['user', 'password', 'fromEmail'],
  defaultPort: 465,
  commonPorts: [465, 587],
  supportsSecure: true
}
```

### 5. AWS SES (API)
```typescript
{
  requiredFields: ['awsAccessKeyId', 'awsSecretAccessKey', 'awsRegion', 'fromEmail'],
  defaultPort: 0,  // Not applicable
  commonPorts: [],
  supportsSecure: false
}
```

## API Methods

### Validation Methods

#### `getRequiredFields(provider: EmailProvider): string[]`
Returns array of required field names for the provider.

```typescript
const fields = EmailProviderManager.getRequiredFields('mailtrap');
// ['host', 'port', 'user', 'password', 'fromEmail']
```

#### `validateConfig(config: object, provider: EmailProvider): string[]`
Validates a configuration object against provider requirements.

Returns array of validation error messages (empty if valid).

```typescript
const errors = EmailProviderManager.validateConfig({
  host: 'smtp.mailtrap.io',
  port: 2525,
  user: 'user123',
  password: 'secure-password',
  fromEmail: 'sender@example.com'
}, 'mailtrap');
// [] (valid)

const errors = EmailProviderManager.validateConfig({
  host: '',
  port: 'invalid',
  user: 'user',
  password: '',
  fromEmail: 'not-email'
}, 'custom');
// ['Host appears invalid', 'Port must be between 1 and 65535', ...]
```

**Validation Rules:**

| Field | Rule |
|-------|------|
| `host` | Non-empty string, minimum 3 characters |
| `port` | Integer between 1-65535 |
| `user`/`username` | Non-empty string |
| `fromEmail` | Valid email (contains @) |
| `password`/`apiKey`/credentials | Non-empty, non-masked |
| `awsRegion` | Non-empty string, minimum 2 characters |

#### `isConfigComplete(config: object, provider: EmailProvider): boolean`
Quick check if configuration is valid (no errors).

```typescript
if (EmailProviderManager.isConfigComplete(config, 'gmail')) {
  // Configuration is ready for use
}
```

### Port & Secure Methods

#### `getDefaultPort(provider: EmailProvider): number`
Returns default port for provider.

```typescript
const port = EmailProviderManager.getDefaultPort('mailtrap'); // 2525
const port = EmailProviderManager.getDefaultPort('gmail');    // 465
```

#### `getCommonPorts(provider: EmailProvider): number[]`
Returns array of common ports for provider (useful for dropdowns).

```typescript
const ports = EmailProviderManager.getCommonPorts('custom');
// [25, 465, 587, 2525, 3025]
```

#### `calculateSecureFromPort(port: number, provider?: EmailProvider): boolean`
**Automatically calculates secure flag based on port number.**

This is the key method for centralizing secure flag calculation.

```typescript
// Port 465 = SSL/TLS implicit
EmailProviderManager.calculateSecureFromPort(465) // true

// Port 587 = STARTTLS
EmailProviderManager.calculateSecureFromPort(587) // false

// Port 25 = Plain SMTP
EmailProviderManager.calculateSecureFromPort(25)  // false

// Port 2525 = Mailtrap non-TLS
EmailProviderManager.calculateSecureFromPort(2525) // false

// Unknown port >= 465 = SSL
EmailProviderManager.calculateSecureFromPort(8465) // true

// Unknown port < 465 = not secure
EmailProviderManager.calculateSecureFromPort(1234) // false
```

**Port to Secure Mapping:**
```
25    → false (Plain SMTP)
465   → true  (SMTPS - Implicit TLS)
587   → false (Submission - STARTTLS)
2525  → false (Mailtrap - non-TLS)
3025  → false (Alt submission)
```

#### `supportsSecure(provider: EmailProvider): boolean`
Checks if provider supports secure connections.

```typescript
EmailProviderManager.supportsSecure('gmail');     // true
EmailProviderManager.supportsSecure('sendgrid');  // false
```

#### `portIndicatesSecure(port: number): boolean`
Alias for `calculateSecureFromPort()` - checks if port indicates secure connection.

```typescript
if (EmailProviderManager.portIndicatesSecure(465)) {
  // Use SSL/TLS
}
```

### Normalization Methods

#### `normalizeConfig(config: object, provider: EmailProvider): object`
**Normalizes configuration object:**
- Automatically calculates secure flag from port
- Maps `user` → `username` for API compatibility
- Removes undefined/null optional fields

```typescript
const config = {
  host: 'smtp.mailtrap.io',
  port: 2525,
  user: 'user123',
  password: 'pwd',
  fromEmail: 'sender@example.com',
  fromName: 'System',
  undefined_field: undefined
};

const normalized = EmailProviderManager.normalizeConfig(config, 'mailtrap');
// {
//   host: 'smtp.mailtrap.io',
//   port: 2525,
//   user: 'user123',
//   username: 'user123',  // Added
//   password: 'pwd',
//   secure: false,        // Auto-calculated from port
//   fromEmail: 'sender@example.com',
//   fromName: 'System'
//   // undefined_field removed
// }
```

### Helper Methods

#### `isMaskedPassword(password: string): boolean`
Detects if password is a masked placeholder (e.g., "****").

```typescript
EmailProviderManager.isMaskedPassword('****')      // true
EmailProviderManager.isMaskedPassword('my-pass')   // false
EmailProviderManager.isMaskedPassword('*****ping') // false (not all asterisks)
```

#### `formatFieldName(fieldName: string): string`
Formats field names for display (e.g., 'fromEmail' → 'From Email').

```typescript
EmailProviderManager.formatFieldName('fromEmail');      // 'From Email'
EmailProviderManager.formatFieldName('awsAccessKeyId'); // 'Aws Access Key Id'
EmailProviderManager.formatFieldName('password');       // 'Password'
```

#### `formatValidationErrors(errors: string[]): string`
Formats validation errors as numbered list for display.

```typescript
const errors = ['SMTP host is required', 'Port must be between 1 and 65535'];
const formatted = EmailProviderManager.formatValidationErrors(errors);
// "1. SMTP host is required\n2. Port must be between 1 and 65535"
```

#### `getDefaultConfig(provider: EmailProvider): object`
Returns default/empty configuration for provider.

```typescript
const defaultConfig = EmailProviderManager.getDefaultConfig('gmail');
// {
//   host: 'smtp.gmail.com',
//   port: 465,
//   user: '',
//   password: '',
//   fromEmail: '',
//   fromName: 'Barangay System',
//   secure: true
// }
```

## Usage Examples

### Example 1: Validating User Input

```typescript
import EmailProviderManager from '../../utils/EmailProviderManager';

function handleSaveConfig(config, provider) {
  // Validate configuration
  const errors = EmailProviderManager.validateConfig(config, provider);
  
  if (errors.length > 0) {
    // Show validation errors to user
    const errorMessage = EmailProviderManager.formatValidationErrors(errors);
    message.error(`Configuration errors:\n${errorMessage}`);
    return;
  }

  // Normalize configuration for API
  const normalized = EmailProviderManager.normalizeConfig(config, provider);
  
  // Send to backend
  api.post('/settings/email', { emailConfig: normalized });
}
```

### Example 2: Auto-Calculate Secure Flag

```typescript
function handlePortChange(newPort, provider) {
  // Automatically determine if SSL/TLS should be enabled
  const secure = EmailProviderManager.calculateSecureFromPort(newPort, provider);
  
  setConfig({
    ...config,
    port: newPort,
    secure: secure  // Auto-calculated
  });
}

// In component:
<TextField
  label="SMTP Port"
  value={config.port}
  onChange={(e) => {
    const port = parseInt(e.target.value);
    handlePortChange(port, 'mailtrap');
  }}
/>
```

### Example 3: Password Masking Detection

```typescript
function handleTestEmail(password, config, provider) {
  // Check if password looks masked
  if (EmailProviderManager.isMaskedPassword(password)) {
    message.error('Please enter the actual password, not a masked placeholder');
    return;
  }

  // Validate config
  const errors = EmailProviderManager.validateConfig(config, provider);
  if (errors.length > 0) {
    message.error('Please fix configuration errors first');
    return;
  }

  // Send test email
  api.post('/settings/email/test', {
    emailConfig: EmailProviderManager.normalizeConfig(config, provider),
    testEmail: testRecipient
  });
}
```

### Example 4: Required Fields Display

```typescript
function renderForm(provider) {
  const requiredFields = EmailProviderManager.getRequiredFields(provider);
  const defaultPort = EmailProviderManager.getDefaultPort(provider);
  
  return (
    <Box>
      <Typography variant="body2" color="textSecondary">
        Required fields: {requiredFields.map(EmailProviderManager.formatFieldName).join(', ')}
      </Typography>
      
      {provider !== 'sendgrid' && (
        <TextField
          label="SMTP Port"
          defaultValue={defaultPort}
          helperText={`Common ports: ${EmailProviderManager.getCommonPorts(provider).join(', ')}`}
        />
      )}
    </Box>
  );
}
```

### Example 5: Configuration Completeness Check

```typescript
function canSubmitForm(config, provider) {
  if (!EmailProviderManager.isConfigComplete(config, provider)) {
    return false; // Configuration not complete
  }
  
  // Proceed with submission
  return true;
}
```

## Integration with CustomSmtpSettings.tsx

The EmailProviderManager is integrated into CustomSmtpSettings.tsx for:

1. **Validation**: All SMTP field validation uses `validateConfig()`
2. **Password Checks**: Masked password detection uses `isMaskedPassword()`
3. **Normalization**: Payload building uses `normalizeConfig()`
4. **Port → Secure**: Port change handler uses `calculateSecureFromPort()`

```typescript
// Example from CustomSmtpSettings.tsx

// Port change with auto-secure calculation
onChange={(e) => {
  const port = parseInt(e.target.value) || 2525;
  const secure = EmailProviderManager.calculateSecureFromPort(port, 'mailtrap');
  setMailtrapConfig({ ...mailtrapConfig, port, secure });
}}

// Validation
const errors = EmailProviderManager.validateConfig(config, 'custom');
if (errors.length > 0) {
  message.error(EmailProviderManager.formatValidationErrors(errors));
  return;
}

// Normalization
const normalized = EmailProviderManager.normalizeConfig(config, provider);
```

## Benefits of Centralization

### 1. **Single Source of Truth**
- All validation rules in one place
- Consistent behavior across components
- Easy to add new providers or update rules

### 2. **Automatic Secure Flag Calculation**
- No more inline port → secure mapping
- Consistent across all components
- Easily updatable in one location

### 3. **Field Normalization**
- Handles `user` → `username` mapping for API
- Removes undefined fields automatically
- Ensures clean payloads for backend

### 4. **Provider Metadata**
- Define required fields per provider once
- Reusable across components
- Easy to add new providers

### 5. **Code Reduction**
- Replaces ~70 lines of scattered validation
- Removes inline helper functions
- Centralizes validation patterns

## Migration Guide

### Before (Scattered Validation)
```typescript
// In CustomSmtpSettings.tsx - lines scattered everywhere
if (!emailConfig.host || emailConfig.host.trim() === '') {
  validationErrors.push('SMTP host is required');
}
if (!emailConfig.port || emailConfig.port < 1 || emailConfig.port > 65535) {
  validationErrors.push('SMTP port must be between 1 and 65535');
}
if (/^\*+$/.test(smtpPassword)) {
  antdMessage.error('Password appears to be masked...');
}
const requestPayload = {
  username: emailConfig.user,  // Manual mapping
  secure: emailConfig.secure,  // Already normalized
  ...
};
```

### After (Centralized with EmailProviderManager)
```typescript
// Using EmailProviderManager
const errors = EmailProviderManager.validateConfig({
  host: emailConfig.host,
  port: emailConfig.port,
  user: emailConfig.user,
  password: smtpPassword,
  fromEmail: emailConfig.fromEmail
}, 'custom');

if (EmailProviderManager.isMaskedPassword(smtpPassword)) {
  antdMessage.error('...');
}

const normalized = EmailProviderManager.normalizeConfig(config, 'custom');
const requestPayload = {
  emailConfig: normalized,
  testEmail: recipient
};
```

## Future Enhancements

1. **Provider-Specific Validators**: Custom validation logic per provider type
2. **Dynamic Port Suggestions**: Suggest ports based on provider
3. **Credential Encryption**: Handle credential encryption/decryption
4. **Provider Detection**: Auto-detect provider from hostname
5. **Configuration Templates**: Pre-built configs for popular services

## Testing

### Unit Tests

```typescript
describe('EmailProviderManager', () => {
  it('validates required fields', () => {
    const errors = EmailProviderManager.validateConfig({}, 'mailtrap');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('calculates secure from port', () => {
    expect(EmailProviderManager.calculateSecureFromPort(465)).toBe(true);
    expect(EmailProviderManager.calculateSecureFromPort(587)).toBe(false);
  });

  it('detects masked passwords', () => {
    expect(EmailProviderManager.isMaskedPassword('****')).toBe(true);
    expect(EmailProviderManager.isMaskedPassword('my-pass')).toBe(false);
  });

  it('normalizes configuration', () => {
    const config = { user: 'john', port: 465, secure: false };
    const normalized = EmailProviderManager.normalizeConfig(config, 'custom');
    expect(normalized.username).toBe('john');
    expect(normalized.secure).toBe(true); // Recalculated
  });
});
```

## Troubleshooting

### Secure Flag Not Auto-Updating
**Issue**: Port changed but secure flag didn't update
**Solution**: Ensure port change handler calls `calculateSecureFromPort()`

```typescript
// Wrong - doesn't auto-calculate
onChange={(e) => setConfig({ ...config, port: e.target.value })}

// Correct - auto-calculates secure
onChange={(e) => {
  const port = parseInt(e.target.value);
  setConfig({
    ...config,
    port,
    secure: EmailProviderManager.calculateSecureFromPort(port)
  });
}}
```

### Validation Always Fails
**Issue**: Configuration fails validation even with valid data
**Solution**: Verify all required fields are present

```typescript
const required = EmailProviderManager.getRequiredFields(provider);
console.log('Required fields:', required);
// Make sure config has all required fields
```

### Field Names Not Normalizing
**Issue**: Backend complains about unknown field name
**Solution**: Call `normalizeConfig()` before sending to API

```typescript
// Wrong - sends 'user' instead of 'username'
api.post('/settings', { emailConfig: config });

// Correct - normalizes fields
const normalized = EmailProviderManager.normalizeConfig(config, provider);
api.post('/settings', { emailConfig: normalized });
```

## Summary

The `EmailProviderManager` utility provides a centralized, reusable approach to email provider configuration management. It eliminates scattered validation logic, provides automatic secure flag calculation, and ensures consistent configuration handling across all components.

**Key Benefits:**
- ✅ Validation logic in one place
- ✅ Automatic secure flag calculation based on port
- ✅ Field normalization for API compatibility
- ✅ Helper methods for password masking, formatting, etc.
- ✅ Support for multiple provider types
- ✅ Easy to extend with new providers
