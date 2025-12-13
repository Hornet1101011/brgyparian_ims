/**
 * Fix script to drop the conflicting barangayID index
 * This resolves the MongoDB index conflict that's causing 500 errors
 */

const mongoose = require('mongoose');
require('dotenv').config();

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://zedrickjohnhabacon_db_user:Hk2lDjqBM6gLN7Qq@cluster0.egjkyyg.mongodb.net/test?retryWrites=true&w=majority';

async function fixResidentIndex() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000,
      tlsInsecure: true
    });

    const ResidentModel = mongoose.model('Resident', new mongoose.Schema({}, { collection: 'residents' }));
    
    console.log('Connected. Getting Resident collection indexes...');
    const indexes = await ResidentModel.collection.getIndexes();
    console.log('Current indexes:', JSON.stringify(indexes, null, 2));

    // Look for the conflicting barangayID_1 index
    if (indexes.barangayID_1) {
      console.log('\nFound barangayID_1 index:', indexes.barangayID_1);
      console.log('Dropping index...');
      
      await ResidentModel.collection.dropIndex('barangayID_1');
      console.log('✓ Successfully dropped barangayID_1 index');
    } else {
      console.log('barangayID_1 index not found');
    }

    // Show remaining indexes
    const newIndexes = await ResidentModel.collection.getIndexes();
    console.log('\nRemaining indexes:', JSON.stringify(newIndexes, null, 2));

    console.log('\n✅ Index fix complete. Server should now start without conflicts.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixResidentIndex();
