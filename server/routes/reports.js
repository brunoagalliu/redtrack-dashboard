const express = require('express');
const redtrack = require('../redtrack');

const router = express.Router();

const BUYER_PATTERNS = { TK: /^TK[\s_\-]/i, MA: /^MA[\s_\-]/i, DS: /^DS[\s_\-]/i };
const CONCURRENCY = 25;  // individual stat calls in parallel
const SCAN_BATCH = 50;   // campaigns per batch in pass-1 activity scan

function defaultDateRange() {
  const to = new Date();
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return {
    date_from: from.toISOString().slice(0, 10),
    date_to: to.toISOString().slice(0, 10),
  };
}

function isActive(stats) {
  return (stats.clicks || 0) > 10 || (stats.conversions || 0) >= 1 || (stats.revenue || 0) > 0;
}

async function fetchAllCampaigns() {
  const { data } = await redtrack.get('/campaigns/v2', { params: { per: 10000 } });
  return data.items || [];
}

// Returns combined aggregate for a list of campaign IDs (one API call)
async function fetchBatchTotal(ids, dateFrom, dateTo) {
  try {
    const { data } = await redtrack.get('/report', {
      params: { date_from: dateFrom, date_to: dateTo, campaign_id: ids.join(','), total: 1, per: 1 },
    });
    return data?.total || {};
  } catch {
    return {};
  }
}

// Returns stats for a single campaign
async function fetchCampaignStats(id, dateFrom, dateTo) {
  try {
    const { data } = await redtrack.get('/report', {
      params: { date_from: dateFrom, date_to: dateTo, campaign_id: id, total: 1, per: 1 },
    });
    return data?.total || {};
  } catch {
    return {};
  }
}

async function runWithConcurrency(items, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    results.push(...await Promise.all(batch.map(fn)));
  }
  return results;
}

async function processBuyer(candidates, dateFrom, dateTo) {
  if (!candidates.length) {
    return { campaigns: [], totals: { clicks: 0, conversions: 0, cost: 0, revenue: 0, profit: 0 }, checked: 0 };
  }

  // Pass 1 — scan all candidates in batches of SCAN_BATCH to find which groups have any activity
  const batches = [];
  for (let i = 0; i < candidates.length; i += SCAN_BATCH) {
    batches.push(candidates.slice(i, i + SCAN_BATCH));
  }

  const scanResults = await Promise.all(
    batches.map(async (batch) => {
      const t = await fetchBatchTotal(batch.map((c) => c.id), dateFrom, dateTo);
      const hasActivity = (t.clicks || 0) > 0 || (t.conversions || 0) > 0 || (t.revenue || 0) > 0;
      return { batch, hasActivity };
    })
  );

  // Pass 2 — fetch individual stats only for campaigns inside active batches
  const activeCandidates = scanResults.filter((r) => r.hasActivity).flatMap((r) => r.batch);

  if (!activeCandidates.length) {
    return { campaigns: [], totals: { clicks: 0, conversions: 0, cost: 0, revenue: 0, profit: 0 }, checked: candidates.length };
  }

  const withStats = await runWithConcurrency(activeCandidates, async (c) => {
    const stats = await fetchCampaignStats(c.id, dateFrom, dateTo);
    return { id: c.id, title: c.title, ...stats };
  });

  const active = withStats
    .filter(isActive)
    .sort((a, b) => (b.clicks || 0) - (a.clicks || 0));

  const totals = active.reduce(
    (acc, c) => ({
      clicks: acc.clicks + (c.clicks || 0),
      conversions: acc.conversions + (c.conversions || 0),
      cost: acc.cost + (c.cost || 0),
      revenue: acc.revenue + (c.revenue || 0),
      profit: acc.profit + (c.profit || 0),
    }),
    { clicks: 0, conversions: 0, cost: 0, revenue: 0, profit: 0 }
  );

  return { campaigns: active, totals, checked: candidates.length };
}

router.get('/media-buyers', async (req, res) => {
  try {
    const defaults = defaultDateRange();
    const dateFrom = req.query.date_from || defaults.date_from;
    const dateTo = req.query.date_to || defaults.date_to;

    const campaigns = await fetchAllCampaigns();

    const grouped = { TK: [], MA: [], DS: [] };
    for (const c of campaigns) {
      const title = c.title.trim();
      for (const [buyer, pattern] of Object.entries(BUYER_PATTERNS)) {
        if (pattern.test(title)) {
          grouped[buyer].push({ id: c.id, title: c.title.trim() });
          break;
        }
      }
    }

    const [tk, ma, ds] = await Promise.all([
      processBuyer(grouped.TK, dateFrom, dateTo),
      processBuyer(grouped.MA, dateFrom, dateTo),
      processBuyer(grouped.DS, dateFrom, dateTo),
    ]);

    res.json({
      date_from: dateFrom,
      date_to: dateTo,
      buyers: { TK: tk, MA: ma, DS: ds },
    });
  } catch (err) {
    console.error('Media buyer report error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
