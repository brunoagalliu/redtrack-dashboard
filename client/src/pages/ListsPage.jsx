import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

function fmtMoney(n) {
  const v = Number(n || 0);
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtRate(n)  { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }); }
function fmt(n)      { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

// Render markdown-style sections from Claude's output
function parseContent(text) {
  if (!text) return [];
  const lines = text.split('\n');
  const sections = [];
  let current = null;
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      if (current) sections.push(current);
      current = { heading: h2[1].trim(), bullets: [] };
    } else if (current && line.trim().startsWith('-')) {
      current.bullets.push(line.replace(/^[-*]\s*/, '').trim());
    } else if (current && line.trim() && !line.startsWith('#')) {
      current.bullets.push(line.trim());
    }
  }
  if (current) sections.push(current);
  return sections;
}

function StatusBadge({ days }) {
  if (days === null || days === undefined) return null;
  const d = Number(days);
  if (d < 14) return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Active</span>;
  if (d < 28) return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">Cooling {d}d</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Idle {d}d</span>;
}

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <span className="text-gray-300 ml-1">↕</span>;
  return <span className="text-blue-500 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

const SECTION_STYLES = {
  '✅': { border: 'border-green-200', bg: 'bg-green-50', heading: 'text-green-800' },
  '🔁': { border: 'border-blue-200',  bg: 'bg-blue-50',  heading: 'text-blue-800'  },
  '⚠️': { border: 'border-amber-200', bg: 'bg-amber-50', heading: 'text-amber-800' },
  '❌': { border: 'border-red-200',   bg: 'bg-red-50',   heading: 'text-red-800'   },
  '👤': { border: 'border-indigo-200',bg: 'bg-indigo-50',heading: 'text-indigo-800'},
};
function sectionStyle(heading) {
  for (const [emoji, style] of Object.entries(SECTION_STYLES)) {
    if (heading.startsWith(emoji)) return style;
  }
  return { border: 'border-gray-200', bg: 'bg-gray-50', heading: 'text-gray-700' };
}

export default function ListsPage() {
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]     = useState(null);
  const [showRaw, setShowRaw]       = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [sortCol, setSortCol]       = useState('profit');
  const [sortDir, setSortDir]       = useState('desc');
  const [search, setSearch]         = useState('');
  const queryClient = useQueryClient();

  // Latest AI list report
  const { data: latestReport, isLoading: isLoadingLatest } = useQuery({
    queryKey: ['reports', 'ai-list'],
    queryFn: () => api.getAIListReport(),
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  // History list
  const { data: history = [] } = useQuery({
    queryKey: ['reports', 'ai-list', 'history'],
    queryFn: () => api.getAIListReportHistory(20),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Selected past report
  const effectiveId = selectedHistoryId ?? null;
  const { data: historyItem, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['reports', 'ai-list', 'history', effectiveId],
    queryFn: () => api.getAIListReportHistoryItem(effectiveId),
    enabled: effectiveId != null,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  // Raw list data
  const { data: rawData } = useQuery({
    queryKey: ['reports', 'lists'],
    queryFn: () => api.getListsReport(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Sync freshness
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

  const report = effectiveId != null ? historyItem : latestReport;
  const isLoading = effectiveId != null ? isLoadingHistory : isLoadingLatest;
  const viewingHistory = effectiveId != null;

  const syncRunning = Boolean(syncStatus?.running || offerSyncStatus?.running);
  const lastSyncAt = [syncStatus?.completed_at, offerSyncStatus?.completed_at]
    .filter(Boolean).map(d => new Date(d)).sort((a,b) => b-a)[0] || null;
  const reportAt = latestReport?.generated_at ? new Date(latestReport.generated_at) : null;
  const dataIsNewer = Boolean(lastSyncAt && reportAt && lastSyncAt > reportAt);
  const daysSince = reportAt ? (Date.now() - reportAt.getTime()) / 86400000 : null;
  const freshness = syncRunning ? 'syncing' : !reportAt ? 'none'
    : dataIsNewer ? 'stale-data'
    : daysSince >= 7 ? 'stale-age'
    : 'fresh';

  async function handleGenerate() {
    setGenerating(true);
    setGenError(null);
    try {
      await api.generateAIListReport();
      setSelectedHistoryId(null);
      queryClient.invalidateQueries({ queryKey: ['reports', 'ai-list'] });
    } catch (err) {
      setGenError(err.message || 'Failed to generate analysis.');
    } finally {
      setGenerating(false);
    }
  }

  const sections = parseContent(report?.content);
  const lists = report?.data_json?.lists || [];

  // Raw table
  const rawRows = rawData?.rows || [];
  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }
  const filteredRaw = rawRows.filter(r => !search || r.list_key?.toLowerCase().includes(search.toLowerCase()));
  const sortedRaw = [...filteredRaw].sort((a,b) => {
    const av = Number(a[sortCol]) || 0, bv = Number(b[sortCol]) || 0;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  return (
    <div className="p-8 max-w-7xl space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data List Intelligence</h1>
          <p className="text-sm text-gray-500 mt-1">AI-driven analysis of which lists to reuse, rest, or retire</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {history.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Viewing</span>
              <select value={effectiveId ?? ''} onChange={e => setSelectedHistoryId(e.target.value ? Number(e.target.value) : null)}
                className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 bg-white max-w-[220px]">
                <option value="">Latest</option>
                {history.map((h, i) => (
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
              <><span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analyzing…</>
            ) : (
              <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>Generate Analysis</>
            )}
          </button>
        </div>
      </div>

      {/* Freshness */}
      {freshness !== 'none' && (
        <div className={`flex items-center gap-1.5 text-xs ${
          freshness === 'syncing' ? 'text-blue-600'
          : freshness === 'stale-data' || freshness === 'stale-age' ? 'text-amber-600'
          : 'text-gray-400'}`}>
          <span className={`inline-block w-2 h-2 rounded-full ${
            freshness === 'syncing' ? 'bg-blue-500 animate-pulse'
            : freshness === 'stale-data' || freshness === 'stale-age' ? 'bg-amber-500'
            : 'bg-green-500'}`} />
          {freshness === 'syncing' && 'Sync in progress — wait before generating for complete data.'}
          {freshness === 'stale-data' && 'New sync data available — regenerate for the latest list analysis.'}
          {freshness === 'stale-age' && `Analysis is ${Math.floor(daysSince)} days old — consider regenerating.`}
          {freshness === 'fresh' && 'Analysis reflects the most recent synced data.'}
        </div>
      )}

      {genError && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{genError}</div>}

      {viewingHistory && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-2 text-xs text-amber-700 flex items-center justify-between">
          <span>Viewing a past analysis — not the latest.</span>
          <button onClick={() => setSelectedHistoryId(null)} className="font-medium underline hover:no-underline">Back to latest</button>
        </div>
      )}

      {isLoading && <div className="card p-10 text-center"><div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>}

      {!isLoading && !report && !generating && (
        <div className="card p-10 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-indigo-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700 mb-1">No list analysis yet</p>
          <p className="text-xs text-gray-400">Run a sync first so list data is populated, then click Generate Analysis.</p>
        </div>
      )}

      {generating && (
        <div className="card p-10 text-center">
          <div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4" />
          <p className="text-sm font-medium text-gray-700">Analyzing list performance…</p>
          <p className="text-xs text-gray-400 mt-1">Reviewing reuse candidates, trends, and per-buyer queues.</p>
        </div>
      )}

      {report && !generating && (
        <>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span>Generated: {new Date(report.generated_at).toLocaleString()}</span>
            <span>·</span>
            <span>{lists.length} lists analyzed</span>
          </div>

          {/* AI sections */}
          <div className="grid grid-cols-1 gap-4">
            {sections.map((sec, i) => {
              const style = sectionStyle(sec.heading);
              return (
                <div key={i} className={`rounded-lg border ${style.border} ${style.bg} p-4`}>
                  <h3 className={`font-semibold text-sm mb-2 ${style.heading}`}>{sec.heading}</h3>
                  <ul className="space-y-1.5">
                    {sec.bullets.map((b, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="mt-1 w-1.5 h-1.5 rounded-full bg-current flex-shrink-0 opacity-50" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* Raw data toggle */}
          <div>
            <button onClick={() => setShowRaw(v => !v)}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 underline hover:no-underline">
              {showRaw ? 'Hide' : 'Show'} raw list data used in analysis ({rawRows.length} lists)
            </button>

            {showRaw && (
              <div className="mt-4 space-y-3">
                <input type="text" placeholder="Search list name…" value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="border border-gray-200 rounded px-3 py-1.5 text-sm w-72" />
                <div className="card overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {[
                          { key: 'list_key', label: 'List', numeric: false },
                          { key: 'campaign_count', label: 'Camps', numeric: true },
                          { key: 'clicks', label: 'Clicks', numeric: true },
                          { key: 'conversions', label: 'Conv', numeric: true },
                          { key: 'epc', label: 'EPC', numeric: true },
                          { key: 'epc_recent', label: 'EPC 30d', numeric: true },
                          { key: 'profit', label: 'Profit', numeric: true },
                          { key: 'roi', label: 'ROI', numeric: true },
                          { key: 'days_since_last_use', label: 'Idle', numeric: true },
                          { key: 'status', label: 'Status', numeric: false },
                        ].map(c => (
                          <th key={c.key}
                            onClick={() => c.numeric && toggleSort(c.key)}
                            className={`px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap ${c.numeric ? 'cursor-pointer hover:text-gray-700 text-right' : ''}`}>
                            {c.label}{c.numeric && <SortIcon col={c.key} sortCol={sortCol} sortDir={sortDir} />}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {sortedRaw.map((row, i) => {
                        const profit = Number(row.profit);
                        return (
                          <tr key={i} className="hover:bg-gray-50/60">
                            <td className="px-3 py-2 font-mono text-gray-700 max-w-xs truncate" title={row.list_key}>{row.list_key}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmt(row.campaign_count)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmt(row.clicks)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmt(row.conversions)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtRate(row.epc)}</td>
                            <td className={`px-3 py-2 text-right tabular-nums font-medium ${Number(row.epc_recent) >= Number(row.epc) ? 'text-green-700' : 'text-amber-600'}`}>
                              {Number(row.epc_recent) > 0 ? fmtRate(row.epc_recent) : '—'}
                            </td>
                            <td className={`px-3 py-2 text-right tabular-nums font-medium ${profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtMoney(profit)}</td>
                            <td className={`px-3 py-2 text-right tabular-nums ${Number(row.roi) >= 0 ? 'text-green-600' : 'text-red-500'}`}>{row.roi}%</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-500">{row.days_since_last_use != null ? `${row.days_since_last_use}d` : '—'}</td>
                            <td className="px-3 py-2"><StatusBadge days={row.days_since_last_use} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
