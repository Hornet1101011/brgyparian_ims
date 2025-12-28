# Document Processing Storage Configuration

## Overview

All processed documents (filled documents generated from templates) are now stored in the `processed_documents` GridFS bucket. This ensures proper separation between:
- **Template documents** - stored in `documents` bucket
- **Processed/filled documents** - stored in `processed_documents` bucket

## GridFS Collection Structure

When using GridFS with the bucket name `processed_documents`, MongoDB automatically creates two collections:

```
processed_documents.files     <- Stores file metadata and content
processed_documents.chunks    <- Stores binary chunks of large files
```

### Files Collection (processed_documents.files)
- Stores metadata for each processed document
- Fields include: `_id`, `length`, `chunkSize`, `uploadDate`, `filename`, `metadata`, `contentType`

### Chunks Collection (processed_documents.chunks)
- Stores binary data in chunks
- Fields include: `_id`, `files_id`, `n` (chunk number), `data` (binary chunk)

## Current Implementation

### Template Documents (Read-only)
- **Bucket**: `documents`
- **Collections**: `documents.files`, `documents.chunks`
- **Source**: Uploaded by admins in System Settings
- **Usage**: Used as templates for document generation

### Processed Documents (Generated)
- **Bucket**: `processed_documents`
- **Collections**: `processed_documents.files`, `processed_documents.chunks`
- **Source**: Generated when users request filled documents
- **Metadata Model**: `ProcessedDocument` (in `processdocuments` collection)

## Code Locations

### Key Files Using processed_documents Bucket

1. **server/src/routes/documents.js** (Line 95)
   ```javascript
   const documentsBucket = new GridFSBucket(filesDb, { bucketName: 'processed_documents' });
   ```
   - Handles `/admin/templates/:fileId/generate-filled` endpoint
   - Generates and stores filled documents

2. **server/src/controllers/documentController.ts** (Line 171)
   ```typescript
   const processedBucket = new GridFSBucket(filesDb, { bucketName: 'processed_documents' });
   ```
   - Handles document processing and storage
   - Manages existing processed document retrieval

3. **server/src/controllers/documentRequestController.ts** (Line 210)
   ```javascript
   const documentsBucket = new GridFSBucket(filesDb, { bucketName: 'processed_documents' });
   ```
   - Handles document request fulfillment
   - Stores generated documents from requests

4. **server/src/routes/processedDocuments.js**
   - REST API for accessing processed documents
   - Download and metadata retrieval
   - Uses `processed_documents` bucket exclusively

5. **server/src/routes/generatedDocuments.js**
   - Manages generated document metadata
   - Links to processed documents in GridFS

## ProcessedDocument Model

Located in: `server/models/ProcessedDocument.js`

```javascript
const processedDocumentSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  contentType: { type: String },
  size: { type: Number },
  gridFsFileId: { type: mongoose.Schema.Types.ObjectId, required: true },
  sourceTemplateId: { type: mongoose.Schema.Types.ObjectId, required: false },
  requestId: { type: mongoose.Schema.Types.ObjectId, required: false },
  metadata: { type: mongoose.Schema.Types.Mixed },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'processed_documents' });
```

**Key Fields:**
- `gridFsFileId` - Points to the actual file in GridFS `processed_documents.files`
- `sourceTemplateId` - Links to the original template document
- `requestId` - Links to the document request if applicable
- `metadata` - Custom metadata including `sourceFileId`

## Default GridFS Buckets

From `server/src/utils/gridfs.ts`:

```typescript
const defaultBuckets = [
  'documents',              // Template documents
  'processed_documents',    // Filled/processed documents
  'avatars',                // User profile images
  'verificationRequests',   // Verification document uploads
  'barangayOfficials'       // Official photos
];
```

## Workflow

1. **Admin uploads template** → Stored in `documents` bucket
2. **User requests document** → System reads template from `documents` bucket
3. **System fills template** → Generates DOCX with user data
4. **System stores result** → Uploads to `processed_documents` bucket
5. **User downloads** → Retrieved from `processed_documents` bucket

## Verification

To verify the GridFS structure is correct:

```bash
cd server
node scripts/verify-processed-documents-gridfs.js
```

This script will:
- ✓ Confirm `processed_documents.files` collection exists
- ✓ Confirm `processed_documents.chunks` collection exists
- ✓ Show statistics about stored documents
- ✓ Verify ProcessedDocument metadata records

## Migration from Old Structure

If you have old documents stored in a different bucket:

1. Export from old bucket using GridFS tools
2. Import into `processed_documents` bucket
3. Update ProcessedDocument metadata records
4. Update any hard-coded references in code

No migration is needed for new deployments - the correct bucket is used from the start.

## Best Practices

1. **Never use the 'document' bucket for processed documents** - Keep it for templates only
2. **Always create ProcessedDocument metadata records** - Enables querying without reading GridFS
3. **Include proper metadata** - sourceTemplateId and requestId for traceability
4. **Regular cleanup** - Archive or delete old processed documents to manage storage

## API Endpoints

- `GET /api/admin/processed-documents` - List processed documents
- `GET /api/admin/processed-documents/:id/download` - Download a processed document
- `GET /api/admin/processed-documents/:id/metadata` - Get document metadata
- `DELETE /api/admin/processed-documents/:id` - Delete a processed document

## Troubleshooting

**Issue**: "processed_documents bucket not found"
- **Solution**: Check that MongoDB connection is established and collection is created

**Issue**: "File not found in GridFS"
- **Solution**: Verify `gridFsFileId` exists in `processed_documents.files` collection

**Issue**: "ProcessedDocument metadata missing"
- **Solution**: Run verification script to check metadata records exist

**Issue**: Storage space increasing rapidly**
- **Solution**: Implement document retention policy and clean up old processed documents

