import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import CampaignForm from '../components/CampaignForm';

const REDIRECT_TYPE_MAP = { '302': 1, '301': 2, meta: 3, js: 4, double: 5 };
const REDIRECT_TYPE_REVERSE = { 1: '302', 2: '301', 3: 'meta', 4: 'js', 5: 'double' };
const COST_VALUE_FIELDS = { CPC: 'cpc', CPM: 'cpm', CPA: 'cpa', POPCPM: 'popcpm', REVSHARE: 'rev_share' };

function mapStreamFilters(apiFilters) {
  if (!apiFilters) return {};
  const result = {};
  for (const [key, filter] of Object.entries(apiFilters)) {
    if (filter.active && Array.isArray(filter.values) && filter.values.length > 0) {
      result[key] = { exclude: filter.exclude || false, values: filter.values };
    }
  }
  return result;
}

function buildStreamFilters(formFilters) {
  if (!formFilters) return undefined;
  const result = {};
  for (const [key, filter] of Object.entries(formFilters)) {
    if (filter.values?.length > 0) {
      result[key] = { values: filter.values, active: true, exclude: filter.exclude || false, comparison_type: 'EQ' };
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function deriveFlow(stream) {
  if (!stream) return 'offer';
  if ((stream.prelandings || []).length > 0) return 'prelanding_landing_offer';
  if ((stream.landings || []).length > 0) return 'landing_offer';
  return 'offer';
}

function toFormValues(campaign) {
  if (!campaign) return null;
  const costModel = campaign.cost_model || 'CPC';
  const costField = COST_VALUE_FIELDS[costModel];
  const costValue = costField ? (campaign[costField] ?? 0) : 0;

  return {
    name: campaign.title || '',
    traffic_source_id: campaign.source_id || '',
    domain_id: campaign.domain_id || '',
    cost_type: costModel,
    cost_value: costValue,
    tracking_type: campaign.tracking_type || 'REDIRECT',
    redirect_type: REDIRECT_TYPE_REVERSE[campaign.redirect_type] || '302',
    rsoc: campaign.rsoc_enabled || false,
    funnels: Array.isArray(campaign.streams) && campaign.streams.length
      ? campaign.streams.map((s) => ({
          _stream_id: s.id,
          label: s.stream?.title || '',
          weight: s.weight ?? 100,
          flow: deriveFlow(s.stream),
          smart_traffic: s.optimization?.is_enabled || false,
          offers: (s.stream?.offers || []).map((o) => ({ offer_id: o.id, weight: o.weight ?? 100 })),
          landings: (s.stream?.landings || []).map((l) => ({ landing_id: l.id, weight: l.weight ?? 100 })),
          pre_landings: (s.stream?.prelandings || []).map((l) => ({ landing_id: l.id, weight: l.weight ?? 100 })),
          filters: mapStreamFilters(s.stream?.filters),
        }))
      : [{ label: '', weight: 100, flow: 'offer', offers: [], landings: [], pre_landings: [], smart_traffic: false }],
    tags: Array.isArray(campaign.tags) ? campaign.tags.join(', ') : (campaign.tags || ''),
    notes: Array.isArray(campaign.notes) ? campaign.notes.join('\n') : (campaign.notes || ''),
    postbacks: (campaign.postbacks || []).map((p, i) => ({
      _key: i + 1,
      url: p.url || '',
      payout_type: p.custom_payout != null ? 'fixed' : 'percentage',
      payout_value: p.custom_payout != null ? p.custom_payout : (p.payment_percent ?? 100),
      method: p.request_method === 1 ? 'POST' : 'GET',
      no_updated_conversions: p.not_send_update || false,
      conditional: p.match_event || false,
    })),
  };
}

function buildPayload(form) {
  const costField = COST_VALUE_FIELDS[form.cost_type];
  const costValue = form.cost_value !== '' ? Number(form.cost_value) : 0;

  return {
    title: form.name,
    source_id: form.traffic_source_id || undefined,
    domain_id: form.domain_id || undefined,
    cost_model: form.cost_type,
    ...(costField ? { [costField]: costValue } : {}),
    redirect_type: REDIRECT_TYPE_MAP[form.redirect_type] ?? 1,
    rsoc_enabled: form.rsoc,
    streams: form.funnels.map((f) => ({
      ...(f._stream_id ? { id: f._stream_id } : {}),
      weight: f.weight,
      optimization: { is_enabled: f.smart_traffic || false },
      stream: {
        title: f.label || '',
        offers: f.offers.filter((o) => o.offer_id).map((o) => ({ id: o.offer_id, weight: o.weight })),
        landings: (f.landings || []).filter((l) => l.landing_id).map((l) => ({ id: l.landing_id, weight: l.weight })),
        prelandings: (f.pre_landings || []).filter((l) => l.landing_id).map((l) => ({ id: l.landing_id, weight: l.weight })),
        filters: buildStreamFilters(f.filters),
      },
    })),
    tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    notes: form.notes ? [form.notes] : [],
    postbacks: form.postbacks.map(({ _key, url, payout_type, payout_value, method, no_updated_conversions }) => ({
      url,
      payment_percent: payout_type === 'percentage' ? payout_value : 0,
      custom_payout: payout_type === 'fixed' ? payout_value : null,
      request_method: method === 'POST' ? 1 : 0,
      not_send_update: no_updated_conversions || false,
      match_event: false,
      events: [],
      goals: [],
      statuses: [],
    })),
  };
}

export default function CampaignEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: campaign, isLoading, isError } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => api.getCampaign(id),
  });

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (payload) => api.updateCampaign(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['campaign', id] });
      navigate('/campaigns');
    },
  });

  async function handleSubmit(form) {
    await mutateAsync(buildPayload(form));
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/campaigns" className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Edit Campaign</h1>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading campaign…</p>}
      {isError && <p className="text-sm text-red-500">Failed to load campaign.</p>}
      {campaign && (
        <CampaignForm
          initialValues={toFormValues(campaign)}
          onSubmit={handleSubmit}
          isSubmitting={isPending}
        />
      )}
    </div>
  );
}
