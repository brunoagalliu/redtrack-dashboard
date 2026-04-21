import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOffers, useLandings } from '../hooks/useDropdowns';
import SearchableSelect from './SearchableSelect';
import { api } from '../lib/api';

// Filter types that have API-backed option lists
const FILTER_OPTION_ENDPOINTS = {
  country: 'countries',
  region: 'regions',
  browser: 'browsers',
  os: 'os',
  device_brand: 'device_brands',
  connection_type: 'connection_types',
  languages: 'languages',
};

function FilterValueInput({ filterKey, values, onAdd, onRemove }) {
  const endpoint = FILTER_OPTION_ENDPOINTS[filterKey];
  const { data: options = [], isLoading } = useQuery({
    queryKey: ['filter-options', filterKey],
    queryFn: () => api.getFilterOptions(endpoint),
    enabled: !!endpoint,
    staleTime: 5 * 60 * 1000,
  });

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const containerRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedSet = new Set(values);

  if (endpoint) {
    const filtered = options.filter(
      (o) => !selectedSet.has(o.value) && o.label.toLowerCase().includes(query.toLowerCase())
    );

    function handleOpen() {
      setOpen(true);
      setQuery('');
      setTimeout(() => searchRef.current?.focus(), 0);
    }

    return (
      <div ref={containerRef} className="relative flex-1">
        {/* Trigger: shows chips + open button */}
        <div
          className="flex flex-wrap gap-1 items-center border border-gray-300 rounded-md px-2 py-1.5 bg-white min-h-[36px] cursor-pointer"
          onClick={handleOpen}
        >
          {values.length === 0 && (
            <span className="text-xs text-gray-400">{isLoading ? 'Loading…' : 'Select values…'}</span>
          )}
          {values.map((v) => {
            const label = options.find((o) => o.value === v)?.label || v;
            return (
              <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 font-mono shrink-0">
                {label}
                <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(v); }} className="text-blue-400 hover:text-blue-600 leading-none">×</button>
              </span>
            );
          })}
        </div>
        {/* Dropdown with search inside */}
        {open && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg">
            <div className="p-2 border-b border-gray-100">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type to search…"
                className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded outline-none focus:border-blue-400"
              />
            </div>
            <ul className="max-h-48 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-xs text-gray-400">No results</li>
              ) : (
                filtered.map((o) => (
                  <li
                    key={o.value}
                    onMouseDown={(e) => { e.preventDefault(); onAdd(o.value); }}
                    className="px-3 py-1.5 text-xs cursor-pointer hover:bg-blue-50 hover:text-blue-700 text-gray-700"
                  >
                    {o.label}
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // Free-text fallback
  function commitDraft() {
    const t = draft.trim();
    if (t) { onAdd(t); setDraft(''); }
  }

  return (
    <div className="flex flex-wrap gap-1 items-center border border-gray-300 rounded-md px-2 py-1.5 bg-white min-h-[36px] flex-1">
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 font-mono shrink-0">
          {v}
          <button type="button" onClick={() => onRemove(v)} className="text-blue-400 hover:text-blue-600 leading-none">×</button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitDraft(); } }}
        onBlur={commitDraft}
        placeholder={values.length ? '' : 'Type and press Enter…'}
        className="flex-1 min-w-[100px] text-xs outline-none bg-transparent"
      />
    </div>
  );
}

const FLOW_TYPES = [
  { value: 'offer', label: 'Offer' },
  { value: 'landing_offer', label: 'Landing > Offer' },
  { value: 'prelanding_landing_offer', label: 'Pre-Landing > Landing > Offer' },
  { value: 'template', label: 'Template' },
];

const FILTER_TYPES = [
  { key: 'country', label: 'Countries' },
  { key: 'region', label: 'Regions' },
  { key: 'city', label: 'Cities' },
  { key: 'isp', label: 'ISP' },
  { key: 'browser', label: 'Browser' },
  { key: 'browser_version', label: 'Browser version' },
  { key: 'os', label: 'OS' },
  { key: 'os_version', label: 'OS version' },
  { key: 'device_brand', label: 'Device brand' },
  { key: 'device_model', label: 'Device model' },
  { key: 'ip', label: 'IP' },
  { key: 'device_type', label: 'Device type' },
  { key: 'connection_type', label: 'Connection type' },
  { key: 'languages', label: 'Languages' },
];

function FilterRow({ filterKey, label, filter, onChange, onRemove, onAddValue, onRemoveValue }) {
  return (
    <div className="grid grid-cols-[120px_110px_1fr_32px] gap-2 items-start">
      <span className="text-sm text-gray-700 font-medium pt-2">{label}</span>
      <select
        value={filter.exclude ? 'exclude' : 'include'}
        onChange={(e) => onChange({ exclude: e.target.value === 'exclude' })}
        className="input text-xs"
      >
        <option value="include">Include</option>
        <option value="exclude">Exclude</option>
      </select>
      <FilterValueInput
        filterKey={filterKey}
        values={filter.values || []}
        onAdd={onAddValue}
        onRemove={onRemoveValue}
      />
      <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-500 p-1 mt-1">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function FilterBuilder({ filters = {}, onChange }) {
  const [open, setOpen] = useState(false);

  const activeFilters = Object.entries(filters);
  const usedKeys = new Set(Object.keys(filters));
  const availableTypes = FILTER_TYPES.filter((t) => !usedKeys.has(t.key));

  function addFilter(key) {
    if (!key) return;
    onChange({ ...filters, [key]: { exclude: false, values: [] } });
  }

  function removeFilter(key) {
    const updated = { ...filters };
    delete updated[key];
    onChange(updated);
  }

  function updateFilter(key, update) {
    onChange({ ...filters, [key]: { ...filters[key], ...update } });
  }

  function addValue(key, value) {
    const trimmed = value.trim();
    if (!trimmed) return;
    const existing = filters[key]?.values || [];
    if (existing.includes(trimmed)) return;
    updateFilter(key, { values: [...existing, trimmed] });
  }

  function removeValue(key, value) {
    updateFilter(key, { values: (filters[key]?.values || []).filter((v) => v !== value) });
  }

  return (
    <div className="border-t border-gray-200">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold w-full rounded-b-lg transition-colors ${
          activeFilters.length > 0 ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        FILTERS({activeFilters.length})
        <svg className={`w-3.5 h-3.5 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="p-4 space-y-4 bg-gray-50 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <select
              value=""
              onChange={(e) => { addFilter(e.target.value); e.target.value = ''; }}
              className="input max-w-xs text-sm"
              disabled={availableTypes.length === 0}
            >
              <option value="">Add filter…</option>
              {availableTypes.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>

          {activeFilters.length > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-[120px_110px_1fr_32px] gap-2 text-xs font-medium text-gray-400 uppercase tracking-wider px-1">
                <span>Filter by</span>
                <span>Type</span>
                <span>Values</span>
                <span />
              </div>
              {activeFilters.map(([key, filter]) => {
                const typeLabel = FILTER_TYPES.find((t) => t.key === key)?.label || key;
                return (
                  <FilterRow
                    key={key}
                    filterKey={key}
                    label={typeLabel}
                    filter={filter}
                    onChange={(update) => updateFilter(key, update)}
                    onRemove={() => removeFilter(key)}
                    onAddValue={(v) => addValue(key, v)}
                    onRemoveValue={(v) => removeValue(key, v)}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OfferRow({ offer, index, onChange, onRemove }) {
  const { data: offers = [], isLoading } = useOffers();

  return (
    <div className="flex items-center gap-2 py-2">
      <span className="text-xs text-gray-400 w-4">{index + 1}</span>
      <div className="flex-1">
        <SearchableSelect
          options={offers.map((o) => ({ value: o.id, label: o.name || o.title }))}
          value={offer.offer_id || ''}
          onChange={(v) => onChange({ ...offer, offer_id: v })}
          placeholder="Select offer…"
          disabled={isLoading}
        />
      </div>
      <div className="w-28">
        <input
          type="number"
          min={1}
          max={100}
          value={offer.weight ?? 100}
          onChange={(e) => onChange({ ...offer, weight: Number(e.target.value) })}
          className="input text-center"
          placeholder="Weight"
        />
      </div>
      <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-500 p-1">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function LandingRow({ landing, onChange, onRemove, label }) {
  const { data: landings = [], isLoading } = useLandings();

  return (
    <div className="flex items-center gap-2 py-2">
      <span className="text-xs text-gray-400 w-20 shrink-0">{label}</span>
      <div className="flex-1">
        <SearchableSelect
          options={landings.map((l) => ({ value: l.id, label: l.name || l.title }))}
          value={landing.landing_id || ''}
          onChange={(v) => onChange({ ...landing, landing_id: v })}
          placeholder="Select landing…"
          disabled={isLoading}
        />
      </div>
      <div className="w-28">
        <input
          type="number"
          min={1}
          max={100}
          value={landing.weight ?? 100}
          onChange={(e) => onChange({ ...landing, weight: Number(e.target.value) })}
          className="input text-center"
          placeholder="Weight"
        />
      </div>
      <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-500 p-1">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function FunnelCard({ funnel, index, onChange, onRemove }) {
  function updateFlow(flow) {
    onChange({ ...funnel, flow, offers: [], landings: [], pre_landings: [] });
  }

  function addOffer() {
    onChange({ ...funnel, offers: [...(funnel.offers || []), { offer_id: '', weight: 100 }] });
  }

  function updateOffer(i, val) {
    const offers = [...funnel.offers];
    offers[i] = val;
    onChange({ ...funnel, offers });
  }

  function removeOffer(i) {
    onChange({ ...funnel, offers: funnel.offers.filter((_, idx) => idx !== i) });
  }

  function addLanding(type = 'landings') {
    onChange({ ...funnel, [type]: [...(funnel[type] || []), { landing_id: '', weight: 100 }] });
  }

  function updateLanding(type, i, val) {
    const items = [...(funnel[type] || [])];
    items[i] = val;
    onChange({ ...funnel, [type]: items });
  }

  function removeLanding(type, i) {
    onChange({ ...funnel, [type]: funnel[type].filter((_, idx) => idx !== i) });
  }

  const showLandings = funnel.flow === 'landing_offer' || funnel.flow === 'prelanding_landing_offer';
  const showPreLandings = funnel.flow === 'prelanding_landing_offer';

  return (
    <div className="border border-gray-200 rounded-lg">
      {/* Funnel header */}
      <div className="flex items-center gap-3 bg-gray-50 px-4 py-3 border-b border-gray-200 rounded-t-lg">
        <span className="text-sm font-medium text-gray-700">Funnel #{index + 1}</span>
        <input
          type="text"
          value={funnel.label || ''}
          onChange={(e) => onChange({ ...funnel, label: e.target.value })}
          placeholder="Funnel label"
          className="input w-40 text-sm"
        />
        <div className="flex items-center gap-1 ml-auto">
          <label className="label mb-0 mr-1">Weight</label>
          <input
            type="number"
            min={1}
            max={100}
            value={funnel.weight ?? 100}
            onChange={(e) => onChange({ ...funnel, weight: Number(e.target.value) })}
            className="input w-20 text-center"
          />
          <button type="button" onClick={onRemove} className="ml-2 text-gray-400 hover:text-red-500 p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Flow type tabs */}
        <div className="flex gap-1 border-b border-gray-200 pb-3">
          {FLOW_TYPES.map((ft) => (
            <button
              key={ft.value}
              type="button"
              onClick={() => updateFlow(ft.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                funnel.flow === ft.value
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {ft.label}
            </button>
          ))}
        </div>

        {/* Pre-landings */}
        {showPreLandings && (
          <div>
            <p className="section-title">Pre-Landings</p>
            <div className="divide-y divide-gray-100">
              {(funnel.pre_landings || []).map((l, i) => (
                <LandingRow
                  key={i}
                  landing={l}
                  label="Pre-landing"
                  onChange={(val) => updateLanding('pre_landings', i, val)}
                  onRemove={() => removeLanding('pre_landings', i)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => addLanding('pre_landings')}
              className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Pre-Landing
            </button>
          </div>
        )}

        {/* Landings */}
        {showLandings && (
          <div>
            <p className="section-title">Landings</p>
            <div className="divide-y divide-gray-100">
              {(funnel.landings || []).map((l, i) => (
                <LandingRow
                  key={i}
                  landing={l}
                  label="Landing"
                  onChange={(val) => updateLanding('landings', i, val)}
                  onRemove={() => removeLanding('landings', i)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => addLanding('landings')}
              className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Landing
            </button>
          </div>
        )}

        {/* Offers */}
        <div>
          <p className="section-title">Offers</p>
          <div className="divide-y divide-gray-100">
            {(funnel.offers || []).map((o, i) => (
              <OfferRow
                key={i}
                offer={o}
                index={i}
                onChange={(val) => updateOffer(i, val)}
                onRemove={() => removeOffer(i)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={addOffer}
            className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Offer
          </button>
        </div>

        {/* Smart traffic distribution */}
        <label className="flex items-center gap-2 cursor-pointer">
          <div className="relative">
            <input
              type="checkbox"
              checked={funnel.smart_traffic ?? false}
              onChange={(e) => onChange({ ...funnel, smart_traffic: e.target.checked })}
              className="sr-only"
            />
            <div className={`w-9 h-5 rounded-full transition-colors ${funnel.smart_traffic ? 'bg-blue-600' : 'bg-gray-300'}`} />
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${funnel.smart_traffic ? 'translate-x-4' : ''}`} />
          </div>
          <span className="text-xs text-gray-600">Smart traffic distribution</span>
        </label>
      </div>

      {/* Filters */}
      <FilterBuilder
        filters={funnel.filters || {}}
        onChange={(f) => onChange({ ...funnel, filters: f })}
      />
    </div>
  );
}

export default function FunnelBuilder({ funnels, onChange }) {
  function addFunnel() {
    onChange([
      ...funnels,
      { label: '', weight: 100, flow: 'offer', offers: [{ offer_id: '', weight: 100 }], landings: [], pre_landings: [], smart_traffic: false, filters: {} },
    ]);
  }

  function updateFunnel(i, val) {
    const updated = [...funnels];
    updated[i] = val;
    onChange(updated);
  }

  function removeFunnel(i) {
    onChange(funnels.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-4">
      {funnels.map((f, i) => (
        <FunnelCard
          key={i}
          funnel={f}
          index={i}
          onChange={(val) => updateFunnel(i, val)}
          onRemove={() => removeFunnel(i)}
        />
      ))}
      <button
        type="button"
        onClick={addFunnel}
        className="btn-secondary w-full justify-center"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Funnel
      </button>
    </div>
  );
}
