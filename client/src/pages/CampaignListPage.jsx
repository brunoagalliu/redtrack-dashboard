import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import CopyButton from '../components/CopyButton';

const PAGE_SIZE = 50;

function appendParams(url, params) {
  if (!url || !params) return url;
  try {
    const [base, qs] = url.split('?');
    const existing = new URLSearchParams(qs || '');
    existing.delete('sourceid');
    existing.delete('clk');
    const newParams = new URLSearchParams(params);
    newParams.forEach((v, k) => existing.set(k, v));
    const finalQs = existing.toString();
    return finalQs ? `${base}?${finalQs}` : base;
  } catch {
    return url;
  }
}

// Returns { tracking: string|null, impression: string|null } per channel
function buildUrlParams(title, partners, sourceTitle) {
  if (sourceTitle === 'SMS - Internal') {
    return { tracking: null, impression: null };
  }

  if (sourceTitle === 'SMS - UPM') {
    const parts = title ? title.split('_') : [];
    const hasClickers = parts.some((p) => p.toLowerCase() === 'clickers');
    const partnerAliasSet = new Map((partners || []).map((p) => [p.alias, p.code]));
    const matchedCode = parts.map((p) => partnerAliasSet.get(p)).find(Boolean);
    const sourceidParam = matchedCode ? `sourceid=${matchedCode}` : '';
    const clkParam = `clk=${hasClickers ? 1 : 0}`;
    const trackingExtra = [sourceidParam, clkParam].filter(Boolean).join('&');
    return {
      tracking: `phone=PHONE&firstname=FIRST_NAME&templateid=TEMPLATE_ID&${trackingExtra}`,
      impression: 'phone={PHONE}&firstname={FIRST_NAME}&templateid={TEMPLATE_ID}',
    };
  }

  if (sourceTitle === 'SMS - Ranhog') {
    if (!title || !partners?.length) return { tracking: null, impression: null };
    const parts = title.split('_');
    const partnerAliasSet = new Map(partners.map((p) => [p.alias, p.code]));
    const matchedCode = parts.map((p) => partnerAliasSet.get(p)).find(Boolean);
    return { tracking: matchedCode ? `sourceid=${matchedCode}` : null, impression: null };
  }

  // Default: sourceid + clk derived from campaign name
  if (!title || !partners?.length) return { tracking: null, impression: null };
  const parts = title.split('_');
  const hasClickers = parts.some((p) => p.toLowerCase() === 'clickers');
  const partnerAliasSet = new Map(partners.map((p) => [p.alias, p.code]));
  const matchedCode = parts.map((p) => partnerAliasSet.get(p)).find(Boolean);
  const clkParam = `clk=${hasClickers ? 1 : 0}`;
  const tracking = matchedCode ? `sourceid=${matchedCode}&${clkParam}` : clkParam;
  return { tracking, impression: null };
}

export default function CampaignListPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['campaigns', { search }],
    queryFn: () => api.getCampaigns({ title: search || undefined }),
  });

  const { data: partners = [] } = useQuery({
    queryKey: ['list', 'partners'],
    queryFn: () => api.getPartners(),
  });

  const sorted = [...(Array.isArray(data) ? data : (data?.items ?? []))]
    .sort((a, b) => (b.serial_number ?? 0) - (a.serial_number ?? 0));

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const campaigns = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const cloneMutation = useMutation({
    mutationFn: (id) => api.cloneCampaign(id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      navigate(`/campaigns/${data.id}/edit`);
    },
  });

  function handleSearch(value) {
    setSearch(value);
    setPage(1);
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Campaigns</h1>
        <Link to="/campaigns/new" className="btn-primary">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Campaign
        </Link>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="input max-w-xs"
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading campaigns...</div>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-red-500">Failed to load campaigns.</div>
        ) : sorted.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No campaigns found.</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['#', 'Campaign Name', 'Tracking Link', 'Impression Link', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {campaigns.map((c) => {
                const { tracking: trackingParams, impression: impressionParams } = buildUrlParams(c.title, partners, c.source_title);
                const trackingUrl = appendParams(c.trackback_url, trackingParams);
                const impressionUrl = appendParams(c.impression_url, impressionParams);
                return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-400 w-12">{c.serial_number}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-xs">
                    <div className="flex items-center gap-2">
                      <Link to={`/campaigns/${c.id}/edit`} className="hover:text-blue-600 truncate">
                        {c.title}
                      </Link>
                      <button
                        type="button"
                        onClick={() => cloneMutation.mutate(c.id)}
                        disabled={cloneMutation.isPending}
                        title="Clone campaign"
                        className="shrink-0 px-2 py-1 text-xs rounded border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 font-medium disabled:opacity-50"
                      >
                        Clone
                      </button>
                      <CopyButton text={c.title} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-sm font-mono">
                    {trackingUrl ? (
                      <div className="flex items-center gap-2">
                        <span className="truncate">{trackingUrl}</span>
                        <CopyButton text={trackingUrl} />
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-sm font-mono">
                    {impressionUrl ? (
                      <div className="flex items-center gap-2">
                        <span className="truncate">{impressionUrl}</span>
                        <CopyButton text={impressionUrl} />
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <Link
                      to={`/campaigns/${c.id}/edit`}
                      className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-400">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length} campaigns
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              «
            </button>
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
              className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ‹
            </button>
            <span className="px-3 py-1 text-xs text-gray-600">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page === totalPages}
              className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ›
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              »
            </button>
          </div>
        </div>
      )}
      {totalPages <= 1 && sorted.length > 0 && (
        <p className="mt-3 text-xs text-gray-400">Showing all {sorted.length} campaigns</p>
      )}
    </div>
  );
}
