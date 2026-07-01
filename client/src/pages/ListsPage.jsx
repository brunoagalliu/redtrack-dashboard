import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

function fmtMoney(n) {
  const v = Number(n || 0);
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtRate(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }); }
function fmt(n)     { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function fmtDate(s) { return s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'; }

function StatusBadge({ days }) {
  if (days === null || days === undefined) return null;
  const d = Number(days);
  if (d < 14) return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Active</span>;
  if (d < 28) return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">Cooling {d}d</span>;
  return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Idle {d}d</span>;
}

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <span className="text-gray-300 ml-0.5">↕</span>;
  return <span className="text-indigo-500 ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

function CampaignRows({ listKey, days }) {
  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'lists', 'campaigns', listKey, days],
    queryFn: () => api.getListCampaigns(listKey, days),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (isLoading) return (
    <tr><td colSpan={10} className="px-4 py-4 bg-gray-50 text-center">
      <span className="inline-block w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
    </td></tr>
  );

  const rows = data?.rows || [];
  if (!rows.length) return (
    <tr><td colSpan={10} className="px-4 py-3 bg-gray-50 text-xs text-gray-400 text-center">No campaigns found for this list.</td></tr>
  );

  return rows.map((c, i) => {
    const profit = Number(c.profit);
    return (
      <tr key={c.id} className="bg-indigo-50/40 border-b border-indigo-100/60">
        <td className="w-8 border-r border-indigo-100" />
        <td className="px-3 py-2" colSpan={2}>
          <div className="font-mono text-xs text-gray-600 truncate max-w-xs" title={c.title}>{c.title}</div>
          <div className="text-xs text-gray-400 mt-0.5">{fmtDate(c.created_at)}{i === 0 ? ' · first use' : ''}</div>
        </td>
        <td className="px-3 py-2 text-xs text-center">
          <span className="px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-600 font-medium">{c.buyer}</span>
        </td>
        <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{[c.route, c.carrier].filter(Boolean).join(' · ')}</td>
        <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-600">{fmt(c.clicks)}</td>
        <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-600">{fmt(c.conversions)}</td>
        <td className="px-3 py-2 text-right tabular-nums text-xs font-medium text-gray-700">{fmtRate(c.epc)}</td>
        <td className={`px-3 py-2 text-right tabular-nums text-xs font-medium ${profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtMoney(profit)}</td>
        <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-400">{fmtDate(c.created_at)}</td>
      </tr>
    );
  });
}

export default function ListsPage() {
  const [expandedList, setExpandedList] = useState(null);
  const [campaignDays, setCampaignDays] = useState(30);
  const [sortCol, setSortCol] = useState('profit');
  const [sortDir, setSortDir] = useState('desc');
  const [search, setSearch]   = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'lists'],
    queryFn: () => api.getListsReport(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  const rows     = data?.rows || [];
  const filtered = rows.filter(r => !search || r.list_key?.toLowerCase().includes(search.toLowerCase()));
  const sorted   = [...filtered].sort((a, b) => {
    const av = Number(a[sortCol]) || 0, bv = Number(b[sortCol]) || 0;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const TH = ({ col, label, right }) => (
    <th onClick={() => toggleSort(col)}
      className={`px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-gray-700 ${right ? 'text-right' : 'text-left'}`}>
      {label}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
    </th>
  );

  return (
    <div className="p-8 max-w-screen-2xl space-y-5">

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Lists & Campaigns</h1>
        <p className="text-sm text-gray-500 mt-1">Click any list to expand all campaigns that used it, oldest to newest</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input type="text" placeholder="Search list…" value={search} onChange={e => setSearch(e.target.value)}
          className="border border-gray-200 rounded px-3 py-1.5 text-sm w-64" />
        <span className="text-xs text-gray-400">{sorted.length} lists</span>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-gray-500">Campaign stats window</span>
          <select value={campaignDays} onChange={e => setCampaignDays(Number(e.target.value))}
            className="border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 bg-white">
            {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>Last {d} days</option>)}
          </select>
        </div>
      </div>

      {isLoading && <div className="card p-10 text-center"><div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>}

      {!isLoading && sorted.length === 0 && (
        <div className="card p-10 text-center text-sm text-gray-400">No lists found — run a sync to populate list data.</div>
      )}

      {!isLoading && sorted.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="w-8" />
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">List</th>
                <TH col="campaign_count"      label="Camps"  right />
                <TH col="clicks"              label="Clicks" right />
                <TH col="conversions"         label="Conv"   right />
                <TH col="epc"                 label="EPC"    right />
                <TH col="profit"              label="Profit" right />
                <TH col="roi"                 label="ROI"    right />
                <TH col="days_since_last_use" label="Idle"   right />
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((row) => {
                const isOpen = expandedList === row.list_key;
                const profit = Number(row.profit);
                return [
                  <tr key={row.list_key}
                    onClick={() => setExpandedList(isOpen ? null : row.list_key)}
                    className="hover:bg-indigo-50/30 cursor-pointer transition-colors">
                    <td className="px-2 text-center text-gray-400 text-xs select-none">{isOpen ? '▾' : '▸'}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-700 max-w-xs truncate" title={row.list_key}>{row.list_key}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-500 text-xs">{fmt(row.campaign_count)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{fmt(row.clicks)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{fmt(row.conversions)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-gray-700">{fmtRate(row.epc)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtMoney(profit)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums text-xs font-medium ${Number(row.roi) >= 0 ? 'text-green-600' : 'text-red-500'}`}>{row.roi}%</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs text-gray-400">{row.days_since_last_use != null ? `${row.days_since_last_use}d` : '—'}</td>
                    <td className="px-3 py-2.5"><StatusBadge days={row.days_since_last_use} /></td>
                  </tr>,
                  isOpen && (
                    <tr key={`${row.list_key}-expanded`}>
                      <td colSpan={10} className="p-0">
                        <table className="w-full text-xs border-t border-indigo-100">
                          <thead>
                            <tr className="bg-indigo-50 border-b border-indigo-100">
                              <th className="w-8" />
                              <th className="px-3 py-2 text-left font-medium text-indigo-600 uppercase tracking-wide" colSpan={2}>Campaign title</th>
                              <th className="px-3 py-2 text-center font-medium text-indigo-600 uppercase tracking-wide">Buyer</th>
                              <th className="px-3 py-2 text-left font-medium text-indigo-600 uppercase tracking-wide">Route · Carrier</th>
                              <th className="px-3 py-2 text-right font-medium text-indigo-600 uppercase tracking-wide">Clicks {campaignDays}d</th>
                              <th className="px-3 py-2 text-right font-medium text-indigo-600 uppercase tracking-wide">Conv {campaignDays}d</th>
                              <th className="px-3 py-2 text-right font-medium text-indigo-600 uppercase tracking-wide">EPC {campaignDays}d</th>
                              <th className="px-3 py-2 text-right font-medium text-indigo-600 uppercase tracking-wide">Profit {campaignDays}d</th>
                              <th className="px-3 py-2 text-right font-medium text-indigo-600 uppercase tracking-wide">Created</th>
                            </tr>
                          </thead>
                          <tbody>
                            <CampaignRows listKey={row.list_key} days={campaignDays} />
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
