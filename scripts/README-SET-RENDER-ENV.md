# How to set `MONGODB_URI` on Render (helper script)

This repository includes a small PowerShell helper script `scripts/set-render-env.ps1` that calls the Render API to add an environment variable to a Render service. The script does not contain secrets — you must run it locally and provide the secret values as environment variables.

Steps to use:

1. Rotate your Atlas password if it was previously exposed.
2. Open a PowerShell terminal locally.
3. Set the required environment variables (example):

```powershell
$env:RENDER_API_KEY = 'rt_... your render api key ...'
$env:RENDER_SERVICE_ID = 'srv-xxxxxx'   # find this in your Render service Settings -> General
$env:MONGODB_URI = 'mongodb+srv://user:password@cluster0.fu4calt.mongodb.net/<DB>?retryWrites=true&w=majority'
.\scripts\set-render-env.ps1
```

4. The script will call the Render API and add `MONGODB_URI` to your service. Render will trigger a deploy when an environment variable is added/changed.

Notes:
- Do NOT commit API keys or DB passwords to the repository.
- If you prefer the Render Dashboard UI, go to your service → Environment → Add Environment Variable, paste the key `MONGODB_URI` and the value, and save.
- If Render responds with an error, check that the `RENDER_API_KEY` and `RENDER_SERVICE_ID` are correct and that your API key has permissions to update the service.
