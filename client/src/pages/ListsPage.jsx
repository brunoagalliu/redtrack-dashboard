import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

function fmt(n)      { return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function fmtMoney(n) { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtRate(n)  { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }); }

function StatusBadge({ days }) {
  if (days === null || days === undefined) return null;
  const d = Number(days);
  if (d < 14) return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Active</span>;
  if (d < 28) return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">Cooling {d}d</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Idle {d}d — test?</span>;
}

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <span className="text-gray-300 ml-1">↕</span>;
  return <span className="text-blue-500 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

export default function ListsPage() {
  const [buyer,   setBuyer]   = useState('');
  const [route,   setRoute]   = useState('');
  const [carrier, setCarrier] = useState('');
  const [sortCol, setSortCol] = useState('profit');
  const [sortDir, setSortDir] = useState('desc');
  const [search,  setSearch]  = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reports', 'lists', buyer, route, carrier],
    queryFn: () => api.getListsReport({ buyer, route, carrier }),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  const rows = data?.rows || [];

  const filtered = rows.filter(r =>
    !search || r.list_key?.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    const av = Number(a[sortCol]) || 0;
    const bv = Number(b[sortCol]) || 0;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const cols = [
    { key: 'list_key',            label: 'List',            numeric: false  },
    { key: 'campaign_count',      label: 'Campaigns',       numeric: true   },
    { key: 'clicks',              label: 'Clicks',          numeric: true   },
    { key: 'conversions',         label: 'Conv',            numeric: true   },
    { key: 'epc',                 label: 'EPC',             numeric: true   },
    { key: 'revenue',             label: 'Revenue',         numeric: true   },
    { key: 'profit',              label: 'Profit',          numeric: true   },
    { key: 'roi',                 label: 'ROI',             numeric: true   },
    { key: 'days_since_last_use', label: 'Last Used',       numeric: true   },
    { key: 'status',              label: 'Status',          numeric: false  },
  ];

  return (
    <div className="p-8 max-w-screen-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Lists</h1>
          <p className="text-sm text-gray-500 mt-1">Performance by data list — identify which lists to reuse, cool down, or retire</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text" placeholder="Search list name…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-200 rounded px-3 py-1.5 text-sm w-64"
        />
        {[
          { label: 'Buyer', value: buyer, set: setBuyer, opts: ['TK','MA','DS'] },
          { label: 'Route', value: route, set: setRoute, opts: ['USMS','TechStar','ltsauto','Ranhog','Internal'] },
          { label: 'Carrier', value: carrier, set: setCarrier, opts: ['Verizon','AT&T','T-Mobile'] },
        ].map(({ label, value, set, opts }) => (
          <select key={label} value={value} onChange={e => set(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 bg-white">
            <option value="">{label}</option>
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        {(buyer || route || carrier || search) && (
          <button onClick={() => { setBuyer(''); setRoute(''); setCarrier(''); setSearch(''); }}
            className="text-xs text-gray-400 hover:text-gray-600 underline">Clear</button>
        )}
        <span className="text-xs text-gray-400 ml-auto">{sorted.length} lists</span>
      </div>

      {isLoading && (
        <div className="card p-10 text-center">
          <div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      )}

      {isError && (
        <div className="card p-6 text-sm text-red-600">Failed to load list data.</div>
      )}

      {!isLoading && !isError && sorted.length === 0 && (
        <div className="card p-10 text-center text-sm text-gray-500">
          No list data yet — run a sync to populate list tracking from campaign titles.
        </div>
      )}

      {!isLoading && sorted.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {cols.map(c => (
                  <th key={c.key}
                    onClick={() => c.numeric && toggleSort(c.key)}
                    className={`px-3 py-2.5 text-left font-medium text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap ${c.numeric ? 'cursor-pointer hover:text-gray-700 text-right' : ''}`}>
                    {c.label}{c.numeric && <SortIcon col={c.key} sortCol={sortCol} sortDir={sortDir} />}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-left font-medium text-gray-500 text-xs uppercase tracking-wide">Buyers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map((row, i) => {
                const profit = Number(row.profit);
                const roi    = Number(row.roi);
                return (
                  <tr key={i} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-700 max-w-xs truncate" title={row.list_key}>
                      {row.list_key}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{fmt(row.campaign_count)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{fmt(row.clicks)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{fmt(row.conversions)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-gray-700">{fmtRate(row.epc)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{fmtMoney(row.revenue)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {fmtMoney(profit)}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums text-xs font-medium ${roi >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {roi}%
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-500 text-xs">
                      {row.days_since_last_use != null ? `${row.days_since_last_use}d ago` : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge days={row.days_since_last_use} />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500">
                      {(row.buyers || []).join(', ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
