import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import CopyButton from './CopyButton';
import SearchableSelect from './SearchableSelect';

// ── Inline-add/manage dropdown ────────────────────────────────────────────────
function CreatableSelect({ value, onChange, items = [], onAdd, onDelete, addLabel, loading }) {
  const [mode,  setMode]  = useState('idle'); // idle | adding | managing
  const [draft, setDraft] = useState('');

  function handleChange(e) {
    if (e.target.value === '__add__')    { setMode('adding'); }
    else if (e.target.value === '__manage__') { setMode('managing'); }
    else onChange(e.target.value);
  }
  function commit() {
    const t = draft.trim();
    if (t) onAdd(t);
    setMode('idle'); setDraft('');
  }

  if (mode === 'adding') {
    return (
      <div className="flex gap-1">
        <input autoFocus type="text" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { setMode('idle'); setDraft(''); } }}
          className="input flex-1 text-sm" placeholder={addLabel} />
        <button type="button" onClick={commit} className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white font-medium">Add</button>
        <button type="button" onClick={() => { setMode('idle'); setDraft(''); }} className="px-2 py-1.5 text-xs rounded-md border border-gray-300 text-gray-600">✕</button>
      </div>
    );
  }

  if (mode === 'managing') {
    return (
      <div className="border border-gray-200 rounded-md bg-white">
        <div className="max-h-40 overflow-y-auto divide-y divide-gray-100">
          {items.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-400">No items yet.</p>
          )}
          {items.map((o) => (
            <div key={o.id} className="flex items-center justify-between px-3 py-1.5">
              <span className="text-sm text-gray-700">{o.value}</span>
              <button type="button" onClick={() => { if (value === o.value) onChange(''); onDelete(o.id); }}
                className="text-gray-400 hover:text-red-500 transition-colors text-xs font-bold leading-none ml-2">✕</button>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-200 px-3 py-1.5">
          <button type="button" onClick={() => setMode('idle')} className="text-xs text-gray-500 hover:text-gray-700">← Done</button>
        </div>
      </div>
    );
  }

  return (
    <select value={value} onChange={handleChange} className="input" disabled={loading}>
      <option value="">{loading ? 'Loading…' : 'Select…'}</option>
      {items.map((o) => <option key={o.id} value={o.value}>{o.value}</option>)}
      <option value="__add__">＋ {addLabel}</option>
      {items.length > 0 && <option value="__manage__">✏ Manage / delete…</option>}
    </select>
  );
}

// ── Traffic source constants ──────────────────────────────────────────────────
const BUYERS = ['TK', 'MA', 'DS'];

// Self-routing sources: selecting them auto-sets the name segment; no sub-picker
const SELF_ROUTING = { UPM: 'USMS', Ranhog: 'Ranhog', TechStar: 'TechStar' };
const SELF_ROUTING_VALUES = new Set(Object.values(SELF_ROUTING));
const TRAFFIC_SOURCES = ['UPM', 'Ranhog', 'TechStar', 'Internal'];

// ── Parse an existing campaign name back into its parts ───────────────────────
function parseName(name, sources, verticals) {
  const n = name.replace(/^Copy of\s+/i, '').replace(/[_\s]*-?\s*copy\s*$/i, '').trim();

  const dashIdx = n.indexOf(' - ');
  let buyer = '';
  let rest  = n;
  if (dashIdx !== -1) {
    const prefix = n.slice(0, dashIdx).trim();
    if (BUYERS.includes(prefix)) buyer = prefix;
    rest = n.slice(dashIdx + 3).trim();
  }

  const sourceSet   = new Set(sources.map((s) => s.value));
  const verticalSet = new Set(verticals.map((v) => v.value));
  const dateRegex   = /^\d{2}\.\d{2}$/;
  // Size token like 34k, 17k, 100k — signals end of list name, not a partner
  const sizeRegex   = /^\d+k$/i;

  const parts     = rest.split('_');
  let rawSource   = '';
  let vertical    = '';
  let partner     = '';
  let listStarted = false;
  const listParts = [];

  for (const part of parts) {
    if (!rawSource  && sourceSet.has(part))      { rawSource = part; }
    else if (!vertical && verticalSet.has(part)) { vertical = part; }
    else if (!listStarted && !sizeRegex.test(part) && /^[A-Z0-9]+$/.test(part) && part.length <= 10 && !dateRegex.test(part)) {
      // Short all-caps token before the list content is likely a partner alias
      partner = part; listStarted = true;
    }
    else if (dateRegex.test(part))               { /* skip trailing date */ }
    else                                         { listParts.push(part); listStarted = true; }
  }

  // Map raw source back to trafficSource + route
  let trafficSource = '';
  let route = '';
  if (rawSource === 'USMS')          { trafficSource = 'UPM'; }
  else if (rawSource === 'Ranhog')   { trafficSource = 'Ranhog'; }
  else if (rawSource === 'TechStar') { trafficSource = 'TechStar'; }
  else if (rawSource)                { trafficSource = 'Internal'; route = rawSource; }

  return { buyer, trafficSource, route, vertical, partner, listName: listParts.join('_') };
}

function todayStr() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CampaignNameBuilder({ value, onChange, onUrlParams, onRoute, error, domains = [], domainId, onDomainChange, loadingDomains }) {
  const qc = useQueryClient();

  const { data: sources   = [], isLoading: loadingSources   } = useQuery({ queryKey: ['list', 'route'],    queryFn: () => api.getList('route') });
  const { data: verticals = [], isLoading: loadingVerticals } = useQuery({ queryKey: ['list', 'vertical'], queryFn: () => api.getList('vertical') });

  // All partners loaded once for auto-detection
  const { data: allPartnersData = { content: [] } } = useQuery({
    queryKey: ['partners', '__all__'],
    queryFn: () => api.searchDataSources('', 0, 200, 'name,asc', 'name'),
    staleTime: 5 * 60 * 1000,
  });
  const allPartners = (allPartnersData.content || []).map((p) => p.name);
  const allPartnerSet = new Set(allPartners.map((n) => n.toLowerCase()));

  // Separate search state for the manual dropdown fallback
  const [partnerSearch, setPartnerSearch] = useState('');
  const [debouncedPartnerSearch, setDebouncedPartnerSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedPartnerSearch(partnerSearch), 400);
    return () => clearTimeout(t);
  }, [partnerSearch]);
  const { data: searchPartnersData = { content: [] }, isLoading: loadingPartners } = useQuery({
    queryKey: ['partners', debouncedPartnerSearch],
    queryFn: () => api.searchDataSources(debouncedPartnerSearch, 0, 50, 'name,asc', 'name'),
    enabled: !!debouncedPartnerSearch,
  });
  const searchPartners = (searchPartnersData.content || []).map((p) => ({ label: p.name, value: p.name }));

  const [partnerAutoDetected, setPartnerAutoDetected] = useState(false);

  const addSource      = useMutation({ mutationFn: (v)  => api.addListItem('route', v),       onSuccess: () => qc.invalidateQueries({ queryKey: ['list', 'route'] }) });
  const deleteSource   = useMutation({ mutationFn: (id) => api.deleteListItem('route', id),   onSuccess: () => qc.invalidateQueries({ queryKey: ['list', 'route'] }) });
  const addVertical    = useMutation({ mutationFn: (v)  => api.addListItem('vertical', v),    onSuccess: () => qc.invalidateQueries({ queryKey: ['list', 'vertical'] }) });
  const deleteVertical = useMutation({ mutationFn: (id) => api.deleteListItem('vertical', id), onSuccess: () => qc.invalidateQueries({ queryKey: ['list', 'vertical'] }) });

  const [buyer,         setBuyer]         = useState('');
  const [trafficSource, setTrafficSource] = useState('');
  const [route,         setRoute]         = useState('');
  const [vertical,      setVertical]      = useState('');
  const [partner,       setPartner]       = useState('');
  const [listName,      setListName]      = useState('');
  const [date,          setDate]          = useState(todayStr);
  const [initialized,   setInitialized]   = useState(false);

  // Derived: the segment that goes into the campaign name
  const nameSource = trafficSource in SELF_ROUTING
    ? SELF_ROUTING[trafficSource]
    : (trafficSource === 'Internal' ? route : '');

  // Pre-fill from existing campaign name (edit mode)
  useEffect(() => {
    if (initialized || !value || loadingSources || loadingVerticals) return;
    const parsed = parseName(value, sources, verticals);
    if (parsed.buyer)         setBuyer(parsed.buyer);
    if (parsed.trafficSource) setTrafficSource(parsed.trafficSource);
    if (parsed.route)         setRoute(parsed.route);
    if (parsed.vertical)      setVertical(parsed.vertical);
    if (parsed.partner)       { setPartner(parsed.partner); setPartnerAutoDetected(false); }
    if (parsed.listName)      setListName(parsed.listName);
    setInitialized(true);
  }, [value, loadingSources, loadingVerticals, initialized, sources, verticals]);

  // Auto-detect partner from list name tokens (only when not manually overridden)
  useEffect(() => {
    if (!initialized || allPartners.length === 0) return;
    // Don't overwrite a manually chosen partner
    if (partner && !partnerAutoDetected) return;
    const tokens = listName.toLowerCase().split('_');
    const match = tokens.find((t) => allPartnerSet.has(t));
    if (match) {
      const canonical = allPartners.find((n) => n.toLowerCase() === match);
      if (canonical && canonical !== partner) {
        setPartner(canonical);
        setPartnerAutoDetected(true);
      }
    } else if (partnerAutoDetected) {
      // List name changed and no longer contains the partner — clear it
      setPartner('');
      setPartnerAutoDetected(false);
    }
  }, [listName, allPartners.length]);

  // Build the campaign name from parts — partner is categorization only, not in the name
  const suffix = [nameSource, vertical, listName, date].filter(Boolean).join('_');
  const preview = buyer
    ? (suffix ? `${buyer} - ${suffix}` : buyer)
    : '';

  // Keep parent form in sync
  useEffect(() => {
    if (preview) onChange(preview);
  }, [preview]);

  // Notify parent when effective route changes (used for domain auto-select)
  useEffect(() => {
    if (onRoute) onRoute(nameSource);
  }, [nameSource]);

  // URL params — include partner sourceid (= partner name) when selected
  useEffect(() => {
    if (!onUrlParams) return;
    const parts = ['clk=0'];
    if (partner) parts.push(`sourceid=${partner}`);
    onUrlParams(parts.join('&'));
  }, [partner]);

  return (
    <div className="space-y-4">

      {/* 1. Media Buyer */}
      <div>
        <label className="label">Media Buyer *</label>
        <div className="flex gap-2">
          {BUYERS.map((b) => (
            <button key={b} type="button" onClick={() => setBuyer(buyer === b ? '' : b)}
              className={`px-5 py-2 rounded-md text-sm font-semibold border-2 transition-colors ${
                buyer === b
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'
              }`}>
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Traffic Source */}
      <div>
        <label className="label">Traffic Source</label>
        <div className="flex gap-2 flex-wrap">
          {TRAFFIC_SOURCES.map((ts) => (
            <button key={ts} type="button"
              onClick={() => {
                setTrafficSource(trafficSource === ts ? '' : ts);
                setRoute('');
              }}
              className={`px-4 py-2 rounded-md text-sm font-semibold border-2 transition-colors ${
                trafficSource === ts
                  ? 'bg-violet-600 border-violet-600 text-white'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-violet-300'
              }`}>
              {ts}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Route sub-picker — only for Internal */}
      {trafficSource === 'Internal' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Route</label>
            <CreatableSelect
              value={route}
              items={sources.filter((s) => !SELF_ROUTING_VALUES.has(s.value))}
              loading={loadingSources}
              onChange={setRoute}
              onAdd={(v) => addSource.mutate(v)}
              onDelete={(id) => deleteSource.mutate(id)}
              addLabel="Add new route…"
            />
          </div>
          <div>
            <label className="label">Vertical</label>
            <CreatableSelect value={vertical} items={verticals} loading={loadingVerticals}
              onChange={setVertical}
              onAdd={(v) => addVertical.mutate(v)}
              onDelete={(id) => deleteVertical.mutate(id)}
              addLabel="Add new vertical…" />
          </div>
        </div>
      )}

      {/* Vertical (when not Internal — Internal shows it inline above) */}
      {trafficSource !== 'Internal' && (
        <div className="max-w-xs">
          <label className="label">Vertical</label>
          <CreatableSelect value={vertical} items={verticals} loading={loadingVerticals}
            onChange={setVertical}
            onAdd={(v) => addVertical.mutate(v)}
            onDelete={(id) => deleteVertical.mutate(id)}
            addLabel="Add new vertical…" />
        </div>
      )}

      {/* 4. Data Partner */}
      <div className="max-w-xs">
        <label className="label">Data Partner</label>
        {partnerAutoDetected ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-50 border border-emerald-200">
            <span className="text-sm font-medium text-emerald-800 flex-1">{partner}</span>
            <span className="text-xs text-emerald-500 shrink-0">auto-detected</span>
            <button type="button" onClick={() => { setPartner(''); setPartnerAutoDetected(false); }}
              className="text-emerald-400 hover:text-red-500 text-xs leading-none ml-1">✕</button>
          </div>
        ) : (
          <SearchableSelect
            options={searchPartners}
            value={partner}
            onChange={(v) => { setPartner(v); setPartnerAutoDetected(false); }}
            placeholder={loadingPartners ? 'Loading…' : 'Search partner…'}
            onQueryChange={setPartnerSearch}
          />
        )}
      </div>

      {/* 5–6. List Name + Date */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="label">List Name</label>
          <input type="text" value={listName} onChange={(e) => setListName(e.target.value)}
            className="input" placeholder="e.g. kn_billing_sweeps_att_mar2026_34k" />
        </div>
        <div>
          <label className="label">Date</label>
          <input type="text" value={date} onChange={(e) => setDate(e.target.value)}
            className="input font-mono" placeholder="MM.DD" />
        </div>
      </div>

      {/* Domain */}
      <div className="max-w-xs">
        <label className="label">Domain</label>
        <SearchableSelect
          options={domains.map((d) => ({ value: d.id, label: d.url || d.domain || d.name }))}
          value={domainId || ''}
          onChange={onDomainChange}
          placeholder="Select domain"
          disabled={loadingDomains}
        />
      </div>

      {/* Preview */}
      {preview ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-500 mb-1">Campaign Name</p>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-blue-900 flex-1 break-all">{preview}</span>
            <CopyButton text={preview} />
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-center">
          <p className="text-xs text-gray-400">Select a media buyer to start building the name.</p>
        </div>
      )}

      {/* Editable name field */}
      <div>
        <label className="label">Campaign Name *</label>
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          className={`input font-mono text-sm ${error ? 'border-red-400 focus:border-red-400' : ''}`}
          placeholder="Or type manually" />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
