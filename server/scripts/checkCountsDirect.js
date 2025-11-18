// Direct MongoDB driver check: prints collection counts and one sample per collection
// Usage (PowerShell):
// $env:MONGODB_URI = 'mongodb+srv://user:password@cluster0...'
// node .\scripts\checkCountsDirect.js
// Remove env var afterwards: Remove-Item Env:\MONGODB_URI

const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set. Set it and re-run.');
    process.exit(2);
  }

  console.log('Connecting using MONGODB_URI (will not print secret) ...\n');

  const client = new MongoClient(uri, { useUnifiedTopology: true });
  try {
    await client.connect();
    const admin = client.db().admin();
    const serverStatus = await admin.serverStatus().catch(() => null);
    if (serverStatus) {
      console.log('Connected. Server info:');
      console.log(`  host: ${serverStatus.host || 'n/a'}`);
    }

    const targetDbName = 'barangay_system';
    const db = client.db(targetDbName);

    console.log(`\n=== DB: ${targetDbName} ===`);

    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    if (!collections.length) {
      console.log('(no collections found)');
    }

    for (const c of collections) {
      try {
        const coll = db.collection(c.name);
        const estimated = await coll.estimatedDocumentCount();
        const exact = await coll.countDocuments();
        const sample = await coll.findOne() || '<no documents>';
        console.log(`- ${c.name}: estimated=${estimated}, exact=${exact}, sample=${sample === '<no documents>' ? sample : JSON.stringify(sample)}`);
      } catch (err) {
        console.log(`- ${c.name}: error checking: ${err.message}`);
      }
    }

    // Also list 'test' DB in case restore landed there
    const altDb = client.db('test');
    const altCollections = await altDb.listCollections({}, { nameOnly: true }).toArray();
    if (altCollections.length) {
      console.log('\n=== DB: test ===');
      for (const c of altCollections) {
        try {
          const coll = altDb.collection(c.name);
          const estimated = await coll.estimatedDocumentCount();
          const exact = await coll.countDocuments();
          const sample = await coll.findOne() || '<no documents>';
          console.log(`- ${c.name}: estimated=${estimated}, exact=${exact}, sample=${sample === '<no documents>' ? sample : JSON.stringify(sample)}`);
        } catch (err) {
          console.log(`- ${c.name}: error checking: ${err.message}`);
        }
      }
    }

    console.log('\nDone.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main();
