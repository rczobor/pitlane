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
7. An MCP server for agents to add, update and re-check listings.
8. A map of where the sellers are, and each car's distance from your home.

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

**Locations come from OpenStreetMap; maps come from Mapbox.** A seller's postcode
and city (plus the country, when the listing shows it) are turned into coordinates
by OpenStreetMap's Nominatim. Unlike Mapbox's free geocoding, its results may be
stored. One queue, run every minute, looks up new or moved sellers at no more than
one request per second, as Nominatim's usage policy asks. A listing saved before
this existed is located on its next re-check. Distances are straight lines from
the home you set on the map page. The map page and the car page's map image use
Mapbox; both stay within its free tier for one person's watchlist.

**Stack:** TypeScript, pnpm, Convex as the whole backend (data, the MCP server via
HTTP actions, scheduled jobs, file storage). The web app is Vite, React,
TanStack Router and shadcn/ui (Base UI). People sign in with Clerk, and so does
Claude through OAuth.

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

Maps need a public Mapbox token (`pk.…`), restricted to the app's URLs in the
Mapbox account. Put it in `.env.local` as `VITE_MAPBOX_TOKEN`, and set the same
variable in Vercel. Without it the app works, just without maps.

### Sign-in

The web app signs in with Clerk. Sign-up is invite-only: invite people from the
Clerk dashboard. A first sign-in sets up the account's user and an empty board. The
oldest user is the owner, the only one who can connect an agent, so on a fresh
deployment the owner signs in first.

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
connection sets the user up like a first sign-in on the web app. For now only the
owner (the oldest user) can connect: a car's listing facts are shared by every
board that tracks it, so another account's agent could rewrite them. Access tokens
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

Production starts empty. Sign in to the production site first, so you are its
owner.
