import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

const BUYER_STYLES = {
  TK: { badge: 'bg-blue-100 text-blue-700',   border: 'border-blue-200',   header: 'bg-blue-50' },
  MA: { badge: 'bg-purple-100 text-purple-700', border: 'border-purple-200', header: 'bg-purple-50' },
  DS: { badge: 'bg-orange-100 text-orange-700', border: 'border-orange-200', header: 'bg-orange-50' },
};

function boldify(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function MarkdownBlock({ content }) {
  const lines = content.split('\n');
  const elements = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.match(/^---+$/) || line.match(/^\*\*\*+$/)) {
      elements.push(<hr key={i} className="border-gray-100 my-3" />);
    } else if (line.startsWith('# ')) {
      elements.push(
        <h1 key={i} className="text-sm font-bold text-gray-900 mt-4 mb-1 first:mt-0">
          {line.replace(/^# /, '')}
        </h1>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="text-sm font-bold text-gray-900 mt-5 mb-2 first:mt-0">
          {line.replace(/^## /, '')}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="text-xs font-semibold text-gray-700 mt-3 mb-1">{line.replace(/^### /, '')}</h3>
      );
    } else if (line.startsWith('- ') || line.match(/^\d+\.\s/)) {
      const text = line.replace(/^-\s/, '').replace(/^\d+\.\s/, '');
      elements.push(
        <li key={i} className="text-xs text-gray-700 ml-3 mb-1 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: boldify(text) }} />
      );
    } else if (line.trim()) {
      elements.push(
        <p key={i} className="text-xs text-gray-700 mb-1.5 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: boldify(line) }} />
      );
    }
    i++;
  }
  return <div>{elements}</div>;
}

// Split report content into overall section + per-buyer sections.
// Handles several formats Claude may produce:
//   ## 👤 TK  |  ## TK  |  ## 👤TK  |  ### TK  |  **TK**  (as a standalone line)
function parseContent(content) {
  if (!content) return { overall: '', buyers: {} };

  // Regex: optional #+ heading prefix, optional emoji + space, then TK/MA/DS at word boundary
  const splitRe = /(?=^#{1,3} ?(?:👤 ?)?(?:TK|MA|DS)\b)/m;
  const matchRe =   /^#{1,3} ?(?:👤 ?)?(TK|MA|DS)\b/;

  let parts = content.split(splitRe);

  // Fallback: try matching **TK** style standalone bold lines
  if (parts.length === 1) {
    parts = content.split(/(?=^\*\*(?:TK|MA|DS)\*\*)/m);
  }

  const overall = parts[0].trim();
  const buyers = {};

  for (const part of parts.slice(1)) {
    const m = part.match(matchRe) || part.match(/^\*\*(TK|MA|DS)\*\*/);
    if (m) {
      const buyer = m[1];
      buyers[buyer] = part.replace(/^.*\n/, '').trim(); // strip heading line
    }
  }

  return { overall, buyers };
}

export default function AIRecommendationsPage() {
  const [days, setDays] = useState(14);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const queryClient = useQueryClient();

  const { data: report, isLoading } = useQuery({
    queryKey: ['reports', 'ai-recommendations'],
    queryFn: () => api.getAIReport(),
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  async function handleGenerate() {
    setGenerating(true);
    setGenError(null);
    try {
      await api.generateAIReport(days);
      queryClient.invalidateQueries({ queryKey: ['reports', 'ai-recommendations'] });
    } catch (err) {
      setGenError(err.message || 'Failed to generate report.');
    } finally {
      setGenerating(false);
    }
  }

  const { overall, buyers } = parseContent(report?.content);

  return (
    <div className="p-8 max-w-7xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Recommendations</h1>
          <p className="text-sm text-gray-500 mt-1">
            Profit-maximization analysis with dedicated actions per media buyer
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Analyze last</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}
              className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 bg-white">
              {[7, 14, 30].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </div>
          <button onClick={handleGenerate} disabled={generating}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
            {generating ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Generate Report
              </>
            )}
          </button>
        </div>
      </div>

      {genError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-6">
          {genError}
        </div>
      )}

      {isLoading && (
        <div className="card p-10 text-center">
          <div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && !report && !generating && (
        <div className="card p-10 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-indigo-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700 mb-1">No report generated yet</p>
          <p className="text-xs text-gray-400 mb-2">Run a sync first, then click Generate Report.</p>
        </div>
      )}

      {generating && (
        <div className="card p-10 text-center">
          <div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4" />
          <p className="text-sm font-medium text-gray-700">Analyzing campaign data…</p>
          <p className="text-xs text-gray-400 mt-1">Reviewing offers, routes, carriers, and per-buyer performance.</p>
        </div>
      )}

      {report && !generating && (
        <div className="space-y-6">
          {/* Meta */}
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span>Generated: {new Date(report.generated_at).toLocaleString()}</span>
            <span>·</span>
            <span>Last {report.period_days} days</span>
            {report.data_json?.combinations?.length > 0 && (
              <><span>·</span><span>{report.data_json.combinations.length} route combinations</span></>
            )}
            {report.data_json?.offer_combinations?.length > 0 && (
              <><span>·</span><span>{report.data_json.offer_combinations.length} offer combinations</span></>
            )}
          </div>

          {/* Per-buyer cards */}
          {Object.keys(buyers).length === 0 && overall && (
            <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Per-buyer sections not detected in this report — regenerate to get the new format.
            </div>
          )}
          {Object.keys(buyers).length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Per Buyer</h2>
              <div className="grid grid-cols-3 gap-4">
                {['TK', 'MA', 'DS'].map((buyer) => {
                  const content = buyers[buyer];
                  const style = BUYER_STYLES[buyer];
                  if (!content) return null;
                  return (
                    <div key={buyer} className={`card overflow-hidden border ${style.border}`}>
                      <div className={`px-4 py-3 ${style.header} border-b ${style.border} flex items-center gap-2`}>
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${style.badge}`}>
                          {buyer}
                        </span>
                        <span className="text-sm font-semibold text-gray-800">{buyer}</span>
                      </div>
                      <div className="p-4">
                        <MarkdownBlock content={content} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Overall analysis */}
          {overall && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Overall Analysis</h2>
              <div className="card p-6">
                <MarkdownBlock content={overall} />
              </div>
            </div>
          )}

          {/* Raw data tables (collapsed by default) */}
          <RawDataSection dataJson={report.data_json} />
        </div>
      )}
    </div>
  );
}

function RawDataSection({ dataJson }) {
  const [open, setOpen] = useState(false);
  const hasOffers = dataJson?.offer_combinations?.length > 0;
  const hasCombos = dataJson?.combinations?.length > 0;
  if (!hasOffers && !hasCombos) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {open ? 'Hide' : 'Show'} raw data used in analysis
      </button>

      {open && (
        <div className="mt-4 space-y-6">
          {hasOffers && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Offer Performance</h3>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        {['Offer', 'Route', 'Carrier', 'Vertical', 'Partner', 'Buyer', 'Clicks', 'Profit', 'ROI'].map((h) => (
                          <th key={h} className={`px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider ${h === 'Offer' ? 'text-left' : 'text-right'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {dataJson.offer_combinations.map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5 text-xs text-gray-800 max-w-[200px] truncate" title={r.offer}>{r.offer}</td>
                          <td className="px-3 py-1.5 text-right text-xs text-gray-600">{r.route}</td>
                          <td className="px-3 py-1.5 text-right text-xs text-gray-600">{r.carrier}</td>
                          <td className="px-3 py-1.5 text-right text-xs"><span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{r.vertical}</span></td>
                          <td className="px-3 py-1.5 text-right text-xs">
                            {r.data_partner && r.data_partner !== 'Unknown'
                              ? <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">{r.data_partner}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs text-gray-600">{r.buyer}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-xs text-gray-700">{Number(r.clicks).toLocaleString()}</td>
                          <td className={`px-3 py-1.5 text-right tabular-nums text-xs font-medium ${Number(r.profit) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            ${Number(r.profit).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className={`px-3 py-1.5 text-right tabular-nums text-xs font-medium ${Number(r.roi) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {r.roi}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {hasCombos && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Route × Vertical × Carrier</h3>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        {['Vertical', 'Carrier', 'Route', 'Clicks', 'Profit', 'ROI'].map((h) => (
                          <th key={h} className={`px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider ${h === 'Vertical' ? 'text-left' : 'text-right'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {dataJson.combinations.map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5 text-xs"><span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium">{r.vertical}</span></td>
                          <td className="px-3 py-1.5 text-right text-xs text-gray-600">{r.carrier}</td>
                          <td className="px-3 py-1.5 text-right text-xs text-gray-600">{r.route}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-xs text-gray-700">{Number(r.clicks).toLocaleString()}</td>
                          <td className={`px-3 py-1.5 text-right tabular-nums text-xs font-medium ${Number(r.profit) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            ${Number(r.profit).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className={`px-3 py-1.5 text-right tabular-nums text-xs font-medium ${Number(r.roi) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {r.roi}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
