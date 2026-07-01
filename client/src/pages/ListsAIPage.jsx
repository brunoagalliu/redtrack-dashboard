import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

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

export default function ListsAIPage() {
  const [generating, setGenerating]   = useState(false);
  const [genError, setGenError]       = useState(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const queryClient = useQueryClient();

  const { data: latestReport, isLoading } = useQuery({
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

  const { data: historyItem } = useQuery({
    queryKey: ['reports', 'ai-list', 'history', selectedHistoryId],
    queryFn: () => api.getAIListReportHistoryItem(selectedHistoryId),
    enabled: selectedHistoryId != null,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  const { data: syncStatus }      = useQuery({ queryKey: ['reports','sync','status'],         queryFn: () => api.getSyncStatus(),      staleTime: 30000, refetchInterval: 30000, retry: false });
  const { data: offerSyncStatus } = useQuery({ queryKey: ['reports','sync','offers','status'], queryFn: () => api.getOfferSyncStatus(), staleTime: 30000, refetchInterval: 30000, retry: false });

  const report      = selectedHistoryId != null ? historyItem : latestReport;
  const syncRunning = Boolean(syncStatus?.running || offerSyncStatus?.running);
  const lastSyncAt  = [syncStatus?.completed_at, offerSyncStatus?.completed_at].filter(Boolean).map(d => new Date(d)).sort((a,b) => b-a)[0] || null;
  const reportAt    = latestReport?.generated_at ? new Date(latestReport.generated_at) : null;
  const dataIsNewer = Boolean(lastSyncAt && reportAt && lastSyncAt > reportAt);
  const daysSince   = reportAt ? (Date.now() - reportAt.getTime()) / 86400000 : null;
  const freshness   = syncRunning ? 'syncing' : !reportAt ? 'none' : dataIsNewer ? 'stale-data' : daysSince >= 7 ? 'stale-age' : 'fresh';

  async function handleGenerate() {
    setGenerating(true); setGenError(null);
    try {
      await api.generateAIListReport();
      setSelectedHistoryId(null);
      queryClient.invalidateQueries({ queryKey: ['reports', 'ai-list'] });
    } catch (err) { setGenError(err.message || 'Failed to generate.'); }
    finally { setGenerating(false); }
  }

  const sections = parseContent(report?.content);

  return (
    <div className="p-8 max-w-7xl space-y-6">

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lists — AI Analysis</h1>
          <p className="text-sm text-gray-500 mt-1">Which lists to reuse, rest, or retire</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {history.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Viewing</span>
              <select value={selectedHistoryId ?? ''} onChange={e => setSelectedHistoryId(e.target.value ? Number(e.target.value) : null)}
                className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 bg-white max-w-[210px]">
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

      {freshness !== 'none' && (
        <div className={`flex items-center gap-1.5 text-xs ${freshness === 'syncing' ? 'text-blue-600' : freshness === 'stale-data' || freshness === 'stale-age' ? 'text-amber-600' : 'text-gray-400'}`}>
          <span className={`w-2 h-2 rounded-full inline-block ${freshness === 'syncing' ? 'bg-blue-500 animate-pulse' : freshness === 'stale-data' || freshness === 'stale-age' ? 'bg-amber-500' : 'bg-green-500'}`} />
          {freshness === 'syncing'    && 'Sync running — wait before generating for complete data.'}
          {freshness === 'stale-data' && 'New sync data available — regenerate for updated analysis.'}
          {freshness === 'stale-age'  && `Analysis is ${Math.floor(daysSince)} days old — consider regenerating.`}
          {freshness === 'fresh'      && 'Analysis reflects the most recent synced data.'}
        </div>
      )}

      {genError && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{genError}</div>}

      {selectedHistoryId != null && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-2 text-xs text-amber-700 flex items-center justify-between">
          <span>Viewing a past analysis — not the latest.</span>
          <button onClick={() => setSelectedHistoryId(null)} className="font-medium underline hover:no-underline">Back to latest</button>
        </div>
      )}

      {isLoading && <div className="card p-10 text-center"><div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>}

      {!isLoading && !report && !generating && (
        <div className="card p-10 text-center">
          <p className="text-sm font-medium text-gray-700 mb-1">No list analysis yet</p>
          <p className="text-xs text-gray-400">Click Generate Analysis to create your first report.</p>
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
          <div className="text-xs text-gray-400">
            Generated: {new Date(report.generated_at).toLocaleString()} · {(report.data_json?.lists || []).length} lists analyzed
          </div>
          <div className="grid grid-cols-1 gap-3">
            {sections.map((sec, i) => {
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
        </>
      )}
    </div>
  );
}
