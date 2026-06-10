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
  if (n == null || n === '') return '—';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtMoney(n) {
  if (n == null || n === '') return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function BuyerTable({ buyer, data }) {
  const { campaigns = [], totals = {}, checked = 0 } = data || {};

  return (
    <div className="card overflow-hidden">
      {/* Buyer header */}
      <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold ${BUYER_COLORS[buyer]}`}>
            {buyer}
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-900">{buyer}</p>
            <p className="text-xs text-gray-400">
              {campaigns.length} active campaign{campaigns.length !== 1 ? 's' : ''}
              {checked > 0 && <span className="ml-1">· {checked} checked</span>}
            </p>
          </div>
        </div>
        {/* Buyer aggregate summary */}
        <div className="hidden sm:flex items-center gap-6 text-right">
          <div>
            <p className="text-xs text-gray-400">Clicks</p>
            <p className="text-sm font-semibold text-gray-800 tabular-nums">{fmt(totals.clicks)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Conversions</p>
            <p className="text-sm font-semibold text-gray-800 tabular-nums">{fmt(totals.conversions)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Revenue</p>
            <p className="text-sm font-semibold text-gray-800 tabular-nums">{fmtMoney(totals.revenue)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Profit</p>
            <p className={`text-sm font-semibold tabular-nums ${(totals.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {fmtMoney(totals.profit)}
            </p>
          </div>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="px-5 py-6 text-center text-sm text-gray-400">
          No active campaigns in this period
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Campaign</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Clicks</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Conversions</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Spend</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Revenue</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-xs font-mono text-gray-700 max-w-xs truncate" title={c.title}>
                    {c.title}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-sm text-gray-800">{fmt(c.clicks)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-sm text-gray-800">{fmt(c.conversions)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-sm text-gray-800">{fmtMoney(c.cost)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-sm text-gray-800">{fmtMoney(c.revenue)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums text-sm font-medium ${(c.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {fmtMoney(c.profit)}
                  </td>
                </tr>
              ))}

              {/* Totals row */}
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                <td className="px-4 py-2.5 text-sm text-gray-900">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-sm text-gray-900">{fmt(totals.clicks)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-sm text-gray-900">{fmt(totals.conversions)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-sm text-gray-900">{fmtMoney(totals.cost)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-sm text-gray-900">{fmtMoney(totals.revenue)}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums text-sm font-bold ${(totals.profit || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {fmtMoney(totals.profit)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
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
    staleTime: 5 * 60 * 1000,
  });

  function applyRange() {
    setApplied({ date_from: dateFrom, date_to: dateTo });
  }

  const buyers = data?.buyers || {};

  const grandTotals = BUYERS.reduce(
    (acc, b) => {
      const t = buyers[b]?.totals || {};
      return {
        clicks: acc.clicks + (t.clicks || 0),
        conversions: acc.conversions + (t.conversions || 0),
        cost: acc.cost + (t.cost || 0),
        revenue: acc.revenue + (t.revenue || 0),
        profit: acc.profit + (t.profit || 0),
      };
    },
    { clicks: 0, conversions: 0, cost: 0, revenue: 0, profit: 0 }
  );

  return (
    <div className="p-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Active campaigns by media buyer · filters: &gt;10 clicks or ≥1 conversion or revenue &gt; 0</p>
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
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-6">
              <div className="animate-pulse space-y-3">
                <div className="h-8 bg-gray-100 rounded w-32" />
                <div className="h-6 bg-gray-100 rounded" />
                <div className="h-6 bg-gray-100 rounded" />
                <div className="h-6 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Buyer tables */}
      {!isLoading && data && (
        <div className="space-y-6">
          {BUYERS.map((buyer) => (
            <BuyerTable key={buyer} buyer={buyer} data={buyers[buyer]} />
          ))}

          {/* Grand totals card */}
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">All Buyers · Grand Total</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {[
                { label: 'Clicks', value: fmt(grandTotals.clicks) },
                { label: 'Conversions', value: fmt(grandTotals.conversions) },
                { label: 'Spend', value: fmtMoney(grandTotals.cost) },
                { label: 'Revenue', value: fmtMoney(grandTotals.revenue) },
                { label: 'Profit', value: fmtMoney(grandTotals.profit), profit: true },
              ].map(({ label, value, profit }) => (
                <div key={label}>
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className={`text-lg font-bold tabular-nums ${profit ? (grandTotals.profit >= 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-900'}`}>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
