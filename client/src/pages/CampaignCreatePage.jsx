import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import CampaignForm from '../components/CampaignForm';

const REDIRECT_TYPE_MAP = { '302': 1, '301': 2, meta: 3, js: 4, double: 5 };
const COST_VALUE_FIELDS = { CPC: 'cpc', CPM: 'cpm', CPA: 'cpa', POPCPM: 'popcpm', REVSHARE: 'rev_share' };

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
      weight: f.weight,
      optimization: { is_enabled: f.smart_traffic || false },
      stream: {
        title: f.label || '',
        offers: f.offers.filter((o) => o.offer_id).map((o) => ({ id: o.offer_id, weight: o.weight })),
        landings: (f.landings || []).filter((l) => l.landing_id).map((l) => ({ id: l.landing_id, weight: l.weight })),
        prelandings: (f.pre_landings || []).filter((l) => l.landing_id).map((l) => ({ id: l.landing_id, weight: l.weight })),
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

export default function CampaignCreatePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { mutateAsync, isPending } = useMutation({
    mutationFn: (payload) => api.createCampaign(payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      navigate(`/campaigns/${data.id}`);
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
        <h1 className="text-xl font-semibold text-gray-900">New Campaign</h1>
      </div>
      <CampaignForm onSubmit={handleSubmit} isSubmitting={isPending} />
    </div>
  );
}
