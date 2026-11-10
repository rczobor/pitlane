# Pitlane

Working name: Listing Watchlist.

A personal watchlist for cars found on listing sites. It
replaces an unordered "saved" list with a ranked tier board, scores each car
against your criteria, and tracks changes. AI agents add and update listings; you
make the decisions. Personal use first, shared with friends later.

## v1 features

1. Add a car from its listing URL; the details (title, price, year, mileage, fuel,
   gearbox, options, photos, seller) are captured and saved.
2. Tier board: S / A / B / Watching / Rejected, drag-and-drop.
3. Criteria profile (budget, year range, max mileage, must-haves, deal-breakers)
   with an automatic match score per car.
4. Personal notes and pros/cons per car.
5. Change tracking: price history, listing removed/sold, days listed.
6. Side-by-side comparison of 2–3 cars.
7. Agent API (REST + MCP server) to add, update and re-check listings.

## Constraints

- Single user for now, but the data model is ready for multiple users and shared
  boards.
- No bulk scraping or searching: only listings someone added are ever loaded, at a
  low re-check rate.
- The core is generic ("listing" + "criteria"); cars are the first listing type.

Later: shared boards with comments and votes, more sources (AutoScout24, local
sites), alerts on price drops or new matching listings.

## Decisions

**The app never fetches listing pages itself.** Listings are captured in the
user's own browser instead:

- **Automated route:** Claude Desktop with Claude in Chrome reads the page and
  saves it through the MCP server.
- **Manual route:** our own Chrome extension saves the listing you are looking at,
  with details and photos.

Both send the same snapshot ([`shared/listing.ts`](shared/listing.ts)) to one
intake, so validation lives in one place and the app does not care who captured a
listing.

**Snapshots are append-only.** Each capture that changes something adds a
timestamped snapshot recording who captured it. Price history, days listed and
removal come from the snapshots. A re-check with unchanged data only bumps
`lastCheckedAt`.

**The app owns the re-check schedule,** not the agent. It decides what is due and
enforces the minimum interval; an agent just works through the list. A failed or
blocked page load is never recorded as "removed".

**Key specs are the user's call.** A board defines the models it tracks and the
key specs that decide a car's tier (PDLS+, seats, gearbox, colour, …), with
preferred values per model. A spec the listing text names shows as an unconfirmed
suggestion; only values the user confirms count towards a car's fit.

**The capturing agent translates the seller's description** into English and saves
it beside the original, so no translation service is needed. A translation does not
count as a change, and a capture without one keeps the saved translation until the
description itself changes.

**Agents never move cars between tiers.** New listings land in Watching; tiers,
notes and pros/cons are yours.

**Photos are copied into Convex storage** so they outlive the ad. Downloads are
limited to each source's own image host, and
redirects are refused.

**Stack:** TypeScript, pnpm, Convex as the whole backend (data, REST via HTTP
actions, scheduled jobs, file storage). The MCP server is a small local stdio
process over the REST API. The web app is Vite, React, TanStack Router and
shadcn/ui (Base UI). Until there are user accounts, it signs in with an API token
kept in the browser.

## Build order

1. ✅ Convex data model, the intake and the MCP server.
2. ✅ Tier board web app.
3. ✅ Criteria and match scores, then notes and pros/cons: models with their own
   tier list, budget, years and mileage; key specs (confirmed / from listing /
   missing / unknown) with preferred values and deal-breakers per model; a fit
   count on each card and a "How it fits" breakdown on the car page; a check mode
   for confirming specs against the photos; notes, pros and cons per car.
4. Chrome extension (manual route).
5. ✅ Re-checks (due list, failed checks retried later) and the price history chart.
6. ✅ Side-by-side comparison of up to three cars.

## Development

Requires Node 24+ (the MCP server runs as TypeScript directly) and pnpm.

```sh
pnpm install
pnpm dev          # Convex dev deployment; writes CONVEX_URL / CONVEX_SITE_URL to .env.local
pnpm dev:web      # web app on :5173, also reachable over Tailscale at http://homelab:5173
pnpm test
pnpm typecheck
```

Create an API token for each agent or extension. It is printed once; only its hash
is stored:

```sh
pnpm convex run tokens:create '{"name": "claude-desktop"}'
```

### Claude Desktop

Build the extension and install it in Claude Desktop (double-click the file, or
Settings → Extensions → Install Extension). It runs on Claude Desktop's own Node,
so the machine needs nothing else. The install form asks for the token, which
Claude Desktop keeps in the OS keychain; the API URL is pre-filled from
`.env.local`:

```sh
pnpm build:mcpb   # → dist/pitlane.mcpb
```

Alternatively, with Node 24+ and a checkout on that machine, add the server to
Claude Desktop's config (Settings → Developer → Edit Config). `PITLANE_API_URL` is
the deployment's `CONVEX_SITE_URL`:

```json
{
  "mcpServers": {
    "pitlane": {
      "command": "node",
      "args": ["/absolute/path/to/pitlane/mcp/server.ts"],
      "env": {
        "PITLANE_API_URL": "https://<deployment>.convex.site",
        "PITLANE_API_TOKEN": "pit_…"
      }
    }
  }
}
```

Tools: `save_listing`, `mark_listing_removed`, `list_due_rechecks`,
`report_check_failed`, `list_listings`, `get_listing`.

To re-check, ask Claude to "re-check my Pitlane listings": it asks for the due
list, opens each page and saves it again. A listing is due a day after its last
check; a page that failed to load is retried after six hours.

### REST API

All routes need `Authorization: Bearer pit_…` and are scoped to the token's board.

| Route | Purpose |
| --- | --- |
| `POST /api/listings` | Save a snapshot: `{ "status": "available", "url", ...listing }`, `{ "status": "removed", "url" }`, or `{ "status": "failed", "url", "reason" }` for a re-check that could not read the page |
| `GET /api/rechecks` | Up to 10 listings due for a re-check, oldest first |
| `GET /api/listings` | The board's listings with tier, status, price and last check |
| `GET /api/listings/{listingId}` | One listing with full details, price history and photos |

Invalid input returns `400` with an `issues` list naming each bad field.

## Deployment

The web app is a static build on Vercel; Convex hosts everything else. One
Convex project, created by Vercel's Convex integration, holds every deployment:
your own dev deployment for local work (`pnpm dev`), production for the Vercel
production site, and a preview deployment per branch for PR previews.

[`vercel.json`](vercel.json) makes each Vercel build deploy the Convex functions
first, then build the app against that deployment's URL, so the two never drift
apart. The integration sets `CONVEX_DEPLOY_KEY` in Vercel, which picks the target
deployment. Every path is served `index.html` so deep links survive a reload.

To link a fresh checkout to the project's dev deployment, run `pnpm dev` and
choose the existing project in the team the integration created.

Production starts empty. Create its tokens and build the Claude Desktop extension
against it:

```sh
pnpm convex run --prod tokens:create '{"name": "claude-desktop"}'
CONVEX_SITE_URL=https://<prod-deployment>.convex.site pnpm build:mcpb
```
