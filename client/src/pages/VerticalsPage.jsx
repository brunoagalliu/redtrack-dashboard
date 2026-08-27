import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import ColumnPicker from '../components/ColumnPicker';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';
import { api } from '../lib/api';
import { downloadCSV } from '../lib/csvDownload';

const VERTICALS_ALL_COLUMNS = [
  { id: 'buyer',       label: 'Buyer',    defaultVisible: true },
  { id: 'title',       label: 'Campaign', defaultVisible: true },
  { id: 'clicks',      label: 'Clicks',   defaultVisible: true },
  { id: 'conversions', label: 'Conv.',    defaultVisible: true },
  { id: 'cost',        label: 'Spend',    defaultVisible: true },
  { id: 'revenue',     label: 'Revenue',  defaultVisible: true },
  { id: 'profit',      label: 'Profit',   defaultVisible: true },
];
const VERTICALS_CONFIGURABLE_IDS = VERTICALS_ALL_COLUMNS.map((c) => c.id);
const VERTICALS_FIXED_START = ['vertical'];
const VERTICALS_STORAGE_KEY = 'rt_verticals_col_config';

function loadVerticalsColConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(VERTICALS_STORAGE_KEY));
    if (saved?.order && saved?.visible) {
      const newIds = VERTICALS_CONFIGURABLE_IDS.filter((id) => !saved.order.includes(id));
      return {
        order:   [...saved.order, ...newIds],
        visible: { ...Object.fromEntries(VERTICALS_ALL_COLUMNS.map((c) => [c.id, c.defaultVisible])), ...saved.visible },
      };
    }
  } catch {}
  return {
    order:   VERTICALS_ALL_COLUMNS.map((c) => c.id),
    visible: Object.fromEntries(VERTICALS_ALL_COLUMNS.map((c) => [c.id, c.defaultVisible])),
  };
}

function saveVerticalsColConfig(order, visible) {
  localStorage.setItem(VERTICALS_STORAGE_KEY, JSON.stringify({ order, visible }));
}

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

function SortIcon({ sorted }) {
  if (!sorted) return (
    <svg className="w-3.5 h-3.5 text-gray-300 ml-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  );
  return sorted === 'asc'
    ? <svg className="w-3.5 h-3.5 text-blue-500 ml-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
    : <svg className="w-3.5 h-3.5 text-blue-500 ml-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
}

export default function VerticalsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(sixMonthsAgo);
  const [dateTo, setDateTo] = useState(today);
  const [applied, setApplied] = useState({ date_from: sixMonthsAgo, date_to: today });
  const [verticalFilter, setVerticalFilter] = useState('ALL');
  const [buyerFilter, setBuyerFilter] = useState('ALL');
  const [partnerFilter, setPartnerFilter] = useState('ALL');
  const [sorting, setSorting] = useState([{ id: 'clicks', desc: true }]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 });
  const [showColPicker, setShowColPicker] = useState(false);
  const initVerticalsCfg = useMemo(() => loadVerticalsColConfig(), []);
  const [columnVisibility, setColumnVisibility] = useState(() => initVerticalsCfg.visible);
  const [columnOrder,      setColumnOrder]      = useState(() => [...VERTICALS_FIXED_START, ...initVerticalsCfg.order]);

  useEffect(() => {
    const configOrder = columnOrder.filter((id) => VERTICALS_CONFIGURABLE_IDS.includes(id));
    saveVerticalsColConfig(configOrder, columnVisibility);
  }, [columnOrder, columnVisibility]);

  const { data: syncStatus } = useQuery({
    queryKey: ['reports', 'sync-status'],
    queryFn: () => fetch('/api/reports/sync/status', {
      headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
    }).then((r) => r.json()),
    staleTime: 0,
    refetchInterval: (query) => query.state.data?.status === 'running' ? 3000 : false,
  });

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['reports', 'verticals', applied.date_from, applied.date_to],
    queryFn: () => api.getVerticalsReport(applied),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  function applyRange() {
    setApplied({ date_from: dateFrom, date_to: dateTo });
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  const allCampaigns = useMemo(() => {
    if (!data?.verticals) return [];
    return Object.entries(data.verticals).flatMap(([vertical, group]) =>
      group.campaigns.map((c) => ({ ...c, vertical }))
    );
  }, [data]);

  const verticalNames = data?.verticalNames || [];

  const allPartners = useMemo(() => {
    const set = new Set(allCampaigns.map(c => c.data_partner).filter(Boolean));
    return [...set].sort();
  }, [allCampaigns]);

  const filtered = useMemo(() => {
    let list = allCampaigns;
    if (verticalFilter !== 'ALL') list = list.filter((c) => c.vertical === verticalFilter);
    if (buyerFilter !== 'ALL') list = list.filter((c) => c.buyer === buyerFilter);
    if (partnerFilter !== 'ALL') list = list.filter((c) => c.data_partner === partnerFilter);
    return list;
  }, [allCampaigns, verticalFilter, buyerFilter, partnerFilter]);

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

  const columns = useMemo(() => [
    {
      id: 'vertical',
      accessorKey: 'vertical',
      header: 'Vertical',
      size: 120,
      enableSorting: true,
      cell: ({ getValue }) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700">
          {getValue()}
        </span>
      ),
    },
    {
      id: 'buyer',
      accessorKey: 'buyer',
      header: 'Buyer',
      size: 64,
      enableSorting: true,
      cell: ({ getValue }) => {
        const b = getValue();
        return (
          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${BUYER_COLORS[b] || 'bg-gray-100 text-gray-600'}`}>
            {b}
          </span>
        );
      },
    },
    {
      id: 'title',
      accessorKey: 'title',
      header: 'Campaign',
      size: 260,
      enableSorting: true,
      cell: ({ getValue }) => (
        <span className="text-sm text-gray-700 line-clamp-2" title={getValue()}>{getValue()}</span>
      ),
    },
    {
      id: 'clicks',
      accessorKey: 'clicks',
      header: 'Clicks',
      size: 88,
      enableSorting: true,
      meta: { right: true },
      cell: ({ getValue }) => fmt(getValue()),
    },
    {
      id: 'conversions',
      accessorKey: 'conversions',
      header: 'Conv.',
      size: 72,
      enableSorting: true,
      meta: { right: true },
      cell: ({ getValue }) => fmt(getValue()),
    },
    {
      id: 'cost',
      accessorKey: 'cost',
      header: 'Spend',
      size: 96,
      enableSorting: true,
      meta: { right: true },
      cell: ({ getValue }) => fmtMoney(getValue()),
    },
    {
      id: 'revenue',
      accessorKey: 'revenue',
      header: 'Revenue',
      size: 96,
      enableSorting: true,
      meta: { right: true },
      cell: ({ getValue }) => fmtMoney(getValue()),
    },
    {
      id: 'profit',
      accessorKey: 'profit',
      header: 'Profit',
      size: 96,
      enableSorting: true,
      meta: { right: true },
      cell: ({ getValue }) => {
        const v = Number(getValue());
        return <span className={`font-medium ${v >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmtMoney(v)}</span>;
      },
    },
  ], []);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, pagination, columnVisibility, columnOrder },
    onSortingChange: (updater) => {
      setSorting(updater);
      setPagination((p) => ({ ...p, pageIndex: 0 }));
    },
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    columnResizeMode: 'onChange',
    getRowId: (row) => `${row.vertical}-${row.id}`,
  });

  const { pageIndex, pageSize } = table.getState().pagination;
  const noData = !isLoading && data && allCampaigns.length === 0;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Vertical performance</p>
        </div>
        <button
          onClick={() => downloadCSV(filtered.map(r => ({
            Buyer: r.buyer, Campaign: r.title, Clicks: r.clicks, Conversions: r.conversions,
            Spend: r.cost, Revenue: r.revenue, Profit: r.profit,
          })), `verticals_${dateFrom}_${dateTo}.csv`)}
          disabled={!filtered.length}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          CSV
        </button>
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
          <label className="label">Vertical</label>
          <select value={verticalFilter} onChange={(e) => { setVerticalFilter(e.target.value); setPagination((p) => ({ ...p, pageIndex: 0 })); }} className="input">
            <option value="ALL">All verticals</option>
            {verticalNames.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Buyer</label>
          <select value={buyerFilter} onChange={(e) => { setBuyerFilter(e.target.value); setPagination((p) => ({ ...p, pageIndex: 0 })); }} className="input">
            <option value="ALL">All buyers</option>
            {['TK', 'MA', 'DS', 'KG'].map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Data Partner</label>
          <select value={partnerFilter} onChange={(e) => { setPartnerFilter(e.target.value); setPagination((p) => ({ ...p, pageIndex: 0 })); }} className="input">
            <option value="ALL">All partners</option>
            {allPartners.map((p) => <option key={p} value={p}>{p}</option>)}
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
        </div>
      </div>

      {isError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
          {error?.message || 'Failed to load report.'}
        </div>
      )}

      {isLoading && (
        <div className="card p-10 text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
          <p className="text-sm text-gray-500">Loading report…</p>
        </div>
      )}

      {noData && (
        <div className="card p-10 text-center text-sm text-gray-500">
          No data for this date range. Click <strong>Sync</strong> to fetch from RedTrack.
        </div>
      )}

      {!isLoading && !noData && filtered.length > 0 && (
        <div className="card overflow-hidden">
          {/* Vertical chips */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
            {verticalNames.map((v) => {
              const count = allCampaigns.filter((c) => c.vertical === v).length;
              return (
                <button key={v}
                  onClick={() => { setVerticalFilter(verticalFilter === v ? 'ALL' : v); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                    verticalFilter === v
                      ? 'bg-indigo-100 text-indigo-700 border-transparent'
                      : verticalFilter === 'ALL'
                      ? 'bg-gray-100 text-gray-600 border-transparent'
                      : 'bg-gray-50 text-gray-400 border-gray-200'
                  }`}>
                  {v} <span className="opacity-60">{count}</span>
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-gray-400">{filtered.length} campaigns</span>
              <div className="relative">
                <button
                  onClick={() => setShowColPicker((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                  </svg>
                  Columns
                </button>
                {showColPicker && (
                  <ColumnPicker
                    allColumns={VERTICALS_ALL_COLUMNS}
                    fixedStart={VERTICALS_FIXED_START}
                    table={table}
                    onClose={() => setShowColPicker(false)}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="overflow-auto max-h-[calc(100vh-360px)]">
            <table className="w-full" style={{ tableLayout: 'fixed', width: '100%' }}>
              <thead className="sticky top-0 z-10">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-gray-200 bg-gray-50">
                    {hg.headers.map((header) => {
                      const right = header.column.columnDef.meta?.right;
                      return (
                        <th
                          key={header.id}
                          onClick={header.column.getToggleSortingHandler()}
                          style={{ width: header.getSize(), position: 'relative' }}
                          className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider select-none whitespace-nowrap overflow-hidden
                            ${right ? 'text-right' : 'text-left'}
                            ${header.column.getCanSort() ? 'cursor-pointer hover:text-gray-800 hover:bg-gray-100 transition-colors' : ''}`}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && <SortIcon sorted={header.column.getIsSorted()} />}
                          {header.column.getCanResize() && (
                            <div
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                              onClick={(e) => e.stopPropagation()}
                              className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none ${
                                header.column.getIsResizing() ? 'bg-blue-400' : 'bg-transparent hover:bg-gray-300'
                              }`}
                            />
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-gray-100">
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    {row.getVisibleCells().map((cell) => {
                      const right = cell.column.columnDef.meta?.right;
                      return (
                        <td
                          key={cell.id}
                          style={{ width: cell.column.getSize() }}
                          className={`px-4 py-2.5 text-sm tabular-nums overflow-hidden ${right ? 'text-right text-gray-800' : ''}`}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-10">
                <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                  {table.getVisibleLeafColumns().map((col) => {
                    const right = col.columnDef.meta?.right;
                    let content = null;
                    if      (col.id === 'vertical')     content = <span className="text-sm text-gray-700">Total</span>;
                    else if (col.id === 'clicks')       content = <span className="text-sm text-gray-900">{fmt(totals.clicks)}</span>;
                    else if (col.id === 'conversions')  content = <span className="text-sm text-gray-900">{fmt(totals.conversions)}</span>;
                    else if (col.id === 'cost')         content = <span className="text-sm text-gray-900">{fmtMoney(totals.cost)}</span>;
                    else if (col.id === 'revenue')      content = <span className="text-sm text-gray-900">{fmtMoney(totals.revenue)}</span>;
                    else if (col.id === 'profit')       content = <span className={`text-sm font-bold ${totals.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtMoney(totals.profit)}</span>;
                    return (
                      <td key={col.id} style={{ width: col.getSize() }}
                        className={`px-4 py-3 tabular-nums ${right ? 'text-right' : ''}`}>
                        {content}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Footer: date range + pagination */}
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{applied.date_from} → {applied.date_to}</span>
              <span>·</span>
              <span>{filtered.length} campaigns</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span>Rows</span>
                <select value={pageSize} onChange={(e) => { table.setPageSize(Number(e.target.value)); }}
                  className="border border-gray-200 rounded px-1.5 py-0.5 text-xs text-gray-700 bg-white">
                  {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              {table.getPageCount() > 1 && (
                <div className="flex items-center gap-1">
                  <button onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}
                    className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">«</button>
                  <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}
                    className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">‹</button>
                  <span className="px-3 py-1 text-xs text-gray-600">{pageIndex + 1} / {table.getPageCount()}</span>
                  <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}
                    className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">›</button>
                  <button onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}
                    className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">»</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
