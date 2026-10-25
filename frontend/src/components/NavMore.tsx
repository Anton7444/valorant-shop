import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';

interface NavMoreProps {
  items: { to: string; label: string }[];
}

/** "More" tab holding the secondary pages. The panel is portalled so the scrolling nav row cannot clip it. */
export default function NavMore({ items }: NavMoreProps) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const active = items.some((item) => item.to === pathname);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPos({ left: rect.left, top: rect.bottom + 6 });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close();
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-current={active ? 'page' : undefined}
        onClick={toggle}
        className={`font-display relative z-10 inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-3 py-1.5 text-xs uppercase tracking-widest transition-colors duration-300 ${
          active || open ? 'text-accent-red' : 'text-text-secondary hover:text-text-primary'
        }`}
      >
        More
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
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label="More pages"
            className="fixed z-50 w-44 overflow-hidden rounded-md border border-border bg-bg-card py-1 shadow-xl shadow-black/40"
            style={{ left: pos.left, top: pos.top }}
          >
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`font-display block px-4 py-2 text-xs uppercase tracking-widest transition-colors hover:bg-bg-secondary hover:text-text-primary ${
                  item.to === pathname ? 'text-accent-red' : 'text-text-secondary'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
