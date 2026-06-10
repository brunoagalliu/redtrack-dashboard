const express = require('express');
const redtrack = require('../redtrack');

const router = express.Router();

const BUYER_PATTERNS = { TK: /^TK[\s_\-]/i, MA: /^MA[\s_\-]/i, DS: /^DS[\s_\-]/i };
const CONCURRENCY = 25;
const LOOKBACK_BUFFER_DAYS = 30; // extra days before date_from to catch still-running campaigns

function defaultDateRange() {
  const to = new Date();
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
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

async function fetchCampaignStats(campaignId, dateFrom, dateTo) {
  try {
    const { data } = await redtrack.get('/report', {
      params: { date_from: dateFrom, date_to: dateTo, campaign_id: campaignId, total: 1, per: 1 },
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
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

async function processBuyer(candidates, dateFrom, dateTo) {
  if (!candidates.length) return { campaigns: [], totals: { clicks: 0, conversions: 0, cost: 0, revenue: 0, profit: 0 }, checked: 0 };

  const withStats = await runWithConcurrency(candidates, async (c) => {
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

    // Only consider campaigns created within the date range + buffer
    // (SMS campaigns are short-lived; this keeps the candidate set manageable)
    const lookbackFrom = new Date(new Date(dateFrom).getTime() - LOOKBACK_BUFFER_DAYS * 86400000)
      .toISOString()
      .slice(0, 10);

    const campaigns = await fetchAllCampaigns();

    const grouped = { TK: [], MA: [], DS: [] };
    for (const c of campaigns) {
      const createdAt = (c.created_at || '').slice(0, 10);
      if (createdAt < lookbackFrom) continue;

      for (const [buyer, pattern] of Object.entries(BUYER_PATTERNS)) {
        if (pattern.test(c.title)) {
          grouped[buyer].push({ id: c.id, title: c.title, created_at: createdAt });
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
