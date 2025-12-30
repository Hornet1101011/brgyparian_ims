# Template Configuration Architecture

## Overview
The template configuration system uses a dedicated MongoDB `templateconfig` collection to store validation rules and configuration data for document templates.

## Database Collection

### templateconfig Collection
Stores all validation rules and configuration for templates.

**Document Structure:**
```json
{
  "_id": ObjectId,
  "templateId": ObjectId,
  "validations": [
    {
      "placeholder": "FIELD_NAME",
      "fieldType": "string|integer|date|email|phone|text",
      "tooltip": "Help text for user",
      "isRequired": true,
      "maxCharacters": 100,
      "minCharacters": 5,
      "pattern": "regex pattern",
      "enablePastDates": true,
      "enableFutureDates": true,
      "dateRangeStart": "YYYY-MM-DD",
      "dateRangeEnd": "YYYY-MM-DD",
      "autoFillMode": "none|full-date|day-only|month-only|year-only",
      "autoFillValue": "auto-filled value",
      "disabled": false,
      "readOnly": false
    }
  ],
  "config": {},
  "updatedAt": ISODate,
  "updatedBy": ObjectId
}
```

## Backend Endpoints

### GET /api/documents/:fileId/config
Fetches template configuration including validations.

**Response:**
```json
{
  "validations": [...],
  "config": {}
}
```

### POST /api/documents/:fileId/config
Saves template configuration and validations (requires authentication and admin role).

**Request Body:**
```json
{
  "validations": [...],
  "config": {}
}
```

**Backward Compatibility:**
- Legacy `/documents/:fileId/validations` endpoints still work
- They automatically save/load from `templateconfig` collection

## Frontend Components

### TemplateValidationConfig.tsx
**Purpose:** Admin interface for configuring template validations

**Features:**
- Detects placeholders from template HTML preview
- Auto-saves validations every 3 seconds
- localStorage fallback when backend unavailable
- Supports all 6 field types with specific validation rules

**Endpoints Used:**
- GET /documents/{templateId}/config (primary)
- GET /documents/{templateId}/validations (fallback)
- POST /documents/{templateId}/config (primary)
- POST /documents/{templateId}/validations (fallback)

### useTemplateValidations.ts Hook
**Purpose:** Custom hook for consuming validations in forms

**Functions:**
- `getValidation(placeholder)`: Returns validation rule for placeholder
- `validateField(placeholder, value)`: Validates value against rule
- `getAutoFillValue(placeholder)`: Returns auto-filled value for date fields

**Features:**
- Loads from /config endpoint with /validations fallback
- Type-specific validation logic
- Auto-fill support for date fields

### TemplatesManager.tsx
**Purpose:** Admin template management interface

**Integration:**
- Configure button for each template (admin-only)
- Opens TemplateValidationConfig modal
- All validations saved to templateconfig collection
- Staff users see hidden upload/download/delete buttons

### DocumentRequestForm.tsx
**Purpose:** Resident document request form

**Integration:**
- Uses useTemplateValidations hook
- Displays tooltips from validations
- Enforces character limits
- Enforces date restrictions
- Applies field controls (disabled, read-only)

## Data Flow

### Configuration Creation
```
Admin → TemplatesManager → TemplateValidationConfig
  ↓
Detect Placeholders (from HTML preview)
  ↓
Configure Validation Rules
  ↓
POST /documents/:fileId/config
  ↓
MongoDB templateconfig collection
```

### Configuration Usage
```
Resident → DocumentRequestForm
  ↓
useTemplateValidations hook
  ↓
GET /documents/:fileId/config
  ↓
MongoDB templateconfig collection
  ↓
Display tooltips, enforce limits, validate input
```

## Fallback Behavior

### When Backend Unavailable
1. **Loading:** Falls back to localStorage cache
2. **Saving:** Saves to localStorage with warning message
3. **Sync:** Automatically syncs to server when available

### Key localStorage Keys
- `validations_{templateId}`: Stores validation rules temporarily

## Field Types and Validations

### string
- `minCharacters`: Minimum character count
- `maxCharacters`: Maximum character count
- `pattern`: Regex pattern for validation
- `isRequired`: Field is mandatory

### integer
- `minCharacters`: Minimum value
- `maxCharacters`: Maximum value (reused field names for simplicity)
- `isRequired`: Field is mandatory

### date
- `enablePastDates`: Allow dates in the past
- `enableFutureDates`: Allow dates in the future
- `dateRangeStart`: Earliest allowed date (YYYY-MM-DD)
- `dateRangeEnd`: Latest allowed date (YYYY-MM-DD)
- `autoFillMode`: Auto-fill strategy (full-date, day-only, month-only, year-only)
- `isRequired`: Field is mandatory

### email
- `pattern`: Email regex validation
- `isRequired`: Field is mandatory

### phone
- Minimum 10 digits required
- `isRequired`: Field is mandatory

### text
- `minCharacters`: Minimum character count
- `maxCharacters`: Maximum character count
- `isRequired`: Field is mandatory

## Field Controls

### disabled
When true, field is disabled in form (cannot be edited)

### readOnly
When true, field is read-only (can be viewed but not edited)

## Admin-Only Features

- **Configure button** in TemplatesManager (blue SettingOutlined icon)
- **Upload templates** hidden from staff
- **Delete templates** hidden from staff
- **Download templates** hidden from staff

## Migration Notes

- Old `template_validations` collection is not actively used
- New `templateconfig` collection is the source of truth
- Legacy endpoints still support old collection for backward compatibility
- All new saves go to `templateconfig` collection automatically

## Deployment Checklist

- [ ] MongoDB Atlas has `templateconfig` collection created
- [ ] Backend deployed with new /config endpoints
- [ ] Frontend deployed with updated components
- [ ] localStorage fallback tested (disconnect backend)
- [ ] Template configurations load correctly in DocumentRequestForm
- [ ] TemplatesManager shows Configure button for admins
- [ ] Staff users see restricted buttons (hidden upload/delete/download)

## Testing Scenarios

### Scenario 1: Basic Configuration
1. Admin opens TemplatesManager
2. Clicks Configure button on a template
3. Validates placeholders detected correctly
4. Adds validation rule for placeholder
5. Saves configuration
6. Opens DocumentRequestForm
7. Verifies validation rule applied (tooltip, limits, etc.)

### Scenario 2: Backend Unavailable
1. Disable backend API
2. Admin tries to save validation
3. Verifies localStorage fallback message
4. Reopens page
5. Verifies configuration loads from localStorage
6. Re-enable backend
7. Verifies sync happens automatically

### Scenario 3: Auto-fill
1. Configure date field with autoFillMode: "full-date"
2. Open DocumentRequestForm
3. Verify date field auto-fills with current date
4. Change autoFillMode to "day-only"
5. Save and reload
6. Verify date field shows only day (e.g., "15")

### Scenario 4: Role-Based Access
1. Login as staff user
2. Open TemplatesManager
3. Verify no Configure button visible
4. Verify Upload/Delete/Download buttons hidden
5. Login as admin
6. Verify Configure button visible
7. Verify Upload/Delete/Download buttons visible
