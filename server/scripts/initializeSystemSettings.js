/**
 * Initialize System Settings
 * 
 * This script ensures that a default SystemSetting document exists in the database.
 * It's safe to run multiple times - it will only create the settings if they don't exist,
 * and will not overwrite existing settings.
 * 
 * Usage:
 *   node scripts/initializeSystemSettings.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const SystemSetting = require('../models/SystemSetting');

const DEFAULT_SETTINGS = {
  siteName: 'Barangay Information Management System',
  barangayName: 'Barangay Parian',
  barangayAddress: 'Barangay Parian, Calamba, Laguna',
  contactEmail: 'barangayparian@gmail.com',
  contactPhone: '09614215746',
  systemNotice: '',
  maintenanceMode: false,
  allowRegistrations: true,
  requireEmailVerification: true,
  maxDocumentRequestsPerUser: 5,
  documentProcessingDays: 3,
  allowMultipleAccountsPerIP: false,
  maxAccountsPerIP: 1,
};

async function initializeSystemSettings() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/barangay_system_parian';
    console.log(`[InitSystemSettings] Connecting to MongoDB at ${mongoUri.replace(/\/\/.*:.*@/, '//***:***@')}...`);
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('[InitSystemSettings] Connected to MongoDB');

    // Check if settings already exist
    const existingSettings = await SystemSetting.findOne();
    
    if (existingSettings) {
      console.log('[InitSystemSettings] System settings already exist in the database');
      console.log('[InitSystemSettings] Current settings:');
      console.log('  - siteName:', existingSettings.siteName);
      console.log('  - barangayName:', existingSettings.barangayName);
      console.log('  - barangayAddress:', existingSettings.barangayAddress);
      console.log('  - contactEmail:', existingSettings.contactEmail);
      console.log('  - contactPhone:', existingSettings.contactPhone);
      console.log('[InitSystemSettings] No changes made (use updateSystemSettings.js to modify)');
    } else {
      // Create default settings
      console.log('[InitSystemSettings] No system settings found - creating default settings...');
      
      const newSettings = await SystemSetting.create(DEFAULT_SETTINGS);
      
      console.log('[InitSystemSettings] ✅ System settings created successfully!');
      console.log('[InitSystemSettings] Created settings:');
      console.log('  - siteName:', newSettings.siteName);
      console.log('  - barangayName:', newSettings.barangayName);
      console.log('  - barangayAddress:', newSettings.barangayAddress);
      console.log('  - contactEmail:', newSettings.contactEmail);
      console.log('  - contactPhone:', newSettings.contactPhone);
      console.log('  - systemNotice:', newSettings.systemNotice || '(empty)');
    }

    process.exit(0);
  } catch (error) {
    console.error('[InitSystemSettings] ❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the initialization
initializeSystemSettings();
