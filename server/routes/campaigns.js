const express = require('express');
const redtrack = require('../redtrack');

const router = express.Router();

const LIST_FIELDS = ['id', 'serial_number', 'title', 'impression_url', 'trackback_url'];

// List campaigns
router.get('/', async (req, res) => {
  try {
    const { data } = await redtrack.get('/campaigns', {
      params: {
        title: req.query.title || undefined,
        status: req.query.status || undefined,
      },
    });
    const list = Array.isArray(data)
      ? data.map((c) => Object.fromEntries(LIST_FIELDS.map((f) => [f, c[f]])))
      : data;
    res.json(list);
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { message: err.message });
  }
});

// Get single campaign
router.get('/:id', async (req, res) => {
  try {
    const { data } = await redtrack.get(`/campaigns/${req.params.id}`);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { message: err.message });
  }
});

// Resolve streams: create new ones, update existing ones, return array of {id, weight, optimization}
async function resolveStreams(streams) {
  if (!streams || streams.length === 0) return [];

  return Promise.all(
    streams.map(async (s) => {
      const streamBody = s.stream || {};
      let streamId = s.id;

      if (streamId) {
        // Update existing stream
        await redtrack.put(`/streams/${streamId}`, streamBody);
      } else {
        // Create new stream
        const { data } = await redtrack.post('/streams', streamBody);
        streamId = data.id;
      }

      return {
        id: streamId,
        weight: s.weight ?? 100,
        optimization: s.optimization || { is_enabled: false },
      };
    })
  );
}

// Create campaign
router.post('/', async (req, res) => {
  try {
    const { streams: rawStreams, ...campaignBody } = req.body;
    const resolvedStreams = await resolveStreams(rawStreams);
    const { data } = await redtrack.post('/campaigns', {
      ...campaignBody,
      streams: resolvedStreams.length ? resolvedStreams : undefined,
    });
    res.status(201).json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { message: err.message });
  }
});

// Update campaign
router.put('/:id', async (req, res) => {
  try {
    const { streams: rawStreams, ...campaignBody } = req.body;
    const resolvedStreams = await resolveStreams(rawStreams);
    const { data } = await redtrack.put(`/campaigns/${req.params.id}`, {
      ...campaignBody,
      streams: resolvedStreams.length ? resolvedStreams : undefined,
    });
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { message: err.message });
  }
});

// Bulk status update
router.patch('/status', async (req, res) => {
  try {
    const { data } = await redtrack.patch('/campaigns/status', req.body);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { message: err.message });
  }
});

module.exports = router;
