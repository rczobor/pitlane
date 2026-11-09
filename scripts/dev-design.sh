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
echo \$\$ > '$work/vite.pid'
cd '$root' && CONVEX_URL=\"\$url\" exec node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${1:-5190} --strictPort"
# The CLI starts --start in its own process group and does not stop it, so a signal to
# this script or its group would leave Vite running. Vite records its PID (the start
# shell execs into it); stop it and every remaining descendant on the way out.
rm -f "$work/vite.pid"
killtree() { for child in $(pgrep -P "$1"); do killtree "$child"; done; kill "$1" 2>/dev/null || true; }
cleanup() {
  trap - EXIT TERM INT
  [ -f "$work/vite.pid" ] && kill "$(cat "$work/vite.pid")" 2>/dev/null
  for child in $(pgrep -P $$); do killtree "$child"; done
}
trap cleanup EXIT TERM INT
# --start and --run are exclusive in the CLI, so the start command seeds before serving.
# Run in the background and wait, so the trap fires as soon as a signal arrives.
pnpm exec convex dev --typecheck disable --tail-logs disable --start "$start" &
wait $!
