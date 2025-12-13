require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  try {
    // Connect to MongoDB using the same URI as the app
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/barangay_system';
    console.log('Connecting to:', mongoUri.replace(/:[^:]*@/, ':****@'));
    
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB');
    
    // Import models
    const { Resident } = require('./dist/models/Resident');
    const { DocumentRequest } = require('./dist/models/DocumentRequest');
    
    console.log('✓ Models loaded');
    
    // Test queries
    const residentCount = await Resident.countDocuments();
    console.log(`✓ Residents in database: ${residentCount}`);
    
    const docCount = await DocumentRequest.countDocuments();
    console.log(`✓ Document requests in database: ${docCount}`);
    
    // Test aggregation (mimics getGenderDistribution)
    const genderResult = await Resident.aggregate([
      {
        $group: {
          _id: {
            $cond: [
              { $eq: [{ $toLower: { $substr: ['$sex', 0, 1] } }, 'm'] },
              'Male',
              {
                $cond: [
                  { $eq: [{ $toLower: { $substr: ['$sex', 0, 1] } }, 'f'] },
                  'Female',
                  'Other'
                ]
              }
            ]
          },
          count: { $sum: 1 }
        }
      }
    ]);
    
    console.log(`✓ Gender distribution aggregation worked:`, genderResult);
    
    // Test find (mimics getPersonalInfoRecords)
    const residents = await Resident.find({}).limit(5).lean();
    console.log(`✓ Find query worked, sample residents:`, residents.length);
    
    console.log('\n✅ All tests passed! Analytics functions should work.');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
})();
