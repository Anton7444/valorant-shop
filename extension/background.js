// Where to send the Riot login result. Change this if the site lives elsewhere.
const SITE_URL = 'https://anton7444.github.io/valorant-shop/';

// Riot finishes login by redirecting to http://localhost/redirect#access_token=...
// Nothing listens there, so the browser would show "can't connect". Catch the
// navigation instead and hand the tokens (the part after #) to the site, which
// completes the login.
//
// If a site tab is already open, reuse it (so you end up with one tab) and
// close the login tab. Otherwise just turn the login
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
      // Chrome does not always record which tab opened the login tab, so look
      // for any open site tab (readable thanks to the site host permission).
      // Prefer the opener, then a tab in the same window, then the most
      // recently used one.
      const siteTabs = (await chrome.tabs.query({ url: SITE_URL + '*' })).filter(
        (tab) => tab.id !== details.tabId,
      );
      const original =
        siteTabs.find((tab) => tab.id === loginTab.openerTabId) ??
        siteTabs
          .filter((tab) => tab.windowId === loginTab.windowId)
          .sort((x, y) => (y.lastAccessed ?? 0) - (x.lastAccessed ?? 0))[0] ??
        siteTabs.sort((x, y) => (y.lastAccessed ?? 0) - (x.lastAccessed ?? 0))[0];
      if (original) {
        await chrome.tabs.update(original.id, { url: target, active: true });
        await chrome.windows.update(original.windowId, { focused: true });
        await chrome.tabs.remove(details.tabId);
        return;
      }
    } catch {
      // Tabs unreadable; fall back below.
    }
    chrome.tabs.update(details.tabId, { url: target });
  },
  { url: [{ urlPrefix: 'http://localhost/redirect' }] },
);
