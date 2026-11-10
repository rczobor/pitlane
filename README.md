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

- **Automated route:** Claude with Claude in Chrome reads the page and saves it
  through the MCP server.
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

**Stack:** TypeScript, pnpm, Convex as the whole backend (data, REST and the MCP
server via HTTP actions, scheduled jobs, file storage). The web app is Vite, React,
TanStack Router and shadcn/ui (Base UI). People sign in with Clerk, and so does
Claude through OAuth; scripts and the extension use API tokens.

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

Requires Node 24+ and pnpm.

```sh
pnpm install
pnpm dev          # Convex dev deployment; writes CONVEX_URL / CONVEX_SITE_URL to .env.local
pnpm dev:web      # web app on :5173, also reachable over Tailscale at http://homelab:5173
pnpm test
pnpm typecheck
```

### Sign-in

The web app signs in with Clerk. Sign-up is invite-only: invite people from the
Clerk dashboard. A first sign-in takes over the user that `tokens:create` makes for
the owner, so the board and API tokens carry over. Anyone else gets an empty board.
API tokens always go to the oldest user, so on a fresh deployment the owner signs
in or creates a token first.

Each side names one Clerk instance: development for local work and previews,
production for the production site.

- **Web app:** `VITE_CLERK_PUBLISHABLE_KEY` in `.env.local` locally, and in Vercel
  per environment.
- **Convex:** `CLERK_FRONTEND_API_URL` on each deployment (`pnpm convex env set`),
  and as a default for preview deployments. Clerk's Convex integration must be on,
  so session tokens carry the `convex` audience.

### Claude (MCP)

The MCP server runs on Convex at `<CONVEX_SITE_URL>/mcp`. Add it in Claude under
Customize → Connectors → Add custom connector, with the deployment's URL (for
Claude Code: `claude mcp add --transport http pitlane <url>`). Claude signs in with
OAuth: Clerk is the authorization server and shows a consent screen, and Convex
checks Clerk's access tokens, whose audience must be that exact URL. A first
connection sets the user up like a first sign-in on the web app. Access tokens
last a day and Claude refreshes them. To cut Claude off, revoke its grant in Clerk
(the user's connected apps); a token already issued works until it expires.

Each deployment's URL is registered as an MCP server in its Clerk instance
(Agents → MCP servers, or the Clerk MCP's `configure_mcp_server`), which also turns
on audience claims and client ID metadata documents. Preview deployments are not
registered, so connect Claude to dev or production.

Tools: `save_listing`, `mark_listing_removed`, `list_due_rechecks`,
`report_check_failed`, `list_listings`, `get_listing`.

To re-check, ask Claude to "re-check my Pitlane listings": it asks for the due
list, opens each page and saves it again. A listing is due a day after its last
check; a page that failed to load is retried after six hours.

### API tokens

Scripts and the browser extension use the REST API with an API token. Create one
per client; it is printed once, and only its hash is stored. Settings lists them
and revokes them.

```sh
pnpm convex run tokens:create '{"name": "chrome-extension"}'
```

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

Production starts empty. Sign in to the production site first, then create API
tokens there if a script or the extension needs one:

```sh
pnpm convex run --prod tokens:create '{"name": "chrome-extension"}'
```
