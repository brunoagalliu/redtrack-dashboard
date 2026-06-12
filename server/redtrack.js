const axios = require('axios');

const BASE_URL = 'https://api.redtrack.io';

const redtrack = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  params: { api_key: process.env.REDTRACK_API_KEY },
});

// Retry on 429 (rate limit) and 5xx with exponential backoff
redtrack.interceptors.response.use(null, async (err) => {
  const config = err.config;
  if (!config) return Promise.reject(err);

  config._retryCount = config._retryCount || 0;
  const status = err.response?.status;
  const isRetryable = status === 429 || (status >= 500 && status < 600) || err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT';

  if (!isRetryable || config._retryCount >= 3) return Promise.reject(err);

  config._retryCount += 1;
  // 429 → respect Retry-After header if present, else 10s; 5xx/timeout → 2^n seconds
  const retryAfterHeader = err.response?.headers?.['retry-after'];
  const delaySec = status === 429
    ? (retryAfterHeader ? parseInt(retryAfterHeader, 10) : 10)
    : Math.pow(2, config._retryCount);
  console.warn(`[redtrack] ${status || err.code} on ${config.url} — retry ${config._retryCount}/3 in ${delaySec}s`);
  await new Promise((r) => setTimeout(r, delaySec * 1000));
  return redtrack(config);
});

module.exports = redtrack;
