# System Settings Integration - Quick Reference

## One-Minute Overview

**What:** Barangay information and contact details on the login page are now **fully controlled by System Settings** in the admin panel.

**Where:** 
- Admin Panel → System Settings → Edit Barangay/Contact Info → Save
- Login Page → Auto-displays updated information within 30 seconds

**How:**
1. Admin changes settings
2. Click Save
3. Information updates in database
4. Login page auto-refreshes every 30 seconds
5. Visitors see updated info

## Files Changed

| File | Change | Type |
|------|--------|------|
| `client/src/hooks/useSystemSettings.ts` | **NEW** - Custom hook for fetching settings | Create |
| `client/src/components/LoginForm.tsx` | Integrated hook, enhanced cards | Modify |
| `client/src/components/admin/SystemSettings.tsx` | Better UI, help text, alerts | Modify |

## Key Components

### useSystemSettings Hook
```typescript
const { settings, loading, error, refetch } = useSystemSettings(true);
// settings = { siteName, barangayName, barangayAddress, contactEmail, contactPhone }
// loading = true while fetching
// refetch() = manual refresh
```

### BarangayInfoCard
Displays:
- `siteName` as card title
- `barangayName` as main info
- `barangayAddress` as secondary info

### ContactInfoCard
Displays (if valid):
- `contactEmail` as clickable mailto link
- `contactPhone` as clickable tel link

## Admin Settings Fields

| Field | Purpose | Validation |
|-------|---------|-----------|
| Site Name | Card title on login | Any text |
| Barangay Name | Main barangay info | Any text |
| Barangay Address | Full address display | Any text |
| Contact Email | Clickable email link | Must be valid email |
| Contact Phone | Clickable phone link | Min 7 digits |

## Real-Time Behavior

```
Admin Saves Setting
        ↓ (1 second)
Database Updated
        ↓ (up to 29 seconds)
Browser Auto-Refresh
        ↓ (instant)
Visitor Sees Updated Info
```

**Maximum delay:** 30 seconds from save to display

## Validation

| Field | Rule | Example |
|-------|------|---------|
| Email | Must have `@` and `.` | `name@example.com` ✓ |
| Email | Invalid formats hidden | `invalid.email` ✗ |
| Phone | Min 7 digits | `09614215746` ✓ |
| Phone | Only digits/special chars | `(961) 421-5746` ✓ |
| Phone | Invalid formats hidden | `abc1234567` ✗ |

## Testing Checklist

- [ ] Admin can edit System Settings
- [ ] Save button works
- [ ] Barangay name appears on login page
- [ ] Address appears on login page
- [ ] Email is clickable (if valid)
- [ ] Phone is clickable (if valid)
- [ ] Invalid email is hidden
- [ ] Invalid phone is hidden
- [ ] Changes appear within 30 seconds
- [ ] Manual refresh shows changes immediately

## Common Tasks

### Update Barangay Name
1. Go to Admin Panel → System Settings
2. Find "Barangay Information" section
3. Update "Barangay Name" field
4. Click Save button
5. Check login page (within 30 seconds)

### Update Contact Email
1. Go to Admin Panel → System Settings
2. Find "Contact Information" section
3. Update "Contact Email" field (must be valid email)
4. Click Save button
5. Check login page (within 30 seconds)

### Manual Refresh on Login Page
- Press `F5` or `Ctrl+R` (Cmd+R on Mac)
- Changes should appear immediately

### Check Current Settings
```javascript
// In browser console on login page
fetch('/api/settings/public').then(r => r.json()).then(console.log)
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Settings not showing | Wait 30 seconds or refresh page |
| Invalid email hidden | Fix email format (must have `@` and `.`) |
| Invalid phone hidden | Ensure at least 7 digits |
| Settings not saved | Check for error message, try again |
| Console errors | Check network tab, verify endpoint |

## API Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/settings/public` | GET | No | Fetch public settings (visitors) |
| `/api/admin/settings` | PATCH | Yes | Update settings (admin only) |

## Configuration

### Disable Auto-Refresh
Edit `LoginForm.tsx` line 30:
```typescript
const { settings } = useSystemSettings(false); // Disable
```

### Change Refresh Interval
Edit `useSystemSettings.ts` line 56:
```typescript
}, 30000); // Change to desired milliseconds
```

## Performance

- **Load time:** ~100-500ms
- **Network size:** ~200 bytes per refresh
- **Memory:** ~1KB
- **CPU impact:** Minimal
- **Refresh interval:** Every 30 seconds

## Browser Support

✓ Chrome, Firefox, Safari, Edge (all recent versions)
✓ Mobile browsers
✓ IE11 (with polyfills)

## Security

✓ Public endpoint returns only safe fields
✓ No sensitive data exposed
✓ Plain text only (no HTML/scripts)
✓ Input validation on email/phone
✓ Admin endpoint requires auth

## FAQ

**Q: How often do changes appear?**
A: Within 30 seconds (auto-refresh), or instantly with manual refresh

**Q: What if I make a mistake?**
A: You can edit and save again immediately - no restrictions

**Q: Can users modify this data?**
A: No, only admins can edit in System Settings

**Q: What if the API is down?**
A: Login page shows minimal defaults, but users can still log in

**Q: Do I need to restart anything?**
A: No, changes are live immediately on next fetch

## Support

For issues or questions:
1. Check `/api/settings/public` endpoint directly
2. Verify settings are saved in admin panel
3. Check browser console for errors
4. Check server logs for API errors
5. Try manual page refresh

## Links

- Integration Guide: `SYSTEM_SETTINGS_INTEGRATION.md`
- Visual Diagrams: `SYSTEM_SETTINGS_VISUAL_GUIDE.md`
- Change Summary: `SYSTEM_SETTINGS_OVERHAUL_SUMMARY.md`
