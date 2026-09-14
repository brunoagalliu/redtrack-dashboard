import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getToken } from '../lib/api';
import { useTrackerSocket } from '../lib/useTrackerSocket';

function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

function HistoryModal({ cfg, row, fields, onClose, onRestore }) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['tracker-history', cfg.key, row.id],
    queryFn:  () => api.getRowHistory(cfg.key, row.id),
    refetchOnWindowFocus: false,
  });

  const primaryVal = row[cfg.primaryField] ?? `#${row.id}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="font-semibold text-gray-900 text-sm">Change history</p>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{primaryVal}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
          {isLoading && <p className="px-5 py-6 text-xs text-gray-400">Loading…</p>}
          {!isLoading && history.length === 0 && (
            <p className="px-5 py-6 text-xs text-gray-400">No changes recorded yet.</p>
          )}
          {history.map(entry => {
            const changed = fields.filter(f => {
              const b = String(entry.before_data?.[f.key] ?? '');
              const a = String(entry.after_data?.[f.key]  ?? '');
              return b !== a;
            });
            return (
              <div key={entry.id} className="px-5 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">{timeAgo(entry.changed_at)}</span>
                  <button
                    onClick={() => onRestore(entry.before_data)}
                    className="text-xs px-2 py-0.5 border border-gray-200 rounded text-gray-600 hover:bg-gray-50"
                  >
                    Restore to before this
                  </button>
                </div>
                {changed.length === 0
                  ? <p className="text-xs text-gray-300 italic">No field changes detected</p>
                  : changed.map(f => (
                    <div key={f.key} className="flex items-baseline gap-1.5 text-xs">
                      <span className="text-gray-400 w-24 shrink-0">{f.label}</span>
                      <span className="text-red-500 line-through truncate max-w-[140px]"
                            title={String(entry.before_data?.[f.key] ?? '')}>
                        {String(entry.before_data?.[f.key] ?? '—')}
                      </span>
                      <span className="text-gray-300">→</span>
                      <span className="text-emerald-700 truncate max-w-[140px]"
                            title={String(entry.after_data?.[f.key] ?? '')}>
                        {String(entry.after_data?.[f.key] ?? '—')}
                      </span>
                    </div>
                  ))
                }
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

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
      <input ref={ref} type="text" value={value ?? ''} placeholder="YYYY-MM-DD"
        onChange={e => onChange(e.target.value)}
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
  // Conflict: { serverRow, myDraft } — shown when a save is rejected due to version mismatch
  const [conflict, setConflict] = useState(null);
  // Undo / redo stacks (session-local)
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const isUndoRedoOp = useRef(false);
  const originalRowRef = useRef(null); // row state captured when edit begins
  // History modal
  const [historyRow, setHistoryRow] = useState(null);
  // Selection: { anchor: {ri, fi}, focus: {ri, fi} } — row indices in current page
  const [selAnchor, setSelAnchor] = useState(null);
  const [selFocus, setSelFocus]   = useState(null);
  const isDragging = useRef(false);

  const fields = cfg.fields;

  useEffect(() => {
    setPage(1); setSearch(''); setSort('');
    setActiveCell(null); setDraft({}); setNewDraft({});
    setSelAnchor(null); setSelFocus(null);
    undoStack.current = []; redoStack.current = [];
    setUndoCount(0); setRedoCount(0);
  }, [cfg.key]);

  // ── Selection helpers ─────────────────────────────────────────────────────

  function selRange() {
    if (!selAnchor || !selFocus) return null;
    return {
      r1: Math.min(selAnchor.ri, selFocus.ri), r2: Math.max(selAnchor.ri, selFocus.ri),
      f1: Math.min(selAnchor.fi, selFocus.fi), f2: Math.max(selAnchor.fi, selFocus.fi),
    };
  }

  function inSel(ri, fi) {
    const r = selRange();
    return r && ri >= r.r1 && ri <= r.r2 && fi >= r.f1 && fi <= r.f2;
  }

  function isMultiSel() {
    const r = selRange();
    return r && (r.r1 !== r.r2 || r.f1 !== r.f2);
  }

  function selectedRowIds() {
    const r = selRange();
    if (!r) return [];
    return rows.slice(r.r1, r.r2 + 1).map(row => row.id);
  }

  // ── Autofill ──────────────────────────────────────────────────────────────

  const isFillDragging = useRef(false);
  const [fillEnd, setFillEnd] = useState(null); // row index the fill extends to

  function inFillPreview(ri) {
    const r = selRange();
    return r && fillEnd !== null && ri > r.r2 && ri <= fillEnd;
  }

  function computeFill(sourceVals, count) {
    if (sourceVals.length === 0 || count === 0) return [];
    if (sourceVals.length === 1) return Array(count).fill(sourceVals[0]);

    // Date sequence
    const dates = sourceVals.map(v => v ? new Date(v) : null);
    if (dates.every(d => d && !isNaN(d))) {
      const diffs = dates.slice(1).map((d, i) => d - dates[i]);
      const step  = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const last  = dates[dates.length - 1];
      return Array.from({ length: count }, (_, i) =>
        new Date(last.getTime() + step * (i + 1)).toISOString().slice(0, 10)
      );
    }
    // Numeric sequence
    const nums = sourceVals.map(Number);
    if (nums.every(n => !isNaN(n) && sourceVals[nums.indexOf(n)] !== '')) {
      const diffs = nums.slice(1).map((n, i) => n - nums[i]);
      const step  = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const last  = nums[nums.length - 1];
      return Array.from({ length: count }, (_, i) => String(last + step * (i + 1)));
    }
    // Repeat last value
    return Array(count).fill(sourceVals[sourceVals.length - 1]);
  }

  function applyFill() {
    const r = selRange();
    if (!r || fillEnd === null || fillEnd <= r.r2) { setFillEnd(null); return; }
    const count = fillEnd - r.r2;
    for (let fi = r.f1; fi <= r.f2; fi++) {
      const field = fields[fi];
      const sourceVals = rows.slice(r.r1, r.r2 + 1).map(row => String(row[field.key] ?? ''));
      const fillVals   = computeFill(sourceVals, count);
      fillVals.forEach((val, i) => {
        const targetRow = rows[r.r2 + 1 + i];
        if (targetRow) {
          const updated = { ...targetRow, [field.key]: val };
          updateMut.mutate({ id: targetRow.id, d: updated, myDraft: updated });
        }
      });
    }
    setFillEnd(null);
  }

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
  const deleteMut = useMutation({ mutationFn: id => api.deleteTrackerRow(cfg.key, id), onSuccess: invalidate });

  const updateMut = useMutation({
    mutationFn: async ({ id, d, myDraft, skipVersionCheck }) => {
      const body = { ...d };
      if (!skipVersionCheck) body.__version = d.version ?? null;
      const res = await fetch(`/api/tracker/${cfg.key}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        const payload = await res.json();
        return { __conflict: true, serverRow: payload.current, myDraft: myDraft ?? d };
      }
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (result, vars) => {
      if (result?.__conflict) {
        setConflict({ serverRow: result.serverRow, myDraft: result.myDraft });
        setActiveCell(null);
        setDraft({});
        return;
      }
      // Push to undo stack (skip for undo/redo ops themselves)
      if (!isUndoRedoOp.current && originalRowRef.current && originalRowRef.current.id === vars.id) {
        const entry = { before: originalRowRef.current, after: result };
        undoStack.current = [...undoStack.current.slice(-49), entry];
        redoStack.current = [];
        setUndoCount(undoStack.current.length);
        setRedoCount(0);
      }
      isUndoRedoOp.current = false;
      originalRowRef.current = null;
      invalidate();
    },
  });
  const batchMut      = useMutation({ mutationFn: rows => api.createTrackerRows(cfg.key, rows), onSuccess: () => { invalidate(); setPasteMsg(''); } });
  const bulkDeleteMut = useMutation({ mutationFn: ids => api.deleteTrackerRows(cfg.key, ids), onSuccess: () => { invalidate(); setSelAnchor(null); setSelFocus(null); } });

  // ── Real-time sync via WebSocket ──────────────────────────────────────────
  useTrackerSocket(cfg.key, msg => {
    qc.setQueriesData({ queryKey: ['tracker', cfg.key] }, old => {
      if (!old?.rows) return old;
      if (msg.action === 'update') {
        // If the row being edited by this client just came back from the server, skip
        // (our own mutation already updated optimistically via invalidate)
        return { ...old, rows: old.rows.map(r => String(r.id) === String(msg.row.id) ? msg.row : r) };
      }
      if (msg.action === 'delete') {
        return { ...old, rows: old.rows.filter(r => String(r.id) !== String(msg.id)), total: Math.max(0, old.total - 1) };
      }
      if (msg.action === 'create') {
        // New row: just invalidate so it shows up at the right page/sort position
        invalidate();
      }
      return old;
    });
  });

  // ── Cell navigation helpers ───────────────────────────────────────────────

  function cellKey(rowId, fieldIdx) { return { rowId, fieldIdx }; }

  function isActive(rowId, fieldIdx) {
    return activeCell?.rowId === rowId && activeCell?.fieldIdx === fieldIdx;
  }

  function activate(rowId, fieldIdx, row) {
    // Capture original state for undo
    if (row && rowId !== 'new') originalRowRef.current = { ...row };

    // If leaving a different existing row, save it
    if (activeCell && activeCell.rowId !== rowId && activeCell.rowId !== 'new') {
      const prevRow = rows.find(r => r.id === activeCell.rowId);
      if (prevRow && Object.keys(draft).length > 0) {
        updateMut.mutate({ id: activeCell.rowId, d: draft, myDraft: draft });
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
        updateMut.mutate({ id: activeCell.rowId, d: draft, myDraft: draft });
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
          if (Object.keys(draft).length > 0) updateMut.mutate({ id: rowId, d: draft, myDraft: draft });
          setActiveCell({ rowId: nextRow.id, fieldIdx: 0 });
          setDraft({ ...nextRow });
        } else {
          // Move to new row
          if (Object.keys(draft).length > 0) updateMut.mutate({ id: rowId, d: draft, myDraft: draft });
          setActiveCell({ rowId: 'new', fieldIdx: 0 });
          setDraft({});
        }
      } else {
        // Prev row
        if (rowIndex > 0) {
          const prevRow = rows[rowIndex - 1];
          if (Object.keys(draft).length > 0) updateMut.mutate({ id: rowId, d: draft, myDraft: draft });
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
      if (Object.keys(draft).length > 0) updateMut.mutate({ id: rowId, d: draft, myDraft: draft });
      setActiveCell({ rowId: nextRow.id, fieldIdx });
      setDraft({ ...nextRow });
    } else {
      if (Object.keys(draft).length > 0) updateMut.mutate({ id: rowId, d: draft, myDraft: draft });
      setActiveCell({ rowId: 'new', fieldIdx });
      setDraft({});
    }
  }

  // ── Paste from Excel ──────────────────────────────────────────────────────

  useEffect(() => {
    function onPaste(e) {
      const text = e.clipboardData?.getData('text');
      if (!text) return;

      const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
      if (lines.length === 0) return;

      let parsed;
      if (text.includes('\t')) {
        // Multi-column TSV (from Excel or tracker copy)
        parsed = lines.map(line => {
          const vals = line.split('\t');
          const row = {};
          fields.forEach((f, i) => {
            const v = vals[i]?.trim();
            if (!v) return;
            if (f.type === 'boolean') row[f.key] = v.toLowerCase() === 'true' || v === '1' || v.toLowerCase() === 'yes';
            else row[f.key] = v;
          });
          return row;
        }).filter(r => r[cfg.primaryField]); // skip rows with no primary field value
      } else if (lines.length > 1) {
        // Plain newline list — fill the primary field of each row
        parsed = lines
          .map(l => l.trim())
          .filter(Boolean)
          .map(v => ({ [cfg.primaryField]: v }));
      } else {
        // Single value with no tabs — let the browser paste it into the focused input
        return;
      }

      if (parsed.length === 0) return;
      e.preventDefault();

      if (parsed.length === 1) {
        setNewDraft(parsed[0]);
        setActiveCell({ rowId: 'new', fieldIdx: 0 });
      } else {
        setPasteMsg(`Pasting ${parsed.length} rows…`);
        batchMut.mutate(parsed);
      }
    }
    document.addEventListener('paste', onPaste, true); // capture phase — fires before any input receives it
    return () => document.removeEventListener('paste', onPaste, true);
  }, [fields, batchMut]);

  // ── Global mouseup to end drag ────────────────────────────────────────────

  useEffect(() => {
    function up() {
      if (isFillDragging.current) {
        isFillDragging.current = false;
        applyFill();
      }
      isDragging.current = false;
    }
    document.addEventListener('mouseup', up);
    return () => document.removeEventListener('mouseup', up);
  }, [rows, selAnchor, selFocus, fillEnd]);

  // ── Copy selection ────────────────────────────────────────────────────────

  useEffect(() => {
    function onCopy(e) {
      if (!isMultiSel()) return; // let native handle single-cell or no selection
      e.preventDefault();
      const r = selRange();
      const lines = [];
      for (let ri = r.r1; ri <= r.r2; ri++) {
        const row = rows[ri];
        if (!row) continue;
        const cells = [];
        for (let fi = r.f1; fi <= r.f2; fi++) {
          const field = fields[fi];
          const val = row[field.key];
          cells.push(val === null || val === undefined ? '' : String(val));
        }
        lines.push(cells.join('\t'));
      }
      const tsv = lines.join('\n');
      e.clipboardData.setData('text/plain', tsv);
      setPasteMsg(`Copied ${lines.length} row${lines.length > 1 ? 's' : ''} · ${r.f2 - r.f1 + 1} col${r.f2 - r.f1 + 1 > 1 ? 's' : ''}`);
      setTimeout(() => setPasteMsg(''), 2000);
    }
    document.addEventListener('copy', onCopy);
    return () => document.removeEventListener('copy', onCopy);
  }, [rows, fields, selAnchor, selFocus]);

  // ── Undo / Redo ───────────────────────────────────────────────────────────

  function applySnapshot(snapshot, skipVersionCheck = true) {
    const { version: _v, id: _id, created_at: _c, updated_at: _u, ...fields } = snapshot;
    updateMut.mutate({ id: snapshot.id, d: fields, myDraft: fields, skipVersionCheck });
  }

  function handleUndo() {
    if (undoStack.current.length === 0) return;
    const entry = undoStack.current[undoStack.current.length - 1];
    undoStack.current = undoStack.current.slice(0, -1);
    redoStack.current = [...redoStack.current.slice(-49), entry];
    setUndoCount(undoStack.current.length);
    setRedoCount(redoStack.current.length);
    isUndoRedoOp.current = true;
    applySnapshot(entry.before);
  }

  function handleRedo() {
    if (redoStack.current.length === 0) return;
    const entry = redoStack.current[redoStack.current.length - 1];
    redoStack.current = redoStack.current.slice(0, -1);
    undoStack.current = [...undoStack.current.slice(-49), entry];
    setUndoCount(undoStack.current.length);
    setRedoCount(redoStack.current.length);
    isUndoRedoOp.current = true;
    applySnapshot(entry.after);
  }

  function handleRestore(snapshot) {
    api.restoreRow(cfg.key, snapshot.id ?? historyRow?.id, snapshot)
      .then(() => { invalidate(); setHistoryRow(null); })
      .catch(err => alert('Restore failed: ' + err.message));
  }

  useEffect(() => {
    function onKey(e) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); handleRedo(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []); // refs don't need deps

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

        <div className="flex items-center gap-1 ml-auto">
          <button onClick={handleUndo} disabled={undoCount === 0}
            title="Undo (⌘Z)"
            className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1">
            ↩ {undoCount > 0 && <span className="text-gray-400">{undoCount}</span>}
          </button>
          <button onClick={handleRedo} disabled={redoCount === 0}
            title="Redo (⌘Y)"
            className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1">
            ↪ {redoCount > 0 && <span className="text-gray-400">{redoCount}</span>}
          </button>
        </div>

        <span className="text-xs text-gray-400">{total.toLocaleString()} rows</span>
        {isMultiSel() && (
          <button
            onClick={() => {
              const ids = selectedRowIds();
              if (ids.length && window.confirm(`Delete ${ids.length} selected row${ids.length > 1 ? 's' : ''}?`)) {
                bulkDeleteMut.mutate(ids);
              }
            }}
            className="text-xs px-2.5 py-1 bg-red-50 border border-red-200 text-red-600 rounded hover:bg-red-100"
          >
            Delete {selectedRowIds().length} rows
          </button>
        )}
        <span className="text-xs text-gray-300">· Drag or Shift+click to select · ⌘C copy · ⌘V paste</span>
      </div>

      {/* History modal */}
      {historyRow && (
        <HistoryModal
          cfg={cfg}
          row={historyRow}
          fields={fields}
          onClose={() => setHistoryRow(null)}
          onRestore={snapshot => handleRestore({ ...snapshot, id: historyRow.id })}
        />
      )}

      {/* Conflict modal */}
      {conflict && (() => {
        const changedFields = fields.filter(f => {
          const mine   = String(conflict.myDraft[f.key]  ?? '');
          const theirs = String(conflict.serverRow[f.key] ?? '');
          return mine !== theirs;
        });
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 border border-amber-200">
              <div className="flex items-start gap-3 mb-4">
                <span className="text-amber-500 text-xl mt-0.5">⚠</span>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Editing conflict</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Someone else saved this row while you were editing.
                  </p>
                </div>
              </div>

              {changedFields.length > 0 && (
                <table className="w-full text-xs mb-5 border-collapse">
                  <thead>
                    <tr className="text-gray-400 text-left">
                      <th className="pb-1 pr-3 font-medium">Field</th>
                      <th className="pb-1 pr-3 font-medium">Your value</th>
                      <th className="pb-1 font-medium">Their value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changedFields.map(f => (
                      <tr key={f.key} className="border-t border-gray-100">
                        <td className="py-1 pr-3 text-gray-500">{f.label}</td>
                        <td className="py-1 pr-3 text-red-600 font-mono">{String(conflict.myDraft[f.key] ?? '—')}</td>
                        <td className="py-1 text-emerald-700 font-mono">{String(conflict.serverRow[f.key] ?? '—')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    // Accept theirs — patch cache with server row
                    qc.setQueriesData({ queryKey: ['tracker', cfg.key] }, old =>
                      old?.rows ? { ...old, rows: old.rows.map(r => String(r.id) === String(conflict.serverRow.id) ? conflict.serverRow : r) } : old
                    );
                    setConflict(null);
                  }}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  Use their version
                </button>
                <button
                  onClick={() => {
                    // Overwrite with mine — resend with current server version to pass the check
                    const overwrite = { ...conflict.myDraft, version: conflict.serverRow.version };
                    updateMut.mutate({ id: conflict.serverRow.id, d: overwrite, myDraft: overwrite });
                    setConflict(null);
                  }}
                  className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Save mine anyway
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
                  className={`border-b border-gray-100 group ${
                    isRowActive
                      ? 'bg-indigo-50/50'
                      : rowIdx % 2 === 0
                        ? 'bg-white hover:bg-blue-50/40'
                        : 'bg-gray-50/70 hover:bg-blue-50/40'
                  }`}
                >
                  {fields.map((f, fi) => {
                    const cellActive = isActive(row.id, fi);
                    const selected   = inSel(rowIdx, fi);
                    return (
                      <td
                        key={f.key}
                        onMouseDown={e => {
                          if (e.shiftKey && selAnchor) {
                            e.preventDefault();
                            setSelFocus({ ri: rowIdx, fi });
                          } else {
                            isDragging.current = true;
                            setSelAnchor({ ri: rowIdx, fi });
                            setSelFocus({ ri: rowIdx, fi });
                            if (!cellActive) activate(row.id, fi, row);
                          }
                        }}
                        onMouseEnter={() => {
                          if (isFillDragging.current) setFillEnd(rowIdx);
                          else if (isDragging.current) setSelFocus({ ri: rowIdx, fi });
                        }}
                        onMouseUp={() => { isDragging.current = false; }}
                        className={`relative px-2 py-0.5 border-r border-gray-100 last:border-r-0 select-none ${
                          cellActive       ? 'bg-white ring-1 ring-inset ring-indigo-400 cursor-text' :
                          inFillPreview(rowIdx) ? 'bg-emerald-50' :
                          selected         ? 'bg-blue-100' :
                          'cursor-default'
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
                          : <>
                              <DisplayCell field={f} value={row[f.key]} />
                              {(() => {
                                const r = selRange();
                                const isHandle = r && rowIdx === r.r2 && fi === r.f2;
                                return isHandle ? (
                                  <span
                                    onMouseDown={e => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      isFillDragging.current = true;
                                      setFillEnd(r.r2);
                                    }}
                                    className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-blue-500 border border-white cursor-crosshair z-10"
                                    title="Drag to fill"
                                  />
                                ) : null;
                              })()}
                            </>
                        }
                      </td>
                    );
                  })}
                  <td className="px-1 py-0.5 w-14">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => setHistoryRow(row)}
                        className="text-gray-300 hover:text-indigo-500 text-xs"
                        title="Change history"
                      >🕐</button>
                      <button
                        onClick={() => window.confirm('Delete this row?') && deleteMut.mutate(row.id)}
                        className="text-gray-300 hover:text-red-500 text-xs"
                      >✕</button>
                    </div>
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
