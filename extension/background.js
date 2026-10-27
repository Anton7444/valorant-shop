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
    chrome.tabs.update(details.tabId, { url: SITE_URL + fragment });
  },
  { url: [{ urlPrefix: 'http://localhost/redirect' }] },
);

// ---------------------------------------------------------------------------
// Optional: route Riot's login pages through a proxy you run (see tools/riot-relay),
// for networks that block Riot. Only the domains listed in the popup go through it;
// everything else stays direct. Configure it from the extension's toolbar popup.
// ---------------------------------------------------------------------------
const DEFAULT_DOMAINS = [
  'riotgames.com',
  'riotcdn.net',
  'rgpub.io',
  'hcaptcha.com',
  'pvp.net',
];

function buildPac({ host, port, domains }) {
  const rules = domains
    .map((d) => d.trim().replace(/^[*.]+/, '').toLowerCase())
    .filter(Boolean);
  return `function FindProxyForURL(url, host) {
  host = host.toLowerCase();
  var domains = ${JSON.stringify(rules)};
  for (var i = 0; i < domains.length; i++) {
    if (host === domains[i] || dnsDomainIs(host, '.' + domains[i])) {
      return 'PROXY ${host}:${port}';
    }
  }
  return 'DIRECT';
}`;
}

async function applyProxy() {
  const cfg = await chrome.storage.local.get(['enabled', 'host', 'port', 'domains']);
  const host = (cfg.host || '').trim();
  const port = Number(cfg.port) || 8899;
  if (!cfg.enabled || !host || /[\s'"\\]/.test(host)) {
    await chrome.proxy.settings.clear({ scope: 'regular' });
    return;
  }
  const domains = Array.isArray(cfg.domains) && cfg.domains.length ? cfg.domains : DEFAULT_DOMAINS;
  await chrome.proxy.settings.set({
    value: { mode: 'pac_script', pacScript: { data: buildPac({ host, port, domains }) } },
    scope: 'regular',
  });
}

// Hand the proxy's username and password to the browser when the relay asks for them.
chrome.webRequest.onAuthRequired.addListener(
  (details, callback) => {
    if (!details.isProxy) {
      callback({});
      return;
    }
    chrome.storage.local.get(['user', 'pass']).then((cfg) => {
      callback(cfg.user ? { authCredentials: { username: cfg.user, password: cfg.pass || '' } } : {});
    });
  },
  { urls: ['<all_urls>'] },
  ['asyncBlocking'],
);

chrome.runtime.onInstalled.addListener(applyProxy);
chrome.runtime.onStartup.addListener(applyProxy);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ['enabled', 'host', 'port', 'domains'].some((k) => k in changes)) applyProxy();
});
