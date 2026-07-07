import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';

// ── Column definitions ────────────────────────────────────────────────────────
const ALL_COLUMNS = [
  { key: 'title',        label: 'Campaign', type: 'title',  sortable: true,  defaultVisible: true  },
  { key: 'data_list',    label: 'List',     type: 'list',   sortable: true,  defaultVisible: true  },
  { key: 'data_partner', label: 'Partner',  type: 'badge',  sortable: false, defaultVisible: true  },
  { key: 'route',        label: 'Route',    type: 'text',   sortable: false, defaultVisible: false },
  { key: 'carrier',      label: 'Carrier',  type: 'text',   sortable: false, defaultVisible: false },
  { key: 'vertical',     label: 'Vertical', type: 'text',   sortable: false, defaultVisible: false },
  { key: 'clicks',       label: 'Clicks',   type: 'number', sortable: true,  defaultVisible: true  },
  { key: 'conversions',  label: 'Conv.',    type: 'number', sortable: true,  defaultVisible: true  },
  { key: 'cost',         label: 'Spend',    type: 'money',  sortable: true,  defaultVisible: true  },
  { key: 'revenue',      label: 'Revenue',  type: 'money',  sortable: true,  defaultVisible: true  },
  { key: 'profit',       label: 'Profit',   type: 'profit', sortable: true,  defaultVisible: true  },
  { key: 'cpc',          label: 'CPC',      type: 'rate',   sortable: false, defaultVisible: true  },
  { key: 'epc',          label: 'EPC',      type: 'rate',   sortable: false, defaultVisible: true  },
];

const STORAGE_KEY = 'rt_report_col_config';

function loadColConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.order && saved?.visible) return saved;
  } catch {}
  return {
    order:   ALL_COLUMNS.map((c) => c.key),
    visible: Object.fromEntries(ALL_COLUMNS.map((c) => [c.key, c.defaultVisible])),
  };
}

function saveColConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

const BUYERS = ['TK', 'MA', 'DS'];

const BUYER_COLORS = {
  TK: 'bg-blue-100 text-blue-700',
  MA: 'bg-purple-100 text-purple-700',
  DS: 'bg-orange-100 text-orange-700',
};

function fmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtMoney(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtRate(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function perClick(amount, clicks) {
  return clicks > 0 ? Number(amount) / Number(clicks) : 0;
}

function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) return (
    <svg className="w-3.5 h-3.5 text-gray-300 ml-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  );
  return sortDir === 'asc'
    ? <svg className="w-3.5 h-3.5 text-blue-500 ml-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
    : <svg className="w-3.5 h-3.5 text-blue-500 ml-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
}

function SyncButton({ dateFrom, dateTo, onSynced }) {
  const [state, setState] = useState(null);
  const pollRef = useRef(null);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  useEffect(() => () => stopPolling(), []);

  async function startSync() {
    try {
      const res = await fetch('/api/reports/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
      });
      setState(await res.json());
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch('/api/reports/sync/status', {
            headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
          });
          const data = await r.json();
          setState(data);
          if (data.status === 'complete' || data.status === 'error') {
            stopPolling();
            if (data.status === 'complete') onSynced();
          }
        } catch { stopPolling(); }
      }, 2000);
    } catch {
      setState({ status: 'error', error: 'Failed to start sync' });
    }
  }

  const running = state?.status === 'running';

  return (
    <button
      onClick={startSync}
      disabled={running}
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
    >
      {running ? (
        <>
          <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          {state.total > 0 ? `${state.processed} / ${state.total}` : 'Starting…'}
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Sync
        </>
      )}
    </button>
  );
}

function OsRows({ campaignId, offerId, dateFrom, dateTo }) {
  const { data: osStats, isLoading } = useQuery({
    queryKey: ['offer-os', campaignId, offerId, dateFrom, dateTo],
    queryFn: () => api.getOfferOsStats(campaignId, offerId, { date_from: dateFrom, date_to: dateTo }),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return (
    <tr>
      <td colSpan={20} className="px-4 py-1 text-xs text-gray-400 text-center bg-violet-50/20">Loading OS…</td>
    </tr>
  );
  if (!osStats?.length) return (
    <tr>
      <td colSpan={20} className="px-12 py-1 text-xs text-gray-400 bg-violet-50/20">No OS data yet — run a sync first.</td>
    </tr>
  );

  return osStats.map((s) => (
    <tr key={s.os} className="bg-violet-50/20 border-l-4 border-violet-100">
      <td className="px-4 py-1" />
      <td className="px-4 py-1 text-xs text-gray-600">
        <span className="ml-5 text-violet-300 mr-1.5 select-none">↳</span>
        <span className="font-medium">{s.os}</span>
      </td>
      <td className="px-4 py-1" />
      <td className="px-4 py-1 text-right tabular-nums text-xs text-gray-500">{fmt(s.clicks)}</td>
      <td className="px-4 py-1 text-right tabular-nums text-xs text-gray-500">{fmt(s.conversions)}</td>
      <td className="px-4 py-1 text-right tabular-nums text-xs text-gray-500">{fmtMoney(s.cost)}</td>
      <td className="px-4 py-1 text-right tabular-nums text-xs text-gray-500">{fmtMoney(s.revenue)}</td>
      <td className={`px-4 py-1 text-right tabular-nums text-xs font-medium ${Number(s.profit) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
        {fmtMoney(s.profit)}
      </td>
      <td className="px-4 py-1 text-right tabular-nums text-xs text-gray-400" title="Estimated — cost is prorated by click share">
        {fmtRate(perClick(s.cost, s.clicks))}
      </td>
      <td className="px-4 py-1 text-right tabular-nums text-xs font-medium text-gray-700" title="Revenue per click — directly reported, not prorated">
        {fmtRate(perClick(s.revenue, s.clicks))}
      </td>
    </tr>
  ));
}

function OfferRows({ campaignId, dateFrom, dateTo }) {
  const [expandedOfferIds, setExpandedOfferIds] = useState(new Set());

  const { data: offers, isLoading } = useQuery({
    queryKey: ['campaign-offers', campaignId, dateFrom, dateTo],
    queryFn: () => api.getCampaignOffers(campaignId, { date_from: dateFrom, date_to: dateTo }),
    staleTime: 5 * 60 * 1000,
  });

  function toggleOffer(offerId) {
    setExpandedOfferIds((prev) => {
      const next = new Set(prev);
      if (next.has(offerId)) next.delete(offerId); else next.add(offerId);
      return next;
    });
  }

  if (isLoading) return (
    <tr>
      <td colSpan={20} className="px-4 py-2 text-xs text-gray-400 text-center bg-gray-50/50">
        Loading offers…
      </td>
    </tr>
  );

  if (!offers?.length) return (
    <tr>
      <td colSpan={20} className="px-8 py-2 text-xs text-gray-400 bg-gray-50/50">
        No offer data yet — run a sync first.
      </td>
    </tr>
  );

  return offers.flatMap((o) => {
    const expanded = expandedOfferIds.has(o.offer_id);
    const rows = [
      <tr key={o.offer_id} className="bg-indigo-50/30 border-l-2 border-indigo-200">
        <td className="px-4 py-1.5" />
        <td className="px-4 py-1.5 text-xs text-gray-700 max-w-xs">
          <button
            onClick={() => toggleOffer(o.offer_id)}
            className="mr-1 text-indigo-200 hover:text-indigo-500 transition-colors text-xs select-none"
            title="Show OS breakdown"
          >
            {expanded ? '▼' : '▶'}
          </button>
          <span className="text-indigo-300 mr-1.5 select-none">↳</span>
          <span className="truncate" title={o.offer_name}>{o.offer_name}</span>
        </td>
        <td className="px-4 py-1.5" />
        <td className="px-4 py-1.5 text-right tabular-nums text-xs text-gray-600">{fmt(o.clicks)}</td>
        <td className="px-4 py-1.5 text-right tabular-nums text-xs text-gray-600">{fmt(o.conversions)}</td>
        <td className="px-4 py-1.5 text-right tabular-nums text-xs text-gray-600">{fmtMoney(o.cost)}</td>
        <td className="px-4 py-1.5 text-right tabular-nums text-xs text-gray-600">{fmtMoney(o.revenue)}</td>
        <td className={`px-4 py-1.5 text-right tabular-nums text-xs font-medium ${Number(o.profit) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {fmtMoney(o.profit)}
        </td>
        <td className="px-4 py-1.5 text-right tabular-nums text-xs text-gray-400" title="Estimated — cost is prorated by click share">
          {fmtRate(perClick(o.cost, o.clicks))}
        </td>
        <td className="px-4 py-1.5 text-right tabular-nums text-xs font-medium text-gray-700" title="Revenue per click — directly reported, not prorated">
          {fmtRate(perClick(o.revenue, o.clicks))}
        </td>
      </tr>,
    ];
    if (expanded) {
      rows.push(
        <OsRows key={`os-${o.offer_id}`} campaignId={campaignId} offerId={o.offer_id} dateFrom={dateFrom} dateTo={dateTo} />
      );
    }
    return rows;
  });
}

// ── Inline list name editor ───────────────────────────────────────────────────
function ListCell({ campaignId, value, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const inputRef = useRef(null);

  const { mutate, isPending } = useMutation({
    mutationFn: (v) => api.updateCampaignList(campaignId, v),
    onSuccess: (_, v) => { onSaved(campaignId, v); setEditing(false); },
  });

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  if (editing) {
    return (
      <div className="flex items-center gap-1 min-w-[160px]">
        <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') mutate(draft); if (e.key === 'Escape') setEditing(false); }}
          className="border border-indigo-300 rounded px-1.5 py-0.5 text-xs font-mono w-full outline-none focus:ring-1 focus:ring-indigo-400"
          disabled={isPending} />
        <button type="button" onClick={() => mutate(draft)} disabled={isPending}
          className="text-indigo-600 hover:text-indigo-800 text-xs font-medium shrink-0">✓</button>
        <button type="button" onClick={() => setEditing(false)}
          className="text-gray-400 hover:text-gray-600 text-xs shrink-0">✕</button>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => { setDraft(value || ''); setEditing(true); }}
      className="group flex items-center gap-1 text-left text-xs font-mono text-gray-600 hover:text-indigo-700 max-w-[200px] truncate"
      title={value || 'Click to set list name'}>
      <span className="truncate">{value || <span className="text-gray-300 italic">—</span>}</span>
      <span className="opacity-0 group-hover:opacity-100 text-gray-300 text-[10px] shrink-0">✎</span>
    </button>
  );
}

// ── Column picker panel ───────────────────────────────────────────────────────
function ColumnPicker({ config, onChange, onClose }) {
  const { order, visible } = config;

  function toggleVisible(key) {
    onChange({ ...config, visible: { ...visible, [key]: !visible[key] } });
  }

  function move(key, dir) {
    const idx = order.indexOf(key);
    const next = [...order];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onChange({ ...config, order: next });
  }

  return (
    <div className="absolute right-0 top-10 z-50 bg-white border border-gray-200 rounded-lg shadow-lg w-56 py-2">
      <div className="px-3 pb-2 border-b border-gray-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Columns</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {order.map((key) => {
          const col = ALL_COLUMNS.find((c) => c.key === key);
          if (!col) return null;
          return (
            <div key={key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50">
              <input type="checkbox" checked={!!visible[key]} onChange={() => toggleVisible(key)}
                className="rounded text-indigo-600 cursor-pointer" />
              <span className="text-sm text-gray-700 flex-1">{col.label}</span>
              <div className="flex flex-col">
                <button onClick={() => move(key, -1)} className="text-gray-300 hover:text-gray-600 text-[10px] leading-none">▲</button>
                <button onClick={() => move(key, 1)}  className="text-gray-300 hover:text-gray-600 text-[10px] leading-none">▼</button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-3 pt-2 border-t border-gray-100">
        <button onClick={() => onChange({ order: ALL_COLUMNS.map((c) => c.key), visible: Object.fromEntries(ALL_COLUMNS.map((c) => [c.key, c.defaultVisible])) })}
          className="text-xs text-gray-400 hover:text-gray-600">Reset to default</button>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(ninetyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [applied, setApplied] = useState({ date_from: ninetyDaysAgo, date_to: today });
  const [buyerFilter, setBuyerFilter] = useState('ALL');
  const [sortKey, setSortKey] = useState('clicks');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(50);
  const [expandedId, setExpandedId] = useState(null);
  const [colConfig, setColConfig] = useState(loadColConfig);
  const [showColPicker, setShowColPicker] = useState(false);
  const [listOverrides, setListOverrides] = useState({});

  const queryClient = useQueryClient();

  useEffect(() => saveColConfig(colConfig), [colConfig]);

  const handleColConfigChange = useCallback((cfg) => setColConfig(cfg), []);
  const handleListSaved = useCallback((id, val) => setListOverrides((prev) => ({ ...prev, [id]: val })), []);

  const visibleCols = colConfig.order
    .map((key) => ALL_COLUMNS.find((c) => c.key === key))
    .filter((c) => c && colConfig.visible[c.key]);

  const { data: syncStatus } = useQuery({
    queryKey: ['reports', 'sync-status'],
    queryFn: () => fetch('/api/reports/sync/status', {
      headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
    }).then((r) => r.json()),
    staleTime: 0,
    refetchInterval: (query) => query.state.data?.status === 'running' ? 3000 : false,
  });

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['reports', 'media-buyers', applied.date_from, applied.date_to],
    queryFn: () => api.getMediaBuyerReport(applied),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  function applyRange() {
    setApplied({ date_from: dateFrom, date_to: dateTo });
    setPage(0);
  }

  function onSynced() {
    queryClient.invalidateQueries({ queryKey: ['reports', 'media-buyers'] });
    queryClient.invalidateQueries({ queryKey: ['reports', 'sync-status'] });
  }

  function handleSort(col) {
    if (sortKey === col) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(col);
      setSortDir('desc');
    }
    setPage(0);
  }

  function handleBuyerFilter(val) {
    setBuyerFilter(val);
    setPage(0);
  }

  // Flatten all campaigns into one list
  const allCampaigns = useMemo(() => {
    if (!data?.buyers) return [];
    return BUYERS.flatMap((buyer) =>
      (data.buyers[buyer]?.campaigns || []).map((c) => ({ ...c, buyer }))
    );
  }, [data]);

  const filtered = useMemo(() => {
    const list = buyerFilter === 'ALL' ? allCampaigns : allCampaigns.filter((c) => c.buyer === buyerFilter);
    return [...list].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [allCampaigns, buyerFilter, sortKey, sortDir]);

  const totals = useMemo(() => filtered.reduce(
    (acc, c) => ({
      clicks:      acc.clicks      + (c.clicks      || 0),
      conversions: acc.conversions + (c.conversions  || 0),
      cost:        acc.cost        + (c.cost         || 0),
      revenue:     acc.revenue     + (c.revenue      || 0),
      profit:      acc.profit      + (c.profit       || 0),
    }),
    { clicks: 0, conversions: 0, cost: 0, revenue: 0, profit: 0 }
  ), [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice(page * perPage, page * perPage + perPage);

  function Th({ col, label, right }) {
    return (
      <th
        onClick={() => handleSort(col)}
        className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-800 hover:bg-gray-100 transition-colors ${right ? 'text-right' : 'text-left'}`}
      >
        {label}<SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </th>
    );
  }

  const noData = !isLoading && data && allCampaigns.length === 0;

  return (
    <div className="p-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Media buyer performance</p>
      </div>

      {/* Controls */}
      <div className="card p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">From</label>
          <input type="date" value={dateFrom} max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" value={dateTo} min={dateFrom} max={today}
            onChange={(e) => setDateTo(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">Buyer</label>
          <select value={buyerFilter} onChange={(e) => handleBuyerFilter(e.target.value)} className="input">
            <option value="ALL">All buyers</option>
            {BUYERS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <button type="button" onClick={applyRange} disabled={isFetching} className="btn-primary">
          {isFetching ? 'Loading…' : 'Apply'}
        </button>
        <div className="ml-auto flex items-center gap-3">
          {syncStatus?.status === 'complete' && (
            <span className="text-xs text-gray-400">
              Last sync: {new Date(syncStatus.completed_at).toLocaleString()}
            </span>
          )}
          {syncStatus?.status === 'running' && (
            <span className="text-xs text-blue-500 font-medium">
              {syncStatus.phase === 'offers'
                ? `Syncing offers ${syncStatus.offer_sync?.processed ?? 0} / ${syncStatus.offer_sync?.total ?? '?'}…`
                : `Syncing campaigns ${syncStatus.processed} / ${syncStatus.total}…`}
            </span>
          )}
          <SyncButton dateFrom={applied.date_from} dateTo={applied.date_to} onSynced={onSynced} />
        </div>
      </div>

      {/* Error */}
      {isError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
          {error?.message || 'Failed to load report.'}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="card p-10 text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
          <p className="text-sm text-gray-500">Loading report…</p>
        </div>
      )}

      {/* No data */}
      {noData && (
        <div className="card p-10 text-center text-sm text-gray-500">
          No data for this date range. Click <strong>Sync</strong> to fetch from RedTrack.
        </div>
      )}

      {/* Table */}
      {!isLoading && !noData && filtered.length > 0 && (
        <div className="card overflow-hidden">
          {/* Summary chips + column picker */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
            {(buyerFilter === 'ALL' ? BUYERS : [buyerFilter]).map((b) => {
              const campaigns = allCampaigns.filter((c) => c.buyer === b);
              if (!campaigns.length) return null;
              return (
                <button key={b} onClick={() => handleBuyerFilter(buyerFilter === b ? 'ALL' : b)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                    buyerFilter === b || buyerFilter === 'ALL' ? BUYER_COLORS[b] + ' border-transparent' : 'bg-gray-50 text-gray-400 border-gray-200'
                  }`}>
                  <span>{b}</span><span className="opacity-70">{campaigns.length}</span>
                </button>
              );
            })}
            <span className="ml-auto text-xs text-gray-400">{filtered.length} campaigns</span>
            <div className="relative">
              <button onClick={() => setShowColPicker((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" /></svg>
                Columns
              </button>
              {showColPicker && <ColumnPicker config={colConfig} onChange={handleColConfigChange} onClose={() => setShowColPicker(false)} />}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '44px' }} /> {/* buyer avatar */}
                <col style={{ width: '24px' }} /> {/* expand toggle */}
                {visibleCols.map((col) => (
                  <col key={col.key} style={{
                    width: col.key === 'title' ? '260px'
                         : col.key === 'data_list' ? '180px'
                         : col.key === 'data_partner' ? '90px'
                         : ['route','carrier','vertical'].includes(col.key) ? '90px'
                         : '100px'
                  }} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-2 py-3 w-11" />
                  <th className="px-1 py-3 w-6" />
                  {visibleCols.map((col) => {
                    const right = !['title','data_list','data_partner','route','carrier','vertical'].includes(col.key);
                    return col.sortable
                      ? <Th key={col.key} col={col.key === 'cpc' ? '__cpc' : col.key === 'epc' ? '__epc' : col.key} label={col.label} right={right} />
                      : <th key={col.key} className={`px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${right ? 'text-right' : 'text-left'}`}>{col.label}</th>;
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paged.map((c) => {
                  const listVal = listOverrides[c.id] !== undefined ? listOverrides[c.id] : c.data_list;
                  return (
                  <>
                  <tr key={`${c.buyer}-${c.id}`} className="hover:bg-gray-50 transition-colors">
                    <td className="px-2 py-2.5">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${BUYER_COLORS[c.buyer]}`}>{c.buyer}</span>
                    </td>
                    <td className="px-1 py-2.5">
                      <button onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                        className="text-gray-300 hover:text-indigo-500 transition-colors text-xs select-none" title="Show offers">
                        {expandedId === c.id ? '▼' : '▶'}
                      </button>
                    </td>
                    {visibleCols.map((col) => {
                      if (col.key === 'title') return (
                        <td key="title" className="px-3 py-2.5 overflow-hidden">
                          <span className="block truncate text-sm text-gray-700" title={c.title}>{c.title}</span>
                        </td>
                      );
                      if (col.key === 'data_list') return (
                        <td key="data_list" className="px-3 py-2.5 overflow-hidden">
                          <ListCell campaignId={c.id} value={listVal} onSaved={handleListSaved} />
                        </td>
                      );
                      if (col.key === 'data_partner') return (
                        <td key="data_partner" className="px-3 py-2.5 overflow-hidden">
                          {c.data_partner
                            ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-700 truncate max-w-full">{c.data_partner}</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                      );
                      if (['route','carrier','vertical'].includes(col.key)) return (
                        <td key={col.key} className="px-3 py-2.5 text-xs text-gray-500 overflow-hidden truncate">{c[col.key] || '—'}</td>
                      );
                      if (col.key === 'clicks')      return <td key="clicks"      className="px-3 py-2.5 text-right tabular-nums text-sm text-gray-800">{fmt(c.clicks)}</td>;
                      if (col.key === 'conversions') return <td key="conversions" className="px-3 py-2.5 text-right tabular-nums text-sm text-gray-800">{fmt(c.conversions)}</td>;
                      if (col.key === 'cost')        return <td key="cost"        className="px-3 py-2.5 text-right tabular-nums text-sm text-gray-800">{fmtMoney(c.cost)}</td>;
                      if (col.key === 'revenue')     return <td key="revenue"     className="px-3 py-2.5 text-right tabular-nums text-sm text-gray-800">{fmtMoney(c.revenue)}</td>;
                      if (col.key === 'profit')      return <td key="profit"      className={`px-3 py-2.5 text-right tabular-nums text-sm font-medium ${Number(c.profit) >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmtMoney(c.profit)}</td>;
                      if (col.key === 'cpc')         return <td key="cpc"         className="px-3 py-2.5 text-right tabular-nums text-sm text-gray-600">{fmtRate(perClick(c.cost, c.clicks))}</td>;
                      if (col.key === 'epc')         return <td key="epc"         className="px-3 py-2.5 text-right tabular-nums text-sm font-medium text-gray-700">{fmtRate(perClick(c.revenue, c.clicks))}</td>;
                      return null;
                    })}
                  </tr>
                  {expandedId === c.id && (
                    <OfferRows campaignId={c.id} dateFrom={applied.date_from} dateTo={applied.date_to} />
                  )}
                  </>
                  );
                })}

                {/* Totals */}
                <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                  <td className="px-2 py-3" />
                  <td className="px-1 py-3" />
                  {visibleCols.map((col, i) => {
                    if (i === 0) return <td key={col.key} className="px-3 py-3 text-sm text-gray-700">Total</td>;
                    if (col.key === 'clicks')      return <td key="clicks"      className="px-3 py-3 text-right tabular-nums text-sm text-gray-900">{fmt(totals.clicks)}</td>;
                    if (col.key === 'conversions') return <td key="conversions" className="px-3 py-3 text-right tabular-nums text-sm text-gray-900">{fmt(totals.conversions)}</td>;
                    if (col.key === 'cost')        return <td key="cost"        className="px-3 py-3 text-right tabular-nums text-sm text-gray-900">{fmtMoney(totals.cost)}</td>;
                    if (col.key === 'revenue')     return <td key="revenue"     className="px-3 py-3 text-right tabular-nums text-sm text-gray-900">{fmtMoney(totals.revenue)}</td>;
                    if (col.key === 'profit')      return <td key="profit"      className={`px-3 py-3 text-right tabular-nums text-sm font-bold ${totals.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtMoney(totals.profit)}</td>;
                    if (col.key === 'cpc')         return <td key="cpc"         className="px-3 py-3 text-right tabular-nums text-sm text-gray-900">{fmtRate(perClick(totals.cost, totals.clicks))}</td>;
                    if (col.key === 'epc')         return <td key="epc"         className="px-3 py-3 text-right tabular-nums text-sm text-gray-900">{fmtRate(perClick(totals.revenue, totals.clicks))}</td>;
                    return <td key={col.key} className="px-3 py-3" />;
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{applied.date_from} → {applied.date_to}</span>
              <span>·</span>
              <span>{filtered.length} campaigns</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span>Rows</span>
                <select
                  value={perPage}
                  onChange={(e) => { setPerPage(Number(e.target.value)); setPage(0); }}
                  className="border border-gray-200 rounded px-1.5 py-0.5 text-xs text-gray-700 bg-white"
                >
                  {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(0)}
                  disabled={page === 0}
                  className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >«</button>
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >‹</button>
                <span className="px-3 py-1 text-xs text-gray-600">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >›</button>
                <button
                  onClick={() => setPage(totalPages - 1)}
                  disabled={page >= totalPages - 1}
                  className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >»</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
