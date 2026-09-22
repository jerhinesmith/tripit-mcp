# tripit-mcp

An [MCP](https://modelcontextprotocol.io) server for [TripIt](https://www.tripit.com). It gives an MCP client (Claude, etc.) **read-only** access to your trips and full itinerary — flights, hotels, car rentals, and activities — over stdio.

> **Unofficial.** This project is not affiliated with or endorsed by TripIt. It talks to TripIt's private web-app API, reverse-engineered from captured browser traffic, not TripIt's documented public API. Use at your own risk against your own account.

## Requirements

- Node.js ≥ 20
- Google Chrome installed (used only for `tripit-mcp login` — see below; the MCP server itself never launches a browser)
- A TripIt account. Sign in once with `tripit-mcp login` (below). **Your password is never stored, and never touches this program at all** — you type it directly into a real Chrome window.

## Install

```bash
npm install
npm run build
```

## Sign in

```bash
node dist/index.js login
```

TripIt's login page sits behind bot-detection (Akamai Bot Manager) that a plain HTTP client can't get past — confirmed empirically, see `docs/superpowers/specs/2026-09-22-tripit-mcp-design.md` for the history. So instead of prompting for credentials in the terminal, this opens a real, visible Chrome window on TripIt's login page and waits for you to log in there, exactly like you normally would. Once it detects a successful login, it reads the session cookies out of that browser and writes them to `session.json` (mode `600`) in the data directory, then closes the window. **Your password is never written to disk, logged, or even received by this program** — it goes straight from your keystrokes into Chrome.

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
