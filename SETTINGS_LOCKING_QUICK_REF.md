# Admin Settings Locking - Quick Reference

## What It Does

Prevents multiple administrators from editing settings simultaneously. Uses a soft lock that:
- ✓ Stores lock owner and timestamp in database
- ✓ Warns other admins when settings are being edited
- ✓ Auto-releases after 5 minutes of inactivity
- ✓ Auto-releases when admin saves or closes settings

## How It Works

### For Admin A (Editing Settings)
1. Opens System Settings page
2. Lock automatically acquired for 5 minutes
3. Makes changes and saves
4. Lock refreshed and maintained
5. Closes page → lock released

### For Admin B (Trying to Edit)
1. Opens System Settings page
2. Sees warning: "Jane Smith is currently editing settings"
3. Cannot acquire lock
4. Waits for lock to be released
5. Can edit once lock is released

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/settings/lock` | Acquire lock |
| DELETE | `/api/settings/lock` | Release lock |
| GET | `/api/settings/lock` | Check lock status |
| POST | `/api/settings/lock/force-release` | Admin override (force release) |

## Lock Status Examples

### Lock Acquired Successfully
```json
{
  "success": true,
  "locked": true,
  "lockOwner": "John Doe",
  "message": "Lock acquired successfully"
}
```

### Lock Held by Someone Else (409 Conflict)
```json
{
  "success": false,
  "locked": true,
  "lockOwner": "Jane Smith",
  "minutesRemaining": 4,
  "message": "Settings are locked by Jane Smith (expires in 4 minutes)"
}
```

## Key Features

### Automatic Lock Management
- ✓ Lock acquired on component mount
- ✓ Lock released on component unmount
- ✓ Lock refreshed every 30 seconds while editing
- ✓ Lock auto-expires after 5 minutes

### User Experience
- ✓ Warning alert shows who has the lock
- ✓ Shows time until auto-release
- ✓ Refresh button to check latest status
- ✓ Disabled save when another admin has lock

### Distributed Safety
- ✓ Soft lock in database (survives server restarts)
- ✓ Works with multiple server instances
- ✓ Atomic MongoDB operations prevent race conditions
- ✓ Lock ownership verified on each operation

## Database Schema

```javascript
{
  // ... other settings ...
  settingsLock: {
    isLocked: Boolean,           // true/false
    lockedBy: ObjectId,          // User ID
    lockedAt: Date,              // When acquired
    lockOwnerName: String        // Display name
  }
}
```

## Configuration

### Lock Timeout (default: 5 minutes)
```javascript
// In server/utils/settingsLockHelper.js
const DEFAULT_LOCK_TIMEOUT = 5 * 60 * 1000; // milliseconds
```

### Lock Refresh Interval (default: 30 seconds)
```javascript
// In SystemSettings.tsx
lockRefreshIntervalRef.current = window.setInterval(() => {
  checkLockStatus();
}, 30000); // milliseconds
```

## Files Modified/Created

### Backend
- `server/utils/settingsLockHelper.js` - **NEW** - Lock utility functions
- `server/routes/settingsRoutes.js` - Updated with 4 lock endpoints
- `server/models/SystemSetting.js` - Added settingsLock schema field

### Frontend
- `client/src/components/admin/SystemSettings.tsx` - Updated with lock management

### Documentation
- `SETTINGS_LOCKING_MECHANISM.md` - Comprehensive implementation guide
- This file - Quick reference

## Common Scenarios

### Scenario 1: Admin Crashes While Editing
- Lock remains active for 5 minutes
- Other admins see warning but can still edit after timeout
- No data loss, just a 5-minute wait

### Scenario 2: Urgent Need to Edit
- Other admin can call force-release endpoint
- Lock released immediately
- Logged for audit purposes

### Scenario 3: Network Failure
- Lock refresh may fail but state persists locally
- Save still attempted with current state
- Lock resynced on next successful check

## Testing Checklist

- [ ] Admin A opens settings → lock acquired
- [ ] Admin B opens settings → sees warning
- [ ] Admin A saves → lock maintained
- [ ] Admin A closes → lock released
- [ ] Admin B can now acquire lock
- [ ] Wait 5 minutes → lock auto-releases
- [ ] Force release works → lock released
- [ ] Refresh button updates status

## Monitoring

### Check Current Lock
```bash
curl -X GET http://localhost:5000/api/settings/lock \
  -H "Authorization: Bearer <token>"
```

### Force Release Lock (Admin Only)
```bash
curl -X POST http://localhost:5000/api/settings/lock/force-release \
  -H "Authorization: Bearer <token>"
```

### Database Query
```javascript
const settings = await SystemSetting.findOne();
console.log(settings.settingsLock);
```

## Security Notes

- Only lock owner can release their lock
- Server verifies admin ownership before release
- Force release is logged
- Prevents permanent locks (5-minute timeout)
- Thread-safe with atomic DB operations

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Can't edit after 5 minutes | Try refreshing page or force-release |
| Lock shows but not blocking | Check if lock owner is current user |
| Always locked to me | Unmount and remount component (close/open) |
| Network errors refreshing lock | Lock maintains local state, save still works |

## For Developers

### Add Logging
In `settingsLockHelper.js`, logs are printed to console:
```
[SettingsLock] Lock acquired by John Doe (userId)
[SettingsLock] Lock released by John Doe
[SettingsLock] Lock expired, allowing takeover
```

### Extend for Audit Trail
In `settingsRoutes.js`, add to lock endpoints:
```javascript
await AuditLog.create({
  action: 'SETTINGS_LOCK_ACQUIRED',
  adminId: req.user._id,
  timestamp: new Date()
});
```

### Real-Time Notifications (Future)
Integrate with WebSocket/SSE to notify all admins:
```javascript
sse.broadcastToAdmins({
  event: 'settings_locked',
  lockedBy: userName,
  expiresIn: minutesRemaining
});
```

---

**For detailed information, see:** `SETTINGS_LOCKING_MECHANISM.md`
