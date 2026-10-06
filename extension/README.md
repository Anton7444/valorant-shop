# Valorant Shop Login Helper

Browser extension (Chrome / Edge / Brave, Manifest V3) that removes the
"copy the localhost URL" step when logging in.

## Install (once per browser)
1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and pick this `extension` folder.

## Use
Click **Open Riot Login** on the site as usual and sign in. After Riot
redirects to `http://localhost/redirect#...`, the extension sends your original site tab to the
site with the login result, closes the Riot login tab, and the site finishes the
login automatically (one tab left). Without the extension the
site still works with the manual paste box.

If the site is hosted somewhere else, edit `SITE_URL` in `background.js` and
reload the extension.

After updating the files, press the reload icon on the extension in `chrome://extensions`.
