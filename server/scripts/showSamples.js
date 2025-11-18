const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('ERROR: MONGODB_URI is not set.');
  process.exit(2);
}

(async () => {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    const client = (typeof mongoose.connection.getClient === 'function')
      ? mongoose.connection.getClient()
      : mongoose.connection.client;

    const inspect = async (dbName, collNames) => {
      const db = client.db(dbName);
      console.log(`\n=== DB: ${dbName} ===`);
      for (const name of collNames) {
        try {
          const cols = await db.listCollections({ name }).toArray();
          if (!cols.length) {
            console.log(`${name}: <not found>`);
            continue;
          }
          const col = db.collection(name);
          const est = await col.estimatedDocumentCount();
          let exact = 'n/a';
          try { exact = await col.countDocuments(); } catch (e) { exact = `err:${e.message}`; }
          const sample = await col.findOne() || '<no documents>';
          console.log(`${name}: estimated=${est}, exact=${exact}, sample=${JSON.stringify(sample)}`);
        } catch (e) {
          console.log(`${name}: error: ${e.message}`);
        }
      }
    };

    await inspect('barangay_system', ['BIMS', 'users', 'residents', 'auditlogs', 'inquiries']);
    await inspect('test', ['users', 'residents', 'auditlogs', 'inquiries', 'documents.files', 'documents.chunks']);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
})();
