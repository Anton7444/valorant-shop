import { useEffect, useMemo, useRef, useState } from 'react';
import { hasRegionPrices } from '../utils/regionPrices';

interface CurrencyPickerProps {
  code: string;
  options: string[];
  onChange: (code: string) => void;
  className?: string;
}

function displayNames(locale: string): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames([locale], { type: 'currency' });
  } catch {
    return null;
  }
}

/** Themed, searchable currency dropdown (the site's own list, not the browser's native select). */
export default function CurrencyPicker({ code, options, onChange, className = '' }: CurrencyPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLSpanElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const disabled = options.length <= 1;

  // English and Traditional Chinese names, so "dollar", "twd" or "台幣" / "新台幣" all find it.
  const names = useMemo(() => {
    const en = displayNames('en');
    const zh = displayNames('zh-TW');
    return new Map(options.map((c) => [c, { en: en?.of(c) ?? '', zh: zh?.of(c) ?? '' }]));
  }, [options]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((c) => {
      const n = names.get(c);
      return c.toLowerCase().includes(q) || n?.en.toLowerCase().includes(q) || n?.zh.includes(q) || (q === '台幣' && c === 'TWD');
    });
  }, [options, names, query]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active, filtered]);

  function openList() {
    setQuery('');
    setActive(Math.max(0, options.indexOf(code)));
    setOpen(true);
  }

  function close() {
    setOpen(false);
    rootRef.current?.querySelector('button')?.focus();
  }

  function choose(next: string) {
    onChange(next);
    close();
  }

  function onButtonKeyDown(event: React.KeyboardEvent) {
    if (!disabled && !open && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      openList();
    }
  }

  function onSearchKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (filtered[active]) choose(filtered[active]);
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
        onKeyDown={onButtonKeyDown}
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
        <div className="absolute left-0 top-full z-30 mt-1.5 w-56 overflow-hidden rounded-md border border-border bg-bg-card shadow-xl shadow-black/40">
          <div className="border-b border-border p-2">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onSearchKeyDown}
              placeholder="Search currency"
              aria-label="Search currency"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-sm border border-border bg-bg-secondary px-2 py-1 text-xs font-normal normal-case tracking-normal text-text-primary outline-none placeholder:text-text-secondary/50 focus:border-accent-red"
            />
          </div>
          <ul ref={listRef} role="listbox" aria-label="Currency" className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs font-normal normal-case tracking-normal text-text-secondary">No match</li>
            )}
            {filtered.map((option, index) => (
              <li
                key={option}
                role="option"
                aria-selected={option === code}
                onPointerEnter={() => setActive(index)}
                onClick={() => choose(option)}
                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-xs ${
                  index === active ? 'bg-bg-secondary text-text-primary' : 'text-text-secondary'
                }`}
              >
                <span className="min-w-0">
                  <span className="font-semibold tracking-widest">{option}</span>
                  {!hasRegionPrices(option) && (
                    <span className="ml-1.5 text-[9px] font-normal uppercase tracking-wider text-text-secondary/60">est.</span>
                  )}
                  <span className="block truncate text-[10px] font-normal normal-case tracking-normal text-text-secondary/70">
                    {names.get(option)?.en}
                  </span>
                </span>
                {option === code && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-red" aria-hidden="true" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}
