const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const PASSWORD   = process.env.DASHBOARD_PASSWORD;

router.post('/login', (req, res) => {
  const { password } = req.body;

  if (!PASSWORD) {
    return res.status(500).json({ message: 'DASHBOARD_PASSWORD env var not set.' });
  }
  if (!password || password !== PASSWORD) {
    return res.status(401).json({ message: 'Incorrect password.' });
  }

  const token = jwt.sign({ ok: true }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token });
});

router.get('/me', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'No token.' });

  try {
    jwt.verify(token, JWT_SECRET);
    res.json({ ok: true });
  } catch {
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
});

module.exports = router;
module.exports.JWT_SECRET = JWT_SECRET;
