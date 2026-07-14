import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker } from 'react-day-picker';

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
  const today = new Date();
  const [open, setOpen]   = useState(false);
  const [pos,  setPos]    = useState({ top: 0, left: 0 });
  const [range, setRange] = useState({ from: toDate(from), to: toDate(to) });

  const btnRef     = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    setRange({ from: toDate(from), to: toDate(to) });
  }, [from, to]);

  function openPicker() {
    const rect = btnRef.current.getBoundingClientRect();
    // Flip left if picker would overflow the right edge of viewport
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
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function commit(from, to) {
    if (from && to) {
      onChange({ from: toStr(from), to: toStr(to) });
      setOpen(false);
    }
  }

  function handleSelect(selected) {
    setRange(selected ?? { from: undefined, to: undefined });
    if (selected?.from && selected?.to) commit(selected.from, selected.to);
  }

  function applyPreset(days) {
    const f = new Date(Date.now() - days * 86400000);
    const t = new Date();
    setRange({ from: f, to: t });
    commit(f, t);
  }

  const label = from && to ? `${fmt(from)} – ${fmt(to)}` : 'Select range';
  const isActive = !!from && !!to;

  // Start the two-month view on the month before the end date
  const defaultMonth = range.to
    ? new Date(range.to.getFullYear(), range.to.getMonth() - 1)
    : new Date(today.getFullYear(), today.getMonth() - 1);

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
          className="bg-white border border-gray-200 rounded-xl shadow-2xl"
        >
          {/* Presets row */}
          <div className="flex items-center gap-1.5 px-4 py-3 border-b border-gray-100">
            <span className="text-xs text-gray-400 mr-1">Quick:</span>
            {PRESETS.map(({ label, days }) => {
              const presetFrom = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
              const todayStr   = today.toISOString().slice(0, 10);
              const active     = from === presetFrom && to === todayStr;
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
                onClick={() => { setRange({ from: undefined, to: undefined }); }}
                className="ml-auto text-xs text-gray-400 hover:text-red-500 transition-colors">
                Clear
              </button>
            )}
          </div>

          {/* Calendar */}
          <DayPicker
            mode="range"
            numberOfMonths={2}
            selected={range}
            onSelect={handleSelect}
            disabled={{ after: today }}
            defaultMonth={defaultMonth}
            classNames={{
              root:            'p-3 select-none',
              months:          'flex gap-6',
              month:           'space-y-2 min-w-[220px]',
              month_caption:   'flex items-center justify-between px-1 pb-1',
              caption_label:   'text-sm font-semibold text-gray-700',
              nav:             'flex items-center gap-0.5',
              button_previous: 'p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
              button_next:     'p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
              month_grid:      'w-full border-collapse',
              weekdays:        'flex mb-1',
              weekday:         'flex-1 text-center text-[11px] font-medium text-gray-400 py-1',
              weeks:           'space-y-0.5',
              week:            'flex',
              day:             'flex-1 relative',
              day_button: [
                'w-full h-8 text-sm text-gray-700 rounded-full transition-colors',
                'hover:bg-gray-100',
                'focus:outline-none focus:ring-2 focus:ring-blue-300',
              ].join(' '),
              selected:      'bg-blue-600 text-white rounded-full hover:bg-blue-700 font-medium',
              today:         'font-bold text-blue-600',
              outside:       'text-gray-300 opacity-50',
              disabled:      'text-gray-200 cursor-not-allowed hover:bg-transparent',
              range_start:   'bg-blue-600 text-white rounded-full hover:bg-blue-700 font-medium',
              range_end:     'bg-blue-600 text-white rounded-full hover:bg-blue-700 font-medium',
              range_middle:  'bg-blue-50 text-blue-700 rounded-none hover:bg-blue-100',
              hidden:        'invisible',
            }}
          />

          {/* Footer hint */}
          {range.from && !range.to && (
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
