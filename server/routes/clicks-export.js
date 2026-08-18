const express = require('express');
const router  = express.Router();
const redtrack = require('../redtrack');

const PAGE_SIZE     = 10000;
const CONCURRENCY   = 5;
const BATCH_DELAY_MS = 150;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function escapeCSV(v) {
  const s = v == null ? '' : String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

const COLUMN_MAP = {
  click_id:        (r) => r.id               ?? '',
  type:            (r) => r.type             ?? '',
  unique:          (r) => r.uniq             ?? '',
  click_time:      (r) => r.track_time       ?? '',
  campaign:        (r) => r.campaign         ?? '',
  campaign_id:     (r) => r.campaign_id      ?? '',
  traffic_channel: (r) => r.source           ?? '',
  sub1:            (r) => r.sub1             ?? '',
  sub2:            (r) => r.sub2             ?? '',
  sub3:            (r) => r.sub3             ?? '',
  sub4:            (r) => r.sub4             ?? '',
  sub5:            (r) => r.sub5             ?? '',
  country:         (r) => r.country          ?? '',
  city:            (r) => r.city             ?? '',
  region:          (r) => r.region           ?? '',
  ip:              (r) => r.ip               ?? '',
  user_agent:      (r) => r.user_agent       ?? '',
  browser:         (r) => r.browser          ?? '',
  os:              (r) => r.os               ?? '',
  device:          (r) => r.device           ?? '',
  isp:             (r) => r.isp              ?? '',
  connection_type: (r) => r.connection_type  ?? '',
  offer:           (r) => r.offer            ?? '',
  offer_id:        (r) => r.offer_id         ?? '',
  network:         (r) => r.network          ?? '',
  external_id:     (r) => r.external_id      ?? '',
  referer:         (r) => r.referer          ?? '',
  fingerprint:     (r) => r.fingerprint      ?? '',
  cost:            (r) => r.cost             ?? '',
};

router.get('/campaigns', async (_req, res) => {
  try {
    const { data } = await redtrack.get('/campaigns/v2', { params: { per: 10000 } });
    const items = Array.isArray(data) ? data : (data.items ?? []);
    res.json(items.map(c => ({ id: c.id, title: c.title })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/sources', async (_req, res) => {
  try {
    const { data } = await redtrack.get('/sources');
    const items = Array.isArray(data) ? data : (data.items ?? []);
    res.json(items.map(s => ({ id: s.id, title: s.title })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/networks', async (_req, res) => {
  try {
    const { data } = await redtrack.get('/networks', { params: { per: 500 } });
    const items = Array.isArray(data) ? data : (data.items ?? []);
    res.json(items.map(n => ({ id: n.id, title: n.title })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/offers', async (_req, res) => {
  try {
    const { data } = await redtrack.get('/offers', { params: { per: 500 } });
    const items = Array.isArray(data) ? data : (data.items ?? []);
    res.json(items.map(o => ({ id: o.id, title: o.title })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/download', async (req, res) => {
  const { date_from, date_to, campaign_id, source_id, network_id, offer_id, click_id, columns } = req.query;

  if (!date_from || !date_to) {
    return res.status(400).json({ error: 'date_from and date_to are required' });
  }

  const selectedCols = columns
    ? columns.split(',').filter(c => COLUMN_MAP[c])
    : Object.keys(COLUMN_MAP);

  if (!selectedCols.length) return res.status(400).json({ error: 'No valid columns selected' });

  const trackParams = { date_from, date_to };
  if (campaign_id) trackParams.campaign_id = campaign_id;
  if (source_id)   trackParams.source_id   = source_id;
  if (network_id)  trackParams.network_id  = network_id;
  if (offer_id)    trackParams.offer_id    = offer_id;
  if (click_id)    trackParams.click_id    = click_id;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="clicks_${date_from}_to_${date_to}.csv"`);
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const toLine = (item) => selectedCols.map(col => escapeCSV(COLUMN_MAP[col](item))).join(',') + '\n';

  try {
    const first = await redtrack.get('/tracks', { params: { ...trackParams, per: PAGE_SIZE, page: 1 } });
    const total = first.data.total ?? 0;
    const pageCount = Math.ceil(total / PAGE_SIZE);
    console.log(`[clicks-export] ${date_from}→${date_to} total=${total} pages=${pageCount}`);

    res.write(selectedCols.join(',') + '\n');
    for (const item of first.data.items ?? []) res.write(toLine(item));

    for (let p = 2; p <= pageCount; p += CONCURRENCY) {
      if (p > 2) await sleep(BATCH_DELAY_MS);
      const batch = [];
      for (let q = p; q < p + CONCURRENCY && q <= pageCount; q++) batch.push(q);
      const pages = await Promise.all(
        batch.map(page => redtrack.get('/tracks', { params: { ...trackParams, per: PAGE_SIZE, page } }))
      );
      for (const { data } of pages) {
        for (const item of data.items ?? []) res.write(toLine(item));
      }
    }
    console.log(`[clicks-export] done`);
  } catch (err) {
    console.error('[clicks-export] error:', err.message);
  }

  res.end();
});

module.exports = router;
