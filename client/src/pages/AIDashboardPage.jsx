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

// Sections that start with a buyer emoji are buyer-specific
const BUYER_EMOJI = '👤';
function isBuyerSection(heading) { return heading.startsWith(BUYER_EMOJI); }
function buyerOf(heading) { return heading.replace(/^👤\s*/, '').split(/[\s—–-]/)[0].trim(); }

const SECTION_STYLES = {
  '✅': { border: 'border-green-200',  bg: 'bg-green-50',  heading: 'text-green-800',  dot: 'bg-green-500'  },
  '🔁': { border: 'border-blue-200',   bg: 'bg-blue-50',   heading: 'text-blue-800',   dot: 'bg-blue-500'   },
  '⚠️': { border: 'border-amber-200',  bg: 'bg-amber-50',  heading: 'text-amber-800',  dot: 'bg-amber-500'  },
  '❌': { border: 'border-red-200',    bg: 'bg-red-50',    heading: 'text-red-800',    dot: 'bg-red-500'    },
  '💰': { border: 'border-green-200',  bg: 'bg-green-50',  heading: 'text-green-800',  dot: 'bg-green-500'  },
  '🔴': { border: 'border-red-200',    bg: 'bg-red-50',    heading: 'text-red-800',    dot: 'bg-red-500'    },
  '🧪': { border: 'border-purple-200', bg: 'bg-purple-50', heading: 'text-purple-800', dot: 'bg-purple-500' },
  '👤': { border: 'border-indigo-200', bg: 'bg-indigo-50', heading: 'text-indigo-800', dot: 'bg-indigo-500' },
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

function GenerateBtn({ label, generating, onClick }) {
  return (
    <button onClick={onClick} disabled={generating}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
      {generating
        ? <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
      }
      {generating ? 'Analyzing…' : label}
    </button>
  );
}

const BUYERS = ['TK', 'MA', 'DS'];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AIDashboardPage() {
  const [buyer, setBuyer]                   = useState('Overview');
  const [genCampaign, setGenCampaign]       = useState(false);
  const [genList, setGenList]               = useState(false);
  const [days, setDays]                     = useState(14);
  const [campaignErr, setCampaignErr]       = useState(null);
  const [listErr, setListErr]               = useState(null);
  const queryClient = useQueryClient();

  // Campaign AI report
  const { data: campaignReport, isLoading: loadingCampaign } = useQuery({
    queryKey: ['reports', 'ai-recommendations'],
    queryFn: () => api.getAIReport(),
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  // List AI report
  const { data: listReport, isLoading: loadingList } = useQuery({
    queryKey: ['reports', 'ai-list'],
    queryFn: () => api.getAIListReport(),
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  // Sync freshness
  const { data: syncStatus }      = useQuery({ queryKey: ['reports','sync','status'],         queryFn: () => api.getSyncStatus(),      staleTime: 30000, refetchInterval: 30000, retry: false });
  const { data: offerSyncStatus } = useQuery({ queryKey: ['reports','sync','offers','status'], queryFn: () => api.getOfferSyncStatus(), staleTime: 30000, refetchInterval: 30000, retry: false });
  const syncRunning = Boolean(syncStatus?.running || offerSyncStatus?.running);

  async function handleGenCampaign() {
    setGenCampaign(true); setCampaignErr(null);
    try {
      await api.generateAIReport(days);
      queryClient.invalidateQueries({ queryKey: ['reports', 'ai-recommendations'] });
    } catch (e) { setCampaignErr(e.message); }
    finally { setGenCampaign(false); }
  }

  async function handleGenList() {
    setGenList(true); setListErr(null);
    try {
      await api.generateAIListReport();
      queryClient.invalidateQueries({ queryKey: ['reports', 'ai-list'] });
    } catch (e) { setListErr(e.message); }
    finally { setGenList(false); }
  }

  // Parse both reports into sections
  const campaignSections = parseContent(campaignReport?.content);
  const listSections     = parseContent(listReport?.content);

  const campaignGeneral = campaignSections.filter(s => !isBuyerSection(s.heading));
  const listGeneral     = listSections.filter(s => !isBuyerSection(s.heading));

  const campaignBuyer = (b) => campaignSections.find(s => isBuyerSection(s.heading) && buyerOf(s.heading) === b);
  const listBuyer     = (b) => listSections.find(s => isBuyerSection(s.heading) && buyerOf(s.heading) === b);

  const isLoading   = loadingCampaign || loadingList;
  const hasAnything = campaignReport || listReport;

  return (
    <div className="p-8 max-w-7xl space-y-6">

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
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Campaign window</span>
            <select value={days} onChange={e => setDays(Number(e.target.value))}
              className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 bg-white">
              {[7, 14, 30].map(d => <option key={d} value={d}>{d} days</option>)}
            </select>
          </div>
          <GenerateBtn label="Campaign Report" generating={genCampaign} onClick={handleGenCampaign} />
          <GenerateBtn label="List Analysis"   generating={genList}     onClick={handleGenList}     />
        </div>
      </div>

      {/* Errors */}
      {campaignErr && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{campaignErr}</div>}
      {listErr     && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{listErr}</div>}

      {/* Buyer picker */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">Viewing</span>
        <div className="flex gap-1">
          {['Overview', ...BUYERS].map(b => (
            <button key={b} onClick={() => setBuyer(b)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                buyer === b
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {b === 'Overview' ? '🌐 Overview' : b}
            </button>
          ))}
        </div>
        {campaignReport && (
          <span className="text-xs text-gray-400 ml-auto">
            Campaign: {new Date(campaignReport.generated_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            {listReport && ` · Lists: ${new Date(listReport.generated_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
          </span>
        )}
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

      {/* Generating spinner */}
      {(genCampaign || genList) && (
        <div className="card p-8 text-center">
          <div className="inline-block w-6 h-6 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3" />
          <p className="text-sm text-gray-600">{genCampaign && genList ? 'Running both analyses…' : genCampaign ? 'Analyzing campaign data…' : 'Analyzing list performance…'}</p>
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
          {!campaignReport && (
            <div className="card p-6 text-center text-sm text-gray-400">No campaign report yet — click Campaign Report to generate.</div>
          )}
          {listGeneral.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">List Intelligence</h2>
              {listGeneral.map((sec, i) => <Section key={i} sec={sec} />)}
            </div>
          )}
          {!listReport && (
            <div className="card p-6 text-center text-sm text-gray-400">No list analysis yet — click List Analysis to generate.</div>
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
                {cb ? (
                  <div className="space-y-2">
                    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Campaign Actions</h2>
                    <Section sec={cb} />
                  </div>
                ) : campaignReport ? (
                  <div className="card p-4 text-sm text-gray-400">No campaign section for {buyer}.</div>
                ) : (
                  <div className="card p-4 text-sm text-gray-400">No campaign report yet.</div>
                )}
                {lb ? (
                  <div className="space-y-2">
                    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">List Queue</h2>
                    <Section sec={lb} />
                  </div>
                ) : listReport ? (
                  <div className="card p-4 text-sm text-gray-400">No list queue for {buyer}.</div>
                ) : (
                  <div className="card p-4 text-sm text-gray-400">No list analysis yet.</div>
                )}
              </>
            );
          })()}
        </div>
      )}

    </div>
  );
}
