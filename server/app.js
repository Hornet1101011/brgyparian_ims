require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const passport = require('passport');
const cookieSession = require('cookie-session');
const cors = require('cors');

const app = express();

// Load and validate important env vars
const SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY;
if (!SETTINGS_ENCRYPTION_KEY) {
  console.warn('WARNING: SETTINGS_ENCRYPTION_KEY is not set. Encrypted settings and SMTP passwords will not work.');
} else if (Buffer.from(SETTINGS_ENCRYPTION_KEY, 'utf8').length !== 32) {
  console.warn('WARNING: SETTINGS_ENCRYPTION_KEY should be 32 bytes. Current length:', Buffer.from(SETTINGS_ENCRYPTION_KEY, 'utf8').length);
}

// SMTP fallback env values (available for services that need immediate defaults)
app.locals.smtpDefaults = {
  host: process.env.SMTP_HOST || '',
  port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  fromName: process.env.SMTP_FROM_NAME || process.env.SMTP_FROM || '',
};

// Middleware
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieSession({ name: 'session', keys: ['secretKey'], maxAge: 24 * 60 * 60 * 1000 }));
app.use(passport.initialize());
app.use(passport.session());
// CORS configuration: allowlist via env var or localhost during development
// Set CORS_ALLOWED_ORIGINS as a comma-separated list of allowed origins.
// Example: CORS_ALLOWED_ORIGINS=https://example.com,https://sub.example.com
const rawAllowed = process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000';
const allowedOrigins = rawAllowed.split(',').map(s => s.trim()).filter(Boolean);

app.use((req, res, next) => {
  // If no Origin header (server-to-server or same-origin), continue
  const origin = req.headers.origin;
  if (!origin) return next();

  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    // Expose custom headers so the browser/axios can read them
    res.setHeader('Access-Control-Expose-Headers', 'Authorization, X-Filled-File-Id, X-Generated-Doc-Id, X-Processed-Doc-Id, X-Processed-GridFS-Id');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  }

  // Not allowed origin
  res.status(403).send('CORS origin denied');
});

// Serve static files from client and its subfolders
const path = require('path');
app.use(express.static(path.join(__dirname, '../client')));
app.use('/css', express.static(path.join(__dirname, '../css')));
app.use('/javascript', express.static(path.join(__dirname, '../javascript')));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/alphaversion', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection.on('connected', () => {
  console.log('MongoDB connected');
});
// Ensure processed_documents GridFS bucket exists (collections and indexes)
mongoose.connection.on('connected', async () => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      console.warn('MongoDB db not available to ensure processed_documents bucket');
      return;
    }
    const filesName = 'processed_documents.files';
    const chunksName = 'processed_documents.chunks';

    const collList = await db.listCollections({}).toArray();
    const collNames = collList.map(c => c.name);

    if (!collNames.includes(filesName)) {
      console.log('Creating collection', filesName);
      try { await db.createCollection(filesName); } catch (e) { console.warn('createCollection files failed', e && e.message); }
    }
    if (!collNames.includes(chunksName)) {
      console.log('Creating collection', chunksName);
      try { await db.createCollection(chunksName); } catch (e) { console.warn('createCollection chunks failed', e && e.message); }
    }

    // Ensure indexes on files collection and unique index on chunks (idempotent)
    try {
      const filesColl = db.collection(filesName);
      const chunksColl = db.collection(chunksName);

      async function ensureIndexExists(coll, key, opts) {
        try {
          const existing = await coll.indexes();
          const has = existing.some(ix => {
            // compare keys
            const ixKeys = ix.key || {};
            const wantKeys = key || {};
            const ixKeyNames = Object.keys(ixKeys).sort();
            const wantKeyNames = Object.keys(wantKeys).sort();
            if (ixKeyNames.length !== wantKeyNames.length) return false;
            for (let i = 0; i < ixKeyNames.length; i++) {
              const k = ixKeyNames[i];
              if (k !== wantKeyNames[i]) return false;
              if (ixKeys[k] !== wantKeys[k]) return false;
            }
            return true;
          });
          if (!has) {
            await coll.createIndex(key, opts || {});
            console.log('Created index on', coll.collectionName, JSON.stringify(key), opts || {});
          } else {
            // already exists
            // console.log('Index already exists on', coll.collectionName, JSON.stringify(key));
          }
        } catch (err) {
          // Ignore duplicate index errors and log others
          if (err && (err.code === 11000 || /index already exists/i.test(err.message))) {
            // harmless if the same index exists
          } else {
            console.warn(`Failed to ensure index ${JSON.stringify(key)} on ${coll.collectionName}:`, err && err.message);
          }
        }
      }

      await ensureIndexExists(filesColl, { filename: 1 });
      await ensureIndexExists(filesColl, { uploadDate: 1 });
      await ensureIndexExists(filesColl, { 'metadata.sourceFileId': 1 });

      await ensureIndexExists(chunksColl, { files_id: 1, n: 1 }, { unique: true });
    } catch (e) {
      console.warn('Failed to create/check indexes on processed_documents collections', e && e.message);
    }

    console.log('Ensured processed_documents GridFS bucket collections and indexes.');
  } catch (err) {
    console.error('Error ensuring processed_documents bucket', err && err.message);
  }

  // Initialize system settings if they don't exist
  try {
    const SystemSetting = require('./models/SystemSetting');
    const existingSettings = await SystemSetting.findOne();
    if (!existingSettings) {
      console.log('[Init] No system settings found - creating default settings...');
      const defaultSettings = {
        siteName: 'Barangay Information Management System',
        barangayName: 'Barangay Parian',
        barangayAddress: 'Barangay Parian, Calamba, Laguna',
        contactEmail: 'barangayparian@gmail.com',
        contactPhone: '09614215746',
        systemNotice: '',
        maintenanceMode: false,
        allowRegistrations: true,
        requireEmailVerification: true,
        maxDocumentRequestsPerUser: 5,
        documentProcessingDays: 3,
        allowMultipleAccountsPerIP: false,
        maxAccountsPerIP: 1,
      };
      const created = await SystemSetting.create(defaultSettings);
      console.log('[Init] ✅ System settings initialized successfully');
      console.log('[Init] Settings:', created);
    } else {
      console.log('[Init] ✅ System settings already exist');
      console.log('[Init] Current settings:', existingSettings);
    }
  } catch (err) {
    console.log('[Init] ❌ Failed to initialize system settings:', err && err.message);
  }

  // Initialize PublicView collection if it doesn't exist
  try {
    const PublicView = require('./models/PublicView');
    const SystemSetting = require('./models/SystemSetting');
    
    const existingPublicView = await PublicView.findOne({ isActive: true });
    if (!existingPublicView) {
      console.log('[Init] No PublicView cache found - creating from SystemSetting...');
      const systemSetting = await SystemSetting.findOne();
      if (systemSetting) {
        const publicViewData = {
          siteName: systemSetting.siteName || '',
          barangayName: systemSetting.barangayName || '',
          barangayAddress: systemSetting.barangayAddress || '',
          contactEmail: systemSetting.contactEmail || '',
          contactPhone: systemSetting.contactPhone || '',
          systemNotice: systemSetting.systemNotice || '',
          isActive: true,
          lastSyncedAt: new Date()
        };
        const created = await PublicView.create(publicViewData);
        console.log('[Init] ✅ PublicView cache initialized successfully');
        console.log('[Init] PublicView:', created);
      }
    } else {
      console.log('[Init] ✅ PublicView cache already exists');
      console.log('[Init] Current PublicView:', existingPublicView);
    }
  } catch (err) {
    console.log('[Init] ❌ Failed to initialize PublicView:', err && err.message);
  }
});

// Hardcoded fallback endpoint - returns static values if database is empty
// This ensures login page always shows something even if DB is not initialized
app.get('/api/settings/fallback', (req, res) => {
  res.json({
    siteName: 'Barangay Information Management System',
    barangayName: 'Barangay Parian',
    barangayAddress: 'Barangay Parian, Calamba, Laguna',
    contactEmail: 'barangayparian@gmail.com',
    contactPhone: '09614215746',
    systemNotice: ''
  });
});


// Template routes
app.use('/api/templates', require('./src/routes/templates.ts'));
app.use('/api/gridfs', require('./src/routes/gridfs.js'));

// Document routes
app.use('/api/documents', require('./src/routes/documents.js'));
// Generated documents (metadata + GridFS streaming)
try {
  app.use('/api/generated-documents', require('./src/routes/generatedDocuments'));
} catch (e) {
  console.error('Failed to mount /api/generated-documents route', e);
}
// Processed documents (metadata + GridFS streaming)
try {
  app.use('/api/processed-documents', require('./src/routes/processedDocuments'));
} catch (e) {
  console.error('Failed to mount /api/processed-documents route', e);
}

// Routes
app.get('/', (req, res) => {
  res.send('Alphaversion backend running');
});
app.use('/api/messages', require('./src/routes/messageRoutes').default);
app.use('/api/inquiries', require('./src/routes/inquiryRoutes').default);
app.use('/api/resident', require('./src/routes/residents').default);
// Analytics routes
app.use('/api/analytics', require('./src/routes/analyticsRoutes'));
function safeUseRoute(path, routeModule) {
  if (typeof routeModule === 'function' || (routeModule && typeof routeModule === 'object' && typeof routeModule.use === 'function')) {
    app.use(path, routeModule);
  } else {
    console.error(`Invalid router for ${path}`);
  }
}

// safeUseRoute('/api/resident', require('./dist/routes/residents.js').default); // Commented out to avoid double registration
safeUseRoute('/api/document-requests', require('./dist/routes/documentRequestRoutes.js').default);
safeUseRoute('/api/auth', require('./dist/routes/authRoutes.js').default);
safeUseRoute('/api/logs', require('./dist/routes/logs.js').default);
safeUseRoute('/api/admin', require('./dist/routes/adminRoutes.js').default);

// Public officials endpoint for unauthenticated pages (e.g., login preview)
try {
  const publicOfficials = require('./routes/publicOfficials');
  app.use('/api/officials', publicOfficials);
} catch (e) {
  console.error('Failed to mount /api/officials public route', e);
}

// Settings routes (require authentication first so req.user is populated for isAdmin)
try {
  const requireAuth = require('./middleware/requireAuth');
  const settingsRoutes = require('./routes/settingsRoutes');
  
  // Mount settings routes without auth middleware - let individual routes handle their own auth
  // This allows the public endpoint to be accessible while other routes can require auth
  app.use('/api/settings', settingsRoutes);
  
  // Also mount under admin namespace so client-side calls to /api/admin/settings resolve
  app.use('/api/admin/settings', requireAuth, settingsRoutes);
  
  // Mount officials admin routes
  try {
    const officialsRoutes = require('./routes/officials');
    app.use('/api/admin/officials', requireAuth, officialsRoutes);
  } catch (e) {
    console.error('Failed to mount /api/admin/officials routes', e);
  }
} catch (e) {
  console.error('Failed to mount /api/settings routes', e);
}

// PERMANENT public settings endpoint for login page and unauthenticated access
// This endpoint is always available and does not require authentication
// Returns only public-facing system settings (barangayName, barangayAddress, contactEmail, contactPhone, systemNotice, siteName)
try {
  const SystemSetting = require('./models/SystemSetting');
  app.get('/api/settings/public', async (req, res) => {
    try {
      console.log('[Public Settings] GET /api/settings/public - fetching from DB');
      let settings = await SystemSetting.findOne().lean();
      console.log('[Public Settings] Found settings:', settings ? 'Yes' : 'No');
      
      if (!settings) {
        console.log('[Public Settings] No settings in DB, returning defaults');
        // Return default shape if no settings exist
        settings = {
          siteName: 'Barangay Information System',
          barangayName: '',
          barangayAddress: '',
          contactEmail: '',
          contactPhone: '',
          systemNotice: ''
        };
      }
      
      // Return only public-facing fields (sanitize all sensitive data)
      const publicSettings = {
        siteName: settings.siteName || '',
        barangayName: settings.barangayName || '',
        barangayAddress: settings.barangayAddress || '',
        contactEmail: settings.contactEmail || '',
        contactPhone: settings.contactPhone || '',
        systemNotice: settings.systemNotice || ''
      };
      
      console.log('[Public Settings] Returning:', publicSettings);
      return res.json(publicSettings);
    } catch (err) {
      console.error('GET /api/settings/public error', err);
      return res.status(500).json({ message: 'Failed to load public settings' });
    }
  });
  console.log('Public settings endpoint enabled at GET /api/settings/public');
} catch (e) {
  console.error('Failed to mount public settings endpoint', e);
}

// GET /api/settings/public/barangay-info - Returns barangay information as carousel items
// Fetches from publicviews collection or falls back to SystemSetting
try {
  const SystemSetting = require('./models/SystemSetting');
  const PublicView = require('./models/PublicView');
  
  app.get('/api/settings/public/barangay-info', async (req, res) => {
    try {
      console.log('[Barangay Info] GET /api/settings/public/barangay-info called');
      
      // Try to fetch from PublicView collection first (cached data)
      let publicView = await PublicView.findOne({ isActive: true }).lean();
      
      // Fallback to SystemSetting if PublicView not found
      if (!publicView) {
        publicView = await SystemSetting.findOne().lean();
      }
      
      if (!publicView) {
        console.log('[Barangay Info] No barangay data found, returning empty array');
        return res.json([]);
      }
      
      // Format as carousel items
      const barangayInfoItems = [];
      
      if (publicView.siteName) {
        barangayInfoItems.push({
          _id: 'site-name',
          label: 'System Name',
          value: publicView.siteName,
          icon: 'home',
          type: 'barangay-info'
        });
      }
      
      if (publicView.barangayName) {
        barangayInfoItems.push({
          _id: 'barangay-name',
          label: 'Barangay Name',
          value: publicView.barangayName,
          icon: 'environment',
          type: 'barangay-info'
        });
      }
      
      if (publicView.barangayAddress) {
        barangayInfoItems.push({
          _id: 'barangay-address',
          label: 'Address',
          value: publicView.barangayAddress,
          icon: 'map',
          type: 'barangay-info'
        });
      }
      
      // If no info available, return array with placeholder
      if (barangayInfoItems.length === 0) {
        return res.json([{
          _id: 'placeholder',
          label: 'Barangay Information',
          value: 'No barangay information configured',
          icon: 'info',
          type: 'barangay-info',
          isPlaceholder: true
        }]);
      }
      
      console.log(`[Barangay Info] Returning ${barangayInfoItems.length} items`);
      return res.json(barangayInfoItems);
    } catch (err) {
      console.error('GET /api/settings/public/barangay-info error', err);
      return res.status(500).json({ message: 'Failed to load barangay info' });
    }
  });
  console.log('Public barangay-info endpoint enabled at GET /api/settings/public/barangay-info');
} catch (e) {
  console.error('Failed to mount public barangay-info endpoint', e);
}

// GET /api/settings/public/contact-info - Returns contact information as carousel items
// Fetches from publicviews collection or falls back to SystemSetting
try {
  const SystemSetting = require('./models/SystemSetting');
  const PublicView = require('./models/PublicView');
  
  app.get('/api/settings/public/contact-info', async (req, res) => {
    try {
      console.log('[Contact Info] GET /api/settings/public/contact-info called');
      
      // Try to fetch from PublicView collection first (cached data)
      let publicView = await PublicView.findOne({ isActive: true }).lean();
      
      // Fallback to SystemSetting if PublicView not found
      if (!publicView) {
        publicView = await SystemSetting.findOne().lean();
      }
      
      if (!publicView) {
        console.log('[Contact Info] No contact data found, returning empty array');
        return res.json([]);
      }
      
      // Validation helpers
      const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      const isValidPhone = (phone) => /^[\d\s\-\+\(\)]+$/.test(phone) && phone.replace(/\D/g, '').length >= 7;
      
      // Format as carousel items
      const contactInfoItems = [];
      
      if (publicView.contactEmail && isValidEmail(publicView.contactEmail)) {
        contactInfoItems.push({
          _id: 'contact-email',
          label: 'Email Address',
          value: publicView.contactEmail,
          icon: 'mail',
          type: 'contact-info',
          contactType: 'email',
          link: `mailto:${publicView.contactEmail}`
        });
      }
      
      if (publicView.contactPhone && isValidPhone(publicView.contactPhone)) {
        contactInfoItems.push({
          _id: 'contact-phone',
          label: 'Phone Number',
          value: publicView.contactPhone,
          icon: 'phone',
          type: 'contact-info',
          contactType: 'phone',
          link: `tel:${publicView.contactPhone}`
        });
      }
      
      // If no contact info available, return array with placeholder
      if (contactInfoItems.length === 0) {
        return res.json([{
          _id: 'placeholder',
          label: 'Contact Information',
          value: 'No contact information configured',
          icon: 'info',
          type: 'contact-info',
          isPlaceholder: true
        }]);
      }
      
      console.log(`[Contact Info] Returning ${contactInfoItems.length} items`);
      return res.json(contactInfoItems);
    } catch (err) {
      console.error('GET /api/settings/public/contact-info error', err);
      return res.status(500).json({ message: 'Failed to load contact info' });
    }
  });
  console.log('Public contact-info endpoint enabled at GET /api/settings/public/contact-info');
} catch (e) {
  console.error('Failed to mount public contact-info endpoint', e);
}

// Optional public settings endpoint for quick local debugging.
// Enable by setting DEBUG_PUBLIC_SETTINGS=true in the server environment.
if (process.env.DEBUG_PUBLIC_SETTINGS === 'true') {
  try {
    const SystemSetting = require('./src/models/SystemSetting');
    app.get('/api/settings/public-debug', async (req, res) => {
      try {
        let settings = await SystemSetting.findOne().lean();
        if (!settings) settings = new SystemSetting();
        // Sanitize SMTP password presence similar to settingsRoutes.sanitizeForClient
        if (settings && settings.smtp) {
          settings.smtp = { ...settings.smtp };
          settings.smtp.passwordSet = !!settings.smtp.encryptedPassword;
          delete settings.smtp.encryptedPassword;
        }
        return res.json(settings);
      } catch (err) {
        console.error('Public settings debug endpoint error', err);
        return res.status(500).json({ message: 'Failed to load settings' });
      }
    });
    console.log('DEBUG_PUBLIC_SETTINGS endpoint enabled at GET /api/settings/public-debug');
  } catch (e) {
    console.error('Failed to create public settings debug endpoint', e);
  }
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
