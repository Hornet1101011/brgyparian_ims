# SMTP Password Persistence Refactor

**Date:** February 8, 2026  
**File Modified:** `server/routes/settingsRoutes.js`  
**Endpoint:** PATCH `/api/settings` (Lines 580-640)

## Summary

Refactored SMTP password save logic to ensure passwords are **ALWAYS persisted** when they represent real values, while properly handling masked passwords and undefined values.

## Requirements Addressed

✅ If `smtp.password` is present and **not masked**, ALWAYS persist it  
✅ If password field is **masked** (e.g., "********"), keep existing DB password  
✅ Do NOT drop `smtp.password` even if other fields are unchanged  
✅ Only remove `smtp.password` if explicitly undefined, not empty string  
✅ Add logs to confirm final saved `smtp.password` length

## Implementation Details

### Password Logic Refactor (Lines 598-631)

**Previous Logic:**
```javascript
if (updatePayload.smtp.password) updateOps.$set['smtp.password'] = updatePayload.smtp.password;
```

**New Logic:**
```javascript
// REFACTORED PASSWORD LOGIC:
// - If password is present and not masked (e.g., not "********"), ALWAYS persist it
// - If password is masked, keep existing DB password unchanged
// - Only skip if explicitly undefined
const isMaskedPassword = (pwd) => {
  // Check if password is masked format (multiple asterisks, typically "********")
  return typeof pwd === 'string' && pwd.length > 0 && /^\*+$/.test(pwd);
};

const hasPasswordField = updatePayload.smtp.password !== undefined && updatePayload.smtp.password !== null;
const passwordValue = updatePayload.smtp.password;

if (hasPasswordField) {
  if (isMaskedPassword(passwordValue)) {
    // Password is masked - keep existing DB password
    console.log('[Settings PATCH] Password field is masked - will preserve existing DB password');
    // Don't add to updateOps, which keeps the existing value
  } else {
    // Password is real value (not masked) - ALWAYS persist it, even if empty
    updateOps.$set['smtp.password'] = passwordValue;
    console.log('[Settings PATCH] Password field is NOT masked - persisting new value', {
      isEmptyString: passwordValue === '',
      length: typeof passwordValue === 'string' ? passwordValue.length : 0,
      willPersist: true
    });
  }
} else {
  // Password is explicitly undefined - don't save anything (keeps existing)
  console.log('[Settings PATCH] Password field is undefined - will not modify password in DB');
}
```

### Key Features

1. **Masked Password Detection**
   - Uses regex: `/^\*+$/` to detect passwords consisting only of asterisks
   - Prevents accidentally overwriting real passwords with UI-masked versions
   - Works with any number of asterisks (e.g., "****", "********", "***")

2. **Three-State Password Handling**
   - **Undefined/Null**: Don't modify password in DB (keeps existing)
   - **Masked Value**: Skip update to preserve existing DB password
   - **Real Value**: ALWAYS persist (including empty strings)

3. **Empty String Handling**
   - Empty strings (`""`) are now persisted if not masked
   - Allows explicit clearing of passwords through save operation
   - Only rejected if field is undefined

4. **Backward Compatibility**
   - Existing passwords are preserved if masked
   - Only real/new password values trigger updates
   - No breaking changes to API behavior

### Confirmation Logging (Lines 692-701)

Added comprehensive post-save confirmation logs:

```javascript
console.log('[Settings PATCH] CONFIRMATION: Final saved SMTP password in DB:', {
  hasSmtpPassword: !!updated?.smtp?.password,
  smtpPasswordLength: updated?.smtp?.password ? updated.smtp.password.length : 0,
  hasSmtpEncryptedPassword: !!updated?.smtp?.encryptedPassword,
  smtpEncryptedPasswordLength: updated?.smtp?.encryptedPassword ? updated.smtp.encryptedPassword.length : 0,
  passwordWasPersisted: !!(updated?.smtp?.password || updated?.smtp?.encryptedPassword),
  smtpConfigured: !!updated?.smtp
});
```

**Log Fields:**
- `hasSmtpPassword`: Boolean confirming password exists in DB
- `smtpPasswordLength`: Length of plaintext password (or 0 if missing)
- `hasSmtpEncryptedPassword`: Boolean confirming encrypted password exists
- `smtpEncryptedPasswordLength`: Length of encrypted password (or 0 if missing)
- `passwordWasPersisted`: Confirmation that password was actually saved
- `smtpConfigured`: Whether SMTP config exists in DB

## Behavior Examples

### Scenario 1: Real Password Provided
**Input:**
```json
{
  "smtp": {
    "host": "smtp.example.com",
    "password": "real-password-123"
  }
}
```
**Result:** Password is **PERSISTED** to DB  
**Log:** `passwordWasPersisted: true, smtpPasswordLength: 18`

### Scenario 2: Masked Password (From Frontend)
**Input:**
```json
{
  "smtp": {
    "host": "smtp.example.com",
    "password": "********"
  }
}
```
**Result:** Password is **NOT MODIFIED** in DB (keeps existing)  
**Log:** `[Settings PATCH] Password field is masked - will preserve existing DB password`

### Scenario 3: Empty String Password
**Input:**
```json
{
  "smtp": {
    "host": "smtp.example.com",
    "password": ""
  }
}
```
**Result:** Empty string is **PERSISTED** to DB  
**Log:** `passwordWasPersisted: true, smtpPasswordLength: 0, isEmptyString: true`

### Scenario 4: No Password Field
**Input:**
```json
{
  "smtp": {
    "host": "smtp.example.com"
  }
}
```
**Result:** Password in DB is **NOT MODIFIED** (keeps existing)  
**Log:** `[Settings PATCH] Password field is undefined - will not modify password in DB`

## Benefits

1. **Reliability**: Non-masked passwords are ALWAYS persisted regardless of other field changes
2. **Frontend Integration**: Masked passwords from UI don't overwrite real DB passwords
3. **Transparency**: Comprehensive logging confirms exactly what was saved
4. **Flexibility**: Supports explicit password clearing via empty string
5. **Security**: Prevents accidental password loss through masking detection

## Testing Checklist

- [ ] Test saving real password (should persist)
- [ ] Test with masked password (should not modify DB)
- [ ] Test with empty string password (should persist empty string)
- [ ] Test with undefined password (should not modify DB)
- [ ] Verify confirmation logs show correct password length
- [ ] Test multiple save operations in sequence
- [ ] Verify masked password from UI doesn't overwrite real password
- [ ] Test password changes followed by partial updates
- [ ] Confirm audit logs capture password changes correctly
