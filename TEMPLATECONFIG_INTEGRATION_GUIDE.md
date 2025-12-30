# Template Configuration Integration Guide

## Overview
The templateconfig collection stores validation rules and configuration for document templates. This guide shows how data flows from the Template Manager through the templateconfig collection and into the Document Request Form.

## Data Flow Architecture

```
ADMIN WORKFLOW (Save)
━━━━━━━━━━━━━━━━━━━━━
TemplatesManager.tsx
    ↓ (Configure button click)
TemplateValidationConfig.tsx
    ↓ (Detect placeholders, add validations)
POST /api/documents/:fileId/config
    ↓ (axiosInstance with auth header)
Server: documents.js route
    ↓ (requireAuth + isAdmin middleware)
MongoDB: templateconfig collection
    ↓ (upsert with templateId)
SAVED: { templateId, validations[], config, updatedAt, updatedBy }

RESIDENT WORKFLOW (Load)
━━━━━━━━━━━━━━━━━━━━━━━━
DocumentRequestForm.tsx
    ↓ (Select template)
useTemplateValidations hook
    ↓ (Load validations)
GET /api/documents/:fileId/config
    ↓ (axiosPublic - no auth needed)
Server: documents.js route
    ↓ (Check if templateconfig exists)
MongoDB: templateconfig collection
    ↓ (findOne by templateId)
Return: { validations[], config }
    ↓ (Map to { placeholder: validation })
DocumentRequestForm
    ↓ (Display tooltips, enforce limits, validate)
APPLIED: Character limits, date restrictions, required fields
```

## Backend Implementation

### 1. Route: POST /api/documents/:fileId/config
**File:** `server/src/routes/documents.js` (Lines 340-378)

**Purpose:** Save template configuration to templateconfig collection

**Authentication:** `requireAuth` + `isAdmin`

**Request Body:**
```json
{
  "validations": [
    {
      "placeholder": "FIELD_NAME",
      "fieldType": "string|integer|date|email|phone|text",
      "tooltip": "Help text",
      "isRequired": true,
      "maxCharacters": 100,
      "minCharacters": 5,
      "pattern": "regex",
      "enablePastDates": true,
      "enableFutureDates": true,
      "dateRangeStart": "YYYY-MM-DD",
      "dateRangeEnd": "YYYY-MM-DD",
      "autoFillMode": "none|full-date|day-only|month-only|year-only",
      "disabled": false,
      "readOnly": false
    }
  ],
  "config": {}
}
```

**Response:**
```json
{
  "success": true,
  "message": "Template configuration saved successfully",
  "result": { ... }
}
```

**Database Operation:**
```javascript
// Upserts into templateconfig collection
db.collection('templateconfig').updateOne(
  { templateId: ObjectId },
  {
    $set: {
      templateId: ObjectId,
      validations: [{ ... }],
      config: {},
      updatedAt: Date,
      updatedBy: ObjectId(user._id)
    }
  },
  { upsert: true }
)
```

### 2. Route: GET /api/documents/:fileId/config
**File:** `server/src/routes/documents.js` (Lines 307-333)

**Purpose:** Retrieve template configuration from templateconfig collection

**Authentication:** None (public endpoint)

**Response:**
```json
{
  "validations": [...],
  "config": {}
}
```

**Database Operation:**
```javascript
// Returns empty config if collection doesn't exist
db.collection('templateconfig').findOne({
  templateId: ObjectId
})
```

## Frontend Implementation

### 1. Admin: TemplateValidationConfig.tsx
**File:** `client/src/components/TemplateValidationConfig.tsx`

**Purpose:** Interface for configuring template validations

**Features:**
- ✅ Detects placeholders from template HTML preview
- ✅ Auto-saves validations every 3 seconds (debounced)
- ✅ localStorage fallback when backend unavailable
- ✅ Supports all 6 field types with specific options
- ✅ Shows configured vs unconfigured placeholders

**Key Methods:**
```typescript
// Load validations from server
loadValidations() → axiosInstance.get(`/documents/${templateId}/config`)

// Auto-save with debouncing (3 second delay)
autoSaveValidations() → axiosInstance.post(`/documents/${templateId}/config`)

// Manual save
handleSaveAll() → axiosInstance.post(`/documents/${templateId}/config`)

// Detect placeholders from HTML
detectPlaceholders(htmlContent) → extracts {FIELD_NAME} patterns
```

**Save Flow:**
```typescript
// Triggered on:
// 1. useEffect when validations change (auto-save after 3 seconds)
// 2. User clicks "Save All Configurations" button

const handleSaveAll = async () => {
  try {
    await axiosInstance.post(`/documents/${templateId}/config`, {
      validations,    // Array of PlaceholderValidation objects
      config: {}      // Empty for now, reserved for future use
    });
    message.success('✓ All validation configurations saved successfully');
  } catch (err) {
    message.error('Failed to save validations');
  }
};
```

### 2. Resident: useTemplateValidations Hook
**File:** `client/src/hooks/useTemplateValidations.ts`

**Purpose:** Custom hook for consuming validations in forms

**Functions:**

#### getValidation(placeholder: string)
```typescript
// Returns validation rule for a placeholder or null
const validation = getValidation('FIRST_NAME');
// Returns: { 
//   placeholder: 'FIRST_NAME', 
//   fieldType: 'string', 
//   maxCharacters: 50,
//   isRequired: true,
//   tooltip: 'Your first name',
//   ...
// }
```

#### validateField(placeholder: string, value: any)
```typescript
// Validates a value against its rule
const result = validateField('EMAIL', 'user@example.com');
// Returns: { valid: true } or { valid: false, error: 'Invalid email' }

// Type-specific validation:
// - string/text: length limits, pattern matching
// - email: email regex
// - phone: 10+ digits
// - integer: numeric validation
// - date: past/future restrictions
```

#### getAutoFillValue(placeholder: string)
```typescript
// Returns pre-filled value for date fields
// Example: If autoFillMode is 'full-date', returns today's date in MM/DD/YYYY
```

### 3. Resident: DocumentRequestForm.tsx
**File:** `client/src/components/DocumentRequestForm.tsx`

**Purpose:** Form for requesting documents

**Integration Points:**

#### Load Validations
```typescript
// On template selection
const { getValidation, validateField } = useTemplateValidations(selectedTemplateId);

// useTemplateValidations automatically:
// 1. Fetches config via GET /documents/:fileId/config
// 2. Maps validations array to Record<placeholder, validation>
// 3. Provides getter/validator methods
```

#### Display Tooltips
```typescript
{fieldValidation?.tooltip && (
  <Tooltip title={fieldValidation.tooltip}>
    <span style={{ marginLeft: 8, color: '#1890ff', cursor: 'help' }}>ℹ️</span>
  </Tooltip>
)}
```

#### Apply Constraints
```typescript
// Character limits (maxCharacters)
<Input 
  maxLength={fieldValidation?.maxCharacters}
  placeholder={`Max ${fieldValidation?.maxCharacters} characters`}
/>

// Required fields
rules={[
  validation?.isRequired && { required: true, message: 'This field is required' }
]}

// Read-only / Disabled
disabled={fieldValidation?.disabled}
readOnly={fieldValidation?.readOnly}

// Date ranges
<DatePicker
  disabledDate={(date) => {
    if (!validation?.enablePastDates && date < today) return true;
    if (!validation?.enableFutureDates && date > today) return true;
    return false;
  }}
/>
```

#### Validate on Submit
```typescript
const processedFields: Record<string, any> = {};
let isValid = true;

Object.entries(formValues.fields).forEach(([placeholder, value]) => {
  const result = validateField(placeholder, value);
  if (!result.valid) {
    message.error(`${placeholder}: ${result.error}`);
    isValid = false;
  }
  processedFields[placeholder] = value;
});

if (isValid) {
  // Submit request
}
```

## Database Schema

### templateconfig Collection
```javascript
{
  _id: ObjectId,
  templateId: ObjectId,           // Reference to file in documents.files
  validations: [
    {
      placeholder: "FIRST_NAME",
      fieldType: "string",
      tooltip: "Your first name as it appears on ID",
      isRequired: true,
      maxCharacters: 50,
      minCharacters: 2,
      pattern: null,
      enablePastDates: null,
      enableFutureDates: null,
      dateRangeStart: null,
      dateRangeEnd: null,
      autoFillMode: "none",
      autoFillValue: null,
      disabled: false,
      readOnly: false
    },
    {
      placeholder: "DATE_OF_REQUEST",
      fieldType: "date",
      tooltip: "Today's date (auto-filled)",
      isRequired: true,
      enablePastDates: false,
      enableFutureDates: false,
      autoFillMode: "full-date",  // Automatically fills with today's date
      disabled: false,
      readOnly: true              // User cannot change it
    }
  ],
  config: {},                      // Reserved for future configuration
  updatedAt: ISODate,
  updatedBy: ObjectId             // User who last saved config
}
```

### Indexes
```javascript
// Created automatically in src/index.ts
db.templateconfig.createIndex({ templateId: 1 })
db.templateconfig.createIndex({ updatedAt: 1 })
```

## Complete Workflow Example

### Step 1: Admin Configures Template
```
1. Admin navigates to TemplatesManager
2. Finds a template (e.g., "Birth Certificate")
3. Clicks blue "⚙️ Configure" button
4. TemplateValidationConfig modal opens
5. System detects placeholders: {FIRST_NAME}, {DATE_OF_BIRTH}, {PLACE_OF_BIRTH}
6. Admin configures:
   - {FIRST_NAME}: string, max 50 chars, required, tooltip "Full name"
   - {DATE_OF_BIRTH}: date, past dates only, tooltip "DOB"
   - {PLACE_OF_BIRTH}: string, max 100 chars, tooltip "City/Municipality"
7. Admin clicks "Save All Configurations"
8. Saves to: POST /api/documents/{templateId}/config
9. Data stored in templateconfig collection
```

### Step 2: Resident Requests Document
```
1. Resident navigates to DocumentRequestForm
2. Searches and clicks on "Birth Certificate" template
3. Modal opens with form fields
4. useTemplateValidations hook loads validations via:
   GET /api/documents/{templateId}/config
5. Form displays:
   - {FIRST_NAME} input with:
     - Tooltip: "Full name"
     - Max length: 50 characters
     - Required: ✓
   - {DATE_OF_BIRTH} date picker with:
     - Tooltip: "DOB"
     - Cannot select future dates
     - Cannot select dates beyond today
   - {PLACE_OF_BIRTH} input with:
     - Tooltip: "City/Municipality"
     - Max length: 100 characters
6. Resident fills form
7. On submit, validateField() checks each value
8. If valid, requests document
9. Document processing uses submitted fieldValues
```

## Testing the Integration

### Test 1: Save Configuration
```bash
# 1. Login as admin
# 2. Go to Templates Manager
# 3. Click Configure on any template
# 4. Add validation for {FIRST_NAME}:
#    - Field Type: string
#    - Max Characters: 50
#    - Is Required: ✓
#    - Tooltip: "Enter your first name"
# 5. Click "Save All Configurations"
# 6. Should see: "✓ All validation configurations saved successfully"

# Verify in MongoDB:
db.templateconfig.findOne({ templateId: ObjectId('...') })
# Should return saved validation
```

### Test 2: Load Configuration
```bash
# 1. Login as resident
# 2. Go to Document Request Form
# 3. Click on the template you just configured
# 4. Form should show:
#    - Input field for {FIRST_NAME}
#    - Tooltip icon with message
#    - Max length constraint (try typing beyond 50 chars)
#    - Required indicator (*)

# Verify in browser console:
# Should see GET request to /api/documents/{templateId}/config
# Response should include validations array
```

### Test 3: Validation Enforcement
```bash
# 1. Fill the {FIRST_NAME} field with more than 50 characters
# 2. Try to submit the form
# 3. Should show error: "Maximum 50 characters allowed"

# 1. Leave {FIRST_NAME} empty (if required)
# 2. Try to submit
# 3. Should show error: "This field is required"
```

### Test 4: Date Field Auto-Fill
```bash
# 1. Configure {DATE_OF_REQUEST} with:
#    - Field Type: date
#    - Auto-Fill Mode: full-date
#    - Read Only: ✓
# 2. Save configuration
# 3. Request the document
# 4. Form should show:
#    - Date field pre-filled with today's date
#    - Field appears gray/disabled (read-only)
#    - User cannot change the date
```

## Troubleshooting

### Configuration Not Saving
**Problem:** Save button shows loading but nothing happens
**Solution:**
1. Check admin authentication (must have admin role)
2. Check browser console for error details
3. Verify templateconfig collection exists: `db.templateconfig.count()`
4. Check backend logs: `POST /documents/{fileId}/config`

### Configuration Not Loading
**Problem:** Validations don't appear in DocumentRequestForm
**Solution:**
1. Check browser Network tab: GET /documents/{fileId}/config
2. Response should include validations array
3. If collection doesn't exist, returns empty array (expected)
4. Check that templateId matches the file ID

### Validations Not Enforcing
**Problem:** Form accepts invalid input
**Solution:**
1. Verify validations loaded: Check browser console Network tab
2. Verify validateField() is called on submit
3. Check that rules array includes validation checks
4. Verify DocumentRequestForm uses useTemplateValidations hook

## Migration from Old System

If upgrading from previous template validation system:

1. **Old data in `template_validations` collection** → Not used anymore
2. **New data in `templateconfig` collection** → Source of truth
3. **Both endpoints still work** (for backward compatibility):
   - POST `/documents/:fileId/validations` → Saves to templateconfig
   - GET `/documents/:fileId/validations` → Reads from templateconfig
4. **No data migration needed** → Old data can be ignored

## Performance Notes

- **Indexes:** templateId and updatedAt are indexed for fast lookups
- **Auto-save:** 3-second debounce prevents excessive writes
- **Caching:** useTemplateValidations hook uses React state, not client-side cache
- **Load time:** GET /config is very fast (indexed lookup)

## Future Enhancements

Possible improvements to the templateconfig system:

1. **Template inheritance:** Config templates that apply to multiple templates
2. **Conditional validation:** Show/hide fields based on other field values
3. **Custom validation rules:** Allow admins to write custom JS validators
4. **Localization:** Multi-language field labels and tooltips
5. **Versioning:** Track changes to validations over time
6. **Bulk configuration:** Apply same validation to multiple templates
7. **Validation templates:** Save common validation sets for reuse

---

## Summary

The templateconfig collection integration provides:

✅ **Admin capability:** Configure validations per template  
✅ **Resident experience:** Enforced constraints and helpful tooltips  
✅ **Data persistence:** MongoDB storage with proper indexing  
✅ **Automatic flow:** No manual steps needed once configured  
✅ **Backward compatibility:** Legacy endpoints still work  
✅ **Offline support:** localStorage fallback when backend unavailable  

The system is production-ready and fully integrated across the codebase!
