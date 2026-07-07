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

export default function SyncLogsPage() {
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState(null);
  const [triggerMsg, setTriggerMsg] = useState(null);
  const queryClient = useQueryClient();

  const { data: logs = [], isLoading, refetch } = useQuery({
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

  const isRunning = Boolean(syncStatus?.running);

  // Auto-refetch logs when a sync completes
  useEffect(() => {
    if (!isRunning) refetch();
  }, [isRunning]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleBackfill() {
    const dateFrom = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
    const dateTo   = new Date().toISOString().slice(0, 10);
    setTriggering(true);
    setTriggerError(null);
    setTriggerMsg(null);
    try {
      await api.triggerSync({ date_from: dateFrom, date_to: dateTo });
      setTriggerMsg(`Backfill started for ${dateFrom} → ${dateTo}`);
      queryClient.invalidateQueries({ queryKey: ['reports', 'sync', 'status'] });
      setTimeout(() => refetch(), 2000);
    } catch (err) {
      setTriggerError(err.message || 'Failed to start sync.');
    } finally {
      setTriggering(false);
    }
  }

  async function handleSyncToday() {
    const today = new Date().toISOString().slice(0, 10);
    setTriggering(true);
    setTriggerError(null);
    setTriggerMsg(null);
    try {
      await api.triggerSync({ date_from: today, date_to: today });
      setTriggerMsg('Today\'s sync started.');
      queryClient.invalidateQueries({ queryKey: ['reports', 'sync', 'status'] });
      setTimeout(() => refetch(), 2000);
    } catch (err) {
      setTriggerError(err.message || 'Failed to start sync.');
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Import Logs</h1>
          <p className="text-sm text-gray-500 mt-1">History of data syncs from RedTrack</p>
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
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {triggering ? (
              <><span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Starting…</>
            ) : (
              <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>Backfill 6 Months</>
            )}
          </button>
        </div>
      </div>

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

      {triggerMsg && !isRunning && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">{triggerMsg}</div>
      )}
      {triggerError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{triggerError}</div>
      )}

      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            <col style={{ width: '80px' }} />
            <col style={{ width: '200px' }} />
            <col style={{ width: '160px' }} />
            <col style={{ width: '160px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '100px' }} />
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
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-400">Loading…</td>
              </tr>
            )}
            {!isLoading && logs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center">
                  <p className="text-sm font-medium text-gray-600">No sync history yet</p>
                  <p className="text-xs text-gray-400 mt-1">Run a sync to start building the log.</p>
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">{log.id}</td>
                <td className="px-3 py-2.5 text-xs text-gray-700 font-mono">
                  {log.date_from} → {log.date_to}
                </td>
                <td className="px-3 py-2.5 text-xs text-gray-600">{fmtDate(log.started_at)}</td>
                <td className="px-3 py-2.5 text-xs text-gray-600">{fmtDate(log.completed_at)}</td>
                <td className="px-3 py-2.5 text-xs text-gray-600 text-right font-mono">
                  {fmtDuration(log.started_at, log.completed_at)}
                </td>
                <td className="px-3 py-2.5 text-xs text-gray-700 text-right font-mono">
                  {log.campaigns_processed ?? '—'}
                </td>
                <td className="px-3 py-2.5"><StatusBadge status={log.status} /></td>
                <td className="px-3 py-2.5 text-xs text-red-600 line-clamp-2">{log.error || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
