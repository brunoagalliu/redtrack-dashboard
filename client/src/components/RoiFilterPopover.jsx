import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function RoiFilterPopover({ roiMin, roiMax, onMinChange, onMaxChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef(null);
  const popoverRef = useRef(null);
  const minRef = useRef(null);
  const isActive = roiMin !== '' || roiMax !== '';

  function openPopover(e) {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    setTimeout(() => minRef.current?.focus(), 10);
    function onDown(e) {
      if (!btnRef.current?.contains(e.target) && !popoverRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    function onScroll() { setOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openPopover}
        title={
          isActive
            ? `ROI filter: ${roiMin !== '' ? roiMin + '%' : '−∞'} to ${roiMax !== '' ? roiMax + '%' : '+∞'}`
            : 'Filter by ROI range'
        }
        className={`relative shrink-0 flex items-center justify-center w-4 h-4 rounded transition-colors ${
          isActive ? 'text-blue-500 hover:text-blue-600' : 'text-gray-300 hover:text-gray-500'
        }`}
      >
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
        </svg>
        {isActive && (
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />
        )}
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-lg shadow-xl w-44 p-3"
        >
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
            ROI % range
          </p>
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-gray-400 mb-0.5 block">Min</label>
              <input
                ref={minRef}
                type="number"
                value={roiMin}
                onChange={(e) => onMinChange(e.target.value)}
                placeholder="e.g. −50"
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 text-gray-700"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 mb-0.5 block">Max</label>
              <input
                type="number"
                value={roiMax}
                onChange={(e) => onMaxChange(e.target.value)}
                placeholder="e.g. 500"
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 text-gray-700"
              />
            </div>
          </div>
          {isActive && (
            <button
              type="button"
              onClick={() => { onMinChange(''); onMaxChange(''); }}
              className="mt-2.5 w-full text-[10px] text-gray-400 hover:text-red-500 transition-colors text-center py-0.5"
            >
              Clear filter
            </button>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
