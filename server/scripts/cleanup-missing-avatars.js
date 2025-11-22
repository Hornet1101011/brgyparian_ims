#!/usr/bin/env node
/**
 * cleanup-missing-avatars.js
 *
 * Scans the `residents` collection for documents that reference a GridFS file
 * (bucket `avatars`) via `profileImageId` and checks whether the file exists.
 * If the file is missing, the script will clear `profileImageId` and `profileImage`
 * (or just report in `--dry-run` mode).
 *
 * Usage:
 *   node server/scripts/cleanup-missing-avatars.js [--dry-run]
 *
 * It uses MONGODB_URI environment variable or the default used by the app.
 */

const { MongoClient, ObjectId } = require('mongodb');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/barangay-system';

async function main() {
  console.log('Connecting to MongoDB:', MONGODB_URI);
  const client = new MongoClient(MONGODB_URI, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db();

  try {
    const residentsColl = db.collection('residents');
    const filesColl = db.collection('avatars.files');

    // Find residents that have a profileImageId set and it's non-empty
    const cursor = residentsColl.find({ profileImageId: { $exists: true, $ne: null, $ne: '' } });
    let total = 0;
    let missing = 0;
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      total += 1;
      const idStr = doc.profileImageId;
      let oid;
      try {
        oid = new ObjectId(idStr);
      } catch (err) {
        console.warn(`Resident ${doc._id} has invalid profileImageId: ${idStr}`);
        missing += 1;
        if (!dryRun) {
          await residentsColl.updateOne({ _id: doc._id }, { $unset: { profileImageId: '', profileImage: '' } });
          console.log(`  Cleared invalid profileImageId for resident ${doc._id}`);
        }
        continue;
      }

      const file = await filesColl.findOne({ _id: oid });
      if (!file) {
        missing += 1;
        console.log(`Missing GridFS file for resident ${doc._id} -> profileImageId=${idStr}`);
        if (!dryRun) {
          const update = { $unset: { profileImageId: '', profileImage: '' } };
          await residentsColl.updateOne({ _id: doc._id }, update);
          console.log(`  Cleared profileImage/profileImageId for resident ${doc._id}`);
        }
      }
    }

    console.log(`Scanned ${total} residents, found ${missing} missing files.`);
    if (dryRun) console.log('Dry-run mode: no changes were written. Re-run without --dry-run to apply fixes.');
  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error('cleanup-missing-avatars failed:', err);
  process.exitCode = 1;
});
