import type { PointerEvent } from 'react';

/** Feed the pointer position to CSS so `.card-spotlight` can follow the cursor. */
export function trackPointer(event: PointerEvent<HTMLElement>): void {
  const el = event.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${event.clientX - rect.left}px`);
  el.style.setProperty('--my', `${event.clientY - rect.top}px`);
}

/** Stagger delay for entrance animations, capped so long lists don't crawl in. */
export function staggerStyle(index: number): React.CSSProperties {
  return { '--i': Math.min(index, 10) } as React.CSSProperties;
}
