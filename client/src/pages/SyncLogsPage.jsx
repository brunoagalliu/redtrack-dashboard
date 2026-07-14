import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtDuration(startedAt, completedAt) {
  if (!startedAt || !completedAt) return '—';
  const secs = Math.round((new Date(completedAt) - new Date(startedAt)) / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}m ${s}s`;
}

function StatusBadge({ status }) {
  const map = {
    complete:    'bg-green-100 text-green-800',
    running:     'bg-blue-100 text-blue-800 animate-pulse',
    error:       'bg-red-100 text-red-800',
    interrupted: 'bg-amber-100 text-amber-800',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold text-gray-800">{title}</h2>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

export default function SyncLogsPage() {
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState(null);
  const [triggerMsg, setTriggerMsg] = useState(null);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiGenStartedAt, setAiGenStartedAt] = useState(null);
  const queryClient = useQueryClient();

  const { data: logs = [], isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['sync', 'logs'],
    queryFn: () => api.getSyncLogs(50),
    staleTime: 15000,
    refetchInterval: 15000,
  });

  const { data: syncStatus } = useQuery({
    queryKey: ['reports', 'sync', 'status'],
    queryFn: () => api.getSyncStatus(),
    staleTime: 3000,
    refetchInterval: 3000,
  });

  const { data: aiCampaignHistory = [], isLoading: aiCampLoading, refetch: refetchAICamp } = useQuery({
    queryKey: ['reports', 'ai-recommendations', 'history'],
    queryFn: () => api.getAIReportHistory(30),
    staleTime: 60000,
    refetchInterval: 60000,
  });

  const { data: aiListHistory = [], isLoading: aiListLoading, refetch: refetchAIList } = useQuery({
    queryKey: ['reports', 'ai-list', 'history'],
    queryFn: () => api.getAIListReportHistory(30),
    staleTime: 60000,
    refetchInterval: 60000,
  });

  const { data: aiCampStatus } = useQuery({
    queryKey: ['reports', 'ai-recommendations', 'status'],
    queryFn: () => api.getAICampaignStatus(),
    staleTime: 5000,
    refetchInterval: 5000,
  });

  const { data: aiListStatus } = useQuery({
    queryKey: ['reports', 'ai-list', 'status'],
    queryFn: () => api.getAIListStatus(),
    staleTime: 5000,
    refetchInterval: 5000,
  });

  const isRunning = Boolean(syncStatus?.running);
  const aiCampRunning = Boolean(aiCampStatus?.running);
  const aiListRunning = Boolean(aiListStatus?.running);

  useEffect(() => {
    if (!isRunning) refetchLogs();
  }, [isRunning]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!aiCampRunning) refetchAICamp();
  }, [aiCampRunning]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!aiListRunning) refetchAIList();
  }, [aiListRunning]); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge and sort AI history — campaign + lists combined, newest first
  const aiHistory = [
    ...aiCampaignHistory.map(r => ({ ...r, type: 'Campaign' })),
    ...aiListHistory.map(r => ({ ...r, type: 'Lists', period_days: null })),
  ].sort((a, b) => new Date(b.generated_at) - new Date(a.generated_at));

  async function triggerWithDates(dateFrom, dateTo, label) {
    setTriggering(true);
    setTriggerError(null);
    setTriggerMsg(null);
    try {
      const result = await api.triggerSync({ date_from: dateFrom, date_to: dateTo });
      if (result?.status === 'already_running') {
        setTriggerError('A sync is already running — wait for it to finish, then try again.');
      } else {
        setTriggerMsg(`${label} started for ${dateFrom} → ${dateTo}`);
        queryClient.invalidateQueries({ queryKey: ['reports', 'sync', 'status'] });
        setTimeout(() => refetchLogs(), 2000);
      }
    } catch (err) {
      setTriggerError(err.message || 'Failed to start sync.');
    } finally {
      setTriggering(false);
    }
  }

  function handleBackfill() {
    const dateFrom = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
    const dateTo   = new Date().toISOString().slice(0, 10);
    return triggerWithDates(dateFrom, dateTo, 'Backfill');
  }

  function handleSyncToday() {
    const today = new Date().toISOString().slice(0, 10);
    return triggerWithDates(today, today, 'Sync');
  }

  async function handleGenerateAI() {
    setGeneratingAI(true);
    setAiGenStartedAt(new Date());
    setTriggerError(null);
    try {
      await Promise.all([api.generateAIReport(14), api.generateAIListReport()]);
    } catch (err) {
      setTriggerError(err.message || 'Failed to start AI generation.');
      setGeneratingAI(false);
      setAiGenStartedAt(null);
    }
  }

  // Stop generatingAI spinner when both jobs finish
  useEffect(() => {
    if (!generatingAI || !aiGenStartedAt) return;
    const campDone = aiCampStatus && !aiCampStatus.running && new Date(aiCampStatus.startedAt) >= aiGenStartedAt;
    const listDone = aiListStatus && !aiListStatus.running && new Date(aiListStatus.startedAt) >= aiGenStartedAt;
    if (campDone && listDone) {
      setGeneratingAI(false);
      setAiGenStartedAt(null);
      queryClient.invalidateQueries({ queryKey: ['reports', 'ai-recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['reports', 'ai-list'] });
    }
  }, [aiCampStatus, aiListStatus, generatingAI, aiGenStartedAt, queryClient]);

  return (
    <div className="p-8 space-y-8">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Import Logs</h1>
          <p className="text-sm text-gray-500 mt-1">Data sync and AI generation history</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleSyncToday}
            disabled={triggering || isRunning}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Sync Today
          </button>
          <button
            onClick={handleBackfill}
            disabled={triggering || isRunning}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            {triggering ? (
              <><span className="inline-block w-3.5 h-3.5 border-2 border-gray-400/30 border-t-gray-600 rounded-full animate-spin" />Starting…</>
            ) : (
              <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>Backfill 6 Months</>
            )}
          </button>
          <button
            onClick={handleGenerateAI}
            disabled={generatingAI || aiCampRunning || aiListRunning || isRunning}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {(generatingAI || aiCampRunning || aiListRunning) ? (
              <><span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analyzing…</>
            ) : (
              <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>Generate AI</>
            )}
          </button>
        </div>
      </div>

      {/* ── Sync running banner ── */}
      {isRunning && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse inline-block" />
            <span className="text-sm font-medium text-blue-800">
              Sync running — phase: {syncStatus?.phase || '…'}
            </span>
            {syncStatus?.total > 0 && (
              <span className="text-sm text-blue-600 ml-1">
                ({syncStatus.processed} / {syncStatus.total} campaigns)
              </span>
            )}
          </div>
          <div className="mt-2 h-1.5 w-full bg-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-500 rounded-full"
              style={{ width: syncStatus?.total > 0 ? `${Math.round((syncStatus.processed / syncStatus.total) * 100)}%` : '5%' }}
            />
          </div>
        </div>
      )}

      {/* ── AI running banner ── */}
      {(aiCampRunning || aiListRunning) && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse inline-block" />
          <span className="text-sm font-medium text-purple-800">
            AI generating —
            {aiCampRunning && ` Campaign report (period: ${aiCampStatus?.currentPeriod}d, ${(aiCampStatus?.completedPeriods || []).length}/${5} done)`}
            {aiListRunning && ' Lists report'}
          </span>
        </div>
      )}

      {triggerMsg && !isRunning && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">{triggerMsg}</div>
      )}
      {triggerError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{triggerError}</div>
      )}

      {/* ── Data Syncs ── */}
      <div>
        <SectionHeader title="Data Syncs" subtitle="RedTrack campaign & offer data imports" />
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm" style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              <col style={{ width: '50px' }} />
              <col style={{ width: '190px' }} />
              <col style={{ width: '150px' }} />
              <col style={{ width: '150px' }} />
              <col style={{ width: '75px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '95px' }} />
              <col />
            </colgroup>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date Range</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Started</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Completed</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Duration</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Campaigns</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logsLoading && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-400">Loading…</td></tr>
              )}
              {!logsLoading && logs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center">
                    <p className="text-sm font-medium text-gray-600">No sync history yet</p>
                    <p className="text-xs text-gray-400 mt-1">Run a sync to start building the log.</p>
                  </td>
                </tr>
              )}
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">{log.id}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-700 font-mono">{log.date_from} → {log.date_to}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600">{fmtDate(log.started_at)}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600">{fmtDate(log.completed_at)}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 text-right font-mono">{fmtDuration(log.started_at, log.completed_at)}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-700 text-right font-mono">{log.campaigns_processed ?? '—'}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={log.status} /></td>
                  <td className="px-3 py-2.5 text-xs text-red-600 line-clamp-2">{log.error || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── AI Generations ── */}
      <div>
        <SectionHeader title="AI Generations" subtitle="Campaign and Lists AI report history" />
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm" style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              <col style={{ width: '50px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '180px' }} />
              <col />
            </colgroup>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Generated</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Period</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(aiCampLoading || aiListLoading) && (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-400">Loading…</td></tr>
              )}
              {!aiCampLoading && !aiListLoading && aiHistory.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center">
                    <p className="text-sm font-medium text-gray-600">No AI reports generated yet</p>
                    <p className="text-xs text-gray-400 mt-1">Generate a report from the AI pages.</p>
                  </td>
                </tr>
              )}
              {aiHistory.map((row, i) => (
                <tr key={`${row.type}-${row.id}`} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      row.type === 'Campaign' ? 'bg-indigo-100 text-indigo-800' : 'bg-teal-100 text-teal-800'
                    }`}>
                      {row.type}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-600">{fmtDate(row.generated_at)}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">
                    {row.period_days ? `Last ${row.period_days} days` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
