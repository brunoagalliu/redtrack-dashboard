import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

// ── Cell input ────────────────────────────────────────────────────────────────

function CellInput({ field, value, onChange, onCommit, onCancel, onTab, autoFocus }) {
  const ref = useRef(null);

  useEffect(() => { if (autoFocus && ref.current) ref.current.focus(); }, [autoFocus]);

  function handleKey(e) {
    if (e.key === 'Enter')  { e.preventDefault(); onCommit?.('enter'); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel?.(); }
    if (e.key === 'Tab')    { e.preventDefault(); onTab?.(e.shiftKey ? -1 : 1); }
  }

  if (field.type === 'boolean') {
    return (
      <input ref={ref} type="checkbox" checked={!!value}
        onChange={e => { onChange(e.target.checked); onCommit?.('check'); }}
        onKeyDown={handleKey}
        className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
    );
  }
  if (field.type === 'select') {
    return (
      <select ref={ref} value={value ?? ''} onChange={e => onChange(e.target.value)}
        onKeyDown={handleKey} onBlur={() => onCommit?.('blur')}
        className="w-full text-xs border-0 bg-transparent focus:outline-none focus:ring-0 p-0 cursor-pointer">
        <option value="">—</option>
        {field.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (field.type === 'date') {
    return (
      <input ref={ref} type="date" value={value ?? ''} onChange={e => onChange(e.target.value)}
        onKeyDown={handleKey} onBlur={() => onCommit?.('blur')}
        className="w-full text-xs border-0 bg-transparent focus:outline-none p-0" />
    );
  }
  return (
    <input ref={ref} type="text" value={value ?? ''} onChange={e => onChange(e.target.value)}
      onKeyDown={handleKey} onBlur={() => onCommit?.('blur')}
      className="w-full text-xs border-0 bg-transparent focus:outline-none p-0" />
  );
}

// ── Display value ─────────────────────────────────────────────────────────────

function DisplayCell({ field, value }) {
  if (field.type === 'boolean') {
    return <span className={`text-xs ${value ? 'text-emerald-600' : 'text-gray-300'}`}>{value ? '✓' : '—'}</span>;
  }
  if (field.type === 'date') {
    return <span className="text-xs text-gray-600">{value ? String(value).slice(0, 10) : ''}</span>;
  }
  if (field.type === 'select' && value) {
    const color =
      value === 'Available'                       ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
      value === 'In Use' || value === 'Used'      ? 'bg-blue-50 text-blue-700 border-blue-200'         :
      value === 'Burned' || value === 'Exhausted' ? 'bg-red-50 text-red-700 border-red-200'            :
      'bg-gray-100 text-gray-600 border-gray-200';
    return <span className={`inline-flex text-xs px-1.5 py-0.5 rounded border font-medium ${color}`}>{value}</span>;
  }
  return <span className="text-xs text-gray-700 truncate block max-w-xs" title={value ?? ''}>{value ?? ''}</span>;
}

// ── Spreadsheet table ─────────────────────────────────────────────────────────

function TrackerTable({ cfg }) {
  const qc = useQueryClient();

  // Pagination / search / sort
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState('');
  const [sort, setSort]     = useState('');
  const [dir, setDir]       = useState('asc');

  // Active cell: { rowId: number|'new', fieldIdx: number }
  const [activeCell, setActiveCell] = useState(null);
  // Pending edits for the currently active row
  const [draft, setDraft]   = useState({});
  // New-row draft
  const [newDraft, setNewDraft] = useState({});
  // Paste status
  const [pasteMsg, setPasteMsg] = useState('');

  const fields = cfg.fields;

  useEffect(() => {
    setPage(1); setSearch(''); setSort('');
    setActiveCell(null); setDraft({}); setNewDraft({});
  }, [cfg.key]);

  const { data, isLoading } = useQuery({
    queryKey: ['tracker', cfg.key, page, search, sort, dir],
    queryFn:  () => api.getTrackerRows(cfg.key, { page, pageSize: 50, search: search || undefined, sort: sort || undefined, dir }),
    keepPreviousData: true,
  });

  const rows       = data?.rows       ?? [];
  const total      = data?.total      ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: ['tracker', cfg.key] }), [qc, cfg.key]);

  const createMut = useMutation({ mutationFn: d => api.createTrackerRow(cfg.key, d), onSuccess: invalidate });
  const updateMut = useMutation({ mutationFn: ({ id, d }) => api.updateTrackerRow(cfg.key, id, d), onSuccess: invalidate });
  const deleteMut = useMutation({ mutationFn: id => api.deleteTrackerRow(cfg.key, id), onSuccess: invalidate });
  const batchMut  = useMutation({ mutationFn: rows => api.createTrackerRows(cfg.key, rows), onSuccess: () => { invalidate(); setPasteMsg(''); } });

  // ── Cell navigation helpers ───────────────────────────────────────────────

  function cellKey(rowId, fieldIdx) { return { rowId, fieldIdx }; }

  function isActive(rowId, fieldIdx) {
    return activeCell?.rowId === rowId && activeCell?.fieldIdx === fieldIdx;
  }

  function activate(rowId, fieldIdx, row) {
    // If leaving a different existing row, save it
    if (activeCell && activeCell.rowId !== rowId && activeCell.rowId !== 'new') {
      const prevRow = rows.find(r => r.id === activeCell.rowId);
      if (prevRow && Object.keys(draft).length > 0) {
        updateMut.mutate({ id: activeCell.rowId, d: draft });
      }
    }
    // If leaving the new row
    if (activeCell && activeCell.rowId === 'new' && rowId !== 'new') {
      commitNewRow();
    }
    if (rowId === activeCell?.rowId) {
      setActiveCell({ rowId, fieldIdx });
    } else {
      setActiveCell({ rowId, fieldIdx });
      setDraft(rowId !== 'new' && row ? { ...row } : {});
    }
  }

  function commitNewRow() {
    const primaryField = cfg.primaryField;
    if (newDraft[primaryField]) {
      createMut.mutate(newDraft);
      setNewDraft({});
    }
  }

  function saveActiveRow() {
    if (!activeCell) return;
    if (activeCell.rowId === 'new') {
      commitNewRow();
    } else {
      if (Object.keys(draft).length > 0) {
        updateMut.mutate({ id: activeCell.rowId, d: draft });
      }
    }
    setActiveCell(null);
    setDraft({});
  }

  function cancelEdit() {
    setActiveCell(null);
    setDraft({});
  }

  function tabMove(rowId, fieldIdx, delta) {
    const nextIdx = fieldIdx + delta;
    if (nextIdx >= 0 && nextIdx < fields.length) {
      setActiveCell({ rowId, fieldIdx: nextIdx });
    } else {
      // Wrap to next/prev row
      if (rowId === 'new') {
        if (delta > 0) saveActiveRow();
        return;
      }
      const rowIndex = rows.findIndex(r => r.id === rowId);
      if (delta > 0) {
        // Next row
        if (rowIndex < rows.length - 1) {
          const nextRow = rows[rowIndex + 1];
          if (Object.keys(draft).length > 0) updateMut.mutate({ id: rowId, d: draft });
          setActiveCell({ rowId: nextRow.id, fieldIdx: 0 });
          setDraft({ ...nextRow });
        } else {
          // Move to new row
          if (Object.keys(draft).length > 0) updateMut.mutate({ id: rowId, d: draft });
          setActiveCell({ rowId: 'new', fieldIdx: 0 });
          setDraft({});
        }
      } else {
        // Prev row
        if (rowIndex > 0) {
          const prevRow = rows[rowIndex - 1];
          if (Object.keys(draft).length > 0) updateMut.mutate({ id: rowId, d: draft });
          setActiveCell({ rowId: prevRow.id, fieldIdx: fields.length - 1 });
          setDraft({ ...prevRow });
        }
      }
    }
  }

  function enterMove(rowId, fieldIdx) {
    if (rowId === 'new') { saveActiveRow(); return; }
    const rowIndex = rows.findIndex(r => r.id === rowId);
    if (rowIndex < rows.length - 1) {
      const nextRow = rows[rowIndex + 1];
      if (Object.keys(draft).length > 0) updateMut.mutate({ id: rowId, d: draft });
      setActiveCell({ rowId: nextRow.id, fieldIdx });
      setDraft({ ...nextRow });
    } else {
      if (Object.keys(draft).length > 0) updateMut.mutate({ id: rowId, d: draft });
      setActiveCell({ rowId: 'new', fieldIdx });
      setDraft({});
    }
  }

  // ── Paste from Excel ──────────────────────────────────────────────────────

  useEffect(() => {
    function onPaste(e) {
      // Only handle when focused within this component
      const text = e.clipboardData?.getData('text');
      if (!text || !text.includes('\t')) return;

      const lines = text.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length === 0) return;

      const parsed = lines.map(line => {
        const vals = line.split('\t');
        const row = {};
        fields.forEach((f, i) => {
          const v = vals[i]?.trim();
          if (!v) return;
          if (f.type === 'boolean') row[f.key] = v.toLowerCase() === 'true' || v === '1' || v.toLowerCase() === 'yes';
          else row[f.key] = v;
        });
        return row;
      }).filter(r => Object.values(r).some(Boolean));

      if (parsed.length === 0) return;
      e.preventDefault();

      if (parsed.length === 1) {
        // Single row — fill into new row draft
        setNewDraft(parsed[0]);
        setActiveCell({ rowId: 'new', fieldIdx: 0 });
      } else {
        // Multiple rows — batch insert
        setPasteMsg(`Pasting ${parsed.length} rows…`);
        batchMut.mutate(parsed);
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [fields, batchMut]);

  // ── Sorting ───────────────────────────────────────────────────────────────

  function toggleSort(key) {
    if (sort === key) setDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSort(key); setDir('asc'); }
    setPage(1);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <input
          type="text"
          placeholder={`Search ${cfg.primaryField}…`}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="text-xs border border-gray-200 rounded px-2.5 py-1.5 w-52 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {pasteMsg && <span className="text-xs text-indigo-600">{pasteMsg}</span>}
        <span className="text-xs text-gray-400 ml-auto">{total.toLocaleString()} rows</span>
        <span className="text-xs text-gray-300">· Paste Excel rows directly into the table</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto border border-gray-200 rounded-lg bg-white">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 border-b border-gray-200">
              {fields.map(f => (
                <th
                  key={f.key}
                  onClick={() => toggleSort(f.key)}
                  className="px-2 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap cursor-pointer hover:text-gray-800 select-none border-r border-gray-100 last:border-r-0"
                >
                  {f.label}
                  {sort === f.key
                    ? <span className="ml-1 text-indigo-400">{dir === 'asc' ? '▲' : '▼'}</span>
                    : <span className="ml-1 text-gray-200">⇅</span>}
                </th>
              ))}
              <th className="w-8 px-1 py-1.5 bg-gray-50" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={fields.length + 1} className="px-3 py-8 text-center text-gray-400">Loading…</td>
              </tr>
            )}

            {rows.map((row, rowIdx) => {
              const isRowActive = activeCell?.rowId === row.id;
              return (
                <tr
                  key={row.id}
                  className={`border-b border-gray-100 group ${isRowActive ? 'bg-indigo-50/40' : 'hover:bg-gray-50/60'}`}
                >
                  {fields.map((f, fi) => {
                    const cellActive = isActive(row.id, fi);
                    const val = isRowActive ? (draft[f.key] ?? '') : (row[f.key] ?? '');
                    return (
                      <td
                        key={f.key}
                        onClick={() => !cellActive && activate(row.id, fi, row)}
                        className={`px-2 py-0.5 border-r border-gray-100 last:border-r-0 cursor-default ${
                          cellActive ? 'bg-white ring-1 ring-inset ring-indigo-400' : ''
                        } ${f.type === 'boolean' ? 'text-center w-12' : ''}`}
                      >
                        {cellActive
                          ? <CellInput
                              field={f}
                              value={isRowActive ? (draft[f.key] ?? '') : (row[f.key] ?? '')}
                              autoFocus
                              onChange={v => setDraft(d => ({ ...d, [f.key]: v }))}
                              onCommit={reason => { if (reason === 'enter') enterMove(row.id, fi); else if (reason === 'blur') {} }}
                              onCancel={cancelEdit}
                              onTab={delta => tabMove(row.id, fi, delta)}
                            />
                          : <DisplayCell field={f} value={row[f.key]} />
                        }
                      </td>
                    );
                  })}
                  <td className="px-1 py-0.5 w-8">
                    <button
                      onClick={() => window.confirm('Delete this row?') && deleteMut.mutate(row.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all text-xs"
                    >✕</button>
                  </td>
                </tr>
              );
            })}

            {/* New row */}
            <tr
              className={`border-b border-gray-100 border-dashed ${activeCell?.rowId === 'new' ? 'bg-indigo-50/40' : 'hover:bg-gray-50/40'}`}
            >
              {fields.map((f, fi) => {
                const cellActive = isActive('new', fi);
                return (
                  <td
                    key={f.key}
                    onClick={() => !cellActive && activate('new', fi, null)}
                    className={`px-2 py-0.5 border-r border-gray-100 last:border-r-0 cursor-text ${
                      cellActive ? 'bg-white ring-1 ring-inset ring-indigo-400' : ''
                    }`}
                  >
                    {cellActive
                      ? <CellInput
                          field={f}
                          value={newDraft[f.key] ?? ''}
                          autoFocus
                          onChange={v => setNewDraft(d => ({ ...d, [f.key]: v }))}
                          onCommit={reason => { if (reason === 'enter') { commitNewRow(); setActiveCell(null); } }}
                          onCancel={() => { setActiveCell(null); setNewDraft({}); }}
                          onTab={delta => {
                            const next = fi + delta;
                            if (next >= 0 && next < fields.length) {
                              setActiveCell({ rowId: 'new', fieldIdx: next });
                            } else if (delta > 0) {
                              commitNewRow();
                              setActiveCell(null);
                            }
                          }}
                        />
                      : <span className="text-gray-300 text-xs select-none">
                          {fi === 0 ? '+ new row…' : ''}
                        </span>
                    }
                  </td>
                );
              })}
              <td className="w-8 px-1" />
            </tr>

            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={fields.length + 1} className="px-3 py-8 text-center text-gray-400">
                  No entries yet — click any cell in the row above to start, or paste rows from Excel
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between flex-shrink-0">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="text-xs px-2.5 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">
            ← Prev
          </button>
          <span className="text-xs text-gray-500">Page {page} of {totalPages} · {total.toLocaleString()} rows</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="text-xs px-2.5 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40">
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

  const grouped = {};
  for (const t of meta) {
    if (!grouped[t.group]) grouped[t.group] = [];
    grouped[t.group].push(t);
  }
  const groups = GROUP_ORDER.filter(g => grouped[g]);

  const activeCfg  = meta.find(t => t.key === tableKey) ?? meta[0];
  const activeGroup = activeCfg?.group ?? groups[0];

  function selectGroup(group) {
    const first = grouped[group]?.[0];
    if (first) navigate(`/tools/data-tracker/${first.key}`);
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
    <div className="flex flex-col" style={{ height: 'calc(100vh - 0px)' }}>
      {/* Header + group tabs */}
      <div className="px-6 pt-5 pb-0 border-b border-gray-200 bg-white flex-shrink-0">
        <h1 className="text-lg font-bold text-gray-900 mb-3">Data Tracker</h1>
        <div className="flex gap-1 -mb-px">
          {groups.map(group => (
            <button key={group} onClick={() => selectGroup(group)}
              className={`px-4 py-1.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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

      {/* Sub-tabs */}
      {activeGroup && grouped[activeGroup] && (
        <div className="px-6 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-1.5 flex-wrap flex-shrink-0">
          {grouped[activeGroup].map(t => (
            <button key={t.key} onClick={() => navigate(`/tools/data-tracker/${t.key}`)}
              className={`px-3 py-0.5 text-xs font-medium rounded-full transition-colors ${
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

      {/* Table */}
      <div className="flex-1 overflow-hidden p-4">
        {activeCfg && <TrackerTable key={activeCfg.key} cfg={activeCfg} />}
      </div>
    </div>
  );
}
