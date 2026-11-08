// Pictures and videos kept on this device. The service worker (public/sw.js) stores pictures as they
// are seen and serves videos saved here; this file saves videos and lets Settings list and delete them.
const CACHE = 'media-v1';
const IMAGES_KEY = 'cache-images';
const VIDEOS_KEY = 'cache-videos';
export const VIDEO_CAP_BYTES = 500 * 1024 * 1024;
export const CACHE_CHANGED = 'media-cache-changed';

export const cacheSupported = () => typeof caches !== 'undefined' && 'serviceWorker' in navigator;

const read = (key: string) => {
  try {
    return localStorage.getItem(key) !== '0';
  } catch {
    return true;
  }
};
const write = (key: string, on: boolean) => {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    // storage unavailable: the choice just won't persist
  }
};

export const imageCachingOn = () => read(IMAGES_KEY);
export const videoCachingOn = () => read(VIDEOS_KEY);

export function setImageCaching(on: boolean): void {
  write(IMAGES_KEY, on);
  pushConfig();
}

export function setVideoCaching(on: boolean): void {
  write(VIDEOS_KEY, on);
}

/** Tell the service worker whether to keep pictures. */
export function pushConfig(): void {
  if (!('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: 'config', config: { images: imageCachingOn() } }));
}

export function registerMediaCache(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const base = import.meta.env.BASE_URL;
  navigator.serviceWorker
    .register(`${base}sw.js`, { scope: base })
    .then(pushConfig)
    .catch(() => {
      // no service worker (private mode, blocked): everything still loads, just without the local copy
    });
}

export type CachedEntry = {
  url: string;
  kind: 'image' | 'video';
  category: string;
  size: number;
  cachedAt: number;
  label?: string;
};

function categoryOf(url: string, kind: 'image' | 'video'): string {
  if (kind === 'video') return 'Videos';
  if (/\/agents\//i.test(url)) return 'Agent pictures';
  if (/weaponskin|weapons\//i.test(url)) return 'Skin and weapon pictures';
  if (/playercards|sprays|buddies|playertitles/i.test(url)) return 'Cards, sprays and buddies';
  if (/maps\//i.test(url)) return 'Map pictures';
  if (/bundles\//i.test(url)) return 'Bundle pictures';
  return 'Other pictures';
}

export async function listEntries(): Promise<CachedEntry[]> {
  if (typeof caches === 'undefined') return [];
  const cache = await caches.open(CACHE);
  const requests = await cache.keys();
  const entries: CachedEntry[] = [];
  for (const request of requests) {
    const response = await cache.match(request);
    if (!response) continue;
    const type = response.headers.get('content-type') || '';
    const kind = type.startsWith('video') ? 'video' : 'image';
    const stated = Number(response.headers.get('x-size') || response.headers.get('content-length') || 0);
    const size = stated || (await response.clone().blob()).size;
    entries.push({
      url: request.url,
      kind,
      category: categoryOf(request.url, kind),
      size,
      cachedAt: Number(response.headers.get('x-cached-at') || 0),
      label: response.headers.get('x-label') ? decodeURIComponent(response.headers.get('x-label')!) : undefined,
    });
  }
  return entries;
}

export async function deleteEntries(urls: string[]): Promise<void> {
  const cache = await caches.open(CACHE);
  await Promise.all(urls.map((url) => cache.delete(url)));
  window.dispatchEvent(new Event(CACHE_CHANGED));
}

export async function clearAll(kind?: 'image' | 'video'): Promise<void> {
  const entries = await listEntries();
  await deleteEntries(entries.filter((e) => !kind || e.kind === kind).map((e) => e.url));
}

const inFlight = new Set<string>();

/**
 * Keep a video that was just played. `src` is the address the player used (the service worker finds it
 * again by that address); `alternate` is another way to fetch the same file if the first is not
 * readable cross-origin (the site's own server relays it with the right headers).
 */
export async function saveVideo(src: string, label: string, alternate?: string): Promise<void> {
  if (!cacheSupported() || !videoCachingOn() || inFlight.has(src)) return;
  inFlight.add(src);
  try {
    const cache = await caches.open(CACHE);
    if (await cache.match(src)) return;
    let response: Response | null = null;
    for (const from of [src, alternate]) {
      if (!from) continue;
      try {
        const attempt = await fetch(from, { mode: 'cors', credentials: 'omit' });
        if (attempt.ok && (attempt.headers.get('content-type') || '').startsWith('video')) {
          response = attempt;
          break;
        }
      } catch {
        // try the other route
      }
    }
    if (!response) return;
    const body = await response.blob();
    await cache.put(
      src,
      new Response(body, {
        status: 200,
        headers: {
          'content-type': response.headers.get('content-type') || 'video/mp4',
          'x-size': String(body.size),
          'x-cached-at': String(Date.now()),
          'x-label': encodeURIComponent(label),
        },
      }),
    );
    await trimVideos();
    window.dispatchEvent(new Event(CACHE_CHANGED));
  } catch {
    // out of space or offline: the video just stays remote
  } finally {
    inFlight.delete(src);
  }
}

/** Keep saved videos under the cap by dropping the oldest. */
async function trimVideos(): Promise<void> {
  const videos = (await listEntries()).filter((e) => e.kind === 'video').sort((a, b) => a.cachedAt - b.cachedAt);
  let total = videos.reduce((sum, v) => sum + v.size, 0);
  const cache = await caches.open(CACHE);
  for (const video of videos) {
    if (total <= VIDEO_CAP_BYTES) break;
    await cache.delete(video.url);
    total -= video.size;
  }
}
