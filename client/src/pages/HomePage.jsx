<title>Home</title>
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function laDateStr(offset = 0) {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(d);
}

function fmt(n, prefix = '') {
  if (n == null || isNaN(n)) return '—';
  return `${prefix}${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtUsd(n) {
  if (n == null || isNaN(n)) return '—';
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '—';
  return `${Number(n).toFixed(1)}%`;
}

function roiColor(roi) {
  if (roi == null || isNaN(roi)) return 'text-gray-500';
  if (roi > 0) return 'text-emerald-600';
  if (roi < 0) return 'text-red-500';
  return 'text-gray-400';
}

function KpiCard({ label, value, sub, valueClass = 'text-gray-900' }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

const SECTIONS = [
  {
    label: 'AI Reports',
    desc: 'Claude-generated campaign analysis and optimization tips',
    href: '/reports/ai',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    accent: 'bg-violet-50 text-violet-600 border-violet-100',
  },
  {
    label: 'Media Buyers',
    desc: 'Revenue and cost breakdown by buyer and vertical',
    href: '/reports/media-buyers',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    accent: 'bg-blue-50 text-blue-600 border-blue-100',
  },
  {
    label: 'Insights',
    desc: 'Offer and OS performance deep dive',
    href: '/reports/insights',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    accent: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  },
  {
    label: 'Lists',
    desc: 'SMS list performance and usage tracking',
    href: '/reports/lists',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 10h16M4 14h10M4 18h6" />
      </svg>
    ),
    accent: 'bg-amber-50 text-amber-600 border-amber-100',
  },
  {
    label: 'Campaigns',
    desc: 'Full campaign list with sync and configuration',
    href: '/campaigns',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    accent: 'bg-gray-50 text-gray-600 border-gray-200',
  },
  {
    label: 'Domain Finder',
    desc: 'Provision, brainstorm, and manage domains',
    href: '/tools/domain-finder',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
    accent: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  },
];

export default function HomePage() {
  const navigate = useNavigate();
  const yesterday = laDateStr(-1);
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' });

  const { data: syncStatus }      = useQuery({ queryKey: ['sync', 'status'],        queryFn: () => api.getSyncStatus(),      staleTime: 30000, refetchInterval: 30000, retry: false });
  const { data: offerSyncStatus } = useQuery({ queryKey: ['sync', 'offers', 'status'], queryFn: () => api.getOfferSyncStatus(), staleTime: 30000, refetchInterval: 30000, retry: false });
  const { data: report }          = useQuery({ queryKey: ['home', 'yesterday', yesterday], queryFn: () => api.getMediaBuyerReport({ date_from: yesterday, date_to: yesterday }), staleTime: 60000, retry: false });

  const syncRunning = Boolean(syncStatus?.running || offerSyncStatus?.running);
  const lastSyncAt  = [syncStatus?.completed_at, offerSyncStatus?.completed_at]
    .filter(Boolean).map(d => new Date(d)).sort((a, b) => b - a)[0] ?? null;

  const campaigns = Object.values(report?.buyers ?? {}).flatMap(b => b.campaigns ?? []);
  const totals = campaigns.reduce((acc, c) => ({
    revenue:  acc.revenue  + (c.revenue      ?? 0),
    cost:     acc.cost     + (c.cost         ?? 0),
    convs:    acc.convs    + (c.conversions  ?? 0),
  }), { revenue: 0, cost: 0, convs: 0 });
  const roi = totals.cost > 0 ? ((totals.revenue - totals.cost) / totals.cost) * 100 : null;

  return (
    <div className="p-6 md:p-8 max-w-5xl space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{greeting()}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{todayLabel}</p>
        </div>

        {/* Sync status pill */}
        <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border ${
          syncRunning
            ? 'bg-blue-50 border-blue-200 text-blue-600'
            : lastSyncAt
            ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
            : 'bg-gray-50 border-gray-200 text-gray-400'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${syncRunning ? 'bg-blue-500 animate-pulse' : lastSyncAt ? 'bg-emerald-500' : 'bg-gray-300'}`} />
          {syncRunning
            ? 'Sync running…'
            : lastSyncAt
            ? `Synced ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' }).format(lastSyncAt)}`
            : 'No sync data'}
        </div>
      </div>

      {/* Yesterday KPIs */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Yesterday</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Revenue" value={fmtUsd(totals.revenue)} />
          <KpiCard label="Cost"    value={fmtUsd(totals.cost)} />
          <KpiCard label="ROI"     value={fmtPct(roi)} valueClass={roiColor(roi)} />
          <KpiCard label="Conversions" value={fmt(totals.convs)} />
        </div>
      </div>

      {/* Quick access */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick access</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {SECTIONS.map(s => (
            <button
              key={s.href}
              onClick={() => navigate(s.href)}
              className="group text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 hover:shadow-sm transition-all"
            >
              <div className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border mb-3 ${s.accent}`}>
                {s.icon}
              </div>
              <p className="text-sm font-semibold text-gray-800 group-hover:text-gray-900">{s.label}</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{s.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
