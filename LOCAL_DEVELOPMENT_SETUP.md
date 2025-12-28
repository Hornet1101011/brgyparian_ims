# Local Development Setup - Running Server Locally

## Current Issue
You're trying to test document generation against the remote Render server from `http://localhost:3000` client, which causes:
- CORS errors (remote server doesn't allow localhost)
- 502/503 errors (remote server is down or overloaded)
- Connection timeouts

## Solution: Run Server Locally

### Step 1: Set Up Environment Variables
Create or update `server/.env` file:
```
MONGO_URI=mongodb://localhost:27017/alphaversion
NODE_ENV=development
SESSION_SECRET=your-secret-key
JWT_SECRET=your-jwt-secret
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
SETTINGS_ENCRYPTION_KEY=your-32-byte-key-here
```

### Step 2: Start MongoDB Locally
```bash
# If using MongoDB locally (install if needed)
mongod --dbpath c:\path\to\mongodb\data
# Or use MongoDB Atlas cloud instance
```

### Step 3: Start the Backend Server
```bash
cd server
npm install  # if needed
npm run build  # Compile TypeScript
node index.js  # Or use: npm start (if package.json has start script)
```

Server will run on `http://localhost:5000` (or check the console for the port)

### Step 4: Update Client API URL
In `client/src/services/api.ts` or similar, ensure the API base URL is:
```typescript
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
```

Or set environment variable in `.env` file:
```
REACT_APP_API_URL=http://localhost:5000
```

### Step 5: Start the Client (if not already running)
```bash
cd client
npm start
```

Client will run on `http://localhost:3000`

## Testing Workflow

### Local Testing
1. Browser: http://localhost:3000
2. Backend: http://localhost:5000
3. No CORS issues
4. Full control over both client and server
5. Can see server logs in real-time

### Document Generation Test
1. Go to Document Processing page
2. Select a template
3. Fill in fields
4. Click "Generate Document"
5. Should work without CORS errors
6. Check server logs for transaction code generation
7. Document should upload to `processed_documents` bucket

## Troubleshooting

### "Cannot connect to MongoDB"
- Ensure MongoDB is running
- Check MONGO_URI in .env
- Use `mongosh` to verify connection: `mongosh mongodb://localhost:27017`

### "Port 5000 already in use"
- Change port in app startup: `app.listen(3001)` etc
- Or kill existing process on port 5000

### "CORS errors still occurring"
- Check `CORS_ALLOWED_ORIGINS` environment variable in .env
- Should include `http://localhost:3000`
- Restart server after changing .env

### "Document upload still fails"
- Check server console for transaction code generation errors
- Verify MongoDB collections exist: `processed_documents.files`
- Check that GridFS bucket is being created properly

## Server Start Verification

You should see logs like:
```
MongoDB connected
Session ID: [session info]
Server running on port 5000
[Processed Documents] Route registered
...
```

## Files to Check/Update

1. `server/.env` - Environment variables
2. `client/.env` - React environment variables  
3. `server/app.js` - CORS configuration (app.js lines 36-60)
4. `server/src/index.ts` - Server startup and routing

## When Ready for Production

1. Deploy the updated server code to Render
2. Set environment variables on Render dashboard:
   - `CORS_ALLOWED_ORIGINS` with your production frontend domain
   - `MONGO_URI` with production database
   - All other required secrets
3. Client should point to production URL
4. No need for CORS_ALLOWED_ORIGINS to include localhost

## Quick Start Command

```bash
# Terminal 1: Backend
cd c:\Users\Lawrence\Desktop\Alphaversion\server
npm run build
node index.js

# Terminal 2: Frontend (if not already running)
cd c:\Users\Lawrence\Desktop\Alphaversion\client
npm start
```

Then visit: http://localhost:3000

This will give you a fully functional local environment with no CORS issues!
