export default function ColumnPicker({ allColumns, fixedStart = [], table, onClose }) {
  const allIds = allColumns.map((c) => c.id);
  const configOrder = table.getState().columnOrder.filter((id) => allIds.includes(id));
  const visibility  = table.getState().columnVisibility;

  function move(id, dir) {
    const cOrder = table.getState().columnOrder.filter((i) => allIds.includes(i));
    const idx  = cOrder.indexOf(id);
    const swap = idx + dir;
    if (swap < 0 || swap >= cOrder.length) return;
    const next = [...cOrder];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    table.setColumnOrder([...fixedStart, ...next]);
  }

  function resetToDefault() {
    table.setColumnOrder([...fixedStart, ...allColumns.map((c) => c.id)]);
    table.setColumnVisibility(Object.fromEntries(allColumns.map((c) => [c.id, c.defaultVisible])));
  }

  return (
    <div className="absolute right-0 top-10 z-50 bg-white border border-gray-200 rounded-lg shadow-lg w-56 py-2">
      <div className="px-3 pb-2 border-b border-gray-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Columns</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {configOrder.map((id) => {
          const meta = allColumns.find((c) => c.id === id);
          if (!meta) return null;
          const isVisible = visibility[id] !== false;
          return (
            <div key={id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={isVisible}
                onChange={() => table.getColumn(id)?.toggleVisibility()}
                className="rounded text-indigo-600 cursor-pointer"
              />
              <span className="text-sm text-gray-700 flex-1">{meta.label}</span>
              <div className="flex flex-col">
                <button onClick={() => move(id, -1)} className="text-gray-300 hover:text-gray-600 text-[10px] leading-none">▲</button>
                <button onClick={() => move(id,  1)} className="text-gray-300 hover:text-gray-600 text-[10px] leading-none">▼</button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-3 pt-2 border-t border-gray-100">
        <button onClick={resetToDefault} className="text-xs text-gray-400 hover:text-gray-600">Reset to default</button>
      </div>
    </div>
  );
}
