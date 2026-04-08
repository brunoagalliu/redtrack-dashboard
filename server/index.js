require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const campaignsRouter = require('./routes/campaigns');
const offersRouter = require('./routes/offers');
const landingsRouter = require('./routes/landings');
const domainsRouter = require('./routes/domains');
const sourcesRouter = require('./routes/sources');
const networksRouter = require('./routes/networks');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173',
}));
app.use(express.json());

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
