#!/usr/bin/env bash
# Serves the app on its own local Convex deployment seeded with synthetic cars
# (convex/fixtures.ts), for design reviews. Usage: scripts/dev-design.sh [port]
#
# The Convex CLI's anonymous local mode always writes its deployment to
# .env.local in the directory it runs from, so it runs from .design/, which
# links to the code. The checkout's own .env.local (the cloud link) is never touched.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
work="$root/.design"
mkdir -p "$work"
for f in convex shared node_modules package.json tsconfig.json; do ln -sfn "$root/$f" "$work/$f"; done
cd "$work"
export CONVEX_AGENT_MODE=anonymous
# The CLI names the URL VITE_CONVEX_URL or CONVEX_URL depending on what it detects.
# A process env var beats the checkout's .env.local in Vite, so the app reads the fixtures.
start="url=\$(sed -n 's/^\(VITE_\)\{0,1\}CONVEX_URL=//p' .env.local | head -1)
[ -n \"\$url\" ] || { echo 'No local CONVEX_URL in .design/.env.local' >&2; exit 1; }
pnpm exec convex run fixtures:seed
cd '$root' && CONVEX_URL=\"\$url\" exec pnpm exec vite --host 127.0.0.1 --port ${1:-5190} --strictPort"
# --start and --run are exclusive in the CLI, so the start command seeds before serving.
exec pnpm exec convex dev --typecheck disable --tail-logs disable --start "$start"
