# Deploy CORS Fix to Render

## What Was Changed
- Improved CORS configuration to allow localhost development testing
- Added X-Transaction-Code to exposed headers
- Localhost is now automatically allowed in development mode

## Deployment Steps

### Step 1: Deploy to Render

The code is already in the `test-fixes` branch. To deploy:

**Option A: Using GitHub Integration (Recommended)**
1. Merge `test-fixes` branch to `main` on GitHub
2. Render automatically detects push to main and redeploys
3. Wait 2-3 minutes for deployment to complete

**Option B: Manual Merge**
```bash
git checkout main
git merge test-fixes
git push hornet main
# Render auto-deploys on push to main
```

### Step 2: Set Environment Variable on Render

Even with the improved CORS, it's good practice to explicitly set the frontend origin:

1. Go to **Render Dashboard** → Select `alphaversion` service
2. Go to **Environment** section
3. Set or update `NODE_ENV`:
   ```
   NODE_ENV=production
   ```
   (Or `development` if you want localhost fallback - not recommended for production)

4. Save - service will auto-redeploy if you changed anything

### Step 3: Verify Deployment

Wait 2-3 minutes for Render to finish deploying, then test:

1. Check server health:
   ```
   curl https://alphaversion.onrender.com/api/settings/public
   ```
   Should return JSON with barangay settings

2. Test from your local client at `http://localhost:3000`
3. Try generating a document
4. Check browser console - CORS errors should be gone
5. Transaction code should be returned in headers

## How It Works Now

### Before
```
localhost:3000 → Remote Server
❌ CORS error: No Access-Control-Allow-Origin header
❌ Can't read X-Transaction-Code header
```

### After
```
localhost:3000 → Remote Server
✅ Server allows localhost:* in development mode
✅ X-Transaction-Code header is exposed
✅ Document generation works end-to-end
```

## Important Notes

⚠️ **Security Consideration:**
- The improved localhost support only activates if `NODE_ENV=development`
- For production (Render), set `NODE_ENV=production` to disable this fallback
- Production will only accept origins explicitly listed in environment variables

✅ **Best Practice:**
- Development: Use `NODE_ENV=development` to allow any localhost port
- Production: Use `NODE_ENV=production` and explicitly set `FRONTEND_URLS` or `CORS_ALLOWED_ORIGINS`

## Rollback (if needed)

If there are any issues:

```bash
git revert HEAD  # Revert the CORS changes
git push hornet test-fixes
# Then merge previous commit to main
```

## Testing Locally (Without Render)

If you want to test the changes locally first:

```bash
cd server
npm run build
NODE_ENV=development node index.js
```

Then visit `http://localhost:3000` and try generating a document. It should work with zero CORS errors.

## Files Modified in This Change

1. **server/app.js** - Plain Node CORS configuration
2. **server/src/index.ts** - Express/TypeScript CORS configuration  
3. **server/dist/index.js** - Compiled version (auto-generated)

## Verification Checklist

After deployment to Render:

- [ ] Server is running (no 502/503 errors)
- [ ] Can access https://alphaversion.onrender.com/api/settings/public
- [ ] Document generation from localhost:3000 works
- [ ] No CORS errors in browser console
- [ ] Transaction code is returned (not null)
- [ ] Files are saved to processed_documents bucket
- [ ] Can download generated documents

## Support

If you still see CORS errors after deployment:

1. Check that `NODE_ENV` is set correctly on Render
2. Clear browser cache and cookies
3. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
4. Check Render logs for any server errors

If issues persist, you can:
- Set `ALLOW_ALL_ORIGINS=true` as emergency fallback (only for testing)
- Or explicitly add `http://localhost:3000` to `CORS_ALLOWED_ORIGINS` environment variable
