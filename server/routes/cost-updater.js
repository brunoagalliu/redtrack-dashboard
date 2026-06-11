const express = require('express');
const redtrack = require('../redtrack');

const router = express.Router();

// Get sub parameters for a campaign (for the sub filter dropdown)
router.get('/subs/:campaignId', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const dateTo   = new Date().toISOString().slice(0, 10);
    const dateFrom = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const { data } = await redtrack.get('/report', {
      params: { campaign_id: campaignId, date_from: dateFrom, date_to: dateTo, per: 1 },
    });

    const sample = Array.isArray(data) ? data[0] : data?.items?.[0];
    if (!sample) return res.json([]);

    const subs = [];
    for (let i = 1; i <= 5; i++) {
      const key = `sub${i}`;
      if (sample[key]) subs.push({ value: key, label: `Sub ${i} (${key})` });
    }
    res.json(subs);
  } catch (err) {
    console.error('Subs fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get click IDs for a campaign + date range
router.post('/clicks', async (req, res) => {
  try {
    const { campaign_id, date_from, date_to } = req.body;
    const { data } = await redtrack.get('/report', {
      params: { campaign_id, date_from, date_to, per: 100, page: 1 },
    });

    const rows = Array.isArray(data) ? data : (data?.items || []);
    const clicks = rows
      .filter((r) => r.clickid)
      .map((r) => ({ clickid: r.clickid, created_at: r.created_at || r.date }));

    res.json(clicks);
  } catch (err) {
    console.error('Clicks fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Update campaign cost
router.post('/cost', async (req, res) => {
  try {
    const { campaign_id, time_from, time_to, cost, country_code, sub_name, sub_value } = req.body;

    // RedTrack needs the campaign serial number, not the ID
    const { data: campaign } = await redtrack.get(`/campaigns/${campaign_id}`);
    const serial = campaign.serial_number;
    if (!serial) return res.status(400).json({ error: 'Campaign serial number not found' });

    const payload = {
      campaign_id: serial,
      time_from: `${time_from}T00:00:00-05:00`,
      time_to:   `${time_to}T23:59:59-05:00`,
      cost: parseFloat(cost),
      ...(country_code              && { country_code }),
      ...(sub_name && sub_value     && { [sub_name]: sub_value }),
    };

    await redtrack.post('/tracks/cost', payload);
    res.json({ success: true });
  } catch (err) {
    console.error('Cost update error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

// Record a conversion (revenue)
router.post('/revenue', async (req, res) => {
  try {
    const { clickid, created_at, payout, type } = req.body;

    const conversion = {
      clickid,
      created_at,
      payout: parseFloat(payout),
      type: type || 'Conversion',
    };

    try {
      await redtrack.post('/conversions', [conversion]);
    } catch {
      // Some accounts expect a single object instead of array
      await redtrack.post('/conversions', conversion);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Revenue update error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

module.exports = router;
