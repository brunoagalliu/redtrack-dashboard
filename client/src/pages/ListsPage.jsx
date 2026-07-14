import { useState, useMemo, Fragment } from 'react';
import RoiFilterPopover from '../components/RoiFilterPopover';
import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getExpandedRowModel,
  flexRender,
} from '@tanstack/react-table';
import { api } from '../lib/api';

function fmtMoney(n) {
  const v = Number(n || 0);
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtRate(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }); }
function fmt(n)     { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function fmtDate(s) { return s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'; }

function StatusBadge({ days }) {
  if (days === null || days === undefined) return null;
  const d = Number(days);
  if (d < 14) return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Active</span>;
  if (d < 28) return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">Cooling {d}d</span>;
  return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Idle {d}d</span>;
}

function SortIcon({ sorted }) {
  if (!sorted) return <span className="text-gray-300 ml-0.5 text-[10px]">↕</span>;
  return <span className="text-indigo-500 ml-0.5 text-[10px]">{sorted === 'asc' ? '▲' : '▼'}</span>;
}

function CampaignRows({ listKey, days, colSpan }) {
  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'lists', 'campaigns', listKey, days],
    queryFn: () => api.getListCampaigns(listKey, days),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (isLoading) return (
    <tr><td colSpan={colSpan} className="px-4 py-4 bg-gray-50 text-center">
      <span className="inline-block w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
    </td></tr>
  );

  const rows = data?.rows || [];
  if (!rows.length) return (
    <tr><td colSpan={colSpan} className="px-4 py-3 bg-gray-50 text-xs text-gray-400 text-center">No campaigns found for this list.</td></tr>
  );

  return rows.map((c, i) => {
    const profit = Number(c.profit);
    return (
      <tr key={c.id} className="bg-indigo-50/40 border-b border-indigo-100/60">
        <td className="w-8 border-r border-indigo-100" />
        <td className="px-3 py-2" colSpan={2}>
          <div className="font-mono text-xs text-gray-600 line-clamp-2" title={c.title}>{c.title}</div>
          <div className="text-xs text-gray-400 mt-0.5">{fmtDate(c.created_at)}{i === 0 ? ' · first use' : ''}</div>
        </td>
        <td className="px-3 py-2 text-xs text-center">
          <span className="px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-600 font-medium">{c.buyer}</span>
        </td>
        <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{[c.route, c.carrier].filter(Boolean).join(' · ')}</td>
        <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-600">{fmt(c.clicks)}</td>
        <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-600">{fmt(c.conversions)}</td>
        <td className="px-3 py-2 text-right tabular-nums text-xs font-medium text-gray-700">{fmtRate(c.epc)}</td>
        <td className={`px-3 py-2 text-right tabular-nums text-xs font-medium ${profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtMoney(profit)}</td>
        <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-400">{fmtDate(c.created_at)}</td>
      </tr>
    );
  });
}

export default function ListsPage() {
  const campaignDays = 180;
  const today = new Date().toISOString().slice(0, 10);
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(sixMonthsAgo);
  const [dateTo,   setDateTo]   = useState(today);
  const [search, setSearch] = useState('');
  const [roiMin, setRoiMin] = useState('');
  const [roiMax, setRoiMax] = useState('');
  const [sorting, setSorting] = useState([{ id: 'profit', desc: true }]);
  const [expanded, setExpanded] = useState({});

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'lists', dateFrom, dateTo],
    queryFn: () => api.getListsReport({ date_from: dateFrom, date_to: dateTo }),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const rows = data?.rows || [];
  const filtered = useMemo(() => {
    let result = rows.filter((r) => !search || r.list_key?.toLowerCase().includes(search.toLowerCase()));
    const min = roiMin !== '' ? Number(roiMin) : null;
    const max = roiMax !== '' ? Number(roiMax) : null;
    if (min !== null || max !== null) {
      result = result.filter((r) => {
        const roi = Number(r.roi);
        if (min !== null && roi < min) return false;
        if (max !== null && roi > max) return false;
        return true;
      });
    }
    return result;
  }, [rows, search, roiMin, roiMax]);

  const columns = useMemo(() => [
    {
      id: 'expand',
      header: '',
      size: 32,
      enableSorting: false,
      enableResizing: false,
      cell: ({ row }) => (
        <button
          onClick={() => row.toggleExpanded()}
          className="px-2 text-center text-gray-400 text-xs select-none"
        >
          {row.getIsExpanded() ? '▾' : '▸'}
        </button>
      ),
    },
    {
      id: 'list_key',
      accessorKey: 'list_key',
      header: 'List',
      size: 280,
      enableSorting: false,
    },
    {
      id: 'campaign_count',
      accessorKey: 'campaign_count',
      header: 'Camps',
      size: 64,
      enableSorting: true,
      meta: { right: true },
    },
    {
      id: 'clicks',
      accessorKey: 'clicks',
      header: 'Clicks',
      size: 80,
      enableSorting: true,
      meta: { right: true },
      cell: ({ getValue }) => fmt(getValue()),
    },
    {
      id: 'conversions',
      accessorKey: 'conversions',
      header: 'Conv',
      size: 64,
      enableSorting: true,
      meta: { right: true },
      cell: ({ getValue }) => fmt(getValue()),
    },
    {
      id: 'epc',
      accessorKey: 'epc',
      header: 'EPC',
      size: 80,
      enableSorting: true,
      meta: { right: true },
      cell: ({ getValue }) => fmtRate(getValue()),
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
        return <span className={v >= 0 ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>{fmtMoney(v)}</span>;
      },
    },
    {
      id: 'roi',
      accessorKey: 'roi',
      header: ({ column }) => (
        <div className="flex items-center justify-end gap-1">
          <span>ROI</span>
          <SortIcon sorted={column.getIsSorted()} />
          <RoiFilterPopover
            roiMin={roiMin}
            roiMax={roiMax}
            onMinChange={setRoiMin}
            onMaxChange={setRoiMax}
          />
        </div>
      ),
      size: 88,
      enableSorting: true,
      meta: { right: true, hasFilterHeader: true },
      cell: ({ getValue }) => {
        const v = Number(getValue());
        return <span className={v >= 0 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>{getValue()}%</span>;
      },
    },
    {
      id: 'days_since_last_use',
      accessorKey: 'days_since_last_use',
      header: 'Idle',
      size: 64,
      enableSorting: true,
      meta: { right: true },
      cell: ({ getValue }) => {
        const v = getValue();
        return <span className="text-gray-400">{v != null ? `${v}d` : '—'}</span>;
      },
    },
    {
      id: 'status',
      header: 'Status',
      size: 80,
      enableSorting: false,
      enableResizing: false,
      cell: ({ row }) => <StatusBadge days={row.original.days_since_last_use} />,
    },
  ], [roiMin, roiMax]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, expanded },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    columnResizeMode: 'onChange',
    getRowId: (row) => row.list_key,
  });

  const visibleLeafCount = table.getVisibleLeafColumns().length;

  return (
    <div className="p-8 max-w-screen-2xl space-y-5">

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Lists & Campaigns</h1>
        <p className="text-sm text-gray-500 mt-1">Click any list to expand all campaigns that used it, oldest to newest</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {/* Quick-select buttons */}
        <div className="flex items-end gap-1">
          {[7, 30, 90, 180].map((d) => {
            const from = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
            const active = dateFrom === from && dateTo === today;
            return (
              <button key={d} type="button"
                onClick={() => { setDateFrom(from); setDateTo(today); }}
                className={`px-2.5 py-1.5 text-xs font-medium rounded border transition-colors ${
                  active ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                {d}d
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">From</label>
          <input type="date" value={dateFrom} max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 bg-white" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">To</label>
          <input type="date" value={dateTo} min={dateFrom} max={today}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 bg-white" />
        </div>
        {/* Search */}
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input type="text" placeholder="Search list…" value={search} onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded pl-8 pr-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
        <span className="text-xs text-gray-400 ml-auto self-center">{table.getRowModel().rows.length} lists</span>
      </div>

      {isLoading && <div className="card p-10 text-center"><div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>}

      {!isLoading && filtered.length === 0 && (
        <div className="card p-10 text-center text-sm text-gray-400">No lists found — run a sync to populate list data.</div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm" style={{ tableLayout: 'fixed', width: '100%' }}>
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-gray-100 bg-gray-50/60">
                  {hg.headers.map((header) => {
                    const right = header.column.columnDef.meta?.right;
                    return (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        style={{ width: header.getSize(), position: 'relative' }}
                        className={`px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap overflow-hidden
                          ${right ? 'text-right' : 'text-left'}
                          ${header.column.getCanSort() ? 'cursor-pointer select-none hover:text-gray-700' : ''}`}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && !header.column.columnDef.meta?.hasFilterHeader && <SortIcon sorted={header.column.getIsSorted()} />}
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
                <Fragment key={row.id}>
                  <tr
                    onClick={() => row.toggleExpanded()}
                    className="hover:bg-indigo-50/30 cursor-pointer transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => {
                      const right = cell.column.columnDef.meta?.right;
                      return (
                        <td
                          key={cell.id}
                          style={{ width: cell.column.getSize() }}
                          className={`px-3 py-2.5 text-xs tabular-nums overflow-hidden ${right ? 'text-right text-gray-600' : 'text-left'} ${cell.column.id === 'list_key' ? 'font-mono text-gray-700 line-clamp-2' : ''}`}
                          title={cell.column.id === 'list_key' ? row.original.list_key : undefined}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                  {row.getIsExpanded() && (
                    <tr key={`${row.id}-expanded`}>
                      <td colSpan={visibleLeafCount} className="p-0">
                        <table className="w-full text-xs border-t border-indigo-100">
                          <thead>
                            <tr className="bg-indigo-50 border-b border-indigo-100">
                              <th className="w-8" />
                              <th className="px-3 py-2 text-left font-medium text-indigo-600 uppercase tracking-wide" colSpan={2}>Campaign title</th>
                              <th className="px-3 py-2 text-center font-medium text-indigo-600 uppercase tracking-wide">Buyer</th>
                              <th className="px-3 py-2 text-left font-medium text-indigo-600 uppercase tracking-wide">Route · Carrier</th>
                              <th className="px-3 py-2 text-right font-medium text-indigo-600 uppercase tracking-wide">Clicks {campaignDays}d</th>
                              <th className="px-3 py-2 text-right font-medium text-indigo-600 uppercase tracking-wide">Conv {campaignDays}d</th>
                              <th className="px-3 py-2 text-right font-medium text-indigo-600 uppercase tracking-wide">EPC {campaignDays}d</th>
                              <th className="px-3 py-2 text-right font-medium text-indigo-600 uppercase tracking-wide">Profit {campaignDays}d</th>
                              <th className="px-3 py-2 text-right font-medium text-indigo-600 uppercase tracking-wide">Created</th>
                            </tr>
                          </thead>
                          <tbody>
                            <CampaignRows listKey={row.id} days={campaignDays} colSpan={visibleLeafCount} />
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
