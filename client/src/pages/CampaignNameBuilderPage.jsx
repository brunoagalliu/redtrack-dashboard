import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CopyButton from '../components/CopyButton';

// ── Default lists ────────────────────────────────────────────────────────────

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
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function nextPartnerId(partners) {
  const nums = partners.map((p) => parseInt(p.id.replace('P', ''), 10)).filter(Number.isFinite);
  const max  = nums.length ? Math.max(...nums) : 0;
  return `P${String(max + 1).padStart(3, '0')}`;
}

function todayMMDD() {
  const d  = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}.${dd}`;
}

// ── CreatableSelect ──────────────────────────────────────────────────────────
// A <select> that has a special "—add—" sentinel at the bottom which reveals
// an inline text input to create a new option.

function CreatableSelect({ value, onChange, options, placeholder, onAdd, addLabel = 'Add new…' }) {
  const [adding, setAdding] = useState(false);
  const [draft,  setDraft]  = useState('');

  function handleChange(e) {
    if (e.target.value === '__add__') {
      setAdding(true);
    } else {
      onChange(e.target.value);
    }
  }

  function commit() {
    const trimmed = draft.trim();
    if (trimmed) {
      onAdd(trimmed);
      onChange(trimmed); // auto-select the new item
    }
    setAdding(false);
    setDraft('');
  }

  function cancel() {
    setAdding(false);
    setDraft('');
  }

  if (adding) {
    return (
      <div className="flex gap-1">
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') cancel();
          }}
          className="input flex-1"
          placeholder={addLabel}
        />
        <button type="button" onClick={commit} className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700">
          Add
        </button>
        <button type="button" onClick={cancel} className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50">
          ✕
        </button>
      </div>
    );
  }

  return (
    <select value={value} onChange={handleChange} className="input">
      <option value="">{placeholder || 'Select…'}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
      <option value="__add__">＋ {addLabel}</option>
    </select>
  );
}

// Same but for partners (alias + id pair)
function CreatablePartnerSelect({ value, onChange, partners, onAdd }) {
  const [adding, setAdding] = useState(false);
  const [draft,  setDraft]  = useState('');

  function handleChange(e) {
    if (e.target.value === '__add__') {
      setAdding(true);
    } else {
      onChange(e.target.value);
    }
  }

  function commit() {
    const alias = draft.trim().toUpperCase();
    if (alias) onAdd(alias);
    onChange(alias);
    setAdding(false);
    setDraft('');
  }

  function cancel() {
    setAdding(false);
    setDraft('');
  }

  if (adding) {
    return (
      <div className="flex gap-1">
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') cancel();
          }}
          className="input flex-1 uppercase"
          placeholder="Partner alias e.g. NEWCO"
        />
        <button type="button" onClick={commit} className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700">
          Add
        </button>
        <button type="button" onClick={cancel} className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50">
          ✕
        </button>
      </div>
    );
  }

  return (
    <select value={value} onChange={handleChange} className="input">
      <option value="">Select…</option>
      {partners.map((p) => (
        <option key={p.alias} value={p.alias}>{p.alias} ({p.id})</option>
      ))}
      <option value="__add__">＋ Add new partner…</option>
    </select>
  );
}

// ── CreatableButtonGroup ─────────────────────────────────────────────────────
// Pill buttons with an inline add button

function CreatableButtonGroup({ items, selected, onSelect, onAdd, addLabel = 'Add new…' }) {
  const [adding, setAdding] = useState(false);
  const [draft,  setDraft]  = useState('');

  function commit() {
    const trimmed = draft.trim();
    if (trimmed) {
      onAdd(trimmed);
      onSelect(trimmed);
    }
    setAdding(false);
    setDraft('');
  }

  function cancel() {
    setAdding(false);
    setDraft('');
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onSelect(selected === item ? '' : item)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
            selected === item
              ? 'bg-blue-600 text-white border-blue-600'
              : 'border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          {item}
        </button>
      ))}

      {adding ? (
        <div className="flex gap-1 items-center">
          <input
            autoFocus
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              if (e.key === 'Escape') cancel();
            }}
            className="input w-36 py-1 text-xs"
            placeholder={addLabel}
          />
          <button type="button" onClick={commit} className="px-2 py-1 text-xs rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700">
            Add
          </button>
          <button type="button" onClick={cancel} className="px-2 py-1 text-xs rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50">
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="px-3 py-1.5 text-xs font-medium rounded-md border border-dashed border-gray-400 text-gray-500 hover:bg-gray-50 hover:border-gray-500"
        >
          ＋ Add
        </button>
      )}
    </div>
  );
}

// ── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label, badge }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div className="relative">
        <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
        <div className={`w-9 h-5 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-300'}`} />
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </div>
      <span className="text-sm text-gray-700">{label}</span>
      {badge && (
        <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${checked ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
          {badge}
        </span>
      )}
    </label>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignNameBuilderPage() {
  const navigate = useNavigate();

  // Persisted lists
  const [providers, setProviders] = useState(() => load('nb.providers', DEFAULT_PROVIDERS));
  const [routes,    setRoutes]    = useState(() => load('nb.routes',    DEFAULT_ROUTES));
  const [verticals, setVerticals] = useState(() => load('nb.verticals', DEFAULT_VERTICALS));
  const [partners,  setPartners]  = useState(() => load('nb.partners',  DEFAULT_PARTNERS));

  // Selections
  const [provider, setProvider] = useState('');
  const [route,    setRoute]    = useState('');
  const [vertical, setVertical] = useState('');
  const [partner,  setPartner]  = useState('');
  const [clickers, setClickers] = useState(false);
  const [listName, setListName] = useState('');
  const [date,     setDate]     = useState(todayMMDD);

  // Adders
  function addProvider(v) { const next = [...providers, v]; setProviders(next); save('nb.providers', next); }
  function addRoute(v)    { const next = [...routes, v];    setRoutes(next);    save('nb.routes', next); }
  function addVertical(v) { const next = [...verticals, v]; setVerticals(next); save('nb.verticals', next); }
  function addPartner(alias) {
    const next = [...partners, { alias, id: nextPartnerId(partners) }];
    setPartners(next);
    save('nb.partners', next);
  }

  const selectedPartner = partners.find((p) => p.alias === partner);

  const suffix = [route, vertical, partner, clickers ? 'clickers' : '', listName, date]
    .filter(Boolean)
    .join('_');

  const campaignName = provider && suffix ? `${provider} - ${suffix}` : '';

  const urlParams = [
    selectedPartner ? `sourceid=${selectedPartner.id}` : null,
    `clk=${clickers ? 1 : 0}`,
  ].filter(Boolean).join('&');

  function handleCreateCampaign() {
    navigate(`/campaigns/new?name=${encodeURIComponent(campaignName)}`);
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Campaign Name Builder</h1>

      <div className="space-y-5">

        {/* Provider */}
        <div className="card p-6">
          <p className="section-title">SMS Provider</p>
          <CreatableButtonGroup
            items={providers}
            selected={provider}
            onSelect={setProvider}
            onAdd={addProvider}
            addLabel="New provider"
          />
        </div>

        {/* Route · Vertical · Data Partner */}
        <div className="card p-6">
          <p className="section-title">Campaign Components</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Route</label>
              <CreatableSelect
                value={route}
                onChange={setRoute}
                options={routes}
                placeholder="Select…"
                onAdd={addRoute}
                addLabel="New route…"
              />
            </div>
            <div>
              <label className="label">Vertical</label>
              <CreatableSelect
                value={vertical}
                onChange={setVertical}
                options={verticals}
                placeholder="Select…"
                onAdd={addVertical}
                addLabel="New vertical…"
              />
            </div>
            <div>
              <label className="label">Data Partner</label>
              <CreatablePartnerSelect
                value={partner}
                onChange={setPartner}
                partners={partners}
                onAdd={addPartner}
              />
              {selectedPartner && (
                <p className="mt-1 text-xs text-gray-400">
                  Encodes as <span className="font-mono">{selectedPartner.id}</span> in URLs
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Clickers toggle */}
        <div className="card p-6">
          <p className="section-title">Clickers</p>
          <Toggle
            checked={clickers}
            onChange={(e) => setClickers(e.target.checked)}
            label="Clickers segment"
            badge={`clk=${clickers ? 1 : 0}`}
          />
          <p className="mt-2 text-xs text-gray-400">
            Appends <span className="font-mono">_clickers</span> to the name and sets <span className="font-mono">clk=1</span> in URL params.
          </p>
        </div>

        {/* List Name & Date */}
        <div className="card p-6">
          <p className="section-title">List Name &amp; Date</p>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="label">List Name</label>
              <input
                type="text"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                className="input"
                placeholder="e.g. healthcare_MAR_50k_mar31_vz_13k"
              />
            </div>
            <div>
              <label className="label">Date (MM.DD)</label>
              <input
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input"
                placeholder="04.08"
              />
            </div>
          </div>
        </div>

        {/* Preview */}
        {campaignName ? (
          <div className="card p-6 border-blue-200 bg-blue-50">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-3">
              Generated Campaign Name
            </p>
            <div className="flex items-start gap-3">
              <p className="font-mono text-sm text-blue-900 flex-1 break-all">{campaignName}</p>
              <CopyButton text={campaignName} />
            </div>

            {urlParams && (
              <div className="mt-4 pt-4 border-t border-blue-200">
                <p className="text-xs font-semibold text-blue-600 mb-1">URL Parameters to append</p>
                <div className="flex items-center gap-3">
                  <code className="text-xs text-blue-800 bg-blue-100 px-2 py-1 rounded">{urlParams}</code>
                  <CopyButton text={urlParams} />
                </div>
              </div>
            )}

            <div className="mt-4">
              <button type="button" onClick={handleCreateCampaign} className="btn-primary text-sm">
                Create Campaign with this Name →
              </button>
            </div>
          </div>
        ) : (
          <div className="card p-6 border-dashed border-gray-300 bg-gray-50 text-center">
            <p className="text-sm text-gray-400">Select a provider and at least one component to preview the campaign name.</p>
          </div>
        )}

      </div>
    </div>
  );
}
