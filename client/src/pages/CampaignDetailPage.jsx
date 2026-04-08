import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import CopyButton from '../components/CopyButton';

export default function CampaignDetailPage() {
  const { id } = useParams();

  const { data: campaign, isLoading, isError } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => api.getCampaign(id),
  });

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/campaigns" className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Campaign Created</h1>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading campaign details…</p>}
      {isError && <p className="text-sm text-red-500">Failed to load campaign.</p>}

      {campaign && (
        <div className="space-y-4">
          <div className="card p-6 space-y-4">
            <div>
              <p className="label">Campaign Name</p>
              <p className="text-sm font-medium text-gray-900">{campaign.title}</p>
            </div>
            <div>
              <p className="label">Campaign ID</p>
              <p className="text-sm text-gray-500 font-mono">{campaign.id}</p>
            </div>
            {campaign.source_title && (
              <div>
                <p className="label">Traffic Channel</p>
                <p className="text-sm text-gray-500">{campaign.source_title}</p>
              </div>
            )}
            <div>
              <p className="label">Cost Model</p>
              <p className="text-sm text-gray-500 uppercase">{campaign.cost_model}</p>
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <p className="section-title">Tracking Links</p>

            <div>
              <p className="label mb-1">Tracking Link</p>
              <div className="flex items-center gap-2">
                <span className="flex-1 text-xs font-mono text-gray-600 bg-gray-50 border border-gray-200 rounded px-3 py-2 truncate">
                  {campaign.trackback_url || '—'}
                </span>
                {campaign.trackback_url && <CopyButton text={campaign.trackback_url} />}
              </div>
            </div>

            <div>
              <p className="label mb-1">Impression Link</p>
              <div className="flex items-center gap-2">
                <span className="flex-1 text-xs font-mono text-gray-600 bg-gray-50 border border-gray-200 rounded px-3 py-2 truncate">
                  {campaign.impression_url || '—'}
                </span>
                {campaign.impression_url && <CopyButton text={campaign.impression_url} />}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Link to="/campaigns" className="btn-secondary">Back to Campaigns</Link>
            <Link to={`/campaigns/${id}/edit`} className="btn-primary">Edit Campaign</Link>
          </div>
        </div>
      )}
    </div>
  );
}
