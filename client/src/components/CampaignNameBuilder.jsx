import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import CopyButton from './CopyButton';
import SearchableSelect from './SearchableSelect';

// ── Inline-add dropdown ───────────────────────────────────────────────────────
function CreatableSelect({ value, onChange, items = [], onAdd, addLabel, loading }) {
  const [adding, setAdding] = useState(false);
  const [draft,  setDraft]  = useState('');

  function handleChange(e) {
    if (e.target.value === '__add__') setAdding(true);
    else onChange(e.target.value);
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

// ── Parse an existing campaign name back into its parts ───────────────────────
const BUYERS = ['TK', 'MA', 'DS'];

function parseName(name, sources, verticals) {
  const n = name.replace(/^Copy of\s+/i, '').replace(/[_\s]*-?\s*copy\s*$/i, '').trim();

  // Split on first ' - ' to get buyer prefix and rest
  const dashIdx = n.indexOf(' - ');
  let buyer  = '';
  let rest   = n;
  if (dashIdx !== -1) {
    const prefix = n.slice(0, dashIdx).trim();
    if (BUYERS.includes(prefix)) buyer = prefix;
    rest = n.slice(dashIdx + 3).trim();
  }

  const sourceSet   = new Set(sources.map((s) => s.value));
  const verticalSet = new Set(verticals.map((v) => v.value));
  const dateRegex   = /^\d{2}\.\d{2}$/;

  const parts      = rest.split('_');
  let source       = '';
  let vertical     = '';
  const listParts  = [];

  for (const part of parts) {
    if (!source   && sourceSet.has(part))   { source = part; }
    else if (!vertical && verticalSet.has(part)) { vertical = part; }
    else if (dateRegex.test(part))          { /* skip trailing date */ }
    else                                    { listParts.push(part); }
  }

  return { buyer, source, vertical, listName: listParts.join('_') };
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

  const addSource   = useMutation({ mutationFn: (v) => api.addListItem('route', v),    onSuccess: () => qc.invalidateQueries({ queryKey: ['list', 'route'] }) });
  const addVertical = useMutation({ mutationFn: (v) => api.addListItem('vertical', v), onSuccess: () => qc.invalidateQueries({ queryKey: ['list', 'vertical'] }) });

  const [buyer,    setBuyer]    = useState('');
  const [source,   setSource]   = useState('');
  const [vertical, setVertical] = useState('');
  const [listName, setListName] = useState('');
  const [date,     setDate]     = useState(todayStr);
  const [initialized, setInitialized] = useState(false);

  // Pre-fill from existing campaign name (edit mode)
  useEffect(() => {
    if (initialized || !value || loadingSources || loadingVerticals) return;
    const parsed = parseName(value, sources, verticals);
    if (parsed.buyer)    setBuyer(parsed.buyer);
    if (parsed.source)   setSource(parsed.source);
    if (parsed.vertical) setVertical(parsed.vertical);
    if (parsed.listName) setListName(parsed.listName);
    setInitialized(true);
  }, [value, loadingSources, loadingVerticals, initialized, sources, verticals]);

  // Build the campaign name from parts
  const suffix = [source, vertical, listName, date].filter(Boolean).join('_');
  const preview = buyer
    ? (suffix ? `${buyer} - ${suffix}` : buyer)
    : '';

  // Keep parent form in sync
  useEffect(() => {
    if (preview) onChange(preview);
  }, [preview]);

  // Notify parent when source changes (used for domain auto-select)
  useEffect(() => {
    if (onRoute) onRoute(source);
  }, [source]);

  // URL params (keep for compatibility)
  useEffect(() => {
    if (onUrlParams) onUrlParams(`clk=0`);
  }, []);

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

      {/* 2–3. Traffic Source + Vertical */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Traffic Source / Route</label>
          <CreatableSelect value={source} items={sources} loading={loadingSources}
            onChange={setSource}
            onAdd={(v) => addSource.mutate(v)} addLabel="Add new source…" />
        </div>
        <div>
          <label className="label">Vertical</label>
          <CreatableSelect value={vertical} items={verticals} loading={loadingVerticals}
            onChange={setVertical}
            onAdd={(v) => addVertical.mutate(v)} addLabel="Add new vertical…" />
        </div>
      </div>

      {/* 4–5. List Name + Date */}
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
