const express = require('express');
const redtrack = require('../redtrack');

const router = express.Router();

// Redtrack doesn't have a dedicated /traffic_sources endpoint.
// Traffic sources are fetched from user settings which includes the configured sources.
router.get('/', async (req, res) => {
  try {
    const { data } = await redtrack.get('/sources');
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { message: err.message });
  }
});

module.exports = router;
