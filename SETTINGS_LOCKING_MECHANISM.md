# Admin Settings Locking Mechanism - Implementation Guide

## Overview

The settings locking mechanism prevents concurrent editing of system settings by multiple administrators. It uses a "soft lock" approach stored in the database with automatic timeout and manual release capabilities.

## Architecture

### Lock Lifecycle

```
1. Admin opens System Settings page
   ↓
2. Component acquires lock (POST /api/settings/lock)
   ↓
3. Lock stored in DB with owner, timestamp
   ↓
4. Other admins see warning about lock
   ↓
5. Admin either:
   a) Saves changes → Lock refreshed and maintained
   b) Navigates away → Lock auto-released
   c) Lock times out (5 mins) → Auto-released
```

### Lock Structure (Database)

```javascript
settingsLock: {
  isLocked: Boolean,           // Whether lock is active
  lockedBy: ObjectId,          // User ID of lock owner
  lockedAt: Date,              // When lock was acquired
  lockOwnerName: String        // Display name for UI
}
```

### Lock Timeout

- **Default**: 5 minutes (300,000 ms)
- **Refresh interval**: 30 seconds (periodic check while editing)
- **Configurable**: Via `DEFAULT_LOCK_TIMEOUT` in `settingsLockHelper.js`

## API Endpoints

### 1. POST /api/settings/lock
**Acquire a lock on settings**

**Request:**
```bash
POST /api/settings/lock
Authorization: Bearer <token>
```

**Response (Success - 200):**
```json
{
  "success": true,
  "locked": true,
  "lockOwner": "John Doe",
  "message": "Lock acquired successfully"
}
```

**Response (Conflict - 409, Lock held by someone else):**
```json
{
  "success": false,
  "locked": true,
  "lockOwner": "Jane Smith",
  "lockedAt": "2026-02-08T10:30:00Z",
  "minutesRemaining": 4,
  "message": "Settings are locked by Jane Smith (expires in 4 minutes)"
}
```

### 2. DELETE /api/settings/lock
**Release a lock on settings (user must own the lock)**

**Request:**
```bash
DELETE /api/settings/lock
Authorization: Bearer <token>
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Lock released successfully"
}
```

### 3. GET /api/settings/lock
**Check current lock status**

**Request:**
```bash
GET /api/settings/lock
Authorization: Bearer <token>
```

**Response (Locked by someone else - 200):**
```json
{
  "isLocked": true,
  "lockedBy": "507f1f77bcf86cd799439011",
  "lockOwner": "Jane Smith",
  "lockedAt": "2026-02-08T10:30:00Z",
  "minutesRemaining": 4,
  "canEdit": false,
  "message": "Settings locked by Jane Smith"
}
```

**Response (Locked by current user - 200):**
```json
{
  "isLocked": true,
  "lockedBy": "507f1f77bcf86cd799439012",
  "lockOwner": "John Doe",
  "lockedAt": "2026-02-08T10:35:00Z",
  "minutesRemaining": 5,
  "canEdit": true,
  "message": "You have the lock"
}
```

**Response (Not locked - 200):**
```json
{
  "isLocked": false,
  "lockedBy": null,
  "lockOwner": null,
  "canEdit": true,
  "message": "Settings are not locked"
}
```

### 4. POST /api/settings/lock/force-release
**Force release a lock (admin override, logs the action)**

**Request:**
```bash
POST /api/settings/lock/force-release
Authorization: Bearer <token>
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Lock released (was held by Jane Smith)",
  "previousOwner": "Jane Smith"
}
```

## Frontend Implementation

### Component State

```typescript
// Lock management state
const [lockStatus, setLockStatus] = useState<any>(null);
const [hasLock, setHasLock] = useState(false);
const lockRefreshIntervalRef = useRef<number | null>(null);
const lockTimeoutRef = useRef<number | null>(null);
```

### Lock Functions

#### acquireLock()
- Called on component mount
- Attempts to acquire lock
- Shows warning if another admin has the lock
- Starts periodic refresh if successful

#### releaseLock()
- Called on component unmount
- Releases lock if owned by current user
- Clears refresh intervals

#### checkLockStatus()
- Polls server for current lock status
- Updates local state
- Detects if lock expired

#### startLockRefresh()
- Sets up interval to refresh lock every 30 seconds
- Keeps lock alive while admin is editing

#### stopLockRefresh()
- Clears interval and timeouts
- Called on unmount or lock release

### UI Elements

#### Lock Status Alert
Displayed when settings are locked by another admin:
```
⚠️ Settings Locked
Jane Smith is currently editing these settings.
The lock will auto-release in 4 minutes.
```

#### Disabled State for Editing
When another admin has the lock:
- Settings appear but are read-only (in future enhancement)
- Save button remains enabled (admin can try, gets error)
- Warning alert clearly indicates who has the lock

#### Save Button Behavior
- Keeps lock after save (refreshes it)
- Button remains disabled when another admin has the lock
- Shows tooltip indicating lock status

## Workflow Examples

### Example 1: Normal Edit and Save

```
1. Admin A opens System Settings
   → acquireLock() called → Lock acquired for Admin A
   
2. Admin B opens System Settings
   → acquireLock() called → Lock conflict, 409 response
   → Warning displayed: "Jane is editing settings"
   
3. Admin B cannot edit
   
4. Admin A saves changes
   → Lock refreshed, Admin A still has lock
   → "Settings saved" toast shown
   
5. Admin A closes settings
   → releaseLock() called
   → Lock released
   
6. Admin B now can acquire lock
   → acquireLock() succeeds
```

### Example 2: Timeout Recovery

```
1. Admin A opens System Settings
   → acquireLock() called → Lock acquired
   
2. 5 minutes pass with no activity/save
   → Lock auto-expires on server
   
3. Admin A tries to save
   → Server detects Admin A no longer has lock
   → Admin A must re-acquire or is told lock expired
   
4. Admin B can now acquire lock
   → Settings no longer locked
```

### Example 3: Force Release by Admin

```
1. Admin A has lock but browser crashes
   → Lock remains active (waiting for timeout)
   
2. Admin B needs to edit settings
   → Calls POST /api/settings/lock/force-release
   → Admin A's lock released
   → Admin B can acquire new lock
   
3. Force release logged for audit trail
```

## Error Handling

### Lock Not Acquired (409 Conflict)
```javascript
const result = await acquireLock();
if (!result.success) {
  // Show warning to user
  antdMessage.warning(`Settings locked by ${result.lockOwner}`);
  // UI displays lock holder info
  setLockStatus(result);
}
```

### Lock Refresh Failure
```javascript
const refreshInterval = setInterval(() => {
  checkLockStatus(); // May fail due to network
  // Gracefully handles network issues
  // Lock continues with last known state
}, 30000);
```

### Lock Release on Unmount
```javascript
useEffect(() => {
  // ... component initialization ...
  
  return () => {
    releaseLock(); // Called on unmount
    stopLockRefresh();
  };
}, []);
```

## Security Considerations

### 1. Lock Ownership Verification
- Server verifies `req.user._id` matches `settingsLock.lockedBy` before release
- Only lock owner can release their own lock
- Prevents one admin from releasing another's lock

### 2. Soft Lock Design
- Lock stored in database (not file-based)
- Survives server restarts
- Accessible to all instances in distributed systems

### 3. Timeout Protection
- Lock automatically expires after 5 minutes
- Prevents permanent locks if admin session crashes
- Configurable timeout for different environments

### 4. Audit Logging
- Lock operations logged to console
- Force release operations can be extended to AuditLog
- Admin can see who held/released locks

### 5. Race Condition Prevention
- Atomic MongoDB $set operations
- Lock status checked before allowing critical operations
- Re-verification on save operations

## Configuration

### Adjust Lock Timeout

In `server/utils/settingsLockHelper.js`:
```javascript
// Change from 5 minutes to 10 minutes
const DEFAULT_LOCK_TIMEOUT = 10 * 60 * 1000; // 10 minutes
```

### Adjust Lock Refresh Interval

In `client/src/components/admin/SystemSettings.tsx`:
```javascript
// Change from 30 seconds to 1 minute
const lockRefreshIntervalRef = window.setInterval(() => {
  checkLockStatus();
}, 60000); // 1 minute
```

### Enable Audit Logging for Force Release

In `server/routes/settingsRoutes.js`, `forceReleaseLock` endpoint:
```javascript
// Add audit log
await AuditLog.create({
  action: 'SETTINGS_LOCK_FORCE_RELEASED',
  adminId: userId,
  previousLockOwner: result.previousOwner,
  timestamp: new Date()
});
```

## Testing

### Test Case 1: Single Admin Editing
```bash
1. Open settings as Admin A
2. Verify lock acquired
3. Make changes
4. Save settings
5. Verify lock maintained
6. Close settings
7. Verify lock released
```

### Test Case 2: Concurrent Edit Prevention
```bash
1. Admin A opens settings → lock acquired
2. Admin B opens settings → sees warning
3. Admin B cannot save
4. Admin A closes → lock released
5. Admin B opens settings → lock acquired
```

### Test Case 3: Lock Timeout
```bash
1. Admin A opens settings → lock acquired
2. Wait 5+ minutes without activity
3. Admin B attempts to acquire lock → succeeds
4. Verify timeout worked
```

### Test Case 4: Force Release
```bash
1. Admin A opens settings → lock acquired
2. Admin B calls force-release endpoint
3. Lock released
4. Admin B can acquire lock
5. Verify logged
```

## Monitoring

### Lock Status Queries

Get current lock holder:
```javascript
const settings = await SystemSetting.findOne();
console.log(`Lock held by: ${settings.settingsLock.lockOwnerName}`);
console.log(`Lock time: ${settings.settingsLock.lockedAt}`);
```

### Expired Locks Cleanup

In scheduled job or cron:
```javascript
const now = new Date();
const lockTimeout = 5 * 60 * 1000;

const expiredLocks = await SystemSetting.find({
  'settingsLock.isLocked': true,
  'settingsLock.lockedAt': { $lt: new Date(now - lockTimeout) }
});

// Force release expired locks
expiredLocks.forEach(async (setting) => {
  await settingsLockHelper.forceReleaseLock('system-cleanup');
});
```

## Future Enhancements

1. **Read-Only Mode for Locked Settings**
   - Show fields but disable editing when locked by another admin
   - Display in grayed-out style

2. **Lock Notifications**
   - Real-time updates via WebSocket when lock acquired/released
   - Toast notifications for other admins

3. **Multi-Section Locking**
   - Lock individual sections (general, email, officials) separately
   - Allow editing of unlocked sections

4. **Persistent Lock History**
   - Audit log all lock operations
   - Query who locked settings and when

5. **Lock Duration Configuration**
   - Admin UI to set lock timeout per environment
   - Different timeouts for development vs production

6. **Session-Based Locking**
   - Tie lock to admin session
   - Auto-release when session expires

## Troubleshooting

### Issue: Lock never releases
**Cause:** Browser crashed, server didn't get unmount signal
**Solution:** Wait 5 minutes for timeout, or call force-release endpoint

### Issue: Another admin can't acquire lock
**Cause:** Previous lock still active
**Solution:** Check lock status, call force-release if needed

### Issue: Lock status constantly shows "refreshing"
**Cause:** Network issues with status check endpoint
**Solution:** Verify API connectivity, check server logs

### Issue: Save succeeds but lock released
**Cause:** Lock expired during save operation
**Solution:** Lock is intentionally refreshed after save, not released

## Related Files

- **Backend:**
  - `server/utils/settingsLockHelper.js` - Lock utility functions
  - `server/routes/settingsRoutes.js` - Lock API endpoints
  - `server/models/SystemSetting.js` - Database schema

- **Frontend:**
  - `client/src/components/admin/SystemSettings.tsx` - Lock integration

- **Documentation:**
  - This file - Implementation guide
