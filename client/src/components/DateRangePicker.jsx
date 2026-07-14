import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';

// Stable constants — not recreated on every render
const TODAY = new Date();
const DISABLED_AFTER_TODAY = { after: TODAY };

const PRESETS = [
  { label: '7d',   days: 7   },
  { label: '30d',  days: 30  },
  { label: '90d',  days: 90  },
  { label: '180d', days: 180 },
];

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

export default function DateRangePicker({ from, to, onChange }) {
  const [open,      setOpen]      = useState(false);
  const [pos,       setPos]       = useState({ top: 0, left: 0 });
  // Local state only for the in-progress half-selection (start picked, end not yet)
  const [selecting, setSelecting] = useState(null);

  const btnRef     = useRef(null);
  const popoverRef = useRef(null);

  // Displayed range: in-progress selection takes priority, else committed props
  const displayRange = selecting ?? { from: toDate(from), to: toDate(to) };
  const isActive     = !!from && !!to;

  function openPicker() {
    const rect = btnRef.current.getBoundingClientRect();
    const pickerWidth = 580;
    const left = rect.left + pickerWidth > window.innerWidth
      ? window.innerWidth - pickerWidth - 8
      : rect.left;
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
      // User clicked the start date — wait for end
      setSelecting({ from: selected.from, to: undefined });
      return;
    }
    if (selected.from && selected.to) {
      setSelecting(null);
      onChange({ from: toStr(selected.from), to: toStr(selected.to) });
      setOpen(false);
    }
  }

  function applyPreset(days) {
    const f = new Date(Date.now() - days * 86400000);
    setSelecting(null);
    onChange({ from: toStr(f), to: toStr(TODAY) });
    setOpen(false);
  }

  const label = from && to ? `${fmt(from)} – ${fmt(to)}` : 'Select date range';

  // Show two months ending at the selected end date (or current month if no selection)
  const endDate = displayRange.to ?? TODAY;
  const defaultMonth = new Date(endDate.getFullYear(), endDate.getMonth() - 1);

  const todayStr = TODAY.toISOString().slice(0, 10);

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
          className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
        >
          {/* Presets */}
          <div className="flex items-center gap-1.5 px-4 py-3 border-b border-gray-100">
            <span className="text-xs text-gray-400 mr-1">Quick:</span>
            {PRESETS.map(({ label, days }) => {
              const presetFrom = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
              const active = from === presetFrom && to === todayStr;
              return (
                <button key={label} type="button" onClick={() => applyPreset(days)}
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {label}
                </button>
              );
            })}
            {isActive && (
              <button type="button"
                onClick={() => { onChange({ from: '', to: '' }); setOpen(false); }}
                className="ml-auto text-xs text-gray-400 hover:text-red-500 transition-colors">
                Clear
              </button>
            )}
          </div>

          {/* Calendar — styled via CSS variables, no classNames conflicts */}
          <div style={{
            '--rdp-accent-color':            '#2563eb',
            '--rdp-accent-background-color': '#dbeafe',
            '--rdp-day-height':              '36px',
            '--rdp-day-width':               '36px',
            '--rdp-day_button-height':       '34px',
            '--rdp-day_button-width':        '34px',
            '--rdp-nav_button-height':       '2rem',
            '--rdp-nav_button-width':        '2rem',
            '--rdp-months-gap':              '1.5rem',
            '--rdp-animation_duration':      '0s',
            padding: '12px',
          }}>
            <DayPicker
              mode="range"
              numberOfMonths={2}
              selected={displayRange}
              onSelect={handleSelect}
              disabled={DISABLED_AFTER_TODAY}
              defaultMonth={defaultMonth}
            />
          </div>

          {/* Hint when start is picked */}
          {selecting?.from && !selecting?.to && (
            <div className="px-4 pb-3 text-xs text-center text-gray-400">
              Now click an end date
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
