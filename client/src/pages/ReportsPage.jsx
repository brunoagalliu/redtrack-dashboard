import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

const BUYERS = ['TK', 'MA', 'DS'];

const BUYER_COLORS = {
  TK: 'bg-blue-100 text-blue-700',
  MA: 'bg-purple-100 text-purple-700',
  DS: 'bg-orange-100 text-orange-700',
};

function fmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtMoney(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(sevenDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [applied, setApplied] = useState({ date_from: sevenDaysAgo, date_to: today });

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['reports', 'media-buyers', applied.date_from, applied.date_to],
    queryFn: () => api.getMediaBuyerReport(applied),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  function applyRange() {
    setApplied({ date_from: dateFrom, date_to: dateTo });
  }

  const buyers = data?.buyers || {};

  const totals = BUYERS.reduce(
    (acc, b) => {
      const s = buyers[b] || {};
      return {
        clicks:      acc.clicks      + (s.clicks      || 0),
        conversions: acc.conversions + (s.conversions  || 0),
        cost:        acc.cost        + (s.cost         || 0),
        revenue:     acc.revenue     + (s.revenue      || 0),
        profit:      acc.profit      + (s.profit       || 0),
      };
    },
    { clicks: 0, conversions: 0, cost: 0, revenue: 0, profit: 0 }
  );

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Media buyer performance</p>
      </div>

      {/* Date range */}
      <div className="card p-4 mb-6 flex items-end gap-4">
        <div>
          <label className="label">From</label>
          <input type="date" value={dateFrom} max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" value={dateTo} min={dateFrom} max={today}
            onChange={(e) => setDateTo(e.target.value)} className="input" />
        </div>
        <button type="button" onClick={applyRange} disabled={isFetching} className="btn-primary">
          {isFetching ? 'Loading…' : 'Apply'}
        </button>
      </div>

      {/* Error */}
      {isError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-6">
          {error?.message || 'Failed to load report.'}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="card p-8 text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
          <p className="text-sm font-medium text-gray-700">Computing report…</p>
          <p className="text-xs text-gray-400 mt-1">
            First load takes ~2 minutes due to API rate limits. Results are cached for 10 minutes.
          </p>
        </div>
      )}

      {/* Report table */}
      {!isLoading && data && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Buyer</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Campaigns</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Clicks</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Conversions</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Spend</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Revenue</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {BUYERS.map((buyer) => {
                const s = buyers[buyer] || {};
                return (
                  <tr key={buyer} className="hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold ${BUYER_COLORS[buyer]}`}>
                        {buyer}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums text-sm text-gray-500">{fmt(s.campaign_count)}</td>
                    <td className="px-5 py-4 text-right tabular-nums text-sm text-gray-800">{fmt(s.clicks)}</td>
                    <td className="px-5 py-4 text-right tabular-nums text-sm text-gray-800">{fmt(s.conversions)}</td>
                    <td className="px-5 py-4 text-right tabular-nums text-sm text-gray-800">{fmtMoney(s.cost)}</td>
                    <td className="px-5 py-4 text-right tabular-nums text-sm text-gray-800">{fmtMoney(s.revenue)}</td>
                    <td className={`px-5 py-4 text-right tabular-nums text-sm font-medium ${(s.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fmtMoney(s.profit)}
                    </td>
                  </tr>
                );
              })}

              {/* Totals */}
              <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                <td className="px-5 py-4 text-sm text-gray-900">Total</td>
                <td className="px-5 py-4 text-right tabular-nums text-sm text-gray-500">
                  {fmt(BUYERS.reduce((a, b) => a + (buyers[b]?.campaign_count || 0), 0))}
                </td>
                <td className="px-5 py-4 text-right tabular-nums text-sm text-gray-900">{fmt(totals.clicks)}</td>
                <td className="px-5 py-4 text-right tabular-nums text-sm text-gray-900">{fmt(totals.conversions)}</td>
                <td className="px-5 py-4 text-right tabular-nums text-sm text-gray-900">{fmtMoney(totals.cost)}</td>
                <td className="px-5 py-4 text-right tabular-nums text-sm text-gray-900">{fmtMoney(totals.revenue)}</td>
                <td className={`px-5 py-4 text-right tabular-nums text-sm font-bold ${totals.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {fmtMoney(totals.profit)}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="px-5 py-2 border-t border-gray-100 text-xs text-gray-400">
            {applied.date_from} → {applied.date_to} · cached for 10 min
          </div>
        </div>
      )}
    </div>
  );
}
