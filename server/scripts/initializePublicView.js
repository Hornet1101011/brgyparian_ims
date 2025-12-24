#!/usr/bin/env node

/**
 * Initialize PublicView collection and GridFS buckets
 * 
 * This script:
 * 1. Ensures PublicView collection exists
 * 2. Creates PublicView indexes
 * 3. Ensures publicview GridFS bucket exists
 * 4. Initializes PublicView with current SystemSetting data if empty
 * 
 * Run with: node scripts/initializePublicView.js
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SystemSetting = require('../models/SystemSetting');
const PublicView = require('../models/PublicView');
const mongodb = require('mongodb');

async function main() {
  try {
    console.log('[InitializePublicView] Connecting to MongoDB...');
    
    // Connect to MongoDB
    if (!mongoose.connection.readyState) {
      const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/barangay';
      await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }
    
    console.log('[InitializePublicView] Connected to MongoDB');
    
    // Get database connection
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Failed to get database connection');
    }
    
    // 1. Create PublicView collection if it doesn't exist
    console.log('[InitializePublicView] Checking PublicView collection...');
    try {
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);
      
      if (!collectionNames.includes('publicviews')) {
        console.log('[InitializePublicView] Creating publicviews collection...');
        await db.createCollection('publicviews');
        console.log('[InitializePublicView] ✓ Created publicviews collection');
      } else {
        console.log('[InitializePublicView] ✓ publicviews collection already exists');
      }
    } catch (err) {
      console.warn('[InitializePublicView] Warning creating collection:', err.message);
    }
    
    // 2. Create indexes on PublicView
    console.log('[InitializePublicView] Creating indexes...');
    try {
      await PublicView.collection.createIndex({ isActive: 1 });
      console.log('[InitializePublicView] ✓ Created isActive index');
    } catch (err) {
      console.warn('[InitializePublicView] Warning creating index:', err.message);
    }
    
    // 3. Ensure publicview GridFS bucket exists
    console.log('[InitializePublicView] Checking publicview GridFS bucket...');
    try {
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);
      
      // GridFS creates two collections: publicview.files and publicview.chunks
      if (!collectionNames.includes('publicview.files')) {
        console.log('[InitializePublicView] Creating publicview GridFS bucket...');
        // Create empty file to initialize the bucket
        const bucket = new mongodb.GridFSBucket(db, { bucketName: 'publicview' });
        const uploadStream = bucket.openUploadStream('_init.txt');
        uploadStream.write('initialized');
        await new Promise((resolve, reject) => {
          uploadStream.on('finish', resolve);
          uploadStream.on('error', reject);
        });
        // Delete the init file
        const files = await db.collection('publicview.files').find({}).toArray();
        if (files.length > 0) {
          await bucket.delete(files[0]._id);
        }
        console.log('[InitializePublicView] ✓ Created publicview GridFS bucket');
      } else {
        console.log('[InitializePublicView] ✓ publicview GridFS bucket already exists');
      }
    } catch (err) {
      console.warn('[InitializePublicView] Warning checking/creating GridFS bucket:', err.message);
    }
    
    // 4. Initialize PublicView with SystemSetting data if empty
    console.log('[InitializePublicView] Initializing PublicView data...');
    try {
      const existingCount = await PublicView.countDocuments({ isActive: true });
      
      if (existingCount === 0) {
        console.log('[InitializePublicView] No active PublicView found, creating from SystemSetting...');
        const settings = await SystemSetting.findOne().lean();
        
        if (settings) {
          const publicView = await PublicView.create({
            siteName: settings.siteName || '',
            barangayName: settings.barangayName || '',
            barangayAddress: settings.barangayAddress || '',
            contactEmail: settings.contactEmail || '',
            contactPhone: settings.contactPhone || '',
            systemNotice: settings.systemNotice || '',
            lastSyncedAt: new Date(),
            isActive: true
          });
          console.log('[InitializePublicView] ✓ Created PublicView from SystemSetting');
        } else {
          console.log('[InitializePublicView] No SystemSetting found, creating empty PublicView');
          const publicView = await PublicView.create({
            siteName: 'Barangay Information System',
            barangayName: '',
            barangayAddress: '',
            contactEmail: '',
            contactPhone: '',
            systemNotice: '',
            lastSyncedAt: new Date(),
            isActive: true
          });
          console.log('[InitializePublicView] ✓ Created empty PublicView');
        }
      } else {
        console.log('[InitializePublicView] ✓ Active PublicView already exists');
      }
    } catch (err) {
      console.error('[InitializePublicView] Error initializing PublicView data:', err.message);
      throw err;
    }
    
    console.log('\n[InitializePublicView] ✓ All initialization tasks completed successfully!');
    console.log('[InitializePublicView] PublicView collection is ready for use');
    console.log('[InitializePublicView] GridFS publicview bucket is ready for future use');
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('[InitializePublicView] FATAL ERROR:', err);
    if (mongoose.connection.readyState) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

main();
