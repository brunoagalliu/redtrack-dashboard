import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export default function CostUpdaterPage() {
  const today = new Date().toISOString().slice(0, 10);

  const [search, setSearch]         = useState('');
  const [campaign, setCampaign]     = useState(null);
  const [dateFrom, setDateFrom]     = useState(today);
  const [dateTo, setDateTo]         = useState(today);
  const [cost, setCost]             = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [subName, setSubName]       = useState('');
  const [subValue, setSubValue]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]         = useState(null); // { ok, message }
  const [showDropdown, setShowDropdown] = useState(false);

  const { data: campaignsData } = useQuery({
    queryKey: ['campaigns', 'all'],
    queryFn: () => api.getCampaigns({ per: 10000 }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: subs = [] } = useQuery({
    queryKey: ['cost-updater', 'subs', campaign?.id],
    queryFn: () => api.getCampaignSubs(campaign.id),
    enabled: !!campaign,
    staleTime: 5 * 60 * 1000,
  });

  const campaigns = campaignsData?.items || [];
  const filtered = search.length > 1
    ? campaigns.filter((c) =>
        c.title?.toLowerCase().includes(search.toLowerCase()) ||
        String(c.id).includes(search)
      ).slice(0, 30)
    : [];

  function selectCampaign(c) {
    setCampaign(c);
    setSearch(c.title);
    setShowDropdown(false);
    setSubName('');
    setSubValue('');
  }

  function presetDates(days) {
    const to = new Date();
    const from = days === 0 ? new Date() : new Date(Date.now() - days * 86400000);
    setDateFrom(from.toISOString().slice(0, 10));
    setDateTo(to.toISOString().slice(0, 10));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!campaign) return;
    setSubmitting(true);
    setResult(null);
    try {
      await api.updateCost({
        campaign_id: campaign.id,
        time_from: dateFrom,
        time_to: dateTo,
        cost,
        country_code: countryCode || undefined,
        sub_name: subName || undefined,
        sub_value: subValue || undefined,
      });
      setResult({ ok: true, message: 'Cost updated successfully.' });
    } catch (err) {
      setResult({ ok: false, message: err.message || 'Failed to update cost.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Cost Updater</h1>
        <p className="text-sm text-gray-500 mt-1">Update campaign spend in RedTrack</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Campaign search */}
        <div className="card p-5 space-y-4">
          <div className="relative">
            <label className="label">Campaign</label>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCampaign(null); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              placeholder="Search by name or ID…"
              className="input w-full"
              autoComplete="off"
            />
            {showDropdown && filtered.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => selectCampaign(c)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                  >
                    <span className="font-medium text-gray-800 block truncate">{c.title}</span>
                    <span className="text-xs text-gray-400">ID: {c.id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Date range */}
        <div className="card p-5 space-y-3">
          <label className="label">Date Range</label>
          <div className="flex gap-2 flex-wrap">
            {[['Today', 0], ['Last 7 days', 7], ['Last 30 days', 30]].map(([label, days]) => (
              <button key={label} type="button" onClick={() => presetDates(days)}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="label">From</label>
              <input type="date" value={dateFrom} max={dateTo}
                onChange={(e) => setDateFrom(e.target.value)} className="input w-full" />
            </div>
            <div className="flex-1">
              <label className="label">To</label>
              <input type="date" value={dateTo} min={dateFrom} max={today}
                onChange={(e) => setDateTo(e.target.value)} className="input w-full" />
            </div>
          </div>
        </div>

        {/* Cost */}
        <div className="card p-5">
          <label className="label">Cost (USD)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number" step="0.01" min="0"
              value={cost} onChange={(e) => setCost(e.target.value)}
              placeholder="0.00"
              className="input w-full pl-7"
              required
            />
          </div>
        </div>

        {/* Optional filters */}
        <div className="card p-5 space-y-4">
          <p className="text-sm font-medium text-gray-700">Optional filters</p>
          <div>
            <label className="label">Country code</label>
            <input type="text" value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
              placeholder="e.g. US" maxLength={2} className="input w-32" />
          </div>
          {subs.length > 0 && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="label">Sub parameter</label>
                <select value={subName} onChange={(e) => setSubName(e.target.value)} className="input w-full">
                  <option value="">None</option>
                  {subs.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              {subName && (
                <div className="flex-1">
                  <label className="label">Sub value</label>
                  <input type="text" value={subValue} onChange={(e) => setSubValue(e.target.value)}
                    placeholder="Filter value" className="input w-full" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Result */}
        {result && (
          <div className={`rounded-md px-4 py-3 text-sm ${result.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {result.message}
          </div>
        )}

        <button type="submit" disabled={!campaign || !cost || submitting} className="btn-primary w-full">
          {submitting ? 'Updating…' : 'Update Cost'}
        </button>
      </form>
    </div>
  );
}
