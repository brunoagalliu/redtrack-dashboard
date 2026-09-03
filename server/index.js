require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');

const { init: initDb } = require('./db');
const { laDate } = require('./utils');
const { scheduleTelegramReport, sendDailyReport } = require('./telegram-bot');
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
const { cleanupOldStats, runSync, generateAIReport, generateListReport, aiStatus, ALL_PERIODS } = require('./routes/reports');
const costUpdaterRouter = require('./routes/cost-updater');
const clicksExportRouter  = require('./routes/clicks-export');
const domainFinderRouter  = require('./routes/domain-finder');

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
app.use('/api/cost-updater', costUpdaterRouter);
app.use('/api/clicks-export',  clicksExportRouter);
app.use('/api/domain-finder', domainFinderRouter);

// Manual trigger — lets you test the bot from the dashboard without waiting for 3pm
app.post('/api/telegram/send-report', async (_req, res) => {
  try { await sendDailyReport(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

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

async function runAutoAIGeneration() {
  if (aiStatus.campaign.running || aiStatus.list.running) {
    console.log('[auto-ai] Already running — skipping Monday generation.');
    return;
  }
  console.log('[auto-ai] Monday — generating all campaign AI reports…');
  aiStatus.campaign.running          = true;
  aiStatus.campaign.error            = null;
  aiStatus.campaign.startedAt        = new Date();
  aiStatus.campaign.currentPeriod    = null;
  aiStatus.campaign.completedPeriods = [];
  try {
    for (const days of ALL_PERIODS) {
      aiStatus.campaign.currentPeriod = days;
      await generateAIReport(days);
      aiStatus.campaign.completedPeriods.push(days);
      console.log(`[auto-ai] ${days}d done (${aiStatus.campaign.completedPeriods.length}/${ALL_PERIODS.length})`);
    }
  } catch (err) {
    aiStatus.campaign.error = err.message;
    console.error('[auto-ai] Campaign error:', err.message);
  } finally {
    aiStatus.campaign.running       = false;
    aiStatus.campaign.currentPeriod = null;
  }

  console.log('[auto-ai] Generating list report…');
  aiStatus.list.running   = true;
  aiStatus.list.error     = null;
  aiStatus.list.startedAt = new Date();
  try {
    await generateListReport();
    console.log('[auto-ai] List report done.');
  } catch (err) {
    aiStatus.list.error = err.message;
    console.error('[auto-ai] List error:', err.message);
  } finally {
    aiStatus.list.running = false;
  }
}

function scheduleAutoSync() {
  // Compute ms until 3:00 AM Los Angeles time, giving postbacks ~3 hours to settle.
  function msUntilNext3amLA() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
    }).formatToParts(now);
    const h = parseInt(parts.find(p => p.type === 'hour').value);
    const m = parseInt(parts.find(p => p.type === 'minute').value);
    const s = parseInt(parts.find(p => p.type === 'second').value);
    let ms = ((3 - h) * 3600 - m * 60 - s) * 1000;
    if (ms <= 0) ms += 24 * 60 * 60 * 1000;
    return ms;
  }

  function schedule() {
    const delay = msUntilNext3amLA();
    console.log(`[auto-sync] Next sync in ${Math.round(delay / 60000)} min (3:00 AM LA)`);
    setTimeout(() => {
      const yesterday = laDate(-1);
      const isMonday  = new Date().getDay() === 1;
      console.log('[auto-sync] Starting scheduled sync…');
      runSync(yesterday, yesterday, null, true)
        .then(() => { if (isMonday) runAutoAIGeneration().catch((e) => console.error('[auto-ai] Error:', e.message)); })
        .catch((err) => console.error('[auto-sync] Failed:', err.message))
        .finally(() => schedule());
    }, delay);
  }

  schedule();
}

initDb()
  .then(() => {
    scheduleDailyCleanup();
    scheduleAutoSync();
    scheduleTelegramReport();
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('DB init failed:', err.message);
    process.exit(1);
  });
