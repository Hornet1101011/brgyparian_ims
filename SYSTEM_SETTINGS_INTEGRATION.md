# System Settings to LoginForm Integration Guide

## Overview
The barangay information and contact information displayed on the login page are now **completely controlled by the System Settings** configured in the admin panel. This is a real-time, fully-integrated system where changes made by admins immediately appear to visitors.

## Architecture

### 1. System Settings Source
**Location:** Admin Panel → System Settings

The following fields control the login page display:
- **Site Name** - Title shown on barangay information card
- **Barangay Name** - Official name of the barangay
- **Barangay Address** - Complete address of the barangay office
- **Contact Email** - Email address for inquiries (must be valid)
- **Contact Phone** - Phone number for inquiries (minimum 7 digits)

### 2. Data Flow

```
Admin Panel (SystemSettings.tsx)
    ↓
    └─→ Save Settings (PATCH /api/admin/settings)
         ↓
         └─→ Database (SystemSetting collection)
              ↓
              └─→ Public Endpoint (GET /api/settings/public)
                   ↓
                   └─→ LoginForm (useSystemSettings hook)
                        ↓
                        └─→ Display Cards
                             ├─ BarangayInfoCard
                             └─ ContactInfoCard
```

### 3. Custom Hook: `useSystemSettings`

**Location:** `client/src/hooks/useSystemSettings.ts`

Features:
- Automatically fetches public system settings
- Refreshes every 30 seconds to pick up admin changes
- Handles errors gracefully with fallbacks
- Works without authentication (public endpoint)
- Provides TypeScript interface for settings

**Usage:**
```typescript
const { settings, loading, error } = useSystemSettings(true);

// Access settings
settings?.barangayName
settings?.contactEmail
settings?.systemNotice
```

### 4. LoginForm Components

#### BarangayInfoCard
- **Controlled by:**
  - `siteName` - Used as the card title
  - `barangayName` - Displayed as main information
  - `barangayAddress` - Displayed below name

- **Display Logic:**
  - Shows loading spinner while fetching
  - Only displays fields that have values
  - Shows helpful message if no data configured
  - Dynamic title based on siteName setting

#### ContactInfoCard
- **Controlled by:**
  - `contactEmail` - Clickable mailto link
  - `contactPhone` - Clickable tel link

- **Validation:**
  - Email: Must match `^[^\s@]+@[^\s@]+\.[^\s@]+$`
  - Phone: Must have at least 7 digits
  - Invalid fields are hidden from display

- **Display Logic:**
  - Only shows valid contact methods
  - Creates interactive links automatically
  - Shows helpful message if no valid contact info

### 5. Backend Endpoints

#### `/api/settings/public` (GET)
Returns public-facing system settings (no authentication required)

**Response:**
```json
{
  "siteName": "Barangay Information Management System",
  "barangayName": "Barangay Parian",
  "barangayAddress": "Calamba, Laguna",
  "contactEmail": "barangayparian@gmail.com",
  "contactPhone": "09614215746",
  "systemNotice": "System will be under maintenance on..."
}
```

#### `/api/admin/settings` (PATCH) - Admin Only
Updates system settings in the database

## Real-Time Updates

The system is designed for **real-time updates**:

1. **Admin makes change** in System Settings
2. **Click Save** to persist to database
3. **Auto-refresh on login page** (every 30 seconds)
4. **Visitors see updated information** immediately or within 30 seconds

## Key Features

### 1. Validation
- Email addresses must be valid format
- Phone numbers must have minimum 7 digits
- Invalid entries are automatically hidden
- No broken links displayed

### 2. Graceful Handling
- Missing settings don't break the UI
- Helpful placeholder messages shown
- Loading states displayed during fetch
- Error handling with fallbacks

### 3. Performance
- Single hook for efficient data fetching
- 30-second refresh interval (configurable)
- No authentication required for public endpoint
- Minimal network overhead

### 4. Admin Control
- Complete control over displayed information
- Real-time preview in settings panel
- Input validation with helper text
- Alerts explaining field usage

## Testing the Connection

### For Admins
1. Go to Admin Panel → System Settings
2. Update "Barangay Name" field
3. Click Save button
4. Wait up to 30 seconds
5. Go to login page (refresh)
6. Confirm changes appear in Barangay Information card

### For Developers
```typescript
// In console on login page
const settings = await fetch('/api/settings/public').then(r => r.json());
console.log(settings);
```

## Configuration

### Auto-Refresh Interval
Location: `client/src/hooks/useSystemSettings.ts`
Default: 30 seconds (configurable)

To change:
```typescript
// In LoginForm.tsx
const { settings: systemSettings } = useSystemSettings(true); // true = auto-refresh enabled
```

To disable auto-refresh:
```typescript
const { settings: systemSettings } = useSystemSettings(false); // false = no auto-refresh
```

## Troubleshooting

### Settings Not Appearing
1. Verify settings are saved in admin panel
2. Check `/api/settings/public` endpoint directly
3. Wait 30+ seconds for auto-refresh
4. Refresh login page manually
5. Check browser console for errors

### Invalid Data Displayed
1. Validate email format (must have @ and .)
2. Validate phone format (minimum 7 digits)
3. Check for extra spaces in values
4. Re-save settings in admin panel

### Performance Issues
1. Check network tab for slow responses
2. Verify backend is running
3. Check MongoDB connection
4. Review server logs

## Files Modified

### Client-Side
- `client/src/components/LoginForm.tsx` - Updated to use hook
- `client/src/components/admin/SystemSettings.tsx` - Enhanced UI with help text
- `client/src/hooks/useSystemSettings.ts` - **NEW** Custom hook

### Server-Side
- `server/routes/settingsRoutes.js` - `/api/settings/public` endpoint (unchanged)

## Future Enhancements

Possible improvements:
- Cache public settings on CDN
- Add webhook for instant updates
- Support markdown in descriptions
- Add image upload for branding
- Multi-language support
- Custom CSS/branding overrides

## FAQ

**Q: How often are changes reflected?**
A: Changes appear within 30 seconds due to auto-refresh, or immediately after manual page refresh.

**Q: Do I need to restart anything after updating settings?**
A: No, changes are live immediately on the next fetch.

**Q: Can visitors see sensitive information?**
A: No, the public endpoint only returns safe fields (no passwords, SMTP config, etc.)

**Q: What if contact information is invalid?**
A: Invalid fields are automatically hidden and don't break the display.

**Q: Can I use HTML in the fields?**
A: No, all content is displayed as plain text for security.
