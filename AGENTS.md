# Pitlane

A personal watchlist for cars found on listing sites: a ranked tier board, match
scores against the user's criteria, and change tracking. AI agents add and re-check
listings through an MCP server; the user makes the decisions.

[README.md](README.md) holds the product decisions, the build order and how to run
everything. Read it before changing behaviour.

## Layout

- `convex/`: the whole backend (schema, intake, the MCP server via HTTP actions,
  scheduled re-checks, photo storage). `convex/_generated/` is committed.
- `shared/`: the listing snapshot schema and fit scoring used by Convex and the web
  app.
- `src/`: the web app (Vite, React, TanStack Router, shadcn/ui on Base UI).

## Checks

CI runs these on every PR; run them before handing work off:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Tests run Convex functions with `convex-test` in the edge runtime. Prefer one
focused test for the behaviour you change.

## Rules

- **The repository is public.** Never name the listing site in prose, commit
  messages or PR descriptions, and never commit real listing ids, photo URLs or
  dealer names; fixtures use made-up data. Code that has to match the site's URLs
  may name it.
- **Only touch your own Convex dev deployment.** Never run Convex commands with
  `--prod` or against a deployment someone else uses unless asked. Never commit
  `.env.local` or API tokens.
- **The app never fetches listing pages itself.** Listings arrive as snapshots from
  the user's browser (see the README's Decisions).
- **Design reviews** run on a separate local deployment seeded with synthetic cars:
  `pnpm dev:design [port]`. It never touches the checkout's `.env.local`.

## Agent skills

Agent skills live in `.agents/skills/`; `.claude/skills` links to the same
folder, and `CLAUDE.md` links to this file. `skills-lock.json` records the Convex
and shadcn skills; rerunning their commands pulls the latest upstream version:

- Convex: `pnpm exec convex ai-files install` (or `update`) refreshes the Convex
  skills, `convex/_generated/ai/` and the Convex section below.
- shadcn: `pnpm dlx skills add shadcn/ui --skill shadcn --agent claude-code --agent codex --copy --yes`.
- TanStack Router ships its skills inside the npm package; see Skill Loading below.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

<!-- intent-skills:start -->
## Skill Loading

Use the repository’s installed Intent. If it is unavailable, report the missing dependency instead of downloading a replacement.
Before editing files for a substantial task:
- Run `pnpm exec intent list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm exec intent load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->
