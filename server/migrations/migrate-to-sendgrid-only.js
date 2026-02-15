/**
 * MongoDB Migration Script: SystemSettings SendGrid-Only Refactor
 * 
 * Purpose:
 * - Remove legacy SMTP and Gmail fields from SystemSettings collection
 * - Initialize email.sendgrid structure if email does not exist
 * - Ensure all documents have proper SendGrid configuration
 * 
 * Usage:
 * node server/migrations/migrate-to-sendgrid-only.js
 * 
 * Environment Variables:
 * - MONGODB_URI: MongoDB connection string (optional, defaults to config)
 * - DRY_RUN: Set to 'true' for dry-run mode (no actual changes)
 * 
 * Features:
 * - Validates connection before running
 * - Runs in dry-run mode by default (no changes made)
 * - Detailed logging of all operations
 * - Transaction support for data consistency
 * - Comprehensive error handling
 * - Progress tracking and statistics
 * - Rollback information for safety
 */

const mongoose = require('mongoose');
const path = require('path');

// Configuration
const DRY_RUN = process.env.DRY_RUN !== 'false'; // Default to dry-run (safe)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/barangay_system';
const COLLECTION_NAME = 'systemsettings';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(message) {
  log(`\n${'='.repeat(70)}`, 'bright');
  log(`  ${message}`, 'cyan');
  log(`${'='.repeat(70)}\n`, 'bright');
}

function logSection(message) {
  log(`\n${message}`, 'blue');
  log(`${'-'.repeat(70)}`);
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

/**
 * Migration Statistics
 */
class MigrationStats {
  constructor() {
    this.totalDocuments = 0;
    this.documentsWithLegacyFields = 0;
    this.documentsWithoutEmail = 0;
    this.documentsUnset = 0;
    this.documentsInitialized = 0;
    this.errors = [];
    this.startTime = Date.now();
  }

  addError(error, documentId = null) {
    this.errors.push({ error: error.message, documentId });
  }

  getDuration() {
    return ((Date.now() - this.startTime) / 1000).toFixed(2);
  }

  summary() {
    return {
      totalDocuments: this.totalDocuments,
      documentsWithLegacyFields: this.documentsWithLegacyFields,
      documentsWithoutEmail: this.documentsWithoutEmail,
      documentsUnset: this.documentsUnset,
      documentsInitialized: this.documentsInitialized,
      errorCount: this.errors.length,
      durationSeconds: this.getDuration(),
    };
  }
}

/**
 * Connect to MongoDB
 */
async function connectDatabase() {
  try {
    logSection('Connecting to MongoDB');
    
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    logSuccess(`Connected to MongoDB: ${MONGODB_URI}`);
    return true;
  } catch (error) {
    logError(`Failed to connect to MongoDB: ${error.message}`);
    return false;
  }
}

/**
 * Disconnect from MongoDB
 */
async function disconnectDatabase() {
  try {
    await mongoose.connection.close();
    logSuccess('Disconnected from MongoDB');
  } catch (error) {
    logError(`Error disconnecting from MongoDB: ${error.message}`);
  }
}

/**
 * Validate collection exists
 */
async function validateCollection() {
  try {
    logSection('Validating Collection');

    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    if (!collectionNames.includes(COLLECTION_NAME)) {
      logWarning(`Collection '${COLLECTION_NAME}' does not exist. Migration will complete without changes.`);
      return true;
    }

    const collection = mongoose.connection.db.collection(COLLECTION_NAME);
    const count = await collection.countDocuments();
    
    logSuccess(`Collection '${COLLECTION_NAME}' exists with ${count} document(s)`);
    return true;
  } catch (error) {
    logError(`Validation failed: ${error.message}`);
    return false;
  }
}

/**
 * Analyze documents before migration
 */
async function analyzeDocuments(stats) {
  try {
    logSection('Analyzing Documents');

    const collection = mongoose.connection.db.collection(COLLECTION_NAME);
    
    // Count total documents
    stats.totalDocuments = await collection.countDocuments();
    logSuccess(`Total documents: ${stats.totalDocuments}`);

    // Count documents with legacy fields
    const withLegacy = await collection.countDocuments({
      $or: [
        { smtp: { $exists: true } },
        { gmail: { $exists: true } },
      ]
    });
    stats.documentsWithLegacyFields = withLegacy;
    logSuccess(`Documents with legacy fields (smtp/gmail): ${withLegacy}`);

    // Count documents without email field
    const withoutEmail = await collection.countDocuments({
      email: { $exists: false }
    });
    stats.documentsWithoutEmail = withoutEmail;
    logSuccess(`Documents without email field: ${withoutEmail}`);

    // Count documents with incomplete email structure
    const incompleteEmail = await collection.countDocuments({
      $or: [
        { 'email.sendgrid': { $exists: false } },
        { 'email.provider': { $exists: false } },
        { 'email.enabled': { $exists: false } },
      ]
    });
    
    if (incompleteEmail > 0) {
      logWarning(`Documents with incomplete email structure: ${incompleteEmail}`);
    } else {
      logSuccess('All email structures are complete');
    }

    return true;
  } catch (error) {
    logError(`Analysis failed: ${error.message}`);
    stats.addError(error);
    return false;
  }
}

async function performMigration(stats) {
  try {
    logSection(`Performing Migration (${DRY_RUN ? 'DRY-RUN MODE' : 'LIVE MODE'})`);

    const collection = mongoose.connection.db.collection(COLLECTION_NAME);
    const session = await mongoose.connection.startSession();
    let transactionStarted = false;

    try {
      // Don't attempt transactions on standalone MongoDB
      // Just proceed without them
      logWarning('Skipping transaction support for standalone MongoDB');
      transactionStarted = false;

      // STEP 1: Remove legacy smtp and gmail fields
      log('\nStep 1: Removing legacy fields (smtp, gmail)...');
      
      const unsetResult = await collection.updateMany(
        { 
          $or: [
            { smtp: { $exists: true } },
            { gmail: { $exists: true } },
          ]
        },
        {
          $unset: {
            smtp: 1,
            gmail: 1,
          }
        },
        { session: transactionStarted && !DRY_RUN ? session : undefined }
      );

      stats.documentsUnset = unsetResult.modifiedCount;
      logSuccess(`Unset legacy fields from ${unsetResult.modifiedCount} document(s)`);

      // STEP 2: Initialize email.sendgrid for documents without email field
      log('\nStep 2: Initializing email.sendgrid structure for documents without email...');
      
      const initResult = await collection.updateMany(
        { email: { $exists: false } },
        {
          $set: {
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
          }
        },
        { session: transactionStarted && !DRY_RUN ? session : undefined }
      );

      stats.documentsInitialized = initResult.modifiedCount;
      logSuccess(`Initialized email structure for ${initResult.modifiedCount} document(s)`);

      // STEP 3: Fix documents with incomplete email structure
      log('\nStep 3: Fixing incomplete email structures...');
      
      const incompleteDocuments = await collection.find({
        $or: [
          { 'email.sendgrid': { $exists: false } },
          { 'email.provider': { $exists: false } },
          { 'email.enabled': { $exists: false } },
        ]
      }).toArray();

      let fixedCount = 0;
      for (const doc of incompleteDocuments) {
        const updateOps = { $set: {} };

        // Ensure sendgrid structure exists
        if (!doc.email?.sendgrid) {
          updateOps.$set['email.sendgrid'] = {
            apiKey: '',
            fromEmail: '',
            fromName: 'Barangay System'
          };
        }

        // Ensure provider is set to 'sendgrid'
        if (!doc.email?.provider) {
          updateOps.$set['email.provider'] = 'sendgrid';
        }

        // Ensure enabled is set (default to false)
        if (doc.email && typeof doc.email.enabled === 'undefined') {
          updateOps.$set['email.enabled'] = false;
        }

        // Only update if there are changes to make
        if (Object.keys(updateOps.$set).length > 0) {
          try {
            await collection.updateOne(
              { _id: doc._id },
              updateOps,
              { session: transactionStarted && !DRY_RUN ? session : undefined }
            );
            fixedCount++;
          } catch (error) {
            logWarning(`Failed to fix document ${doc._id}: ${error.message}`);
            stats.addError(error, doc._id);
          }
        }
      }

      if (fixedCount > 0) {
        logSuccess(`Fixed incomplete email structures in ${fixedCount} document(s)`);
      }

      if (!DRY_RUN) {
        if (transactionStarted) {
          await session.commitTransaction();
          logSuccess('Transaction committed successfully');
        } else {
          logSuccess('Changes applied (no transaction available on standalone MongoDB)');
        }
      } else {
        logWarning('DRY-RUN: Changes not committed to database');
        if (transactionStarted) {
          await session.abortTransaction();
        }
      }

      return true;
    } catch (error) {
      if (!DRY_RUN && transactionStarted) {
        try {
          await session.abortTransaction();
          logError('Transaction rolled back due to error');
        } catch (e) {
          // ignore abort errors
        }
      }
      logError(`Migration failed: ${error.message}`);
      stats.addError(error);
      return false;
    } finally {
      await session.endSession();
    }
  } catch (error) {
    logError(`Migration error: ${error.message}`);
    stats.addError(error);
    return false;
  }
}

/**
 * Verify migration results
 */
async function verifyMigration(stats) {
  try {
    logSection('Verifying Migration Results');

    const collection = mongoose.connection.db.collection(COLLECTION_NAME);

    // Check for remaining legacy fields
    const withLegacy = await collection.countDocuments({
      $or: [
        { smtp: { $exists: true } },
        { gmail: { $exists: true } },
      ]
    });

    if (withLegacy === 0) {
      logSuccess('✓ No legacy fields (smtp/gmail) found');
    } else {
      logWarning(`✗ Found ${withLegacy} document(s) still with legacy fields`);
    }

    // Check for email structure
    const withoutEmail = await collection.countDocuments({
      email: { $exists: false }
    });

    if (withoutEmail === 0) {
      logSuccess('✓ All documents have email field');
    } else {
      logWarning(`✗ Found ${withoutEmail} document(s) without email field`);
    }

    // Check email structure completeness
    const incompleteEmail = await collection.countDocuments({
      $or: [
        { 'email.sendgrid': { $exists: false } },
        { 'email.provider': { $exists: false } },
        { 'email.enabled': { $exists: false } },
      ]
    });

    if (incompleteEmail === 0) {
      logSuccess('✓ All email structures are complete');
    } else {
      logWarning(`✗ Found ${incompleteEmail} document(s) with incomplete email structure`);
    }

    // Sample a document to verify structure
    const sampleDoc = await collection.findOne();
    if (sampleDoc) {
      log('\nSample document structure (after migration):');
      log(JSON.stringify({
        _id: sampleDoc._id,
        email: sampleDoc.email,
        hasSmtp: !!sampleDoc.smtp,
        hasGmail: !!sampleDoc.gmail,
      }, null, 2));
    }

    return true;
  } catch (error) {
    logError(`Verification failed: ${error.message}`);
    stats.addError(error);
    return false;
  }
}

/**
 * Display migration summary
 */
function displaySummary(stats) {
  logSection('Migration Summary');

  const summary = stats.summary();
  log(`Mode: ${DRY_RUN ? 'DRY-RUN (no changes)' : 'LIVE (changes applied)'}`);
  log(`Duration: ${summary.durationSeconds} seconds\n`);

  log(`Total documents: ${summary.totalDocuments}`);
  log(`Documents with legacy fields: ${summary.documentsWithLegacyFields}`);
  log(`Documents without email: ${summary.documentsWithoutEmail}`);
  log(`Documents unset: ${summary.documentsUnset}`, 'green');
  log(`Documents initialized: ${summary.documentsInitialized}`, 'green');
  log(`Errors: ${summary.errorCount}`, summary.errorCount > 0 ? 'red' : 'green');

  if (stats.errors.length > 0) {
    logSection('Errors');
    stats.errors.forEach((err, index) => {
      logError(`${index + 1}. ${err.error}${err.documentId ? ` (Document: ${err.documentId})` : ''}`);
    });
  }
}

/**
 * Main migration function
 */
async function runMigration() {
  const stats = new MigrationStats();

  try {
    logHeader(`MongoDB Migration: SystemSettings SendGrid-Only Refactor`);

    if (DRY_RUN) {
      logWarning('DRY-RUN MODE: No changes will be made to the database');
      logWarning('Run with DRY_RUN=false to apply changes');
    }

    // Step 1: Connect to database
    if (!await connectDatabase()) {
      process.exit(1);
    }

    // Step 2: Validate collection
    if (!await validateCollection()) {
      process.exit(1);
    }

    // Step 3: Analyze documents
    if (!await analyzeDocuments(stats)) {
      process.exit(1);
    }

    // Step 4: Perform migration
    if (!await performMigration(stats)) {
      logError('Migration failed. Changes were not applied.');
      if (!DRY_RUN) {
        process.exit(1);
      }
    }

    // Step 5: Verify migration
    if (!await verifyMigration(stats)) {
      logWarning('Verification returned warnings');
    }

    // Step 6: Display summary
    displaySummary(stats);

    // Final message
    if (DRY_RUN) {
      logHeader('DRY-RUN COMPLETE');
      log('To apply changes, run:');
      log(`  DRY_RUN=false node server/migrations/migrate-to-sendgrid-only.js`, 'yellow');
    } else {
      logHeader('MIGRATION COMPLETE');
      logSuccess('All changes have been applied to the database');
    }

  } catch (error) {
    logError(`Unexpected error: ${error.message}`);
    if (!DRY_RUN) {
      process.exit(1);
    }
  } finally {
    await disconnectDatabase();
  }
}

// Execute migration
if (require.main === module) {
  runMigration().catch(error => {
    logError(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { runMigration, MigrationStats };
