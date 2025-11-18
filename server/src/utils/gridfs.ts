import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';

type BucketMap = { [key: string]: GridFSBucket | null };

const buckets: BucketMap = {};

const defaultBuckets = [
  'documents',
  'processed_documents',
  'avatars',
  'verificationRequests',
  'barangayOfficials'
];

function initBucketsForDb() {
  try {
    // @ts-ignore
    const db = (mongoose.connection as any).db;
    if (!db) return;
    for (const name of defaultBuckets) {
      if (!buckets[name]) {
        try {
          buckets[name] = new GridFSBucket(db, { bucketName: name });
          // eslint-disable-next-line no-console
          console.log(`GridFS bucket initialized: ${name}`);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(`Failed to initialize GridFS bucket ${name}:`, err && (err as Error).message);
          buckets[name] = null;
        }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('initBucketsForDb error', err && (err as Error).message);
  }
}

// Initialize when mongoose opens connection
mongoose.connection.on('open', () => {
  initBucketsForDb();
});

// Also attempt to initialize immediately if already connected
if (mongoose.connection.readyState === 1) {
  initBucketsForDb();
}

export function getBucket(name: string): GridFSBucket | null {
  return buckets[name] || null;
}

export function ensureBucket(name: string): GridFSBucket | null {
  if (!buckets[name]) {
    try {
      // @ts-ignore
      const db = (mongoose.connection as any).db;
      if (!db) return null;
      buckets[name] = new GridFSBucket(db, { bucketName: name });
      // eslint-disable-next-line no-console
      console.log(`GridFS bucket ensured: ${name}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`Failed to ensure GridFS bucket ${name}:`, err && (err as Error).message);
      buckets[name] = null;
    }
  }
  return buckets[name] || null;
}

export function listBuckets(): string[] {
  return Object.keys(buckets).filter(k => buckets[k] !== undefined);
}

export default {
  getBucket,
  ensureBucket,
  listBuckets
};
