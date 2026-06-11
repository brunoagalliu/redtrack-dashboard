require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');

const { init: initDb } = require('./db');
const authRouter = require('./routes/auth');
const listsRouter = require('./routes/lists');
const campaignsRouter = require('./routes/campaigns');
const offersRouter = require('./routes/offers');
const landingsRouter = require('./routes/landings');
const domainsRouter = require('./routes/domains');
const sourcesRouter = require('./routes/sources');
const networksRouter = require('./routes/networks');
const filterOptionsRouter = require('./routes/filter-options');
const reportsRouter = require('./routes/reports');
const { cleanupOldStats, runSync } = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const API_KEY    = process.env.API_KEY;

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173',
}));
app.use(express.json());

// Public — login endpoint
app.use('/api/auth', authRouter);

// Auth middleware — accepts JWT (dashboard) or API key (external tools)
app.use('/api', (req, res, next) => {
  // API key check
  const apiKey = req.headers['x-api-key'];
  if (API_KEY && apiKey === API_KEY) return next();

  // JWT check
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Unauthorized.' });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
});

app.use('/api/lists', listsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/offers', offersRouter);
app.use('/api/landings', landingsRouter);
app.use('/api/domains', domainsRouter);
app.use('/api/sources', sourcesRouter);
app.use('/api/networks', networksRouter);
app.use('/api/filter-options', filterOptionsRouter);
app.use('/api/reports', reportsRouter);

// Serve React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

function scheduleDailyCleanup() {
  cleanupOldStats().catch((err) => console.error('Startup cleanup failed:', err.message));
  setInterval(() => {
    cleanupOldStats().catch((err) => console.error('Scheduled cleanup failed:', err.message));
  }, 24 * 60 * 60 * 1000);
}

const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

function scheduleAutoSync() {
  function triggerSync() {
    const today = new Date().toISOString().slice(0, 10);
    const earliest = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    console.log('[auto-sync] Starting scheduled sync…');
    runSync(earliest, today).catch((err) => console.error('[auto-sync] Failed:', err.message));
  }

  // Delay first auto-sync by 2 min so startup tasks settle before kicking off a long job
  setTimeout(() => {
    triggerSync();
    setInterval(triggerSync, SYNC_INTERVAL_MS);
  }, 2 * 60 * 1000);
}

initDb()
  .then(() => {
    scheduleDailyCleanup();
    scheduleAutoSync();
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('DB init failed:', err.message);
    process.exit(1);
  });
