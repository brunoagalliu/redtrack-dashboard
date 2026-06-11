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
  processed: 0,
  total: 0,
  startedAt: null,
  completedAt: null,
  lastSyncedAt: null,
  error: null,
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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

// Parse campaign title extracting buyer, vertical, route, and carrier.
// Delimiters can be spaces, underscores, or hyphens — we scan tokens for known values.
// knownRoutes is a Map<UPPERCASE_TOKEN, canonicalName> built from list_items at sync time.
function parseCampaignTitle(rawTitle, knownVerticals, knownRoutes) {
  const title  = rawTitle.trim();
  const tokens = tokenize(title);

  // Buyer is the first token
  const buyer = tokens[0] || null;

  // Scan all tokens for known values
  let vertical = null;
  let route    = null;
  let carrier  = null;

  for (const t of tokens) {
    if (!vertical && knownVerticals.has(t))  vertical = t;
    if (!route    && ROUTE_ALIASES.has(t))   route    = ROUTE_ALIASES.get(t);
    if (!route    && knownRoutes.has(t))     route    = knownRoutes.get(t);
    if (!carrier  && CARRIER_MAP.has(t))     carrier  = CARRIER_MAP.get(t);
  }

  // platform kept for backwards compat (second ` - ` segment if present)
  const dashParts = title.split(/\s+-\s+/);
  const platform  = dashParts.length >= 3 ? dashParts[1].trim() : null;

  return { buyer, platform, vertical, route, carrier };
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

    // 1. Load known verticals and routes from DB (campaign creator is the source of truth)
    const { rows: vRows } = await pool.query(`SELECT value FROM list_items WHERE list = 'vertical'`);
    const knownVerticals = new Set(vRows.map((r) => r.value.toUpperCase()));

    const { rows: rRows } = await pool.query(`SELECT value FROM list_items WHERE list = 'route'`);
    // Map UPPERCASE token → canonical name for case-insensitive matching in campaign titles
    const knownRoutes = new Map(rRows.map((r) => [r.value.toUpperCase(), r.value]));

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
          const parsed = parseCampaignTitle(title, knownVerticals, knownRoutes);
          buyerCampaigns.push({ id: c.id, title, buyer, platform: parsed.platform, vertical: parsed.vertical, route: parsed.route, carrier: parsed.carrier, created_at: createdAt });
          break;
        }
      }
    }

    // 4. Upsert campaign metadata
    for (const c of buyerCampaigns) {
      await pool.query(
        `INSERT INTO rt_campaigns (id, title, buyer, vertical, platform, route, carrier, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET title=$2, buyer=$3, vertical=$4, platform=$5, route=$6, carrier=$7, synced_at=NOW()`,
        [c.id, c.title, c.buyer, c.vertical || null, c.platform || null, c.route || null, c.carrier || null, c.created_at || null]
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

// Sync status — always returns snake_case regardless of source
router.get('/sync/status', async (_req, res) => {
  function normalize(s) {
    return {
      status:       s.status,
      running:      s.running || false,
      processed:    s.processed,
      total:        s.total,
      started_at:   s.started_at  ?? s.startedAt  ?? null,
      completed_at: s.completed_at ?? s.completedAt ?? null,
      error:        s.error || null,
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
         COALESCE(SUM(s.clicks),0)::int       AS clicks,
         COALESCE(SUM(s.conversions),0)::int  AS conversions,
         COALESCE(SUM(s.cost),0)              AS cost,
         COALESCE(SUM(s.revenue),0)           AS revenue,
         COALESCE(SUM(s.profit),0)            AS profit
       FROM rt_campaigns c
       JOIN rt_campaign_stats s ON s.campaign_id = c.id
       WHERE c.vertical IS NOT NULL
         AND s.stat_date BETWEEN $1 AND $2
       GROUP BY c.vertical, c.id, c.title, c.buyer
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

    // 2. Vertical performance — profit, ROI, CVR, profit per campaign
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

    // Also pull per-buyer summary
    const { rows: buyerRows } = await pool.query(`
      SELECT
        c.buyer,
        COALESCE(SUM(s.clicks),0)::int       AS clicks,
        COALESCE(SUM(s.conversions),0)::int  AS conversions,
        COALESCE(SUM(s.cost),0)::numeric(14,2) AS cost,
        COALESCE(SUM(s.revenue),0)::numeric(14,2) AS revenue,
        COALESCE(SUM(s.profit),0)::numeric(14,2) AS profit
      FROM rt_campaigns c
      JOIN rt_campaign_stats s ON s.campaign_id = c.id
      WHERE c.buyer IS NOT NULL AND s.stat_date BETWEEN $1 AND $2
      GROUP BY c.buyer ORDER BY profit DESC
    `, [dateFrom, today]);

    const dataJson = { period_days: days, date_from: dateFrom, date_to: today, combinations: combos, buyers: buyerRows };

    // Build prompt
    const comboTable = combos.slice(0, 40).map((r, i) =>
      `${i+1}. Vertical:${r.vertical} | Carrier:${r.carrier} | Route:${r.route} | Campaigns:${r.campaigns} | Clicks:${r.clicks} | Conv:${r.conversions} | CVR:${r.cvr}% | Spend:$${r.cost} | Revenue:$${r.revenue} | Profit:$${r.profit} | ROI:${r.roi}%`
    ).join('\n');

    const buyerTable = buyerRows.map((r) =>
      `${r.buyer}: Clicks:${r.clicks} | Conv:${r.conversions} | Spend:$${r.cost} | Revenue:$${r.revenue} | Profit:$${r.profit}`
    ).join('\n');

    const prompt = `You are analyzing SMS marketing campaign performance data for a media buying team. The team sends SMS campaigns across different verticals (GLP1, CLOUD, AUTO, PAYDAY, etc.), carriers (Verizon, AT&T, T-Mobile, All carriers), and routes (USMS, Ranhog, Internal, TechStar).

Here is performance data for the last ${days} days (${dateFrom} to ${today}):

MEDIA BUYER SUMMARY:
${buyerTable}

TOP COMBINATIONS (Vertical × Carrier × Route), sorted by profit:
${comboTable}

Based on this data, provide a clear weekly action plan for the team. Structure your response as:

## 🏆 Top Combinations to Scale
List the 3-5 highest-performing combinations with specific reasons why (high ROI, strong CVR, etc.)

## ⚠️ Underperforming — Reduce or Pause
List combinations with negative profit or very low ROI that should be reduced.

## 💡 Opportunities to Test
Based on patterns in the data, suggest 2-3 new combinations worth testing (e.g. a vertical doing well on Verizon might be worth testing on AT&T).

## 📋 Action Items for This Week
Specific, numbered action items each media buyer should take. Be direct and actionable.

Keep it concise and practical — the team needs to act on this Monday morning.`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
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

// ── Offer API probe (temp) ────────────────────────────────────────────────────
router.get('/probe/offers', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.title, SUM(s.clicks) AS clicks
      FROM rt_campaigns c
      JOIN rt_campaign_stats s ON s.campaign_id = c.id
      WHERE s.stat_date >= NOW() - INTERVAL '7 days'
      GROUP BY c.id, c.title
      ORDER BY clicks DESC
      LIMIT 1
    `);
    if (!rows.length) return res.status(404).json({ error: 'No active campaigns in last 7 days' });
    const campaign = rows[0];

    const dateFrom = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const dateTo   = new Date().toISOString().slice(0, 10);
    const results  = {};

    // 1. Get campaign detail → extract offers from streams
    let offerIds = [];
    try {
      const { data } = await redtrack.get(`/campaigns/${campaign.id}`);
      for (const sw of (data?.streams || [])) {
        for (const o of (sw.stream?.offers || [])) {
          if (o.id) offerIds.push({ id: o.id, name: o.name });
        }
      }
      results.offers_in_campaign = offerIds;
    } catch (e) { results.streams_error = e.response?.data || e.message; }

    await new Promise(r => setTimeout(r, 3200));

    // 2. For each offer in this campaign, try /report?campaign_id=X&offer_id=Y
    results.per_offer_report = [];
    for (const offer of offerIds) {
      try {
        const { data } = await redtrack.get('/report', {
          params: { campaign_id: campaign.id, offer_id: offer.id, date_from: dateFrom, date_to: dateTo, per: 100 },
        });
        const items = Array.isArray(data) ? data : (data?.items || []);
        const total = items.reduce((a, r) => ({ clicks: a.clicks + (r.clicks||0), revenue: a.revenue + (r.revenue||0), conversions: a.conversions + (r.conversions||0) }), { clicks: 0, revenue: 0, conversions: 0 });
        results.per_offer_report.push({ offer_id: offer.id, offer_name: offer.name, row_count: items.length, totals: total, sample_row: items[0] ? { date: items[0].date, clicks: items[0].clicks, revenue: items[0].revenue } : null });
      } catch (e) {
        results.per_offer_report.push({ offer_id: offer.id, offer_name: offer.name, error: e.response?.data || e.message });
      }
      await new Promise(r => setTimeout(r, 3200));
    }

    res.json({ campaign, dateFrom, dateTo, results });
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

module.exports = router;
module.exports.cleanupOldStats = cleanupOldStats;
module.exports.runSync = runSync;
