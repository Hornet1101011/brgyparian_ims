# MongoDB Migration - Quick Start Guide

## TL;DR - The Fast Track

### 1️⃣ Test It (No Changes)
```bash
node server/migrations/migrate-to-sendgrid-only.js
```

### 2️⃣ Review Output
Look for:
- ✓ "Connected to MongoDB"
- ✓ "Collection 'systemsettings' exists"
- ✓ "DRY-RUN MODE: No changes will be made"

### 3️⃣ Apply It (Makes Changes)
```bash
# Linux/Mac
DRY_RUN=false node server/migrations/migrate-to-sendgrid-only.js

# Windows PowerShell
$env:DRY_RUN='false'; node server/migrations/migrate-to-sendgrid-only.js
```

### 4️⃣ Verify It Worked
```bash
# Check for legacy fields (should be empty)
mongo your_database
> db.systemsettings.find({ smtp: { $exists: true } })
```

---

## Common Scenarios

### Scenario 1: Production Database with Network Connection
```bash
MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/barangay_system" \
  DRY_RUN=false \
  node server/migrations/migrate-to-sendgrid-only.js
```

### Scenario 2: Local Development
```bash
# Make sure MongoDB is running locally
mongod --version

# Then run migration
node server/migrations/migrate-to-sendgrid-only.js
```

### Scenario 3: Docker Container
```bash
docker exec mongodb-container bash -c "
  cd /app && \
  DRY_RUN=false node server/migrations/migrate-to-sendgrid-only.js
"
```

### Scenario 4: Automated Deployment
```bash
#!/bin/bash
set -e  # Exit on error

echo "Running database migration..."
DRY_RUN=false node server/migrations/migrate-to-sendgrid-only.js

if [ $? -eq 0 ]; then
  echo "✓ Migration successful"
  exit 0
else
  echo "✗ Migration failed"
  exit 1
fi
```

---

## What Gets Changed

### Before Migration
```javascript
{
  _id: ObjectId("..."),
  siteName: "Barangay System",
  barangayName: "San Juan",
  
  // REMOVED: Old SMTP fields
  smtp: {
    activeProvider: 'sendgrid',
    mailtrap: { ... },
    sendgrid: { ... },
    gmail: { ... }
  },
  
  // REMOVED: Old Gmail fields
  gmail: {
    enabled: false,
    gmailAddress: "..."
  },
  
  // Legacy email field (may be incomplete)
  email: {
    provider: 'sendgrid'
    // missing sendgrid object
  }
}
```

### After Migration
```javascript
{
  _id: ObjectId("..."),
  siteName: "Barangay System",
  barangayName: "San Juan",
  
  // New simplified email structure
  email: {
    enabled: false,
    provider: 'sendgrid',
    sendgrid: {
      apiKey: '',
      fromEmail: '',
      fromName: 'Barangay System'
    },
    updatedAt: ISODate("2026-02-15T10:30:00Z")
  }
}
```

---

## Expected Output

### Dry-Run Output
```
======================================================================
  MongoDB Migration: SystemSettings SendGrid-Only Refactor
======================================================================

⚠ DRY-RUN MODE: No changes will be made to the database

----------------------------------------------------------------------
Connecting to MongoDB
----------------------------------------------------------------------
✓ Connected to MongoDB: mongodb://localhost:27017/barangay_system

----------------------------------------------------------------------
Analyzing Documents
----------------------------------------------------------------------
✓ Total documents: 1
✓ Documents with legacy fields (smtp/gmail): 1
✓ Documents without email field: 0

----------------------------------------------------------------------
Performing Migration (DRY-RUN MODE)
----------------------------------------------------------------------

Step 1: Removing legacy fields (smtp, gmail)...
✓ Unset legacy fields from 1 document(s)

Step 2: Initializing email.sendgrid structure...
✓ Initialized email structure for 0 document(s)

----------------------------------------------------------------------
Migration Summary
----------------------------------------------------------------------
Total documents: 1
Documents with legacy fields: 1
Documents unset: 1
Documents initialized: 0
Errors: 0
```

### Live Migration Output
```
======================================================================
  MongoDB Migration: SystemSettings SendGrid-Only Refactor
======================================================================

----------------------------------------------------------------------
Performing Migration (LIVE MODE)
----------------------------------------------------------------------

Step 1: Removing legacy fields (smtp, gmail)...
✓ Unset legacy fields from 1 document(s)
✓ Transaction committed successfully

Step 2: Initializing email.sendgrid structure...
✓ Initialized email structure for 0 document(s)

----------------------------------------------------------------------
Migration Summary
----------------------------------------------------------------------
Total documents: 1
Documents with legacy fields: 1
Documents unset: 1
Documents initialized: 0
Errors: 0

======================================================================
MIGRATION COMPLETE
======================================================================
✓ All changes have been applied to the database
```

---

## Troubleshooting

### Problem: "Failed to connect to MongoDB"
```
✗ Failed to connect to MongoDB: ECONNREFUSED
```

**Solution**: Start MongoDB
```bash
# macOS with Homebrew
brew services start mongodb-community

# Linux
sudo systemctl start mongod

# Windows
net start MongoDB

# Or with Docker
docker run -d -p 27017:27017 mongo
```

### Problem: "Collection 'systemsettings' does not exist"
```
⚠ Collection 'systemsettings' does not exist. Migration will complete without changes.
```

**Solution**: This is OK - means no SystemSettings document exists yet
- Migration still completes successfully
- No changes made (nothing to migrate)

### Problem: Permission Denied
```
✗ Error: User is not authorized to perform this action
```

**Solution**: Check MongoDB user permissions
```bash
# Connect and verify user
mongo --username admin --password yourpassword --authenticationDatabase admin

# Check user roles
db.system.users.find()

# Ensure user has readWrite role
db.grantRolesToUser("your_user", [{role: "readWrite", db: "barangay_system"}])
```

### Problem: Timeout
```
✗ Error: Timeout waiting for update operation
```

**Solution**: Increase timeout or check MongoDB performance
```bash
MONGODB_URI="mongodb://...?connectTimeoutMS=30000&socketTimeoutMS=30000" \
  DRY_RUN=false \
  node server/migrations/migrate-to-sendgrid-only.js
```

---

## Step-by-Step Guide

### For First-Time Users

#### Step 1: Backup Database
```bash
# Create a backup
mongodump --uri "mongodb://localhost:27017/barangay_system" \
  --archive=backup-before-migration.archive
```

#### Step 2: Test Migration (Dry-Run)
```bash
# No changes made, just preview
node server/migrations/migrate-to-sendgrid-only.js
```

#### Step 3: Review Output
```
✓ Connected to MongoDB
✓ Total documents: 1
✓ Documents with legacy fields: 1
DRY-RUN MODE: No changes will be made
```

✅ If this looks good, proceed to Step 4

#### Step 4: Apply Migration
```bash
DRY_RUN=false node server/migrations/migrate-to-sendgrid-only.js
```

#### Step 5: Verify Changes
```bash
# Check in MongoDB shell
mongo
> db.systemsettings.findOne()
# Should show email field, no smtp/gmail
```

✅ Done! Database is migrated.

---

## Performance

| Database Size | Estimated Time | Risk Level |
|--------------|-----------------|-----------|
| < 10 docs | < 1 second | Very Low |
| 10-100 docs | 1-2 seconds | Very Low |
| 100-1K docs | 2-5 seconds | Low |
| 1K-10K docs | 5-20 seconds | Low |
| 10K+ docs | 20-60 seconds | Medium |

---

## Integration with CI/CD

### GitHub Actions
```yaml
name: Database Migration
on:
  workflow_dispatch:
  
jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '14'
      
      - name: Install dependencies
        run: npm install
      
      - name: Run migration
        env:
          MONGODB_URI: ${{ secrets.MONGODB_URI }}
          DRY_RUN: 'false'
        run: node server/migrations/migrate-to-sendgrid-only.js
```

### GitLab CI
```yaml
migrate_database:
  stage: deploy
  script:
    - npm install
    - DRY_RUN=false node server/migrations/migrate-to-sendgrid-only.js
  environment:
    name: production
  only:
    - main
```

---

## Safety Checklist

- [ ] Backup created before migration
- [ ] Dry-run executed
- [ ] Output reviewed and approved
- [ ] Connection string verified
- [ ] No other processes accessing database
- [ ] Maintenance window scheduled (if needed)
- [ ] Team notified
- [ ] Rollback procedure ready

---

## Rollback

If something goes wrong:

```bash
# Restore from backup
mongorestore --uri "mongodb://localhost:27017/barangay_system" \
  --archive=backup-before-migration.archive \
  --drop
```

Or per collection:
```bash
mongorestore --uri "mongodb://localhost:27017/barangay_system" \
  --nsInclude="barangay_system.systemsettings" \
  --archive=backup-before-migration.archive \
  --drop
```

---

## Need More Help?

📖 **Full Guide**: See `MONGODB_MIGRATION_GUIDE.md`  
💻 **Script Code**: See `server/migrations/migrate-to-sendgrid-only.js`  
📝 **API Changes**: See `SCHEMA_REFACTOR_SENDGRID_ONLY.md`

---

## Quick Commands Reference

```bash
# Dry-run
node server/migrations/migrate-to-sendgrid-only.js

# Apply changes (Linux/Mac)
DRY_RUN=false node server/migrations/migrate-to-sendgrid-only.js

# Apply changes (Windows PowerShell)
$env:DRY_RUN='false'; node server/migrations/migrate-to-sendgrid-only.js

# With custom database
MONGODB_URI="mongodb://..." DRY_RUN=false node server/migrations/migrate-to-sendgrid-only.js

# Via npm
npm run migrate:sendgrid:apply

# Backup database
mongodump --archive=backup.archive --db barangay_system

# Restore database
mongorestore --archive=backup.archive --drop
```

---

**Version**: 1.0  
**Last Updated**: February 15, 2026
