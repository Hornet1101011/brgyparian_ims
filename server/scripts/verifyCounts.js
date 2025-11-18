const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('ERROR: MONGODB_URI is not set. Set it in your shell or pass it in the environment.');
  process.exit(2);
}

(async () => {
  try {
    // Connect (explicitly use 'barangay_system' DB)
    await mongoose.connect(uri, { dbName: 'barangay_system', serverSelectionTimeoutMS: 10000 });
    const db = mongoose.connection.db;

    const collectionsToCheck = [
      'users',
      'residents',
      'auditlogs',
      'inquiries',
      'messages',
      'announcements',
      'documents.files',
      'documents.chunks'
    ];

    console.log('Connected. Verifying collections in database: barangay_system');

    for (const name of collectionsToCheck) {
      const exists = (await db.listCollections({ name }).toArray()).length > 0;
      if (!exists) {
        console.log(`${name}: <collection not found>`);
        continue;
      }

      const col = db.collection(name);
      const count = await col.countDocuments();
      console.log(`${name}: ${count} document(s)`);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Connection/verification error:', err.message || err);
    process.exit(1);
  }
})();
