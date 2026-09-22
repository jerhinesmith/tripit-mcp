# tripit-mcp design

## Purpose

An MCP server giving an MCP client (Claude, etc.) **read-only** access to a
personal TripIt account's trips and full itinerary detail (flights, hotels,
cars, activities) over stdio. Unofficial: talks to TripIt's private web-app
API, reverse-engineered from captured browser traffic (HAR), not TripIt's
documented public API.

Structural precedent: `strong-mcp` (sibling project), which does the same
thing for the Strong workout app — same language, same MCP transport, same
login-then-serve-from-cache shape. This spec follows that shape wherever
TripIt's API doesn't force a difference.

## Evidence base

Three HAR captures of `www.tripit.com` traffic (browser DevTools) were used
to derive every endpoint shape in this spec:

1. Initial capture: authenticated trips-list page load —
   `GET /api/v2/appConfig`, `GET /api/v2/get/profile`,
   `GET /api/v2/gtmDataAsJson`, `GET /api/v2/listProAlerts`,
   `GET /api/v2/list/trip?...`.
2. Trip-detail capture: clicking into one trip —
   `GET /api/v2/get/trip/uuid/{uuid}/include_objects/true?exclude_types=weather&should_get_new_seat_tracker_subscriptions=true`,
   response containing `Trip`, `AirObject`, `LodgingObject`, `CarObject`,
   `ActivityObject`.
3. Login capture: `POST /account/login` (form-encoded) → `302 /home` →
   `302 /app/` → same API calls as (1), now authenticated.

All three captures were exported with **cookies stripped** (request
`Cookie` and response `Set-Cookie` headers are absent everywhere, including
on the login response) — this appears to be a property of the export tool,
not chance. Two consequences, both addressed below: we never saw TripIt's
actual session cookie name(s), and capture 3 starts mid-flow at the login
POST, not the preceding `GET /account/login` that would show us where the
submitted `csrf_token` value comes from.

**Handling note:** capture 3's login POST body contains the account's real
password in plaintext (HAR captures raw form submissions). It was read only
to determine field *names*, never logged or written anywhere in this repo.
The source HAR file is not part of this project and should not be copied
into it; delete it from `~/Downloads` once no longer needed and consider
rotating the password since it briefly existed in a plaintext file.

## Scope

**In scope (v1):**
- Login via email + password, session persisted locally (cookie jar, not
  the password).
- List trips (upcoming/past).
- Get one trip's full itinerary: flights (with per-segment status/times),
  hotels, car rentals, activities.
- Current user profile (`whoami`).
- Pro alerts (e.g. schedule-change / advisory notices) — already present in
  the list/trip response, cheap to expose.

**Out of scope (v1), explicitly:**
- Any write operation (create/edit/delete trips or reservations) — no
  write traffic was captured, and reverse-engineering writes blind is far
  riskier against someone's real travel data than reads.
- TripIt's official OAuth 1.0a public API — the private web API was the
  chosen path (see prior conversation); revisit only if the private API
  proves too unstable to maintain.
- MFA/verification-code challenges during login — none was observed in the
  capture. If TripIt prompts for one on a given login attempt, the login
  command fails with a clear message rather than trying to handle it
  blindly; can be added later if it turns out to be a real obstacle.
- Non-personal-account features (Concur linking, enterprise/pro admin
  settings) beyond reading their presence on the profile.

## Architecture

TypeScript, Node ≥ 20, `@modelcontextprotocol/sdk` over stdio, `undici` for
HTTP, `zod` for tool schemas — identical dependency set to `strong-mcp`.
Same three-layer shape:

- **Auth/session layer** — owns the login flow and the persisted session.
- **API client layer** — typed wrappers around the three TripIt endpoints,
  normalizing TripIt's XML-derived JSON into clean objects.
- **MCP tool layer** — thin, read-only tools over the API client.

No local snapshot/cache layer like strong-mcp's `snapshot.json` — TripIt's
API here is already cheap, page-sized, read-only GETs (not a bulk sync
document), so tools call through live rather than maintaining a mirrored
cache. `tripit_get_trip` result MAY be cached in-memory per-process for the
duration of a session to avoid refetching the same trip repeatedly in one
conversation, but nothing is persisted to disk beyond the session itself.

## Auth flow

`tripit-mcp login` (CLI command, run once interactively, same pattern as
`strong-mcp login`):

1. `GET https://www.tripit.com/account/login` — establishes a pre-auth
   session cookie and (assumed, not directly observed) exposes a
   `csrf_token` value, most likely as a hidden form field in the returned
   HTML. Scrape it from there.
2. `POST https://www.tripit.com/account/login`, form-encoded body:
   `csrf_token`, `errors=`, `toc=1`, `redirect_url=home%2Findex`,
   `login_email_address`, `login_password` — using the cookie jar from
   step 1.
3. Follow the redirect chain (`302 → /home`, `302 → /app/`) with the same
   jar. Landing on `/app/` (200/304) with no further redirect to
   `/account/login` means success.
4. Persist the accumulated cookie jar to
   `~/.tripit-mcp/session.json` (mode `600`). **The password is never
   written to disk** — same posture as strong-mcp.

**CSRF header on subsequent calls:** every observed API call (GET and
POST alike) carries `x-csrf-token-wa`. No embedding of that value was found
in the static `/app/` HTML shell, so the working assumption is TripIt uses
a double-submit cookie: a non-HttpOnly cookie set alongside the session
(name unconfirmed — something like `csrf_token_wa`) that the SPA's JS
reads via `document.cookie` and mirrors into that header. Implementation
should, after login, scan the jar for a plausible candidate cookie and
mirror its value into `x-csrf-token-wa` on every request; **this is the one
piece of the auth flow to verify empirically against the live API** (log
what's in the jar on first real login, confirm which cookie matches the
header TripIt expects, adjust the candidate-selection logic once known).
If it turns out to be wrong, the symptom will be a 403 on API calls
immediately after a successful-looking login, not a login failure itself —
easy to distinguish while implementing.

**Session expiry:** if any API call's response is a redirect (or its body
looks like the login page rather than JSON), the tool call fails with
`Run \`tripit-mcp login\` again to sign in.` No silent auto-relogin, no
credential caching — matches strong-mcp's error message shape for the
equivalent case.

**Bootstrapping without running login (optional, mirrors strong-mcp):** an
env var escape hatch (e.g. `TRIPIT_SESSION_COOKIE`) to seed
`session.json` directly from a manually-captured cookie string, for
debugging — used once to bootstrap, then `session.json` is authoritative.

## API client layer

One HTTP client bound to `https://www.tripit.com`, carrying the cookie jar
+ CSRF header on every request, JSON `Accept` header, and the same
`x-tripit-app-info: web/0.0.2` / `x-requested-with: XMLHttpRequest` headers
observed in the capture (harmless to send, matches what a real client
sends, avoids being the one obviously-different signal).

Three endpoint wrappers:

| Function | Endpoint | Notes |
| --- | --- | --- |
| `getProfile()` | `GET /api/v2/get/profile` | Maps to `tripit_whoami`. |
| `listTrips({ past, pageSize, pageNum })` | `GET /api/v2/list/trip?exclude_types=weather&page_size=...&past=...&should_sort_trips_by_date=true&traveler=true&trip_permission_filter=all&page_num=...&isPast=...` | Maps to `tripit_list_trips`. Pagination params passed through; default page size mirrors what the web app itself used (10). |
| `getTrip(uuid)` | `GET /api/v2/get/trip/uuid/{uuid}/include_objects/true?exclude_types=weather&should_get_new_seat_tracker_subscriptions=true` | Maps to `tripit_get_trip`. |
| `listProAlerts()` | `GET /api/v2/listProAlerts` | Maps to `tripit_list_alerts`. |

**Normalization**, applied uniformly before data reaches the tool layer
(TripIt's JSON is a near-verbatim dump of an older XML API):
- String-typed booleans (`"true"`/`"false"`) → real `boolean`.
- String-typed numbers (ids, costs where unambiguous) → real `number`,
  except opaque long ids (`id`, `uuid`, `*_ref`) which stay strings.
- `@attributes` wrapper objects flattened into the parent.
- Singular-or-array inconsistency (e.g. `AirObject.Segment` is a bare
  object for a one-segment flight, an array for connections) normalized to
  always be an array.
- `StartDateTime`/`EndDateTime` (`{date, time, timezone, utc_offset}`)
  combined into a single ISO 8601 string with offset, plus the raw
  timezone name kept alongside for display.
- `total_cost` (`"3099.86 USD"` / `"$428.35 USD"` — inconsistently
  formatted in the wild) parsed into `{ amount: number, currency: string }`
  where it parses cleanly; left as the raw string otherwise rather than
  guessing.

## MCP tools

All read-only, no confirmation prompts needed (nothing mutates).

| Tool | Input | Output |
| --- | --- | --- |
| `tripit_whoami` | none | Name, primary email, home city/airport, pro status, ical feed URL. |
| `tripit_list_trips` | `past?: boolean`, `limit?: number` | Trip id/uuid, display name, dates, primary location, status (e.g. `all_clear`), whether it has an open pro alert. |
| `tripit_get_trip` | `uuid: string` | Full itinerary: trip summary + normalized flights (with segments), hotels, cars, activities, sorted chronologically. |
| `tripit_list_alerts` | none | Any active pro alerts (id, trip reference, message, created time). |

`tripit_get_trip` is the main payload tool; the others are lightweight.
Trip references between tools use `uuid` (stable, used in TripIt's own
URLs) rather than the numeric `id`.

## Error handling

- Session missing/expired → the "run login again" message above, for any
  tool.
- Network/5xx from TripIt → surfaced as a normal tool error with the
  status code; no retry logic in v1 (nothing here is a background job,
  the MCP client/user can just retry the call).
- Unknown/malformed shapes (TripIt changes their private API without
  notice) → normalization should fail loudly (throw) rather than silently
  drop fields, so breakage is visible immediately rather than producing
  quietly-wrong itinerary data.

## Testing

Fixture-based, same shape as strong-mcp's `tests/`: the response bodies
captured in the HARs are the seed for fixtures, but **sanitized** before
being committed — real name, emails, addresses, phone numbers,
confirmation numbers, and lat/longs in the source captures are replaced
with fake-but-structurally-identical values before any fixture file is
written to this repo. Normalization logic (string-bool/number coercion,
`@attributes` flattening, `Segment` array normalization, date combining,
cost parsing) gets unit tests against those fixtures. The login flow's
CSRF-cookie-mirroring assumption gets an integration-style smoke test that
can only run manually against a live account (documented in the README,
not part of CI), same as how strong-mcp's inferred write shapes verify
themselves live.

## Open items to verify during implementation

1. Which cookie (if any) mirrors into `x-csrf-token-wa` — confirm against
   a live login, adjust candidate-selection if the first guess is wrong.
2. Exact HTML location of the `csrf_token` hidden field on
   `GET /account/login` — confirm by fetching it directly once
   implementing, rather than guessing the selector now.
3. Whether `toc=1` is only required on first-ever login (terms-of-service
   acceptance) or must be sent every time — send it every time unless it
   turns out to cause a problem, since it was present in the one login we
   observed.
