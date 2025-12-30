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

// Helper to check if origin is allowed (including localhost variants)
const isOriginAllowed = (origin) => {
  if (!origin) return false;
  if (allowedOrigins.includes('*')) return true;
  if (allowedOrigins.includes(origin)) return true;
  
  // Allow localhost and 127.0.0.1 on any port in development
  const isLocalhost = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
  const isDev = process.env.NODE_ENV === 'development';
  if (isLocalhost && isDev) return true;
  
  return false;
};

app.use((req, res, next) => {
  // If no Origin header (server-to-server or same-origin), continue
  const origin = req.headers.origin;
  if (!origin) return next();

  if (isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    // Expose custom headers so the browser/axios can read them
    res.setHeader('Access-Control-Expose-Headers', 'Authorization, X-Filled-File-Id, X-Generated-Doc-Id, X-Processed-Doc-Id, X-Processed-GridFS-Id, X-Transaction-Code');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  }

  // Not allowed origin
  res.status(403).send('CORS origin denied');
});

// Content Security Policy middleware: allow WebSocket connections
app.use((req, res, next) => {
  // Set a permissive CSP that allows WebSocket connections and same-origin requests
  res.setHeader('Content-Security-Policy', "default-src 'self' https: wss: ws:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; connect-src 'self' https: wss: ws: http://localhost:*");
  next();
});

// Serve static files from client build and its subfolders
const path = require('path');
const buildPath = path.join(__dirname, '../client/build');
const publicPath = path.join(__dirname, '../client/public');

// Try to serve from build first (production), then fall back to public (development)
app.use(express.static(buildPath));
app.use(express.static(publicPath));
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

// Removed: initialization moved to ensureTemplateConfigCollection() function called after server starts

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

// Fallback route: serve index.html for all non-API routes (React Router)
app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'), (err) => {
    if (err) {
      // Fall back to public if build doesn't exist
      res.sendFile(path.join(publicPath, 'index.html'), (err2) => {
        if (err2) {
          res.status(404).send('Not found');
        }
      });
    }
  });
});

const PORT = process.env.PORT || 5000;

// Dedicated function to ensure templateconfig collection exists
async function ensureTemplateConfigCollection() {
  try {
    // Wait for MongoDB connection to be ready
    // Check connection state up to 10 times (10 seconds max)
    let connectionReady = false;
    for (let i = 0; i < 10; i++) {
      if (mongoose.connection.readyState === 1) { // 1 = connected
        connectionReady = true;
        console.log('[Template Config] MongoDB connection ready');
        break;
      }
      console.log('[Template Config] Waiting for MongoDB connection... attempt', i + 1);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!connectionReady) {
      console.error('[Template Config] ERROR: MongoDB connection never reached ready state (readyState:', mongoose.connection.readyState + ')');
      return;
    }

    const db = mongoose.connection.db;
    if (!db) {
      console.error('[Template Config] ERROR: MongoDB db object not available even though connected');
      return;
    }

    console.log('[Template Config] Checking for templateconfig collection...');
    if (!collNames.includes('templateconfig')) {
      console.log('[Template Config] Creating templateconfig collection...');
      try {
        await db.createCollection('templateconfig');
        const configColl = db.collection('templateconfig');
        
        // Create indexes
        await configColl.createIndex({ templateId: 1 });
        await configColl.createIndex({ updatedAt: 1 });
        
        console.log('[Template Config] ✓✓✓ SUCCESS: templateconfig collection created with indexes ✓✓✓\n');
      } catch (err) {
        console.error('[Template Config] ERROR creating collection:', err.message);
      }
    } else {
      console.log('[Template Config] ✓ Collection already exists\n');
    }
  } catch (err) {
    console.error('[Template Config] ERROR:', err.message);
  }
}

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Ensure templateconfig collection exists after server starts
  await ensureTemplateConfigCollection();
});
