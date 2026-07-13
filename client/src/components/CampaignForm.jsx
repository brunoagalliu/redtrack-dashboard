import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDomains, useSources } from '../hooks/useDropdowns';
import FunnelBuilder from './FunnelBuilder';
import PostbackConfig from './PostbackConfig';
import CampaignNameBuilder from './CampaignNameBuilder';
import SearchableSelect from './SearchableSelect';
import { api } from '../lib/api';

const COST_TYPES = ['CPC', 'CPA', 'CPM', 'POPCPM', 'REVSHARE', 'DONOTTRACK'];
const REDIRECT_TYPES = [
  { value: '302', label: 'Regular redirect (http/s 302)' },
  { value: '301', label: 'Permanent redirect (http/s 301)' },
  { value: 'meta', label: 'Meta refresh' },
  { value: 'js', label: 'JavaScript redirect' },
  { value: 'double', label: 'Double meta refresh' },
];
const TRACKING_TYPES = ['REDIRECT', 'UNIVERSAL_SCRIPT', 'NO_REDIRECT', 'IMPRESSIONS', 'LANDING_PAGE_VIEW'];

const DEFAULT_FUNNEL = {
  label: '',
  weight: 100,
  flow: 'offer',
  offers: [{ offer_id: '', weight: 100 }],
  landings: [],
  pre_landings: [],
  smart_traffic: false,
  filters: {},
};

function defaultForm() {
  return {
    name: '',
    traffic_source_id: '',
    domain_id: '',
    cost_type: 'CPC',
    cost_value: 0,
    tracking_type: 'REDIRECT',
    redirect_type: '302',
    rsoc: false,
    funnels: [{ ...DEFAULT_FUNNEL }],
    tags: '',
    notes: '',
    postbacks: [{ _key: 1, url: 'https://api.smsapp.co/conversion/?click-id={ref_id}&payout={offer_payout}', payout_type: 'percentage', payout_value: 100, method: 'GET', no_updated_conversions: false, conditional: false }],
    urlParams: '',
  };
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex border-b border-gray-200 mb-6">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
            active === t.id
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function TagInput({ value, onChange }) {
  const [input, setInput] = useState('');
  const inputRef = useRef(null);

  const { data: allTags = [] } = useQuery({
    queryKey: ['campaign-tags'],
    queryFn: () => api.getCampaignTags(),
    staleTime: 5 * 60 * 1000,
  });

  const current = value ? value.split(',').map((t) => t.trim()).filter(Boolean) : [];
  const currentSet = new Set(current.map((t) => t.toLowerCase()));

  const suggestions = allTags.filter((t) => {
    if (currentSet.has(t.toLowerCase())) return false;
    if (input.trim()) return t.toLowerCase().includes(input.toLowerCase());
    return true;
  });

  function addTag(tag) {
    const trimmed = tag.trim();
    if (!trimmed || currentSet.has(trimmed.toLowerCase())) return;
    onChange([...current, trimmed].join(', '));
    setInput('');
  }

  function removeTag(tag) {
    onChange(current.filter((t) => t !== tag).join(', '));
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && current.length) {
      removeTag(current[current.length - 1]);
    }
  }

  return (
    <div>
      <label className="label">Tags</label>

      {/* Selected tags + text input */}
      <div
        className="input flex flex-wrap gap-1.5 min-h-[38px] cursor-text p-1.5"
        onClick={() => inputRef.current?.focus()}
      >
        {current.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium">
            {tag}
            <button type="button" onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
              className="text-indigo-400 hover:text-indigo-700 leading-none">✕</button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="border-none outline-none text-sm flex-1 min-w-[120px] bg-transparent p-0.5"
          placeholder={current.length ? 'Add more…' : 'Type a tag or pick below…'}
        />
      </div>

      {/* Always-visible suggestions */}
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((tag) => (
            <button key={tag} type="button" onClick={() => addTag(tag)}
              className="px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-600 hover:bg-indigo-100 hover:text-indigo-700 transition-colors">
              + {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CampaignForm({ initialValues, onSubmit, isSubmitting }) {
  const [form, setForm] = useState(() => initialValues || defaultForm());
  const [tab, setTab] = useState('details');
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const { data: sources = [], isLoading: loadingSources } = useSources();
  const { data: domains = [], isLoading: loadingDomains } = useDomains();

  // Auto-select the only available source so the dropdown shows it pre-filled
  useEffect(() => {
    if (sources.length === 1 && !form.traffic_source_id) {
      set('traffic_source_id', sources[0].id);
    }
  }, [sources.length, sources[0]?.id]);

  useEffect(() => {
    if (domains.length === 1 && String(form.domain_id) !== String(domains[0].id)) {
      set('domain_id', domains[0].id);
    }
  }, [domains.length === 1 ? domains[0]?.id : null]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function validate() {
    const errors = {};

    if (!form.name.trim()) {
      errors.name = 'Campaign name is required.';
    }

    if (!form.funnels || form.funnels.length === 0) {
      errors.funnels = 'At least one funnel is required.';
    } else {
      const badFunnels = form.funnels
        .map((f, i) => {
          const hasOffer = (f.offers || []).some((o) => o.offer_id);
          return hasOffer ? null : i + 1;
        })
        .filter(Boolean);

      if (badFunnels.length > 0) {
        errors.funnels = `Funnel${badFunnels.length > 1 ? 's' : ''} #${badFunnels.join(', #')} ${badFunnels.length > 1 ? 'are' : 'is'} missing at least one offer.`;
      }
    }

    return errors;
  }

  async function handleSubmit(e) {
    e.preventDefault();

    // If Enter was pressed on a non-final tab, advance instead of submitting
    if (tab !== 'funnels') {
      setTab(tab === 'details' ? 'postback' : 'funnels');
      return;
    }

    setError(null);
    setFieldErrors({});

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      if (errors.name) setTab('details');
      else if (errors.funnels) setTab('funnels');
      return;
    }

    try {
      await onSubmit(form);
    } catch (err) {
      setError(err.message);
    }
  }

  const selectedSource = sources.find((s) => String(s.id) === String(form.traffic_source_id));

  const TABS = [
    { id: 'details', label: 'Campaign Details' },
    { id: 'postback', label: 'Tags & Postback' },
    { id: 'funnels', label: 'Funnels' },
  ];

  return (
    <form onSubmit={handleSubmit}>
      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {/* ── CAMPAIGN DETAILS TAB ── */}
      {tab === 'details' && (
        <div className="grid grid-cols-1 gap-6">
          {/* Template */}
          <div className="card p-6">
            <p className="section-title">Template</p>
            <div className="max-w-xs">
              <label className="label">Traffic Channel</label>
              <SearchableSelect
                options={sources.map((s) => ({ value: s.id, label: s.name || s.title }))}
                value={form.traffic_source_id}
                onChange={(v) => set('traffic_source_id', v)}
                placeholder={loadingSources ? 'Loading…' : 'Select traffic channel'}
                disabled={loadingSources}
              />
            </div>
          </div>

          {/* General */}
          <div className="card p-6">
            <p className="section-title">General</p>
            <div className="space-y-4">
              <CampaignNameBuilder
                value={form.name}
                onChange={(v) => { set('name', v); setFieldErrors((fe) => ({ ...fe, name: undefined })); }}
                onUrlParams={(p) => set('urlParams', p)}
                error={fieldErrors.name}
                domains={domains}
                domainId={form.domain_id}
                onDomainChange={(v) => set('domain_id', v)}
                loadingDomains={loadingDomains}
              />

              {/* Cost model */}
              <div>
                <label className="label">Campaign Cost</label>
                <div className="flex gap-1 mb-3">
                  {COST_TYPES.map((ct) => (
                    <button
                      key={ct}
                      type="button"
                      onClick={() => set('cost_type', ct)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                        form.cost_type === ct
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {ct}
                    </button>
                  ))}
                </div>
                {form.cost_type !== 'DONOTTRACK' && (
                  <div className="flex items-center gap-2 w-48">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.cost_value}
                      onChange={(e) => set('cost_value', e.target.value)}
                      className="input"
                      placeholder="0.00"
                    />
                    <span className="text-sm text-gray-500">$</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tracking links */}
          <div className="card p-6">
            <p className="section-title">Tracking links and parameters</p>
            <div className="flex gap-1 mb-4">
              {TRACKING_TYPES.map((tt) => (
                <button
                  key={tt}
                  type="button"
                  onClick={() => set('tracking_type', tt)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    form.tracking_type === tt
                      ? 'bg-gray-700 text-white border-gray-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {tt.replace('_', ' ')}
                </button>
              ))}
            </div>
            <div className="bg-gray-50 rounded-md px-3 py-2 text-xs text-gray-400 font-mono border border-gray-200">
              Click URL will be generated after campaign creation
            </div>
            <label className="flex items-center gap-2 cursor-pointer mt-3">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={form.rsoc}
                  onChange={(e) => set('rsoc', e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-9 h-5 rounded-full transition-colors ${form.rsoc ? 'bg-blue-600' : 'bg-gray-300'}`} />
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.rsoc ? 'translate-x-4' : ''}`} />
              </div>
              <span className="text-xs text-gray-600">RSOC</span>
            </label>
          </div>

          {/* Tracking options */}
          <div className="card p-6">
            <p className="section-title">Tracking options</p>
            <div>
              <label className="label">Redirect type</label>
              <select
                value={form.redirect_type}
                onChange={(e) => set('redirect_type', e.target.value)}
                className="input max-w-sm"
              >
                {REDIRECT_TYPES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── FUNNELS TAB ── */}
      {tab === 'funnels' && (
        <div className="card p-6">
          <p className="section-title">Funnels</p>
          {fieldErrors.funnels && (
            <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {fieldErrors.funnels}
            </div>
          )}
          <FunnelBuilder
            funnels={form.funnels}
            onChange={(f) => { set('funnels', f); setFieldErrors((fe) => ({ ...fe, funnels: undefined })); }}
          />
        </div>
      )}

      {/* ── TAGS & POSTBACK TAB ── */}
      {tab === 'postback' && (
        <div className="space-y-6">
          <div className="card p-6">
            <p className="section-title">Tags and notes</p>
            <div className="space-y-4">
              <TagInput value={form.tags} onChange={(v) => set('tags', v)} />
              <div>
                <label className="label">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  className="input min-h-[80px] resize-y"
                  placeholder="Optional notes…"
                />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <p className="section-title">S2S Postbacks</p>
            <PostbackConfig
              postbacks={form.postbacks}
              onChange={(p) => set('postbacks', p)}
              sourceName={selectedSource?.name}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
        <div className="flex gap-2">
          {tab !== 'details' && (
            <button
              type="button"
              onClick={() => setTab(tab === 'funnels' ? 'postback' : 'details')}
              className="btn-secondary"
            >
              Back
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {tab !== 'funnels' ? (
            <button
              key="next"
              type="button"
              onClick={() => setTab(tab === 'details' ? 'postback' : 'funnels')}
              className="btn-primary"
            >
              Next
            </button>
          ) : (
            <button key="submit" type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Saving…' : initialValues ? 'Update Campaign' : 'Create Campaign'}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
