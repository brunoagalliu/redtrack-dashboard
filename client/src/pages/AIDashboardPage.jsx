import { useState } from 'react';
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
    if (h2) { if (current) sections.push(current); current = { heading: h2[1].trim(), bullets: [] }; }
    else if (current && line.trim().startsWith('-')) current.bullets.push(line.replace(/^[-*]\s*/, '').trim());
    else if (current && line.trim() && !line.startsWith('#')) current.bullets.push(line.trim());
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
  return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function Section({ sec }) {
  const style = sectionStyle(sec.heading);
  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} px-4 py-3`}>
      <h3 className={`font-semibold text-sm mb-2 ${style.heading}`}>{sec.heading}</h3>
      <ul className="space-y-1.5">
        {sec.bullets.map((b, j) => (
          <li key={j} className="flex items-start gap-2 text-sm text-gray-700">
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 opacity-50 ${style.dot}`} />
            <span dangerouslySetInnerHTML={{ __html: renderMd(b) }} />
          </li>
        ))}
      </ul>
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

const BUYERS = ['TK', 'MA', 'DS'];
const DAY_OPTIONS = [7, 14, 30, 60, 90];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AIDashboardPage() {
  const [buyer, setBuyer]               = useState('Overview');
  const [days, setDays]                 = useState(14);
  const [generating, setGenerating]     = useState(false);
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

  // ── Generate both at once ────────────────────────────────────────────────
  async function handleGenerate() {
    setGenerating(true); setError(null);
    try {
      await Promise.all([
        api.generateAIReport(days),
        api.generateAIListReport(),
      ]);
      setSelectedCampaignId(null); // pick up the new entry for this period
      setSelectedListId(null);
      queryClient.invalidateQueries({ queryKey: ['reports', 'ai-recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['reports', 'ai-list'] });
    } catch (e) {
      setError(e.message || 'Failed to generate analysis.');
    } finally {
      setGenerating(false);
    }
  }

  function handleDaysChange(d) {
    setDays(d);
    setSelectedCampaignId(null); // auto-pick freshest for new period
  }

  // ── Parsed sections ──────────────────────────────────────────────────────
  const campaignSections = parseContent(campaignReport?.content);
  const listSections     = parseContent(listReport?.content);
  const campaignGeneral  = campaignSections.filter(s => !isBuyerSection(s.heading));
  const listGeneral      = listSections.filter(s => !isBuyerSection(s.heading));
  const campaignBuyer    = b => campaignSections.find(s => isBuyerSection(s.heading) && buyerOf(s.heading) === b);
  const listBuyer        = b => listSections.find(s => isBuyerSection(s.heading) && buyerOf(s.heading) === b);

  const isLoading   = loadingHistory || loadingCampaign || loadingList;
  const hasAnything = campaignReport || listReport;
  const noPeriodReport = !loadingCampaign && !loadingHistory && periodHistory.length === 0;

  function fmtDate(d) {
    return new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  return (
    <div className="p-8 max-w-7xl space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Campaign recommendations + list intelligence in one view</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleGenerate} disabled={generating || syncRunning}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
            {generating ? (
              <><span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analyzing…</>
            ) : (
              <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>Generate Analysis</>
            )}
          </button>
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
          <p className="text-xs text-gray-400">Click Generate Analysis to create one for this window.</p>
        </div>
      )}

      {/* Generating */}
      {generating && (
        <div className="card p-10 text-center space-y-3">
          <div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm font-medium text-gray-700">Running campaign + list analysis in parallel…</p>
          <p className="text-xs text-gray-400">Takes about 15–30 seconds.</p>
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
          <SectionGroup icon="📊" label="Campaign Actions" sublabel={`${days}d window`} color="indigo">
            {campaignBuyer(buyer)
              ? <Section sec={campaignBuyer(buyer)} />
              : <p className="text-sm text-gray-400 px-1">{campaignReport ? `No section for ${buyer}.` : `No ${days}-day campaign report — click Generate.`}</p>
            }
          </SectionGroup>
          <SectionGroup icon="📋" label="List Queue" color="teal">
            {listBuyer(buyer)
              ? <Section sec={listBuyer(buyer)} />
              : <p className="text-sm text-gray-400 px-1">{listReport ? `No list queue for ${buyer}.` : 'No list analysis — click Generate.'}</p>
            }
          </SectionGroup>
        </div>
      )}

    </div>
  );
}
