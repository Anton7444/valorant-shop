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
