# Document Processing GridFS Quick Reference

## TL;DR

✅ **All processed documents are stored in `processed_documents` bucket**
- Files: `processed_documents.files`
- Chunks: `processed_documents.chunks`

## MongoDB Collections

```javascript
// Template Documents (from admins)
db.documents.files              // Template file metadata
db.documents.chunks             // Template file binary chunks

// Processed Documents (generated from requests)
db.processed_documents.files    // Processed file metadata
db.processed_documents.chunks   // Processed file binary chunks

// Metadata Records
db.processdocuments             // ProcessedDocument records
db.generated_documents          // GeneratedDocument records
```

## Key Code Locations

| File | Line | Purpose |
|------|------|---------|
| documents.js | 95 | Generate filled document, store in processed_documents |
| documentController.ts | 171 | Document processing endpoint |
| documentRequestController.ts | 210 | Handle document requests |
| gridfs.ts | 9 | Initialize processed_documents bucket |
| ProcessedDocument.js | 15 | Collection name: processed_documents |

## Verify Setup

```bash
cd server
node scripts/verify-processed-documents-gridfs.js
```

## API Flow

```
Client Request
    ↓
POST /api/admin/templates/:fileId/generate-filled
    ↓
Read template from documents bucket
    ↓
Fill with user data
    ↓
Upload to processed_documents bucket
    ↓
Save ProcessedDocument metadata
    ↓
Return file to client + gridFsFileId header
```

## ProcessedDocument Schema

```javascript
{
  filename: String,                  // e.g., "user_barangay_clearance.docx"
  contentType: String,               // "application/vnd.openxmlformats..."
  size: Number,                      // File size in bytes
  gridFsFileId: ObjectId,           // Reference to processed_documents.files
  sourceTemplateId: ObjectId,       // Original template
  requestId: ObjectId,              // Associated document request
  metadata: Mixed,                  // Custom data
  uploadedBy: ObjectId,             // User who triggered generation
  createdAt: Date                   // Timestamp
}
```

## Headers on File Download

```
X-Processed-GridFS-Id: <file-id>    // GridFS file ID
X-Processed-Doc-Id: <doc-id>        // ProcessedDocument record ID
X-Generated-Doc-Id: <gen-id>        // GeneratedDocument record ID
X-Filled-File-Id: <file-id>         // Same as X-Processed-GridFS-Id
```

## Troubleshooting

| Issue | Check |
|-------|-------|
| File not found | Verify `gridFsFileId` in ProcessedDocument exists in `processed_documents.files` |
| Bucket not initialized | Check MongoDB connection, run verify script |
| Missing metadata | Run verify script, check processdocuments collection |
| Storage too large | Clean old processed documents, implement retention policy |

## File Size Impact

For each processed document stored:
- **Metadata record** in `processdocuments`: ~500 bytes
- **File metadata** in `processed_documents.files`: ~300 bytes
- **File chunks** in `processed_documents.chunks`: File size (typically 1-5 MB)

## Cleanup Script

To remove old processed documents:
```javascript
// Remove documents older than 90 days
db.processdocuments.deleteMany({
  createdAt: { $lt: new Date(Date.now() - 90*24*60*60*1000) }
});
```

## Related Documentation

- See `DOCUMENT_PROCESSING_STORAGE_CONFIG.md` for detailed information
- See `DOCUMENT_PROCESSING_UPDATE_SUMMARY.md` for verification results

