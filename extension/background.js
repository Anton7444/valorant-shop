// Where to send the Riot login result. Change this if the site lives elsewhere.
const SITE_URL = 'https://anton7444.github.io/valorant-shop/';

// Riot finishes login by redirecting to http://localhost/redirect#access_token=...
// Nothing listens there, so the browser would show "can't connect". Catch the
// navigation instead and forward the tokens (the part after #) to the site,
// which completes the login.
chrome.webNavigation.onBeforeNavigate.addListener(
  (details) => {
    if (details.frameId !== 0) return;
    const hashIndex = details.url.indexOf('#');
    if (hashIndex === -1) return;
    const fragment = details.url.slice(hashIndex);
    if (!fragment.includes('access_token=')) return;
    chrome.tabs.update(details.tabId, { url: SITE_URL + fragment });
  },
  { url: [{ urlPrefix: 'http://localhost/redirect' }] },
);
