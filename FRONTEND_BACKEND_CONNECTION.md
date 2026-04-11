# Frontend to Backend Connection Guide

## Current Setup

Your frontend and backend are already configured to work together! Here's how:

### Configuration Architecture

The frontend uses a **runtime configuration system** (no rebuild needed):

1. **Runtime Config Loading** (`src/runtimeConfig.ts`)
   - App loads `/config.json` on startup
   - This happens BEFORE the app renders
   - Allows changing API endpoints without rebuilding

2. **Config File Location** 
   - **Development:** `client/public/config.json`
   - **Production (Hostinger):** Extract to `public_html/config.json`

3. **Current Configuration**
   ```json
   {
     "API_BASE": "https://alphaversion.onrender.com/api",
     "SOCKET_URL": "https://alphaversion.onrender.com",
     "ENABLE_PUBLIC_VIEWS": true
   }
   ```

### How It Works

1. **Startup Sequence** (`src/index.tsx`)
   - Loads `config.json` into `globalThis.__APP_CONFIG__`
   - All API services read from this global config
   - Main App component renders after config is ready

2. **API Service** (`src/services/api.ts`)
   - Creates axios instance with dynamic `baseURL`
   - Reads from: `__APP_CONFIG__.API_BASE` → `REACT_APP_API_URL` → defaults to `/api`
   - Automatically appends `/api` to backend URL

3. **WebSocket Service** (`src/services/notificationSocket.ts`)
   - Uses `__APP_CONFIG__.SOCKET_URL` for real-time notifications
   - Fallback priority: `SOCKET_URL` → `API_BASE` → environment variable

### Backend CORS Configuration

Your backend (`server/app.js`) is properly configured with:

- **CORS Allowed Origins:** Set via `CORS_ALLOWED_ORIGINS` environment variable
- **Expected Format:** Comma-separated domain list
  ```
  CORS_ALLOWED_ORIGINS=https://your-hostinger-domain.com,https://www.your-hostinger-domain.com
  ```
- **Development:** Defaults to `http://localhost:3000` when env var not set
- **Production:** Must be explicitly set on Render deployment

### Credentials Support

- Cookies and Authorization headers are properly configured
- `Access-Control-Allow-Credentials: true` is set
- Credentials automatically sent with all requests

---

## Deployment Checklist

### 1. Frontend Upload to Hostinger

✅ **Already Done:**
- Production build created in `client/build/`
- `build.zip` ready for upload

**Steps:**
1. Extract `build.zip` locally
2. Upload contents (not the folder, just contents) to `public_html/`
3. You should see: `index.html`, `static/`, `config.json` in `public_html/`

### 2. Backend Configuration on Render

**Steps:**
1. Go to your Render deployment for the backend
2. Navigate to **Settings** → **Environment**
3. Add/Update this variable:
   ```
   CORS_ALLOWED_ORIGINS=https://your-hostinger-domain.com,https://www.your-hostinger-domain.com
   ```
4. Save and redeploy

### 3. Verify Connection

Once both are deployed:

1. Open browser DevTools (F12)
2. Go to **Console** tab
3. Type: `globalThis.__APP_CONFIG__`
4. Should show:
   ```javascript
   {
     API_BASE: "https://alphaversion.onrender.com/api",
     SOCKET_URL: "https://alphaversion.onrender.com",
     ENABLE_PUBLIC_VIEWS: true
   }
   ```
5. Try logging in—check **Network** tab to confirm API calls go to Render

---

## Troubleshooting

### Issue: CORS Error in Browser Console

**Symptom:** `Access to XMLHttpRequest blocked by CORS policy`

**Solution:**
1. Check Render environment variable: `CORS_ALLOWED_ORIGINS` includes your Hostinger domain
2. Ensure domain matches exactly (http vs https, www prefix, etc.)
3. Backend must be redeployed after updating env vars

### Issue: API Calls to Wrong Endpoint

**Symptom:** Network tab shows requests to `/api` instead of `https://alphaversion.onrender.com/api`

**Solution:**
1. Verify `config.json` on Hostinger has correct `API_BASE`
2. Clear browser cache (Ctrl+Shift+Delete)
3. Check DevTools Console: `globalThis.__APP_CONFIG__.API_BASE` should show Render URL

### Issue: WebSocket Connection Failed

**Symptom:** Real-time notifications not working, console shows WebSocket errors

**Solution:**
1. Verify `SOCKET_URL` in `config.json` is correct
2. Check backend has WebSocket support enabled
3. Ensure firewall/proxy doesn't block WebSocket connections

### Issue: Cookies Not Persisting (Sessions Lost)

**Symptom:** Logged out after page refresh

**Solution:**
1. Verify backend CORS includes `Access-Control-Allow-Credentials: true` (already done)
2. Check browser allows third-party cookies (if on different domain)
3. Inspect cookies in DevTools to confirm `session` cookie is present

---

## Changing API Endpoints (No Rebuild Needed)

### To switch backends without rebuilding:

1. **On Hostinger:** Edit `public_html/config.json`
   ```json
   {
     "API_BASE": "https://new-backend-url.com/api",
     "SOCKET_URL": "https://new-backend-url.com",
     "ENABLE_PUBLIC_VIEWS": true
   }
   ```
2. Save file
3. Refresh browser—new endpoint takes effect immediately!

### To test locally before deploying:

1. Edit `client/public/config.json` locally
2. Run `npm start` in client folder
3. App uses new config automatically

---

## File Reference

| File | Purpose |
|------|---------|
| `client/public/config.json` | Runtime config (loaded by app) |
| `client/src/runtimeConfig.ts` | Config loader logic |
| `client/src/index.tsx` | Loads config before rendering |
| `client/src/services/api.ts` | API client using config |
| `client/src/services/notificationSocket.ts` | WebSocket using config |
| `server/app.js` | CORS middleware & backend config |

---

## Environment Variables Reference

### Render Backend (server/app.js)

```
CORS_ALLOWED_ORIGINS=https://your-hostinger-domain.com,https://www.your-hostinger-domain.com
MONGO_URI=mongodb+srv://...
SETTINGS_ENCRYPTION_KEY=<32-byte-key>
NODE_ENV=production
```

### Frontend (client/public/config.json)

```json
{
  "API_BASE": "https://alphaversion.onrender.com/api",
  "SOCKET_URL": "https://alphaversion.onrender.com",
  "ENABLE_PUBLIC_VIEWS": true
}
```

---

## Summary

Your app uses a sophisticated configuration system:
- ✅ Frontend config is dynamic (no rebuild needed)
- ✅ Backend CORS is properly configured
- ✅ WebSocket support enabled
- ✅ Credentials properly handled
- ✅ Easy to switch between development/production

Just upload the `build.zip` to Hostinger and update the Render environment variable for `CORS_ALLOWED_ORIGINS` with your Hostinger domain!
