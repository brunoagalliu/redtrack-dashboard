import { useState, useRef, useEffect } from 'react';

export default function SearchableSelect({ options = [], value, onChange, placeholder = 'Select…', labelKey = 'label', valueKey = 'value', disabled = false, onQueryChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find((o) => String(o[valueKey]) === String(value));

  const filtered = query.trim() && !onQueryChange
    ? options.filter((o) => String(o[labelKey]).toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
        onQueryChange?.('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleOpen() {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleSelect(option) {
    onChange(option[valueKey]);
    setOpen(false);
    setQuery('');
    onQueryChange?.('');
  }

  function handleClear(e) {
    e.stopPropagation();
    onChange('');
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className="input w-full flex items-center justify-between text-left"
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
          {disabled ? 'Loading…' : selected ? selected[labelKey] : placeholder}
        </span>
        <span className="flex items-center gap-1 ml-2 shrink-0">
          {selected && !disabled && (
            <span
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-600 cursor-pointer px-0.5"
              role="button"
              aria-label="Clear"
            >
              ✕
            </span>
          )}
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); onQueryChange?.(e.target.value); }}
              placeholder="Type to search…"
              className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded outline-none focus:border-blue-400"
            />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {disabled ? (
              <li className="px-3 py-2 text-sm text-gray-400">Loading…</li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">No results</li>
            ) : (
              filtered.map((option, idx) => (
                <li
                  key={`${option[valueKey]}-${idx}`}
                  onClick={() => handleSelect(option)}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 hover:text-blue-700 ${
                    String(option[valueKey]) === String(value) ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                  }`}
                >
                  {option[labelKey]}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
