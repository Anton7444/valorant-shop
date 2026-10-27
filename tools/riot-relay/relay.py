#!/usr/bin/env python3
"""A tiny HTTPS relay (CONNECT proxy) for the backend's calls to Riot.

Run it on a machine you control whose IP Riot does not block, e.g. your home connection, and
point the backend at it with RIOT_PROXY_URL. It only tunnels to Riot's own API hosts and needs a
username and password, so it cannot be used as an open proxy. Python 3.9+, standard library only.

    RELAY_USER=me RELAY_PASS='a long random string' python3 relay.py

Environment:
    RELAY_USER / RELAY_PASS   required; clients must send them (HTTP proxy basic auth)
    RELAY_HOST                bind address, default 0.0.0.0
    RELAY_PORT                listen port, default 8899
    RELAY_ALLOW               comma-separated host suffixes that may be reached,
                              default ".riotgames.com,.pvp.net,.riotcdn.net,.rgpub.io,.hcaptcha.com"
    RELAY_TARGET_PORTS        comma-separated destination ports, default "443"
    RELAY_MAX_CONNECTIONS     simultaneous tunnels, default 64
"""

import asyncio
import base64
import hmac
import logging
import os
import sys

USER = os.environ.get("RELAY_USER", "")
PASSWORD = os.environ.get("RELAY_PASS", "")
HOST = os.environ.get("RELAY_HOST", "0.0.0.0")
PORT = int(os.environ.get("RELAY_PORT", "8899"))
ALLOW = tuple(s.strip().lower() for s in os.environ.get("RELAY_ALLOW", ".riotgames.com,.pvp.net,.riotcdn.net,.rgpub.io,.hcaptcha.com").split(",") if s.strip())
TARGET_PORTS = {int(p) for p in os.environ.get("RELAY_TARGET_PORTS", "443").split(",") if p.strip()}
MAX_CONNECTIONS = int(os.environ.get("RELAY_MAX_CONNECTIONS", "64"))
HEADER_LIMIT = 16 * 1024
IDLE_SECONDS = 120

log = logging.getLogger("riot-relay")
slots = asyncio.Semaphore(MAX_CONNECTIONS)


def authorised(headers: dict[str, str]) -> bool:
    value = headers.get("proxy-authorization", "")
    if not value.lower().startswith("basic "):
        return False
    try:
        supplied = base64.b64decode(value[6:].strip()).decode()
    except Exception:
        return False
    expected = f"{USER}:{PASSWORD}"
    return hmac.compare_digest(supplied.encode(), expected.encode())


def host_allowed(host: str) -> bool:
    host = host.lower().rstrip(".")
    return any(host.endswith(suffix) for suffix in ALLOW)


async def reply(writer: asyncio.StreamWriter, status: str, extra: str = "") -> None:
    writer.write(f"HTTP/1.1 {status}\r\n{extra}Content-Length: 0\r\nConnection: close\r\n\r\n".encode())
    await writer.drain()


async def pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        while True:
            data = await asyncio.wait_for(reader.read(65536), IDLE_SECONDS)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    except (asyncio.TimeoutError, ConnectionError, OSError):
        pass
    finally:
        try:
            writer.close()
        except Exception:
            pass


async def handle(client_reader: asyncio.StreamReader, client_writer: asyncio.StreamWriter) -> None:
    peer = client_writer.get_extra_info("peername")
    try:
        head = await asyncio.wait_for(client_reader.readuntil(b"\r\n\r\n"), 15)
        if len(head) > HEADER_LIMIT:
            return
        lines = head.decode("latin-1").split("\r\n")
        parts = lines[0].split()
        headers = {}
        for line in lines[1:]:
            if ":" in line:
                key, _, value = line.partition(":")
                headers[key.strip().lower()] = value.strip()

        if not authorised(headers):
            log.info("%s: auth failed", peer)
            await reply(client_writer, "407 Proxy Authentication Required", 'Proxy-Authenticate: Basic realm="relay"\r\n')
            return
        if len(parts) != 3 or parts[0].upper() != "CONNECT":
            await reply(client_writer, "405 Method Not Allowed")
            return
        host, _, port_text = parts[1].rpartition(":")
        if not port_text.isdigit() or int(port_text) not in TARGET_PORTS or not host_allowed(host):
            log.info("%s: refused %s", peer, parts[1])
            await reply(client_writer, "403 Forbidden")
            return

        async with slots:
            try:
                remote_reader, remote_writer = await asyncio.wait_for(asyncio.open_connection(host, int(port_text)), 15)
            except (OSError, asyncio.TimeoutError):
                await reply(client_writer, "502 Bad Gateway")
                return
            client_writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            await client_writer.drain()
            await asyncio.gather(pipe(client_reader, remote_writer), pipe(remote_reader, client_writer))
    except (asyncio.TimeoutError, asyncio.IncompleteReadError, asyncio.LimitOverrunError, ConnectionError, OSError):
        pass
    finally:
        try:
            client_writer.close()
        except Exception:
            pass


async def main() -> None:
    if not USER or not PASSWORD:
        sys.exit("Set RELAY_USER and RELAY_PASS first.")
    server = await asyncio.start_server(handle, HOST, PORT, limit=HEADER_LIMIT)
    log.info("Relaying to %s on %s:%s", ", ".join(ALLOW), HOST, PORT)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
