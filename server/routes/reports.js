const express = require('express');
const redtrack = require('../redtrack');

const router = express.Router();

const BUYER_PATTERNS = { TK: /^TK[\s_\-]/i, MA: /^MA[\s_\-]/i, DS: /^DS[\s_\-]/i };
const SCAN_BATCH = 50;
const CALL_INTERVAL_MS = 3100; // 20 calls/min = 1 every 3s; 3.1s gives a small safety margin

// In-memory cache: key → { data, expires }
const cache = new Map();

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function defaultDateRange() {
  const to = new Date();
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return {
    date_from: from.toISOString().slice(0, 10),
    date_to: to.toISOString().slice(0, 10),
  };
}

async function fetchAllCampaigns() {
  const { data } = await redtrack.get('/campaigns/v2', { params: { per: 10000 } });
  return data.items || [];
}

// Rate-limited single report call — returns the `total` aggregate for provided campaign IDs
let lastCallTime = 0;
async function rateLimitedBatchTotal(ids, dateFrom, dateTo) {
  const wait = Math.max(0, CALL_INTERVAL_MS - (Date.now() - lastCallTime));
  if (wait > 0) await sleep(wait);
  lastCallTime = Date.now();
  try {
    const { data } = await redtrack.get('/report', {
      params: { date_from: dateFrom, date_to: dateTo, campaign_id: ids.join(','), total: 1, per: 1 },
    });
    return data?.total || {};
  } catch {
    return {};
  }
}

async function getBuyerStats(campaignIds, dateFrom, dateTo) {
  const acc = { clicks: 0, conversions: 0, cost: 0, revenue: 0, profit: 0 };
  for (let i = 0; i < campaignIds.length; i += SCAN_BATCH) {
    const t = await rateLimitedBatchTotal(campaignIds.slice(i, i + SCAN_BATCH), dateFrom, dateTo);
    acc.clicks      += t.clicks      || 0;
    acc.conversions += t.conversions || 0;
    acc.cost        += t.cost        || 0;
    acc.revenue     += t.revenue     || 0;
    acc.profit      += t.profit      || 0;
  }
  return acc;
}

router.get('/media-buyers', async (req, res) => {
  try {
    const defaults = defaultDateRange();
    const dateFrom = req.query.date_from || defaults.date_from;
    const dateTo   = req.query.date_to   || defaults.date_to;

    const cacheKey = `mb:${dateFrom}:${dateTo}`;
    const hit = cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return res.json(hit.data);

    const campaigns = await fetchAllCampaigns();

    const grouped = { TK: [], MA: [], DS: [] };
    for (const c of campaigns) {
      const title = c.title.trim();
      for (const [buyer, pattern] of Object.entries(BUYER_PATTERNS)) {
        if (pattern.test(title)) {
          grouped[buyer].push({ id: c.id, title });
          break;
        }
      }
    }

    // Sequential rate-limited calls — all three buyers share the same rate-limit token
    const tkStats = await getBuyerStats(grouped.TK.map((c) => c.id), dateFrom, dateTo);
    const maStats = await getBuyerStats(grouped.MA.map((c) => c.id), dateFrom, dateTo);
    const dsStats = await getBuyerStats(grouped.DS.map((c) => c.id), dateFrom, dateTo);

    const result = {
      date_from: dateFrom,
      date_to:   dateTo,
      buyers: {
        TK: { ...tkStats, campaign_count: grouped.TK.length },
        MA: { ...maStats, campaign_count: grouped.MA.length },
        DS: { ...dsStats, campaign_count: grouped.DS.length },
      },
    };

    cache.set(cacheKey, { data: result, expires: Date.now() + 10 * 60 * 1000 });
    res.json(result);
  } catch (err) {
    console.error('Media buyer report error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
