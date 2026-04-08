const express = require('express');
const redtrack = require('../redtrack');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { data } = await redtrack.get('/landings', {
      params: { page: 1, per: 500, title: req.query.title },
    });
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { message: err.message });
  }
});

module.exports = router;
