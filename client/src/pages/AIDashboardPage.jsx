import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseContent(text) {
  if (!text) return [];
  const lines = text.split('\n');
  const sections = [];
  let current = null;
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      if (current) sections.push(current);
      current = { heading: h2[1].trim(), bullets: [], table: null };
    } else if (!current) {
      continue;
    } else if (/^-{2,}\s*$/.test(line.trim())) {
      // horizontal rule — skip
    } else if (line.trim().startsWith('|')) {
      // Split on unescaped | only — \| is a literal pipe inside a cell
      const cells = line.replace(/\\\|/g, '\x00').split('|')
        .slice(1, -1).map(c => c.replace(/\x00/g, '|').trim());
      if (cells.every(c => /^[-: ]+$/.test(c))) continue; // separator row
      if (!current.table) current.table = { headers: cells, rows: [] };
      else current.table.rows.push(cells);
    } else if (line.trim().startsWith('-')) {
      current.bullets.push(line.replace(/^[-*]\s*/, '').trim());
    } else if (line.trim() && !line.startsWith('#')) {
      // plain text instruction lines (like column spec hints) — skip
    }
  }
  if (current) sections.push(current);
  return sections;
}

function isBuyerSection(h) { return h.startsWith('👤'); }
function buyerOf(h) { return h.replace(/^👤\s*/, '').split(/[\s—–-]/)[0].trim(); }

const SECTION_STYLES = {
  '✅': { border: 'border-green-200',  bg: 'bg-green-50',  heading: 'text-green-800',  dot: 'bg-green-500'  },
  '🔁': { border: 'border-blue-200',   bg: 'bg-blue-50',   heading: 'text-blue-800',   dot: 'bg-blue-500'   },
  '⚠️': { border: 'border-amber-200',  bg: 'bg-amber-50',  heading: 'text-amber-800',  dot: 'bg-amber-500'  },
  '❌': { border: 'border-red-200',    bg: 'bg-red-50',    heading: 'text-red-800',    dot: 'bg-red-500'    },
  '💰': { border: 'border-green-200',  bg: 'bg-green-50',  heading: 'text-green-800',  dot: 'bg-green-500'  },
  '🔴': { border: 'border-red-200',    bg: 'bg-red-50',    heading: 'text-red-800',    dot: 'bg-red-500'    },
  '🧪': { border: 'border-purple-200', bg: 'bg-purple-50', heading: 'text-purple-800', dot: 'bg-purple-500' },
  '👤': { border: 'border-indigo-200', bg: 'bg-indigo-50', heading: 'text-indigo-800', dot: 'bg-indigo-500' },
  '📋': { border: 'border-teal-200',   bg: 'bg-teal-50',   heading: 'text-teal-800',   dot: 'bg-teal-500'   },
};
function sectionStyle(h) {
  for (const [e, s] of Object.entries(SECTION_STYLES)) if (h.startsWith(e)) return s;
  return { border: 'border-gray-200', bg: 'bg-gray-50', heading: 'text-gray-700', dot: 'bg-gray-400' };
}

function renderMd(text) {
  return (text || '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// Color-code cell values: money (red/green), ROI%, EPC
function cellClass(header, value) {
  const h = (header || '').toLowerCase();
  const v = (value || '').trim();
  if (h === 'action' || h === 'priority' || h === 'verdict' || h === 'signal') return 'font-medium';
  if (h.includes('profit') || h.includes('loss') || h.includes('move amount')) {
    if (v.startsWith('-') || v.startsWith('-$')) return 'text-red-600 font-medium tabular-nums';
    if (v.startsWith('$') || v.match(/^\d/)) return 'text-green-700 font-medium tabular-nums';
  }
  if (h.includes('roi') || h.includes('drop')) {
    if (v.startsWith('-')) return 'text-red-600 font-medium tabular-nums';
    return 'text-green-700 font-medium tabular-nums';
  }
  if (h.includes('epc')) return 'font-medium tabular-nums text-indigo-700';
  return 'text-gray-700';
}

function SectionTable({ table }) {
  if (!table || !table.headers || !table.rows.length) return null;
  return (
    <div className="overflow-x-auto rounded-md border border-white/60">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-black/10 bg-black/5">
            {table.headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {table.rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white/40' : 'bg-white/20'}>
              {table.headers.map((h, j) => (
                <td key={j} className={`px-3 py-2 ${cellClass(h, row[j])}`}
                  dangerouslySetInnerHTML={{ __html: renderMd(row[j] ?? '') }} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ sec }) {
  const style = sectionStyle(sec.heading);
  const hasTable = sec.table && sec.table.rows.length > 0;
  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} px-4 py-3`}>
      <h3 className={`font-semibold text-sm mb-2.5 ${style.heading}`}>{sec.heading}</h3>
      {hasTable
        ? <SectionTable table={sec.table} />
        : (
          <ul className="space-y-1.5">
            {sec.bullets.map((b, j) => (
              <li key={j} className="flex items-start gap-2 text-sm text-gray-700">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 opacity-50 ${style.dot}`} />
                <span dangerouslySetInnerHTML={{ __html: renderMd(b) }} />
              </li>
            ))}
          </ul>
        )
      }
    </div>
  );
}

function SectionGroup({ icon, label, sublabel, color, children }) {
  const colors = {
    indigo: { bar: 'bg-indigo-600', text: 'text-white', wrap: 'border-indigo-200 ring-1 ring-indigo-100' },
    teal:   { bar: 'bg-teal-600',   text: 'text-white', wrap: 'border-teal-200   ring-1 ring-teal-100'   },
  };
  const c = colors[color] || colors.indigo;
  return (
    <div className={`rounded-xl border ${c.wrap} overflow-hidden`}>
      <div className={`${c.bar} px-4 py-2.5 flex items-center gap-2`}>
        <span className="text-lg leading-none">{icon}</span>
        <span className={`font-semibold text-sm ${c.text}`}>{label}</span>
        {sublabel && <span className={`text-xs opacity-70 ${c.text} ml-1`}>· {sublabel}</span>}
      </div>
      <div className="p-3 space-y-3 bg-white/60">
        {children}
      </div>
    </div>
  );
}

const BUYERS = ['TK', 'MA', 'DS', 'KG'];
const DAY_OPTIONS = [7, 14, 30, 60, 90, 180];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AIDashboardPage() {
  const [buyer, setBuyer]               = useState('Overview');
  const [days, setDays]                 = useState(14);  // view-only selector
  const [error, setError]               = useState(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState(null); // null = freshest for period
  const [selectedListId, setSelectedListId]         = useState(null); // null = latest
  const queryClient = useQueryClient();

  // ── Campaign report — period-scoped history ──────────────────────────────
  const { data: campaignHistory = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['reports', 'ai-recommendations', 'history'],
    queryFn: () => api.getAIReportHistory(50),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const periodHistory = campaignHistory.filter(h => h.period_days === days);
  const effectiveCampaignId = selectedCampaignId ?? periodHistory[0]?.id ?? null;

  const { data: campaignReport, isLoading: loadingCampaign } = useQuery({
    queryKey: ['reports', 'ai-recommendations', 'history', effectiveCampaignId],
    queryFn: () => api.getAIReportHistoryItem(effectiveCampaignId),
    enabled: effectiveCampaignId != null,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  // ── List report — always latest (no period concept) ──────────────────────
  const { data: listHistory = [] } = useQuery({
    queryKey: ['reports', 'ai-list', 'history'],
    queryFn: () => api.getAIListReportHistory(20),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const effectiveListId = selectedListId ?? listHistory[0]?.id ?? null;

  const { data: listReport, isLoading: loadingList } = useQuery({
    queryKey: ['reports', 'ai-list', 'history', effectiveListId],
    queryFn: () => api.getAIListReportHistoryItem(effectiveListId),
    enabled: effectiveListId != null,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  // ── Sync freshness ───────────────────────────────────────────────────────
  const { data: syncStatus }      = useQuery({ queryKey: ['reports','sync','status'],         queryFn: () => api.getSyncStatus(),      staleTime: 30000, refetchInterval: 30000, retry: false });
  const { data: offerSyncStatus } = useQuery({ queryKey: ['reports','sync','offers','status'], queryFn: () => api.getOfferSyncStatus(), staleTime: 30000, refetchInterval: 30000, retry: false });

  const syncRunning = Boolean(syncStatus?.running || offerSyncStatus?.running);
  const lastSyncAt  = [syncStatus?.completed_at, offerSyncStatus?.completed_at].filter(Boolean).map(d => new Date(d)).sort((a,b) => b-a)[0] || null;

  // freshness checks against the freshest report for the current period
  const campaignAt   = campaignReport?.generated_at ? new Date(campaignReport.generated_at) : null;
  const listAt       = listReport?.generated_at     ? new Date(listReport.generated_at)     : null;
  const oldestAt     = [campaignAt, listAt].filter(Boolean).sort((a,b) => a-b)[0] || null;
  const dataIsNewer  = Boolean(lastSyncAt && oldestAt && lastSyncAt > oldestAt);
  const freshness    = syncRunning ? 'syncing' : !oldestAt ? 'none' : dataIsNewer ? 'stale' : 'fresh';

  // Always poll AI status so the progress card reflects generation triggered from Import Logs
  const { data: campaignStatus } = useQuery({
    queryKey: ['ai-status', 'campaign'],
    queryFn: () => api.getAICampaignStatus(),
    refetchInterval: 5000,
    retry: false,
  });
  const { data: listStatus } = useQuery({
    queryKey: ['ai-status', 'list'],
    queryFn: () => api.getAIListStatus(),
    refetchInterval: 5000,
    retry: false,
  });

  const generating = Boolean(campaignStatus?.running || listStatus?.running);

  // Refresh report history when generation finishes (triggered from anywhere — Import Logs, cron, etc.)
  const prevGeneratingRef = useRef(false);
  useEffect(() => {
    if (prevGeneratingRef.current && !generating) {
      setSelectedCampaignId(null);
      setSelectedListId(null);
      queryClient.invalidateQueries({ queryKey: ['reports', 'ai-recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['reports', 'ai-list'] });
    }
    prevGeneratingRef.current = generating;
  }, [generating, queryClient]);

  const completedPeriods = campaignStatus?.completedPeriods || [];
  const currentPeriod    = campaignStatus?.currentPeriod || null;

  function handleDaysChange(d) {
    setDays(d);
    setSelectedCampaignId(null); // auto-pick freshest for new period
  }

  // ── Parsed sections ──────────────────────────────────────────────────────
  const campaignSections = parseContent(campaignReport?.content);
  const listSections     = parseContent(listReport?.content);
  const campaignGeneral  = campaignSections.filter(s => !isBuyerSection(s.heading));
  const listGeneral      = listSections.filter(s => !isBuyerSection(s.heading));
  const campaignBuyer    = b => campaignSections.filter(s => isBuyerSection(s.heading) && buyerOf(s.heading) === b);
  const listBuyer        = b => listSections.filter(s => isBuyerSection(s.heading) && buyerOf(s.heading) === b);

  const isLoading   = loadingHistory || loadingCampaign || loadingList;
  const hasAnything = campaignReport || listReport;
  const noPeriodReport = !loadingCampaign && !loadingHistory && periodHistory.length === 0;

  function fmtDate(d) {
    return new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  return (
    <div className="p-8 space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Campaign recommendations + list intelligence in one view</p>
        </div>
      </div>

      {/* Controls row: period tabs + history dropdowns */}
      <div className="flex flex-wrap items-center gap-4">

        {/* Period selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Analyze last</span>
          <div className="flex rounded-md border border-gray-200 overflow-hidden">
            {DAY_OPTIONS.map(d => (
              <button key={d} onClick={() => handleDaysChange(d)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  days === d ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}>
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Campaign history — scoped to selected period */}
        {periodHistory.length > 1 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Campaign report</span>
            <select value={effectiveCampaignId ?? ''} onChange={e => setSelectedCampaignId(e.target.value ? Number(e.target.value) : null)}
              className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 bg-white max-w-[180px]">
              {periodHistory.map((h, i) => (
                <option key={h.id} value={h.id}>
                  {i === 0 ? 'Latest — ' : ''}{fmtDate(h.generated_at)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* List history */}
        {listHistory.length > 1 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">List analysis</span>
            <select value={effectiveListId ?? ''} onChange={e => setSelectedListId(e.target.value ? Number(e.target.value) : null)}
              className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 bg-white max-w-[180px]">
              {listHistory.map((h, i) => (
                <option key={h.id} value={h.id}>
                  {i === 0 ? 'Latest — ' : ''}{fmtDate(h.generated_at)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Freshness dot */}
        {freshness !== 'none' && (
          <div className={`flex items-center gap-1.5 text-xs ml-auto ${freshness === 'syncing' ? 'text-blue-600' : freshness === 'stale' ? 'text-amber-600' : 'text-gray-400'}`}>
            <span className={`w-2 h-2 rounded-full inline-block ${freshness === 'syncing' ? 'bg-blue-500 animate-pulse' : freshness === 'stale' ? 'bg-amber-500' : 'bg-green-500'}`} />
            {freshness === 'syncing' && 'Sync running — wait before generating.'}
            {freshness === 'stale'   && 'New sync data — regenerate for latest analysis.'}
            {freshness === 'fresh'   && campaignAt && `Generated ${fmtDate(campaignAt)}`}
          </div>
        )}
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Buyer pills */}
      <div className="flex items-center gap-2">
        {['Overview', ...BUYERS].map(b => (
          <button key={b} onClick={() => setBuyer(b)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              buyer === b ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {b === 'Overview' ? '🌐 Overview' : b}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && !generating && (
        <div className="card p-10 text-center">
          <div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      )}

      {/* No report for this period yet */}
      {noPeriodReport && !generating && (
        <div className="card p-8 text-center space-y-2">
          <p className="text-sm font-medium text-gray-700">No {days}-day report generated yet</p>
          <p className="text-xs text-gray-400">Go to Import Logs and click Generate AI to create one for this window.</p>
        </div>
      )}

      {/* Generating */}
      {generating && (
        <div className="card p-8 text-center space-y-4">
          <div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm font-medium text-gray-700">Generating all date windows…</p>
          <div className="flex justify-center gap-2 flex-wrap text-xs">
            {DAY_OPTIONS.map(d => {
              const done = completedPeriods.includes(d);
              const active = currentPeriod === d;
              return (
                <span key={d} className={`px-2 py-1 rounded-full font-medium ${
                  done   ? 'bg-green-100 text-green-700' :
                  active ? 'bg-indigo-100 text-indigo-700' :
                           'bg-gray-100 text-gray-400'
                }`}>
                  {done ? '✓ ' : active ? '⏳ ' : ''}{d}d
                </span>
              );
            })}
            <span className={`px-2 py-1 rounded-full font-medium ${!listStatus?.running && listStatus?.startedAt ? 'bg-green-100 text-green-700' : listStatus?.running ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-400'}`}>
              {!listStatus?.running && listStatus?.startedAt ? '✓ ' : listStatus?.running ? '⏳ ' : ''}Lists
            </span>
          </div>
          <p className="text-xs text-gray-400">{completedPeriods.length}/{DAY_OPTIONS.length} periods done · ~2 min total</p>
        </div>
      )}

      {/* ── OVERVIEW ── */}
      {buyer === 'Overview' && hasAnything && !isLoading && !generating && (
        <div className="space-y-6">
          {campaignGeneral.length > 0 && (
            <SectionGroup icon="📊" label="Campaign Recommendations" sublabel={`${days}d window`} color="indigo">
              {campaignGeneral.map((sec, i) => <Section key={i} sec={sec} />)}
            </SectionGroup>
          )}
          {listGeneral.length > 0 && (
            <SectionGroup icon="📋" label="List Intelligence" color="teal">
              {listGeneral.map((sec, i) => <Section key={i} sec={sec} />)}
            </SectionGroup>
          )}
        </div>
      )}

      {/* ── BUYER VIEW ── */}
      {BUYERS.includes(buyer) && hasAnything && !isLoading && !generating && (
        <div className="space-y-6">
          <SectionGroup icon="📊" label={`${buyer} — Campaign Analysis`} sublabel={`${days}d window`} color="indigo">
            {!campaignReport
              ? <p className="text-sm text-gray-400 px-1">No {days}-day campaign report — click Generate.</p>
              : campaignBuyer(buyer).length > 0
                ? campaignBuyer(buyer).map((sec, i) => <Section key={i} sec={sec} />)
                : <p className="text-sm text-gray-400 px-1">No {buyer} sections in this report — regenerate to get per-buyer analysis.</p>
            }
          </SectionGroup>
          <SectionGroup icon="📋" label={`${buyer} — List Intelligence`} color="teal">
            {!listReport
              ? <p className="text-sm text-gray-400 px-1">No list analysis — click Generate.</p>
              : listBuyer(buyer).length > 0
                ? listBuyer(buyer).map((sec, i) => <Section key={i} sec={sec} />)
                : <p className="text-sm text-gray-400 px-1">No {buyer} list sections found — regenerate to get per-buyer list queue.</p>
            }
          </SectionGroup>
        </div>
      )}

    </div>
  );
}
