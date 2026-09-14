import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

// ── Field renderers ───────────────────────────────────────────────────────────

function FieldInput({ field, value, onChange }) {
  if (field.type === 'boolean') {
    return (
      <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
    );
  }
  if (field.type === 'select') {
    return (
      <select value={value ?? ''} onChange={e => onChange(e.target.value)}
        className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white">
        <option value="">—</option>
        {field.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (field.type === 'date') {
    return (
      <input type="date" value={value ?? ''} onChange={e => onChange(e.target.value)}
        className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
    );
  }
  return (
    <input type="text" value={value ?? ''} onChange={e => onChange(e.target.value)}
      className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
  );
}

function DisplayValue({ field, value }) {
  if (field.type === 'boolean') return <span className="text-gray-500">{value ? '✓' : ''}</span>;
  if (field.type === 'date')    return <span>{value ? String(value).slice(0, 10) : ''}</span>;
  if (field.type === 'select' && value) {
    const color =
      value === 'Available'                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
      value === 'In Use' || value === 'Used'   ? 'bg-blue-50 text-blue-700 border-blue-200' :
      value === 'Burned' || value === 'Exhausted' ? 'bg-red-50 text-red-700 border-red-200' :
      'bg-gray-100 text-gray-600 border-gray-200';
    return <span className={`inline-flex text-xs px-1.5 py-0.5 rounded border font-medium ${color}`}>{value}</span>;
  }
  return <span className="truncate block max-w-xs" title={value ?? ''}>{value ?? ''}</span>;
}

// ── Table ─────────────────────────────────────────────────────────────────────

function TrackerTable({ cfg }) {
  const qc = useQueryClient();
  const [page, setPage]           = useState(1);
  const [search, setSearch]       = useState('');
  const [sort, setSort]           = useState('');
  const [dir, setDir]             = useState('asc');
  const [adding, setAdding]       = useState(false);
  const [newRow, setNewRow]       = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editRow, setEditRow]     = useState({});

  useEffect(() => {
    setPage(1); setSearch(''); setSort('');
    setAdding(false); setEditingId(null);
  }, [cfg.key]);

  const { data, isLoading } = useQuery({
    queryKey: ['tracker', cfg.key, page, search, sort, dir],
    queryFn:  () => api.getTrackerRows(cfg.key, { page, pageSize: 50, search: search || undefined, sort: sort || undefined, dir }),
    keepPreviousData: true,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tracker', cfg.key] });

  const createMut = useMutation({
    mutationFn: d => api.createTrackerRow(cfg.key, d),
    onSuccess:  () => { invalidate(); setAdding(false); setNewRow({}); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }) => api.updateTrackerRow(cfg.key, id, d),
    onSuccess:  () => { invalidate(); setEditingId(null); },
  });
  const deleteMut = useMutation({ mutationFn: id => api.deleteTrackerRow(cfg.key, id), onSuccess: invalidate });

  function toggleSort(key) {
    if (sort === key) setDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSort(key); setDir('asc'); }
    setPage(1);
  }

  const rows       = data?.rows       ?? [];
  const total      = data?.total      ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder={`Search ${cfg.primaryField}…`}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <span className="text-xs text-gray-400 ml-auto">{total.toLocaleString()} rows</span>
        <button
          onClick={() => { setAdding(true); setNewRow({}); }}
          disabled={adding}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add row
        </button>
      </div>

      {createMut.error && <p className="text-xs text-red-600">{createMut.error.message}</p>}
      {updateMut.error && <p className="text-xs text-red-600">{updateMut.error.message}</p>}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {cfg.fields.map(f => (
                <th
                  key={f.key}
                  onClick={() => toggleSort(f.key)}
                  className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap cursor-pointer hover:text-gray-800 select-none"
                >
                  {f.label}
                  {sort === f.key && <span className="ml-1 text-indigo-500">{dir === 'asc' ? '▲' : '▼'}</span>}
                  {sort !== f.key && <span className="ml-1 text-gray-300">⇅</span>}
                </th>
              ))}
              <th className="px-3 py-2.5 w-24" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {adding && (
              <tr className="bg-indigo-50/50">
                {cfg.fields.map(f => (
                  <td key={f.key} className="px-2 py-2">
                    <FieldInput field={f} value={newRow[f.key]} onChange={v => setNewRow(r => ({ ...r, [f.key]: v }))} />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <div className="flex gap-1">
                    <button
                      onClick={() => createMut.mutate(newRow)}
                      disabled={createMut.isPending}
                      className="text-xs px-2.5 py-1 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {createMut.isPending ? '…' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setAdding(false); setNewRow({}); }}
                      className="text-xs px-2.5 py-1 border border-gray-200 text-gray-500 rounded-md hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {isLoading && (
              <tr>
                <td colSpan={cfg.fields.length + 1} className="px-4 py-10 text-center text-sm text-gray-400">
                  Loading…
                </td>
              </tr>
            )}

            {!isLoading && rows.length === 0 && !adding && (
              <tr>
                <td colSpan={cfg.fields.length + 1} className="px-4 py-10 text-center text-sm text-gray-400">
                  No entries yet — click <strong>Add row</strong> to start tracking
                </td>
              </tr>
            )}

            {rows.map(row => (
              <tr key={row.id} className="hover:bg-gray-50 group transition-colors">
                {cfg.fields.map(f => (
                  <td key={f.key} className="px-3 py-2.5 text-xs text-gray-700">
                    {editingId === row.id
                      ? <FieldInput field={f} value={editRow[f.key]} onChange={v => setEditRow(r => ({ ...r, [f.key]: v }))} />
                      : <DisplayValue field={f} value={row[f.key]} />
                    }
                  </td>
                ))}
                <td className="px-2 py-2.5">
                  {editingId === row.id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => updateMut.mutate({ id: row.id, d: editRow })}
                        disabled={updateMut.isPending}
                        className="text-xs px-2.5 py-1 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {updateMut.isPending ? '…' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs px-2.5 py-1 border border-gray-200 text-gray-500 rounded-md hover:bg-gray-50"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditingId(row.id); setEditRow({ ...row }); }}
                        className="text-xs px-2.5 py-1 text-gray-500 hover:text-indigo-600 border border-gray-200 rounded-md hover:border-indigo-300 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => window.confirm('Delete this row?') && deleteMut.mutate(row.id)}
                        className="text-xs px-2 py-1 text-gray-400 hover:text-red-600 border border-gray-200 rounded-md hover:border-red-200 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            ← Prev
          </button>
          <span className="text-xs text-gray-500">Page {page} of {totalPages} · {total.toLocaleString()} rows</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const GROUP_ORDER = ['Lists', 'UPM', 'Techstar', 'Todd', 'Phone Numbers'];

export default function DataTrackerPage({ tableKey }) {
  const navigate = useNavigate();

  const { data: meta = [], isLoading } = useQuery({
    queryKey: ['tracker', 'meta'],
    queryFn:  () => api.getTrackerMeta(),
    staleTime: Infinity,
  });

  // Build group map
  const grouped = {};
  for (const t of meta) {
    if (!grouped[t.group]) grouped[t.group] = [];
    grouped[t.group].push(t);
  }
  const groups = GROUP_ORDER.filter(g => grouped[g]);

  // Determine active table
  const activeCfg = meta.find(t => t.key === tableKey) ?? meta[0];
  const activeGroup = activeCfg?.group ?? groups[0];

  // When group tab switches, navigate to its first table
  function selectGroup(group) {
    const first = grouped[group]?.[0];
    if (first) navigate(`/tools/data-tracker/${first.key}`);
  }

  function selectTable(key) {
    navigate(`/tools/data-tracker/${key}`);
  }

  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-2 text-sm text-gray-400">
        <span className="w-4 h-4 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
        Loading tracker…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 pt-6 pb-0 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-bold text-gray-900 mb-4">Data Tracker</h1>

        {/* Group tabs */}
        <div className="flex gap-1 -mb-px">
          {groups.map(group => (
            <button
              key={group}
              onClick={() => selectGroup(group)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                group === activeGroup
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {group}
            </button>
          ))}
        </div>
      </div>

      {/* Table sub-tabs */}
      {activeGroup && grouped[activeGroup] && (
        <div className="px-6 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-1.5 flex-wrap">
          {grouped[activeGroup].map(t => (
            <button
              key={t.key}
              onClick={() => selectTable(t.key)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                t.key === activeCfg?.key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Table content */}
      <div className="flex-1 overflow-auto p-6">
        {activeCfg && <TrackerTable key={activeCfg.key} cfg={activeCfg} />}
      </div>
    </div>
  );
}
