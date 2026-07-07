const express = require('express');
const redtrack = require('../redtrack');

const router = express.Router();

const LIST_FIELDS = ['id', 'serial_number', 'title', 'impression_url', 'trackback_url', 'source_title'];

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

// Get single campaign (with stream details enriched)
router.get('/:id', async (req, res) => {
  try {
    const { data } = await redtrack.get(`/campaigns/${req.params.id}`);

    // Redtrack may return streams without the nested stream body (offers/landings).
    // Fetch each stream's details and attach them so the edit form can populate correctly.
    if (Array.isArray(data.streams)) {
      data.streams = await Promise.all(
        data.streams.map(async (s) => {
          if (s.stream) return s; // already enriched
          try {
            const { data: streamData } = await redtrack.get(`/streams/${s.id}`);
            return { ...s, stream: streamData };
          } catch {
            return s;
          }
        })
      );
    }

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

// Build a cloned campaign title by stripping any stale date / copy suffix
// and appending today's date as _DD.MM.
// Convention: {buyer} - {route}_{vertical?}_{list_ending_in_size}_{DD.MM}
function buildCloneTitle(original) {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const todayStamp = `_${dd}.${mm}`;

  let title = original.trim();
  // Strip trailing " COPY" or "_copy" variants (case-insensitive)
  title = title.replace(/\s*[-_]?\s*copy\s*$/i, '').trim();
  // Strip trailing _DD.MM date stamp
  title = title.replace(/_\d{1,2}\.\d{1,2}\s*$/, '').trim();
  // Strip any leftover trailing underscores or spaces
  title = title.replace(/[_\s]+$/, '');

  return `${title}${todayStamp}`;
}

// Clone campaign
router.post('/:id/clone', async (req, res) => {
  try {
    const { data: source } = await redtrack.get(`/campaigns/${req.params.id}`);

    // Strip read-only fields; rebuild title with today's date
    const { id: _id, serial_number: _sn, trackback_url: _tu, impression_url: _iu, ...campaignBody } = source;
    campaignBody.title = buildCloneTitle(source.title);

    // Strip stream IDs so resolveStreams creates fresh streams
    const rawStreams = (source.streams || []).map((s) => ({
      weight: s.weight,
      optimization: s.optimization,
      stream: s.stream,
    }));

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

// Unique tags used across all campaigns
router.get('/tags', async (req, res) => {
  try {
    const { data } = await redtrack.get('/campaigns');
    const camps = Array.isArray(data) ? data : [];
    const seen = new Map();
    for (const c of camps) {
      for (const tag of c.tags || []) {
        const key = tag.toLowerCase();
        if (!seen.has(key)) seen.set(key, tag);
      }
    }
    res.json([...seen.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
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
