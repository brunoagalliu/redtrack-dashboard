import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

function fmtMoney(n) {
  const v = Number(n || 0);
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtRate(n)  { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }); }
function fmt(n)      { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function fmtDate(s)  { return s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'; }

function StatusBadge({ days }) {
  if (days === null || days === undefined) return null;
  const d = Number(days);
  if (d < 14)  return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Active</span>;
  if (d < 28)  return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">Cooling {d}d</span>;
  return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Idle {d}d</span>;
}

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <span className="text-gray-300 ml-0.5">↕</span>;
  return <span className="text-indigo-500 ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

// Sub-table: campaigns for an expanded list
function CampaignRows({ listKey, days }) {
  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'lists', 'campaigns', listKey, days],
    queryFn: () => api.getListCampaigns(listKey, days),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (isLoading) return (
    <tr><td colSpan={10} className="px-4 py-4 bg-gray-50 text-center">
      <span className="inline-block w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
    </td></tr>
  );

  const rows = data?.rows || [];
  if (!rows.length) return (
    <tr><td colSpan={10} className="px-4 py-3 bg-gray-50 text-xs text-gray-400 text-center">No campaigns found for this list.</td></tr>
  );

  return rows.map((c, i) => {
    const profit = Number(c.profit);
    const isFirst = i === 0;
    return (
      <tr key={c.id} className="bg-indigo-50/40 border-b border-indigo-100/60">
        {/* indent spacer */}
        <td className="w-8 border-r border-indigo-100" />
        <td className="px-3 py-2" colSpan={2}>
          <div className="font-mono text-xs text-gray-600 truncate max-w-xs" title={c.title}>{c.title}</div>
          <div className="text-xs text-gray-400 mt-0.5">{fmtDate(c.created_at)}{isFirst ? ' · first use' : ''}</div>
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

// AI section renderer
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

const SECTION_STYLES = {
  '✅': { border: 'border-green-200', bg: 'bg-green-50',  heading: 'text-green-800'  },
  '🔁': { border: 'border-blue-200',  bg: 'bg-blue-50',   heading: 'text-blue-800'   },
  '⚠️': { border: 'border-amber-200', bg: 'bg-amber-50',  heading: 'text-amber-800'  },
  '❌': { border: 'border-red-200',   bg: 'bg-red-50',    heading: 'text-red-800'    },
  '👤': { border: 'border-indigo-200',bg: 'bg-indigo-50', heading: 'text-indigo-800' },
};
function sectionStyle(h) {
  for (const [e, s] of Object.entries(SECTION_STYLES)) if (h.startsWith(e)) return s;
  return { border: 'border-gray-200', bg: 'bg-gray-50', heading: 'text-gray-700' };
}

export default function ListsPage() {
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]     = useState(null);
  const [showAI, setShowAI]         = useState(true);
  const [expandedList, setExpandedList] = useState(null);
  const [campaignDays, setCampaignDays] = useState(30);
  const [sortCol, setSortCol]       = useState('profit');
  const [sortDir, setSortDir]       = useState('desc');
  const [search, setSearch]         = useState('');
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const queryClient = useQueryClient();

  // AI report
  const { data: latestReport, isLoading: isLoadingAI } = useQuery({
    queryKey: ['reports', 'ai-list'],
    queryFn: () => api.getAIListReport(),
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
  const { data: history = [] } = useQuery({
    queryKey: ['reports', 'ai-list', 'history'],
    queryFn: () => api.getAIListReportHistory(20),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const effectiveId = selectedHistoryId;
  const { data: historyItem } = useQuery({
    queryKey: ['reports', 'ai-list', 'history', effectiveId],
    queryFn: () => api.getAIListReportHistoryItem(effectiveId),
    enabled: effectiveId != null,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
  const aiReport = effectiveId != null ? historyItem : latestReport;

  // Lists table
  const { data: listsData, isLoading: isLoadingLists } = useQuery({
    queryKey: ['reports', 'lists'],
    queryFn: () => api.getListsReport(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Sync freshness
  const { data: syncStatus }      = useQuery({ queryKey: ['reports','sync','status'],        queryFn: () => api.getSyncStatus(),        staleTime: 30000, refetchInterval: 30000, retry: false });
  const { data: offerSyncStatus } = useQuery({ queryKey: ['reports','sync','offers','status'], queryFn: () => api.getOfferSyncStatus(),   staleTime: 30000, refetchInterval: 30000, retry: false });

  const syncRunning  = Boolean(syncStatus?.running || offerSyncStatus?.running);
  const lastSyncAt   = [syncStatus?.completed_at, offerSyncStatus?.completed_at].filter(Boolean).map(d => new Date(d)).sort((a,b) => b-a)[0] || null;
  const reportAt     = latestReport?.generated_at ? new Date(latestReport.generated_at) : null;
  const dataIsNewer  = Boolean(lastSyncAt && reportAt && lastSyncAt > reportAt);
  const daysSince    = reportAt ? (Date.now() - reportAt.getTime()) / 86400000 : null;
  const freshness    = syncRunning ? 'syncing' : !reportAt ? 'none' : dataIsNewer ? 'stale-data' : daysSince >= 7 ? 'stale-age' : 'fresh';

  async function handleGenerate() {
    setGenerating(true); setGenError(null);
    try {
      await api.generateAIListReport();
      setSelectedHistoryId(null);
      queryClient.invalidateQueries({ queryKey: ['reports', 'ai-list'] });
    } catch (err) { setGenError(err.message || 'Failed to generate.'); }
    finally { setGenerating(false); }
  }

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  const rows = listsData?.rows || [];
  const filtered = rows.filter(r => !search || r.list_key?.toLowerCase().includes(search.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    const av = Number(a[sortCol]) || 0, bv = Number(b[sortCol]) || 0;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const aiSections = parseContent(aiReport?.content);

  const TH = ({ col, label, right }) => (
    <th onClick={() => toggleSort(col)}
      className={`px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-gray-700 ${right ? 'text-right' : 'text-left'}`}>
      {label}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
    </th>
  );

  return (
    <div className="p-8 max-w-screen-2xl space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data List Intelligence</h1>
          <p className="text-sm text-gray-500 mt-1">Click any list to see all campaigns that used it, oldest to newest</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {history.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">AI report</span>
              <select value={effectiveId ?? ''} onChange={e => setSelectedHistoryId(e.target.value ? Number(e.target.value) : null)}
                className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 bg-white max-w-[200px]">
                <option value="">Latest</option>
                {history.map((h, i) => (
                  <option key={h.id} value={h.id}>
                    {i === 0 ? 'Latest — ' : ''}{new Date(h.generated_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button onClick={handleGenerate} disabled={generating}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            {generating
              ? <><span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analyzing…</>
              : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>Generate Analysis</>
            }
          </button>
        </div>
      </div>

      {/* Freshness */}
      {freshness !== 'none' && (
        <div className={`flex items-center gap-1.5 text-xs ${freshness === 'syncing' ? 'text-blue-600' : freshness === 'stale-data' || freshness === 'stale-age' ? 'text-amber-600' : 'text-gray-400'}`}>
          <span className={`w-2 h-2 rounded-full inline-block ${freshness === 'syncing' ? 'bg-blue-500 animate-pulse' : freshness === 'stale-data' || freshness === 'stale-age' ? 'bg-amber-500' : 'bg-green-500'}`} />
          {freshness === 'syncing'    && 'Sync running — wait before generating for complete data.'}
          {freshness === 'stale-data' && 'New sync data available — regenerate for updated list analysis.'}
          {freshness === 'stale-age'  && `AI analysis is ${Math.floor(daysSince)} days old — consider regenerating.`}
          {freshness === 'fresh'      && 'AI analysis reflects the most recent synced data.'}
        </div>
      )}

      {genError && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{genError}</div>}

      {/* AI Analysis — collapsible */}
      {aiReport && (
        <div>
          <button onClick={() => setShowAI(v => !v)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 mb-3">
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${showAI ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            AI Analysis
            <span className="text-xs text-gray-400 font-normal">· {new Date(aiReport.generated_at).toLocaleString()}</span>
          </button>
          {showAI && (
            <div className="grid grid-cols-1 gap-3 mb-6">
              {aiSections.map((sec, i) => {
                const style = sectionStyle(sec.heading);
                return (
                  <div key={i} className={`rounded-lg border ${style.border} ${style.bg} px-4 py-3`}>
                    <h3 className={`font-semibold text-sm mb-1.5 ${style.heading}`}>{sec.heading}</h3>
                    <ul className="space-y-1">
                      {sec.bullets.map((b, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current flex-shrink-0 opacity-40" />{b}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Lists table */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <input type="text" placeholder="Search list…" value={search} onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded px-3 py-1.5 text-sm w-64" />
          <span className="text-xs text-gray-400">{sorted.length} lists · click to expand campaigns</span>
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-xs text-gray-500">Show last</span>
            <select value={campaignDays} onChange={e => setCampaignDays(Number(e.target.value))}
              className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 bg-white">
              {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>{d} days</option>)}
            </select>
          </div>
        </div>

        {isLoadingLists && <div className="card p-8 text-center"><div className="inline-block w-6 h-6 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>}

        {!isLoadingLists && sorted.length === 0 && (
          <div className="card p-8 text-center text-sm text-gray-400">No lists found — run a sync to populate list data.</div>
        )}

        {!isLoadingLists && sorted.length > 0 && (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="w-8" />
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">List</th>
                  <TH col="campaign_count" label="Camps"   right />
                  <TH col="clicks"         label="Clicks"  right />
                  <TH col="conversions"    label="Conv"    right />
                  <TH col="epc"            label="EPC"     right />
                  <TH col="profit"         label="Profit"  right />
                  <TH col="roi"            label="ROI"     right />
                  <TH col="days_since_last_use" label="Idle" right />
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((row) => {
                  const isOpen  = expandedList === row.list_key;
                  const profit  = Number(row.profit);
                  const roi     = Number(row.roi);
                  return [
                    <tr key={row.list_key}
                      onClick={() => setExpandedList(isOpen ? null : row.list_key)}
                      className="hover:bg-indigo-50/30 cursor-pointer transition-colors">
                      <td className="px-2 text-center text-gray-400 text-xs select-none">{isOpen ? '▾' : '▸'}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-700 max-w-xs truncate" title={row.list_key}>{row.list_key}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-500 text-xs">{fmt(row.campaign_count)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{fmt(row.clicks)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{fmt(row.conversions)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium text-gray-700">{fmtRate(row.epc)}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtMoney(profit)}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums text-xs font-medium ${roi >= 0 ? 'text-green-600' : 'text-red-500'}`}>{roi}%</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs text-gray-400">{row.days_since_last_use != null ? `${row.days_since_last_use}d` : '—'}</td>
                      <td className="px-3 py-2.5"><StatusBadge days={row.days_since_last_use} /></td>
                    </tr>,
                    isOpen && (
                      <tr key={`${row.list_key}-header`}>
                        <td colSpan={10} className="p-0">
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
                              <CampaignRows listKey={row.list_key} days={campaignDays} />
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
