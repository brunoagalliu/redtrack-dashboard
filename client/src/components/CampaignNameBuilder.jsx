import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import CopyButton from './CopyButton';
import SearchableSelect from './SearchableSelect';

// ── Inline-add dropdown ──────────────────────────────────────────────────────
function CreatableSelect({ value, onChange, items = [], onAdd, addLabel, loading }) {
  const [adding, setAdding] = useState(false);
  const [draft,  setDraft]  = useState('');

  function handleChange(e) {
    if (e.target.value === '__add__') { setAdding(true); }
    else { onChange(e.target.value); }
  }
  function commit() {
    const t = draft.trim();
    if (t) onAdd(t);
    setAdding(false); setDraft('');
  }

  if (adding) {
    return (
      <div className="flex gap-1">
        <input autoFocus type="text" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { setAdding(false); setDraft(''); } }}
          className="input flex-1 text-sm" placeholder={addLabel} />
        <button type="button" onClick={commit} className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white font-medium">Add</button>
        <button type="button" onClick={() => { setAdding(false); setDraft(''); }} className="px-2 py-1.5 text-xs rounded-md border border-gray-300 text-gray-600">✕</button>
      </div>
    );
  }
  return (
    <select value={value} onChange={handleChange} className="input" disabled={loading}>
      <option value="">{loading ? 'Loading…' : 'Select…'}</option>
      {items.map((o) => <option key={o.id} value={o.value}>{o.value}</option>)}
      <option value="__add__">＋ {addLabel}</option>
    </select>
  );
}

// ── Inline-add dropdown for partners ────────────────────────────────────────
function CreatablePartnerSelect({ value, onChange, partners = [], onAdd, loading }) {
  const [adding, setAdding] = useState(false);
  const [draft,  setDraft]  = useState('');

  function handleChange(e) {
    if (e.target.value === '__add__') { setAdding(true); }
    else { onChange(e.target.value); }
  }
  function commit() {
    const alias = draft.trim().toUpperCase();
    if (alias) onAdd(alias);
    setAdding(false); setDraft('');
  }

  if (adding) {
    return (
      <div className="flex gap-1">
        <input autoFocus type="text" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { setAdding(false); setDraft(''); } }}
          className="input flex-1 uppercase text-sm" placeholder="Partner alias e.g. NEWCO" />
        <button type="button" onClick={commit} className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white font-medium">Add</button>
        <button type="button" onClick={() => { setAdding(false); setDraft(''); }} className="px-2 py-1.5 text-xs rounded-md border border-gray-300 text-gray-600">✕</button>
      </div>
    );
  }
  return (
    <select value={value} onChange={handleChange} className="input" disabled={loading}>
      <option value="">{loading ? 'Loading…' : 'Select…'}</option>
      {partners.map((p) => <option key={p.id} value={p.alias}>{p.alias} ({p.code})</option>)}
      <option value="__add__">＋ Add new partner…</option>
    </select>
  );
}

// ── Parse a built name back into its parts ───────────────────────────────────
function parseName(name, providers, routes, verticals, partners) {
  // Strip legacy "Copy of " prefix or "_copy" suffix added by clone
  const n = name.replace(/^Copy of\s+/i, '').replace(/_copy$/i, '');
  const parts = n.split('_');

  const providerSet  = new Set(providers.map((p) => p.value));
  const routeSet     = new Set(routes.map((r) => r.value));
  const verticalSet  = new Set(verticals.map((v) => v.value));
  const partnerSet   = new Set(partners.map((p) => p.alias));
  const dateRegex    = /^\d{2}\.\d{2}$/;

  let parsedProvider = '';
  let parsedRoute    = '';
  let parsedVertical = '';
  let parsedPartner  = '';
  let parsedClickers = false;
  const listParts    = [];

  for (const part of parts) {
    if (!parsedProvider && providerSet.has(part)) { parsedProvider = part; }
    else if (!parsedRoute && routeSet.has(part))  { parsedRoute = part; }
    else if (!parsedVertical && verticalSet.has(part)) { parsedVertical = part; }
    else if (!parsedPartner && partnerSet.has(part))   { parsedPartner = part; }
    else if (part.toLowerCase() === 'clickers')   { parsedClickers = true; }
    else if (dateRegex.test(part))                { /* skip date */ }
    else                                          { listParts.push(part); }
  }

  return { provider: parsedProvider, route: parsedRoute, vertical: parsedVertical, partner: parsedPartner, clickers: parsedClickers, listName: listParts.join('_') };
}

const SIMPLIFIED_SOURCES = ['SMS - UPM', 'SMS - Ranhog'];

// ── Main component ───────────────────────────────────────────────────────────
export default function CampaignNameBuilder({ value, onChange, onUrlParams, onRoute, error, sourceName, domains = [], domainId, onDomainChange, loadingDomains }) {
  const isSimplified = SIMPLIFIED_SOURCES.includes(sourceName);
  const qc = useQueryClient();

  const { data: providers = [], isLoading: loadingProviders } = useQuery({ queryKey: ['list', 'provider'], queryFn: () => api.getList('provider') });
  const { data: routes    = [], isLoading: loadingRoutes    } = useQuery({ queryKey: ['list', 'route'],    queryFn: () => api.getList('route') });
  const { data: verticals = [], isLoading: loadingVerticals } = useQuery({ queryKey: ['list', 'vertical'], queryFn: () => api.getList('vertical') });
  const { data: partners  = [], isLoading: loadingPartners  } = useQuery({ queryKey: ['list', 'partners'], queryFn: () => api.getPartners() });

  // Can't call hooks conditionally so define all four upfront
  const addProvider = useMutation({ mutationFn: (v) => api.addListItem('provider', v), onSuccess: () => qc.invalidateQueries({ queryKey: ['list', 'provider'] }) });
  const addRoute    = useMutation({ mutationFn: (v) => api.addListItem('route', v),    onSuccess: () => qc.invalidateQueries({ queryKey: ['list', 'route'] }) });
  const addVertical = useMutation({ mutationFn: (v) => api.addListItem('vertical', v), onSuccess: () => qc.invalidateQueries({ queryKey: ['list', 'vertical'] }) });
  const addPartner  = useMutation({ mutationFn: (alias) => api.addPartner(alias),       onSuccess: () => qc.invalidateQueries({ queryKey: ['list', 'partners'] }) });

  const [provider, setProvider] = useState('');
  const [route,    setRoute]    = useState('');
  const [vertical, setVertical] = useState('');
  const [partner,  setPartner]  = useState('');
  const [clickers, setClickers] = useState(false);
  const [listName, setListName] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Prefill structured fields from an existing campaign name (e.g. after clone/edit)
  useEffect(() => {
    if (initialized || !value || loadingProviders || loadingRoutes || loadingVerticals || loadingPartners) return;
    const parsed = parseName(value, providers, routes, verticals, partners);
    if (parsed.provider) setProvider(parsed.provider);
    if (parsed.route)    setRoute(parsed.route);
    if (parsed.vertical) setVertical(parsed.vertical);
    if (parsed.partner)  setPartner(parsed.partner);
    setClickers(parsed.clickers);
    if (parsed.listName) setListName(parsed.listName);
    setInitialized(true);
  }, [value, loadingProviders, loadingRoutes, loadingVerticals, loadingPartners, initialized, providers, routes, verticals, partners]);
  const date = (() => {
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  })();

  const selectedPartner = partners.find((p) => p.alias === partner);

  function build(p, r, ve, pa, clk, ln, dt) {
    const suffix = [r, ve, pa, clk ? 'clickers' : '', ln, dt].filter(Boolean).join('_');
    return p && suffix ? `${p}_${suffix}` : '';
  }

  function buildSimplified(ve, clk, ln, dt) {
    const parts = [ve, clk ? 'clickers' : '', ln, dt].filter(Boolean);
    return ve ? parts.join('_') : '';
  }

  // Always derived from local state — never stale
  const preview = isSimplified
    ? buildSimplified(vertical, clickers, listName, date)
    : build(provider, route, vertical, partner, clickers, listName, date);
  const urlParams = isSimplified
    ? `clk=${clickers ? 1 : 0}`
    : [selectedPartner ? `sourceid=${selectedPartner.code}` : null, `clk=${clickers ? 1 : 0}`].filter(Boolean).join('&');

  // Keep form.name and urlParams in sync with local state
  useEffect(() => {
    if (preview) onChange(preview);
    if (onUrlParams) onUrlParams(urlParams);
  }, [preview, urlParams]);

  // Notify parent when route changes so it can filter/auto-select the domain
  useEffect(() => {
    if (onRoute) onRoute(route);
  }, [route]);

  return (
    <div className="space-y-4">
      {/* Simplified mode (UPM / Ranhog): Vertical only */}
      {isSimplified ? (
        <div className="max-w-xs">
          <label className="label">Vertical</label>
          <CreatableSelect value={vertical} items={verticals} loading={loadingVerticals}
            onChange={setVertical}
            onAdd={(v) => addVertical.mutate(v)} addLabel="New vertical…" />
        </div>
      ) : (
        /* Full mode: Provider · Route · Vertical · Partner */
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="label">SMS Provider</label>
            <CreatableSelect value={provider} items={providers} loading={loadingProviders}
              onChange={setProvider}
              onAdd={(v) => addProvider.mutate(v)} addLabel="New provider…" />
          </div>
          <div>
            <label className="label">Route</label>
            <CreatableSelect value={route} items={routes} loading={loadingRoutes}
              onChange={setRoute}
              onAdd={(v) => addRoute.mutate(v)} addLabel="New route…" />
          </div>
          <div>
            <label className="label">Vertical</label>
            <CreatableSelect value={vertical} items={verticals} loading={loadingVerticals}
              onChange={setVertical}
              onAdd={(v) => addVertical.mutate(v)} addLabel="New vertical…" />
          </div>
          <div>
            <label className="label">Data Partner</label>
            <CreatablePartnerSelect value={partner} partners={partners} loading={loadingPartners}
              onChange={setPartner}
              onAdd={(alias) => addPartner.mutate(alias)} />
            {selectedPartner && (
              <p className="mt-1 text-xs text-gray-400">ID: <span className="font-mono">{selectedPartner.code}</span></p>
            )}
          </div>
        </div>
      )}

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

      {/* Row 2: List Name · Clickers */}
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="label">List Name</label>
          <input type="text" value={listName}
            onChange={(e) => setListName(e.target.value)}
            className="input" placeholder="e.g. healthcare_MAR_50k_mar31_vz_13k" />
        </div>
        <div className="pb-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div className="relative">
              <input type="checkbox" checked={clickers}
                onChange={(e) => setClickers(e.target.checked)}
                className="sr-only" />
              <div className={`w-9 h-5 rounded-full transition-colors ${clickers ? 'bg-blue-600' : 'bg-gray-300'}`} />
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${clickers ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-sm text-gray-700">Clickers</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${clickers ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
              clk={clickers ? 1 : 0}
            </span>
          </label>
        </div>
      </div>

      {/* Preview */}
      {preview ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 space-y-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-500 mb-1">Campaign Name</p>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-blue-900 flex-1 break-all">{preview}</span>
              <CopyButton text={preview} />
            </div>
          </div>
          <div className="border-t border-blue-200 pt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-500 mb-1">URL Parameters</p>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-blue-800 flex-1">{urlParams}</span>
              <CopyButton text={urlParams} />
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-center">
          <p className="text-xs text-gray-400">Select a provider and at least one field to preview the name.</p>
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
