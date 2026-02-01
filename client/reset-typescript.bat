@echo off
REM TypeScript Reset Script for Windows
REM Run this if you're still seeing TypeScript errors after npm install

echo Starting TypeScript reset...

REM Clear npm cache
echo 1. Clearing npm cache...
call npm cache clean --force

REM Clear TypeScript cache (Windows paths)
echo 2. Clearing TypeScript cache...
if exist "node_modules\.typescript-eslint-cache" (
    rmdir /s /q "node_modules\.typescript-eslint-cache" 2>nul
)
if exist ".typescript-eslint-cache" (
    rmdir /s /q ".typescript-eslint-cache" 2>nul
)
if exist ".eslintcache" (
    del ".eslintcache" 2>nul
)

REM Delete node_modules and package-lock
echo 3. Cleaning up node_modules...
if exist "node_modules" (
    rmdir /s /q "node_modules"
)
if exist "package-lock.json" (
    del "package-lock.json"
)

REM Fresh install
echo 4. Installing dependencies...
call npm install

REM Force a clean rebuild
echo 5. Clearing build cache...
if exist "build" (
    rmdir /s /q "build" 2>nul
)

echo.
echo Done! Try running 'npm start' now.
pause
