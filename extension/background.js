// Where to send the Riot login result. Change this if the site lives elsewhere.
const SITE_URL = 'https://antonfong.dpdns.org/';

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
    chrome.tabs.update(details.tabId, { url: SITE_URL + fragment });
  },
  { url: [{ urlPrefix: 'http://localhost/redirect' }] },
);
