# tripit-mcp

An [MCP](https://modelcontextprotocol.io) server for [TripIt](https://www.tripit.com). It gives an MCP client (Claude, etc.) **read-only** access to your trips and full itinerary — flights, hotels, car rentals, and activities — over stdio.

> **Unofficial.** This project is not affiliated with or endorsed by TripIt. It talks to TripIt's private web-app API, reverse-engineered from captured browser traffic, not TripIt's documented public API. The login flow's CSRF-cookie handling and failed-login detection were inferred from a single captured login rather than directly observed in every case — see `docs/superpowers/specs/2026-09-22-tripit-mcp-design.md` for what's confirmed vs. assumed. Use at your own risk against your own account.

## Requirements

- Node.js ≥ 20
- A TripIt account. Sign in once with `tripit-mcp login` (below). **Your password is never stored** — login exchanges it for a session on the spot, saves only the resulting cookies, and you re-run `login` if the session ever expires.

## Install

```bash
npm install
npm run build
```

## Sign in

```bash
node dist/index.js login
```

It prompts for your TripIt email and password (the password is not echoed), logs in, and writes the resulting session to `session.json` (mode `600`) in the data directory. **Your password is never written to disk.**

## Configuration

Once you've logged in, no secrets are needed — the server finds `session.json` on its own. See [`.env.example`](.env.example) for optional overrides: `TRIPIT_DATA_DIR` (default `~/.tripit-mcp`), `TRIPIT_PROXY_URL` (dev proxy), and `TRIPIT_SESSION_COOKIE` (bootstrap from a manually-captured cookie string instead of running `login`).

## Usage

Run over stdio from an MCP client:

```json
{
  "mcpServers": {
    "tripit": {
      "command": "node",
      "args": ["/absolute/path/to/tripit-mcp/dist/index.js"]
    }
  }
}
```

If a tool call fails with a message to run `tripit-mcp login` again, your session has expired — run it again in a terminal.

## Tools

| Tool | Description |
| --- | --- |
| `tripit_whoami` | Current profile: name, home city/airport, pro status, ical feed URL. |
| `tripit_list_trips` | List trips (upcoming by default); optional `past`, `limit`. |
| `tripit_get_trip` | Full itinerary for one trip (by `uuid`): flights, hotels, car rentals, activities, sorted chronologically. |
| `tripit_list_alerts` | Active TripIt Pro alerts (schedule changes, advisories). |

## Development

```bash
npm test        # vitest
npm run lint     # biome
npm run typecheck
```

Fixtures under `tests/fixtures/` are sanitized: structurally identical to real captured TripIt responses, with all personal data replaced.
