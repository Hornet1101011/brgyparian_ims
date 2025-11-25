// Migration script: dedupe appointment slots by (date, appointmentStartTime, appointmentEndTime)
// Keeps the earliest document (by createdAt or _id) and removes other duplicates, then creates a unique index.

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// Load env from project .env if present
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/barangay_system';

async function run() {
  const args = process.argv.slice(2 || 0);
  const dryRun = args.includes('--dry-run') || args.includes('-n');
  const verbose = args.includes('--verbose') || args.includes('-v');
  console.log('Connecting to', MONGODB_URI);
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;
  const collName = 'appointmentslots';
  const coll = db.collection(collName);

  console.log('Scanning for duplicate appointment ranges in collection', collName);

  // Group by date + start + end
  const cursor = coll.aggregate([
    {
      $group: {
        _id: { date: '$date', start: '$appointmentStartTime', end: '$appointmentEndTime' },
        ids: { $push: '$_id' },
        count: { $sum: 1 },
        minCreated: { $min: '$createdAt' }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ], { allowDiskUse: true });

  let dupCount = 0;
  while (await cursor.hasNext()) {
    const g = await cursor.next();
    // Skip groups where start or end are null/undefined (we only enforce when range is present)
    if (!g || !g._id) continue;
    const { date, start, end } = g._id;
    if (!date || !start || !end) continue;

    const ids = g.ids || [];
    if (ids.length <= 1) continue;

    // Determine which id to keep: prefer document with earliest createdAt; if not available, keep smallest ObjectId
    const docs = await coll.find({ _id: { $in: ids } }).project({ _id: 1, createdAt: 1 }).toArray();
    docs.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (ta !== tb) return ta - tb;
      // fallback to ObjectId string compare
      return String(a._id).localeCompare(String(b._id));
    });
    const keep = docs[0];
    const remove = docs.slice(1).map(d => d._id);

    if (remove.length > 0) {
      if (dryRun) {
        console.log(`[dry-run] Would remove ${remove.length} duplicate docs for ${date} ${start}-${end}; keep ${String(keep._id)}`);
      } else {
        const delRes = await coll.deleteMany({ _id: { $in: remove } });
        console.log(`Deduped ${date} ${start}-${end}: removed ${delRes.deletedCount} docs, kept ${String(keep._id)}`);
        dupCount += delRes.deletedCount || 0;
      }
    }
  }

  console.log('Total duplicate documents removed:', dupCount);

  // Create the unique index on (date, appointmentStartTime, appointmentEndTime)
  try {
    if (dryRun) {
      console.log('[dry-run] Skipping index creation because --dry-run was specified.');
    } else {
      console.log('Creating unique index on {date, appointmentStartTime, appointmentEndTime}...');
      await coll.createIndex({ date: 1, appointmentStartTime: 1, appointmentEndTime: 1 }, { unique: true, sparse: true });
      console.log('Unique index created successfully.');
    }
  } catch (e) {
    console.error('Failed to create unique index:', e && e.message ? e.message : e);
    console.error('If index creation failed due to duplicates, re-run this script after manual inspection.');
    process.exitCode = 2;
  }

  await mongoose.disconnect();
  console.log('Migration complete');
}

run().catch(err => {
  console.error('Migration error:', err && err.message ? err.message : err);
  process.exitCode = 1;
});
