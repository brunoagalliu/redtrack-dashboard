import { useState } from 'react';
import CopyButton from './CopyButton';

const DEFAULT_PROVIDERS = ['TK', 'Pineapple', 'CM', 'InfoBip', 'Mr.Messaging', 'Campaigner', 'SMS Gateway', 'Tells', 'IT Decision', 'BSG'];
const DEFAULT_ROUTES    = ['USMS', 'ltsauto', 'cloudstorage4u', 'iphonetechzone', 'maxtechie', 'triallooks', 'dominantwire'];
const DEFAULT_VERTICALS = ['CLOUD', 'AUTO', 'AV', 'DEBT', 'CLINICAL'];
const DEFAULT_PARTNERS  = [
  { alias: 'JC',      id: 'P001' },
  { alias: 'AVANTO',  id: 'P002' },
  { alias: 'LM',      id: 'P003' },
  { alias: 'UPSTART', id: 'P004' },
  { alias: 'KOINO',   id: 'P005' },
];

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function persist(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function nextPartnerId(partners) {
  const nums = partners.map((p) => parseInt(p.id.replace('P', ''), 10)).filter(Number.isFinite);
  return `P${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

function todayMMDD() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// ── Inline-add dropdown ──────────────────────────────────────────────────────
function CreatableSelect({ value, onChange, options, placeholder, onAdd, addLabel }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft]   = useState('');

  function handleChange(e) {
    if (e.target.value === '__add__') { setAdding(true); }
    else { onChange(e.target.value); }
  }
  function commit() {
    const t = draft.trim();
    if (t) { onAdd(t); onChange(t); }
    setAdding(false); setDraft('');
  }

  if (adding) {
    return (
      <div className="flex gap-1">
        <input autoFocus type="text" value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { setAdding(false); setDraft(''); } }}
          className="input flex-1 text-sm" placeholder={addLabel} />
        <button type="button" onClick={commit} className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white font-medium">Add</button>
        <button type="button" onClick={() => { setAdding(false); setDraft(''); }} className="px-2 py-1.5 text-xs rounded-md border border-gray-300 text-gray-600">✕</button>
      </div>
    );
  }
  return (
    <select value={value} onChange={handleChange} className="input">
      <option value="">{placeholder || 'Select…'}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
      <option value="__add__">＋ {addLabel}</option>
    </select>
  );
}

// ── Inline-add dropdown for partners ────────────────────────────────────────
function CreatablePartnerSelect({ value, onChange, partners, onAdd }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft]   = useState('');

  function handleChange(e) {
    if (e.target.value === '__add__') { setAdding(true); }
    else { onChange(e.target.value); }
  }
  function commit() {
    const alias = draft.trim().toUpperCase();
    if (alias) { onAdd(alias); onChange(alias); }
    setAdding(false); setDraft('');
  }

  if (adding) {
    return (
      <div className="flex gap-1">
        <input autoFocus type="text" value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { setAdding(false); setDraft(''); } }}
          className="input flex-1 uppercase text-sm" placeholder="Partner alias e.g. NEWCO" />
        <button type="button" onClick={commit} className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white font-medium">Add</button>
        <button type="button" onClick={() => { setAdding(false); setDraft(''); }} className="px-2 py-1.5 text-xs rounded-md border border-gray-300 text-gray-600">✕</button>
      </div>
    );
  }
  return (
    <select value={value} onChange={handleChange} className="input">
      <option value="">Select…</option>
      {partners.map((p) => <option key={p.alias} value={p.alias}>{p.alias} ({p.id})</option>)}
      <option value="__add__">＋ Add new partner…</option>
    </select>
  );
}

// ── Pill button group with inline add ───────────────────────────────────────
function CreatableButtonGroup({ items, selected, onSelect, onAdd, addLabel }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft]   = useState('');

  function commit() {
    const t = draft.trim();
    if (t) { onAdd(t); onSelect(t); }
    setAdding(false); setDraft('');
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {items.map((item) => (
        <button key={item} type="button"
          onClick={() => onSelect(selected === item ? '' : item)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
            selected === item ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}>
          {item}
        </button>
      ))}
      {adding ? (
        <div className="flex gap-1 items-center">
          <input autoFocus type="text" value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { setAdding(false); setDraft(''); } }}
            className="input w-36 py-1 text-xs" placeholder={addLabel} />
          <button type="button" onClick={commit} className="px-2 py-1 text-xs rounded-md bg-blue-600 text-white font-medium">Add</button>
          <button type="button" onClick={() => { setAdding(false); setDraft(''); }} className="px-2 py-1 text-xs rounded-md border border-gray-300 text-gray-600">✕</button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          className="px-3 py-1.5 text-xs font-medium rounded-md border border-dashed border-gray-400 text-gray-500 hover:bg-gray-50">
          ＋ Add
        </button>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
// value / onChange control the final campaign name string.
// urlParams is exposed via onUrlParams for the parent to store if needed.

export default function CampaignNameBuilder({ value, onChange, error }) {
  const [providers, setProviders] = useState(() => load('nb.providers', DEFAULT_PROVIDERS));
  const [routes,    setRoutes]    = useState(() => load('nb.routes',    DEFAULT_ROUTES));
  const [verticals, setVerticals] = useState(() => load('nb.verticals', DEFAULT_VERTICALS));
  const [partners,  setPartners]  = useState(() => load('nb.partners',  DEFAULT_PARTNERS));

  const [provider, setProvider] = useState('');
  const [route,    setRoute]    = useState('');
  const [vertical, setVertical] = useState('');
  const [partner,  setPartner]  = useState('');
  const [clickers, setClickers] = useState(false);
  const [listName, setListName] = useState('');
  const [date,     setDate]     = useState(todayMMDD);

  function addProvider(v) { const n = [...providers, v]; setProviders(n); persist('nb.providers', n); }
  function addRoute(v)    { const n = [...routes, v];    setRoutes(n);    persist('nb.routes', n); }
  function addVertical(v) { const n = [...verticals, v]; setVerticals(n); persist('nb.verticals', n); }
  function addPartner(alias) {
    const n = [...partners, { alias, id: nextPartnerId(partners) }];
    setPartners(n); persist('nb.partners', n);
  }

  const selectedPartner = partners.find((p) => p.alias === partner);

  function build(p, r, ve, pa, clk, ln, dt) {
    const suffix = [r, ve, pa, clk ? 'clickers' : '', ln, dt].filter(Boolean).join('_');
    return p && suffix ? `${p} - ${suffix}` : '';
  }

  function update(field, val) {
    const state = { provider, route, vertical, partner, clickers, listName, date, [field]: val };
    onChange(build(state.provider, state.route, state.vertical, state.partner, state.clickers, state.listName, state.date));
  }

  function sel(field, setter) {
    return (val) => { setter(val); update(field, val); };
  }

  return (
    <div className="space-y-4">
      {/* Provider */}
      <div>
        <label className="label">SMS Provider</label>
        <CreatableButtonGroup
          items={providers} selected={provider}
          onSelect={sel('provider', setProvider)}
          onAdd={addProvider} addLabel="New provider"
        />
      </div>

      {/* Route · Vertical · Partner */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label">Route</label>
          <CreatableSelect value={route} onChange={sel('route', setRoute)}
            options={routes} placeholder="Select…" onAdd={addRoute} addLabel="New route…" />
        </div>
        <div>
          <label className="label">Vertical</label>
          <CreatableSelect value={vertical} onChange={sel('vertical', setVertical)}
            options={verticals} placeholder="Select…" onAdd={addVertical} addLabel="New vertical…" />
        </div>
        <div>
          <label className="label">Data Partner</label>
          <CreatablePartnerSelect value={partner} onChange={sel('partner', setPartner)}
            partners={partners} onAdd={addPartner} />
          {selectedPartner && (
            <p className="mt-1 text-xs text-gray-400">
              Encodes as <span className="font-mono">{selectedPartner.id}</span> in URLs
            </p>
          )}
        </div>
      </div>

      {/* Clickers + List Name + Date */}
      <div className="grid grid-cols-3 gap-3 items-end">
        <div className="col-span-2">
          <label className="label">List Name</label>
          <input type="text" value={listName}
            onChange={(e) => { setListName(e.target.value); update('listName', e.target.value); }}
            className="input" placeholder="e.g. healthcare_MAR_50k_mar31_vz_13k" />
        </div>
        <div>
          <label className="label">Date (MM.DD)</label>
          <input type="text" value={date}
            onChange={(e) => { setDate(e.target.value); update('date', e.target.value); }}
            className="input" placeholder="04.08" />
        </div>
      </div>

      {/* Clickers toggle */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <div className="relative">
          <input type="checkbox" checked={clickers}
            onChange={(e) => { setClickers(e.target.checked); update('clickers', e.target.checked); }}
            className="sr-only" />
          <div className={`w-9 h-5 rounded-full transition-colors ${clickers ? 'bg-blue-600' : 'bg-gray-300'}`} />
          <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${clickers ? 'translate-x-4' : ''}`} />
        </div>
        <span className="text-sm text-gray-700">Clickers</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${clickers ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
          clk={clickers ? 1 : 0}
        </span>
      </label>

      {/* Preview */}
      {value ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-500 mb-1">Preview</p>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-blue-900 flex-1 break-all">{value}</span>
            <CopyButton text={value} />
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-center">
          <p className="text-xs text-gray-400">Select a provider and at least one component to preview the name.</p>
        </div>
      )}

      {/* Resulting name (editable) */}
      <div>
        <label className="label">Campaign Name *</label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`input font-mono text-sm ${error ? 'border-red-400 focus:border-red-400' : ''}`}
          placeholder="Or type manually"
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
