// Compatibility shim: when the app runs from compiled `dist/` the
// VerificationRequest model lives in `dist/models/VerificationRequest.js`.
// Some legacy CommonJS route files in `server/routes` require
// `../models/VerificationRequest` directly (relative to the project root),
// which would fail if only the TypeScript source or compiled `dist` files
// exist. This file proxies the require to the compiled model.
try {
  module.exports = require('../dist/models/VerificationRequest');
} catch (e) {
  // If the compiled model isn't available for some reason, surface a clear error.
  console.error('VerificationRequest compatibility shim failed to load compiled model:', e && e.message);
  throw e;
}
