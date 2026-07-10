const express = require('express');
const redtrack = require('../redtrack');
const { pool } = require('../db');
const Anthropic = require('@anthropic-ai/sdk');

const router = express.Router();

const BUYER_PATTERNS = { TK: /^TK[\s_\-]/i, MA: /^MA[\s_\-]/i, DS: /^DS[\s_\-]/i };
const CALL_INTERVAL_MS = 3200; // 20 calls/min limit → ~3s between calls
const MAX_HISTORY_DAYS = 180;

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

// Parse list key and last-used date from a campaign title.
// Confirmed convention: {buyer} - {route}_{vertical?}_{list_name_ending_in_size}_{DD.MM?}
// e.g. "TK - USMS_Cloud_kn_billing_sweeps_att_mar2026_34k_23.03"
//   →  listKey = "kn_billing_sweeps_att_mar2026_34k", listLastUsed = "23.03"
const _LIST_NOISE = new Set(['own', 'upm']);
function parseListFromTitle(rawTitle, knownRoutes, knownVerticals) {
  let s = rawTitle.trim().replace(/[_\s]*-?\s*COPY\s*$/i, '');

  // Extract trailing _DD.MM date stamp
  let listLastUsed = null;
  const dateM = s.match(/_(\d{1,2})\.(\d{1,2})\s*$/);
  if (dateM) { listLastUsed = `${dateM[1]}.${dateM[2]}`; s = s.slice(0, dateM.index); }

  // Find the last size token — list name ends here (e.g. "34k", "114k", "5,7k")
  const sizeRe = /\d+(?:[.,]\d+)?\s*[kK]\b/g;
  const sizeMatches = [...s.matchAll(sizeRe)];
  if (!sizeMatches.length) return { listKey: null, listLastUsed };
  const lastSize = sizeMatches[sizeMatches.length - 1];
  let body = s.slice(0, lastSize.index + lastSize[0].length);

  // When a " - " dash splits the string and the tail is only carrier+size (no other text),
  // the dash is a list/carrier separator — keep the full body.
  // Otherwise the tail IS the list (discard leading provider/sub-account segment).
  if (body.includes(' - ')) {
    const idx = body.lastIndexOf(' - ');
    const tail = body.slice(idx + 3);
    const tailCore = tail.replace(/\d+(?:[.,]\d+)?\s*[kK]\b/gi, '').replace(/[_\s]+/g, '').trim();
    const carrierOnly = /^(att|vz|verizon|tmob|t-mobile|all|ios|android|iosonly)$/i.test(tailCore);
    if (!carrierOnly && tailCore.length > 0) body = tail;
  }

  // Strip leading buyer code (TK/MA/DS)
  body = body.replace(/^\s*(TK|MA|DS)\s*-\s*/i, '');

  // Strip leading known-route token then optional known-vertical token
  const toks = body.split(/[_\s]+/).filter(Boolean);
  let skip = 0;
  const t0up = (toks[skip] || '').toUpperCase();
  if (knownRoutes.has(t0up) || ROUTE_ALIASES.has(t0up)) skip++;
  const t1up = (toks[skip] || '').toUpperCase();
  if (knownVerticals.has(t1up)) skip++;

  if (skip > 0) {
    const prefixPat = toks.slice(0, skip)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[_\\s]+');
    body = body.replace(new RegExp('^[_\\s]*' + prefixPat + '[_\\s]+', 'i'), '');
  }

  body = body.trim().replace(/^[_\s]+|[_\s]+$/g, '');
  if (!body || body.length < 5) return { listKey: null, listLastUsed };

  // Normalize: lowercase, collapse noise words and consecutive duplicates
  const norm = body.toLowerCase().split(/[_\s]+/).filter(Boolean);
  const deduped = [];
  for (const t of norm) {
    if (_LIST_NOISE.has(t)) continue;
    if (deduped.length && deduped[deduped.length - 1] === t) continue;
    deduped.push(t);
  }
  const listKey = deduped.join('_');
  if (listKey.length < 5 || !listKey.includes('_')) return { listKey: null, listLastUsed };
  return { listKey, listLastUsed };
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

let currentLogId = null;

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

  // Insert a log entry for this sync run
  try {
    const { rows } = await pool.query(
      `INSERT INTO rt_sync_logs (date_from, date_to, started_at, status)
       VALUES ($1, $2, $3, 'running') RETURNING id`,
      [dateFrom, dateTo, sync.startedAt]
    );
    currentLogId = rows[0]?.id || null;
  } catch { /* non-critical */ }

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

    // 3. Filter to buyer campaigns within the sync window
    const cutoff = new Date(new Date(dateFrom).getTime() - MAX_HISTORY_DAYS * 86400000).toISOString().slice(0, 10);
    const buyerCampaigns = [];
    for (const c of campaigns) {
      const title = c.title.trim();
      const createdAt = (c.created_at || '').slice(0, 10);
      if (createdAt < cutoff) continue;
      for (const [buyer, pattern] of Object.entries(BUYER_PATTERNS)) {
        if (pattern.test(title)) {
          const parsed = parseCampaignTitle(title, knownVerticals, knownRoutes, knownPartners);
          const { listKey, listLastUsed } = parseListFromTitle(title, knownRoutes, knownVerticals);
          buyerCampaigns.push({ id: c.id, title, buyer, platform: parsed.platform, vertical: parsed.vertical, route: parsed.route, carrier: parsed.carrier, dataPartner: parsed.dataPartner, dataList: listKey, listLastUsed, created_at: createdAt });
          break;
        }
      }
    }

    // 4. Upsert campaign metadata
    for (const c of buyerCampaigns) {
      await pool.query(
        `INSERT INTO rt_campaigns (id, title, buyer, vertical, platform, route, carrier, data_partner, data_list, list_last_used, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET title=$2, buyer=$3, vertical=$4, platform=$5, route=$6, carrier=$7, data_partner=$8, data_list=$9, list_last_used=$10, synced_at=NOW()`,
        [c.id, c.title, c.buyer, c.vertical || null, c.platform || null, c.route || null, c.carrier || null, c.dataPartner || null, c.dataList || null, c.listLastUsed || null, c.created_at || null]
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

    // Auto-generate the AI report weekly, using the data this sync just refreshed
    try {
      const { rows: lastReportRows } = await pool.query(`SELECT generated_at FROM rt_ai_report WHERE id = 1`);
      const lastGeneratedAt = lastReportRows[0]?.generated_at;
      const daysSinceLast = lastGeneratedAt
        ? (Date.now() - new Date(lastGeneratedAt).getTime()) / 86400000
        : Infinity;
      if (daysSinceLast >= 7) {
        await generateAIReport(14);
        console.log('[ai] Auto-generated weekly report');
      }
    } catch (err) {
      console.warn('[ai] Auto-generation skipped:', err.message);
    }

    sync.status = 'complete';
    sync.phase  = 'idle';
    sync.completedAt = new Date();
    sync.lastSyncedAt = new Date();
    await persistSyncStatus();

    if (currentLogId) {
      await pool.query(
        `UPDATE rt_sync_logs SET status='complete', completed_at=$1, campaigns_processed=$2 WHERE id=$3`,
        [sync.completedAt, sync.processed, currentLogId]
      ).catch(() => {});
    }
  } catch (err) {
    sync.status = 'error';
    sync.phase  = 'idle';
    sync.error  = err.message;
    await persistSyncStatus().catch(() => {});

    if (currentLogId) {
      await pool.query(
        `UPDATE rt_sync_logs SET status='error', completed_at=NOW(), campaigns_processed=$1, error=$2 WHERE id=$3`,
        [sync.processed, err.message, currentLogId]
      ).catch(() => {});
    }
  } finally {
    sync.running = false;
    currentLogId = null;
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

// Sync log history
router.get('/sync/logs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const { rows } = await pool.query(
      `SELECT id, date_from, date_to, started_at, completed_at, campaigns_processed, status, error
       FROM rt_sync_logs
       ORDER BY started_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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


// Update list name for a campaign (manual correction)
router.patch('/campaigns/:id/list', async (req, res) => {
  const { data_list } = req.body;
  if (data_list === undefined) return res.status(400).json({ message: 'data_list required' });
  await pool.query(`UPDATE rt_campaigns SET data_list=$1 WHERE id=$2`, [data_list || null, req.params.id]);
  res.json({ ok: true });
});

// Update data partner for a campaign (manual correction)
router.patch('/campaigns/:id/partner', async (req, res) => {
  const { data_partner } = req.body;
  if (data_partner === undefined) return res.status(400).json({ message: 'data_partner required' });
  await pool.query(`UPDATE rt_campaigns SET data_partner=$1 WHERE id=$2`, [data_partner || null, req.params.id]);
  res.json({ ok: true });
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
         c.data_list,
         COALESCE(SUM(s.clicks),0)::int       AS clicks,
         COALESCE(SUM(s.conversions),0)::int  AS conversions,
         COALESCE(SUM(s.cost),0)              AS cost,
         COALESCE(SUM(s.revenue),0)           AS revenue,
         COALESCE(SUM(s.profit),0)            AS profit
       FROM rt_campaigns c
       JOIN rt_campaign_stats s ON s.campaign_id = c.id
       WHERE c.buyer IS NOT NULL
         AND s.stat_date BETWEEN $1 AND $2
       GROUP BY c.buyer, c.id, c.title, c.vertical, c.route, c.carrier, c.data_partner, c.data_list
       ORDER BY c.buyer, clicks DESC`,
      [dateFrom, dateTo]
    );

    // Group by buyer
    const buyers = {};
    for (const r of rows) {
      if (!buyers[r.buyer]) buyers[r.buyer] = { campaigns: [], totals: { clicks:0, conversions:0, cost:0, revenue:0, profit:0 } };
      const stats = {
        id: r.id, title: r.title,
        vertical: r.vertical, route: r.route, carrier: r.carrier, data_partner: r.data_partner, data_list: r.data_list,
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

// OS breakdown for a single offer within a campaign
router.get('/campaigns/:id/offers/:offerId/os', async (req, res) => {
  try {
    const { id, offerId } = req.params;
    const today    = new Date().toISOString().slice(0, 10);
    const dateFrom = req.query.date_from || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const dateTo   = req.query.date_to   || today;

    // OS data is aggregated (no per-day breakdown from RedTrack API) — no date filter
    const { rows } = await pool.query(`
      SELECT os,
        COALESCE(SUM(clicks),0)::int            AS clicks,
        COALESCE(SUM(conversions),0)::int       AS conversions,
        COALESCE(SUM(cost),0)::numeric(14,2)    AS cost,
        COALESCE(SUM(revenue),0)::numeric(14,2) AS revenue,
        COALESCE(SUM(profit),0)::numeric(14,2)  AS profit
      FROM rt_offer_os_stats
      WHERE campaign_id=$1 AND offer_id=$2
      GROUP BY os ORDER BY SUM(clicks) DESC
    `, [id, offerId]);

    res.json(rows.map((r) => ({
      os:          r.os,
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

// Compare the new report's data against the previous one — surfaces buyer profit
// swings and whether last report's top "scale" / "cut" calls were actually followed.
function buildReportDiff(previous, combos, buyerRows) {
  if (!previous?.data_json) return null;
  const prev = previous.data_json;
  const daysSince = previous.generated_at
    ? Math.round((Date.now() - new Date(previous.generated_at).getTime()) / 86400000)
    : null;
  const key = (r) => `${r.vertical}|${r.carrier}|${r.route}`;

  const lines = [];

  const prevBuyers = Object.fromEntries((prev.buyers || []).map((b) => [b.buyer, b]));
  for (const b of buyerRows) {
    const p = prevBuyers[b.buyer];
    if (!p || Number(p.profit) === 0) continue;
    const pct = ((Number(b.profit) - Number(p.profit)) / Math.abs(Number(p.profit))) * 100;
    if (Math.abs(pct) >= 15) {
      lines.push(`${b.buyer} profit ${pct >= 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(0)}% vs last report ($${p.profit} → $${b.profit}).`);
    }
  }

  // Did last report's top scale picks actually get scaled?
  for (const p of (prev.combinations || []).slice(0, 3)) {
    const cur = combos.find((c) => key(c) === key(p));
    if (!cur) {
      lines.push(`Last report's scale pick ${p.vertical}|${p.route}|${p.carrier} (was $${p.profit} profit) dropped out of the top 60 — check if it's still running.`);
      continue;
    }
    const prevClicks = Number(p.clicks), curClicks = Number(cur.clicks);
    if (prevClicks <= 0) continue;
    const clickChange = ((curClicks - prevClicks) / prevClicks) * 100;
    if (clickChange >= 30) {
      lines.push(`Scale call followed: ${p.vertical}|${p.route}|${p.carrier} clicks up ${clickChange.toFixed(0)}%, now $${cur.profit} profit.`);
    } else if (clickChange <= -20) {
      lines.push(`Scale call NOT followed: ${p.vertical}|${p.route}|${p.carrier} clicks down ${Math.abs(clickChange).toFixed(0)}% instead of scaling.`);
    }
  }

  // Did last report's flagged losers get cut?
  for (const p of (prev.combinations || []).filter((c) => Number(c.profit) < 0).slice(-3)) {
    const cur = combos.find((c) => key(c) === key(p));
    if (!cur) {
      lines.push(`Cut call followed: ${p.vertical}|${p.route}|${p.carrier} (was -$${Math.abs(p.profit)}) no longer appears — looks paused.`);
    } else if (Number(p.clicks) > 0 && Number(cur.clicks) > Number(p.clicks) * 0.8) {
      lines.push(`Cut call NOT followed: ${p.vertical}|${p.route}|${p.carrier} still running at similar volume, now $${cur.profit} profit.`);
    }
  }

  if (!lines.length) return null;
  return { daysSince, lines };
}

// Core AI report generation — callable from the route handler or the weekly auto-trigger.
// In-memory generation status — avoids concurrent runs and lets the frontend poll
const ALL_PERIODS = [7, 14, 30, 60, 90, 180];
const aiStatus = {
  campaign: { running: false, error: null, startedAt: null, currentPeriod: null, completedPeriods: [] },
  list:     { running: false, error: null, startedAt: null },
};

async function generateAIReport(days) {
    const today    = new Date().toISOString().slice(0, 10);
    const dateFrom = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    // Snapshot the current "latest" row before it gets overwritten — this is the diff baseline.
    const { rows: previousRows } = await pool.query(`SELECT generated_at, data_json FROM rt_ai_report WHERE id = 1`);
    const previous = previousRows[0] || null;

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

    // OS performance — offer × iOS/Android comparison (only if OS sync has run)
    const { rows: osRows } = await pool.query(`
      SELECT
        o.name                                                              AS offer,
        oos.os,
        c.buyer,
        COALESCE(SUM(oos.clicks),0)::int                                   AS clicks,
        COALESCE(SUM(oos.conversions),0)::int                              AS conversions,
        COALESCE(SUM(oos.cost),0)::numeric(14,2)                           AS cost,
        COALESCE(SUM(oos.revenue),0)::numeric(14,2)                        AS revenue,
        COALESCE(SUM(oos.profit),0)::numeric(14,2)                         AS profit,
        CASE WHEN SUM(oos.cost) > 0
             THEN ROUND(((SUM(oos.revenue)-SUM(oos.cost))/SUM(oos.cost))*100,1)
             ELSE 0 END                                                    AS roi
      FROM rt_offer_os_stats oos
      JOIN rt_offers o    ON o.id = oos.offer_id
      JOIN rt_campaigns c ON c.id = oos.campaign_id
      WHERE c.buyer IS NOT NULL
        AND oos.os IN ('iOS', 'Android')
      GROUP BY o.name, oos.os, c.buyer
      HAVING SUM(oos.clicks) > 30
      ORDER BY SUM(oos.profit) DESC
      LIMIT 40
    `);
    const hasOsData = osRows.length > 0;

    // List performance is handled separately by generateListReport — not included here

    // Per-buyer top and bottom combos (vertical × route × carrier)
    const { rows: buyerComboRows } = await pool.query(`
      SELECT
        c.buyer,
        COALESCE(c.vertical, 'Unknown')      AS vertical,
        COALESCE(c.carrier,  'All carriers') AS carrier,
        COALESCE(c.route,    'Unknown')      AS route,
        COALESCE(SUM(s.clicks),0)::int                                      AS clicks,
        COALESCE(SUM(s.profit),0)::numeric(14,2)                            AS profit,
        CASE WHEN SUM(s.cost) > 0
             THEN ROUND(((SUM(s.revenue)-SUM(s.cost))/SUM(s.cost))*100,1)
             ELSE 0 END                                                      AS roi
      FROM rt_campaigns c
      JOIN rt_campaign_stats s ON s.campaign_id = c.id
      WHERE c.buyer IS NOT NULL AND s.stat_date BETWEEN $1 AND $2
      GROUP BY c.buyer, c.vertical, c.carrier, c.route
      HAVING SUM(s.clicks) > 30
      ORDER BY c.buyer, SUM(s.profit) DESC
    `, [dateFrom, today]);

    const BUYERS = ['TK', 'MA', 'DS'];

    const dataJson = {
      period_days: days, date_from: dateFrom, date_to: today,
      combinations: combos, buyers: buyerRows, offer_combinations: offerRows,
      os_combinations: osRows,
    };

    // Build compact iOS vs Android comparison for prompt
    const osPromptSection = (() => {
      if (!hasOsData) return '';
      const offerMap = {};
      for (const r of osRows) {
        if (!offerMap[r.offer]) offerMap[r.offer] = { buyer: r.buyer };
        offerMap[r.offer][r.os] = r;
      }
      const epc = (r) => Number(r.clicks) > 0 ? (Number(r.revenue) / Number(r.clicks)).toFixed(4) : '0';
      const lines = Object.entries(offerMap).map(([offer, v]) => {
        const ios = v['iOS'];
        const and = v['Android'];
        const iosStr = ios ? `iOS: EPC:$${epc(ios)} $${ios.profit}* ROI:${ios.roi}%* (${ios.clicks} clicks)` : 'iOS: no data';
        const andStr = and ? `Android: EPC:$${epc(and)} $${and.profit}* ROI:${and.roi}%* (${and.clicks} clicks)` : 'Android: no data';
        return `"${offer}" (${v.buyer}) → ${iosStr} | ${andStr}`;
      });
      return `\nOS BREAKDOWN — iOS vs Android per offer (EPC = revenue/click, directly reported; *profit/ROI are estimates, cost is prorated):\n${lines.join('\n')}`;
    })();

    // Build prompt tables
    const comboTable = combos.slice(0, 40).map((r, i) =>
      `${i+1}. ${r.vertical} | ${r.carrier} | ${r.route} | Clicks:${r.clicks} | Conv:${r.conversions} | Profit:$${r.profit} | ROI:${r.roi}%`
    ).join('\n');

    const buyerTable = buyerRows.map((r) =>
      `${r.buyer}: Clicks:${r.clicks} | Spend:$${r.cost} | Revenue:$${r.revenue} | Profit:$${r.profit}`
    ).join('\n');

    const offerTable = offerRows.slice(0, 60).map((r, i) => {
      const epc = Number(r.clicks) > 0 ? (Number(r.revenue) / Number(r.clicks)).toFixed(4) : '0';
      return `${i+1}. "${r.offer}" | ${r.vertical} | ${r.route} | ${r.carrier} | Partner:${r.data_partner} | Buyer:${r.buyer} | Clicks:${r.clicks} | Conv:${r.conversions} | EPC:$${epc} | Profit:$${r.profit}* | ROI:${r.roi}%*`;
    }).join('\n');


    const diff = buildReportDiff(previous, combos, buyerRows);
    dataJson.changes_since_last = diff;
    const diffSection = diff
      ? `\nCHANGES SINCE LAST REPORT (${diff.daysSince} day${diff.daysSince === 1 ? '' : 's'} ago):\n${diff.lines.join('\n')}\n`
      : '';

    // Per-buyer combo summaries (top 5 + bottom 3 per buyer)
    const buyerComboSections = BUYERS.map((buyer) => {
      const rows = buyerComboRows.filter((r) => r.buyer === buyer);
      if (!rows.length) return `${buyer}: no data`;
      const top = rows.slice(0, 10).map((r) =>
        `  + ${r.vertical} | ${r.route} | ${r.carrier} → Profit:$${r.profit} ROI:${r.roi}%`
      ).join('\n');
      const bottom = [...rows].reverse().slice(0, 5)
        .filter((r) => Number(r.profit) < 0)
        .map((r) => `  - ${r.vertical} | ${r.route} | ${r.carrier} → Profit:$${r.profit} ROI:${r.roi}%`)
        .join('\n');
      const buyerRow = buyerRows.find((b) => b.buyer === buyer);
      const summary = buyerRow
        ? `Clicks:${buyerRow.clicks} | Spend:$${buyerRow.cost} | Profit:$${buyerRow.profit}`
        : '';
      return `${buyer} (${summary})\nTop combos:\n${top}${bottom ? `\nLosing:\n${bottom}` : ''}`;
    }).join('\n\n');

    const prompt = `You are a performance marketing analyst for an SMS media buying team. Your ONLY goal is to maximize profit and ROI. Be brutally honest — if something is losing money, say so. If something is printing money, say scale it.

The team has 3 media buyers: TK (Toby), MA (Martina), DS (Duran). They control which OFFERS to run, which ROUTES (USMS, Ranhog, Internal, TechStar), CARRIERS (Verizon, AT&T, T-Mobile), DATA PARTNERS (LM, JC, AVANTO, UPSTART, KOINO), and OS TARGETING (iOS-only vs Android vs all). Budget follows performance. Always refer to buyers by their initials (TK, MA, DS) — never expand to full names in tables or headings.

Data for the last ${days} days (${dateFrom} to ${today}):

OVERALL COMBINATIONS — vertical × carrier × route (sorted by profit):
${comboTable}
${hasOfferData ? `
OFFER PERFORMANCE — offer × route × carrier × partner × buyer (sorted by profit). EPC (revenue/click) is directly reported by RedTrack and fully trustworthy. Profit/ROI marked with * are estimates only — RedTrack doesn't track cost per offer, so cost is allocated by click share within each campaign; treat EPC as the primary signal and */profit as directional support, not gospel:
${offerTable}
` : ''}${osPromptSection}
${diffSection}
PER-BUYER BREAKDOWN:
${buyerComboSections}

FORMAT RULES:
- Output every section as a markdown table. No bullet points, no paragraphs.
- Each field must have its own dedicated column — never combine multiple values in one cell.
- COLUMN ORDER IS STRICT — fill every column in the exact order shown in the header, even if you write "N/A" or "—".
- Buyer column = ALWAYS one of: TK, MA, DS (or "TK+MA" if shared). Never put a carrier or route name in the Buyer column.
- No annotations or extra context in parentheses inside cells (e.g. "(LM)", "(DS)", "(TK)"). Put that info in the Note/Action column.
- Be thorough — never truncate. If 12 rows are warranted, write 12 rows.
- CONFIDENCE RULE: Only write "Scale immediately" for combos with 30+ conversions. Below 30 conv write "Test" in the Action column.
${diff ? '- If CHANGES SINCE LAST REPORT shows a call was ignored, note it in the Action column.' : ''}

## 💰 Best Combinations to Scale
Every combo worth scaling (30+ conversions). One row per combo. ${hasOsData ? 'Note iOS-only opportunity in the Action column where iOS EPC significantly beats Android.' : ''}
STRICT column order — Buyer must be TK/MA/DS, never a carrier name.
| ${hasOfferData ? 'Offer' : 'Vertical'} | Buyer | Route | Carrier | EPC | ROI | Conv | Action |
|---|---|---|---|---|---|---|---|

## 🔴 Cut Immediately
Every losing combo. One row per combo — no omissions. Buyer = TK/MA/DS only.
| Vertical/Offer | Buyer | Route | Carrier | Loss ($) | Action |
|---|---|---|---|---|---|

## 🔁 Budget Reallocation
One row per move. Buyer = TK/MA/DS only. No annotations in parentheses.
| From Vertical/Offer | From Route | From Carrier | To Vertical/Offer | To Route | To Carrier | Buyer | Why |
|---|---|---|---|---|---|---|---|

## 📡 Route & Carrier Intelligence
One row per route or carrier. Type = "Route" or "Carrier".
| Type | Name | Avg EPC | ROI | Trend | Note |
|---|---|---|---|---|---|

## 🤝 Partner & Offer Analysis
One row per offer. Buyer = TK/MA/DS only.
| Offer | Partner | Buyer | EPC | ROI | Verdict |
|---|---|---|---|---|---|

## 🧪 Highest-Upside Tests
One row per test. Buyer = TK/MA/DS only.
| Offer/Vertical | Buyer | Route | Carrier | Target EPC | Rationale |
|---|---|---|---|---|---|

---

## 👤 TK
One row per action. This team creates new campaigns — recommend specific new setups. Action Type = Scale / Cut / Test / Launch.
| Action Type | Offer/Vertical | Route | Carrier | Key Metric | Note |
|---|---|---|---|---|---|

## 👤 MA
Same format. Action Type = Scale / Cut / Test / Launch.
| Action Type | Offer/Vertical | Route | Carrier | Key Metric | Note |
|---|---|---|---|---|---|

## 👤 DS
Same format. Action Type = Scale / Cut / Test / Launch.
| Action Type | Offer/Vertical | Route | Carrier | Key Metric | Note |
|---|---|---|---|---|---|`;



    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const MODEL = 'claude-sonnet-4-6';
    const first = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    });

    let content = first.content[0].text;

    if (first.stop_reason === 'max_tokens') {
      console.warn('[ai] response hit max_tokens — continuing...');
      const second = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4000,
        messages: [
          { role: 'user', content: prompt },
          { role: 'assistant', content },
          { role: 'user', content: 'Continue exactly where you left off.' },
        ],
      });
      content += second.content[0].text;
    }

    const generatedAt = new Date();

    await pool.query(`
      INSERT INTO rt_ai_report (id, generated_at, period_days, content, data_json)
      VALUES (1, $1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET generated_at=$1, period_days=$2, content=$3, data_json=$4
    `, [generatedAt, days, content, JSON.stringify(dataJson)]);

    await pool.query(`
      INSERT INTO rt_ai_report_history (generated_at, period_days, content, data_json)
      VALUES ($1, $2, $3, $4)
    `, [generatedAt, days, content, JSON.stringify(dataJson)]);

    return { generated_at: generatedAt, period_days: days, content, data_json: dataJson };
}

// POST generate campaign reports for all periods sequentially — fire-and-forget
router.post('/ai-recommendations/generate', (req, res) => {
  if (aiStatus.campaign.running) return res.status(202).json({ status: 'already_running' });
  aiStatus.campaign.running          = true;
  aiStatus.campaign.error            = null;
  aiStatus.campaign.startedAt        = new Date();
  aiStatus.campaign.currentPeriod    = null;
  aiStatus.campaign.completedPeriods = [];
  res.status(202).json({ status: 'started', periods: ALL_PERIODS });

  (async () => {
    for (const days of ALL_PERIODS) {
      aiStatus.campaign.currentPeriod = days;
      await generateAIReport(days);
      aiStatus.campaign.completedPeriods.push(days);
      console.log(`[ai] ${days}d report done (${aiStatus.campaign.completedPeriods.length}/${ALL_PERIODS.length})`);
    }
    aiStatus.campaign.running       = false;
    aiStatus.campaign.currentPeriod = null;
    console.log('[ai] All campaign reports done');
  })().catch((err) => {
    aiStatus.campaign.running       = false;
    aiStatus.campaign.currentPeriod = null;
    aiStatus.campaign.error         = err.message;
    console.error('[ai] Campaign report error:', err.message);
  });
});

// GET campaign generation status
router.get('/ai-recommendations/status', (_req, res) => {
  res.json(aiStatus.campaign);
});

// GET report history (for diffing/inspection)
router.get('/ai-recommendations/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const { rows } = await pool.query(
      `SELECT id, generated_at, period_days FROM rt_ai_report_history ORDER BY generated_at DESC LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET a single past report's full content (for the history viewer dropdown)
router.get('/ai-recommendations/history/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, generated_at, period_days, content, data_json FROM rt_ai_report_history WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Report not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── AI List Intelligence ─────────────────────────────────────────────────────

async function generateListReport() {
  // Query all-time list performance + recent 30-day trend
  const { rows: listRows } = await pool.query(`
    SELECT
      c.data_list                                                              AS list_key,
      ARRAY_AGG(DISTINCT c.buyer ORDER BY c.buyer)                            AS buyers,
      ARRAY_AGG(DISTINCT c.carrier)                                           AS carriers,
      COUNT(DISTINCT c.id)::int                                               AS campaign_count,
      COALESCE(SUM(cs.clicks),0)::int                                         AS clicks,
      COALESCE(SUM(cs.conversions),0)::int                                    AS conversions,
      ROUND(SUM(cs.revenue)::numeric,2)                                       AS revenue,
      ROUND(SUM(cs.profit)::numeric,2)                                        AS profit,
      CASE WHEN SUM(cs.clicks) > 0
           THEN ROUND(SUM(cs.revenue)::numeric/SUM(cs.clicks),4) ELSE 0
           END                                                                AS epc,
      CASE WHEN SUM(cs.cost) > 0
           THEN ROUND(SUM(cs.profit)::numeric/SUM(cs.cost)*100,1) ELSE 0
           END                                                                AS roi,
      -- recent 30-day EPC
      CASE WHEN SUM(CASE WHEN cs.stat_date >= CURRENT_DATE - 30 THEN cs.clicks ELSE 0 END) > 0
           THEN ROUND(
             SUM(CASE WHEN cs.stat_date >= CURRENT_DATE - 30 THEN cs.revenue ELSE 0 END)::numeric /
             SUM(CASE WHEN cs.stat_date >= CURRENT_DATE - 30 THEN cs.clicks  ELSE 0 END), 4)
           ELSE 0 END                                                         AS epc_recent,
      SUM(CASE WHEN cs.stat_date >= CURRENT_DATE - 30 THEN cs.clicks ELSE 0 END)::int
                                                                              AS clicks_recent,
      EXTRACT(DAY FROM NOW() - MAX(c.created_at::timestamptz))::int          AS days_since_last_use,
      MIN(c.created_at)                                                       AS first_used,
      MAX(c.created_at)                                                       AS last_used
    FROM rt_campaigns c
    JOIN rt_campaign_stats cs ON cs.campaign_id = c.id
    WHERE c.data_list IS NOT NULL
    GROUP BY c.data_list
    HAVING SUM(cs.clicks) > 100
    ORDER BY SUM(cs.profit) DESC
  `);

  if (listRows.length === 0) {
    throw new Error('No list data available yet — run a sync first.');
  }

  // Build prompt table
  const listTable = listRows.map((r, i) => {
    const trend = Number(r.clicks_recent) > 100
      ? ` | RecentEPC:$${r.epc_recent}`
      : ' | RecentEPC:insufficient data';
    const epcDelta = Number(r.clicks_recent) > 100 && Number(r.epc) > 0
      ? ` (${Number(r.epc_recent) >= Number(r.epc) ? '↑' : '↓'}${Math.abs(((Number(r.epc_recent) - Number(r.epc)) / Number(r.epc)) * 100).toFixed(0)}% vs all-time)`
      : '';
    return `${i+1}. "${r.list_key}" | Buyers:${(r.buyers||[]).join('+')} | Campaigns:${r.campaign_count} | AllTimeEPC:$${r.epc}${trend}${epcDelta} | Profit:$${r.profit} | ROI:${r.roi}% | IdleDays:${r.days_since_last_use}`;
  }).join('\n');

  const prompt = `You are a data list performance analyst for an SMS media buying team. Your job is to tell the media buyers (TK, MA, DS) exactly which data lists to use next, which to rest, and which to retire — with specific reasoning backed by numbers.

CONTEXT: Media buyers create new SMS campaigns using specific data lists (named audience batches). A list's performance can change over time due to audience fatigue or seasonal patterns. Best practice: if a list's recent EPC has dropped significantly vs its all-time EPC, rest it 3-4 weeks before retesting. If a list has been idle 28+ days and had good historical ROI, it's a candidate for retest.

DATA: ${listRows.length} lists tracked, all-time stats + recent 30-day trend.
Columns: list name | buyers who used it | campaigns run | all-time EPC | recent EPC (↑/↓ vs all-time) | total profit | ROI | days idle

${listTable}

FORMAT RULES:
- Output every section as a markdown table. No bullets, no paragraphs.
- Never truncate — if 15 lists deserve a row, write 15 rows.
- Use the exact list name in every row.
- Do not repeat the same list across multiple sections.

## 👤 TK — Priority List Queue
Every list TK should queue next, in priority order.
| List | Idle Days | All-time EPC | ROI | Carrier | Priority | Note |
|---|---|---|---|---|---|---|

## 👤 MA — Priority List Queue
Same format for MA.
| List | Idle Days | All-time EPC | ROI | Carrier | Priority | Note |
|---|---|---|---|---|---|---|

## 👤 DS — Priority List Queue
Same format for DS.
| List | Idle Days | All-time EPC | ROI | Carrier | Priority | Note |
|---|---|---|---|---|---|---|

## ✅ Reuse Now
All lists idle 28+ days with ROI > 30%. Be exhaustive.
| List | Buyer | Idle Days | All-time EPC | Recent EPC | ROI | Note |
|---|---|---|---|---|---|---|

## 🔁 Still Performing — Keep Running
All active lists (idle < 14d) with positive ROI.
| List | Buyer | EPC | 30d EPC Trend | ROI | Note |
|---|---|---|---|---|---|

## ⚠️ Degrading — Pull and Rest
Lists where recent EPC dropped >15% vs all-time, or ROI has gone negative.
| List | Buyer | All-time EPC | Recent EPC | Drop % | Rest Duration |
|---|---|---|---|---|---|

## 📊 Partner List Rankings
| Partner | Avg EPC | Avg ROI | # Lists Tracked | Verdict |
|---|---|---|---|---|

## ❌ Retire
| List | Buyer | All-time ROI | Reason |
|---|---|---|---|`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const first = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 6000,
    messages: [{ role: 'user', content: prompt }],
  });

  let content = first.content[0].text;

  if (first.stop_reason === 'max_tokens') {
    console.warn('[ai-list] hit max_tokens — continuing...');
    const second = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4000,
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content },
        { role: 'user', content: 'Continue exactly where you left off.' },
      ],
    });
    content += second.content[0].text;
  }
  const generatedAt = new Date();
  const dataJson = { lists: listRows, generated_at: generatedAt };

  await pool.query(`
    INSERT INTO rt_ai_list_report (id, generated_at, content, data_json)
    VALUES (1, $1, $2, $3)
    ON CONFLICT (id) DO UPDATE SET generated_at=$1, content=$2, data_json=$3
  `, [generatedAt, content, JSON.stringify(dataJson)]);

  await pool.query(`
    INSERT INTO rt_ai_list_report_history (generated_at, content, data_json)
    VALUES ($1, $2, $3)
  `, [generatedAt, content, JSON.stringify(dataJson)]);

  return { generated_at: generatedAt, content, data_json: dataJson };
}

router.get('/ai-list', async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, generated_at, content, data_json FROM rt_ai_list_report WHERE id = 1`);
    if (!rows[0]) return res.json(null);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST generate list AI report — fire-and-forget
router.post('/ai-list/generate', (_req, res) => {
  if (aiStatus.list.running) return res.status(202).json({ status: 'already_running' });
  aiStatus.list.running = true;
  aiStatus.list.error   = null;
  aiStatus.list.startedAt = new Date();
  res.status(202).json({ status: 'started' });
  generateListReport()
    .then(() => { aiStatus.list.running = false; console.log('[ai] List report done'); })
    .catch((err) => { aiStatus.list.running = false; aiStatus.list.error = err.message; console.error('[ai] List report error:', err.message); });
});

// GET list generation status
router.get('/ai-list/status', (_req, res) => {
  res.json(aiStatus.list);
});

router.get('/ai-list/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const { rows } = await pool.query(
      `SELECT id, generated_at FROM rt_ai_list_report_history ORDER BY generated_at DESC LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/ai-list/history/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, generated_at, content, data_json FROM rt_ai_list_report_history WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
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
        // RedTrack /report with group=offer,os returns aggregated totals (no date field) — no time_interval support
        await throttleRedtrack();
        const { data: report } = await redtrack.get('/report', {
          params: { campaign_id: c.id, group: 'offer,os', date_from: dateFrom, date_to: dateTo, per: 1000 },
        });
        const rows = Array.isArray(report) ? report : (report?.items || []);

        if (rows.length === 0) { offerSync.processed = i + 1; continue; }

        // Register offers from response (FK constraint on rt_offer_os_stats)
        const seenOffers = new Set();
        for (const row of rows) {
          if (row.offer_id && row.offer && !seenOffers.has(row.offer_id)) {
            seenOffers.add(row.offer_id);
            await pool.query(`INSERT INTO rt_offers (id, name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name=$2`, [row.offer_id, row.offer]);
            await pool.query(`INSERT INTO rt_campaign_offers (campaign_id, offer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [c.id, row.offer_id]);
          }
        }

        // Campaign total cost over the period (for proration)
        const { rows: campTotals } = await pool.query(
          `SELECT COALESCE(SUM(cost),0) AS total_cost, COALESCE(SUM(clicks),0) AS total_clicks
           FROM rt_campaign_stats WHERE campaign_id=$1 AND stat_date BETWEEN $2 AND $3`,
          [c.id, dateFrom, dateTo]
        );
        const campaignTotalCost   = Number(campTotals[0]?.total_cost   || 0);
        const campaignTotalClicks = Number(campTotals[0]?.total_clicks || 0);

        // Build offer → { clicks, conversions, revenue, byOs }
        const offerMap = {};
        for (const row of rows) {
          if (!row.offer_id) continue;
          const os = row.os || 'Unknown';
          if (!offerMap[row.offer_id]) offerMap[row.offer_id] = { clicks: 0, conversions: 0, revenue: 0, byOs: {} };
          const od = offerMap[row.offer_id];
          od.clicks      += row.clicks      || 0;
          od.conversions += row.conversions || 0;
          od.revenue     += row.revenue     || 0;
          if (!od.byOs[os]) od.byOs[os] = { clicks: 0, conversions: 0, revenue: 0 };
          od.byOs[os].clicks      += row.clicks      || 0;
          od.byOs[os].conversions += row.conversions || 0;
          od.byOs[os].revenue     += row.revenue     || 0;
        }

        const totalOfferClicks = Object.values(offerMap).reduce((a, v) => a + v.clicks, 0);

        // Replace offer/OS stats for this campaign with fresh aggregated data
        // (RedTrack returns a single aggregated total, not per-day rows, so each
        // sync run must overwrite — not append — or totals accumulate across runs)
        await pool.query(`DELETE FROM rt_offer_os_stats WHERE campaign_id=$1`, [c.id]);
        await pool.query(`DELETE FROM rt_offer_stats    WHERE campaign_id=$1`, [c.id]);

        for (const [offerId, od] of Object.entries(offerMap)) {
          const offerShare  = totalOfferClicks > 0 ? od.clicks / totalOfferClicks : 1 / Object.keys(offerMap).length;
          const offerCost   = campaignTotalCost * offerShare;
          const offerProfit = od.revenue - offerCost;

          // Update offer-level stats (aggregated row per offer)
          await pool.query(
            `INSERT INTO rt_offer_stats (offer_id, campaign_id, stat_date, clicks, conversions, cost, revenue, profit)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [offerId, c.id, dateTo, od.clicks, od.conversions, offerCost, od.revenue, offerProfit]
          );

          for (const [os, osd] of Object.entries(od.byOs)) {
            const osShare  = od.clicks > 0 ? osd.clicks / od.clicks : 1 / Object.keys(od.byOs).length;
            const osCost   = offerCost * osShare;
            const osProfit = osd.revenue - osCost;
            await pool.query(
              `INSERT INTO rt_offer_os_stats (offer_id, campaign_id, stat_date, os, clicks, conversions, cost, revenue, profit)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [offerId, c.id, dateTo, os, osd.clicks, osd.conversions, osCost, osd.revenue, osProfit]
            );
          }
        }
      } catch (err) { console.warn(`[offer-sync] campaign ${c.id} skipped: ${err.message}`); }

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

// Live test: try different group param formats to find what RedTrack accepts
router.get('/sync/offers/test', async (req, res) => {
  try {
    const forcedId = req.query.campaign_id;
    const { rows: campaigns } = forcedId
      ? await pool.query(`SELECT id, title FROM rt_campaigns WHERE id=$1`, [forcedId])
      : await pool.query(
          `SELECT c.id, c.title, SUM(s.revenue) AS rev
           FROM rt_campaigns c JOIN rt_campaign_stats s ON s.campaign_id = c.id
           WHERE c.buyer IS NOT NULL
           GROUP BY c.id, c.title HAVING SUM(s.revenue) > 0
           ORDER BY rev DESC LIMIT 1`
        );
    if (!campaigns.length) return res.json({ error: 'no campaigns found' });
    const c = campaigns[0];
    const today   = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const base    = { campaign_id: c.id, date_from: weekAgo, date_to: today, per: 3 };

    const attempts = [
      { label: 'group=offer,os (no time_interval)',   params: { ...base, group: 'offer,os' } },
      { label: 'group=offer (no os, no time_interval)', params: { ...base, group: 'offer' } },
      { label: 'group=offer,os + time_interval=day',  params: { ...base, group: 'offer,os', time_interval: 'day' } },
    ];

    const results = [];
    for (const attempt of attempts) {
      await throttleRedtrack();
      try {
        const { data } = await redtrack.get('/report', { params: attempt.params });
        const rows = Array.isArray(data) ? data : (data?.items || []);
        results.push({ label: attempt.label, status: 200, row_count: rows.length, first_row_keys: rows[0] ? Object.keys(rows[0]) : [] });
      } catch (err) {
        results.push({ label: attempt.label, status: err.response?.status || 'ERR', error: err.message });
      }
    }
    res.json({ campaign_id: c.id, campaign_title: c.title, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// OS data diagnostic
router.get('/sync/offers/debug', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int                          AS total_rows,
        COUNT(DISTINCT campaign_id)::int       AS campaigns,
        COUNT(DISTINCT offer_id)::int          AS offers,
        COUNT(DISTINCT os)::int                AS os_types,
        MIN(stat_date)::text                   AS earliest,
        MAX(stat_date)::text                   AS latest,
        array_agg(DISTINCT os ORDER BY os)     AS os_values
      FROM rt_offer_os_stats
    `);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Offer performance report
// GET /reports/lists — per-list performance aggregated across all campaigns
// One-time backfill: parse data_list from existing campaign titles
router.post('/lists/backfill', async (req, res) => {
  try {
    const { rows: vRows } = await pool.query(`SELECT value FROM list_items WHERE list = 'vertical'`);
    const knownVerticals = new Set(vRows.map(r => r.value.toUpperCase()));
    const { rows: rRows } = await pool.query(`SELECT value FROM list_items WHERE list = 'route'`);
    const knownRoutes = new Map(rRows.map(r => [r.value.toUpperCase(), r.value]));

    const { rows: campaigns } = await pool.query(`SELECT id, title FROM rt_campaigns WHERE data_list IS NULL`);
    let updated = 0;
    for (const c of campaigns) {
      const { listKey, listLastUsed } = parseListFromTitle(c.title, knownRoutes, knownVerticals);
      if (listKey) {
        await pool.query(
          `UPDATE rt_campaigns SET data_list=$1, list_last_used=$2 WHERE id=$3`,
          [listKey, listLastUsed || null, c.id]
        );
        updated++;
      }
    }
    res.json({ total: campaigns.length, updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /reports/lists/campaigns?list_key=... — all campaigns for a list, last 30d stats, oldest first
router.get('/lists/campaigns', async (req, res) => {
  try {
    const listKey = req.query.list_key;
    if (!listKey) return res.status(400).json({ error: 'list_key required' });

    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), MAX_HISTORY_DAYS);

    const { rows } = await pool.query(`
      SELECT
        c.id,
        c.title,
        c.buyer,
        c.route,
        c.carrier,
        c.vertical,
        c.created_at,
        c.list_last_used,
        COALESCE(SUM(cs.clicks),0)::int                        AS clicks,
        COALESCE(SUM(cs.conversions),0)::int                   AS conversions,
        ROUND(COALESCE(SUM(cs.revenue),0)::numeric, 2)         AS revenue,
        ROUND(COALESCE(SUM(cs.cost),0)::numeric, 2)            AS cost,
        ROUND(COALESCE(SUM(cs.profit),0)::numeric, 2)          AS profit,
        CASE WHEN SUM(cs.clicks) > 0
             THEN ROUND(SUM(cs.revenue)::numeric / SUM(cs.clicks), 4)
             ELSE 0 END                                        AS epc
      FROM rt_campaigns c
      LEFT JOIN rt_campaign_stats cs
        ON cs.campaign_id = c.id
        AND cs.stat_date >= CURRENT_DATE - ($2 || ' days')::interval
      WHERE c.data_list = $1
      GROUP BY c.id, c.title, c.buyer, c.route, c.carrier, c.vertical, c.created_at, c.list_last_used
      ORDER BY c.created_at ASC
    `, [listKey, days]);

    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /reports/lists/daily?list_key=... — day-by-day breakdown for one list
router.get('/lists/daily', async (req, res) => {
  try {
    const listKey = req.query.list_key;
    if (!listKey) return res.status(400).json({ error: 'list_key required' });

    const { rows } = await pool.query(`
      SELECT
        cs.stat_date,
        ARRAY_AGG(DISTINCT c.buyer)             AS buyers,
        COUNT(DISTINCT c.id)::int               AS campaigns,
        SUM(cs.clicks)::int                     AS clicks,
        SUM(cs.conversions)::int                AS conversions,
        ROUND(SUM(cs.revenue)::numeric, 2)      AS revenue,
        ROUND(SUM(cs.cost)::numeric, 2)         AS cost,
        ROUND(SUM(cs.profit)::numeric, 2)       AS profit,
        CASE WHEN SUM(cs.clicks) > 0
             THEN ROUND(SUM(cs.revenue)::numeric / SUM(cs.clicks), 4)
             ELSE 0 END                         AS epc
      FROM rt_campaigns c
      JOIN rt_campaign_stats cs ON cs.campaign_id = c.id
      WHERE c.data_list = $1
      GROUP BY cs.stat_date
      ORDER BY cs.stat_date DESC
    `, [listKey]);

    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/lists', async (req, res) => {
  try {
    const buyer   = req.query.buyer   || null;
    const route   = req.query.route   || null;
    const carrier = req.query.carrier || null;

    const conditions = [`c.data_list IS NOT NULL`];
    const params = [];
    if (buyer)   { params.push(buyer);   conditions.push(`c.buyer = $${params.length}`); }
    if (route)   { params.push(route);   conditions.push(`c.route = $${params.length}`); }
    if (carrier) { params.push(carrier); conditions.push(`c.carrier = $${params.length}`); }

    const where = conditions.join(' AND ');

    const { rows } = await pool.query(`
      SELECT
        c.data_list                                              AS list_key,
        COUNT(DISTINCT c.id)                                     AS campaign_count,
        ARRAY_AGG(DISTINCT c.buyer)                             AS buyers,
        ARRAY_AGG(DISTINCT c.carrier)                           AS carriers,
        MIN(c.created_at)                                        AS first_used,
        MAX(c.created_at)                                        AS last_used,
        SUM(cs.clicks)                                           AS clicks,
        SUM(cs.conversions)                                      AS conversions,
        ROUND(SUM(cs.revenue)::numeric, 2)                       AS revenue,
        ROUND(SUM(cs.cost)::numeric, 2)                         AS cost,
        ROUND(SUM(cs.profit)::numeric, 2)                       AS profit,
        CASE WHEN SUM(cs.clicks) > 0
             THEN ROUND(SUM(cs.revenue)::numeric / SUM(cs.clicks), 4)
             ELSE 0 END                                         AS epc,
        CASE WHEN SUM(cs.cost) > 0
             THEN ROUND(SUM(cs.profit)::numeric / SUM(cs.cost) * 100, 2)
             ELSE 0 END                                         AS roi,
        -- EPC for campaigns whose stats are within the last 30 days
        CASE WHEN SUM(CASE WHEN cs.stat_date >= CURRENT_DATE - INTERVAL '30 days'
                           THEN cs.clicks ELSE 0 END) > 0
             THEN ROUND(
               SUM(CASE WHEN cs.stat_date >= CURRENT_DATE - INTERVAL '30 days' THEN cs.revenue ELSE 0 END)::numeric /
               SUM(CASE WHEN cs.stat_date >= CURRENT_DATE - INTERVAL '30 days' THEN cs.clicks  ELSE 0 END),
               4)
             ELSE 0 END                                         AS epc_recent,
        SUM(CASE WHEN cs.stat_date >= CURRENT_DATE - INTERVAL '30 days'
                 THEN cs.clicks ELSE 0 END)                     AS clicks_recent,
        -- days since last campaign using this list was created
        EXTRACT(DAY FROM NOW() - MAX(c.created_at::timestamptz))::int AS days_since_last_use
      FROM rt_campaigns c
      JOIN rt_campaign_stats cs ON cs.campaign_id = c.id
      WHERE ${where}
      GROUP BY c.data_list
      HAVING SUM(cs.clicks) > 100
      ORDER BY SUM(cs.profit) DESC
    `, params);

    res.json({ rows });
  } catch (err) {
    console.error('Lists report error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

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
             ELSE 0 END                                                    AS roi,
        CASE WHEN SUM(os.clicks) > 0
             THEN ROUND(SUM(os.revenue)/SUM(os.clicks), 4)
             ELSE 0 END                                                    AS epc,
        CASE WHEN SUM(os.clicks) > 0
             THEN ROUND(SUM(os.cost)/SUM(os.clicks), 4)
             ELSE 0 END                                                    AS cpc
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
