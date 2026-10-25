import { useEffect, useRef, useState } from 'react';
import { hasRegionPrices } from '../utils/regionPrices';

interface CurrencyPickerProps {
  code: string;
  options: string[];
  onChange: (code: string) => void;
  className?: string;
}

/** Themed currency dropdown (the site's own list, not the browser's native select). */
export default function CurrencyPicker({ code, options, onChange, className = '' }: CurrencyPickerProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLSpanElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const disabled = options.length <= 1;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  function openList() {
    setActive(Math.max(0, options.indexOf(code)));
    setOpen(true);
  }

  function choose(next: string) {
    onChange(next);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(options[active]);
    }
  }

  return (
    <span ref={rootRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Currency: ${code}`}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={`inline-flex items-center gap-1 rounded-sm border border-transparent px-1.5 py-0.5 uppercase tracking-widest text-accent-red transition-colors enabled:hover:border-accent-red/60 enabled:hover:bg-accent-red/10 focus-visible:border-accent-red focus-visible:outline-none ${className}`}
      >
        {code}
        {!disabled && (
          <svg
            className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2.5 4.5L6 8l3.5-3.5" />
          </svg>
        )}
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Currency"
          className="absolute left-0 top-full z-30 mt-1.5 max-h-64 w-32 overflow-y-auto rounded-md border border-border bg-bg-card py-1 shadow-xl shadow-black/40"
        >
          {options.map((option, index) => (
            <li
              key={option}
              role="option"
              aria-selected={option === code}
              onPointerEnter={() => setActive(index)}
              onClick={() => choose(option)}
              className={`flex cursor-pointer items-center justify-between px-3 py-1.5 text-xs font-semibold tracking-widest ${
                index === active ? 'bg-bg-secondary text-text-primary' : 'text-text-secondary'
              }`}
            >
              <span>
                {option}
                {!hasRegionPrices(option) && (
                  <span className="ml-1.5 text-[9px] font-normal uppercase tracking-wider text-text-secondary/60">est.</span>
                )}
              </span>
              {option === code && <span className="h-1.5 w-1.5 rounded-full bg-accent-red" aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
