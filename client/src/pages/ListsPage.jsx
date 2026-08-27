import { useState, useMemo, useEffect, Fragment } from 'react';
import RoiFilterPopover from '../components/RoiFilterPopover';
import DateRangePicker from '../components/DateRangePicker';
import ColumnPicker from '../components/ColumnPicker';
import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getExpandedRowModel,
  flexRender,
} from '@tanstack/react-table';
import { api } from '../lib/api';
import { downloadCSV } from '../lib/csvDownload';

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

const LISTS_ALL_COLUMNS = [
  { id: 'campaign_count',     label: 'Camps',  defaultVisible: true },
  { id: 'clicks',             label: 'Clicks', defaultVisible: true },
  { id: 'conversions',        label: 'Conv',   defaultVisible: true },
  { id: 'epc',                label: 'EPC',    defaultVisible: true },
  { id: 'cost',               label: 'Cost',   defaultVisible: true },
  { id: 'profit',             label: 'Profit', defaultVisible: true },
  { id: 'roi',                label: 'ROI',    defaultVisible: true },
  { id: 'days_since_last_use',label: 'Idle',   defaultVisible: true },
  { id: 'status',             label: 'Status', defaultVisible: true },
];
const LISTS_CONFIGURABLE_IDS = LISTS_ALL_COLUMNS.map((c) => c.id);
const LISTS_FIXED_START = ['expand', 'list_key'];
const LISTS_STORAGE_KEY = 'rt_lists_col_config';

function loadListsColConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(LISTS_STORAGE_KEY));
    if (saved?.order && saved?.visible) {
      const newIds = LISTS_CONFIGURABLE_IDS.filter((id) => !saved.order.includes(id));
      return {
        order:   [...saved.order, ...newIds],
        visible: { ...Object.fromEntries(LISTS_ALL_COLUMNS.map((c) => [c.id, c.defaultVisible])), ...saved.visible },
      };
    }
  } catch {}
  return {
    order:   LISTS_ALL_COLUMNS.map((c) => c.id),
    visible: Object.fromEntries(LISTS_ALL_COLUMNS.map((c) => [c.id, c.defaultVisible])),
  };
}

function saveListsColConfig(order, visible) {
  localStorage.setItem(LISTS_STORAGE_KEY, JSON.stringify({ order, visible }));
}

function CampaignRows({ listKey, dateFrom, dateTo, colSpan }) {
  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'lists', 'campaigns', listKey, dateFrom, dateTo],
    queryFn: () => api.getListCampaigns(listKey, dateFrom, dateTo),
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
        <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-600">{fmtMoney(c.cost)}</td>
        <td className={`px-3 py-2 text-right tabular-nums text-xs font-medium ${profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtMoney(profit)}</td>
        <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-400">{fmtDate(c.created_at)}</td>
      </tr>
    );
  });
}

export default function ListsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(sixMonthsAgo);
  const [dateTo,   setDateTo]   = useState(today);
  const [search, setSearch] = useState('');
  const [roiMin, setRoiMin] = useState('');
  const [roiMax, setRoiMax] = useState('');
  const [hideNegativeRoi, setHideNegativeRoi] = useState(false);
  const [sorting, setSorting] = useState([{ id: 'profit', desc: true }]);
  const [expanded, setExpanded] = useState({});
  const [showColPicker, setShowColPicker] = useState(false);
  const initListsCfg = useMemo(() => loadListsColConfig(), []);
  const [columnVisibility, setColumnVisibility] = useState(() => initListsCfg.visible);
  const [columnOrder,      setColumnOrder]      = useState(() => [...LISTS_FIXED_START, ...initListsCfg.order]);

  useEffect(() => {
    const configOrder = columnOrder.filter((id) => LISTS_CONFIGURABLE_IDS.includes(id));
    saveListsColConfig(configOrder, columnVisibility);
  }, [columnOrder, columnVisibility]);

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
    if (hideNegativeRoi) {
      result = result.filter((r) => Number(r.roi) >= 0);
    }
    return result;
  }, [rows, search, roiMin, roiMax, hideNegativeRoi]);

  const totals = useMemo(() => {
    if (!filtered.length) return null;
    const clicks      = filtered.reduce((s, r) => s + Number(r.clicks      || 0), 0);
    const conversions = filtered.reduce((s, r) => s + Number(r.conversions || 0), 0);
    const revenue     = filtered.reduce((s, r) => s + Number(r.revenue     || 0), 0);
    const cost        = filtered.reduce((s, r) => s + Number(r.cost        || 0), 0);
    const profit      = filtered.reduce((s, r) => s + Number(r.profit      || 0), 0);
    const campaigns   = filtered.reduce((s, r) => s + Number(r.campaign_count || 0), 0);
    const epc         = clicks > 0 ? revenue / clicks : 0;
    const roi         = cost   > 0 ? (profit / cost) * 100 : 0;
    return { clicks, conversions, revenue, cost, profit, campaigns, epc, roi };
  }, [filtered]);

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
      id: 'cost',
      accessorKey: 'cost',
      header: 'Cost',
      size: 88,
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
    state: { sorting, expanded, columnVisibility, columnOrder },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    columnResizeMode: 'onChange',
    getRowId: (row) => row.list_key,
  });

  const visibleLeafCount = table.getVisibleLeafColumns().length;

  return (
    <div className="p-8 max-w-screen-2xl space-y-5">

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lists & Campaigns</h1>
          <p className="text-sm text-gray-500 mt-1">Click any list to expand all campaigns that used it, oldest to newest</p>
        </div>
        <button
          onClick={() => downloadCSV(filtered.map(r => ({
            List: r.list_key, Campaigns: r.campaign_count, Clicks: r.clicks, Conversions: r.conversions,
            EPC: r.clicks > 0 ? (r.revenue / r.clicks).toFixed(4) : '',
            Cost: r.cost, Profit: r.profit,
            'ROI %': r.cost > 0 ? ((r.profit / r.cost) * 100).toFixed(2) : '',
            'Days Idle': r.days_since_last_use, Status: r.status,
          })), `lists_${dateFrom}_${dateTo}.csv`)}
          disabled={!filtered.length}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          CSV
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <DateRangePicker
          from={dateFrom}
          to={dateTo}
          onChange={({ from, to }) => { setDateFrom(from); setDateTo(to); }}
        />
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input type="text" placeholder="Search list…" value={search} onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded pl-8 pr-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideNegativeRoi}
            onChange={(e) => setHideNegativeRoi(e.target.checked)}
            className="rounded text-indigo-600 cursor-pointer"
          />
          <span className="text-sm text-gray-600">Positive ROI only</span>
        </label>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400">{table.getRowModel().rows.length} lists</span>
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
                allColumns={LISTS_ALL_COLUMNS}
                fixedStart={LISTS_FIXED_START}
                table={table}
                onClose={() => setShowColPicker(false)}
              />
            )}
          </div>
        </div>
      </div>

      {isLoading && <div className="card p-10 text-center"><div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>}

      {!isLoading && filtered.length === 0 && (
        <div className="card p-10 text-center text-sm text-gray-400">No lists found — run a sync to populate list data.</div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="card overflow-auto max-h-[calc(100vh-220px)]">
          <table className="w-full text-sm" style={{ tableLayout: 'fixed', width: '100%' }}>
            <thead className="sticky top-0 z-10">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-gray-100 bg-gray-50">
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
                              <th className="px-3 py-2 text-right font-medium text-indigo-600 uppercase tracking-wide">Clicks</th>
                              <th className="px-3 py-2 text-right font-medium text-indigo-600 uppercase tracking-wide">Conv</th>
                              <th className="px-3 py-2 text-right font-medium text-indigo-600 uppercase tracking-wide">EPC</th>
                              <th className="px-3 py-2 text-right font-medium text-indigo-600 uppercase tracking-wide">Cost</th>
                              <th className="px-3 py-2 text-right font-medium text-indigo-600 uppercase tracking-wide">Profit</th>
                              <th className="px-3 py-2 text-right font-medium text-indigo-600 uppercase tracking-wide">Created</th>
                            </tr>
                          </thead>
                          <tbody>
                            <CampaignRows listKey={row.id} dateFrom={dateFrom} dateTo={dateTo} colSpan={visibleLeafCount} />
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            {totals && (
              <tfoot className="sticky bottom-0 z-10">
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                  {table.getVisibleLeafColumns().map((col) => {
                    const right = col.columnDef.meta?.right;
                    let content = null;
                    if      (col.id === 'list_key')          content = <span className="text-gray-500 font-normal text-[11px]">{filtered.length} lists</span>;
                    else if (col.id === 'campaign_count')    content = fmt(totals.campaigns);
                    else if (col.id === 'clicks')            content = fmt(totals.clicks);
                    else if (col.id === 'conversions')       content = fmt(totals.conversions);
                    else if (col.id === 'epc')               content = fmtRate(totals.epc);
                    else if (col.id === 'cost')              content = fmtMoney(totals.cost);
                    else if (col.id === 'profit')            content = <span className={totals.profit >= 0 ? 'text-green-700' : 'text-red-600'}>{fmtMoney(totals.profit)}</span>;
                    else if (col.id === 'roi')               content = <span className={totals.roi >= 0 ? 'text-green-600' : 'text-red-500'}>{totals.roi.toFixed(2)}%</span>;
                    return (
                      <td key={col.id} style={{ width: col.getSize() }}
                        className={`px-3 py-2.5 text-xs tabular-nums ${right ? 'text-right' : 'text-left'}`}>
                        {content}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
