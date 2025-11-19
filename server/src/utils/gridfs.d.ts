import { GridFSBucket } from 'mongodb';

export function getBucket(name: string): GridFSBucket | null;
export function ensureBucket(name: string): GridFSBucket | null;
export function listBuckets(): string[];

declare const _default: {
  getBucket: typeof getBucket;
  ensureBucket: typeof ensureBucket;
  listBuckets: typeof listBuckets;
};

export default _default;
