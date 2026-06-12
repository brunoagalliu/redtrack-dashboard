const express = require('express');
const redtrack = require('../redtrack');
const { pool } = require('../db');
const Anthropic = require('@anthropic-ai/sdk');

const router = express.Router();

const BUYER_PATTERNS = { TK: /^TK[\s_\-]/i, MA: /^MA[\s_\-]/i, DS: /^DS[\s_\-]/i };
const CALL_INTERVAL_MS = 3200; // 20 calls/min limit → ~3s between calls
const MAX_HISTORY_DAYS = 90;

// ── Sync state (in-memory; reset on server restart) ─────────────────────────
const sync = {
  running: false,
  status: 'idle',       // idle | running | complete | error
  phase: 'idle',        // idle | campaigns | offers
  processed: 0,
  total: 0,
  startedAt: null,
  completedAt: null,
  lastSyncedAt: null,
  error: null,
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Shared rate-limit clock — both campaign sync and offer sync use the same throttle
// so the pacing is preserved when they run back-to-back in one sync session.
let lastApiCall = 0;
async function throttleRedtrack() {
  const wait = Math.max(0, CALL_INTERVAL_MS - (Date.now() - lastApiCall));
  if (wait > 0) await sleep(wait);
  lastApiCall = Date.now();
}

// UPM is the legacy RedTrack channel name for USMS — keep as a permanent alias
const ROUTE_ALIASES = new Map([['UPM', 'USMS']]);

const CARRIER_MAP = new Map([
  ['VZ', 'Verizon'],
  ['ATT', 'AT&T'],
  ['TMOB', 'T-Mobile'],
]);

// Tokenize a title using any combination of spaces, underscores, or hyphens as delimiters
function tokenize(title) {
  return title.toUpperCase().split(/[\s_\-]+/).filter(Boolean);
}

// Parse campaign title extracting buyer, vertical, route, carrier, and data partner.
// Delimiters can be spaces, underscores, or hyphens — we scan tokens for known values.
// knownRoutes   is a Map<UPPERCASE_TOKEN, canonicalName> built from list_items at sync time.
// knownPartners is a Map<UPPERCASE_TOKEN, alias>        built from partners table at sync time.
function parseCampaignTitle(rawTitle, knownVerticals, knownRoutes, knownPartners) {
  const title  = rawTitle.trim();
  const tokens = tokenize(title);

  // Buyer is the first token
  const buyer = tokens[0] || null;

  // Scan all tokens for known values
  let vertical    = null;
  let route       = null;
  let carrier     = null;
  let dataPartner = null;

  for (const t of tokens) {
    if (!vertical    && knownVerticals.has(t))  vertical    = t;
    if (!route       && ROUTE_ALIASES.has(t))   route       = ROUTE_ALIASES.get(t);
    if (!route       && knownRoutes.has(t))     route       = knownRoutes.get(t);
    if (!carrier     && CARRIER_MAP.has(t))     carrier     = CARRIER_MAP.get(t);
    if (!dataPartner && knownPartners.has(t))   dataPartner = knownPartners.get(t);
  }

  // platform kept for backwards compat (second ` - ` segment if present)
  const dashParts = title.split(/\s+-\s+/);
  const platform  = dashParts.length >= 3 ? dashParts[1].trim() : null;

  return { buyer, platform, vertical, route, carrier, dataPartner };
}

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
  sync.phase    = 'campaigns';
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

    // 1. Load known verticals, routes, and data partners from DB
    const { rows: vRows } = await pool.query(`SELECT value FROM list_items WHERE list = 'vertical'`);
    const knownVerticals = new Set(vRows.map((r) => r.value.toUpperCase()));

    const { rows: rRows } = await pool.query(`SELECT value FROM list_items WHERE list = 'route'`);
    const knownRoutes = new Map(rRows.map((r) => [r.value.toUpperCase(), r.value]));

    const { rows: pRows } = await pool.query(`SELECT alias FROM partners`);
    // Map UPPERCASE alias → canonical alias for case-insensitive token matching
    const knownPartners = new Map(pRows.map((r) => [r.alias.toUpperCase(), r.alias]));

    // 2. Fetch all campaigns from RedTrack
    const { data } = await redtrack.get('/campaigns/v2', { params: { per: 10000 } });
    const campaigns = data.items || [];

    // 3. Filter to buyer campaigns created in last 90 days (active set)
    const cutoff = new Date(new Date(dateFrom).getTime() - 90 * 86400000).toISOString().slice(0, 10);
    const buyerCampaigns = [];
    for (const c of campaigns) {
      const title = c.title.trim();
      const createdAt = (c.created_at || '').slice(0, 10);
      if (createdAt < cutoff) continue;
      for (const [buyer, pattern] of Object.entries(BUYER_PATTERNS)) {
        if (pattern.test(title)) {
          const parsed = parseCampaignTitle(title, knownVerticals, knownRoutes, knownPartners);
          buyerCampaigns.push({ id: c.id, title, buyer, platform: parsed.platform, vertical: parsed.vertical, route: parsed.route, carrier: parsed.carrier, dataPartner: parsed.dataPartner, created_at: createdAt });
          break;
        }
      }
    }

    // 4. Upsert campaign metadata
    for (const c of buyerCampaigns) {
      await pool.query(
        `INSERT INTO rt_campaigns (id, title, buyer, vertical, platform, route, carrier, data_partner, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET title=$2, buyer=$3, vertical=$4, platform=$5, route=$6, carrier=$7, data_partner=$8, synced_at=NOW()`,
        [c.id, c.title, c.buyer, c.vertical || null, c.platform || null, c.route || null, c.carrier || null, c.dataPartner || null, c.created_at || null]
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

    async function fetchAndStore(c, from, to) {
      await throttleRedtrack();
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
      } catch (err) { console.warn(`[sync] campaign ${c.id} skipped: ${err.message}`); }
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

    // Chain offer sync automatically
    sync.phase = 'offers';
    await persistSyncStatus();
    await runOfferSync(dateFrom, dateTo);

    sync.status = 'complete';
    sync.phase  = 'idle';
    sync.completedAt = new Date();
    sync.lastSyncedAt = new Date();
    await persistSyncStatus();
  } catch (err) {
    sync.status = 'error';
    sync.phase  = 'idle';
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

// Sync status — always returns snake_case regardless of source
router.get('/sync/status', async (_req, res) => {
  function normalize(s) {
    return {
      status:       s.status,
      phase:        s.phase || 'idle',
      running:      s.running || false,
      processed:    s.processed,
      total:        s.total,
      started_at:   s.started_at  ?? s.startedAt  ?? null,
      completed_at: s.completed_at ?? s.completedAt ?? null,
      error:        s.error || null,
      offer_sync:   {
        status:    offerSync.status,
        processed: offerSync.processed,
        total:     offerSync.total,
      },
    };
  }
  if (sync.status !== 'idle') return res.json(normalize(sync));
  try {
    const { rows } = await pool.query(`SELECT * FROM rt_sync_status WHERE id = 1`);
    if (rows.length) return res.json(normalize(rows[0]));
  } catch { /* ignore */ }
  res.json(normalize(sync));
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
         c.vertical,
         c.route,
         c.carrier,
         c.data_partner,
         COALESCE(SUM(s.clicks),0)::int       AS clicks,
         COALESCE(SUM(s.conversions),0)::int  AS conversions,
         COALESCE(SUM(s.cost),0)              AS cost,
         COALESCE(SUM(s.revenue),0)           AS revenue,
         COALESCE(SUM(s.profit),0)            AS profit
       FROM rt_campaigns c
       JOIN rt_campaign_stats s ON s.campaign_id = c.id
       WHERE c.buyer IS NOT NULL
         AND s.stat_date BETWEEN $1 AND $2
       GROUP BY c.buyer, c.id, c.title, c.vertical, c.route, c.carrier, c.data_partner
       ORDER BY c.buyer, clicks DESC`,
      [dateFrom, dateTo]
    );

    // Group by buyer
    const buyers = {};
    for (const r of rows) {
      if (!buyers[r.buyer]) buyers[r.buyer] = { campaigns: [], totals: { clicks:0, conversions:0, cost:0, revenue:0, profit:0 } };
      const stats = {
        id: r.id, title: r.title,
        vertical: r.vertical, route: r.route, carrier: r.carrier, data_partner: r.data_partner,
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

// Offer breakdown for a single campaign
router.get('/campaigns/:id/offers', async (req, res) => {
  try {
    const { id } = req.params;
    const today    = new Date().toISOString().slice(0, 10);
    const dateFrom = req.query.date_from || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const dateTo   = req.query.date_to   || today;

    const { rows } = await pool.query(`
      SELECT
        o.id                                            AS offer_id,
        o.name                                          AS offer_name,
        COALESCE(SUM(os.clicks),0)::int                 AS clicks,
        COALESCE(SUM(os.conversions),0)::int            AS conversions,
        COALESCE(SUM(os.cost),0)::numeric(14,2)         AS cost,
        COALESCE(SUM(os.revenue),0)::numeric(14,2)      AS revenue,
        COALESCE(SUM(os.profit),0)::numeric(14,2)       AS profit
      FROM rt_campaign_offers co
      JOIN rt_offers o ON o.id = co.offer_id
      LEFT JOIN rt_offer_stats os
        ON os.offer_id    = co.offer_id
       AND os.campaign_id = co.campaign_id
       AND os.stat_date BETWEEN $1 AND $2
      WHERE co.campaign_id = $3
      GROUP BY o.id, o.name
      ORDER BY SUM(os.clicks) DESC NULLS LAST
    `, [dateFrom, dateTo, id]);

    res.json(rows.map((r) => ({
      offer_id:    r.offer_id,
      offer_name:  r.offer_name,
      clicks:      Number(r.clicks),
      conversions: Number(r.conversions),
      cost:        Number(r.cost),
      revenue:     Number(r.revenue),
      profit:      Number(r.profit),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verticals report — reads from DB
router.get('/verticals', async (req, res) => {
  try {
    const defaults = defaultDateRange();
    const dateFrom = req.query.date_from || defaults.date_from;
    const dateTo   = req.query.date_to   || defaults.date_to;

    const { rows } = await pool.query(
      `SELECT
         c.vertical,
         c.id,
         c.title,
         c.buyer,
         c.route,
         c.carrier,
         c.data_partner,
         COALESCE(SUM(s.clicks),0)::int       AS clicks,
         COALESCE(SUM(s.conversions),0)::int  AS conversions,
         COALESCE(SUM(s.cost),0)              AS cost,
         COALESCE(SUM(s.revenue),0)           AS revenue,
         COALESCE(SUM(s.profit),0)            AS profit
       FROM rt_campaigns c
       JOIN rt_campaign_stats s ON s.campaign_id = c.id
       WHERE c.vertical IS NOT NULL
         AND s.stat_date BETWEEN $1 AND $2
       GROUP BY c.vertical, c.id, c.title, c.buyer, c.route, c.carrier, c.data_partner
       ORDER BY c.vertical, clicks DESC`,
      [dateFrom, dateTo]
    );

    // Group by vertical
    const verticals = {};
    for (const r of rows) {
      if (!verticals[r.vertical]) verticals[r.vertical] = { campaigns: [], totals: { clicks:0, conversions:0, cost:0, revenue:0, profit:0 } };
      const stats = {
        id: r.id, title: r.title, buyer: r.buyer,
        clicks: Number(r.clicks), conversions: Number(r.conversions),
        cost: Number(r.cost), revenue: Number(r.revenue), profit: Number(r.profit),
      };
      verticals[r.vertical].campaigns.push(stats);
      verticals[r.vertical].totals.clicks      += stats.clicks;
      verticals[r.vertical].totals.conversions += stats.conversions;
      verticals[r.vertical].totals.cost        += stats.cost;
      verticals[r.vertical].totals.revenue     += stats.revenue;
      verticals[r.vertical].totals.profit      += stats.profit;
    }

    // Also return distinct vertical names for the filter dropdown
    const verticalNames = Object.keys(verticals).sort();

    res.json({ date_from: dateFrom, date_to: dateTo, synced_at: sync.lastSyncedAt, verticals, verticalNames });
  } catch (err) {
    console.error('Verticals query error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Insights — new campaigns, vertical performance, opportunity gaps
router.get('/insights', async (req, res) => {
  try {
    const statsDays = parseInt(req.query.days) || 30;
    const today     = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const weekAgo   = new Date(Date.now() - 7  * 86400000).toISOString().slice(0, 10);
    const statsFrom = new Date(Date.now() - statsDays * 86400000).toISOString().slice(0, 10);

    // 1. New campaigns per buyer — daily counts for last 30 days
    const { rows: newCampaignRows } = await pool.query(`
      SELECT
        buyer,
        LEFT(created_at, 10) AS date,
        COUNT(*)::int          AS count
      FROM rt_campaigns
      WHERE buyer IS NOT NULL
        AND LEFT(created_at, 10) >= $1
      GROUP BY buyer, LEFT(created_at, 10)
      ORDER BY date DESC, buyer
    `, [statsFrom]);

    // Summarise into per-buyer today / yesterday / last 7 days / last 30 days
    const BUYERS = ['TK', 'MA', 'DS'];
    const newCampaigns = {};
    for (const buyer of BUYERS) {
      const rows = newCampaignRows.filter((r) => r.buyer === buyer);
      const sum  = (from) => rows.filter((r) => r.date >= from).reduce((a, r) => a + r.count, 0);
      newCampaigns[buyer] = {
        today:      rows.find((r) => r.date === today)?.count || 0,
        yesterday:  rows.find((r) => r.date === yesterday)?.count || 0,
        last_7:     sum(weekAgo),
        last_30:    sum(statsFrom),
        daily:      rows.slice(0, 14), // last 14 days for sparkline
      };
    }

    // 2. Media buyer financial performance
    const { rows: buyerPerf } = await pool.query(`
      SELECT
        c.buyer,
        COALESCE(SUM(s.clicks),0)::int                                                    AS clicks,
        COALESCE(SUM(s.conversions),0)::int                                               AS conversions,
        COALESCE(SUM(s.cost),0)::numeric(14,2)                                            AS cost,
        COALESCE(SUM(s.revenue),0)::numeric(14,2)                                         AS revenue,
        COALESCE(SUM(s.profit),0)::numeric(14,2)                                          AS profit,
        COUNT(DISTINCT c.id)::int                                                          AS campaigns,
        CASE WHEN SUM(s.clicks) > 0
             THEN ROUND((SUM(s.conversions)::numeric / SUM(s.clicks)) * 100, 2)
             ELSE 0 END                                                                    AS cvr,
        CASE WHEN SUM(s.cost) > 0
             THEN ROUND(((SUM(s.revenue) - SUM(s.cost)) / SUM(s.cost)) * 100, 1)
             ELSE 0 END                                                                    AS roi
      FROM rt_campaigns c
      JOIN rt_campaign_stats s ON s.campaign_id = c.id
      WHERE c.buyer IS NOT NULL AND s.stat_date BETWEEN $1 AND $2
      GROUP BY c.buyer
      ORDER BY SUM(s.profit) DESC
    `, [statsFrom, today]);

    // 3. Vertical performance — profit, ROI, CVR, profit per campaign
    const { rows: vertPerf } = await pool.query(`
      SELECT
        c.vertical,
        COUNT(DISTINCT c.id)::int                                                     AS campaigns,
        COALESCE(SUM(s.clicks),0)::int                                                AS clicks,
        COALESCE(SUM(s.conversions),0)::int                                           AS conversions,
        COALESCE(SUM(s.cost),0)                                                       AS cost,
        COALESCE(SUM(s.revenue),0)                                                    AS revenue,
        COALESCE(SUM(s.profit),0)                                                     AS profit,
        CASE WHEN SUM(s.clicks) > 0
             THEN ROUND((SUM(s.conversions)::numeric / SUM(s.clicks)) * 100, 2)
             ELSE 0 END                                                               AS cvr,
        CASE WHEN COUNT(DISTINCT c.id) > 0
             THEN ROUND(SUM(s.profit) / COUNT(DISTINCT c.id), 2)
             ELSE 0 END                                                               AS profit_per_campaign,
        CASE WHEN SUM(s.cost) > 0
             THEN ROUND(((SUM(s.revenue) - SUM(s.cost)) / SUM(s.cost)) * 100, 1)
             ELSE 0 END                                                               AS roi
      FROM rt_campaigns c
      JOIN rt_campaign_stats s ON s.campaign_id = c.id
      WHERE c.vertical IS NOT NULL
        AND s.stat_date BETWEEN $1 AND $2
      GROUP BY c.vertical
      ORDER BY profit DESC
    `, [statsFrom, today]);

    // 3. Buyer × Vertical matrix — campaign counts
    const { rows: matrixRows } = await pool.query(`
      SELECT buyer, vertical, COUNT(*)::int AS campaigns
      FROM rt_campaigns
      WHERE buyer IS NOT NULL AND vertical IS NOT NULL
      GROUP BY buyer, vertical
    `);

    const matrix = {};
    for (const buyer of BUYERS) {
      matrix[buyer] = {};
      for (const r of matrixRows.filter((r) => r.buyer === buyer)) {
        matrix[buyer][r.vertical] = r.campaigns;
      }
    }

    // 4. Opportunity gaps — high profit/campaign verticals a buyer isn't running
    const medianPPC = vertPerf.length
      ? Number(vertPerf[Math.floor(vertPerf.length / 2)]?.profit_per_campaign || 0)
      : 0;

    const opportunities = [];
    for (const v of vertPerf) {
      if (Number(v.profit_per_campaign) <= 0) continue;
      for (const buyer of BUYERS) {
        const buyerCount = matrix[buyer]?.[v.vertical] || 0;
        const totalCount = v.campaigns;
        // Flag if this buyer has <25% of total campaigns in a profitable vertical
        if (buyerCount < Math.max(3, totalCount * 0.25) && Number(v.profit_per_campaign) > medianPPC) {
          opportunities.push({
            vertical: v.vertical,
            buyer,
            buyer_campaigns: buyerCount,
            total_campaigns: totalCount,
            profit_per_campaign: Number(v.profit_per_campaign),
          });
        }
      }
    }
    // Sort by profit/campaign desc
    opportunities.sort((a, b) => b.profit_per_campaign - a.profit_per_campaign);

    res.json({
      period_days: statsDays,
      new_campaigns: newCampaigns,
      buyer_performance: buyerPerf.map((b) => ({
        buyer:       b.buyer,
        clicks:      Number(b.clicks),
        conversions: Number(b.conversions),
        cost:        Number(b.cost),
        revenue:     Number(b.revenue),
        profit:      Number(b.profit),
        campaigns:   Number(b.campaigns),
        cvr:         Number(b.cvr),
        roi:         Number(b.roi),
      })),
      vertical_performance: vertPerf.map((v) => ({
        ...v,
        campaigns: Number(v.campaigns),
        clicks: Number(v.clicks),
        conversions: Number(v.conversions),
        cost: Number(v.cost),
        revenue: Number(v.revenue),
        profit: Number(v.profit),
        cvr: Number(v.cvr),
        profit_per_campaign: Number(v.profit_per_campaign),
        roi: Number(v.roi),
      })),
      buyer_vertical_matrix: matrix,
      opportunities,
    });
  } catch (err) {
    console.error('Insights error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET cached AI report
router.get('/ai-recommendations', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM rt_ai_report WHERE id = 1`);
    if (rows.length) return res.json(rows[0]);
    res.json(null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST generate new AI report
router.post('/ai-recommendations/generate', async (req, res) => {
  try {
    const days = parseInt(req.body?.days) || 14;
    const today    = new Date().toISOString().slice(0, 10);
    const dateFrom = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    // Aggregate: vertical × carrier × route combinations with stats
    const { rows: combos } = await pool.query(`
      SELECT
        COALESCE(c.vertical, 'Unknown')                                 AS vertical,
        COALESCE(c.carrier,  'All carriers')                            AS carrier,
        COALESCE(c.route,    'Unknown')                                 AS route,
        COUNT(DISTINCT c.id)::int                                       AS campaigns,
        COALESCE(SUM(s.clicks),0)::int                                  AS clicks,
        COALESCE(SUM(s.conversions),0)::int                             AS conversions,
        COALESCE(SUM(s.cost),0)::numeric(14,2)                         AS cost,
        COALESCE(SUM(s.revenue),0)::numeric(14,2)                      AS revenue,
        COALESCE(SUM(s.profit),0)::numeric(14,2)                       AS profit,
        CASE WHEN SUM(s.clicks) > 0
             THEN ROUND((SUM(s.conversions)::numeric/SUM(s.clicks))*100,2)
             ELSE 0 END                                                  AS cvr,
        CASE WHEN SUM(s.cost) > 0
             THEN ROUND(((SUM(s.revenue)-SUM(s.cost))/SUM(s.cost))*100,1)
             ELSE 0 END                                                  AS roi
      FROM rt_campaigns c
      JOIN rt_campaign_stats s ON s.campaign_id = c.id
      WHERE c.buyer IS NOT NULL
        AND s.stat_date BETWEEN $1 AND $2
      GROUP BY c.vertical, c.carrier, c.route
      HAVING SUM(s.clicks) > 50
      ORDER BY profit DESC
      LIMIT 60
    `, [dateFrom, today]);

    // Per-buyer summary
    const { rows: buyerRows } = await pool.query(`
      SELECT
        c.buyer,
        COALESCE(SUM(s.clicks),0)::int          AS clicks,
        COALESCE(SUM(s.conversions),0)::int     AS conversions,
        COALESCE(SUM(s.cost),0)::numeric(14,2)  AS cost,
        COALESCE(SUM(s.revenue),0)::numeric(14,2) AS revenue,
        COALESCE(SUM(s.profit),0)::numeric(14,2) AS profit
      FROM rt_campaigns c
      JOIN rt_campaign_stats s ON s.campaign_id = c.id
      WHERE c.buyer IS NOT NULL AND s.stat_date BETWEEN $1 AND $2
      GROUP BY c.buyer ORDER BY profit DESC
    `, [dateFrom, today]);

    // Offer × route × carrier × data_partner performance (only if offer sync has run)
    const { rows: offerRows } = await pool.query(`
      SELECT
        o.name                                                              AS offer,
        COALESCE(c.vertical,     'Unknown')                                AS vertical,
        COALESCE(c.carrier,      'All carriers')                           AS carrier,
        COALESCE(c.route,        'Unknown')                                AS route,
        COALESCE(c.data_partner, 'Unknown')                                AS data_partner,
        c.buyer,
        COUNT(DISTINCT os.campaign_id)::int                                AS campaigns,
        COALESCE(SUM(os.clicks),0)::int                                    AS clicks,
        COALESCE(SUM(os.conversions),0)::int                               AS conversions,
        COALESCE(SUM(os.cost),0)::numeric(14,2)                            AS cost,
        COALESCE(SUM(os.revenue),0)::numeric(14,2)                         AS revenue,
        COALESCE(SUM(os.profit),0)::numeric(14,2)                          AS profit,
        CASE WHEN SUM(os.clicks) > 0
             THEN ROUND((SUM(os.conversions)::numeric/SUM(os.clicks))*100,2)
             ELSE 0 END                                                    AS cvr,
        CASE WHEN SUM(os.cost) > 0
             THEN ROUND(((SUM(os.revenue)-SUM(os.cost))/SUM(os.cost))*100,1)
             ELSE 0 END                                                    AS roi
      FROM rt_offer_stats os
      JOIN rt_offers o    ON o.id = os.offer_id
      JOIN rt_campaigns c ON c.id = os.campaign_id
      WHERE os.stat_date BETWEEN $1 AND $2
        AND c.buyer IS NOT NULL
      GROUP BY o.name, c.vertical, c.carrier, c.route, c.data_partner, c.buyer
      HAVING SUM(os.clicks) > 50
      ORDER BY SUM(os.profit) DESC
      LIMIT 50
    `, [dateFrom, today]);

    const hasOfferData = offerRows.length > 0;

    const dataJson = {
      period_days: days, date_from: dateFrom, date_to: today,
      combinations: combos, buyers: buyerRows, offer_combinations: offerRows,
    };

    // Build prompt
    const comboTable = combos.slice(0, 30).map((r, i) =>
      `${i+1}. ${r.vertical} | ${r.carrier} | ${r.route} | Campaigns:${r.campaigns} | Clicks:${r.clicks} | CVR:${r.cvr}% | Profit:$${r.profit} | ROI:${r.roi}%`
    ).join('\n');

    const buyerTable = buyerRows.map((r) =>
      `${r.buyer}: Clicks:${r.clicks} | Spend:$${r.cost} | Revenue:$${r.revenue} | Profit:$${r.profit}`
    ).join('\n');

    const offerTable = offerRows.slice(0, 40).map((r, i) =>
      `${i+1}. "${r.offer}" | ${r.vertical} | ${r.route} | ${r.carrier} | Partner:${r.data_partner} | Buyer:${r.buyer} | Campaigns:${r.campaigns} | Clicks:${r.clicks} | CVR:${r.cvr}% | Profit:$${r.profit} | ROI:${r.roi}%`
    ).join('\n');

    const prompt = `You are a performance marketing analyst for an SMS media buying team. Your ONLY goal is to maximize profit and ROI. Be brutally honest — if something is losing money, say so plainly. If something is printing money, say scale it hard.

The team controls: which OFFERS to run, which ROUTES to use (USMS, Ranhog, Internal, TechStar), which CARRIERS to target (Verizon, AT&T, T-Mobile), which DATA PARTNERS supply the lists (LM, JC, AVANTO, UPSTART, KOINO), and how many campaigns to put behind each combination. Budget follows performance.

Data for the last ${days} days (${dateFrom} to ${today}):

BUYER TOTALS:
${buyerTable}

ROUTE × VERTICAL × CARRIER (sorted by profit):
${comboTable}
${hasOfferData ? `
OFFER × ROUTE × CARRIER × DATA PARTNER (sorted by profit):
${offerTable}
` : '\n(No offer-level data yet — run a sync to unlock offer-level insights.)\n'}
Analyze this data and give a profit-maximization plan. Be specific with numbers — quote actual profit figures and ROI percentages from the data. Structure:

## 💰 Scale These Now
The highest-ROI combinations worth putting more volume behind. ${hasOfferData ? 'Name the exact offer, route, carrier, and data partner.' : 'Name vertical, route, and carrier.'} Explain WHY (ROI%, profit, volume potential).

## 🔴 Kill or Pause Immediately
Combinations burning money or with ROI below breakeven. Name them explicitly with their loss figures. Every dollar saved here funds the winners above.

## 🔁 Reallocation Moves
Specific shifts: take budget FROM losing combination X and move it TO winning combination Y. ${hasOfferData ? 'E.g. "Move TK budget from [losing offer] on Ranhog to [winning offer] on USMS/Verizon."' : 'E.g. "Move budget from [vertical/carrier] to [vertical/carrier]."'}

## 🧪 Highest-Potential Tests
1-3 untested combinations that the data suggests could be profitable. Base it on patterns — if offer X crushes on Verizon, testing it on AT&T is logical. Rank by expected impact.

## 📋 This Week — Per Buyer
Numbered list per buyer (TK, MA, DS). Concrete actions: what to launch, what to pause, what to scale. ${hasOfferData ? 'Include offer names.' : ''} No vague advice — specific moves only.`;


    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0].text;

    await pool.query(`
      INSERT INTO rt_ai_report (id, generated_at, period_days, content, data_json)
      VALUES (1, NOW(), $1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET generated_at=NOW(), period_days=$1, content=$2, data_json=$3
    `, [days, content, JSON.stringify(dataJson)]);

    res.json({ generated_at: new Date(), period_days: days, content, data_json: dataJson });
  } catch (err) {
    console.error('AI report error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Offer sync ───────────────────────────────────────────────────────────────

const offerSync = {
  running: false,
  status: 'idle',
  processed: 0,
  total: 0,
  startedAt: null,
  completedAt: null,
  error: null,
};

async function runOfferSync(dateFrom, dateTo) {
  if (offerSync.running) return;
  offerSync.running    = true;
  offerSync.status     = 'running';
  offerSync.processed  = 0;
  offerSync.total      = 0;
  offerSync.startedAt  = new Date();
  offerSync.completedAt = null;
  offerSync.error      = null;

  try {
    const today     = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const earliest  = new Date(Date.now() - MAX_HISTORY_DAYS * 86400000).toISOString().slice(0, 10);
    if (dateFrom < earliest) dateFrom = earliest;

    // Campaigns that have stats in the requested range
    const { rows: campaignRows } = await pool.query(
      `SELECT DISTINCT c.id, c.title
       FROM rt_campaigns c
       JOIN rt_campaign_stats s ON s.campaign_id = c.id
       WHERE s.stat_date BETWEEN $1 AND $2`,
      [dateFrom, dateTo]
    );
    offerSync.total = campaignRows.length;

    for (let i = 0; i < campaignRows.length; i++) {
      const c = campaignRows[i];
      try {
        await throttleRedtrack();
        const { data } = await redtrack.get(`/campaigns/${c.id}`);
        const offers = [];
        for (const sw of (data?.streams || [])) {
          for (const o of (sw.stream?.offers || [])) {
            if (o.id && o.name) offers.push({ id: o.id, name: o.name });
          }
        }

        if (offers.length === 0) { offerSync.processed = i + 1; continue; }

        // Upsert offers and campaign-offer links
        for (const offer of offers) {
          await pool.query(
            `INSERT INTO rt_offers (id, name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name=$2`,
            [offer.id, offer.name]
          );
          await pool.query(
            `INSERT INTO rt_campaign_offers (campaign_id, offer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [c.id, offer.id]
          );
        }

        const historicalTo = dateTo < today ? dateTo : yesterday;

        if (offers.length === 1) {
          // Single offer — copy stats directly from rt_campaign_stats (no extra API call)
          await pool.query(`
            INSERT INTO rt_offer_stats (offer_id, campaign_id, stat_date, clicks, conversions, cost, revenue, profit)
            SELECT $1, campaign_id, stat_date, clicks, conversions, cost, revenue, profit
            FROM rt_campaign_stats
            WHERE campaign_id = $2 AND stat_date BETWEEN $3 AND $4
            ON CONFLICT (offer_id, campaign_id, stat_date) DO UPDATE SET
              clicks=EXCLUDED.clicks, conversions=EXCLUDED.conversions,
              cost=EXCLUDED.cost, revenue=EXCLUDED.revenue, profit=EXCLUDED.profit
          `, [offers[0].id, c.id, dateFrom, dateTo]);
        } else {
          // Multiple offers — fetch clicks/conversions/revenue per offer from API,
          // then prorate campaign cost by click share (cost lives at campaign level in RedTrack).

          // Collect per-offer per-day traffic: { date → { offerId → { clicks, conversions, revenue } } }
          const offerDayMap = {};

          async function fetchOfferDays(offer, from, to) {
            await throttleRedtrack();
            const { data: report } = await redtrack.get('/report', {
              params: { campaign_id: c.id, offer_id: offer.id, date_from: from, date_to: to, per: 1000 },
            });
            const rows = Array.isArray(report) ? report : (report?.items || []);
            for (const row of rows) {
              if (!row.date) continue;
              if (!offerDayMap[row.date]) offerDayMap[row.date] = {};
              offerDayMap[row.date][offer.id] = {
                clicks:      row.clicks      || 0,
                conversions: row.conversions || 0,
                revenue:     row.revenue     || 0,
              };
            }
          }

          for (const offer of offers) {
            if (dateFrom <= historicalTo) {
              const { rows: existing } = await pool.query(
                `SELECT 1 FROM rt_offer_stats WHERE offer_id=$1 AND campaign_id=$2 AND stat_date BETWEEN $3 AND $4 LIMIT 1`,
                [offer.id, c.id, dateFrom, historicalTo]
              );
              if (!existing.length) await fetchOfferDays(offer, dateFrom, historicalTo);
            }
            if (dateTo >= today) await fetchOfferDays(offer, today, today);
          }

          // Load campaign cost per day from rt_campaign_stats (source of truth for cost)
          const { rows: campCosts } = await pool.query(
            `SELECT stat_date::text AS date, cost FROM rt_campaign_stats
             WHERE campaign_id = $1 AND stat_date BETWEEN $2 AND $3`,
            [c.id, dateFrom, dateTo]
          );
          const campaignCostByDate = Object.fromEntries(campCosts.map((r) => [r.date, Number(r.cost)]));

          // Write prorated stats per offer per day
          for (const [date, offerStats] of Object.entries(offerDayMap)) {
            const totalClicks   = Object.values(offerStats).reduce((a, v) => a + v.clicks, 0);
            const campaignCost  = campaignCostByDate[date] ?? 0;

            for (const [offerId, stats] of Object.entries(offerStats)) {
              const share   = totalClicks > 0 ? stats.clicks / totalClicks : 1 / offers.length;
              const cost    = campaignCost * share;
              const profit  = stats.revenue - cost;
              await pool.query(
                `INSERT INTO rt_offer_stats (offer_id, campaign_id, stat_date, clicks, conversions, cost, revenue, profit)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                 ON CONFLICT (offer_id, campaign_id, stat_date) DO UPDATE SET
                   clicks=$4, conversions=$5, cost=$6, revenue=$7, profit=$8`,
                [offerId, c.id, date, stats.clicks, stats.conversions, cost, stats.revenue, profit]
              );
            }
          }
        }
      } catch (err) { console.warn(`[offer-sync] campaign ${c.campaign_id} skipped: ${err.message}`); }

      offerSync.processed = i + 1;
    }

    offerSync.status      = 'complete';
    offerSync.completedAt = new Date();
  } catch (err) {
    offerSync.status = 'error';
    offerSync.error  = err.message;
    console.error('[offer-sync] error:', err.message);
  } finally {
    offerSync.running = false;
  }
}

// Trigger offer sync
router.post('/sync/offers', (req, res) => {
  const defaults = defaultDateRange();
  const dateFrom = req.body?.date_from || defaults.date_from;
  const dateTo   = req.body?.date_to   || defaults.date_to;

  if (offerSync.running) return res.json({ status: 'already_running', ...offerSync });

  runOfferSync(dateFrom, dateTo).catch((err) => console.error('Offer sync error:', err.message));

  res.status(202).json({ status: 'started', dateFrom, dateTo });
});

// Offer sync status
router.get('/sync/offers/status', (_req, res) => {
  res.json({
    status:       offerSync.status,
    running:      offerSync.running,
    processed:    offerSync.processed,
    total:        offerSync.total,
    started_at:   offerSync.startedAt,
    completed_at: offerSync.completedAt,
    error:        offerSync.error || null,
  });
});

// Offer performance report
router.get('/offers', async (req, res) => {
  try {
    const defaults = defaultDateRange();
    const dateFrom = req.query.date_from || defaults.date_from;
    const dateTo   = req.query.date_to   || defaults.date_to;
    const buyer       = req.query.buyer        || null;
    const vertical    = req.query.vertical     || null;
    const route       = req.query.route        || null;
    const carrier     = req.query.carrier      || null;
    const dataPartner = req.query.data_partner || null;

    const conditions = [`os.stat_date BETWEEN $1 AND $2`];
    const params     = [dateFrom, dateTo];
    let   p          = 3;
    if (buyer)       { conditions.push(`c.buyer = $${p++}`);        params.push(buyer); }
    if (vertical)    { conditions.push(`c.vertical = $${p++}`);     params.push(vertical); }
    if (route)       { conditions.push(`c.route = $${p++}`);        params.push(route); }
    if (carrier)     { conditions.push(`c.carrier = $${p++}`);      params.push(carrier); }
    if (dataPartner) { conditions.push(`c.data_partner = $${p++}`); params.push(dataPartner); }

    const { rows } = await pool.query(`
      SELECT
        o.id                                                               AS offer_id,
        o.name                                                             AS offer_name,
        c.vertical,
        c.route,
        c.carrier,
        c.buyer,
        c.data_partner,
        COUNT(DISTINCT os.campaign_id)::int                                AS campaigns,
        COALESCE(SUM(os.clicks),0)::int                                    AS clicks,
        COALESCE(SUM(os.conversions),0)::int                               AS conversions,
        COALESCE(SUM(os.cost),0)::numeric(14,2)                            AS cost,
        COALESCE(SUM(os.revenue),0)::numeric(14,2)                         AS revenue,
        COALESCE(SUM(os.profit),0)::numeric(14,2)                          AS profit,
        CASE WHEN SUM(os.clicks) > 0
             THEN ROUND((SUM(os.conversions)::numeric / SUM(os.clicks)) * 100, 2)
             ELSE 0 END                                                    AS cvr,
        CASE WHEN SUM(os.cost) > 0
             THEN ROUND(((SUM(os.revenue)-SUM(os.cost))/SUM(os.cost))*100, 1)
             ELSE 0 END                                                    AS roi
      FROM rt_offer_stats os
      JOIN rt_offers o     ON o.id  = os.offer_id
      JOIN rt_campaigns c  ON c.id  = os.campaign_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY o.id, o.name, c.vertical, c.route, c.carrier, c.buyer, c.data_partner
      ORDER BY SUM(os.profit) DESC
    `, params);

    // Distinct filter options for dropdowns
    const { rows: filterRows } = await pool.query(`
      SELECT DISTINCT c.vertical, c.route, c.carrier, c.buyer, c.data_partner
      FROM rt_offer_stats os
      JOIN rt_campaigns c ON c.id = os.campaign_id
      WHERE os.stat_date BETWEEN $1 AND $2
    `, [dateFrom, dateTo]);

    const verticals    = [...new Set(filterRows.map(r => r.vertical).filter(Boolean))].sort();
    const routes       = [...new Set(filterRows.map(r => r.route).filter(Boolean))].sort();
    const carriers     = [...new Set(filterRows.map(r => r.carrier).filter(Boolean))].sort();
    const dataPartners = [...new Set(filterRows.map(r => r.data_partner).filter(Boolean))].sort();

    res.json({ rows, verticals, routes, carriers, dataPartners, sync: { status: offerSync.status, processed: offerSync.processed, total: offerSync.total } });
  } catch (err) {
    console.error('Offers report error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.cleanupOldStats = cleanupOldStats;
module.exports.runSync = runSync;
