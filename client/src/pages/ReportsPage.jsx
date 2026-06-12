import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

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

  const queryClient = useQueryClient();

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
          {/* Summary chips */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
            {(buyerFilter === 'ALL' ? BUYERS : [buyerFilter]).map((b) => {
              const campaigns = allCampaigns.filter((c) => c.buyer === b);
              if (!campaigns.length) return null;
              return (
                <button
                  key={b}
                  onClick={() => handleBuyerFilter(buyerFilter === b ? 'ALL' : b)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                    buyerFilter === b || buyerFilter === 'ALL'
                      ? BUYER_COLORS[b] + ' border-transparent'
                      : 'bg-gray-50 text-gray-400 border-gray-200'
                  }`}
                >
                  <span>{b}</span>
                  <span className="opacity-70">{campaigns.length}</span>
                </button>
              );
            })}
            <span className="ml-auto text-xs text-gray-400">{filtered.length} campaigns</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">Buyer</th>
                  <Th col="title" label="Campaign" />
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Partner</th>
                  <Th col="clicks" label="Clicks" right />
                  <Th col="conversions" label="Conv." right />
                  <Th col="cost" label="Spend" right />
                  <Th col="revenue" label="Revenue" right />
                  <Th col="profit" label="Profit" right />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paged.map((c) => (
                  <tr key={`${c.buyer}-${c.id}`} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${BUYER_COLORS[c.buyer]}`}>
                        {c.buyer}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-700 max-w-xs truncate" title={c.title}>
                      {c.title}
                    </td>
                    <td className="px-4 py-2.5 text-left">
                      {c.data_partner
                        ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-700">{c.data_partner}</span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-sm text-gray-800">{fmt(c.clicks)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-sm text-gray-800">{fmt(c.conversions)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-sm text-gray-800">{fmtMoney(c.cost)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-sm text-gray-800">{fmtMoney(c.revenue)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums text-sm font-medium ${Number(c.profit) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {fmtMoney(c.profit)}
                    </td>
                  </tr>
                ))}

                {/* Totals */}
                <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-sm text-gray-700">Total</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right tabular-nums text-sm text-gray-900">{fmt(totals.clicks)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm text-gray-900">{fmt(totals.conversions)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm text-gray-900">{fmtMoney(totals.cost)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm text-gray-900">{fmtMoney(totals.revenue)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums text-sm font-bold ${totals.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {fmtMoney(totals.profit)}
                  </td>
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
