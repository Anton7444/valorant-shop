# Riot relay

A small HTTPS relay for when Riot's login page cannot be opened on the network you are on. Run it on your home PC; the login-helper extension then sends only Riot's login pages through it, and every other site stays direct.

It is a CONNECT proxy, so traffic to Riot stays encrypted end to end: the relay only sees which Riot host is being reached, never tokens or responses. It refuses every host except Riot's login/API domains (plus its CDN and captcha), only allows port 443, and needs a username and password, so it is not an open proxy.

## 1. Run the relay (home PC, keep it on)

```bash
RELAY_USER=me RELAY_PASS='a long random string' python3 relay.py
```

Python 3.9+, no packages. Options (environment variables): `RELAY_PORT` (8899), `RELAY_HOST` (0.0.0.0), `RELAY_ALLOW` (`.riotgames.com,.pvp.net,.riotcdn.net,.rgpub.io,.hcaptcha.com`), `RELAY_MAX_CONNECTIONS` (64).

## 2. Make it reachable from outside

- On your home router, forward one TCP port (e.g. 8899) to the PC running the relay.
- Give your home connection a name that follows its changing IP, with a free dynamic-DNS service (DuckDNS, No-IP...).
- If the other network only allows web ports, run the relay on 443 (`RELAY_PORT=443`, which needs admin rights) and forward 443.

## 3. Point the extension at it

Install the login-helper extension (1.4.0+) in the browser on the other network, open its toolbar popup, enter the DDNS name, port, username and password, tick **Use the proxy** and save. See `extension/README.md`.

What that network can see: that you connect to your home address, and the relay's username and password (they travel unencrypted to the relay). It cannot read your Riot sign-in or tokens: those stay encrypted between your browser and Riot. Use a relay password you use nowhere else; the relay only reaches Riot's own domains, so it is of little use to anyone who learns it.
