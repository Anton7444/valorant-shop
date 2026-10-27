# Riot relay

A small HTTPS relay for when Riot is blocked where you are. Run it on a machine with a connection Riot accepts, such as your home PC. It serves two uses:

- **Your browser** (e.g. a school network that blocks Riot's login page): the login-helper extension sends only Riot's pages through the relay. See "School / blocked network" below.
- **The backend**, if Riot refuses the backend's own IP (the app shows "Access denied by Riot API"): set `RIOT_PROXY_URL`.

It is a CONNECT proxy, so the traffic to Riot stays encrypted end to end: the relay only sees which Riot host is being reached, never tokens or responses. It refuses every host except Riot's API domains, only allows port 443 and needs a username and password, so it is not an open proxy.

## Run the relay (on the machine with the good IP)

```bash
RELAY_USER=me RELAY_PASS='a long random string' python3 relay.py
```

Python 3.9+, no packages. Options (environment variables): `RELAY_PORT` (8899), `RELAY_HOST` (0.0.0.0), `RELAY_ALLOW` (`.riotgames.com,.pvp.net,.riotcdn.net,.rgpub.io,.hcaptcha.com`), `RELAY_MAX_CONNECTIONS` (64).

The backend has to be able to reach it. The username and password travel in the clear to the relay, so do not expose it on the open internet over plain TCP: put both machines on a private network (e.g. Tailscale / WireGuard) or reach it through a TLS tunnel.

## Point the backend at it

Set this environment variable on the backend and restart it:

```
RIOT_PROXY_URL=http://me:a-long-random-string@<relay address>:8899
```

Leave it empty to call Riot directly. It only affects calls to Riot (sign-in, store, profile, battle pass); asset data and skin videos are unchanged.

## School / blocked network (browser through your home PC)

1. Run the relay at home (above) and keep that computer on.
2. Make it reachable from outside: on your home router forward one TCP port (e.g. 8899) to the PC running the relay, and give your home connection a name that follows its changing IP with a free dynamic-DNS service (DuckDNS, No-IP...). If the school only allows web ports, run the relay on 443 (`RELAY_PORT=443`, which needs admin rights) and forward 443.
3. Install the login-helper extension on the school browser, open its toolbar popup, enter the DDNS name, port, username and password, tick **Use the proxy** and save (see `extension/README.md`).

What the school network can see: that you connect to your home address, and the relay's username and password (they are sent unencrypted to the relay). It cannot read your Riot sign-in or tokens: those stay encrypted end to end between your browser and Riot. Because the relay password is exposed that way, use one you use nowhere else; the relay only reaches Riot's own domains, so it is of little use to anyone who learns it.
