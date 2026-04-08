const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
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
};
