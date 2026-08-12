import { useState, useRef, useMemo } from 'react';
import { api } from '../lib/api';

const TIER_CONFIG = {
  top:      { label: 'Top Picks',  className: 'bg-amber-50 text-amber-700 border-amber-200' },
  strong:   { label: 'Strong',     className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  wildcard: { label: 'Wildcards',  className: 'bg-gray-100 text-gray-600 border-gray-200' },
};
const TIERS = ['top', 'strong', 'wildcard'];
const CONSONANTS = 'bcdfghjklmnpqrstvwxyz';
const BATCH_SIZE = 50;

function randomName(length) {
  let n = '';
  for (let i = 0; i < length; i++) n += CONSONANTS[Math.floor(Math.random() * CONSONANTS.length)];
  return n;
}

// ─── AI BRAINSTORM TAB ───────────────────────────────────────────────────────

function BrainstormTab() {
  const [description, setDescription] = useState('');
  const [brainstorming, setBrainstorming] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');

  async function handleBrainstorm() {
    if (!description.trim()) return;
    setBrainstorming(true);
    setError('');
    setSuggestions([]);
    setSelected(new Set());
    setResults([]);
    try {
      const data = await api.brainstormDomains(description);
      setSuggestions(data.suggestions);
      setSelected(new Set(data.suggestions.map(s => s.domain)));
    } catch (e) {
      setError(e.message || 'Brainstorm failed');
    } finally {
      setBrainstorming(false);
    }
  }

  function toggleDomain(domain) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(domain) ? next.delete(domain) : next.add(domain);
      return next;
    });
  }

  function toggleAll() {
    setSelected(selected.size === suggestions.length ? new Set() : new Set(suggestions.map(s => s.domain)));
  }

  async function handleCheck() {
    if (!selected.size) return;
    setChecking(true);
    setError('');
    setResults([]);
    try {
      const data = await api.checkDomains(Array.from(selected));
      setResults(data.results);
    } catch (e) {
      setError(e.message || 'Availability check failed');
    } finally {
      setChecking(false);
    }
  }

  const available = results.filter(r => r.available);
  const taken     = results.filter(r => !r.available);

  return (
    <div className="space-y-6">
      {/* Step 1 */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">1. Describe your business or project</h2>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleBrainstorm(); }}
          placeholder="e.g. A SaaS platform that helps sales teams qualify and route inbound leads automatically…"
          rows={3}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
        <button
          onClick={handleBrainstorm}
          disabled={brainstorming || !description.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {brainstorming ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Brainstorming…
            </>
          ) : 'Brainstorm with Claude'}
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Step 2 — suggestions */}
      {suggestions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">2. Select domains to check <span className="text-gray-400 font-normal">({suggestions.length})</span></h2>
            <button onClick={toggleAll} className="text-xs text-indigo-600 hover:text-indigo-800">
              {selected.size === suggestions.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          <div className="space-y-4">
            {TIERS.map(tier => {
              const group = suggestions.filter(s => s.tier === tier);
              if (!group.length) return null;
              const cfg = TIER_CONFIG[tier];
              return (
                <div key={tier}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">{cfg.label}</p>
                  <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
                    {group.map(s => (
                      <label key={s.domain} className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors">
                        <input
                          type="checkbox"
                          checked={selected.has(s.domain)}
                          onChange={() => toggleDomain(s.domain)}
                          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-mono text-sm font-medium text-gray-900">{s.domain}.com</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded border ${cfg.className}`}>{s.strategy}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{s.rationale}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={handleCheck}
            disabled={checking || !selected.size}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {checking ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Checking…
              </>
            ) : `Check Availability (${selected.size})`}
          </button>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">
            Results — <span className="text-emerald-600">{available.length} available</span>
            <span className="text-gray-400">, {taken.length} taken</span>
          </h2>

          {available.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-2">Available</p>
              <div className="space-y-1.5">
                {available.map(r => (
                  <div key={r.domain} className="flex items-center justify-between px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <span className="font-mono text-sm font-medium text-gray-900">{r.domain}</span>
                    <div className="flex items-center gap-3">
                      {r.isPremium && r.price && <span className="text-xs text-amber-600">Premium ${r.price}</span>}
                      <span className="text-xs font-semibold text-emerald-600">Available</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {taken.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Taken</p>
              <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
                {taken.map(r => (
                  <div key={r.domain} className="flex items-center justify-between px-4 py-2 bg-white">
                    <span className="font-mono text-sm text-gray-400">{r.domain}</span>
                    <span className="text-xs text-gray-400">Taken</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── RANDOM GENERATOR TAB ────────────────────────────────────────────────────

function GeneratorTab() {
  const [target,  setTarget]  = useState(50);
  const [length,  setLength]  = useState(6);
  const [tld,     setTld]     = useState('.com');
  const [available, setAvailable] = useState([]);
  const [checked,   setChecked]   = useState(0);
  const [running,   setRunning]   = useState(false);
  const [done,      setDone]      = useState(false);
  const [error,     setError]     = useState('');
  const [copied,    setCopied]    = useState(null);
  const stopRef = useRef(false);
  const seenRef = useRef(new Set());

  function resetResults() { setAvailable([]); setChecked(0); setDone(false); setError(''); }

  function generateBatch() {
    const batch = [];
    while (batch.length < BATCH_SIZE) {
      const d = `${randomName(length)}${tld}`;
      if (!seenRef.current.has(d)) { seenRef.current.add(d); batch.push(d); }
    }
    return batch;
  }

  async function handleStart() {
    stopRef.current = false;
    seenRef.current = new Set();
    setAvailable([]);
    setChecked(0);
    setDone(false);
    setError('');
    setRunning(true);

    let found = [];
    while (found.length < target && !stopRef.current) {
      const batch = generateBatch();
      try {
        const data = await api.checkDomains(batch);
        const newAvail = (data.results ?? []).filter(r => r.available).map(r => r.domain);
        found = [...found, ...newAvail];
        setAvailable([...found]);
        setChecked(prev => prev + batch.length);
      } catch (e) {
        setError(e.message || 'Check failed');
        break;
      }
    }
    setRunning(false);
    setDone(true);
  }

  function handleStop() { stopRef.current = true; }

  function handleCopy(domain) {
    navigator.clipboard.writeText(domain);
    setCopied(domain);
    setTimeout(() => setCopied(null), 1500);
  }

  function handleCopyAll() {
    navigator.clipboard.writeText(available.join('\n'));
    setCopied('__all__');
    setTimeout(() => setCopied(null), 1500);
  }

  const TLDS = ['.com', '.net', '.org', '.io', '.co', '.app', '.dev', '.info', '.site'];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Random Domain Generator</h2>
        <p className="text-xs text-gray-500">Scans consonant-only random names for availability — great for finding short, pronounceable brandable domains.</p>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Find how many</label>
            <input type="number" value={target} min={1} onChange={e => { setTarget(Math.max(1, Number(e.target.value))); resetResults(); }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name length (chars)</label>
            <select value={length} onChange={e => { setLength(Number(e.target.value)); resetResults(); }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {[4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n} chars</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">TLD</label>
            <select value={tld} onChange={e => { setTld(e.target.value); resetResults(); }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {TLDS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!running ? (
            <button onClick={handleStart}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
              Start Scanning
            </button>
          ) : (
            <button onClick={handleStop}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
              Stop
            </button>
          )}
          {running && (
            <span className="text-sm text-gray-500">
              Checked <span className="font-medium text-gray-700">{checked.toLocaleString()}</span> — found <span className="font-medium text-emerald-600">{available.length}</span> of {target}
            </span>
          )}
          {done && !running && (
            <span className="text-sm text-gray-500">
              Done — found <span className="font-medium text-emerald-600">{available.length}</span> available out of {checked.toLocaleString()} checked
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {available.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Available Domains <span className="text-gray-400 font-normal">({available.length})</span></h2>
            <button onClick={handleCopyAll}
              className="text-xs text-indigo-600 hover:text-indigo-800">
              {copied === '__all__' ? 'Copied!' : 'Copy all'}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {available.map(d => (
              <button key={d} onClick={() => handleCopy(d)}
                className="flex items-center justify-between px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors text-left">
                <span className="font-mono text-sm text-gray-900">{d}</span>
                <span className="text-xs text-emerald-600">{copied === d ? '✓' : ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PROVISION HELPERS ───────────────────────────────────────────────────────

function parseDate(d) {
  if (!d) return 0;
  const [m, day, y] = d.split('/');
  return new Date(+y, +m - 1, +day).getTime() || 0;
}

function DomainSelector({ domains, setDomains, loading, onFetch, error }) {
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteValue, setPasteValue] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('created');
  const [sortDir, setSortDir] = useState('desc');

  const allSelected = domains.length > 0 && domains.every(d => d.selected);
  const selected = domains.filter(d => d.selected);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const filtered = useMemo(() => {
    const list = domains.filter(d => d.name.includes(search.toLowerCase()));
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'created') cmp = parseDate(a.created) - parseDate(b.created);
      else if (sortKey === 'expires') cmp = parseDate(a.expires) - parseDate(b.expires);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [domains, search, sortKey, sortDir]);

  function loadFromPaste() {
    const entries = pasteValue.split('\n').map(l => l.trim().toLowerCase()).filter(Boolean)
      .map(name => ({ name, isOurDNS: true, created: '', expires: '', selected: true }));
    setDomains(entries);
    setPasteMode(false);
    setPasteValue('');
  }

  function toggleAll() { setDomains(domains.map(d => ({ ...d, selected: !allSelected }))); }
  function toggle(name) { setDomains(domains.map(d => d.name === name ? { ...d, selected: !d.selected } : d)); }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onFetch} disabled={loading}
          className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors">
          {loading ? 'Loading…' : 'Fetch from Namecheap'}
        </button>
        <button onClick={() => setPasteMode(v => !v)}
          className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">
          Paste domains
        </button>
        {selected.length > 0 && <span className="text-xs text-gray-500 ml-auto">{selected.length} of {domains.length} selected</span>}
      </div>

      {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {pasteMode && (
        <div className="space-y-2">
          <textarea value={pasteValue} onChange={e => setPasteValue(e.target.value)}
            placeholder={'example.com\nanother.com'} rows={5} autoFocus
            className="w-full font-mono text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          <button onClick={loadFromPaste} disabled={!pasteValue.trim()}
            className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            Load {pasteValue.split('\n').filter(l => l.trim()).length} domains
          </button>
        </div>
      )}

      {domains.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 border-b border-gray-200">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 rounded border-gray-300 text-indigo-600" />
            <span className="text-xs text-gray-500">Select all</span>
            <div className="ml-auto flex items-center gap-3">
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter…"
                className="text-xs border border-gray-200 rounded px-2 py-1 w-32 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              {['name', 'created', 'expires'].map(k => (
                <button key={k} onClick={() => toggleSort(k)}
                  className={`text-xs ${sortKey === k ? 'text-indigo-600 font-medium' : 'text-gray-400 hover:text-gray-600'}`}>
                  {k}{sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
            {filtered.map(d => (
              <label key={d.name} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={d.selected} onChange={() => toggle(d.name)}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 flex-shrink-0" />
                <span className="font-mono text-sm text-gray-900 flex-1">{d.name}</span>
                {d.created && <span className="text-xs text-gray-400">{d.created}</span>}
                {!d.isOurDNS && <span className="text-xs text-amber-500">custom NS</span>}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StepBadge({ step }) {
  if (!step) return <span className="text-gray-300 text-xs">—</span>;
  if (step.status === 'ok') return <span className="text-emerald-600 text-xs font-medium" title={step.detail}>✓ {step.detail && <span className="font-normal text-gray-400">{step.detail}</span>}</span>;
  return <span className="text-red-600 text-xs">✗ {step.detail}</span>;
}

// ─── CLOUDFLARE PROVISION TAB ─────────────────────────────────────────────────

const CF_STEP_NAMES = ['Add to Cloudflare', 'Add DNS records', 'Enable security', 'Set SSL/TLS', 'Set nameservers'];

function CloudflareTab() {
  const [step, setStep] = useState(1);
  const [domains, setDomains] = useState([]);
  const [loadingDomains, setLoadingDomains] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [security, setSecurity] = useState({ botFightMode: false, aiLabyrinth: false, aiBotsProtection: false });
  const [network, setNetwork] = useState({ proxy: true, sslMode: 'flexible' });
  const [records, setRecords] = useState([
    { id: '1', type: 'A', name: '@',   content: '47.236.21.233' },
    { id: '2', type: 'A', name: 'www', content: '47.236.21.233' },
    { id: '3', type: 'A', name: '*',   content: '47.236.21.233' },
  ]);
  const [jobs, setJobs] = useState([]);
  const [provisioning, setProvisioning] = useState(false);
  const [started, setStarted] = useState(false);

  const selected = domains.filter(d => d.selected);

  async function fetchDomains() {
    setLoadingDomains(true); setFetchError('');
    try {
      const data = await api.getNamecheapDomains();
      setDomains(data.domains.map(d => ({ ...d, selected: false })));
    } catch (e) { setFetchError(e.message || 'Failed to fetch'); }
    finally { setLoadingDomains(false); }
  }

  function addRecord() { setRecords(r => [...r, { id: Math.random().toString(36).slice(2), type: 'A', name: '', content: '' }]); }
  function removeRecord(id) { setRecords(r => r.filter(x => x.id !== id)); }
  function updateRecord(id, patch) { setRecords(r => r.map(x => x.id === id ? { ...x, ...patch } : x)); }

  async function handleProvision() {
    const newJobs = selected.map(d => ({ id: crypto.randomUUID(), domain: d.name, state: 'pending', steps: [], nameservers: null }));
    setJobs(newJobs);
    setStarted(true);
    setProvisioning(true);

    const CONCURRENCY = 3;
    for (let i = 0; i < newJobs.length; i += CONCURRENCY) {
      await Promise.all(newJobs.slice(i, i + CONCURRENCY).map(async job => {
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, state: 'running' } : j));
        try {
          const data = await api.provisionDomain({ domain: job.domain, security, network, records });
          const allOk = data.steps?.every(s => s.status === 'ok');
          setJobs(prev => prev.map(j => j.id === job.id ? { ...j, state: allOk ? 'done' : 'error', steps: data.steps ?? [], nameservers: data.nameservers } : j));
        } catch (e) {
          setJobs(prev => prev.map(j => j.id === job.id ? { ...j, state: 'error', steps: [{ name: 'Request', status: 'error', detail: e.message }] } : j));
        }
      }));
    }
    setProvisioning(false);
  }

  const canNext1 = selected.length > 0;
  const canNext2 = records.length > 0 && records.every(r => r.name.trim() && r.content.trim());
  const done = jobs.filter(j => j.state === 'done').length;
  const errors = jobs.filter(j => j.state === 'error').length;

  return (
    <div className="space-y-5">
      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {['Select Domains', 'Configure', 'Provision'].map((label, i) => {
          const n = i + 1;
          return (
            <div key={n} className="flex items-center gap-1">
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                n === step ? 'bg-indigo-600 text-white' : n < step ? 'bg-gray-100 text-emerald-600' : 'bg-gray-100 text-gray-400'
              }`}>
                <span>{n < step ? '✓' : n}</span><span>{label}</span>
              </div>
              {i < 2 && <div className={`w-6 h-px ${n < step ? 'bg-gray-300' : 'bg-gray-200'}`} />}
            </div>
          );
        })}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <>
          <DomainSelector domains={domains} setDomains={setDomains} loading={loadingDomains} onFetch={fetchDomains} error={fetchError} />
          {canNext1 && (
            <button onClick={() => setStep(2)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
              Next: Configure →
            </button>
          )}
        </>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-4">
          {/* DNS Records */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">DNS Records <span className="text-gray-400 font-normal text-xs">applied to all {selected.length} domain{selected.length !== 1 ? 's' : ''}</span></h3>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-[70px_120px_1fr_28px] bg-gray-50 border-b border-gray-200 px-3 py-2 gap-2 text-xs font-medium text-gray-500">
                <span>Type</span><span>Name</span><span>Content</span><span />
              </div>
              {records.map(r => (
                <div key={r.id} className="grid grid-cols-[70px_120px_1fr_28px] items-center gap-2 px-3 py-2 border-b border-gray-100 last:border-0">
                  <select value={r.type} onChange={e => updateRecord(r.id, { type: e.target.value })}
                    className="font-mono text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    <option>A</option><option>CNAME</option>
                  </select>
                  <input type="text" value={r.name} onChange={e => updateRecord(r.id, { name: e.target.value })} placeholder="@ or *"
                    className="font-mono text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full" />
                  <input type="text" value={r.content} onChange={e => updateRecord(r.id, { content: e.target.value })} placeholder={r.type === 'A' ? '1.2.3.4' : 'target.com'}
                    className="font-mono text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full" />
                  <button onClick={() => removeRecord(r.id)} disabled={records.length === 1} className="text-gray-300 hover:text-red-500 disabled:opacity-30 text-lg leading-none">×</button>
                </div>
              ))}
            </div>
            <button onClick={addRecord} className="text-xs text-indigo-600 hover:text-indigo-800">+ Add record</button>
          </div>

          {/* Network + Security */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">Network & Security</h3>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">Cloudflare Proxy</span>
              <button onClick={() => setNetwork(n => ({ ...n, proxy: !n.proxy }))}
                className={`relative w-9 h-5 rounded-full transition-colors ${network.proxy ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${network.proxy ? 'translate-x-4' : ''}`} />
              </button>
            </div>
            <div className="space-y-1">
              <span className="text-sm text-gray-600">SSL/TLS</span>
              <div className="flex gap-2">
                {['none', 'flexible', 'full'].map(m => (
                  <button key={m} onClick={() => setNetwork(n => ({ ...n, sslMode: m }))}
                    className={`px-3 py-1 text-xs rounded-lg border transition-colors ${network.sslMode === m ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {m === 'none' ? "Don't set" : m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {[
              { key: 'botFightMode', label: 'Bot Fight Mode', desc: 'Challenges requests from known bots' },
              { key: 'aiLabyrinth', label: 'AI Labyrinth', desc: 'Disrupts AI crawlers with generated nofollow links' },
              { key: 'aiBotsProtection', label: 'AI Bots Protection', desc: 'Blocks known AI crawlers by user agent' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-start gap-3">
                <button onClick={() => setSecurity(s => ({ ...s, [key]: !s[key] }))}
                  className={`mt-0.5 relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${security[key] ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${security[key] ? 'translate-x-4' : ''}`} />
                </button>
                <div>
                  <p className="text-sm text-gray-700">{label}</p>
                  <p className="text-xs text-gray-400">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">← Back</button>
            <button onClick={() => setStep(3)} disabled={!canNext2}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors">
              {canNext2 ? 'Next: Review →' : 'Complete all record fields'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="space-y-4">
          {!started && (
            <>
              <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Domains</span><span className="font-medium">{selected.length}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">DNS records</span><span className="font-mono text-xs">{records.map(r => `${r.type} ${r.name} → ${r.content}`).join(', ')}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Security</span>
                  <span>{[security.botFightMode && 'Bot Fight Mode', security.aiLabyrinth && 'AI Labyrinth', security.aiBotsProtection && 'AI Bots Protection'].filter(Boolean).join(' · ') || 'None'}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(2)} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">← Back</button>
                <button onClick={handleProvision} className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors">
                  Provision {selected.length} domain{selected.length !== 1 ? 's' : ''}
                </button>
              </div>
            </>
          )}

          {jobs.length > 0 && (
            <>
              <div className="flex items-center gap-3 text-sm">
                {provisioning ? <span className="text-indigo-600 animate-pulse">Running…</span> : <span className="text-gray-500">Done —</span>}
                {done > 0 && <span className="text-emerald-600 font-medium">{done} succeeded</span>}
                {errors > 0 && <span className="text-red-600 font-medium">{errors} failed</span>}
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Domain</th>
                      {CF_STEP_NAMES.map(s => <th key={s} className="text-center px-2 py-2 font-medium text-gray-500 whitespace-nowrap">{s}</th>)}
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Nameservers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {jobs.map(job => (
                      <tr key={job.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-gray-900">{job.domain}</td>
                        {CF_STEP_NAMES.map(name => (
                          <td key={name} className="px-2 py-2 text-center">
                            {job.state === 'pending' ? <span className="text-gray-300">·</span>
                              : job.state === 'running' && !job.steps.length ? <span className="text-gray-400 animate-pulse">…</span>
                              : <StepBadge step={job.steps.find(s => s.name === name)} />}
                          </td>
                        ))}
                        <td className="px-3 py-2 font-mono text-gray-500 text-xs">
                          {job.nameservers ? job.nameservers.join(', ') : job.state === 'running' ? <span className="animate-pulse text-gray-300">…</span> : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── VERCEL PROVISION TAB ────────────────────────────────────────────────────

function VercelTab() {
  const [domains, setDomains] = useState([]);
  const [loadingDomains, setLoadingDomains] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [mode, setMode] = useState('nameservers');
  const [jobs, setJobs] = useState([]);
  const [provisioning, setProvisioning] = useState(false);

  const selected = domains.filter(d => d.selected);

  async function fetchDomains() {
    setLoadingDomains(true); setFetchError('');
    try {
      const data = await api.getNamecheapDomains();
      setDomains(data.domains.map(d => ({ ...d, selected: false })));
    } catch (e) { setFetchError(e.message || 'Failed to fetch'); }
    finally { setLoadingDomains(false); }
  }

  async function runProvision(domainNames) {
    setProvisioning(true);
    for (const domain of domainNames) {
      setJobs(prev => prev.map(j => j.domain === domain ? { ...j, state: 'running', steps: [] } : j));
      try {
        const data = await api.vercelProvision({ domains: [domain], mode });
        const result = data.results?.[0];
        const allOk = result?.steps.every(s => s.status === 'ok');
        setJobs(prev => prev.map(j => j.domain === domain ? { ...j, state: allOk ? 'done' : 'error', steps: result?.steps ?? [] } : j));
      } catch (e) {
        setJobs(prev => prev.map(j => j.domain === domain ? { ...j, state: 'error', steps: [{ name: 'Request', status: 'error', detail: e.message }] } : j));
      }
    }
    setProvisioning(false);
  }

  async function handleProvision() {
    const domainNames = selected.map(d => d.name);
    setJobs(domainNames.map(domain => ({ domain, state: 'pending', steps: [] })));
    await runProvision(domainNames);
  }

  async function handleRetry(domain) {
    setJobs(prev => prev.map(j => j.domain === domain ? { ...j, state: 'pending', steps: [] } : j));
    await runProvision([domain]);
  }

  const done = jobs.filter(j => j.state === 'done').length;
  const errors = jobs.filter(j => j.state === 'error').length;

  return (
    <div className="space-y-5">
      <DomainSelector domains={domains} setDomains={setDomains} loading={loadingDomains} onFetch={fetchDomains} error={fetchError} />

      {selected.length > 0 && jobs.length === 0 && (
        <div className="flex items-center gap-3">
          <div className="flex p-0.5 bg-gray-100 rounded-lg">
            {[['nameservers', 'Nameservers'], ['arecord', 'A Record']].map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === m ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={handleProvision}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
            Provision {selected.length} domain{selected.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      {jobs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            {provisioning ? <span className="text-indigo-600 animate-pulse">Running…</span> : <span className="text-gray-500">Done —</span>}
            {done > 0 && <span className="text-emerald-600 font-medium">{done} succeeded</span>}
            {errors > 0 && <span className="text-red-600 font-medium">{errors} failed</span>}
            {!provisioning && <button onClick={() => setJobs([])} className="ml-auto text-xs text-gray-400 hover:text-gray-600">Clear</button>}
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
            {jobs.map(job => (
              <div key={job.domain} className="px-4 py-3">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-mono text-sm text-gray-900">{job.domain}</span>
                  {job.state === 'pending' && <span className="text-xs text-gray-400">Waiting…</span>}
                  {job.state === 'running' && <span className="text-xs text-indigo-600 animate-pulse">Running…</span>}
                  {job.state === 'done'    && <span className="text-xs text-emerald-600 font-medium">Done</span>}
                  {job.state === 'error'   && <span className="text-xs text-red-600 font-medium">Failed</span>}
                  {job.state === 'error' && !provisioning && (
                    <button onClick={() => handleRetry(job.domain)} className="ml-auto text-xs text-gray-400 hover:text-gray-600">Retry</button>
                  )}
                </div>
                {job.steps.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {job.steps.map(s => (
                      <span key={s.name} className="text-xs text-gray-500">
                        <span className={s.status === 'ok' ? 'text-emerald-600' : 'text-red-500'}>{s.status === 'ok' ? '✓' : '✗'}</span>
                        {' '}{s.name}{s.detail ? `: ${s.detail}` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PAGE ────────────────────────────────────────────────────────────────────

export default function DomainFinderPage() {
  const [tab, setTab] = useState('brainstorm');

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Domain Finder</h1>
        <p className="text-sm text-gray-500 mt-0.5">Brainstorm brandable domain ideas with Claude or scan for short available names</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {[
          { key: 'brainstorm', label: 'AI Brainstorm' },
          { key: 'generator',  label: 'Random Generator' },
          { key: 'cloudflare', label: 'Cloudflare Provision' },
          { key: 'vercel',     label: 'Vercel Provision' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'brainstorm' && <BrainstormTab />}
      {tab === 'generator'  && <GeneratorTab />}
      {tab === 'cloudflare' && <CloudflareTab />}
      {tab === 'vercel'     && <VercelTab />}
    </div>
  );
}
