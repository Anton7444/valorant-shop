// Where to send the Riot login result. Change this if the site lives elsewhere.
const SITE_URL = 'https://anton7444.github.io/valorant-shop/';

// Riot finishes login by redirecting to http://localhost/redirect#access_token=...
// Nothing listens there, so the browser would show "can't connect". Catch the
// navigation instead and hand the tokens (the part after #) to the site, which
// completes the login.
//
// If the login tab was opened from a site tab, reuse that original tab (so you
// end up with one tab) and close the login tab. Otherwise just turn the login
// tab itself into the site.
chrome.webNavigation.onBeforeNavigate.addListener(
  async (details) => {
    if (details.frameId !== 0) return;
    const hashIndex = details.url.indexOf('#');
    if (hashIndex === -1) return;
    const fragment = details.url.slice(hashIndex);
    if (!fragment.includes('access_token=')) return;
    const target = SITE_URL + fragment;

    try {
      const loginTab = await chrome.tabs.get(details.tabId);
      if (loginTab.openerTabId !== undefined) {
        // The tab URL is only readable for the site's origin (host permission).
        const opener = await chrome.tabs.get(loginTab.openerTabId);
        if (opener.url && opener.url.startsWith(SITE_URL)) {
          await chrome.tabs.update(opener.id, { url: target, active: true });
          await chrome.tabs.remove(details.tabId);
          return;
        }
      }
    } catch {
      // Opener is gone or unreadable; fall back below.
    }
    chrome.tabs.update(details.tabId, { url: target });
  },
  { url: [{ urlPrefix: 'http://localhost/redirect' }] },
);
