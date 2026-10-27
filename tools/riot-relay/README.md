# Riot relay

A small HTTPS relay for when Riot refuses the backend's own IP (the app then shows "Access denied by Riot API"). Run it on a machine with an IP Riot accepts, such as your home connection, and the backend sends its Riot calls through it.

It is a CONNECT proxy, so the traffic to Riot stays encrypted end to end: the relay only sees which Riot host is being reached, never tokens or responses. It refuses every host except Riot's API domains, only allows port 443 and needs a username and password, so it is not an open proxy.

## Run the relay (on the machine with the good IP)

```bash
RELAY_USER=me RELAY_PASS='a long random string' python3 relay.py
```

Python 3.9+, no packages. Options (environment variables): `RELAY_PORT` (8899), `RELAY_HOST` (0.0.0.0), `RELAY_ALLOW` (`.riotgames.com,.pvp.net`), `RELAY_MAX_CONNECTIONS` (64).

The backend has to be able to reach it. The username and password travel in the clear to the relay, so do not expose it on the open internet over plain TCP: put both machines on a private network (e.g. Tailscale / WireGuard) or reach it through a TLS tunnel.

## Point the backend at it

Set this environment variable on the backend and restart it:

```
RIOT_PROXY_URL=http://me:a-long-random-string@<relay address>:8899
```

Leave it empty to call Riot directly. It only affects calls to Riot (sign-in, store, profile, battle pass); asset data and skin videos are unchanged.
