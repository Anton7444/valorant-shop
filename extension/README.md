# Valorant Shop Login Helper

Browser extension (Chrome / Edge / Brave, Manifest V3) that removes the
"copy the localhost URL" step when logging in.

## Install (once per browser)
1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and pick this `extension` folder.

## Use
Click **Sign in with Riot** on the site. With the extension installed the
current tab goes to Riot's login page (no new tab); after you sign in, the
extension turns the tab back into the site, which finishes the login
automatically. Without the extension the site opens Riot in a new tab and
uses the manual paste box.

If the site is hosted somewhere else, edit `SITE_URL` in `background.js` and
the `matches` entry in `manifest.json`, then reload the extension.

After updating the files, press the reload icon on the extension in
`chrome://extensions`.

## Optional: use a proxy at home for Riot's login (for networks that block Riot)

If the network you are on (e.g. school) cannot open Riot's login page, run the relay in
`tools/riot-relay` on your home computer and point the extension at it:

1. Click the extension's toolbar icon.
2. Tick **Use the proxy**, enter your home relay's address (for example your dynamic-DNS name),
   its port, and the relay's username and password.
3. Press **Save**. Only the domains in the list (Riot's login, its CDN and its captcha) go through the
   proxy; every other site stays direct, so the site and its backend load as usual.
4. Click **Sign in with Riot** as normal. Riot's page now loads through your home connection, and the
   login finishes in the same tab.

Add a domain to the list if the login page stays blank or a button does not load (open the browser's
developer tools, Network tab, and look for requests that fail). The relay must allow the same domains
(`RELAY_ALLOW`). The username and password are saved in this browser's extension storage, so use a relay
password you use nowhere else and do not do this on a computer you do not trust.
