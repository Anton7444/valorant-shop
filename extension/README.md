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

## Staying signed in, and a code for other computers (v1.4)

When the extension catches the Riot redirect it also reads Riot's own session cookie (`ssid`, which a web
page cannot read) from `auth.riotgames.com` and passes it to the site in the address of the tab (the part
after `#`, which is never sent to any server by the browser itself). The site hands it to the backend, which
keeps it in memory only and uses it to renew your Riot tokens by itself, so the login lasts 24 hours.

That also lets you sign in on a computer that cannot open Riot's login page: scroll to the bottom of the
Store page and press **Show a login code**, then type that code in the login page's
"Can't open Riot's login page here?" box on the other computer. The code works for 24 hours when the extension was used.
Without the extension the code still works, but only while Riot's current tokens are valid (under an hour), and it cannot be renewed. With the extension at home it lasts 24 hours. The manual way (copying the `ssid` cookie yourself) is described on the login page.

The permission it adds is `cookies`, limited to `https://auth.riotgames.com/`.
