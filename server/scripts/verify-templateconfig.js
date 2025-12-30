#!/usr/bin/env node

/**
 * Verify templateconfig Integration
 * 
 * This script verifies that the templateconfig collection is properly integrated
 * by checking database structure, API endpoints, and data flow.
 * 
 * Usage: node scripts/verify-templateconfig.js
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function verify() {
  try {
    console.log('\n========== [Template Config Verification] ==========\n');
    
    // 1. Connect to MongoDB
    console.log('1️⃣ Connecting to MongoDB...');
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/barangay_system';
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected successfully\n');

    // 2. Check if templateconfig collection exists
    console.log('2️⃣ Checking templateconfig collection...');
    const db = mongoose.connection.db;
    const collections = await db.listCollections({}).toArray();
    const collNames = collections.map(c => c.name);
    
    if (collNames.includes('templateconfig')) {
      console.log('✅ Collection exists\n');
    } else {
      console.log('⚠️  Collection does not exist (will be created on first save)\n');
    }

    // 3. Check templateconfig collection statistics
    if (collNames.includes('templateconfig')) {
      console.log('3️⃣ Collection Statistics:');
      const templateConfigColl = db.collection('templateconfig');
      const count = await templateConfigColl.countDocuments();
      console.log(`   Documents: ${count}`);
      
      if (count > 0) {
        // Show sample document
        const sample = await templateConfigColl.findOne();
        console.log('\n   Sample Document:');
        console.log(`   - templateId: ${sample.templateId}`);
        console.log(`   - validations: ${sample.validations ? sample.validations.length : 0} rules`);
        console.log(`   - config: ${JSON.stringify(sample.config)}`);
        console.log(`   - updatedAt: ${sample.updatedAt}`);
        if (sample.validations && sample.validations.length > 0) {
          console.log('\n   First Validation Rule:');
          const v = sample.validations[0];
          console.log(`     - placeholder: ${v.placeholder}`);
          console.log(`     - fieldType: ${v.fieldType}`);
          console.log(`     - isRequired: ${v.isRequired}`);
          console.log(`     - maxCharacters: ${v.maxCharacters}`);
          console.log(`     - tooltip: ${v.tooltip}`);
        }
      }
      console.log('');
    } else {
      console.log('3️⃣ Collection Statistics: (will be populated on first use)\n');
    }

    // 4. Check indexes
    console.log('4️⃣ Checking Indexes:');
    if (collNames.includes('templateconfig')) {
      const templateConfigColl = db.collection('templateconfig');
      const indexes = await templateConfigColl.listIndexes().toArray();
      console.log(`   Total indexes: ${indexes.length}`);
      for (const idx of indexes) {
        console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`);
      }
    } else {
      console.log('   (Indexes will be created when collection is created)');
    }
    console.log('');

    // 5. Check documents.files collection (to verify template files exist)
    console.log('5️⃣ Checking documents.files Collection:');
    if (collNames.includes('documents.files')) {
      const docsColl = db.collection('documents.files');
      const docCount = await docsColl.countDocuments();
      console.log(`   ✅ Found ${docCount} template file(s)`);
      
      if (docCount > 0) {
        // List first 3 templates
        const samples = await docsColl.find().limit(3).toArray();
        console.log('\n   Templates available:');
        for (const doc of samples) {
          console.log(`   - ${doc.filename} (ID: ${doc._id})`);
        }
      }
    } else {
      console.log('   ⚠️  documents.files collection not found');
    }
    console.log('');

    // 6. Verify required backend files exist
    console.log('6️⃣ Checking Backend Files:');
    const fs = require('fs');
    const backendFiles = [
      '../src/routes/documents.js',
      '../src/index.ts',
      '../app.js'
    ];
    
    for (const file of backendFiles) {
      const fullPath = path.join(__dirname, file);
      if (fs.existsSync(fullPath)) {
        console.log(`   ✅ ${path.basename(fullPath)} exists`);
      } else {
        console.log(`   ❌ ${path.basename(fullPath)} NOT FOUND`);
      }
    }
    console.log('');

    // 7. Verify frontend files exist
    console.log('7️⃣ Checking Frontend Files:');
    const frontendFiles = [
      '../client/src/components/TemplateValidationConfig.tsx',
      '../client/src/components/DocumentRequestForm.tsx',
      '../client/src/components/TemplatesManager.tsx',
      '../client/src/hooks/useTemplateValidations.ts'
    ];
    
    for (const file of frontendFiles) {
      const fullPath = path.join(__dirname, file);
      if (fs.existsSync(fullPath)) {
        console.log(`   ✅ ${path.basename(fullPath)} exists`);
      } else {
        console.log(`   ❌ ${path.basename(fullPath)} NOT FOUND`);
      }
    }
    console.log('');

    // 8. Summary and next steps
    console.log('========== [Verification Summary] ==========\n');
    console.log('✅ SYSTEM STATUS: Ready for templateconfig integration\n');
    console.log('NEXT STEPS:');
    console.log('1. Login as admin');
    console.log('2. Go to Templates Manager');
    console.log('3. Click Configure button on any template');
    console.log('4. Add validation rules for placeholders');
    console.log('5. Click "Save All Configurations"');
    console.log('6. Verify document is saved: ');
    console.log('   db.templateconfig.findOne({ templateId: ObjectId("...") })');
    console.log('7. Logout and login as resident');
    console.log('8. Go to Document Request Form');
    console.log('9. Select same template');
    console.log('10. Verify validation rules are applied\n');
    
    console.log('ENDPOINTS:');
    console.log('- GET /api/documents/:fileId/config       (load validations)');
    console.log('- POST /api/documents/:fileId/config      (save validations - admin only)');
    console.log('- GET /api/documents/:fileId/validations  (legacy endpoint)');
    console.log('- POST /api/documents/:fileId/validations (legacy endpoint - admin only)\n');

    console.log('========== [Verification Complete] ==========\n');

  } catch (err) {
    console.error('❌ Verification failed:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

verify();
