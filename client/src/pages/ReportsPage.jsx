import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

const BUYERS = ['TK', 'MA', 'DS'];

const BUYER_COLORS = {
  TK: 'bg-blue-100 text-blue-700',
  MA: 'bg-purple-100 text-purple-700',
  DS: 'bg-orange-100 text-orange-700',
};

const BUYER_ROW_BG = {
  TK: 'bg-blue-50',
  MA: 'bg-purple-50',
  DS: 'bg-orange-50',
};

function fmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtMoney(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function profitClass(n) {
  return Number(n) >= 0 ? 'text-green-600' : 'text-red-600';
}

function SyncButton({ dateFrom, dateTo, onSynced }) {
  const [syncState, setSyncState] = useState(null); // null | object
  const pollRef = useRef(null);

  async function startSync() {
    try {
      const res = await fetch('/api/reports/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
      });
      const data = await res.json();
      setSyncState(data);
      pollRef.current = setInterval(pollStatus, 2000);
    } catch {
      setSyncState({ status: 'error', error: 'Failed to start sync' });
    }
  }

  async function pollStatus() {
    try {
      const res = await fetch('/api/reports/sync/status', {
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });
      const data = await res.json();
      setSyncState(data);
      if (data.status === 'complete' || data.status === 'error') {
        clearInterval(pollRef.current);
        if (data.status === 'complete') onSynced();
      }
    } catch { /* ignore */ }
  }

  useEffect(() => () => clearInterval(pollRef.current), []);

  const running = syncState?.status === 'running';
  const done    = syncState?.status === 'complete';
  const err     = syncState?.status === 'error';

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={startSync}
        disabled={running}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {running ? (
          <>
            <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Syncing {syncState.total > 0 ? `(${syncState.processed}/${syncState.total})` : '…'}
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Sync Data
          </>
        )}
      </button>
      {done && <span className="text-xs text-green-600 font-medium">Sync complete</span>}
      {err  && <span className="text-xs text-red-500">Error: {syncState.error}</span>}
    </div>
  );
}

export default function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(sevenDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [applied, setApplied] = useState({ date_from: sevenDaysAgo, date_to: today });
  const [expandedBuyers, setExpandedBuyers] = useState({});

  const queryClient = useQueryClient();

  const { data: syncStatus, refetch: refetchStatus } = useQuery({
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
  }

  function onSynced() {
    queryClient.invalidateQueries({ queryKey: ['reports', 'media-buyers'] });
    refetchStatus();
  }

  function toggleBuyer(buyer) {
    setExpandedBuyers((prev) => ({ ...prev, [buyer]: !prev[buyer] }));
  }

  const buyers = data?.buyers || {};

  const totals = BUYERS.reduce(
    (acc, b) => {
      const s = buyers[b]?.totals || {};
      return {
        clicks:      acc.clicks      + (s.clicks      || 0),
        conversions: acc.conversions + (s.conversions  || 0),
        cost:        acc.cost        + (s.cost         || 0),
        revenue:     acc.revenue     + (s.revenue      || 0),
        profit:      acc.profit      + (s.profit       || 0),
      };
    },
    { clicks: 0, conversions: 0, cost: 0, revenue: 0, profit: 0 }
  );

  const noData = !isLoading && data && BUYERS.every((b) => !buyers[b]?.campaigns?.length);

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Media buyer performance</p>
      </div>

      {/* Controls */}
      <div className="card p-4 mb-6 flex flex-wrap items-end gap-4">
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
        <button type="button" onClick={applyRange} disabled={isFetching} className="btn-primary">
          {isFetching ? 'Loading…' : 'Apply'}
        </button>
        <div className="ml-auto">
          <SyncButton
            dateFrom={applied.date_from}
            dateTo={applied.date_to}
            onSynced={onSynced}
          />
        </div>
      </div>

      {/* Sync status banner */}
      {syncStatus && syncStatus.status !== 'idle' && (
        <div className={`rounded-md px-4 py-2.5 mb-4 text-sm flex items-center gap-2 ${
          syncStatus.status === 'complete' ? 'bg-green-50 text-green-700 border border-green-200' :
          syncStatus.status === 'running'  ? 'bg-blue-50 text-blue-700 border border-blue-200' :
          syncStatus.status === 'error'    ? 'bg-red-50 text-red-700 border border-red-200' :
          'bg-gray-50 text-gray-600 border border-gray-200'
        }`}>
          {syncStatus.status === 'running' && (
            <span className="inline-block w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin shrink-0" />
          )}
          {syncStatus.status === 'complete' && <span>✓</span>}
          {syncStatus.status === 'error'    && <span>✗</span>}
          <span>
            {syncStatus.status === 'running' && `Sync in progress — ${syncStatus.processed} / ${syncStatus.total} campaigns`}
            {syncStatus.status === 'complete' && `Last sync completed ${new Date(syncStatus.completed_at).toLocaleString()} — ${syncStatus.total} campaigns`}
            {syncStatus.status === 'error'    && `Last sync failed: ${syncStatus.error}`}
          </span>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-6">
          {error?.message || 'Failed to load report.'}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="card p-8 text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
          <p className="text-sm font-medium text-gray-700">Loading report…</p>
        </div>
      )}

      {/* No data */}
      {noData && (
        <div className="card p-8 text-center text-sm text-gray-500">
          No data for this date range. Use <strong>Sync Data</strong> to fetch stats from RedTrack.
        </div>
      )}

      {/* Report table */}
      {!isLoading && !noData && data && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-8" />
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Buyer / Campaign</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Clicks</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Conv.</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Spend</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Revenue</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {BUYERS.map((buyer) => {
                const group = buyers[buyer];
                if (!group?.campaigns?.length) return null;
                const t = group.totals;
                const expanded = expandedBuyers[buyer];

                return (
                  <>
                    {/* Buyer summary row */}
                    <tr
                      key={`buyer-${buyer}`}
                      className={`cursor-pointer hover:brightness-95 ${BUYER_ROW_BG[buyer]}`}
                      onClick={() => toggleBuyer(buyer)}
                    >
                      <td className="px-4 py-3 text-gray-400">
                        <svg
                          className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${BUYER_COLORS[buyer]}`}>
                            {buyer}
                          </span>
                          <span className="text-sm font-semibold text-gray-800">
                            {group.campaigns.length} campaign{group.campaigns.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-sm font-semibold text-gray-800">{fmt(t.clicks)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-sm font-semibold text-gray-800">{fmt(t.conversions)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-sm font-semibold text-gray-800">{fmtMoney(t.cost)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-sm font-semibold text-gray-800">{fmtMoney(t.revenue)}</td>
                      <td className={`px-5 py-3 text-right tabular-nums text-sm font-bold ${profitClass(t.profit)}`}>
                        {fmtMoney(t.profit)}
                      </td>
                    </tr>

                    {/* Per-campaign rows */}
                    {expanded && group.campaigns.map((c) => (
                      <tr key={`${buyer}-${c.id}`} className="hover:bg-gray-50 bg-white">
                        <td className="px-4 py-2" />
                        <td className="px-5 py-2 pl-12 text-xs text-gray-600 max-w-xs truncate" title={c.title}>
                          {c.title}
                        </td>
                        <td className="px-5 py-2 text-right tabular-nums text-xs text-gray-700">{fmt(c.clicks)}</td>
                        <td className="px-5 py-2 text-right tabular-nums text-xs text-gray-700">{fmt(c.conversions)}</td>
                        <td className="px-5 py-2 text-right tabular-nums text-xs text-gray-700">{fmtMoney(c.cost)}</td>
                        <td className="px-5 py-2 text-right tabular-nums text-xs text-gray-700">{fmtMoney(c.revenue)}</td>
                        <td className={`px-5 py-2 text-right tabular-nums text-xs font-medium ${profitClass(c.profit)}`}>
                          {fmtMoney(c.profit)}
                        </td>
                      </tr>
                    ))}
                  </>
                );
              })}

              {/* Grand totals */}
              <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                <td className="px-4 py-4" />
                <td className="px-5 py-4 text-sm text-gray-900">Total</td>
                <td className="px-5 py-4 text-right tabular-nums text-sm text-gray-900">{fmt(totals.clicks)}</td>
                <td className="px-5 py-4 text-right tabular-nums text-sm text-gray-900">{fmt(totals.conversions)}</td>
                <td className="px-5 py-4 text-right tabular-nums text-sm text-gray-900">{fmtMoney(totals.cost)}</td>
                <td className="px-5 py-4 text-right tabular-nums text-sm text-gray-900">{fmtMoney(totals.revenue)}</td>
                <td className={`px-5 py-4 text-right tabular-nums text-sm font-bold ${profitClass(totals.profit)}`}>
                  {fmtMoney(totals.profit)}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="px-5 py-2 border-t border-gray-100 text-xs text-gray-400">
            {applied.date_from} → {applied.date_to}
          </div>
        </div>
      )}
    </div>
  );
}
