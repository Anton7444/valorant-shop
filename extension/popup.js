const DEFAULT_DOMAINS = ['riotgames.com', 'riotcdn.net', 'rgpub.io', 'hcaptcha.com', 'pvp.net'];
const $ = (id) => document.getElementById(id);

chrome.storage.local.get(['enabled', 'host', 'port', 'user', 'pass', 'domains']).then((cfg) => {
  $('enabled').checked = !!cfg.enabled;
  $('host').value = cfg.host || '';
  $('port').value = cfg.port || 8899;
  $('user').value = cfg.user || '';
  $('pass').value = cfg.pass || '';
  $('domains').value = (Array.isArray(cfg.domains) && cfg.domains.length ? cfg.domains : DEFAULT_DOMAINS).join('\n');
});

$('save').addEventListener('click', async () => {
  const domains = $('domains').value.split('\n').map((d) => d.trim()).filter(Boolean);
  await chrome.storage.local.set({
    enabled: $('enabled').checked,
    host: $('host').value.trim(),
    port: Number($('port').value) || 8899,
    user: $('user').value,
    pass: $('pass').value,
    domains,
  });
  $('status').textContent = $('enabled').checked ? 'Saved. Riot pages now use the proxy.' : 'Saved. Proxy is off.';
});
