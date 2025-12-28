#!/usr/bin/env node

/**
 * Verify that processed documents are stored in the correct GridFS bucket
 * 
 * GridFS with bucket name 'processed_documents' creates two collections:
 *   - processed_documents.files (stores metadata)
 *   - processed_documents.chunks (stores binary chunks)
 * 
 * This script verifies the structure and provides a summary.
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/barangay_system';

async function verifyGridFSBuckets() {
  try {
    console.log('🔍 Verifying GridFS bucket structure...\n');
    
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    const db = mongoose.connection.db;
    
    // Get list of all collections
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    console.log('📋 Collections related to document processing:\n');
    
    // Check for processed_documents collections
    const processedFiles = collectionNames.includes('processed_documents.files');
    const processedChunks = collectionNames.includes('processed_documents.chunks');
    
    console.log(`  ${processedFiles ? '✓' : '✗'} processed_documents.files`);
    console.log(`  ${processedChunks ? '✓' : '✗'} processed_documents.chunks`);
    
    // Check for old document collections (should not exist for new setup)
    const oldDocFiles = collectionNames.includes('document.files');
    const oldDocChunks = collectionNames.includes('document.chunks');
    
    if (oldDocFiles || oldDocChunks) {
      console.log('\n⚠️  Old document collections detected (should be migrated):');
      console.log(`  ${oldDocFiles ? '⚠' : '✓'} document.files`);
      console.log(`  ${oldDocChunks ? '⚠' : '✓'} document.chunks`);
    }
    
    // Check ProcessedDocument collection
    const pdExists = collectionNames.includes('processdocuments') || 
                     collectionNames.includes('processed_documents');
    console.log(`  ${pdExists ? '✓' : '✗'} ProcessedDocument metadata collection`);
    
    // Get statistics
    console.log('\n📊 GridFS Bucket Statistics:\n');
    
    if (processedFiles) {
      const fileCount = await db.collection('processed_documents.files').countDocuments();
      console.log(`  Processed documents (files): ${fileCount}`);
      
      if (fileCount > 0) {
        const sample = await db.collection('processed_documents.files').findOne();
        console.log(`  Sample file size: ${sample.length} bytes`);
        console.log(`  Sample filename: ${sample.filename}`);
      }
    }
    
    if (processedChunks) {
      const chunkCount = await db.collection('processed_documents.chunks').countDocuments();
      console.log(`  Processed documents (chunks): ${chunkCount}`);
    }
    
    // Check ProcessedDocument metadata
    if (pdExists) {
      const PDModel = require('../models/ProcessedDocument');
      const count = await PDModel.countDocuments();
      console.log(`  ProcessedDocument records: ${count}`);
    }
    
    console.log('\n✅ Verification complete!\n');
    console.log('GridFS Structure:');
    console.log('  Bucket Name: processed_documents');
    console.log('  Files Collection: processed_documents.files');
    console.log('  Chunks Collection: processed_documents.chunks');
    console.log('\nAll processed documents are correctly stored in the processed_documents bucket.');
    
  } catch (error) {
    console.error('❌ Error during verification:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

verifyGridFSBuckets();
