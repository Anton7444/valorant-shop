import { useSyncExternalStore } from 'react';

const KEY = 'metal-cards';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function setMetalCards(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // Storage unavailable: the choice just won't persist.
  }
  listeners.forEach((fn) => fn());
}

export function useMetalCards(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    read,
    () => true,
  );
}
