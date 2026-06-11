import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

const BUYER_COLORS = {
  TK: { badge: 'bg-blue-100 text-blue-700',   ring: 'ring-blue-200',   bar: 'bg-blue-500' },
  MA: { badge: 'bg-purple-100 text-purple-700', ring: 'ring-purple-200', bar: 'bg-purple-500' },
  DS: { badge: 'bg-orange-100 text-orange-700', ring: 'ring-orange-200', bar: 'bg-orange-500' },
};
const BUYERS = ['TK', 'MA', 'DS'];

function fmt(n)      { return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function fmtMoney(n) { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtPct(n)   { return Number(n).toFixed(1) + '%'; }

// Simple inline bar (% of max)
function Bar({ value, max, className = 'bg-blue-500' }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
      <div className={`h-1.5 rounded-full ${className}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// Sparkline-style day bars (last 14 days)
function DailyBar({ daily, max }) {
  const days = [...daily].reverse();
  return (
    <div className="flex items-end gap-0.5 h-8 mt-2">
      {Array.from({ length: 14 }).map((_, i) => {
        const d = days[i];
        const h = max > 0 && d ? Math.max(4, (d.count / max) * 32) : 2;
        return (
          <div key={i} title={d ? `${d.date}: ${d.count}` : ''}
            className={`flex-1 rounded-sm ${d?.count ? 'bg-blue-400' : 'bg-gray-100'}`}
            style={{ height: `${h}px` }} />
        );
      })}
    </div>
  );
}

export default function InsightsPage() {
  const [days, setDays] = useState(30);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reports', 'insights', days],
    queryFn: () => api.getInsights(days),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const nc   = data?.new_campaigns || {};
  const vp   = data?.vertical_performance || [];
  const ops  = data?.opportunities || [];
  const mat  = data?.buyer_vertical_matrix || {};

  // Max daily count across all buyers for sparkline scaling
  const maxDaily = Math.max(1, ...BUYERS.flatMap((b) => (nc[b]?.daily || []).map((d) => d.count)));
  // Max profit for bar scaling
  const maxProfit = Math.max(1, ...vp.map((v) => v.profit));
  const maxPPC    = Math.max(1, ...vp.map((v) => v.profit_per_campaign));

  return (
    <div className="p-8 max-w-6xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Insights</h1>
          <p className="text-sm text-gray-500 mt-1">Performance analysis and growth opportunities</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Period:</span>
          {[7, 14, 30, 60, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                days === d ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="card p-10 text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      )}

      {isError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          Failed to load insights.
        </div>
      )}

      {data && (
        <>
          {/* ── New Campaigns ── */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">New Campaigns</h2>
            <div className="grid grid-cols-3 gap-4">
              {BUYERS.map((buyer) => {
                const s = nc[buyer] || {};
                const col = BUYER_COLORS[buyer];
                return (
                  <div key={buyer} className="card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold ${col.badge}`}>
                        {buyer}
                      </span>
                      <span className="text-2xl font-bold text-gray-900">{s.last_30 ?? '—'}</span>
                    </div>
                    <div className="space-y-1 text-xs text-gray-500">
                      <div className="flex justify-between">
                        <span>Today</span>
                        <span className="font-semibold text-gray-700">{s.today ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Yesterday</span>
                        <span className="font-semibold text-gray-700">{s.yesterday ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Last 7 days</span>
                        <span className="font-semibold text-gray-700">{s.last_7 ?? 0}</span>
                      </div>
                    </div>
                    <DailyBar daily={s.daily || []} max={maxDaily} />
                    <p className="text-xs text-gray-400 mt-1">Last 14 days</p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Vertical Performance ── */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Vertical Performance</h2>
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    {['Vertical', 'Campaigns', 'Clicks', 'CVR', 'Spend', 'Revenue', 'Profit', 'Profit / Campaign', 'ROI'].map((h) => (
                      <th key={h} className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${h === 'Vertical' ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {vp.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">No data — run a sync first.</td></tr>
                  )}
                  {vp.map((v) => (
                    <tr key={v.vertical} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700">
                          {v.vertical}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm text-gray-700">{fmt(v.campaigns)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm text-gray-700">{fmt(v.clicks)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm text-gray-700">{fmtPct(v.cvr)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm text-gray-700">{fmtMoney(v.cost)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm text-gray-700">{fmtMoney(v.revenue)}</td>
                      <td className={`px-4 py-3 text-right tabular-nums text-sm font-medium ${v.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        <div>{fmtMoney(v.profit)}</div>
                        <Bar value={v.profit} max={maxProfit} className="bg-green-400" />
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums text-sm font-medium ${v.profit_per_campaign >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        <div>{fmtMoney(v.profit_per_campaign)}</div>
                        <Bar value={v.profit_per_campaign} max={maxPPC} className="bg-emerald-400" />
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums text-sm font-semibold ${v.roi >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {fmtPct(v.roi)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Buyer × Vertical Matrix ── */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Campaign Coverage</h2>
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Vertical</th>
                    {BUYERS.map((b) => (
                      <th key={b} className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">{b}</th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {vp.map((v) => {
                    const total = BUYERS.reduce((a, b) => a + (mat[b]?.[v.vertical] || 0), 0);
                    return (
                      <tr key={v.vertical} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700">
                            {v.vertical}
                          </span>
                        </td>
                        {BUYERS.map((buyer) => {
                          const count = mat[buyer]?.[v.vertical] || 0;
                          const pct   = total > 0 ? count / total : 0;
                          return (
                            <td key={buyer} className="px-4 py-2.5 text-center">
                              {count > 0 ? (
                                <div className="inline-flex flex-col items-center">
                                  <span className={`text-sm font-semibold ${BUYER_COLORS[buyer].badge} px-2 py-0.5 rounded`}>{count}</span>
                                  <span className="text-xs text-gray-400 mt-0.5">{Math.round(pct * 100)}%</span>
                                </div>
                              ) : (
                                <span className="text-gray-300 text-sm">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-700">{total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Opportunities ── */}
          {ops.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Growth Opportunities</h2>
              <p className="text-xs text-gray-400 mb-3">High profit-per-campaign verticals where a buyer has low coverage</p>
              <div className="grid grid-cols-1 gap-3">
                {ops.slice(0, 10).map((op, i) => {
                  const col = BUYER_COLORS[op.buyer];
                  return (
                    <div key={i} className="card p-4 flex items-center gap-4">
                      <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold shrink-0 ${col.badge}`}>
                        {op.buyer}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">
                          <span className="text-indigo-700">{op.vertical}</span> — {op.buyer} has only {op.buyer_campaigns} campaigns
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {op.total_campaigns} total campaigns in this vertical averaging {fmtMoney(op.profit_per_campaign)} profit each
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-green-600">{fmtMoney(op.profit_per_campaign)}</p>
                        <p className="text-xs text-gray-400">per campaign</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
