require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');

const authRouter = require('./routes/auth');
const campaignsRouter = require('./routes/campaigns');
const offersRouter = require('./routes/offers');
const landingsRouter = require('./routes/landings');
const domainsRouter = require('./routes/domains');
const sourcesRouter = require('./routes/sources');
const networksRouter = require('./routes/networks');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173',
}));
app.use(express.json());

// Public — login endpoint
app.use('/api/auth', authRouter);

// Auth middleware for all other /api routes
app.use('/api', (req, res, next) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Unauthorized.' });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
});

app.use('/api/campaigns', campaignsRouter);
app.use('/api/offers', offersRouter);
app.use('/api/landings', landingsRouter);
app.use('/api/domains', domainsRouter);
app.use('/api/sources', sourcesRouter);
app.use('/api/networks', networksRouter);

// Serve React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
