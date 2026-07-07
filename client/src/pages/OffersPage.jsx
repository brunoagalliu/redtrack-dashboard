import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';
import { api } from '../lib/api';

const BUYERS = ['TK', 'MA', 'DS'];

function fmt(n)      { return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function fmtMoney(n) { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtPct(n)   { return Number(n).toFixed(2) + '%'; }
function fmtRate(n)  { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }); }

function SortIcon({ sorted }) {
  if (!sorted) return <span className="text-gray-300 ml-1 text-[10px]">↕</span>;
  return <span className="text-blue-500 ml-1 text-[10px]">{sorted === 'asc' ? '▲' : '▼'}</span>;
}

export default function OffersPage() {
  const today   = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(weekAgo);
  const [dateTo,   setDateTo]   = useState(today);
  const [buyer,       setBuyer]       = useState('');
  const [vertical,    setVertical]    = useState('');
  const [route,       setRoute]       = useState('');
  const [carrier,     setCarrier]     = useState('');
  const [dataPartner, setDataPartner] = useState('');
  const [sorting, setSorting] = useState([{ id: 'profit', desc: true }]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reports', 'offers', dateFrom, dateTo, buyer, vertical, route, carrier, dataPartner],
    queryFn: () => api.getOffersReport({ date_from: dateFrom, date_to: dateTo, buyer, vertical, route, carrier, data_partner: dataPartner }),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const { data: mainSync } = useQuery({
    queryKey: ['sync', 'status'],
    queryFn: () => api.getSyncStatus(),
    refetchInterval: (query) => query.state.data?.status === 'running' ? 3000 : false,
  });

  const syncRunning = mainSync?.status === 'running';
  const syncPhase   = mainSync?.phase;

  const rows = useMemo(() => data?.rows || [], [data]);

  const columns = useMemo(() => [
    {
      id: 'offer_name',
      accessorKey: 'offer_name',
      header: 'Offer',
      size: 240,
      enableSorting: false,
      cell: ({ getValue }) => (
        <span className="block truncate text-xs font-medium text-gray-800" title={getValue()}>
          {getValue()}
        </span>
      ),
    },
    {
      id: 'buyer',
      accessorKey: 'buyer',
      header: 'Buyer',
      size: 64,
      enableSorting: false,
      cell: ({ getValue }) => {
        const b = getValue();
        return b ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700">{b}</span>
        ) : null;
      },
    },
    {
      id: 'vertical',
      accessorKey: 'vertical',
      header: 'Vertical',
      size: 80,
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue();
        return v ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700">{v}</span>
        ) : null;
      },
    },
    {
      id: 'route',
      accessorKey: 'route',
      header: 'Route',
      size: 80,
      enableSorting: false,
      cell: ({ getValue }) => <span className="text-xs text-gray-600">{getValue() || '—'}</span>,
    },
    {
      id: 'carrier',
      accessorKey: 'carrier',
      header: 'Carrier',
      size: 72,
      enableSorting: false,
      cell: ({ getValue }) => <span className="text-xs text-gray-600">{getValue() || 'All'}</span>,
    },
    {
      id: 'data_partner',
      accessorKey: 'data_partner',
      header: 'Data Partner',
      size: 96,
      enableSorting: false,
      cell: ({ getValue }) => {
        const p = getValue();
        return p
          ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-700">{p}</span>
          : <span className="text-gray-300 text-xs">—</span>;
      },
    },
    {
      id: 'campaigns',
      accessorKey: 'campaigns',
      header: 'Campaigns',
      size: 80,
      enableSorting: true,
      meta: { right: true },
      cell: ({ getValue }) => <span className="text-xs text-gray-700">{getValue()}</span>,
    },
    {
      id: 'clicks',
      accessorKey: 'clicks',
      header: 'Clicks',
      size: 80,
      enableSorting: true,
      meta: { right: true },
      cell: ({ getValue }) => <span className="text-xs text-gray-700">{fmt(getValue())}</span>,
    },
    {
      id: 'conversions',
      accessorKey: 'conversions',
      header: 'Conv',
      size: 64,
      enableSorting: true,
      meta: { right: true },
      cell: ({ getValue }) => <span className="text-xs text-gray-700">{fmt(getValue())}</span>,
    },
    {
      id: 'cvr',
      accessorKey: 'cvr',
      header: 'CVR',
      size: 64,
      enableSorting: true,
      meta: { right: true },
      cell: ({ getValue }) => <span className="text-xs text-gray-700">{fmtPct(getValue())}</span>,
    },
    {
      id: 'cost',
      accessorKey: 'cost',
      header: 'Cost',
      size: 88,
      enableSorting: true,
      meta: { right: true },
      cell: ({ getValue }) => <span className="text-xs text-gray-700">{fmtMoney(getValue())}</span>,
    },
    {
      id: 'revenue',
      accessorKey: 'revenue',
      header: 'Revenue',
      size: 88,
      enableSorting: true,
      meta: { right: true },
      cell: ({ getValue }) => <span className="text-xs text-gray-700">{fmtMoney(getValue())}</span>,
    },
    {
      id: 'profit',
      accessorKey: 'profit',
      header: 'Profit',
      size: 88,
      enableSorting: true,
      meta: { right: true },
      cell: ({ getValue }) => {
        const v = Number(getValue());
        return <span className={`text-xs font-semibold ${v >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmtMoney(v)}</span>;
      },
    },
    {
      id: 'roi',
      accessorKey: 'roi',
      header: 'ROI',
      size: 72,
      enableSorting: true,
      meta: { right: true },
      cell: ({ getValue }) => {
        const v = Number(getValue());
        return <span className={`text-xs font-semibold ${v >= 0 ? 'text-green-600' : 'text-red-500'}`}>{getValue()}%</span>;
      },
    },
    {
      id: 'cpc',
      accessorKey: 'cpc',
      header: 'CPC',
      size: 72,
      enableSorting: true,
      meta: { right: true },
      cell: ({ getValue }) => (
        <span className="text-xs text-gray-400" title="Estimated — cost is prorated by click share">
          {fmtRate(getValue())}
        </span>
      ),
    },
    {
      id: 'epc',
      accessorKey: 'epc',
      header: 'EPC',
      size: 72,
      enableSorting: true,
      meta: { right: true },
      cell: ({ getValue }) => (
        <span className="text-xs font-medium text-gray-700" title="Revenue per click — directly reported, not prorated">
          {fmtRate(getValue())}
        </span>
      ),
    },
  ], []);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, pagination },
    onSortingChange: (updater) => {
      setSorting(updater);
      setPagination((p) => ({ ...p, pageIndex: 0 }));
    },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    columnResizeMode: 'onChange',
    getRowId: (_row, idx) => String(idx),
  });

  const { pageIndex, pageSize } = table.getState().pagination;

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
        {syncRunning && (
          <span className="text-xs text-blue-500 font-medium flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            {syncPhase === 'offers' ? `Syncing offers ${mainSync?.offer_sync?.processed ?? 0}/${mainSync?.offer_sync?.total ?? '?'}…` : 'Syncing campaigns…'}
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">From</label>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
            className="border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 bg-white" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">To</label>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
            className="border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 bg-white" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Buyer</label>
          <select value={buyer} onChange={e => { setBuyer(e.target.value); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
            className="border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 bg-white min-w-[80px]">
            <option value="">All</option>
            {BUYERS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Vertical</label>
          <select value={vertical} onChange={e => { setVertical(e.target.value); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
            className="border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 bg-white min-w-[100px]">
            <option value="">All</option>
            {(data?.verticals || []).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Route</label>
          <select value={route} onChange={e => { setRoute(e.target.value); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
            className="border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 bg-white min-w-[100px]">
            <option value="">All</option>
            {(data?.routes || []).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Carrier</label>
          <select value={carrier} onChange={e => { setCarrier(e.target.value); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
            className="border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 bg-white min-w-[100px]">
            <option value="">All</option>
            {(data?.carriers || []).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Data Partner</label>
          <select value={dataPartner} onChange={e => { setDataPartner(e.target.value); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
            className="border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 bg-white min-w-[100px]">
            <option value="">All</option>
            {(data?.dataPartners || []).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1 ml-auto">
          <label className="text-xs text-gray-500 font-medium">Rows</label>
          <select value={pageSize} onChange={e => table.setPageSize(Number(e.target.value))}
            className="border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 bg-white">
            {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {/* Empty state */}
      {!isLoading && !isError && rows.length === 0 && !syncRunning && (
        <div className="card p-10 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
            <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700 mb-1">No offer data yet</p>
          <p className="text-xs text-gray-400">
            Use the Sync button on the Reports or Verticals page — it now syncs campaigns and offers together.
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
            {table.getPageCount() > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}
                  className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">‹</button>
                <span className="px-2">Page {pageIndex + 1} / {table.getPageCount()}</span>
                <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}
                  className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">›</button>
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ tableLayout: 'fixed', width: table.getTotalSize() }}>
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="border-b border-gray-200 bg-gray-50">
                      {hg.headers.map((header) => {
                        const right = header.column.columnDef.meta?.right;
                        return (
                          <th
                            key={header.id}
                            onClick={header.column.getToggleSortingHandler()}
                            style={{ width: header.getSize(), position: 'relative' }}
                            className={`px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap overflow-hidden
                              ${right ? 'text-right' : 'text-left'}
                              ${header.column.getCanSort() ? 'cursor-pointer select-none hover:text-gray-700' : ''}`}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getCanSort() && <SortIcon sorted={header.column.getIsSorted()} />}
                            {header.column.getCanResize() && (
                              <div
                                onMouseDown={header.getResizeHandler()}
                                onTouchStart={header.getResizeHandler()}
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
                    <tr key={row.id} className="hover:bg-gray-50">
                      {row.getVisibleCells().map((cell) => {
                        const right = cell.column.columnDef.meta?.right;
                        return (
                          <td key={cell.id} style={{ width: cell.column.getSize() }} className={`px-3 py-2 overflow-hidden ${right ? 'text-right tabular-nums' : ''}`}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {table.getPageCount() > 1 && (
            <div className="flex items-center justify-end gap-1 text-xs text-gray-500">
              <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}
                className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">‹ Prev</button>
              <span className="px-2">Page {pageIndex + 1} / {table.getPageCount()}</span>
              <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}
                className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Next ›</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
