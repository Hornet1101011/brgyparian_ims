# MongoDB Migration Guide: SendGrid-Only Refactor

## Overview

This guide explains how to migrate the SystemSettings MongoDB collection to the new SendGrid-only schema by removing legacy SMTP and Gmail fields and initializing the new email structure.

---

## Migration Script

**Location**: `server/migrations/migrate-to-sendgrid-only.js`

### What It Does

1. **Removes Legacy Fields**
   - Unsets `smtp` field from all documents
   - Unsets `gmail` field from all documents

2. **Initializes Missing Email Structure**
   - Creates `email.sendgrid` if document has no email field
   - Ensures `email.provider` is set to 'sendgrid'
   - Ensures `email.enabled` is set (defaults to false)

3. **Fixes Incomplete Structures**
   - Completes any incomplete email.sendgrid fields
   - Ensures all required properties exist

---

## Prerequisites

- Node.js and npm installed
- MongoDB running and accessible
- Database connection string available
- Backup of production database (recommended)

---

## Installation

Ensure dependencies are installed:
```bash
npm install mongoose
```

---

## Running the Migration

### 1. Dry-Run Mode (Safe - No Changes)

First, always run in dry-run mode to preview changes:

```bash
# From project root
node server/migrations/migrate-to-sendgrid-only.js
```

**Output Example**:
```
======================================================================
  MongoDB Migration: SystemSettings SendGrid-Only Refactor
======================================================================

⚠ DRY-RUN MODE: No changes will be made to the database
⚠ Run with DRY_RUN=false to apply changes

----------------------------------------------------------------------
Connecting to MongoDB
----------------------------------------------------------------------
✓ Connected to MongoDB: mongodb://localhost:27017/barangay_system

----------------------------------------------------------------------
Validating Collection
----------------------------------------------------------------------
✓ Collection 'systemsettings' exists with 1 document(s)

----------------------------------------------------------------------
Analyzing Documents
----------------------------------------------------------------------
✓ Total documents: 1
✓ Documents with legacy fields (smtp/gmail): 1
✓ Documents without email field: 1
✓ All email structures are complete

----------------------------------------------------------------------
Performing Migration (DRY-RUN MODE)
----------------------------------------------------------------------

Step 1: Removing legacy fields (smtp, gmail)...
✓ Unset legacy fields from 1 document(s)

Step 2: Initializing email.sendgrid structure...
✓ Initialized email structure for 1 document(s)

----------------------------------------------------------------------
Verifying Migration Results
----------------------------------------------------------------------
✓ No legacy fields (smtp/gmail) found
✓ All documents have email field
✓ All email structures are complete

----------------------------------------------------------------------
Migration Summary
----------------------------------------------------------------------
Mode: DRY-RUN (no changes)
Duration: 0.45 seconds

Total documents: 1
Documents with legacy fields: 1
Documents without email: 1
Documents unset: 1
Documents initialized: 1
Errors: 0

======================================================================
DRY-RUN COMPLETE
======================================================================
To apply changes, run:
  DRY_RUN=false node server/migrations/migrate-to-sendgrid-only.js
```

### 2. Review Dry-Run Results

Carefully review the output:
- ✓ Check "Documents with legacy fields" count
- ✓ Check "Documents without email" count
- ✓ Verify no errors occurred
- ✓ Confirm expected number of changes

### 3. Apply Changes (Live Migration)

Once satisfied with dry-run results, apply actual changes:

```bash
# Linux/Mac
DRY_RUN=false node server/migrations/migrate-to-sendgrid-only.js

# Windows PowerShell
$env:DRY_RUN='false'; node server/migrations/migrate-to-sendgrid-only.js

# Windows Command Prompt
set DRY_RUN=false && node server/migrations/migrate-to-sendgrid-only.js
```

---

## Environment Variables

### DRY_RUN
- **Default**: `true` (safe mode)
- **Values**: `true` or `false`
- **Purpose**: Preview changes without modifying database

```bash
DRY_RUN=false node server/migrations/migrate-to-sendgrid-only.js
```

### MONGODB_URI
- **Default**: `mongodb://localhost:27017/barangay_system`
- **Purpose**: Override default MongoDB connection
- **Example**: Production database

```bash
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/barangay_system \
  DRY_RUN=false \
  node server/migrations/migrate-to-sendgrid-only.js
```

---

## Migration Steps Explained

### Step 1: Remove Legacy Fields

```javascript
db.systemsettings.updateMany(
  { $or: [{ smtp: { $exists: true } }, { gmail: { $exists: true } }] },
  { $unset: { smtp: 1, gmail: 1 } }
)
```

**Effect**: Removes old SMTP and Gmail configuration from all documents

**Example**:
```javascript
// BEFORE
{
  _id: ObjectId(...),
  siteName: "...",
  smtp: { ... },      // ← REMOVED
  gmail: { ... },     // ← REMOVED
  email: { ... }
}

// AFTER
{
  _id: ObjectId(...),
  siteName: "...",
  email: { ... }
}
```

### Step 2: Initialize Email Structure

```javascript
db.systemsettings.updateMany(
  { email: { $exists: false } },
  { $set: {
    email: {
      enabled: false,
      provider: 'sendgrid',
      sendgrid: {
        apiKey: '',
        fromEmail: '',
        fromName: 'Barangay System'
      },
      updatedAt: new Date()
    }
  }}
)
```

**Effect**: Creates complete email structure for documents without it

**Example**:
```javascript
// BEFORE
{
  _id: ObjectId(...),
  siteName: "...",
  // no email field
}

// AFTER
{
  _id: ObjectId(...),
  siteName: "...",
  email: {
    enabled: false,
    provider: 'sendgrid',
    sendgrid: {
      apiKey: '',
      fromEmail: '',
      fromName: 'Barangay System'
    },
    updatedAt: ISODate(...)
  }
}
```

### Step 3: Fix Incomplete Structures

```javascript
// Updates any documents with incomplete email.sendgrid fields
// Ensures all required properties exist with proper defaults
```

**Example**:
```javascript
// BEFORE (incomplete)
{
  _id: ObjectId(...),
  email: {
    enabled: true,
    provider: 'sendgrid',
    // missing sendgrid object
  }
}

// AFTER
{
  _id: ObjectId(...),
  email: {
    enabled: true,
    provider: 'sendgrid',
    sendgrid: {
      apiKey: '',
      fromEmail: '',
      fromName: 'Barangay System'
    }
  }
}
```

---

## Troubleshooting

### Connection Fails
```
✗ Failed to connect to MongoDB: ECONNREFUSED
```

**Solution**:
1. Ensure MongoDB is running: `mongod --version`
2. Check connection string: `MONGODB_URI`
3. Verify network connectivity and firewall
4. Test with MongoDB client: `mongo "mongodb://..."`

### Permission Denied
```
✗ Error: User is not authorized to perform this action
```

**Solution**:
1. Verify user has write permissions on database
2. Check authentication credentials
3. Ensure user has proper roles:
   - `readWrite`
   - `dbAdmin` (for collection modifications)

### Timeout
```
✗ Error: Timeout waiting for update operation
```

**Solution**:
1. Increase connection timeout:
   ```bash
   MONGODB_URI="mongodb://...?connectTimeoutMS=10000" node migrate...
   ```
2. Check MongoDB performance
3. Reduce batch size if many documents

### Migration Hangs

**Solution**:
1. Check MongoDB logs
2. Verify no locks on database
3. Stop other processes accessing database
4. Run dry-run first to estimate duration

---

## Verification

### Manual Verification (MongoDB Shell)

```javascript
// Check for legacy fields (should be empty)
db.systemsettings.find({ smtp: { $exists: true } })
db.systemsettings.find({ gmail: { $exists: true } })

// Check for email structure (should return all documents)
db.systemsettings.find({ email: { $exists: true } })

// View complete email structure
db.systemsettings.findOne({ }, { email: 1 })

// Count documents with proper structure
db.systemsettings.countDocuments({ 
  'email.provider': 'sendgrid',
  'email.sendgrid': { $exists: true }
})
```

### Application Verification

After migration:

1. **Load Settings** (GET /api/settings)
   - Verify email configuration loads correctly
   - Check API key is masked in response

2. **Update Settings** (PATCH /api/settings)
   - Update email configuration
   - Verify changes persist

3. **Test Email** (POST /api/settings/email/test)
   - Test SendGrid connection
   - Verify email sending works

---

## Rollback Procedure

If issues occur, restore from backup:

```bash
# Restore from database backup
mongorestore --uri="mongodb://..." --archive=backup.archive

# Or restore specific collection
mongorestore --uri="mongodb://..." --archive=backup.archive \
  --nsInclude="barangay_system.systemsettings"
```

---

## Migration Log

The script provides detailed logging:

```
[2026-02-15T10:30:00Z] Migration started
[2026-02-15T10:30:01Z] Connected to database
[2026-02-15T10:30:02Z] Analyzed 1 documents
[2026-02-15T10:30:03Z] Unset legacy fields from 1 documents
[2026-02-15T10:30:04Z] Initialized email structure for 1 documents
[2026-02-15T10:30:05Z] Migration completed successfully
Duration: 5.23 seconds
```

---

## Best Practices

✅ **Always**
- Run dry-run first
- Backup database before live migration
- Run during maintenance window
- Monitor application after migration
- Keep migration script in version control

❌ **Never**
- Run live migration without dry-run
- Skip backup
- Run during peak usage hours
- Stop migration mid-way (let it complete)
- Delete backup immediately after

---

## Performance Considerations

### Database Load
- **Small database** (<100 documents): < 1 second
- **Medium database** (100-1K documents): 1-5 seconds
- **Large database** (1K+ documents): 5-30 seconds

### Rollback Time
- Same as migration time (restore from backup)
- Practice rollback procedure beforehand

### Monitoring
- Monitor CPU usage during migration
- Monitor disk I/O
- Check MongoDB logs for errors

---

## Script Features

✅ **Safety**
- Dry-run mode prevents accidental changes
- Transaction support for consistency
- Automatic rollback on error
- Detailed error reporting

✅ **Analysis**
- Pre-migration document analysis
- Post-migration verification
- Structure completeness checking
- Sample document inspection

✅ **Logging**
- Color-coded console output
- Detailed operation logging
- Error tracking with document IDs
- Summary statistics

✅ **Flexibility**
- Environment variable configuration
- Custom MongoDB URI
- Programmatic usage (export function)
- Exit codes for automation

---

## Automation

### Add to Package.json

```json
{
  "scripts": {
    "migrate:sendgrid:dry-run": "node server/migrations/migrate-to-sendgrid-only.js",
    "migrate:sendgrid:apply": "DRY_RUN=false node server/migrations/migrate-to-sendgrid-only.js"
  }
}
```

### Run via npm

```bash
# Dry-run
npm run migrate:sendgrid:dry-run

# Apply
npm run migrate:sendgrid:apply
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Run Database Migration
  env:
    MONGODB_URI: ${{ secrets.MONGODB_URI }}
    DRY_RUN: 'false'
  run: node server/migrations/migrate-to-sendgrid-only.js
```

---

## Support & Troubleshooting

### Check Script Version
```bash
node -e "console.log(require('./server/migrations/migrate-to-sendgrid-only.js'))"
```

### Test Connection
```bash
node -e "
const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/test')
  .then(() => console.log('✓ Connected'))
  .catch(e => console.error('✗ Error:', e.message))
  .finally(() => process.exit(0))
"
```

### View Migration Code
```bash
cat server/migrations/migrate-to-sendgrid-only.js | head -50
```

---

## Checklist

Before running migration:

- [ ] Database backed up
- [ ] Dry-run executed and reviewed
- [ ] All changes expected and approved
- [ ] MongoDB is running and accessible
- [ ] No other processes modifying database
- [ ] Application downtime window scheduled (if needed)
- [ ] Rollback procedure tested
- [ ] Team notified of changes

After running migration:

- [ ] Migration completed successfully
- [ ] Zero errors reported
- [ ] Manual verification passed
- [ ] Application loads settings correctly
- [ ] Email functionality works
- [ ] No user-visible issues
- [ ] Backup kept for 30 days
- [ ] Migration log archived

---

## Summary

This migration script safely and reliably:
1. Removes legacy SMTP and Gmail fields
2. Initializes new SendGrid configuration
3. Verifies all changes
4. Provides detailed logging

**Status**: ✅ Production-Ready  
**Duration**: < 30 seconds for typical databases  
**Risk Level**: Low (with dry-run and backup)  
**Rollback**: Simple (restore from backup)

---

**Version**: 1.0  
**Date**: February 15, 2026  
**Compatibility**: Node.js 12+, MongoDB 3.6+
