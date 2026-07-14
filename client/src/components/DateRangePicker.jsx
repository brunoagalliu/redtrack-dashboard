import { useState, useRef, useEffect, useMemo, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';

const TODAY = new Date();
const DISABLED_AFTER_TODAY = { after: TODAY };

function toDate(str) {
  return str ? new Date(str + 'T12:00:00') : undefined;
}
function toStr(date) {
  return date ? date.toISOString().slice(0, 10) : '';
}
function fmt(str) {
  if (!str) return '';
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// Build presets once at module load (relative to TODAY constant)
const T = TODAY;
const PRESETS = [
  { label: 'Today',
    from: toStr(T),
    to:   toStr(T) },
  { label: 'Yesterday',
    from: toStr(new Date(T.getTime() - 86400000)),
    to:   toStr(new Date(T.getTime() - 86400000)) },
  { label: 'Last 7 days',
    from: toStr(new Date(T.getTime() - 6 * 86400000)),
    to:   toStr(T) },
  { label: 'Last 30 days',
    from: toStr(new Date(T.getTime() - 29 * 86400000)),
    to:   toStr(T) },
  { label: 'This month',
    from: toStr(new Date(T.getFullYear(), T.getMonth(), 1)),
    to:   toStr(T) },
  { label: 'Last month',
    from: toStr(new Date(T.getFullYear(), T.getMonth() - 1, 1)),
    to:   toStr(new Date(T.getFullYear(), T.getMonth(), 0)) },
  { label: 'Last 90 days',
    from: toStr(new Date(T.getTime() - 89 * 86400000)),
    to:   toStr(T) },
  { label: 'Last 180 days',
    from: toStr(new Date(T.getTime() - 179 * 86400000)),
    to:   toStr(T) },
];

export default function DateRangePicker({ from, to, onChange }) {
  const [open,      setOpen]      = useState(false);
  const [pos,       setPos]       = useState({ top: 0, left: 0 });
  const [selecting, setSelecting] = useState(null);
  const [, startTransition] = useTransition();

  const btnRef     = useRef(null);
  const popoverRef = useRef(null);

  const committedRange = useMemo(
    () => ({ from: toDate(from), to: toDate(to) }),
    [from, to],
  );

  const displayRange = selecting ?? committedRange;
  const isActive     = !!from && !!to;

  function openPicker() {
    const rect = btnRef.current.getBoundingClientRect();
    const popupW = 700;
    const left = Math.min(rect.left, window.innerWidth - popupW - 8);
    setPos({ top: rect.bottom + 6, left: Math.max(8, left) });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (!btnRef.current?.contains(e.target) && !popoverRef.current?.contains(e.target)) {
        setSelecting(null);
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function handleSelect(selected) {
    if (!selected) { setSelecting(null); return; }
    if (selected.from && !selected.to) {
      setSelecting({ from: selected.from, to: undefined });
      return;
    }
    if (selected.from && selected.to) {
      const newFrom = toStr(selected.from);
      const newTo   = toStr(selected.to);
      setSelecting(null);
      setOpen(false);
      startTransition(() => onChange({ from: newFrom, to: newTo }));
    }
  }

  function applyPreset(preset) {
    setSelecting(null);
    setOpen(false);
    startTransition(() => onChange({ from: preset.from, to: preset.to }));
  }

  const label = from && to ? `${fmt(from)} – ${fmt(to)}` : 'Select date range';

  // Open showing the two months that contain the end of the committed range
  const defaultMonth = useMemo(
    () => new Date(
      (committedRange.to ?? TODAY).getFullYear(),
      (committedRange.to ?? TODAY).getMonth() - 1,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from, to],
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openPicker}
        className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border transition-colors ${
          isActive
            ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
        }`}
      >
        <svg className="w-4 h-4 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="whitespace-nowrap">{label}</span>
        <svg className="w-3.5 h-3.5 shrink-0 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="flex bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
        >
          {/* Left: preset shortcuts */}
          <div className="flex flex-col py-3 border-r border-gray-100 min-w-[144px]">
            {PRESETS.map((p) => {
              const active = from === p.from && to === p.to;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={`text-left px-5 py-1.5 text-sm transition-colors ${
                    active
                      ? 'text-blue-600 font-medium bg-blue-50'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
            {isActive && (
              <>
                <div className="mx-4 my-2 border-t border-gray-100" />
                <button
                  type="button"
                  onClick={() => { setOpen(false); startTransition(() => onChange({ from: '', to: '' })); }}
                  className="text-left px-5 py-1.5 text-sm text-gray-400 hover:text-red-500 transition-colors"
                >
                  Clear
                </button>
              </>
            )}
          </div>

          {/* Right: two-month calendar */}
          <div>
            <div style={{
              '--rdp-accent-color':            '#2563eb',
              '--rdp-accent-background-color': '#dbeafe',
              '--rdp-day-height':              '36px',
              '--rdp-day-width':               '36px',
              '--rdp-day_button-height':       '34px',
              '--rdp-day_button-width':        '34px',
              '--rdp-months-gap':              '1.5rem',
              '--rdp-animation_duration':      '0s',
              padding: '12px 16px',
            }}>
              <DayPicker
                mode="range"
                numberOfMonths={2}
                selected={displayRange}
                onSelect={handleSelect}
                disabled={DISABLED_AFTER_TODAY}
                defaultMonth={defaultMonth}
                resetOnSelect
              />
            </div>
            {selecting?.from && !selecting?.to && (
              <p className="px-4 pb-3 text-xs text-center text-gray-400">
                Now click an end date
              </p>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
