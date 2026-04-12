#!/usr/bin/env node
/**
 * seed-sendgrid-config.js
 *
 * Usage (preferred - set env vars):
 *   MONGO_URI="mongodb+srv://..." SENDGRID_API_KEY="SG.xxxxx" node server/scripts/seed-sendgrid-config.js
 *
 * Windows PowerShell example:
 *   $env:MONGO_URI = "mongodb+srv://..."; $env:SENDGRID_API_KEY = "SG.xxxxx"; node server/scripts/seed-sendgrid-config.js
 *
 * This script saves a SendGrid configuration document into the database using the
 * existing SendGridConfig model in the repo. It does NOT log or store the API key
 * anywhere in the repo.
 */

const mongoose = require('mongoose');
const path = require('path');

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || process.env.BIMS_EMAIL || 'noreply@barangay.system';
  const fromName = process.env.SENDGRID_FROM_NAME || 'Barangay System';

  if (!mongoUri) {
    console.error('Missing MONGO_URI environment variable. Set MONGO_URI to your MongoDB connection string.');
    process.exit(1);
  }
  if (!apiKey) {
    console.error('Missing SENDGRID_API_KEY environment variable. Provide your SendGrid API key as SENDGRID_API_KEY.');
    process.exit(2);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

    // Require the model using repository-relative path
    const SendGridConfig = require(path.resolve(__dirname, '..', 'models', 'SendGridConfig.js'));

    console.log('Saving SendGrid configuration (enabled: true, fromEmail:', fromEmail, ')');

    const saved = await SendGridConfig.saveConfig({
      enabled: true,
      apiKey: apiKey,
      fromEmail: fromEmail,
      fromName: fromName
    });

    console.log('SendGrid configuration saved successfully. Document id:', saved && saved._id);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Failed to save SendGrid configuration:', err && (err.message || err));
    try { await mongoose.disconnect(); } catch (e) {}
    process.exit(3);
  }
}

main();
