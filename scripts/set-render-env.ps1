<##
Usage:
- Set these environment variables in your shell before running the script:
  - $env:RENDER_API_KEY  (your Render API key)
  - $env:RENDER_SERVICE_ID  (the Render service id for your web service)
  - $env:MONGODB_URI  (the full Atlas connection string)

Example (PowerShell):
  $env:RENDER_API_KEY = 'rt_...'
  $env:RENDER_SERVICE_ID = 'srv-abcde12345'
  $env:MONGODB_URI = 'mongodb+srv://user:password@cluster0...'
  .\scripts\set-render-env.ps1
##>

param()

if (-not $env:RENDER_API_KEY) {
  Write-Host "RENDER_API_KEY not set. Please set environment variable RENDER_API_KEY and retry." -ForegroundColor Red
  exit 2
}
if (-not $env:RENDER_SERVICE_ID) {
  Write-Host "RENDER_SERVICE_ID not set. Please set environment variable RENDER_SERVICE_ID and retry." -ForegroundColor Red
  exit 2
}
if (-not $env:MONGODB_URI) {
  Write-Host "MONGODB_URI not set. Please set environment variable MONGODB_URI and retry." -ForegroundColor Red
  exit 2
}

$apiKey = $env:RENDER_API_KEY
$serviceId = $env:RENDER_SERVICE_ID
$mongo = $env:MONGODB_URI

Write-Host "Setting MONGODB_URI on Render service $serviceId..."

$body = @{
  key = 'MONGODB_URI'
  value = $mongo
  sync = $false
} | ConvertTo-Json

$headers = @{ Authorization = "Bearer $apiKey"; 'Content-Type' = 'application/json' }

try {
  $resp = Invoke-RestMethod -Method Post -Uri "https://api.render.com/v1/services/$serviceId/env-vars" -Headers $headers -Body $body
  Write-Host "Render API response:" -ForegroundColor Green
  $resp | ConvertTo-Json -Depth 4
  Write-Host "Done. Render will trigger a deploy when env vars change. Check the Render dashboard logs." -ForegroundColor Cyan
} catch {
  Write-Host "Error calling Render API:" -ForegroundColor Red
  Write-Host $_.Exception.Message
  exit 1
}
