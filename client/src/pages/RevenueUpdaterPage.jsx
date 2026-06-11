import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export default function RevenueUpdaterPage() {
  const today = new Date().toISOString().slice(0, 10);

  const [search, setSearch]         = useState('');
  const [campaign, setCampaign]     = useState(null);
  const [dateFrom, setDateFrom]     = useState(today);
  const [dateTo, setDateTo]         = useState(today);
  const [clicks, setClicks]         = useState([]);
  const [clickId, setClickId]       = useState('');
  const [createdAt, setCreatedAt]   = useState('');
  const [payout, setPayout]         = useState('');
  const [type, setType]             = useState('Conversion');
  const [loadingClicks, setLoadingClicks] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]         = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const { data: campaignsData } = useQuery({
    queryKey: ['campaigns', 'all'],
    queryFn: () => api.getCampaigns({ per: 10000 }),
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
    setClicks([]);
    setClickId('');
    setCreatedAt('');
  }

  function presetDates(days) {
    const to = new Date();
    const from = days === 0 ? new Date() : new Date(Date.now() - days * 86400000);
    setDateFrom(from.toISOString().slice(0, 10));
    setDateTo(to.toISOString().slice(0, 10));
  }

  async function fetchClicks() {
    if (!campaign) return;
    setLoadingClicks(true);
    setClicks([]);
    setClickId('');
    try {
      const data = await api.getClicks({ campaign_id: campaign.id, date_from: dateFrom, date_to: dateTo });
      setClicks(data);
      if (data.length === 1) {
        setClickId(data[0].clickid);
        setCreatedAt(data[0].created_at || '');
      }
    } catch (err) {
      setResult({ ok: false, message: err.message });
    } finally {
      setLoadingClicks(false);
    }
  }

  function handleClickSelect(e) {
    const selected = clicks.find((c) => c.clickid === e.target.value);
    setClickId(e.target.value);
    setCreatedAt(selected?.created_at || '');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!clickId) return;
    setSubmitting(true);
    setResult(null);
    try {
      await api.updateRevenue({ clickid: clickId, created_at: createdAt, payout, type });
      setResult({ ok: true, message: 'Conversion recorded successfully.' });
    } catch (err) {
      setResult({ ok: false, message: err.message || 'Failed to record conversion.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Revenue Updater</h1>
        <p className="text-sm text-gray-500 mt-1">Record conversions in RedTrack</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Campaign search */}
        <div className="card p-5">
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

        {/* Date range + fetch clicks */}
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
          <button type="button" onClick={fetchClicks} disabled={!campaign || loadingClicks}
            className="btn-primary w-full">
            {loadingClicks ? 'Fetching clicks…' : 'Get Clicks'}
          </button>
        </div>

        {/* Click ID */}
        {clicks.length > 0 && (
          <div className="card p-5 space-y-3">
            <label className="label">Click ID</label>
            {clicks.length === 1 ? (
              <p className="text-sm text-gray-700 font-mono bg-gray-50 px-3 py-2 rounded">{clickId}</p>
            ) : (
              <select value={clickId} onChange={handleClickSelect} className="input w-full" required>
                <option value="">Select a click ID…</option>
                {clicks.map((c) => (
                  <option key={c.clickid} value={c.clickid}>{c.clickid}</option>
                ))}
              </select>
            )}
            {clicks.length === 0 && <p className="text-sm text-gray-400">No clicks found for this range.</p>}
          </div>
        )}

        {/* Payout + type */}
        <div className="card p-5 space-y-4">
          <div>
            <label className="label">Payout (USD)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input type="number" step="0.01" min="0" value={payout}
                onChange={(e) => setPayout(e.target.value)}
                placeholder="0.00" className="input w-full pl-7" required />
            </div>
          </div>
          <div>
            <label className="label">Conversion type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="input w-full">
              <option value="Conversion">Conversion</option>
              <option value="Lead">Lead</option>
              <option value="Sale">Sale</option>
            </select>
          </div>
        </div>

        {result && (
          <div className={`rounded-md px-4 py-3 text-sm ${result.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {result.message}
          </div>
        )}

        <button type="submit" disabled={!clickId || !payout || submitting} className="btn-primary w-full">
          {submitting ? 'Recording…' : 'Record Conversion'}
        </button>
      </form>
    </div>
  );
}
