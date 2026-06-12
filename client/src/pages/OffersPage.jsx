import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

const BUYERS = ['TK', 'MA', 'DS'];

function fmt(n)      { return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function fmtMoney(n) { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtPct(n)   { return Number(n).toFixed(2) + '%'; }

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <span className="text-gray-300 ml-1">↕</span>;
  return <span className="text-blue-500 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

function SyncButton({ onSync, syncing, status }) {
  return (
    <button
      onClick={onSync}
      disabled={syncing}
      className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
    >
      {syncing ? (
        <>
          <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          Syncing offers… {status?.processed > 0 ? `${status.processed}/${status.total}` : ''}
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Sync Offers
        </>
      )}
    </button>
  );
}

export default function OffersPage() {
  const today   = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(weekAgo);
  const [dateTo,   setDateTo]   = useState(today);
  const [buyer,       setBuyer]       = useState('');
  const [vertical,   setVertical]   = useState('');
  const [route,      setRoute]      = useState('');
  const [carrier,    setCarrier]    = useState('');
  const [dataPartner, setDataPartner] = useState('');
  const [sortCol,  setSortCol]  = useState('profit');
  const [sortDir,  setSortDir]  = useState('desc');
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [syncing,  setSyncing]  = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const pollRef = useRef(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reports', 'offers', dateFrom, dateTo, buyer, vertical, route, carrier, dataPartner],
    queryFn: () => api.getOffersReport({ date_from: dateFrom, date_to: dateTo, buyer, vertical, route, carrier, data_partner: dataPartner }),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Poll offer sync status while running
  useEffect(() => {
    if (syncing) {
      pollRef.current = setInterval(async () => {
        try {
          const s = await api.getOfferSyncStatus();
          setSyncStatus(s);
          if (s.status !== 'running') {
            setSyncing(false);
            clearInterval(pollRef.current);
            queryClient.invalidateQueries({ queryKey: ['reports', 'offers'] });
          }
        } catch { /* ignore */ }
      }, 3000);
    }
    return () => clearInterval(pollRef.current);
  }, [syncing, queryClient]);

  async function handleSync() {
    setSyncing(true);
    setSyncStatus(null);
    try {
      await api.triggerOfferSync({ date_from: dateFrom, date_to: dateTo });
    } catch (err) {
      setSyncing(false);
      alert(err.message);
    }
  }

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
    setPage(1);
  }

  const rows = data?.rows || [];

  // Client-side sort
  const sorted = [...rows].sort((a, b) => {
    const av = Number(a[sortCol]) || 0;
    const bv = Number(b[sortCol]) || 0;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  // Pagination
  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  const cols = [
    { key: 'offer_name',   label: 'Offer',        align: 'left',  sortable: false },
    { key: 'buyer',        label: 'Buyer',        align: 'left',  sortable: false },
    { key: 'vertical',     label: 'Vertical',     align: 'left',  sortable: false },
    { key: 'route',        label: 'Route',        align: 'left',  sortable: false },
    { key: 'carrier',      label: 'Carrier',      align: 'left',  sortable: false },
    { key: 'data_partner', label: 'Data Partner', align: 'left',  sortable: false },
    { key: 'campaigns',    label: 'Campaigns',    align: 'right', sortable: true  },
    { key: 'clicks',       label: 'Clicks',       align: 'right', sortable: true  },
    { key: 'conversions',  label: 'Conv',         align: 'right', sortable: true  },
    { key: 'cvr',          label: 'CVR',          align: 'right', sortable: true  },
    { key: 'cost',         label: 'Cost',         align: 'right', sortable: true  },
    { key: 'revenue',      label: 'Revenue',      align: 'right', sortable: true  },
    { key: 'profit',       label: 'Profit',       align: 'right', sortable: true  },
    { key: 'roi',          label: 'ROI',          align: 'right', sortable: true  },
  ];

  return (
    <div className="p-8 max-w-full space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Offer Performance</h1>
          <p className="text-sm text-gray-500 mt-1">
            Which offers perform best by route, vertical, carrier, and buyer
          </p>
        </div>
        <SyncButton onSync={handleSync} syncing={syncing} status={syncStatus} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">From</label>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 bg-white" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">To</label>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 bg-white" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Buyer</label>
          <select value={buyer} onChange={e => { setBuyer(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 bg-white min-w-[80px]">
            <option value="">All</option>
            {BUYERS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Vertical</label>
          <select value={vertical} onChange={e => { setVertical(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 bg-white min-w-[100px]">
            <option value="">All</option>
            {(data?.verticals || []).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Route</label>
          <select value={route} onChange={e => { setRoute(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 bg-white min-w-[100px]">
            <option value="">All</option>
            {(data?.routes || []).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Carrier</label>
          <select value={carrier} onChange={e => { setCarrier(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 bg-white min-w-[100px]">
            <option value="">All</option>
            {(data?.carriers || []).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Data Partner</label>
          <select value={dataPartner} onChange={e => { setDataPartner(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 bg-white min-w-[100px]">
            <option value="">All</option>
            {(data?.dataPartners || []).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1 ml-auto">
          <label className="text-xs text-gray-500 font-medium">Rows</label>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 bg-white">
            {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {/* Empty state — no data synced yet */}
      {!isLoading && !isError && rows.length === 0 && !syncing && (
        <div className="card p-10 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
            <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700 mb-1">No offer data yet</p>
          <p className="text-xs text-gray-400 mb-4">
            Click "Sync Offers" to extract offer assignments from your campaigns and pull per-offer stats.
            Make sure the main campaign sync has run first.
          </p>
        </div>
      )}

      {isLoading && (
        <div className="card p-10 text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      )}

      {isError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          Failed to load offer data.
        </div>
      )}

      {/* Table */}
      {!isLoading && rows.length > 0 && (
        <>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{rows.length} combinations</span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">‹</button>
                <span className="px-2">Page {page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">›</button>
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    {cols.map(col => (
                      <th key={col.key}
                        onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                        className={`px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap
                          ${col.align === 'right' ? 'text-right' : 'text-left'}
                          ${col.sortable ? 'cursor-pointer select-none hover:text-gray-700' : ''}`}>
                        {col.label}
                        {col.sortable && <SortIcon col={col.key} sortCol={sortCol} sortDir={sortDir} />}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 max-w-[260px]">
                        <span className="block truncate text-xs font-medium text-gray-800" title={row.offer_name}>
                          {row.offer_name}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {row.buyer && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700">
                            {row.buyer}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {row.vertical && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700">
                            {row.vertical}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">{row.route || '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">{row.carrier || 'All'}</td>
                      <td className="px-3 py-2">
                        {row.data_partner
                          ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-700">{row.data_partner}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-700">{row.campaigns}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-700">{fmt(row.clicks)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-700">{fmt(row.conversions)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-700">{fmtPct(row.cvr)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-700">{fmtMoney(row.cost)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-700">{fmtMoney(row.revenue)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums text-xs font-semibold ${Number(row.profit) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {fmtMoney(row.profit)}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums text-xs font-semibold ${Number(row.roi) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {row.roi}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-1 text-xs text-gray-500">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">‹ Prev</button>
              <span className="px-2">Page {page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Next ›</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
