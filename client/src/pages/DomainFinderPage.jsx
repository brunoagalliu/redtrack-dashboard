import { useState, useRef } from 'react';
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
        found = [...found, ...newAvail].slice(0, target);
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
            <select value={target} onChange={e => setTarget(Number(e.target.value))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {[10, 25, 50, 100, 200].map(n => <option key={n} value={n}>{n} available</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name length (chars)</label>
            <select value={length} onChange={e => setLength(Number(e.target.value))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {[4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n} chars</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">TLD</label>
            <select value={tld} onChange={e => setTld(e.target.value)}
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

      {tab === 'brainstorm' ? <BrainstormTab /> : <GeneratorTab />}
    </div>
  );
}
