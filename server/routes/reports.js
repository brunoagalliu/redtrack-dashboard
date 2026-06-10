const express = require('express');
const redtrack = require('../redtrack');

const router = express.Router();

const BUYER_PATTERNS = { TK: /^TK[\s_\-]/i, MA: /^MA[\s_\-]/i, DS: /^DS[\s_\-]/i };
const BATCH_SIZE = 50;

function defaultDateRange() {
  const to = new Date();
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return {
    date_from: from.toISOString().slice(0, 10),
    date_to: to.toISOString().slice(0, 10),
  };
}

async function fetchAllCampaigns() {
  const { data } = await redtrack.get('/campaigns/v2', { params: { per: 10000 } });
  return data.items || [];
}

async function fetchBatchStats(campaignIds, dateFrom, dateTo) {
  if (!campaignIds.length) return { clicks: 0, conversions: 0, cost: 0, revenue: 0, profit: 0 };

  const batches = [];
  for (let i = 0; i < campaignIds.length; i += BATCH_SIZE) {
    batches.push(campaignIds.slice(i, i + BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map((batch) =>
      redtrack
        .get('/report', {
          params: {
            date_from: dateFrom,
            date_to: dateTo,
            campaign_id: batch.join(','),
            total: 1,
            per: 1,
          },
        })
        .then((r) => r.data?.total || {})
        .catch(() => ({}))
    )
  );

  return results.reduce(
    (acc, t) => ({
      clicks: acc.clicks + (t.clicks || 0),
      conversions: acc.conversions + (t.conversions || 0),
      cost: acc.cost + (t.cost || 0),
      revenue: acc.revenue + (t.revenue || 0),
      profit: acc.profit + (t.profit || 0),
    }),
    { clicks: 0, conversions: 0, cost: 0, revenue: 0, profit: 0 }
  );
}

router.get('/media-buyers', async (req, res) => {
  try {
    const defaults = defaultDateRange();
    const dateFrom = req.query.date_from || defaults.date_from;
    const dateTo = req.query.date_to || defaults.date_to;

    const campaigns = await fetchAllCampaigns();

    const grouped = { TK: [], MA: [], DS: [] };
    for (const c of campaigns) {
      for (const [buyer, pattern] of Object.entries(BUYER_PATTERNS)) {
        if (pattern.test(c.title)) {
          grouped[buyer].push({ id: c.id, title: c.title });
          break;
        }
      }
    }

    const [tkStats, maStats, dsStats] = await Promise.all([
      fetchBatchStats(grouped.TK.map((c) => c.id), dateFrom, dateTo),
      fetchBatchStats(grouped.MA.map((c) => c.id), dateFrom, dateTo),
      fetchBatchStats(grouped.DS.map((c) => c.id), dateFrom, dateTo),
    ]);

    res.json({
      date_from: dateFrom,
      date_to: dateTo,
      buyers: {
        TK: { ...tkStats, campaign_count: grouped.TK.length, campaigns: grouped.TK },
        MA: { ...maStats, campaign_count: grouped.MA.length, campaigns: grouped.MA },
        DS: { ...dsStats, campaign_count: grouped.DS.length, campaigns: grouped.DS },
      },
    });
  } catch (err) {
    console.error('Media buyer report error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
