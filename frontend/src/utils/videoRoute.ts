import { useSyncExternalStore } from 'react';

const KEY = 'video-via-server';
const listeners = new Set<() => void>();
const BASE_URL = import.meta.env.VITE_API_URL ?? '';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setVideoViaServer(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // Storage unavailable: the choice just won't persist.
  }
  listeners.forEach((fn) => fn());
}

export function useVideoViaServer(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    read,
    () => false,
  );
}

export function videoSrc(url: string, viaServer: boolean): string {
  return viaServer ? `${BASE_URL}/api/media/video?u=${encodeURIComponent(url)}` : url;
}
