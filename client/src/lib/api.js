const BASE = '/api';
const SMS_API_BASE = 'https://api.smsapp.co';

export function getToken() { return localStorage.getItem('auth_token'); }
export function setToken(t) { localStorage.setItem('auth_token', t); }
export function clearToken() { localStorage.removeItem('auth_token'); }

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });
  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    return;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Auth
  login: (password) =>
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }).then((r) => r.json()),

  // Campaigns
  getCampaigns: (params = {}) => {
    const filtered = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null));
    const qs = new URLSearchParams(filtered).toString();
    return request(`/campaigns${qs ? `?${qs}` : ''}`);
  },
  getCampaign: (id) => request(`/campaigns/${id}`),
  createCampaign: (body) => request('/campaigns', { method: 'POST', body: JSON.stringify(body) }),
  updateCampaign: (id, body) => request(`/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  updateCampaignStatus: (body) => request('/campaigns/status', { method: 'PATCH', body: JSON.stringify(body) }),
  cloneCampaign: (id) => request(`/campaigns/${id}/clone`, { method: 'POST' }),
  getCampaignTags: () => request('/campaigns/tags'),

  // Dropdowns
  getOffers: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/offers${qs ? `?${qs}` : ''}`);
  },
  getLandings: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/landings${qs ? `?${qs}` : ''}`);
  },
  getDomains: () => request('/domains'),
  getSources: () => request('/sources'),
  getNetworks: () => request('/networks'),

  // Name builder lists
  getList: (list) => request(`/lists/${list}`),
  addListItem: (list, value) => request(`/lists/${list}`, { method: 'POST', body: JSON.stringify({ value }) }),
  deleteListItem: (list, id) => request(`/lists/${list}/${id}`, { method: 'DELETE' }),
  getPartners: () => request('/lists/partners'),
  addPartner: (alias) => request('/lists/partners', { method: 'POST', body: JSON.stringify({ alias }) }),
  deletePartner: (id) => request(`/lists/partners/${id}`, { method: 'DELETE' }),

  // Filter options
  getFilterOptions: (type, params) => request(`/filter-options/${type}${params ? '?' + new URLSearchParams(params).toString() : ''}`),

  // Reports
  getMediaBuyerReport: (params = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString();
    return request(`/reports/media-buyers${qs ? `?${qs}` : ''}`);
  },
  // Cost updater
  getCampaignSubs: (campaignId) => request(`/cost-updater/subs/${campaignId}`),
  getClicks: (body) => request('/cost-updater/clicks', { method: 'POST', body: JSON.stringify(body) }),
  updateCost: (body) => request('/cost-updater/cost', { method: 'POST', body: JSON.stringify(body) }),
  updateRevenue: (body) => request('/cost-updater/revenue', { method: 'POST', body: JSON.stringify(body) }),

  getSyncStatus: () => request('/reports/sync/status'),
  triggerSync: (params = {}) => request('/reports/sync', { method: 'POST', body: JSON.stringify(params) }),
  stopSync: () => request('/reports/sync/stop', { method: 'POST' }),
  debugCampaign: (campaign_id, date_from, date_to) => request(`/reports/debug/raw?campaign_id=${campaign_id}&date_from=${date_from}&date_to=${date_to}`),
  debugBatchTest: (date_from, date_to) => request(`/reports/debug/batch-test?date_from=${date_from}&date_to=${date_to}`),
  forceSyncCampaign: (campaign_id, date_from, date_to) => request('/reports/debug/sync-campaign', { method: 'POST', body: JSON.stringify({ campaign_id, date_from, date_to }) }),
  getOfferSyncStatus: () => request('/reports/sync/offers/status'),
  triggerOfferSync: (params = {}) => request('/reports/sync/offers', { method: 'POST', body: JSON.stringify(params) }),
  getSyncLogs: (limit = 50) => request(`/reports/sync/logs?limit=${limit}`),
  getOffersReport: (params = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))).toString();
    return request(`/reports/offers${qs ? `?${qs}` : ''}`);
  },
  updateCampaignList:    (id, data_list)    => request(`/reports/campaigns/${id}/list`,    { method: 'PATCH', body: JSON.stringify({ data_list }) }),
  updateCampaignPartner: (id, data_partner) => request(`/reports/campaigns/${id}/partner`, { method: 'PATCH', body: JSON.stringify({ data_partner }) }),
  getCampaignOffers: (id, params = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString();
    return request(`/reports/campaigns/${id}/offers${qs ? `?${qs}` : ''}`);
  },
  getOfferOsStats: (campaignId, offerId, params = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString();
    return request(`/reports/campaigns/${campaignId}/offers/${offerId}/os${qs ? `?${qs}` : ''}`);
  },
  getInsights: (dateFrom, dateTo) => request(`/reports/insights?date_from=${dateFrom}&date_to=${dateTo}`),
  getListDailyStats: (listKey) => request(`/reports/lists/daily?list_key=${encodeURIComponent(listKey)}`),
  getListCampaigns: (listKey, dateFrom, dateTo) => request(`/reports/lists/campaigns?list_key=${encodeURIComponent(listKey)}&date_from=${dateFrom}&date_to=${dateTo}`),
  getListsReport: (params = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString();
    return request(`/reports/lists${qs ? `?${qs}` : ''}`);
  },
  getAIListReport: () => request('/reports/ai-list'),
  generateAIListReport: () => request('/reports/ai-list/generate', { method: 'POST' }),
  getAIListStatus: () => request('/reports/ai-list/status'),
  getAIListReportHistory: (limit = 20) => request(`/reports/ai-list/history?limit=${limit}`),
  getAIListReportHistoryItem: (id) => request(`/reports/ai-list/history/${id}`),
  getAIReport: () => request('/reports/ai-recommendations'),
  generateAIReport: (days = 14) => request('/reports/ai-recommendations/generate', { method: 'POST', body: JSON.stringify({ days }) }),
  getAICampaignStatus: () => request('/reports/ai-recommendations/status'),
  getAIReportHistory: (limit = 20) => request(`/reports/ai-recommendations/history?limit=${limit}`),
  getAIReportHistoryItem: (id) => request(`/reports/ai-recommendations/history/${id}`),
  getVerticalsReport: (params = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString();
    return request(`/reports/verticals${qs ? `?${qs}` : ''}`);
  },

  // Domain finder
  brainstormDomains: (description) => request('/domain-finder/brainstorm', { method: 'POST', body: JSON.stringify({ description }) }),
  checkDomains: (domains) => request('/domain-finder/check-domains', { method: 'POST', body: JSON.stringify({ domains }) }),
  getCloudflareAccounts: () => request('/domain-finder/cloudflare-accounts'),
  getNamecheapDomains: () => request('/domain-finder/domains'),
  getGodaddyAccounts: () => request('/domain-finder/godaddy-accounts'),
  getGodaddyDomains: (account = 'adam') => request(`/domain-finder/godaddy-domains?account=${account}`),
  checkWayback: (domains) => request('/domain-finder/wayback-check', { method: 'POST', body: JSON.stringify({ domains }) }),
  provisionDomain: (body) => request('/domain-finder/provision', { method: 'POST', body: JSON.stringify(body) }),
  vercelProvision: (body) => request('/domain-finder/vercel-provision', { method: 'POST', body: JSON.stringify(body) }),

  // Clicks export
  getClicksExportCampaigns: () => request('/clicks-export/campaigns'),
  getClicksExportSources:   () => request('/clicks-export/sources'),
  getClicksExportNetworks:  () => request('/clicks-export/networks'),
  getClicksExportOffers:    () => request('/clicks-export/offers'),
  downloadClicksExport: async (params) => {
    const token = getToken();
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))).toString();
    const res = await fetch(`${BASE}/clicks-export/download?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) { clearToken(); window.location.href = '/login'; return; }
    if (!res.ok) throw new Error(await res.text());
    return res;
  },

      searchDataSources: async (searchKey, page = 0, size = 10, sort = 'email,asc', searchField = 'email') => {
    try {
      const params = new URLSearchParams();
      params.append(searchField, searchKey || '');
      params.append('page', page);
      params.append('size', size);
      params.append('sort', sort);

      const response = await fetch(
        `${SMS_API_BASE}/data-source/?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'accept': 'application/json',
          },
        }
      );
      if (!response.ok) {
        throw new Error('Failed to search data sources');
      }
      return await response.json();
    } catch (error) {
      console.error('Error searching data sources:', error);
      throw error;
    }
  },
};
