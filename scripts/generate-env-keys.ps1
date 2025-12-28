# Generate environment variables for server setup

Write-Host "=== Alphaversion Server Setup Helper ===" -ForegroundColor Cyan
Write-Host ""

# Generate SETTINGS_ENCRYPTION_KEY (32-byte hex string)
Write-Host "Generating SETTINGS_ENCRYPTION_KEY..." -ForegroundColor Yellow
$encryptionKey = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
Write-Host "SETTINGS_ENCRYPTION_KEY=$encryptionKey" -ForegroundColor Green
Write-Host ""

# Generate SESSION_SECRET (random string)
Write-Host "Generating SESSION_SECRET..." -ForegroundColor Yellow
$sessionSecret = [guid]::NewGuid().ToString() -replace '-'
Write-Host "SESSION_SECRET=$sessionSecret" -ForegroundColor Green
Write-Host ""

# Generate JWT_SECRET (random string)
Write-Host "Generating JWT_SECRET..." -ForegroundColor Yellow
$jwtSecret = [guid]::NewGuid().ToString() -replace '-'
Write-Host "JWT_SECRET=$jwtSecret" -ForegroundColor Green
Write-Host ""

Write-Host "=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. Copy the generated keys above" -ForegroundColor White
Write-Host "2. Create or update server/.env with these values" -ForegroundColor White
Write-Host "3. Add other required variables (MONGO_URI, CORS_ALLOWED_ORIGINS, etc)" -ForegroundColor White
Write-Host "4. Run: cd server && npm run build && node index.js" -ForegroundColor White
Write-Host ""

Write-Host "Sample server/.env template:" -ForegroundColor Cyan
@"
MONGO_URI=mongodb://localhost:27017/alphaversion
NODE_ENV=development
SESSION_SECRET=$sessionSecret
JWT_SECRET=$jwtSecret
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
SETTINGS_ENCRYPTION_KEY=$encryptionKey
"@ | Write-Host -ForegroundColor Gray
