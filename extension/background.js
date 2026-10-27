// Where to send the Riot login result. Change this if the site lives elsewhere.
const SITE_URL = 'https://anton7444.github.io/valorant-shop/';

// The site (content.js marks it) sends this very tab to Riot's login page.
// Riot finishes by redirecting to http://localhost/redirect#access_token=...
// Nothing listens there, so the browser would show "can't connect". Catch the
// navigation and turn the tab back into the site, carrying the tokens (the part
// after #) so the site can complete the login.
chrome.webNavigation.onBeforeNavigate.addListener(
  (details) => {
    if (details.frameId !== 0) return;
    const hashIndex = details.url.indexOf('#');
    if (hashIndex === -1) return;
    const fragment = details.url.slice(hashIndex);
    if (!fragment.includes('access_token=')) return;
    // Also hand over Riot's own session cookie (ssid), which the page cannot read itself. With it the
    // site can renew this login on its own and offer a code to sign in elsewhere. Nothing is sent
    // anywhere but this tab's address, which goes to the site.
    chrome.cookies
      .get({ url: 'https://auth.riotgames.com/', name: 'ssid' })
      .catch(() => null)
      .then((cookie) => {
        const extra = cookie && cookie.value ? '&ssid=' + encodeURIComponent(cookie.value) : '';
        chrome.tabs.update(details.tabId, { url: SITE_URL + fragment + extra });
      });
  },
  { url: [{ urlPrefix: 'http://localhost/redirect' }] },
);
