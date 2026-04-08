const axios = require('axios');

const BASE_URL = 'https://api.redtrack.io';

const redtrack = axios.create({
  baseURL: BASE_URL,
  params: { api_key: process.env.REDTRACK_API_KEY },
});

module.exports = redtrack;
