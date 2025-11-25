// CommonJS wrapper for TS module to support imports that explicitly reference .js
// Re-export selected helpers from the TypeScript implementation
try {
  const mod = require('./gridfs');
  module.exports = mod && mod.default ? mod.default : mod;
} catch (e) {
  // If requiring the TS module fails (rare), export no-op fallbacks to avoid startup crash.
  console.warn('gridfs wrapper failed to require ./gridfs', e && e.message);
  module.exports = {
    getBucket: () => null,
    ensureBucket: () => null,
    listBuckets: () => []
  };
}
