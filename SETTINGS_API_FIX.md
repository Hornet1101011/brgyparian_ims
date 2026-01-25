# System Settings API 400 Bad Request Fix

## Issue
The PATCH request to `/api/admin/settings` was failing with a 400 Bad Request error.

## Root Cause
The `performSave` function in `SystemSettings.tsx` was constructing the API payload incorrectly:

1. It was spreading all `settings` fields first (`...settings`)
2. Then trying to override with correctly named fields
3. This resulted in **both** the incorrectly named fields AND correctly named fields being present

### Example of the problem:
```javascript
// The payload contained:
{
  ...settings,  // includes: maxDocumentRequests, allowNewRegistrations, maintainanceMode
  allowRegistrations: ...,  // adds the correct name
  maxDocumentRequestsPerUser: ...,  // adds the correct name
  maintenanceMode: ...  // adds the correct name
}

// Result: Server receives BOTH incorrect and correct field names
// The validator checks and fails because of the unexpected fields
```

## Server-side expectations
The PATCH endpoint at `/api/admin/settings` expects these field names:
- `maintenanceMode` (NOT `maintainanceMode`)
- `allowRegistrations` (NOT `allowNewRegistrations`)
- `maxDocumentRequestsPerUser` (NOT `maxDocumentRequests`)

## Solution
Replaced the spread operator approach with explicit field assignment in `SystemSettings.tsx` line 260-295:

### Changed from:
```typescript
const payload: any = {
  ...settings,
  maintenanceMode: (settings as any).maintainanceMode,
  allowRegistrations: (settings as any).allowNewRegistrations,
  maxDocumentRequestsPerUser: Number((settings as any).maxDocumentRequests) || 1,
  // ...
}
```

### Changed to:
```typescript
const payload: any = {
  siteName: settings.siteName,
  barangayName: settings.barangayName,
  barangayAddress: settings.barangayAddress,
  contactEmail: settings.contactEmail,
  contactPhone: settings.contactPhone,
  systemNotice: settings.systemNotice,
  maintenanceMode: (settings as any).maintainanceMode,
  allowRegistrations: (settings as any).allowNewRegistrations,
  maxDocumentRequestsPerUser: Number((settings as any).maxDocumentRequests) || 1,
  documentProcessingDays: Number(settings.documentProcessingDays) || 1,
  enableVerifications: (settings as any).enableVerifications,
  // ... maxAccountsPerIP if defined
};

// Conditionally add optional fields
if (settings.smtp) {
  payload.smtp = settings.smtp;
}
if ((settings as any).emailSettings) {
  payload.emailSettings = (settings as any).emailSettings;
}
```

## Impact
- The API payload now only contains valid field names expected by the server
- No duplicate or incorrect field names are included
- Server-side validation will pass
- Settings can now be saved successfully

## Files Modified
- `client/src/components/admin/SystemSettings.tsx` (lines 260-295)

## Testing
After rebuilding the client:
1. Navigate to Admin > System Settings
2. Make a change to any setting
3. Click "Save Changes"
4. The request should now succeed with a 200 response instead of 400
