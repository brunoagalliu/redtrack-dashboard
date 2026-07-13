import { useState, useMemo, useRef, useEffect, useCallback, Fragment } from 'react';
import RoiFilterPopover from '../components/RoiFilterPopover';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getExpandedRowModel,
  flexRender,
} from '@tanstack/react-table';
import { api } from '../lib/api';

// ── Column metadata ───────────────────────────────────────────────────────────
const ALL_COLUMNS = [
  { id: 'title',        label: 'Campaign', defaultVisible: true,  defaultSize: 260 },
  { id: 'data_list',    label: 'List',     defaultVisible: true,  defaultSize: 180 },
  { id: 'data_partner', label: 'Partner',  defaultVisible: true,  defaultSize: 100 },
  { id: 'route',        label: 'Route',    defaultVisible: false, defaultSize: 90  },
  { id: 'carrier',      label: 'Carrier',  defaultVisible: false, defaultSize: 90  },
  { id: 'vertical',     label: 'Vertical', defaultVisible: false, defaultSize: 90  },
  { id: 'clicks',       label: 'Clicks',   defaultVisible: true,  defaultSize: 90  },
  { id: 'conversions',  label: 'Conv.',    defaultVisible: true,  defaultSize: 80  },
  { id: 'cost',         label: 'Spend',    defaultVisible: true,  defaultSize: 100 },
  { id: 'revenue',      label: 'Revenue',  defaultVisible: true,  defaultSize: 100 },
  { id: 'profit',       label: 'Profit',   defaultVisible: true,  defaultSize: 100 },
  { id: 'roi',          label: 'ROI',      defaultVisible: true,  defaultSize: 160 },
  { id: 'cpc',          label: 'CPC',      defaultVisible: true,  defaultSize: 90  },
  { id: 'epc',          label: 'EPC',      defaultVisible: true,  defaultSize: 90  },
];

const CONFIGURABLE_IDS = ALL_COLUMNS.map((c) => c.id);
const STORAGE_KEY = 'rt_report_col_config';
const RIGHT_ALIGNED = new Set(['clicks', 'conversions', 'cost', 'revenue', 'profit', 'roi', 'cpc', 'epc']);
const NON_CONFIG_IDS = new Set(['buyer', 'expand']);

function loadColConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.order && saved?.visible) {
      const newIds = ALL_COLUMNS.map((c) => c.id).filter((id) => !saved.order.includes(id));
      return {
        order:   [...saved.order, ...newIds],
        visible: { ...Object.fromEntries(ALL_COLUMNS.map((c) => [c.id, c.defaultVisible])), ...saved.visible },
      };
    }
  } catch {}
  return {
    order:   ALL_COLUMNS.map((c) => c.id),
    visible: Object.fromEntries(ALL_COLUMNS.map((c) => [c.id, c.defaultVisible])),
  };
}

function saveColConfig(order, visible) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ order, visible }));
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

// ── Sort icon ─────────────────────────────────────────────────────────────────
function SortIcon({ sorted }) {
  if (!sorted) return (
    <svg className="w-3 h-3 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  );
  return sorted === 'asc'
    ? <svg className="w-3 h-3 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
    : <svg className="w-3 h-3 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
}

// ── Sync button ───────────────────────────────────────────────────────────────
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
    <button onClick={startSync} disabled={running}
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
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

// ── OS sub-rows (inside offer sub-table) ─────────────────────────────────────
function OsSubRows({ campaignId, offerId, dateFrom, dateTo }) {
  const { data: osStats, isLoading } = useQuery({
    queryKey: ['offer-os', campaignId, offerId, dateFrom, dateTo],
    queryFn: () => api.getOfferOsStats(campaignId, offerId, { date_from: dateFrom, date_to: dateTo }),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return (
    <tr><td colSpan={9} className="px-4 py-1 text-xs text-gray-400 text-center bg-violet-50/20">Loading OS…</td></tr>
  );
  if (!osStats?.length) return (
    <tr><td colSpan={9} className="px-12 py-1 text-xs text-gray-400 bg-violet-50/20">No OS data yet — run a sync first.</td></tr>
  );

  return osStats.map((s) => (
    <tr key={s.os} className="bg-violet-50/20 border-l-4 border-violet-100">
      <td className="px-2 py-1 w-8" />
      <td className="px-3 py-1 text-xs text-gray-600">
        <span className="ml-5 text-violet-300 mr-1.5 select-none">↳</span>
        <span className="font-medium">{s.os}</span>
      </td>
      <td className="px-3 py-1 text-right tabular-nums text-xs text-gray-500">{fmt(s.clicks)}</td>
      <td className="px-3 py-1 text-right tabular-nums text-xs text-gray-500">{fmt(s.conversions)}</td>
      <td className="px-3 py-1 text-right tabular-nums text-xs text-gray-500">{fmtMoney(s.cost)}</td>
      <td className="px-3 py-1 text-right tabular-nums text-xs text-gray-500">{fmtMoney(s.revenue)}</td>
      <td className={`px-3 py-1 text-right tabular-nums text-xs font-medium ${Number(s.profit) >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmtMoney(s.profit)}</td>
      <td className="px-3 py-1 text-right tabular-nums text-xs text-gray-400" title="Cost per click — prorated">{fmtRate(perClick(s.cost, s.clicks))}</td>
      <td className="px-3 py-1 text-right tabular-nums text-xs font-medium text-gray-700" title="Revenue per click">{fmtRate(perClick(s.revenue, s.clicks))}</td>
    </tr>
  ));
}

// ── Offer sub-table (shown when campaign row is expanded) ─────────────────────
function OfferSubTable({ campaignId, dateFrom, dateTo }) {
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

  return (
    <table className="w-full" style={{ tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: '32px' }} />
        <col />
        <col style={{ width: '80px' }} />
        <col style={{ width: '72px' }} />
        <col style={{ width: '96px' }} />
        <col style={{ width: '96px' }} />
        <col style={{ width: '96px' }} />
        <col style={{ width: '84px' }} />
        <col style={{ width: '84px' }} />
      </colgroup>
      <tbody>
        {isLoading && (
          <tr><td colSpan={9} className="px-4 py-2 text-xs text-gray-400 text-center bg-gray-50/50">Loading offers…</td></tr>
        )}
        {!isLoading && !offers?.length && (
          <tr><td colSpan={9} className="px-8 py-2 text-xs text-gray-400 bg-gray-50/50">No offer data yet — run a sync first.</td></tr>
        )}
        {offers?.flatMap((o) => {
          const expanded = expandedOfferIds.has(o.offer_id);
          return [
            <tr key={o.offer_id} className="bg-indigo-50/30 border-l-2 border-indigo-200">
              <td className="px-2 py-1.5">
                <button onClick={() => toggleOffer(o.offer_id)}
                  className="text-indigo-200 hover:text-indigo-500 transition-colors text-xs select-none"
                  title="Show OS breakdown">
                  {expanded ? '▼' : '▶'}
                </button>
              </td>
              <td className="px-3 py-1.5 text-xs text-gray-700 overflow-hidden">
                <span className="text-indigo-300 mr-1.5 select-none">↳</span>
                <span className="truncate" title={o.offer_name}>{o.offer_name}</span>
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-xs text-gray-600">{fmt(o.clicks)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-xs text-gray-600">{fmt(o.conversions)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-xs text-gray-600">{fmtMoney(o.cost)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-xs text-gray-600">{fmtMoney(o.revenue)}</td>
              <td className={`px-3 py-1.5 text-right tabular-nums text-xs font-medium ${Number(o.profit) >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmtMoney(o.profit)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-xs text-gray-400" title="Cost per click — prorated">{fmtRate(perClick(o.cost, o.clicks))}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-xs font-medium text-gray-700" title="Revenue per click">{fmtRate(perClick(o.revenue, o.clicks))}</td>
            </tr>,
            expanded ? <OsSubRows key={`os-${o.offer_id}`} campaignId={campaignId} offerId={o.offer_id} dateFrom={dateFrom} dateTo={dateTo} /> : null,
          ];
        })}
      </tbody>
    </table>
  );
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
      className="group flex items-center gap-1 text-left text-xs font-mono text-gray-600 hover:text-indigo-700 max-w-full"
      title={value || 'Click to set list name'}>
      <span className="line-clamp-2 min-w-0 flex-1">{value || <span className="text-gray-300 italic">—</span>}</span>
      <span className="opacity-0 group-hover:opacity-100 text-gray-300 text-[10px] shrink-0">✎</span>
    </button>
  );
}

// ── Inline data partner editor ────────────────────────────────────────────────
function PartnerCell({ campaignId, value, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const inputRef = useRef(null);

  const { mutate, isPending } = useMutation({
    mutationFn: (v) => api.updateCampaignPartner(campaignId, v),
    onSuccess: (_, v) => { onSaved(campaignId, v); setEditing(false); },
  });

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  if (editing) {
    return (
      <div className="flex items-center gap-1 min-w-[120px]">
        <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') mutate(draft); if (e.key === 'Escape') setEditing(false); }}
          className="border border-amber-300 rounded px-1.5 py-0.5 text-xs w-full outline-none focus:ring-1 focus:ring-amber-400"
          disabled={isPending} />
        <button type="button" onClick={() => mutate(draft)} disabled={isPending}
          className="text-amber-600 hover:text-amber-800 text-xs font-medium shrink-0">✓</button>
        <button type="button" onClick={() => setEditing(false)}
          className="text-gray-400 hover:text-gray-600 text-xs shrink-0">✕</button>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => { setDraft(value || ''); setEditing(true); }}
      className="group flex items-center gap-1 text-left"
      title={value || 'Click to set partner'}>
      {value
        ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-700 truncate max-w-full">{value}</span>
        : <span className="text-gray-300 text-xs italic">—</span>}
      <span className="opacity-0 group-hover:opacity-100 text-gray-300 text-[10px] shrink-0">✎</span>
    </button>
  );
}

// ── Column picker ─────────────────────────────────────────────────────────────
function ColumnPicker({ table, onClose }) {
  const configOrder = table.getState().columnOrder.filter((id) => CONFIGURABLE_IDS.includes(id));
  const visibility  = table.getState().columnVisibility;

  function move(id, dir) {
    const cOrder = table.getState().columnOrder.filter((i) => CONFIGURABLE_IDS.includes(i));
    const idx = cOrder.indexOf(id);
    const swap = idx + dir;
    if (swap < 0 || swap >= cOrder.length) return;
    const next = [...cOrder];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    table.setColumnOrder(['buyer', 'expand', ...next]);
  }

  function resetToDefault() {
    table.setColumnOrder(['buyer', 'expand', ...ALL_COLUMNS.map((c) => c.id)]);
    table.setColumnVisibility(Object.fromEntries(ALL_COLUMNS.map((c) => [c.id, c.defaultVisible])));
  }

  return (
    <div className="absolute right-0 top-10 z-50 bg-white border border-gray-200 rounded-lg shadow-lg w-56 py-2">
      <div className="px-3 pb-2 border-b border-gray-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Columns</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {configOrder.map((id) => {
          const meta = ALL_COLUMNS.find((c) => c.id === id);
          if (!meta) return null;
          const isVisible = visibility[id] !== false;
          return (
            <div key={id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50">
              <input type="checkbox" checked={isVisible}
                onChange={() => table.getColumn(id)?.toggleVisibility()}
                className="rounded text-indigo-600 cursor-pointer" />
              <span className="text-sm text-gray-700 flex-1">{meta.label}</span>
              <div className="flex flex-col">
                <button onClick={() => move(id, -1)} className="text-gray-300 hover:text-gray-600 text-[10px] leading-none">▲</button>
                <button onClick={() => move(id, 1)}  className="text-gray-300 hover:text-gray-600 text-[10px] leading-none">▼</button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-3 pt-2 border-t border-gray-100">
        <button onClick={resetToDefault} className="text-xs text-gray-400 hover:text-gray-600">Reset to default</button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(sixMonthsAgo);
  const [dateTo,   setDateTo]   = useState(today);
  const [applied,  setApplied]  = useState({ date_from: sixMonthsAgo, date_to: today });
  const [buyerFilter,    setBuyerFilter]    = useState('ALL');
  const [search,         setSearch]         = useState('');
  const [roiMin,         setRoiMin]         = useState('');
  const [roiMax,         setRoiMax]         = useState('');
  const [showColPicker,  setShowColPicker]  = useState(false);
  const [listOverrides,    setListOverrides]    = useState({});
  const [partnerOverrides, setPartnerOverrides] = useState({});

  // TanStack table state — loaded from localStorage
  const initCfg = useMemo(() => loadColConfig(), []);
  const [columnVisibility, setColumnVisibility] = useState(() => initCfg.visible);
  const [columnOrder,      setColumnOrder]      = useState(() => ['buyer', 'expand', ...initCfg.order]);
  const [sorting,          setSorting]          = useState([{ id: 'clicks', desc: true }]);
  const [pagination,       setPagination]       = useState({ pageIndex: 0, pageSize: 50 });
  const [expanded,         setExpanded]         = useState({});

  const queryClient = useQueryClient();

  useEffect(() => {
    const configOrder = columnOrder.filter((id) => CONFIGURABLE_IDS.includes(id));
    saveColConfig(configOrder, columnVisibility);
  }, [columnOrder, columnVisibility]);

  const handleListSaved    = useCallback((id, val) => setListOverrides((p) => ({ ...p, [id]: val })), []);
  const handlePartnerSaved = useCallback((id, val) => setPartnerOverrides((p) => ({ ...p, [id]: val })), []);

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
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  function onSynced() {
    queryClient.invalidateQueries({ queryKey: ['reports', 'media-buyers'] });
    queryClient.invalidateQueries({ queryKey: ['reports', 'sync-status'] });
  }

  const allCampaigns = useMemo(() => {
    if (!data?.buyers) return [];
    return BUYERS.flatMap((buyer) =>
      (data.buyers[buyer]?.campaigns || []).map((c) => ({ ...c, buyer }))
    );
  }, [data]);

  const filteredData = useMemo(() => {
    let result = buyerFilter === 'ALL' ? allCampaigns : allCampaigns.filter((c) => c.buyer === buyerFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => (c.title || '').toLowerCase().includes(q));
    }
    const min = roiMin !== '' ? Number(roiMin) : null;
    const max = roiMax !== '' ? Number(roiMax) : null;
    if (min !== null || max !== null) {
      result = result.filter((c) => {
        const roi = c.cost > 0 ? (c.profit / c.cost) * 100 : (c.profit > 0 ? Infinity : c.profit < 0 ? -Infinity : 0);
        if (min !== null && roi < min) return false;
        if (max !== null && roi > max) return false;
        return true;
      });
    }
    return result;
  }, [allCampaigns, buyerFilter, search, roiMin, roiMax]);

  const totals = useMemo(() => filteredData.reduce(
    (acc, c) => ({
      clicks:      acc.clicks      + (c.clicks      || 0),
      conversions: acc.conversions + (c.conversions  || 0),
      cost:        acc.cost        + (c.cost         || 0),
      revenue:     acc.revenue     + (c.revenue      || 0),
      profit:      acc.profit      + (c.profit       || 0),
    }),
    { clicks: 0, conversions: 0, cost: 0, revenue: 0, profit: 0 }
  ), [filteredData]);

  const columns = useMemo(() => [
    {
      id: 'buyer',
      header: '',
      size: 44, minSize: 44, maxSize: 44,
      enableResizing: false,
      enableSorting: false,
      cell: ({ row }) => (
        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${BUYER_COLORS[row.original.buyer]}`}>
          {row.original.buyer}
        </span>
      ),
    },
    {
      id: 'expand',
      header: '',
      size: 28, minSize: 28, maxSize: 28,
      enableResizing: false,
      enableSorting: false,
      cell: ({ row }) => (
        <button onClick={row.getToggleExpandedHandler()}
          className="text-gray-300 hover:text-indigo-500 transition-colors text-xs select-none"
          title="Show offers">
          {row.getIsExpanded() ? '▼' : '▶'}
        </button>
      ),
    },
    {
      id: 'title',
      accessorKey: 'title',
      header: 'Campaign',
      size: 260, minSize: 100,
      enableResizing: true,
      enableSorting: true,
      cell: ({ getValue }) => (
        <span className="block line-clamp-2 text-sm text-gray-700" title={String(getValue() ?? '')}>{getValue()}</span>
      ),
    },
    {
      id: 'data_list',
      header: 'List',
      size: 180, minSize: 80,
      enableResizing: true,
      enableSorting: true,
      accessorFn: (row) => listOverrides[row.id] !== undefined ? listOverrides[row.id] : (row.data_list ?? ''),
      cell: ({ row }) => (
        <ListCell
          campaignId={row.original.id}
          value={listOverrides[row.original.id] !== undefined ? listOverrides[row.original.id] : row.original.data_list}
          onSaved={handleListSaved}
        />
      ),
    },
    {
      id: 'data_partner',
      header: 'Partner',
      size: 100, minSize: 60,
      enableResizing: true,
      enableSorting: false,
      accessorFn: (row) => partnerOverrides[row.id] !== undefined ? partnerOverrides[row.id] : (row.data_partner ?? ''),
      cell: ({ row }) => (
        <PartnerCell
          campaignId={row.original.id}
          value={partnerOverrides[row.original.id] !== undefined ? partnerOverrides[row.original.id] : row.original.data_partner}
          onSaved={handlePartnerSaved}
        />
      ),
    },
    {
      id: 'route',
      accessorKey: 'route',
      header: 'Route',
      size: 90, minSize: 60,
      enableResizing: true,
      enableSorting: false,
      cell: ({ getValue }) => <span className="text-xs text-gray-500 truncate">{getValue() || '—'}</span>,
    },
    {
      id: 'carrier',
      accessorKey: 'carrier',
      header: 'Carrier',
      size: 90, minSize: 60,
      enableResizing: true,
      enableSorting: false,
      cell: ({ getValue }) => <span className="text-xs text-gray-500 truncate">{getValue() || '—'}</span>,
    },
    {
      id: 'vertical',
      accessorKey: 'vertical',
      header: 'Vertical',
      size: 90, minSize: 60,
      enableResizing: true,
      enableSorting: false,
      cell: ({ getValue }) => <span className="text-xs text-gray-500 truncate">{getValue() || '—'}</span>,
    },
    {
      id: 'clicks',
      accessorKey: 'clicks',
      header: 'Clicks',
      size: 90, minSize: 60,
      enableResizing: true,
      enableSorting: true,
      cell: ({ getValue }) => <span className="tabular-nums text-sm text-gray-800">{fmt(getValue())}</span>,
    },
    {
      id: 'conversions',
      accessorKey: 'conversions',
      header: 'Conv.',
      size: 80, minSize: 55,
      enableResizing: true,
      enableSorting: true,
      cell: ({ getValue }) => <span className="tabular-nums text-sm text-gray-800">{fmt(getValue())}</span>,
    },
    {
      id: 'cost',
      accessorKey: 'cost',
      header: 'Spend',
      size: 100, minSize: 70,
      enableResizing: true,
      enableSorting: true,
      cell: ({ getValue }) => <span className="tabular-nums text-sm text-gray-800">{fmtMoney(getValue())}</span>,
    },
    {
      id: 'revenue',
      accessorKey: 'revenue',
      header: 'Revenue',
      size: 100, minSize: 70,
      enableResizing: true,
      enableSorting: true,
      cell: ({ getValue }) => <span className="tabular-nums text-sm text-gray-800">{fmtMoney(getValue())}</span>,
    },
    {
      id: 'profit',
      accessorKey: 'profit',
      header: 'Profit',
      size: 100, minSize: 70,
      enableResizing: true,
      enableSorting: true,
      cell: ({ getValue }) => (
        <span className={`tabular-nums text-sm font-medium ${Number(getValue()) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {fmtMoney(getValue())}
        </span>
      ),
    },
    {
      id: 'roi',
      accessorFn: (row) => row.cost > 0 ? (row.profit / row.cost) * 100 : 0,
      header: ({ column }) => (
        <div className="flex items-center justify-end gap-1">
          <span>ROI</span>
          <SortIcon sorted={column.getIsSorted()} />
          <RoiFilterPopover
            roiMin={roiMin}
            roiMax={roiMax}
            onMinChange={(v) => { setRoiMin(v); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
            onMaxChange={(v) => { setRoiMax(v); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
          />
        </div>
      ),
      size: 96, minSize: 70,
      enableResizing: true,
      enableSorting: true,
      meta: { hasFilterHeader: true },
      cell: ({ getValue }) => {
        const v = Number(getValue());
        return (
          <span className={`tabular-nums text-sm font-medium ${v >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {v.toFixed(1)}%
          </span>
        );
      },
    },
    {
      id: 'cpc',
      accessorFn: (row) => perClick(row.cost, row.clicks),
      header: 'CPC',
      size: 90, minSize: 60,
      enableResizing: true,
      enableSorting: false,
      cell: ({ getValue }) => <span className="tabular-nums text-sm text-gray-600" title="Cost per click — prorated">{fmtRate(getValue())}</span>,
    },
    {
      id: 'epc',
      accessorFn: (row) => perClick(row.revenue, row.clicks),
      header: 'EPC',
      size: 90, minSize: 60,
      enableResizing: true,
      enableSorting: false,
      cell: ({ getValue }) => <span className="tabular-nums text-sm font-medium text-gray-700" title="Revenue per click">{fmtRate(getValue())}</span>,
    },
  ], [listOverrides, partnerOverrides, handleListSaved, handlePartnerSaved, roiMin, roiMax]);

  const table = useReactTable({
    data: filteredData,
    columns,
    getRowId: (row) => String(row.id),
    state: { columnVisibility, columnOrder, sorting, pagination, expanded },
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onSortingChange: (updater) => {
      setSorting(updater);
      setPagination((p) => ({ ...p, pageIndex: 0 }));
    },
    onPaginationChange: setPagination,
    onExpandedChange: setExpanded,
    getRowCanExpand: () => true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    columnResizeMode: 'onChange',
  });

  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount          = table.getPageCount();
  const totalRows          = filteredData.length;
  const noData             = !isLoading && data && allCampaigns.length === 0;
  const visibleLeafCount   = table.getVisibleLeafColumns().length;
  const visibleHeaders     = table.getHeaderGroups()[0]?.headers ?? [];
  const firstDataHeaderIdx = visibleHeaders.findIndex((h) => !NON_CONFIG_IDS.has(h.id));

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Media buyer performance</p>
      </div>

      {/* Controls */}
      <div className="card p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1">
          {[7, 30, 90, 180].map((d) => {
            const from = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
            const active = applied.date_from === from && applied.date_to === today;
            return (
              <button key={d} type="button"
                onClick={() => { setDateFrom(from); setDateTo(today); setApplied({ date_from: from, date_to: today }); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
                className={`px-2.5 py-1.5 text-xs font-medium rounded border transition-colors ${active ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {d}d
              </button>
            );
          })}
        </div>
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
          <select value={buyerFilter}
            onChange={(e) => { setBuyerFilter(e.target.value); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
            className="input">
            <option value="ALL">All buyers</option>
            {BUYERS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="relative">
          <label className="label">Search</label>
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
              placeholder="Search campaigns…"
              className="input pl-7 w-48"
            />
          </div>
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

      {!isLoading && !noData && filteredData.length > 0 && (
        <div className="card overflow-hidden">
          {/* Summary chips + column picker */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
            {(buyerFilter === 'ALL' ? BUYERS : [buyerFilter]).map((b) => {
              const campaigns = allCampaigns.filter((c) => c.buyer === b);
              if (!campaigns.length) return null;
              return (
                <button key={b}
                  onClick={() => { setBuyerFilter(buyerFilter === b ? 'ALL' : b); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                    buyerFilter === b || buyerFilter === 'ALL'
                      ? BUYER_COLORS[b] + ' border-transparent'
                      : 'bg-gray-50 text-gray-400 border-gray-200'
                  }`}>
                  <span>{b}</span><span className="opacity-70">{campaigns.length}</span>
                </button>
              );
            })}
            <span className="ml-auto text-xs text-gray-400">{filteredData.length} campaigns</span>
            <div className="relative">
              <button onClick={() => setShowColPicker((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                </svg>
                Columns
              </button>
              {showColPicker && <ColumnPicker table={table} onClose={() => setShowColPicker(false)} />}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table
              className="w-full"
              style={{ tableLayout: 'fixed', width: '100%' }}
            >
              <thead className="sticky top-0 z-10">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="border-b border-gray-200 bg-gray-50">
                    {headerGroup.headers.map((header) => {
                      const canSort = header.column.getCanSort();
                      const sorted  = header.column.getIsSorted();
                      const isRight = RIGHT_ALIGNED.has(header.id);
                      return (
                        <th
                          key={header.id}
                          style={{ width: header.getSize(), position: 'relative' }}
                          className={`px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider overflow-hidden ${
                            canSort ? 'cursor-pointer select-none hover:text-gray-800 hover:bg-gray-100' : ''
                          } ${isRight ? 'text-right' : 'text-left'}`}
                          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                        >
                          {header.column.columnDef.meta?.hasFilterHeader ? (
                            flexRender(header.column.columnDef.header, header.getContext())
                          ) : (
                            <div className={`flex items-center gap-1 ${isRight ? 'justify-end' : ''}`}>
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {canSort && <SortIcon sorted={sorted} />}
                            </div>
                          )}
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
                    <tr className="hover:bg-gray-50 transition-colors">
                      {row.getVisibleCells().map((cell) => {
                        const isRight = RIGHT_ALIGNED.has(cell.column.id);
                        return (
                          <td
                            key={cell.id}
                            style={{ width: cell.column.getSize() }}
                            className={`${cell.column.id === 'expand' ? 'px-1' : 'px-3'} py-2.5 overflow-hidden ${isRight ? 'text-right' : ''}`}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                    {row.getIsExpanded() && (
                      <tr>
                        <td colSpan={visibleLeafCount} className="p-0">
                          <OfferSubTable
                            campaignId={row.original.id}
                            dateFrom={applied.date_from}
                            dateTo={applied.date_to}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}

                {/* Totals row */}
                <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                  {visibleHeaders.map((header, idx) => {
                    const id = header.id;
                    const w  = { width: header.getSize() };
                    if (id === 'buyer')  return <td key={id} style={w} className="px-2 py-3" />;
                    if (id === 'expand') return <td key={id} style={w} className="px-1 py-3" />;
                    if (idx === firstDataHeaderIdx) return <td key={id} style={w} className="px-3 py-3 text-sm text-gray-700">Total</td>;
                    if (id === 'clicks')      return <td key={id} style={w} className="px-3 py-3 text-right tabular-nums text-sm text-gray-900">{fmt(totals.clicks)}</td>;
                    if (id === 'conversions') return <td key={id} style={w} className="px-3 py-3 text-right tabular-nums text-sm text-gray-900">{fmt(totals.conversions)}</td>;
                    if (id === 'cost')        return <td key={id} style={w} className="px-3 py-3 text-right tabular-nums text-sm text-gray-900">{fmtMoney(totals.cost)}</td>;
                    if (id === 'revenue')     return <td key={id} style={w} className="px-3 py-3 text-right tabular-nums text-sm text-gray-900">{fmtMoney(totals.revenue)}</td>;
                    if (id === 'profit')      return <td key={id} style={w} className={`px-3 py-3 text-right tabular-nums text-sm font-bold ${totals.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtMoney(totals.profit)}</td>;
                    if (id === 'roi')         { const rv = totals.cost > 0 ? (totals.profit / totals.cost) * 100 : 0; return <td key={id} style={w} className={`px-3 py-3 text-right tabular-nums text-sm font-bold ${rv >= 0 ? 'text-green-700' : 'text-red-600'}`}>{rv.toFixed(1)}%</td>; }
                    if (id === 'cpc')         return <td key={id} style={w} className="px-3 py-3 text-right tabular-nums text-sm text-gray-900">{fmtRate(perClick(totals.cost, totals.clicks))}</td>;
                    if (id === 'epc')         return <td key={id} style={w} className="px-3 py-3 text-right tabular-nums text-sm text-gray-900">{fmtRate(perClick(totals.revenue, totals.clicks))}</td>;
                    return <td key={id} style={w} className="px-3 py-3" />;
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{applied.date_from} → {applied.date_to}</span>
              <span>·</span>
              <span>{totalRows} campaigns</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span>Rows</span>
                <select value={pageSize} onChange={(e) => table.setPageSize(Number(e.target.value))}
                  className="border border-gray-200 rounded px-1.5 py-0.5 text-xs text-gray-700 bg-white">
                  {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}
                  className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">«</button>
                <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}
                  className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">‹</button>
                <span className="px-3 py-1 text-xs text-gray-600">
                  {pageIndex + 1} / {pageCount}
                </span>
                <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}
                  className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">›</button>
                <button onClick={() => table.setPageIndex(pageCount - 1)} disabled={!table.getCanNextPage()}
                  className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">»</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
