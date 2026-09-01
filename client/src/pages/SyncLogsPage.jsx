import { useState, useEffect, useRef } from 'react';
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
    stopped:     'bg-gray-100 text-gray-600',
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

function CampaignDebugPanel() {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [campaignId, setCampaignId] = useState('');
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo]     = useState(today);
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);

  const [batchTesting, setBatchTesting] = useState(false);
  const [batchResult, setBatchResult]   = useState(null);

  async function handleBatchTest() {
    setBatchTesting(true); setBatchResult(null); setError(null);
    try {
      const data = await api.debugBatchTest(dateFrom, dateTo);
      setBatchResult(data);
    } catch (err) { setError(err.message); }
    finally { setBatchTesting(false); }
  }

  async function handleCheck() {
    if (!campaignId.trim()) return;
    setChecking(true); setResult(null); setError(null);
    try {
      const data = await api.debugCampaign(campaignId.trim(), dateFrom, dateTo);
      setResult({ type: 'debug', data });
    } catch (err) { setError(err.message); }
    finally { setChecking(false); }
  }

  async function handleForceSync() {
    if (!campaignId.trim()) return;
    setSyncing(true); setResult(null); setError(null);
    try {
      const data = await api.forceSyncCampaign(campaignId.trim(), dateFrom, dateTo);
      setResult({ type: 'sync', data });
    } catch (err) { setError(err.message); }
    finally { setSyncing(false); }
  }

  return (
    <div>
      <SectionHeader title="Campaign Debug" subtitle="Check and force-sync a specific campaign by ID" />
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Campaign ID</label>
            <input
              type="text"
              value={campaignId}
              onChange={e => setCampaignId(e.target.value)}
              placeholder="e.g. 6a85f3cd706cfa38ad3bda4f"
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <button
            onClick={handleCheck}
            disabled={checking || syncing || !campaignId.trim()}
            className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            {checking ? 'Checking…' : 'Check'}
          </button>
          <button
            onClick={handleForceSync}
            disabled={checking || syncing || !campaignId.trim()}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
          >
            {syncing ? 'Syncing…' : 'Force Sync'}
          </button>
          <button
            onClick={handleBatchTest}
            disabled={batchTesting}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {batchTesting ? 'Testing…' : 'Test Batch API'}
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>
        )}

        {result?.type === 'debug' && (
          <div className="text-xs space-y-1.5">
            <div className="flex gap-3 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full font-medium ${result.data.campaign_in_redtrack === 'NOT FOUND in /campaigns/v2' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                RedTrack: {typeof result.data.campaign_in_redtrack === 'string' ? result.data.campaign_in_redtrack : `Found — "${result.data.campaign_in_redtrack.title}"`}
              </span>
              <span className={`px-2 py-0.5 rounded-full font-medium ${result.data.campaign_in_db === 'NOT IN DB' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                Our DB: {result.data.campaign_in_db === 'NOT IN DB' ? 'NOT IN DB' : `Found (buyer: ${result.data.campaign_in_db.buyer})`}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
                Stats rows: {result.data.db_stats_total}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                API rows for range: {result.data.api_row_count} (fields: {result.data.api_fields.join(', ')})
              </span>
            </div>
            {result.data.db_stats_recent.length > 0 && (
              <div className="font-mono bg-white border border-gray-200 rounded p-2 overflow-x-auto">
                <span className="text-gray-400">Recent stats in DB: </span>
                {result.data.db_stats_recent.map(s => `${s.stat_date} clicks=${s.clicks} conv=${s.conversions} rev=${s.revenue}`).join(' | ')}
              </div>
            )}
          </div>
        )}

        {batchResult && (
          <div className="text-xs space-y-1.5">
            <div className="flex gap-3 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full font-medium ${batchResult.has_campaign_id && batchResult.has_date ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                Batch works: {batchResult.has_campaign_id && batchResult.has_date ? 'YES — campaign_id + date both present' : 'NO — missing fields'}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                {batchResult.campaigns_tested} campaigns × {batchResult.date_range} → {batchResult.row_count} rows
              </span>
            </div>
            <div className="font-mono bg-white border border-gray-200 rounded p-2 overflow-x-auto text-gray-600 text-xs">
              <div className="text-gray-400 mb-1">Fields: {batchResult.fields?.join(', ')}</div>
              {batchResult.sample?.slice(0, 5).map((r, i) => <div key={i}>{JSON.stringify(r)}</div>)}
            </div>
          </div>
        )}

        {result?.type === 'sync' && (
          <div className="text-xs space-y-1">
            <div className="flex gap-3 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full font-medium ${result.data.stored > 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                Stored: {result.data.stored} rows
              </span>
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                API total: {result.data.total_rows}
              </span>
              {result.data.skipped_no_date > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  Skipped (no date field): {result.data.skipped_no_date}
                </span>
              )}
              {result.data.skipped_zero > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                  Skipped (zero metrics): {result.data.skipped_zero}
                </span>
              )}
            </div>
            {result.data.sample.length > 0 && (
              <div className="font-mono bg-white border border-gray-200 rounded p-2 overflow-x-auto text-gray-600">
                {result.data.sample.map((r, i) => <div key={i}>{JSON.stringify(r)}</div>)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SyncLogsPage() {
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState(null);
  const [triggerMsg, setTriggerMsg] = useState(null);
  const [stopping, setStopping] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiGenStartedAt, setAiGenStartedAt] = useState(null);
  const queryClient = useQueryClient();

  const [resumingId, setResumingId] = useState(null);

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

  async function triggerWithDates(dateFrom, dateTo, label, { logId, buyer } = {}) {
    if (logId) setResumingId(logId); else setTriggering(true);
    setTriggerError(null);
    setTriggerMsg(null);
    try {
      const body = { date_from: dateFrom, date_to: dateTo };
      if (buyer) body.buyer = buyer;
      const result = await api.triggerSync(body);
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
      if (logId) setResumingId(null); else setTriggering(false);
    }
  }

  const [backfillOpen, setBackfillOpen] = useState(false);
  const backfillRef = useRef(null);

  useEffect(() => {
    if (!backfillOpen) return;
    function onClickOutside(e) {
      if (backfillRef.current && !backfillRef.current.contains(e.target)) setBackfillOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [backfillOpen]);

  function handleBackfill(days) {
    setBackfillOpen(false);
    const dateFrom = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
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
          <div className="relative" ref={backfillRef}>
            <button
              onClick={() => setBackfillOpen(o => !o)}
              disabled={triggering || isRunning}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Backfill
              <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {backfillOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-40">
                {[
                  { label: '30 days',  days: 30  },
                  { label: '3 months', days: 90  },
                  { label: '6 months', days: 180 },
                ].map(({ label, days }) => (
                  <button
                    key={days}
                    onClick={() => handleBackfill(days)}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
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
            <button
              onClick={async () => {
                setStopping(true);
                try { await api.stopSync(); } catch {}
                finally { setStopping(false); }
              }}
              disabled={stopping}
              className="ml-auto flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 transition-colors"
            >
              {stopping ? (
                <span className="inline-block w-3 h-3 border-2 border-red-300 border-t-red-700 rounded-full animate-spin" />
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              Stop
            </button>
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
              <col style={{ width: '110px' }} />
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
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logsLoading && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-sm text-gray-400">Loading…</td></tr>
              )}
              {!logsLoading && logs.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center">
                    <p className="text-sm font-medium text-gray-600">No sync history yet</p>
                    <p className="text-xs text-gray-400 mt-1">Run a sync to start building the log.</p>
                  </td>
                </tr>
              )}
              {logs.map((log) => {
                const canResume = log.status === 'interrupted' || log.status === 'error';
                const isResuming = resumingId === log.id;
                return (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">{log.id}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-700 font-mono">
                      {log.date_from} → {log.date_to}
                      {log.buyer_filter && (
                        <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded text-xs font-semibold bg-teal-100 text-teal-700">
                          {log.buyer_filter}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{fmtDate(log.started_at)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{fmtDate(log.completed_at)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 text-right font-mono">{fmtDuration(log.started_at, log.completed_at)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-700 text-right font-mono">{log.campaigns_processed ?? '—'}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={log.status} /></td>
                    <td className="px-3 py-2.5">
                      {canResume && (
                        <button
                          onClick={() => triggerWithDates(log.date_from, log.date_to, 'Resume', { logId: log.id, buyer: log.buyer_filter ? log.buyer_filter.split(',') : null })}
                          disabled={isRunning || isResuming}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {isResuming ? (
                            <span className="inline-block w-3 h-3 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin" />
                          ) : (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          )}
                          Resume
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-red-600 line-clamp-2">{log.error || ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Campaign Debug & Force Sync ── */}
      <CampaignDebugPanel />

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
