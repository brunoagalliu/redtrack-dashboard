import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

const BUYERS = ['TK', 'MA', 'DS'];

function fmt(n, decimals = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtMoney(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatCell({ value, money }) {
  return (
    <td className="px-4 py-3 text-right tabular-nums text-sm text-gray-800">
      {money ? fmtMoney(value) : fmt(value)}
    </td>
  );
}

function CampaignList({ campaigns, buyer }) {
  const [open, setOpen] = useState(false);
  if (!campaigns?.length) return null;
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-blue-600 hover:underline"
      >
        {open ? 'Hide' : 'Show'} {campaigns.length} campaigns
      </button>
      {open && (
        <div className="mt-2 max-h-64 overflow-y-auto border border-gray-200 rounded-md">
          <table className="w-full text-xs">
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-1.5 font-mono text-gray-700 break-all">{c.title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [applied, setApplied] = useState({ date_from: thirtyDaysAgo, date_to: today });

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['reports', 'media-buyers', applied.date_from, applied.date_to],
    queryFn: () => api.getMediaBuyerReport(applied),
    staleTime: 5 * 60 * 1000,
  });

  function applyRange() {
    setApplied({ date_from: dateFrom, date_to: dateTo });
  }

  const buyers = data?.buyers || {};

  const totals = BUYERS.reduce(
    (acc, b) => {
      const s = buyers[b] || {};
      return {
        clicks: acc.clicks + (s.clicks || 0),
        conversions: acc.conversions + (s.conversions || 0),
        cost: acc.cost + (s.cost || 0),
        revenue: acc.revenue + (s.revenue || 0),
        profit: acc.profit + (s.profit || 0),
      };
    },
    { clicks: 0, conversions: 0, cost: 0, revenue: 0, profit: 0 }
  );

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Media buyer performance report</p>
      </div>

      {/* Date range picker */}
      <div className="card p-4 mb-6 flex items-end gap-4">
        <div>
          <label className="label">From</label>
          <input
            type="date"
            value={dateFrom}
            max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="label">To</label>
          <input
            type="date"
            value={dateTo}
            min={dateFrom}
            max={today}
            onChange={(e) => setDateTo(e.target.value)}
            className="input"
          />
        </div>
        <button
          type="button"
          onClick={applyRange}
          disabled={isFetching}
          className="btn-primary"
        >
          {isFetching ? 'Loading…' : 'Apply'}
        </button>
      </div>

      {/* Error */}
      {isError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-6">
          {error?.message || 'Failed to load report.'}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="card p-6">
          <div className="animate-pulse space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded" />
            ))}
          </div>
        </div>
      )}

      {/* Report table */}
      {!isLoading && data && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Media Buyer
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Campaigns
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Clicks
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Conversions
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Spend
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Revenue
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Profit
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {BUYERS.map((buyer) => {
                  const s = buyers[buyer] || {};
                  return (
                    <tr key={buyer} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-sm font-bold">
                            {buyer}
                          </span>
                          <CampaignList campaigns={s.campaigns} buyer={buyer} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm text-gray-500">
                        {fmt(s.campaign_count)}
                      </td>
                      <StatCell value={s.clicks} />
                      <StatCell value={s.conversions} />
                      <StatCell value={s.cost} money />
                      <StatCell value={s.revenue} money />
                      <td className={`px-4 py-3 text-right tabular-nums text-sm font-medium ${(s.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {fmtMoney(s.profit)}
                      </td>
                    </tr>
                  );
                })}

                {/* Totals row */}
                <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                  <td className="px-4 py-3 text-sm text-gray-900">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm text-gray-500">
                    {fmt(BUYERS.reduce((acc, b) => acc + (buyers[b]?.campaign_count || 0), 0))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm text-gray-900">{fmt(totals.clicks)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm text-gray-900">{fmt(totals.conversions)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm text-gray-900">{fmtMoney(totals.cost)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm text-gray-900">{fmtMoney(totals.revenue)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums text-sm font-bold ${totals.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {fmtMoney(totals.profit)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            Date range: {applied.date_from} → {applied.date_to}
          </div>
        </div>
      )}
    </div>
  );
}
