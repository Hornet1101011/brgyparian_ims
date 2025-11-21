# fix(server): handle Mongo duplicate-key (E11000) across save() calls; add helper tests

## Summary

This pull request hardens the server against Mongo duplicate-key race conditions (E11000). It adds a small helper (`handleSaveError`) and centralized middleware to map duplicate-key errors to HTTP 409 where appropriate, and applies defensive handling across many `.save()` call sites to avoid unhandled 500s when concurrent requests insert the same unique key.

## Changes

- Added: `server/src/utils/handleSaveError.ts` and `server/src/utils/handleSaveError.js`
- Added: `server/src/middleware/errorHandler.ts`
- Added test: `server/src/__tests__/handleSaveError.test.ts`
- Updated multiple controllers and routes to use the helper or middleware (examples):
  - `documentRequestController.ts`, `requestController.ts`, `otpController.ts`, `inquiryController.ts`, `guestController.ts`, `adminController.ts`, `adminRoutes.ts`, `documents.js`, `logService.ts`, among others.

## Behavior

- Endpoints that previously threw internal server errors (500) on Mongo duplicate-key (E11000) will now return HTTP 409 Conflict with a simple payload: `{ message: 'Duplicate key error', keyValue }`.
- Background / best-effort saves (where the HTTP response is already sent) will detect duplicate-key and log them rather than failing the main flow.

## Tests

- Unit tests added for `handleSaveError` to ensure duplicate-key errors are detected and mapped to 409 when a response object is provided.

## Migration / Follow-ups

- Consider using atomic upserts (`findOneAndUpdate(..., { upsert: true })`) on high-risk create flows where semantics allow, to avoid races entirely.
- Consider adding an integration test that simulates concurrent inserts against a test Mongo instance to validate end-to-end behavior.

## Risk

- Low: changes are defensive and mostly add try/catch around `.save()` calls; the only user-visible behavior change is that duplicate-key errors return 409 instead of 500.

---
_Testing notes_: I ran `npm run build` and a focused unit test for the new helper. The full client build completed with some source-map/ESLint warnings (unrelated to these server changes). See CI warnings for details.
