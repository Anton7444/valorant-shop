import { useEffect, useRef } from 'react';

// Arrow keys / Home / End move focus between the buttons and links inside a
// row (nav tabs, filter chips, a segmented switch). Tab still goes through
// every item, so nothing becomes unreachable.
export function useRovingArrows<T extends HTMLElement>(selector = 'a[href], button:not(:disabled)') {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const items = [...el.querySelectorAll<HTMLElement>(selector)];
      const current = items.indexOf(document.activeElement as HTMLElement);
      if (current < 0) return;
      event.preventDefault();
      let next: number;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = items.length - 1;
      else next = (current + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
      items[next].focus();
    };

    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  }, [selector]);

  return ref;
}
