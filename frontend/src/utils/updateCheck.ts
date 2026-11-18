// The page itself (index.html) can be served from a browser or CDN cache for a while after a deploy,
// so a visitor may still be running the previous build. At start-up, look at the newest index.html
// (cache-busted) and reload once if it points at a different script than the one running.
export function reloadIfOutdated(): void {
  if (!import.meta.env.PROD) return;
  const running = document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]')?.getAttribute('src');
  if (!running) return;
  // One attempt per few minutes: never loop if the newest copy is also not reachable yet.
  try {
    const last = Number(sessionStorage.getItem('update_check_reload') ?? 0);
    if (Date.now() - last < 5 * 60_000) return;
  } catch {
    return;
  }
  fetch(`${import.meta.env.BASE_URL}?v=${Date.now()}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.text() : ''))
    .then((html) => {
      const latest = /<script[^>]+type="module"[^>]+src="([^"]*assets\/index-[^"]+\.js)"/.exec(html)?.[1];
      if (!latest || latest.split('/').pop() === running.split('/').pop()) return;
      try {
        sessionStorage.setItem('update_check_reload', String(Date.now()));
      } catch {
        return;
      }
      window.location.reload();
    })
    .catch(() => {});
}
