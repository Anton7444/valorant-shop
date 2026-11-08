// Keeps pictures and videos from valorant-api.com / Riot's video CDN on this device so they do not
// download again each time. Pictures are cached as they are seen; videos are saved by the page
// (utils/mediaCache.ts) and served from here, including the Range requests <video> makes.
const CACHE = 'media-v1';
const CONFIG_CACHE = 'media-config';
const CONFIG_KEY = '/__config';
const IMAGE_HOSTS = ['media.valorant-api.com'];

let config = { images: true };
const ready = (async () => {
  try {
    const cache = await caches.open(CONFIG_CACHE);
    const stored = await cache.match(CONFIG_KEY);
    if (stored) config = { ...config, ...(await stored.json()) };
  } catch {
    // keep the defaults
  }
})();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'config') {
    config = { ...config, ...event.data.config };
    event.waitUntil(
      caches.open(CONFIG_CACHE).then((cache) => cache.put(CONFIG_KEY, new Response(JSON.stringify(config)))),
    );
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.destination === 'image' && IMAGE_HOSTS.includes(url.hostname)) {
    event.respondWith(handleImage(request));
  } else if (request.destination === 'video') {
    event.respondWith(handleVideo(request));
  }
});

async function handleImage(request) {
  await ready;
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request.url);
  if (hit) return hit;
  if (!config.images) return fetch(request);
  try {
    // A CORS request so the real size is known and the response is readable; no cookies are sent.
    const response = await fetch(request.url, { mode: 'cors', credentials: 'omit' });
    if (response.ok) {
      const body = await response.clone().blob();
      const headers = new Headers(response.headers);
      headers.set('x-cached-at', String(Date.now()));
      headers.set('x-size', String(body.size));
      await cache.put(request.url, new Response(body, { status: 200, headers }));
    }
    return response;
  } catch {
    return fetch(request); // not readable cross-origin: just show it, do not keep it
  }
}

async function handleVideo(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request.url);
  if (!hit) return fetch(request);

  const range = request.headers.get('range');
  const type = hit.headers.get('content-type') || 'video/mp4';
  if (!range) return hit;

  const buffer = await hit.arrayBuffer();
  const total = buffer.byteLength;
  const match = /bytes=(\d*)-(\d*)/.exec(range);
  let start = match && match[1] ? parseInt(match[1], 10) : 0;
  let end = match && match[2] ? parseInt(match[2], 10) : total - 1;
  if (match && !match[1] && match[2]) {
    start = Math.max(0, total - parseInt(match[2], 10)); // suffix range: the last N bytes
    end = total - 1;
  }
  if (start >= total) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
  }
  end = Math.min(end, total - 1);
  return new Response(buffer.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': type,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
    },
  });
}
