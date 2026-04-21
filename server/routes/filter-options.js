const express = require('express');
const redtrack = require('../redtrack');

const router = express.Router();

// Simple proxy helpers — normalize each source to { value, label }
router.get('/countries', async (req, res) => {
  try {
    const { data } = await redtrack.get('/countries');
    res.json(data.map((c) => ({ value: c.iso, label: `${c.title} (${c.iso})` })));
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: err.message });
  }
});

router.get('/regions', async (req, res) => {
  try {
    const { data } = await redtrack.get('/regions', { params: { country_iso: req.query.country_iso || 'US' } });
    const list = Array.isArray(data) ? data : [];
    res.json(list.map((r) => ({ value: r, label: r })));
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: err.message });
  }
});

router.get('/browsers', async (req, res) => {
  try {
    const { data } = await redtrack.get('/browsers');
    res.json(data.map((b) => ({ value: b.title, label: b.title })));
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: err.message });
  }
});

router.get('/os', async (req, res) => {
  try {
    const { data } = await redtrack.get('/os');
    res.json(data.map((o) => ({ value: o.title, label: o.title })));
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: err.message });
  }
});

router.get('/device_brands', async (req, res) => {
  try {
    const { data } = await redtrack.get('/device_brands');
    res.json(data.map((d) => ({ value: d.title, label: d.title })));
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: err.message });
  }
});

router.get('/connection_types', async (req, res) => {
  try {
    const { data } = await redtrack.get('/connection_types');
    const list = Array.isArray(data) ? data : [];
    res.json(list.map((t) => ({ value: t, label: t })));
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: err.message });
  }
});

router.get('/languages', async (req, res) => {
  try {
    const { data } = await redtrack.get('/languages');
    res.json(data.map((l) => ({ value: l.code, label: `${l.title} (${l.code})` })));
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: err.message });
  }
});

module.exports = router;
