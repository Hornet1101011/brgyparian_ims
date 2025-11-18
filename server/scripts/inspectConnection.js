const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('ERROR: MONGODB_URI is not set.');
  process.exit(2);
}

(async () => {
  try {
    console.log('Connecting using MONGODB_URI (will not print secret) ...');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    const client = (typeof mongoose.connection.getClient === 'function')
      ? mongoose.connection.getClient()
      : mongoose.connection.client;

    // Print topology servers
    try {
      const topo = client.topology && client.topology.s && client.topology.s.description;
      if (topo && topo.servers) {
        console.log('\nTopology servers:');
        for (const [k, v] of Object.entries(topo.servers)) {
          console.log(`- ${k}: ${JSON.stringify(v.address || v)}`);
        }
      } else if (client.s && client.s.options && client.s.options.srvHost) {
        console.log('\nSRV host:', client.s.options.srvHost);
      } else {
        console.log('\nTopology info not available via driver introspection.');
      }
    } catch (e) {
      console.log('Error reading topology:', e.message || e);
    }

    // Admin connection status
    try {
      const admin = client.db().admin();
      const status = await admin.command({ connectionStatus: 1 });
      console.log('\nConnection status (auth info):', JSON.stringify(status.authInfo || status, null, 2));
    } catch (e) {
      console.log('Error getting connectionStatus:', e.message || e);
    }

    // List databases briefly
    try {
      const admin = client.db().admin();
      const dbs = await admin.listDatabases();
      console.log('\nDatabases:');
      for (const d of dbs.databases) console.log(`- ${d.name} (${d.sizeOnDisk})`);
    } catch (e) {
      console.log('Error listing databases:', e.message || e);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Inspect error:', err.message || err);
    process.exit(1);
  }
})();
