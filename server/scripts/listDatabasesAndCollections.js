const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('ERROR: MONGODB_URI is not set. Set it in your shell or pass it in the environment.');
  process.exit(2);
}

(async () => {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

    // Get underlying MongoClient
    const client = (typeof mongoose.connection.getClient === 'function')
      ? mongoose.connection.getClient()
      : mongoose.connection.client;

    if (!client) {
      console.error('Failed to access underlying MongoClient from mongoose connection.');
      process.exit(1);
    }

    const admin = client.db().admin();
    const dbs = await admin.listDatabases();

    console.log('Databases found:');
    for (const dbInfo of dbs.databases) {
      console.log(`- ${dbInfo.name} (${dbInfo.sizeOnDisk} bytes)`);
    }

    // Inspect each database's collections (but limit verbose output for very large DBs)
    for (const dbInfo of dbs.databases) {
      try {
        const dbObj = client.db(dbInfo.name);
        const cols = await dbObj.listCollections().toArray();
        console.log(`\nCollections in '${dbInfo.name}': (${cols.length})`);
        for (const c of cols) {
          const count = await dbObj.collection(c.name).countDocuments();
          console.log(`  ${c.name}: ${count}`);
        }
      } catch (e) {
        console.error(`Error listing collections for ${dbInfo.name}:`, e.message || e);
      }
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Diagnostic error:', err.message || err);
    process.exit(1);
  }
})();
