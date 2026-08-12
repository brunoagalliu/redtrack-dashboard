import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import DateRangePicker from '../components/DateRangePicker';

const ALL_COLUMNS = [
  { key: 'click_id',        label: 'Click ID' },
  { key: 'type',            label: 'Type' },
  { key: 'unique',          label: 'Unique' },
  { key: 'click_time',      label: 'Click Time' },
  { key: 'campaign',        label: 'Campaign' },
  { key: 'campaign_id',     label: 'Campaign ID' },
  { key: 'traffic_channel', label: 'Traffic Channel' },
  { key: 'sub1',            label: 'Sub 1' },
  { key: 'sub2',            label: 'Sub 2' },
  { key: 'sub3',            label: 'Sub 3' },
  { key: 'sub4',            label: 'Sub 4' },
  { key: 'sub5',            label: 'Sub 5' },
  { key: 'country',         label: 'Country' },
  { key: 'city',            label: 'City' },
  { key: 'region',          label: 'Region' },
  { key: 'ip',              label: 'IP' },
  { key: 'user_agent',      label: 'User Agent' },
  { key: 'browser',         label: 'Browser' },
  { key: 'os',              label: 'OS' },
  { key: 'device',          label: 'Device' },
  { key: 'isp',             label: 'ISP' },
  { key: 'connection_type', label: 'Connection Type' },
  { key: 'offer',           label: 'Offer' },
  { key: 'offer_id',        label: 'Offer ID' },
  { key: 'network',         label: 'Network' },
  { key: 'external_id',     label: 'External ID' },
  { key: 'referer',         label: 'Referer' },
  { key: 'fingerprint',     label: 'Fingerprint' },
  { key: 'cost',            label: 'Cost' },
];

const DEFAULT_COLS = new Set([
  'click_id', 'click_time', 'campaign', 'traffic_channel',
  'sub1', 'sub2', 'sub3', 'country', 'device', 'os', 'browser', 'offer', 'cost',
]);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function yesterday() {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10);
}

export default function ClicksExportPage() {
  const [dateFrom, setDateFrom] = useState(yesterday);
  const [dateTo, setDateTo]     = useState(today);
  const [campaignId, setCampaignId] = useState('');
  const [sourceId,   setSourceId]   = useState('');
  const [networkId,  setNetworkId]  = useState('');
  const [offerId,    setOfferId]    = useState('');
  const [clickId,    setClickId]    = useState('');
  const [cols, setCols]             = useState(() => new Set(DEFAULT_COLS));
  const [downloading, setDownloading] = useState(false);
  const [error, setError]           = useState(null);

  const { data: campaigns = [] } = useQuery({ queryKey: ['clicks-export', 'campaigns'], queryFn: api.getClicksExportCampaigns });
  const { data: sources   = [] } = useQuery({ queryKey: ['clicks-export', 'sources'],   queryFn: api.getClicksExportSources });
  const { data: networks  = [] } = useQuery({ queryKey: ['clicks-export', 'networks'],  queryFn: api.getClicksExportNetworks });
  const { data: offers    = [] } = useQuery({ queryKey: ['clicks-export', 'offers'],    queryFn: api.getClicksExportOffers });

  function toggleCol(key) {
    setCols(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function selectAll()  { setCols(new Set(ALL_COLUMNS.map(c => c.key))); }
  function clearAll()   { setCols(new Set()); }
  function resetCols()  { setCols(new Set(DEFAULT_COLS)); }

  async function handleDownload() {
    if (!dateFrom || !dateTo) { setError('Select a date range.'); return; }
    if (!cols.size) { setError('Select at least one column.'); return; }

    setDownloading(true);
    setError(null);
    try {
      const params = {
        date_from:   dateFrom,
        date_to:     dateTo,
        campaign_id: campaignId || undefined,
        source_id:   sourceId   || undefined,
        network_id:  networkId  || undefined,
        offer_id:    offerId    || undefined,
        click_id:    clickId    || undefined,
        columns:     [...cols].join(','),
      };
      const res = await api.downloadClicksExport(params);
      if (!res) return;
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `clicks_${dateFrom}_to_${dateTo}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Download failed.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clicks Export</h1>
          <p className="text-sm text-gray-500 mt-0.5">Export raw click data from RedTrack as CSV</p>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {downloading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Downloading…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download CSV
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Filters</h2>

        {/* Date range */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date Range</label>
          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            onChange={({ from, to }) => { setDateFrom(from); setDateTo(to); }}
          />
        </div>

        {/* Dropdowns */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Campaign</label>
            <select
              value={campaignId}
              onChange={e => setCampaignId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All campaigns</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Traffic Channel</label>
            <select
              value={sourceId}
              onChange={e => setSourceId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All channels</option>
              {sources.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Offer Source (Network)</label>
            <select
              value={networkId}
              onChange={e => setNetworkId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All networks</option>
              {networks.map(n => <option key={n.id} value={n.id}>{n.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Offer</label>
            <select
              value={offerId}
              onChange={e => setOfferId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All offers</option>
              {offers.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
          </div>
        </div>

        {/* Click ID */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Click ID (optional)</label>
          <input
            type="text"
            value={clickId}
            onChange={e => setClickId(e.target.value)}
            placeholder="e.g. abc123xyz"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Columns */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Columns <span className="text-gray-400 font-normal">({cols.size} selected)</span></h2>
          <div className="flex items-center gap-2">
            <button onClick={selectAll} className="text-xs text-indigo-600 hover:text-indigo-800">Select all</button>
            <span className="text-gray-300">·</span>
            <button onClick={resetCols} className="text-xs text-indigo-600 hover:text-indigo-800">Reset</button>
            <span className="text-gray-300">·</span>
            <button onClick={clearAll} className="text-xs text-gray-500 hover:text-gray-800">Clear</button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-x-6 gap-y-2">
          {ALL_COLUMNS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={cols.has(key)}
                onChange={() => toggleCol(key)}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {downloading && (
        <p className="text-sm text-gray-500 text-center">
          Fetching click data from RedTrack — this may take a moment for large date ranges…
        </p>
      )}
    </div>
  );
}
