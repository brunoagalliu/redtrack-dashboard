const express = require('express');
const redtrack = require('../redtrack');
const { pool } = require('../db');

const router = express.Router();

const BUYER_PATTERNS = { TK: /^TK[\s_\-]/i, MA: /^MA[\s_\-]/i, DS: /^DS[\s_\-]/i };
const CALL_INTERVAL_MS = 3200; // 20 calls/min limit → ~3s between calls
const MAX_HISTORY_DAYS = 90;

// ── Sync state (in-memory; reset on server restart) ─────────────────────────
const sync = {
  running: false,
  status: 'idle',       // idle | running | complete | error
  processed: 0,
  total: 0,
  startedAt: null,
  completedAt: null,
  lastSyncedAt: null,
  error: null,
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function defaultDateRange() {
  const to = new Date();
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return { date_from: from.toISOString().slice(0, 10), date_to: to.toISOString().slice(0, 10) };
}

// ── Background sync ──────────────────────────────────────────────────────────
async function cleanupOldStats() {
  const cutoff = new Date(Date.now() - MAX_HISTORY_DAYS * 86400000).toISOString().slice(0, 10);
  const { rowCount } = await pool.query(
    `DELETE FROM rt_campaign_stats WHERE stat_date < $1`,
    [cutoff]
  );
  // Remove campaigns with no remaining stats
  await pool.query(
    `DELETE FROM rt_campaigns WHERE id NOT IN (SELECT DISTINCT campaign_id FROM rt_campaign_stats)`
  );
  console.log(`[cleanup] Removed stats before ${cutoff} (${rowCount} rows)`);
  return { deleted: rowCount, cutoff };
}

async function persistSyncStatus() {
  await pool.query(
    `INSERT INTO rt_sync_status (id, status, processed, total, started_at, completed_at, error)
     VALUES (1, $1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       status=$1, processed=$2, total=$3, started_at=$4, completed_at=$5, error=$6`,
    [sync.status, sync.processed, sync.total, sync.startedAt, sync.completedAt, sync.error || null]
  );
}

async function runSync(dateFrom, dateTo) {
  if (sync.running) return;
  sync.running  = true;
  sync.status   = 'running';
  sync.processed = 0;
  sync.total    = 0;
  sync.startedAt = new Date();
  sync.completedAt = null;
  sync.error    = null;
  await persistSyncStatus();

  try {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // Clamp dateFrom to 90-day window
    const earliest = new Date(Date.now() - MAX_HISTORY_DAYS * 86400000).toISOString().slice(0, 10);
    if (dateFrom < earliest) dateFrom = earliest;

    // 1. Fetch all campaigns from RedTrack
    const { data } = await redtrack.get('/campaigns/v2', { params: { per: 10000 } });
    const campaigns = data.items || [];

    // 2. Filter to buyer campaigns created in last 90 days (active set)
    const cutoff = new Date(new Date(dateFrom).getTime() - 90 * 86400000).toISOString().slice(0, 10);
    const buyerCampaigns = [];
    for (const c of campaigns) {
      const title = c.title.trim();
      const createdAt = (c.created_at || '').slice(0, 10);
      if (createdAt < cutoff) continue;
      for (const [buyer, pattern] of Object.entries(BUYER_PATTERNS)) {
        if (pattern.test(title)) {
          buyerCampaigns.push({ id: c.id, title, buyer, created_at: createdAt });
          break;
        }
      }
    }

    // 3. Upsert campaign metadata
    for (const c of buyerCampaigns) {
      await pool.query(
        `INSERT INTO rt_campaigns (id, title, buyer, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET title=$2, buyer=$3, synced_at=NOW()`,
        [c.id, c.title, c.buyer, c.created_at || null]
      );
    }

    const ids = buyerCampaigns.map((c) => c.id);

    // 4. Historical pass (dateFrom → yesterday): skip campaigns already in DB — past data never changes
    const historicalTo = dateTo < today ? dateTo : yesterday;
    let toSyncHistorical = [];
    if (dateFrom <= historicalTo) {
      const { rows: alreadySynced } = await pool.query(
        `SELECT DISTINCT campaign_id FROM rt_campaign_stats
         WHERE stat_date BETWEEN $1 AND $2`,
        [dateFrom, historicalTo]
      );
      const syncedIds = new Set(alreadySynced.map((r) => r.campaign_id));
      toSyncHistorical = buyerCampaigns.filter((c) => !syncedIds.has(c.id));
    }

    // 5. Today's pass: always refresh all campaigns (live data)
    const todayInRange = dateTo >= today;
    const toSyncToday = todayInRange ? buyerCampaigns : [];

    sync.total = toSyncHistorical.length + toSyncToday.length;

    let lastCall = 0;

    async function fetchAndStore(c, from, to) {
      const wait = Math.max(0, CALL_INTERVAL_MS - (Date.now() - lastCall));
      if (wait > 0) await sleep(wait);
      lastCall = Date.now();
      try {
        const { data: report } = await redtrack.get('/report', {
          params: { date_from: from, date_to: to, campaign_id: c.id, per: 1000 },
        });
        const rows = Array.isArray(report) ? report : (report?.items || []);
        for (const row of rows) {
          if (!row.date || (!row.clicks && !row.conversions && !row.revenue)) continue;
          await pool.query(
            `INSERT INTO rt_campaign_stats
               (campaign_id, stat_date, clicks, conversions, cost, revenue, profit)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (campaign_id, stat_date) DO UPDATE SET
               clicks=$3, conversions=$4, cost=$5, revenue=$6, profit=$7`,
            [c.id, row.date, row.clicks||0, row.conversions||0, row.cost||0, row.revenue||0, row.profit||0]
          );
        }
      } catch { /* silently skip individual campaign failures */ }
    }

    // Historical sync
    for (let i = 0; i < toSyncHistorical.length; i++) {
      await fetchAndStore(toSyncHistorical[i], dateFrom, historicalTo);
      sync.processed = i + 1;
      if (sync.processed % 50 === 0) await persistSyncStatus();
    }

    // Today sync
    for (let i = 0; i < toSyncToday.length; i++) {
      await fetchAndStore(toSyncToday[i], today, today);
      sync.processed = toSyncHistorical.length + i + 1;
      if (sync.processed % 50 === 0) await persistSyncStatus();
    }

    sync.status = 'complete';
    sync.completedAt = new Date();
    sync.lastSyncedAt = new Date();
    await persistSyncStatus();
  } catch (err) {
    sync.status = 'error';
    sync.error  = err.message;
    await persistSyncStatus().catch(() => {});
  } finally {
    sync.running = false;
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

// Trigger sync
router.post('/sync', (req, res) => {
  const defaults = defaultDateRange();
  const dateFrom = req.body?.date_from || defaults.date_from;
  const dateTo   = req.body?.date_to   || defaults.date_to;

  if (sync.running) return res.json({ status: 'already_running', ...sync });

  // Fire-and-forget
  runSync(dateFrom, dateTo).catch((err) => console.error('Sync error:', err.message));

  res.status(202).json({ status: 'started', dateFrom, dateTo });
});

// Sync status — live from memory, falls back to DB if server restarted
router.get('/sync/status', async (_req, res) => {
  if (sync.status !== 'idle') return res.json(sync);
  try {
    const { rows } = await pool.query(`SELECT * FROM rt_sync_status WHERE id = 1`);
    if (rows.length) return res.json({ ...rows[0], running: false });
  } catch { /* ignore */ }
  res.json(sync);
});

// Manual cleanup trigger (also called by scheduled job in index.js)
router.post('/cleanup', async (_req, res) => {
  try {
    const result = await cleanupOldStats();
    res.json(result);
  } catch (err) {
    console.error('Cleanup error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// Media buyer report — reads from DB
router.get('/media-buyers', async (req, res) => {
  try {
    const defaults = defaultDateRange();
    const dateFrom = req.query.date_from || defaults.date_from;
    const dateTo   = req.query.date_to   || defaults.date_to;

    const { rows } = await pool.query(
      `SELECT
         c.buyer,
         c.id,
         c.title,
         COALESCE(SUM(s.clicks),0)::int       AS clicks,
         COALESCE(SUM(s.conversions),0)::int  AS conversions,
         COALESCE(SUM(s.cost),0)              AS cost,
         COALESCE(SUM(s.revenue),0)           AS revenue,
         COALESCE(SUM(s.profit),0)            AS profit
       FROM rt_campaigns c
       JOIN rt_campaign_stats s ON s.campaign_id = c.id
       WHERE c.buyer IS NOT NULL
         AND s.stat_date BETWEEN $1 AND $2
       GROUP BY c.buyer, c.id, c.title
       ORDER BY c.buyer, clicks DESC`,
      [dateFrom, dateTo]
    );

    // Group by buyer
    const buyers = {};
    for (const r of rows) {
      if (!buyers[r.buyer]) buyers[r.buyer] = { campaigns: [], totals: { clicks:0, conversions:0, cost:0, revenue:0, profit:0 } };
      const stats = {
        id: r.id, title: r.title,
        clicks: Number(r.clicks), conversions: Number(r.conversions),
        cost: Number(r.cost), revenue: Number(r.revenue), profit: Number(r.profit),
      };
      buyers[r.buyer].campaigns.push(stats);
      buyers[r.buyer].totals.clicks      += stats.clicks;
      buyers[r.buyer].totals.conversions += stats.conversions;
      buyers[r.buyer].totals.cost        += stats.cost;
      buyers[r.buyer].totals.revenue     += stats.revenue;
      buyers[r.buyer].totals.profit      += stats.profit;
    }

    res.json({
      date_from: dateFrom,
      date_to:   dateTo,
      synced_at: sync.lastSyncedAt,
      buyers,
    });
  } catch (err) {
    console.error('Report query error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.cleanupOldStats = cleanupOldStats;
