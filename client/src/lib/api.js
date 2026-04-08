const BASE = '/api';

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
  getPartners: () => request('/lists/partners/all'),
  addPartner: (alias) => request('/lists/partners', { method: 'POST', body: JSON.stringify({ alias }) }),
  deletePartner: (id) => request(`/lists/partners/${id}`, { method: 'DELETE' }),
};
