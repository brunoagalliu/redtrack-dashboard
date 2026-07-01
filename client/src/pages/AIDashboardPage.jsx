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

function Section({ sec }) {
  const style = sectionStyle(sec.heading);
  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} px-4 py-3`}>
      <h3 className={`font-semibold text-sm mb-2 ${style.heading}`}>{sec.heading}</h3>
      <ul className="space-y-1.5">
        {sec.bullets.map((b, j) => (
          <li key={j} className="flex items-start gap-2 text-sm text-gray-700">
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 opacity-50 ${style.dot}`} />{b}
          </li>
        ))}
      </ul>
    </div>
  );
}

function HistorySelect({ label, options, value, onChange }) {
  if (!options.length) return null;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-400">{label}</span>
      <select value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
        className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 bg-white max-w-[190px]">
        <option value="">Latest</option>
        {options.map((h, i) => (
          <option key={h.id} value={h.id}>
            {i === 0 ? 'Latest — ' : ''}
            {new Date(h.generated_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            {h.period_days ? ` (${h.period_days}d)` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

const BUYERS = ['TK', 'MA', 'DS'];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AIDashboardPage() {
  const [buyer, setBuyer]             = useState('Overview');
  const [genCampaign, setGenCampaign] = useState(false);
  const [genList, setGenList]         = useState(false);
  const [campaignDays, setCampaignDays] = useState(14);
  const [campaignErr, setCampaignErr] = useState(null);
  const [listErr, setListErr]         = useState(null);

  // History selection — null means "show latest"
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [selectedListId, setSelectedListId]         = useState(null);

  const queryClient = useQueryClient();

  // ── Campaign report ──────────────────────────────────────────────────────
  const { data: latestCampaign, isLoading: loadingCampaign } = useQuery({
    queryKey: ['reports', 'ai-recommendations'],
    queryFn: () => api.getAIReport(),
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  const { data: campaignHistory = [] } = useQuery({
    queryKey: ['reports', 'ai-recommendations', 'history'],
    queryFn: () => api.getAIReportHistory(50),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Filter history by selected campaign day window
  const periodHistory = campaignHistory.filter(h => h.period_days === campaignDays);
  const effectiveCampaignId = selectedCampaignId ?? periodHistory[0]?.id ?? null;

  const { data: campaignHistoryItem, isLoading: loadingCampaignItem } = useQuery({
    queryKey: ['reports', 'ai-recommendations', 'history', effectiveCampaignId],
    queryFn: () => api.getAIReportHistoryItem(effectiveCampaignId),
    enabled: effectiveCampaignId != null,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  const campaignReport = effectiveCampaignId != null ? campaignHistoryItem : latestCampaign;

  // ── List report ──────────────────────────────────────────────────────────
  const { data: latestList, isLoading: loadingList } = useQuery({
    queryKey: ['reports', 'ai-list'],
    queryFn: () => api.getAIListReport(),
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  const { data: listHistory = [] } = useQuery({
    queryKey: ['reports', 'ai-list', 'history'],
    queryFn: () => api.getAIListReportHistory(20),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const { data: listHistoryItem, isLoading: loadingListItem } = useQuery({
    queryKey: ['reports', 'ai-list', 'history', selectedListId],
    queryFn: () => api.getAIListReportHistoryItem(selectedListId),
    enabled: selectedListId != null,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  const listReport = selectedListId != null ? listHistoryItem : latestList;

  // ── Sync freshness ───────────────────────────────────────────────────────
  const { data: syncStatus }      = useQuery({ queryKey: ['reports','sync','status'],         queryFn: () => api.getSyncStatus(),      staleTime: 30000, refetchInterval: 30000, retry: false });
  const { data: offerSyncStatus } = useQuery({ queryKey: ['reports','sync','offers','status'], queryFn: () => api.getOfferSyncStatus(), staleTime: 30000, refetchInterval: 30000, retry: false });
  const syncRunning = Boolean(syncStatus?.running || offerSyncStatus?.running);

  // ── Generate handlers ────────────────────────────────────────────────────
  async function handleGenCampaign() {
    setGenCampaign(true); setCampaignErr(null);
    try {
      await api.generateAIReport(campaignDays);
      setSelectedCampaignId(null);
      queryClient.invalidateQueries({ queryKey: ['reports', 'ai-recommendations'] });
    } catch (e) { setCampaignErr(e.message); }
    finally { setGenCampaign(false); }
  }

  async function handleGenList() {
    setGenList(true); setListErr(null);
    try {
      await api.generateAIListReport();
      setSelectedListId(null);
      queryClient.invalidateQueries({ queryKey: ['reports', 'ai-list'] });
    } catch (e) { setListErr(e.message); }
    finally { setGenList(false); }
  }

  function handleDaysChange(d) {
    setCampaignDays(d);
    setSelectedCampaignId(null); // auto-pick freshest for new period
  }

  // ── Parsed sections ──────────────────────────────────────────────────────
  const campaignSections = parseContent(campaignReport?.content);
  const listSections     = parseContent(listReport?.content);
  const campaignGeneral  = campaignSections.filter(s => !isBuyerSection(s.heading));
  const listGeneral      = listSections.filter(s => !isBuyerSection(s.heading));
  const campaignBuyer    = b => campaignSections.find(s => isBuyerSection(s.heading) && buyerOf(s.heading) === b);
  const listBuyer        = b => listSections.find(s => isBuyerSection(s.heading) && buyerOf(s.heading) === b);

  const isLoading   = loadingCampaign || loadingList || loadingCampaignItem || loadingListItem;
  const hasAnything = campaignReport || listReport;

  return (
    <div className="p-8 max-w-7xl space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Campaign recommendations + list intelligence in one view</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {syncRunning && (
            <span className="text-xs text-blue-600 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />Sync running
            </span>
          )}
          {/* Campaign generate */}
          <div className="flex items-center gap-1.5 border border-gray-200 rounded-md px-2 py-1.5 bg-white">
            <span className="text-xs text-gray-500">Campaign</span>
            <select value={campaignDays} onChange={e => handleDaysChange(Number(e.target.value))}
              className="text-xs text-gray-700 bg-transparent border-none outline-none">
              {[7, 14, 30].map(d => <option key={d} value={d}>{d}d</option>)}
            </select>
            <button onClick={handleGenCampaign} disabled={genCampaign}
              className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50">
              {genCampaign
                ? <span className="inline-block w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              }
              {genCampaign ? 'Generating…' : 'Generate'}
            </button>
          </div>
          {/* List generate */}
          <div className="flex items-center gap-1.5 border border-gray-200 rounded-md px-2 py-1.5 bg-white">
            <span className="text-xs text-gray-500">Lists</span>
            <button onClick={handleGenList} disabled={genList}
              className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50">
              {genList
                ? <span className="inline-block w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              }
              {genList ? 'Generating…' : 'Generate'}
            </button>
          </div>
        </div>
      </div>

      {/* History selectors */}
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <HistorySelect
          label="Campaign report:"
          options={periodHistory}
          value={selectedCampaignId}
          onChange={setSelectedCampaignId}
        />
        <HistorySelect
          label="List analysis:"
          options={listHistory}
          value={selectedListId}
          onChange={setSelectedListId}
        />
        {campaignReport && (
          <span className="text-gray-400 ml-auto">
            Campaign: {new Date(campaignReport.generated_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {campaignReport.period_days}d window
            {listReport && ` · Lists: ${new Date(listReport.generated_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
          </span>
        )}
      </div>

      {/* Errors */}
      {campaignErr && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{campaignErr}</div>}
      {listErr     && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{listErr}</div>}

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
      {isLoading && (
        <div className="card p-10 text-center">
          <div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && !hasAnything && !genCampaign && !genList && (
        <div className="card p-10 text-center space-y-2">
          <p className="text-sm font-medium text-gray-700">No AI reports generated yet</p>
          <p className="text-xs text-gray-400">Use the generate buttons above to create your first campaign report and list analysis.</p>
        </div>
      )}

      {(genCampaign || genList) && (
        <div className="card p-8 text-center">
          <div className="inline-block w-6 h-6 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3" />
          <p className="text-sm text-gray-600">{genCampaign ? 'Analyzing campaign data…' : 'Analyzing list performance…'}</p>
        </div>
      )}

      {/* ── OVERVIEW ── */}
      {buyer === 'Overview' && hasAnything && !isLoading && (
        <div className="space-y-8">
          {campaignGeneral.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Campaign Recommendations</h2>
              {campaignGeneral.map((sec, i) => <Section key={i} sec={sec} />)}
            </div>
          )}
          {!campaignReport && !loadingCampaign && (
            <div className="card p-6 text-center text-sm text-gray-400">No campaign report for {campaignDays}-day window — click Generate to create one.</div>
          )}
          {listGeneral.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">List Intelligence</h2>
              {listGeneral.map((sec, i) => <Section key={i} sec={sec} />)}
            </div>
          )}
          {!listReport && !loadingList && (
            <div className="card p-6 text-center text-sm text-gray-400">No list analysis yet — click Generate under Lists.</div>
          )}
        </div>
      )}

      {/* ── BUYER VIEW ── */}
      {BUYERS.includes(buyer) && hasAnything && !isLoading && (
        <div className="space-y-6">
          {(() => {
            const cb = campaignBuyer(buyer);
            const lb = listBuyer(buyer);
            return (
              <>
                <div className="space-y-2">
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Campaign Actions</h2>
                  {cb ? <Section sec={cb} /> : <div className="card p-4 text-sm text-gray-400">{campaignReport ? `No section for ${buyer} in this report.` : 'No campaign report — click Generate.'}</div>}
                </div>
                <div className="space-y-2">
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">List Queue</h2>
                  {lb ? <Section sec={lb} /> : <div className="card p-4 text-sm text-gray-400">{listReport ? `No list queue for ${buyer} in this report.` : 'No list analysis — click Generate.'}</div>}
                </div>
              </>
            );
          })()}
        </div>
      )}

    </div>
  );
}
