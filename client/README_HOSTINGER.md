Hostinger upload & build instructions

Goal: produce a frontend build that points to your Render backend and upload it to Hostinger.

1) Configure the API URL for production
- Edit `client/.env.production` and set `REACT_APP_API_URL` to your Render service URL + `/api`, for example:
  REACT_APP_API_URL=https://my-backend.onrender.com/api

2) Build locally (recommended)
- From `client/` run:
  npm ci
  npm run build
- The build artifacts will be in `client/build/` (Create React App) or `client/dist/` for other setups.

3) Upload to Hostinger
- Option A (Git integration): connect the frontend repo on GitHub to Hostinger Git deployment and set the build command to `npm ci && npm run build` and the publish directory to `build`.
- Option B (manual upload): upload the contents of `client/build/` to Hostinger's `public_html` (or the domain's root) using File Manager or FTP/SFTP.

4) Verify requests
- Open the site in browser, open DevTools → Network, and confirm API requests are going to the `REACT_APP_API_URL` you set (e.g. `https://my-backend.onrender.com/api/...`).

Notes & troubleshooting
- Do NOT include secrets (like `MONGODB_URI`) in frontend env files.
- If Hostinger does not allow build-time env vars, build locally with `REACT_APP_API_URL` set, then upload the built `build/` folder.
- If you need to change backend URL without rebuilding, consider adding a small `public/config.json` and reading it at runtime (I can add this if you want).
