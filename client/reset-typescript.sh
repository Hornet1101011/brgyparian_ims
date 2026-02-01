#!/bin/bash
# Quick TypeScript Reset Script
# Run this if you're still seeing TypeScript errors after npm install

echo "Starting TypeScript reset..."

# Clear npm cache
echo "1. Clearing npm cache..."
npm cache clean --force

# Clear TypeScript cache
echo "2. Clearing TypeScript cache..."
rm -rf node_modules/.typescript-eslint-cache 2>/dev/null
rm -rf .typescript-eslint-cache 2>/dev/null
rm -rf .eslintcache 2>/dev/null

# Delete and reinstall node_modules (more thorough than npm ci)
echo "3. Cleaning up node_modules..."
rm -rf node_modules
rm -rf package-lock.json

# Fresh install
echo "4. Installing dependencies..."
npm install

# Force a recompile
echo "5. Clearing build cache..."
rm -rf build

echo "✓ Done! Try running 'npm start' now."
