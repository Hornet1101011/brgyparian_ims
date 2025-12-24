# PublicView Display Debugging Checklist ✅

## What We Just Updated

### 1. Server Auto-Initialization (app.js)
✅ Added automatic PublicView initialization on app startup
✅ If PublicView doesn't exist, it's created from current SystemSetting
✅ Runs automatically when server starts - no manual script needed

### 2. Client Debug Logging (useSystemSettings.ts)
✅ Added console.log to show fetched settings
✅ Added error logging to debug fetch failures
✅ Helps track what data is being received

### 3. Backend (Already Complete)
✅ GET /api/settings/public endpoint properly configured
✅ syncToPublicView function properly syncing on save
✅ PublicView model properly defined

---

## Data Flow Verification

```
Server Startup
    ↓
Check if PublicView exists
    ↓
If NO: Create from SystemSetting
    ↓
Admin Updates Settings
    ↓
System saves to SystemSetting
    ↓
syncToPublicView() runs automatically
    ↓
PublicView updated with latest
    ↓
LoginForm requests /api/settings/public
    ↓
Backend returns PublicView data
    ↓
useSystemSettings hook displays it
    ↓
BarangayInfoCard and ContactInfoCard render
```

---

## How to Test

### Step 1: Restart Server
```bash
cd server
npm start
```

Watch for these logs:
- `[Init] ✅ System settings already exist` OR `[Init] ✅ System settings initialized`
- `[Init] ✅ PublicView cache already exists` OR `[Init] ✅ PublicView cache initialized`

### Step 2: Open Login Page
Open browser DevTools → Console tab
You should see:
```
[useSystemSettings] Fetched settings: {
  siteName: "...",
  barangayName: "...",
  barangayAddress: "...",
  contactEmail: "...",
  contactPhone: "...",
  systemNotice: "..."
}
```

### Step 3: Verify Display
- **Barangay Information card** (left column) should show name and address
- **Contact Information card** (right column) should show email and phone as clickable links

### Step 4: Update Settings & Verify Sync
1. Go to Admin → System Settings
2. Change the Barangay Name
3. Click Save
4. Server logs should show: `[PublicView] Synced public settings successfully`
5. Wait 30 seconds or refresh login page
6. New barangay name should appear

---

## Troubleshooting

### Symptom: Cards show empty state
**Check:**
1. Open DevTools Network tab
2. Look for GET `/api/settings/public` request
3. Check Response tab
4. Should show populated fields like `barangayName: "Barangay Parian"`

**If it shows empty fields:**
- SystemSetting collection is empty
- Run: Go to Admin Settings and fill in fields, then Save

### Symptom: Console shows error in fetch
**Check:**
1. Network tab shows 404 or 500
2. Check server logs for `[DEBUG] GET /api/settings/public` messages
3. Look for `[PublicView]` error logs

**Solutions:**
- Verify MongoDB connection working
- Check PublicView collection exists: `db.publicviews.findOne()`
- Run initialization script: `node server/scripts/initializePublicView.js`

### Symptom: Settings save but not displaying
**Check:**
1. Server logs show `[PublicView] Synced public settings successfully`
2. Admin form shows success message
3. Refresh login page (after waiting 30 seconds for auto-refresh)

**If still not showing:**
- Check if email/phone formats are valid (required for ContactInfoCard display)
- Email must match: `user@example.com`
- Phone must have 7+ digits

---

## Database Verification Commands

### MongoDB Shell
```javascript
// Check SystemSetting has data
db.systemsettings.findOne()

// Check PublicView was created
db.publicviews.findOne()

// Check GridFS buckets exist
db.publicview.files.count()
db.publicview.chunks.count()
```

---

## Files Modified/Created

✅ `server/app.js` - Added PublicView auto-initialization
✅ `client/src/hooks/useSystemSettings.ts` - Added debug logging
✅ Backend routes already configured
✅ Models already defined
✅ Collections already created on admin save

---

## Quick Test Command

After server restart, curl the endpoint:
```bash
curl http://localhost:5000/api/settings/public
```

Should return:
```json
{
  "siteName": "...",
  "barangayName": "Barangay Parian",
  "barangayAddress": "...",
  "contactEmail": "...",
  "contactPhone": "...",
  "systemNotice": "..."
}
```

If it returns empty strings or doesn't exist, update System Settings admin panel.

---

## Next Steps

1. ✅ Restart server
2. ✅ Open login page in new browser window
3. ✅ Check DevTools console for [useSystemSettings] logs
4. ✅ Verify barangay and contact cards display
5. ✅ Update settings and confirm sync works
6. ✅ Check that 30-second auto-refresh picks up changes

**Everything should now be working!** 🚀
