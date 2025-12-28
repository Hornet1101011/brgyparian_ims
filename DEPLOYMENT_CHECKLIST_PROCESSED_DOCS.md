# Deployment Checklist - Processed Documents Fix

## Pre-Deployment Verification ✓
- [x] TypeScript compilation successful (npm run build)
- [x] No TypeScript errors in processedDocuments.ts
- [x] Compiled JavaScript file created at dist/routes/processedDocuments.js
- [x] Routes properly exported as CommonJS module
- [x] MongoDB GridFS bucket handling implemented
- [x] File upload with multer integration
- [x] Proper error handling and response formats

## Deployment Steps

1. **Ensure rebuild is deployed**
   ```bash
   cd server
   npm run build  # Already done locally
   ```

2. **Restart the server** (if on Render or similar)
   - The compiled code at `server/dist/routes/processedDocuments.js` will be loaded by `server/index.js`
   - Server will initialize the route through app.js line 246
   - No additional configuration needed

3. **Verify MongoDB collections exist**
   - `processed_documents.files` - automatically created by GridFS on first upload
   - `processed_documents.chunks` - automatically created by GridFS on first upload
   - Already initialized in app.js lines 85-110 on MongoDB connection

## Testing After Deployment

### Test 1: Upload Processed Document
```javascript
const formData = new FormData();
formData.append('file', new Blob([documentBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'test.docx');
formData.append('sourceTemplateId', 'template-id-here');
formData.append('requestId', 'request-id-here');

const response = await fetch('/api/processed-documents/upload', {
  method: 'POST',
  body: formData,
  credentials: 'include'
});
// Expected: 200 with { success: true, id: '...', filename: '...', ... }
```

### Test 2: List Processed Documents
```javascript
const response = await fetch('/api/processed-documents', {
  method: 'GET',
  credentials: 'include'
});
// Expected: 200 with { items: [...] }
```

### Test 3: Download Processed Document
```javascript
// After getting a document ID from upload or list
window.location.href = '/api/processed-documents/{id}/raw';
// Expected: File downloads with correct filename and content-type
```

### Test 4: Verify MongoDB Storage
```javascript
// In MongoDB shell or Compass:
db.getCollection('processed_documents.files').find({})
// Should show uploaded documents
db.getCollection('processed_documents.chunks').find({})
// Should show file chunks
```

## Rollback Plan
If issues occur:
1. Revert to previous commit: `git revert <commit-hash>`
2. Rebuild: `npm run build`
3. Redeploy
4. The shim endpoints would return errors, but wouldn't break other functionality

## Expected Behavior After Fix

### Client Upload Flow
1. User generates/processes a document in DocumentProcessing component
2. Client POSTs to `/api/processed-documents/upload`
3. File is saved to GridFS bucket `processed_documents`
4. Response returns file ID and metadata
5. Client can reference or download the file

### Bucket Structure
```
MongoDB Collections:
├── documents.files         (Templates uploaded by admin)
├── documents.chunks        (Template chunks)
├── processed_documents.files    (Generated/processed documents)
└── processed_documents.chunks   (Processed document chunks)
```

## Monitoring

### Logs to watch for:
```
[Processed Documents] ✓ Uploaded {filename} to GridFS bucket processed_documents with ID {id}
```

### Errors to watch for:
- "Database not available" - MongoDB connection issue
- "No file provided" - Client not sending file
- "Failed to upload file to GridFS" - GridFS write error

## Success Indicators
- ✓ POST /api/processed-documents/upload returns 200 with file ID
- ✓ Documents appear in `processed_documents.files` collection
- ✓ GET /api/processed-documents/:id/raw returns file download
- ✓ No more 501 or 404 errors on document upload attempts
