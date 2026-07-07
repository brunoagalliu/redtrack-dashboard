import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
} from '@tanstack/react-table';
import { api } from '../lib/api';

const BUYER_STYLES = {
  TK: { badge: 'bg-blue-100 text-blue-700',    border: 'border-blue-200',   header: 'bg-blue-50' },
  MA: { badge: 'bg-purple-100 text-purple-700', border: 'border-purple-200', header: 'bg-purple-50' },
  DS: { badge: 'bg-orange-100 text-orange-700', border: 'border-orange-200', header: 'bg-orange-50' },
};

function fmtMoney(n) {
  const v = Number(n || 0);
  const abs = Math.abs(v);
  const str = abs >= 1000 ? (abs / 1000).toFixed(1) + 'k' : abs.toFixed(0);
  return (v < 0 ? '-$' : '$') + str;
}
function fmtFull(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtClicks(n) {
  const v = Number(n || 0);
  return v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v.toLocaleString();
}

function SortIcon({ sorted }) {
  if (!sorted) return <span className="text-gray-300 ml-1 text-[10px]">↕</span>;
  return <span className="text-blue-500 ml-1 text-[10px]">{sorted === 'asc' ? '▲' : '▼'}</span>;
}

function boldify(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function extractActions(text) {
  if (!text) return '';
  const lines = text.split('\n');
  const actionMarkers = /actions?\s*(this\s*week)?|this\s*week:|recommendations?:/i;
  let inActions = false;
  const actionLines = [];
  const allBullets = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.match(/^---+$/)) continue;

    const isHeading = trimmed.match(/^#{1,4}\s/) || trimmed.match(/^\*\*[^*]+:\*\*\s*$/) || trimmed.match(/^[*-]\s*\*\*[^*]+:\*\*\s*$/);
    if (isHeading) {
      inActions = actionMarkers.test(trimmed);
      continue;
    }
    if (trimmed.match(/^\*?Summary:/i)) continue;

    const clean = trimmed.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '').trim();
    if (!clean) continue;
    if (clean.match(/:\*{0,2}$/) && clean.length < 60) continue;
    if (inActions) actionLines.push(clean);
    allBullets.push(clean);
  }

  const bullets = actionLines.length > 0 ? actionLines.slice(0, 5) : allBullets.slice(-5);
  return bullets.map((b) => {
    const m = b.match(/^(.+?[.!?])(?:\s|$)/);
    return m ? m[1].trim() : (b.length > 120 ? b.slice(0, 117) + '…' : b);
  }).join('\n');
}

function BulletBlock({ text, limit = 0 }) {
  if (!text) return null;
  const lines = text.split('\n');
  const items = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.match(/^#{1,4}\s/)) continue;
    if (trimmed.match(/^---+$/)) continue;
    if (trimmed.match(/^\*?Summary:/i)) continue;
    if (trimmed.match(/^\*\*[^*]+:\*\*\s*$/) || trimmed.match(/^[*-]\s*\*\*[^*]+:\*\*\s*$/)) continue;
    const clean = trimmed.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '').trim();
    if (!clean) continue;
    items.push(clean);
  }
  const display = limit > 0 ? items.slice(0, limit) : items;
  return (
    <ul className="space-y-1.5">
      {display.map((item, i) => (
        <li key={i} className="flex gap-2 text-xs text-gray-700 leading-relaxed">
          <span className="text-gray-300 mt-0.5 shrink-0">•</span>
          <span dangerouslySetInnerHTML={{ __html: boldify(item) }} />
        </li>
      ))}
    </ul>
  );
}

function ProfitBars({ combos, color }) {
  if (!combos.length) return null;
  const maxAbs = Math.max(...combos.map((c) => Math.abs(c.profit)), 1);
  return (
    <div className="space-y-1.5">
      {combos.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[11px] text-gray-700 truncate pr-2" title={c.label}>{c.label}</span>
              <span className={`text-[11px] font-semibold shrink-0 ${color === 'green' ? 'text-emerald-600' : 'text-red-500'}`}>
                {fmtMoney(c.profit)}
              </span>
            </div>
            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${color === 'green' ? 'bg-emerald-400' : 'bg-red-400'}`}
                style={{ width: `${Math.max(4, (Math.abs(c.profit) / maxAbs) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function sectionStyle(title) {
  if (title.includes('💰') || /scale|best/i.test(title))
    return { bg: 'bg-emerald-50', border: 'border-emerald-200', title: 'text-emerald-800' };
  if (title.includes('🔴') || /cut/i.test(title))
    return { bg: 'bg-red-50', border: 'border-red-200', title: 'text-red-800' };
  if (title.includes('🔁') || /reallocat|budget/i.test(title))
    return { bg: 'bg-blue-50', border: 'border-blue-200', title: 'text-blue-800' };
  if (title.includes('🧪') || /test|upside/i.test(title))
    return { bg: 'bg-amber-50', border: 'border-amber-200', title: 'text-amber-800' };
  return { bg: 'bg-gray-50', border: 'border-gray-200', title: 'text-gray-800' };
}

function parseContent(content) {
  if (!content) return { buyers: {}, sections: [] };

  const splitRe = /(?=^#{1,3} ?(?:👤 ?)?(?:TK|MA|DS)\b)/m;
  const matchRe = /^#{1,3} ?(?:👤 ?)?(TK|MA|DS)\b/;
  let parts = content.split(splitRe);
  if (parts.length === 1) parts = content.split(/(?=^\*\*(?:TK|MA|DS)\*\*)/m);

  const overall = parts[0].trim();
  const buyers = {};
  for (const part of parts.slice(1)) {
    const m = part.match(matchRe) || part.match(/^\*\*(TK|MA|DS)\*\*/);
    if (m) buyers[m[1]] = part.replace(/^.*\n/, '').trim();
  }

  const sections = [];
  let current = null;
  for (const line of overall.split('\n')) {
    if (line.match(/^#{1,2}\s/)) {
      if (current) sections.push(current);
      current = { title: line.replace(/^#+\s*/, ''), body: [] };
    } else if (!line.match(/^---+$/) && current) {
      current.body.push(line);
    }
  }
  if (current) sections.push(current);

  return { buyers, sections };
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-800 mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.fill }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-semibold text-gray-900">{fmtFull(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

const OFFER_COLS = [
  { id: 'offer', accessorKey: 'offer', header: 'Offer', size: 180, enableSorting: false, enableResizing: true, meta: { left: true } },
  { id: 'route', accessorKey: 'route', header: 'Route', size: 80, enableSorting: true, enableResizing: true },
  { id: 'carrier', accessorKey: 'carrier', header: 'Carrier', size: 80, enableSorting: true, enableResizing: true },
  {
    id: 'vertical', accessorKey: 'vertical', header: 'Vertical', size: 80, enableSorting: true, enableResizing: true,
    cell: ({ getValue }) => <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{getValue()}</span>,
  },
  {
    id: 'data_partner', accessorKey: 'data_partner', header: 'Partner', size: 80, enableSorting: true, enableResizing: true,
    cell: ({ getValue }) => {
      const v = getValue();
      return v && v !== 'Unknown'
        ? <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">{v}</span>
        : <span className="text-gray-300">—</span>;
    },
  },
  { id: 'buyer', accessorKey: 'buyer', header: 'Buyer', size: 56, enableSorting: true, enableResizing: false },
  {
    id: 'clicks', accessorKey: 'clicks', header: 'Clicks', size: 80, enableSorting: true, enableResizing: true, meta: { right: true },
    cell: ({ getValue }) => Number(getValue()).toLocaleString(),
  },
  {
    id: 'epc', header: 'EPC', size: 80, enableSorting: true, enableResizing: false, meta: { right: true },
    accessorFn: (r) => Number(r.clicks) > 0 ? Number(r.revenue) / Number(r.clicks) : 0,
    cell: ({ getValue }) => <span className="font-medium text-gray-700">${getValue().toFixed(4)}</span>,
  },
  {
    id: 'profit', accessorKey: 'profit', header: 'Profit*', size: 88, enableSorting: true, enableResizing: false, meta: { right: true },
    cell: ({ getValue }) => {
      const v = Number(getValue());
      return <span className={`font-medium ${v >= 0 ? 'text-green-600' : 'text-red-500'}`}>
        ${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </span>;
    },
  },
  {
    id: 'roi', accessorKey: 'roi', header: 'ROI*', size: 72, enableSorting: true, enableResizing: false, meta: { right: true },
    cell: ({ getValue }) => {
      const v = Number(getValue());
      return <span className={`font-medium ${v >= 0 ? 'text-green-600' : 'text-red-500'}`}>{getValue()}%</span>;
    },
  },
];

const COMBO_COLS = [
  {
    id: 'vertical', accessorKey: 'vertical', header: 'Vertical', size: 100, enableSorting: true, enableResizing: true, meta: { left: true },
    cell: ({ getValue }) => <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium">{getValue()}</span>,
  },
  { id: 'carrier', accessorKey: 'carrier', header: 'Carrier', size: 80, enableSorting: true, enableResizing: true },
  { id: 'route', accessorKey: 'route', header: 'Route', size: 80, enableSorting: true, enableResizing: true },
  {
    id: 'clicks', accessorKey: 'clicks', header: 'Clicks', size: 80, enableSorting: true, enableResizing: false, meta: { right: true },
    cell: ({ getValue }) => Number(getValue()).toLocaleString(),
  },
  {
    id: 'profit', accessorKey: 'profit', header: 'Profit', size: 96, enableSorting: true, enableResizing: false, meta: { right: true },
    cell: ({ getValue }) => {
      const v = Number(getValue());
      return <span className={`font-medium ${v >= 0 ? 'text-green-600' : 'text-red-500'}`}>
        ${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </span>;
    },
  },
  {
    id: 'roi', accessorKey: 'roi', header: 'ROI', size: 72, enableSorting: true, enableResizing: false, meta: { right: true },
    cell: ({ getValue }) => {
      const v = Number(getValue());
      return <span className={`font-medium ${v >= 0 ? 'text-green-600' : 'text-red-500'}`}>{getValue()}%</span>;
    },
  },
];

function SortableTableHeader({ header }) {
  const right = header.column.columnDef.meta?.right;
  const left = header.column.columnDef.meta?.left;
  return (
    <th
      onClick={header.column.getToggleSortingHandler()}
      style={{ width: header.getSize(), position: 'relative' }}
      className={`px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap overflow-hidden
        ${right ? 'text-right' : left ? 'text-left' : 'text-right'}
        ${header.column.getCanSort() ? 'cursor-pointer select-none hover:text-gray-700' : ''}`}
      title={header.id === 'epc' ? 'Revenue per click — directly reported' : header.id.includes('profit') || header.id.includes('roi') ? 'Estimate — cost is prorated by click share' : undefined}
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
}

function RawDataSection({ dataJson }) {
  const [open, setOpen] = useState(false);
  const hasOffers = dataJson?.offer_combinations?.length > 0;
  const hasCombos = dataJson?.combinations?.length > 0;

  const [offerSorting, setOfferSorting] = useState([{ id: 'profit', desc: true }]);
  const [comboSorting, setComboSorting] = useState([{ id: 'profit', desc: true }]);

  const offerData = useMemo(() => dataJson?.offer_combinations || [], [dataJson]);
  const comboData = useMemo(() => dataJson?.combinations || [], [dataJson]);

  const offerTable = useReactTable({
    data: offerData,
    columns: OFFER_COLS,
    state: { sorting: offerSorting },
    onSortingChange: setOfferSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: 'onChange',
    getRowId: (_row, idx) => String(idx),
  });

  const comboTable = useReactTable({
    data: comboData,
    columns: COMBO_COLS,
    state: { sorting: comboSorting },
    onSortingChange: setComboSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: 'onChange',
    getRowId: (_row, idx) => String(idx),
  });

  if (!hasOffers && !hasCombos) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {open ? 'Hide' : 'Show'} raw data used in analysis
      </button>

      {open && (
        <div className="mt-4 space-y-6">
          {hasOffers && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Offer Performance</h3>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ tableLayout: 'fixed', width: offerTable.getTotalSize() }}>
                    <thead>
                      {offerTable.getHeaderGroups().map((hg) => (
                        <tr key={hg.id} className="border-b border-gray-200 bg-gray-50">
                          {hg.headers.map((header) => <SortableTableHeader key={header.id} header={header} />)}
                        </tr>
                      ))}
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {offerTable.getRowModel().rows.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50">
                          {row.getVisibleCells().map((cell) => {
                            const right = cell.column.columnDef.meta?.right;
                            const left = cell.column.columnDef.meta?.left;
                            return (
                              <td key={cell.id}
                                style={{ width: cell.column.getSize() }}
                                className={`px-3 py-1.5 text-xs tabular-nums overflow-hidden ${right ? 'text-right' : left ? 'text-left' : 'text-right'} ${cell.column.id === 'offer' ? 'truncate text-gray-800' : 'text-gray-600'}`}
                                title={cell.column.id === 'offer' ? row.original.offer : undefined}
                              >
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
            </div>
          )}
          {hasCombos && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Route × Vertical × Carrier</h3>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ tableLayout: 'fixed', width: comboTable.getTotalSize() }}>
                    <thead>
                      {comboTable.getHeaderGroups().map((hg) => (
                        <tr key={hg.id} className="border-b border-gray-200 bg-gray-50">
                          {hg.headers.map((header) => <SortableTableHeader key={header.id} header={header} />)}
                        </tr>
                      ))}
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {comboTable.getRowModel().rows.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50">
                          {row.getVisibleCells().map((cell) => {
                            const right = cell.column.columnDef.meta?.right;
                            const left = cell.column.columnDef.meta?.left;
                            return (
                              <td key={cell.id}
                                style={{ width: cell.column.getSize() }}
                                className={`px-3 py-1.5 text-xs tabular-nums overflow-hidden ${right ? 'text-right' : left ? 'text-left' : 'text-right'} text-gray-600`}
                              >
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const OS_COLS = [
  {
    id: 'offer', accessorKey: 'offer', header: 'Offer', size: 180, enableSorting: true, enableResizing: true, meta: { left: true },
    cell: ({ getValue }) => (
      <span className="text-xs text-gray-800 max-w-[200px] truncate block" title={getValue()}>{getValue()}</span>
    ),
  },
  {
    id: 'buyer', accessorKey: 'buyer', header: 'Buyer', size: 64, enableSorting: true, enableResizing: false, meta: { center: true },
    cell: ({ getValue }) => {
      const b = getValue();
      return (
        <div className="text-center">
          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
            b === 'TK' ? 'bg-blue-100 text-blue-700' :
            b === 'MA' ? 'bg-purple-100 text-purple-700' :
            'bg-orange-100 text-orange-700'
          }`}>{b}</span>
        </div>
      );
    },
  },
  {
    id: 'ios_epc', header: 'iOS EPC', size: 80, enableSorting: true, enableResizing: false, meta: { right: true },
    accessorFn: (o) => {
      const ios = o.iOS;
      return ios && Number(ios.clicks) > 0 ? Number(ios.revenue) / Number(ios.clicks) : 0;
    },
    cell: ({ getValue, row }) => {
      const ios = row.original.iOS;
      const v = getValue();
      return ios && Number(ios.clicks) > 0
        ? <span className="text-xs font-medium text-gray-700">${v.toFixed(4)}</span>
        : <span className="text-gray-300">—</span>;
    },
  },
  {
    id: 'ios_profit', header: 'iOS Profit*', size: 88, enableSorting: true, enableResizing: false, meta: { right: true },
    accessorFn: (o) => Number(o.iOS?.profit || 0),
    cell: ({ getValue, row }) => {
      const ios = row.original.iOS;
      const v = getValue();
      return ios
        ? <span className={`text-xs ${v >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmtMoney(v)}</span>
        : <span className="text-gray-300">—</span>;
    },
  },
  {
    id: 'ios_clicks', header: 'iOS Clicks', size: 80, enableSorting: true, enableResizing: false, meta: { right: true },
    accessorFn: (o) => Number(o.iOS?.clicks || 0),
    cell: ({ getValue, row }) => {
      const ios = row.original.iOS;
      return ios
        ? <span className="text-xs text-gray-500">{fmtClicks(getValue())}</span>
        : <span className="text-gray-300">—</span>;
    },
  },
  {
    id: 'android_epc', header: 'Android EPC', size: 96, enableSorting: true, enableResizing: false, meta: { right: true },
    accessorFn: (o) => {
      const and = o.Android;
      return and && Number(and.clicks) > 0 ? Number(and.revenue) / Number(and.clicks) : 0;
    },
    cell: ({ getValue, row }) => {
      const and = row.original.Android;
      const v = getValue();
      return and && Number(and.clicks) > 0
        ? <span className="text-xs font-medium text-gray-700">${v.toFixed(4)}</span>
        : <span className="text-gray-300">—</span>;
    },
  },
  {
    id: 'android_profit', header: 'Android Profit*', size: 104, enableSorting: true, enableResizing: false, meta: { right: true },
    accessorFn: (o) => Number(o.Android?.profit || 0),
    cell: ({ getValue, row }) => {
      const and = row.original.Android;
      const v = getValue();
      return and
        ? <span className={`text-xs ${v >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmtMoney(v)}</span>
        : <span className="text-gray-300">—</span>;
    },
  },
  {
    id: 'android_clicks', header: 'Android Clicks', size: 96, enableSorting: true, enableResizing: false, meta: { right: true },
    accessorFn: (o) => Number(o.Android?.clicks || 0),
    cell: ({ getValue, row }) => {
      const and = row.original.Android;
      return and
        ? <span className="text-xs text-gray-500">{fmtClicks(getValue())}</span>
        : <span className="text-gray-300">—</span>;
    },
  },
  {
    id: 'winner', header: 'Winner', size: 72, enableSorting: false, enableResizing: false, meta: { center: true },
    accessorFn: (o) => {
      const ios = o.iOS;
      const and = o.Android;
      const iosEpc = ios && Number(ios.clicks) > 0 ? Number(ios.revenue) / Number(ios.clicks) : null;
      const andEpc = and && Number(and.clicks) > 0 ? Number(and.revenue) / Number(and.clicks) : null;
      if (iosEpc != null && andEpc != null) {
        if (iosEpc > andEpc * 1.2) return 'iOS';
        if (andEpc > iosEpc * 1.2) return 'Android';
        return 'Equal';
      }
      return iosEpc != null ? 'iOS' : 'Android';
    },
    cell: ({ getValue }) => {
      const w = getValue();
      return (
        <div className="text-center">
          {w === 'iOS'     && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">iOS</span>}
          {w === 'Android' && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Android</span>}
          {w === 'Equal'   && <span className="text-xs text-gray-400">—</span>}
        </div>
      );
    },
  },
];

export default function AIRecommendationsPage() {
  const [days, setDays] = useState(14);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [osSorting, setOsSorting] = useState([{ id: 'ios_epc', desc: true }]);
  const queryClient = useQueryClient();

  const { data: history = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ['reports', 'ai-recommendations', 'history'],
    queryFn: () => api.getAIReportHistory(50),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const periodHistory = history.filter((h) => h.period_days === days);
  const effectiveHistoryId = selectedHistoryId ?? periodHistory[0]?.id ?? null;
  const viewingHistory = effectiveHistoryId != null && effectiveHistoryId !== periodHistory[0]?.id;

  const { data: report, isLoading: isLoadingReport } = useQuery({
    queryKey: ['reports', 'ai-recommendations', 'history', effectiveHistoryId],
    queryFn: () => api.getAIReportHistoryItem(effectiveHistoryId),
    enabled: effectiveHistoryId != null,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  const isLoading = isLoadingHistory || isLoadingReport;

  const { data: syncStatus } = useQuery({
    queryKey: ['reports', 'sync', 'status'],
    queryFn: () => api.getSyncStatus(),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    retry: false,
  });

  const { data: offerSyncStatus } = useQuery({
    queryKey: ['reports', 'sync', 'offers', 'status'],
    queryFn: () => api.getOfferSyncStatus(),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    retry: false,
  });

  const syncRunning = Boolean(syncStatus?.running || offerSyncStatus?.running);
  const lastSyncAt = [syncStatus?.completed_at, offerSyncStatus?.completed_at]
    .filter(Boolean)
    .map((d) => new Date(d))
    .sort((a, b) => b - a)[0] || null;
  const freshestForPeriod = periodHistory[0] || null;
  const reportGeneratedAt = freshestForPeriod ? new Date(freshestForPeriod.generated_at) : null;
  const dataIsNewer = Boolean(lastSyncAt && reportGeneratedAt && lastSyncAt > reportGeneratedAt);
  const daysSinceReport = reportGeneratedAt ? (Date.now() - reportGeneratedAt.getTime()) / 86400000 : null;
  const staleByAge = daysSinceReport !== null && daysSinceReport >= 7;
  const freshness = syncRunning ? 'syncing' : !freshestForPeriod ? 'none' : dataIsNewer ? 'stale-data' : staleByAge ? 'stale-age' : 'fresh';

  function handleDaysChange(d) {
    setDays(d);
    setSelectedHistoryId(null);
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenError(null);
    try {
      await api.generateAIReport(days);
      setSelectedHistoryId(null);
      queryClient.invalidateQueries({ queryKey: ['reports', 'ai-recommendations'] });
    } catch (err) {
      setGenError(err.message || 'Failed to generate report.');
    } finally {
      setGenerating(false);
    }
  }

  const { buyers, sections } = parseContent(report?.content);
  const dataJson = report?.data_json || {};
  const buyerRows = dataJson.buyers || [];
  const offerCombos = dataJson.offer_combinations || [];
  const combinations = dataJson.combinations || [];

  const osRows = dataJson.os_combinations || [];
  const osOfferMap = {};
  for (const r of osRows) {
    if (!osOfferMap[r.offer]) osOfferMap[r.offer] = { offer: r.offer, buyer: r.buyer };
    osOfferMap[r.offer][r.os] = r;
  }
  const osOffers = useMemo(
    () => Object.values(osOfferMap).filter((o) => o.iOS || o.Android).slice(0, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [report]
  );

  const osTable = useReactTable({
    data: osOffers,
    columns: OS_COLS,
    state: { sorting: osSorting },
    onSortingChange: setOsSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: 'onChange',
    getRowId: (row) => row.offer,
  });

  const chartData = ['TK', 'MA', 'DS'].map((b) => {
    const row = buyerRows.find((r) => r.buyer === b) || {};
    return {
      buyer: b,
      Profit: Number(row.profit || 0),
      Spend:  Number(row.cost || 0),
    };
  }).filter((d) => d.Profit !== 0 || d.Spend !== 0);

  const topCombos = (offerCombos.length ? offerCombos : combinations).slice(0, 8).map((r) => ({
    label: offerCombos.length
      ? (r.offer?.length > 32 ? r.offer.slice(0, 32) + '…' : r.offer)
      : `${r.vertical} · ${r.carrier} · ${r.route}`,
    profit: Number(r.profit || 0),
  }));
  const maxAbsProfit = Math.max(...topCombos.map((c) => Math.abs(c.profit)), 1);

  const hasBuyerSections = Object.keys(buyers).length > 0;

  return (
    <div className="p-8 max-w-7xl space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Recommendations</h1>
          <p className="text-sm text-gray-500 mt-1">Profit-maximization analysis with dedicated actions per media buyer</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Analyze last</span>
            <select value={days} onChange={(e) => handleDaysChange(Number(e.target.value))}
              className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 bg-white">
              {[7, 14, 30].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </div>
          {periodHistory.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Viewing</span>
              <select value={effectiveHistoryId ?? ''} onChange={(e) => setSelectedHistoryId(Number(e.target.value))}
                className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 bg-white max-w-[220px]">
                {periodHistory.map((h, i) => (
                  <option key={h.id} value={h.id}>
                    {i === 0 ? 'Latest — ' : ''}
                    {new Date(h.generated_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button onClick={handleGenerate} disabled={generating}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
            {generating ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Generate Report
              </>
            )}
          </button>
        </div>
      </div>

      {freshness !== 'none' && (
        <div className={`flex items-center gap-1.5 text-xs ${
          freshness === 'syncing' ? 'text-blue-600'
          : freshness === 'stale-data' ? 'text-amber-600'
          : freshness === 'stale-age' ? 'text-amber-600'
          : 'text-gray-400'
        }`}>
          <span className={`inline-block w-2 h-2 rounded-full ${
            freshness === 'syncing' ? 'bg-blue-500 animate-pulse'
            : freshness === 'stale-data' || freshness === 'stale-age' ? 'bg-amber-500'
            : 'bg-green-500'
          }`} />
          {freshness === 'syncing' && 'A sync is running — wait for it to finish before generating a new report, or the data may be incomplete.'}
          {freshness === 'stale-data' && `New sync data has come in since the latest ${days}-day report was generated — consider hitting Generate Report.`}
          {freshness === 'stale-age' && `The latest ${days}-day report is ${Math.floor(daysSinceReport)} days old — due for a refresh.`}
          {freshness === 'fresh' && `Latest ${days}-day report reflects the most recent synced data.`}
        </div>
      )}

      {genError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{genError}</div>
      )}

      {viewingHistory && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-2 text-xs text-amber-700 flex items-center justify-between">
          <span>Viewing a past {days}-day report from history — this is not the latest one for this window.</span>
          <button onClick={() => setSelectedHistoryId(null)} className="font-medium underline hover:no-underline">
            Back to latest
          </button>
        </div>
      )}

      {/* ── Loading / empty states ── */}
      {isLoading && (
        <div className="card p-10 text-center">
          <div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && !report && !generating && (
        <div className="card p-10 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-indigo-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700 mb-1">No {days}-day report generated yet</p>
          <p className="text-xs text-gray-400">Click Generate Report to create one for this window.</p>
        </div>
      )}

      {generating && (
        <div className="card p-10 text-center">
          <div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4" />
          <p className="text-sm font-medium text-gray-700">Analyzing campaign data…</p>
          <p className="text-xs text-gray-400 mt-1">Reviewing offers, routes, carriers, and per-buyer performance.</p>
        </div>
      )}

      {report && !generating && (
        <>
          {/* Meta */}
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span>Generated: {new Date(report.generated_at).toLocaleString()}</span>
            <span>·</span>
            <span>Last {report.period_days} days</span>
            {offerCombos.length > 0 && <><span>·</span><span>{offerCombos.length} offer combos</span></>}
            {combinations.length > 0 && <><span>·</span><span>{combinations.length} route combos</span></>}
          </div>

          {/* ── 1. Buyer KPI cards ── */}
          {buyerRows.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Buyer Performance</h2>
              <div className="grid grid-cols-3 gap-4">
                {['TK', 'MA', 'DS'].map((buyer) => {
                  const row = buyerRows.find((r) => r.buyer === buyer);
                  if (!row) return null;
                  const style  = BUYER_STYLES[buyer];
                  const profit = Number(row.profit || 0);
                  const cost   = Number(row.cost || 0);
                  const rev    = Number(row.revenue || 0);
                  const roi    = cost > 0 ? ((rev - cost) / cost * 100) : 0;
                  return (
                    <div key={buyer} className={`card overflow-hidden border ${style.border}`}>
                      <div className={`px-4 py-3 ${style.header} border-b ${style.border} flex items-center gap-2`}>
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${style.badge}`}>{buyer}</span>
                        <span className="text-sm font-semibold text-gray-800">{buyer}</span>
                        <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${roi >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {roi >= 0 ? '+' : ''}{roi.toFixed(1)}% ROI
                        </span>
                      </div>
                      <div className="p-4">
                        <div className={`text-3xl font-bold mb-4 ${profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {profit >= 0 ? '+' : ''}{fmtMoney(profit)}
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center divide-x divide-gray-100">
                          <div className="pr-2">
                            <div className="text-xs text-gray-400 mb-0.5">Clicks</div>
                            <div className="text-sm font-semibold text-gray-800">{fmtClicks(row.clicks)}</div>
                          </div>
                          <div className="px-2">
                            <div className="text-xs text-gray-400 mb-0.5">Spend</div>
                            <div className="text-sm font-semibold text-gray-800">{fmtMoney(cost)}</div>
                          </div>
                          <div className="pl-2">
                            <div className="text-xs text-gray-400 mb-0.5">Revenue</div>
                            <div className="text-sm font-semibold text-gray-800">{fmtMoney(rev)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 2. Charts row ── */}
          {(chartData.length > 0 || topCombos.length > 0) && (
            <div className="grid grid-cols-2 gap-4">
              {chartData.length > 0 && (
                <div className="card p-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Profit vs Spend</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} barGap={6} barCategoryGap="35%">
                      <XAxis dataKey="buyer" tick={{ fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(v) => fmtMoney(v)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={52} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                      <Bar dataKey="Profit" name="Profit" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry) => (
                          <Cell key={entry.buyer} fill={entry.Profit >= 0 ? '#10b981' : '#ef4444'} />
                        ))}
                      </Bar>
                      <Bar dataKey="Spend" name="Spend" fill="#e5e7eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {topCombos.length > 0 && (
                <div className="card p-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
                    {offerCombos.length ? 'Top Offers by Profit' : 'Top Combinations by Profit'}
                  </h3>
                  <div className="space-y-2.5">
                    {topCombos.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-4 text-right shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-700 truncate pr-2" title={c.label}>{c.label}</span>
                            <span className={`text-xs font-semibold shrink-0 ${c.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {fmtMoney(c.profit)}
                            </span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${c.profit >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`}
                              style={{ width: `${Math.max(2, (Math.abs(c.profit) / maxAbsProfit) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 3. OS Performance ── */}
          {osOffers.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">iOS vs Android Performance</h2>
              <div className="card overflow-x-auto">
                <table className="w-full" style={{ tableLayout: 'fixed', width: osTable.getTotalSize() }}>
                  <thead>
                    {osTable.getHeaderGroups().map((hg) => (
                      <tr key={hg.id} className="border-b border-gray-100 bg-gray-50">
                        {hg.headers.map((header) => {
                          const right = header.column.columnDef.meta?.right;
                          const center = header.column.columnDef.meta?.center;
                          const left = header.column.columnDef.meta?.left;
                          const isIos = header.id.startsWith('ios_');
                          const isAndroid = header.id.startsWith('android_');
                          return (
                            <th
                              key={header.id}
                              onClick={header.column.getToggleSortingHandler()}
                              style={{ width: header.getSize(), position: 'relative' }}
                              className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap overflow-hidden
                                ${right ? 'text-right' : center ? 'text-center' : left ? 'text-left' : 'text-left'}
                                ${isIos ? 'text-purple-500' : isAndroid ? 'text-green-600' : 'text-gray-500'}
                                ${header.column.getCanSort() ? 'cursor-pointer select-none hover:opacity-70' : ''}`}
                              title={header.id.includes('epc') ? 'Revenue per click — directly reported' : header.id.includes('profit') ? 'Estimate — cost is prorated by click share' : undefined}
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
                  <tbody className="divide-y divide-gray-50">
                    {osTable.getRowModel().rows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50/50">
                        {row.getVisibleCells().map((cell) => {
                          const right = cell.column.columnDef.meta?.right;
                          const center = cell.column.columnDef.meta?.center;
                          return (
                            <td key={cell.id}
                              style={{ width: cell.column.getSize() }}
                              className={`px-4 py-2 tabular-nums overflow-hidden ${right ? 'text-right' : center ? 'text-center' : 'text-left'}`}
                            >
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
          )}

          {/* ── 4. Per-buyer action cards ── */}
          {(hasBuyerSections || offerCombos.length > 0) && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Actions Per Buyer</h2>
              <div className="grid grid-cols-3 gap-4">
                {['TK', 'MA', 'DS'].map((buyer) => {
                  const aiText = buyers[buyer];
                  const style  = BUYER_STYLES[buyer];
                  const buyerOffers = offerCombos.filter((r) => r.buyer === buyer);
                  const sorted = [...buyerOffers].sort((a, b) => Number(b.profit) - Number(a.profit));
                  const wins = sorted.filter((o) => Number(o.profit) > 0).slice(0, 3).map((o) => ({
                    label: o.offer?.length > 30 ? o.offer.slice(0, 30) + '…' : o.offer,
                    profit: Number(o.profit),
                  }));
                  const losses = sorted.filter((o) => Number(o.profit) < 0).slice(-2).map((o) => ({
                    label: o.offer?.length > 30 ? o.offer.slice(0, 30) + '…' : o.offer,
                    profit: Number(o.profit),
                  }));
                  const hasData = wins.length > 0 || losses.length > 0 || aiText;
                  if (!hasData) return null;
                  return (
                    <div key={buyer} className={`card overflow-hidden border ${style.border}`}>
                      <div className={`px-4 py-3 ${style.header} border-b ${style.border} flex items-center gap-2`}>
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${style.badge}`}>{buyer}</span>
                        <span className="text-sm font-semibold text-gray-800">{buyer}</span>
                      </div>
                      <div className="p-4 space-y-3">
                        {wins.length > 0 && (
                          <div>
                            <div className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-2">Top Performers</div>
                            <ProfitBars combos={wins} color="green" />
                          </div>
                        )}
                        {losses.length > 0 && (
                          <div>
                            <div className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-2">Cut These</div>
                            <ProfitBars combos={losses} color="red" />
                          </div>
                        )}
                        {aiText && (
                          <div className={`${wins.length > 0 || losses.length > 0 ? 'border-t border-gray-100 pt-3' : ''}`}>
                            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Actions This Week</div>
                            <BulletBlock text={extractActions(aiText)} limit={5} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!hasBuyerSections && sections.length > 0 && (
            <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Per-buyer sections not detected — regenerate to get the new format.
            </div>
          )}

          {/* ── 5. Overall analysis → 2×2 color-coded cards ── */}
          {sections.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Analysis</h2>
              <div className="grid grid-cols-2 gap-4">
                {sections.map((sec, i) => {
                  const s = sectionStyle(sec.title);
                  return (
                    <div key={i} className={`rounded-xl border ${s.border} ${s.bg} p-5`}>
                      <h3 className={`text-sm font-bold ${s.title} mb-3`}>{sec.title}</h3>
                      <BulletBlock text={sec.body.join('\n')} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Raw data ── */}
          <RawDataSection dataJson={report.data_json} />
        </>
      )}
    </div>
  );
}
