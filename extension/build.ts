// Builds the Chrome extension into dist/extension, ready for "Load unpacked".
// It talks to the deployment the web app uses: VITE_CONVEX_URL and
// VITE_CLERK_PUBLISHABLE_KEY come from the environment, or else from .env.local.
import { build } from "esbuild";
import { existsSync } from "node:fs";
import { cp, readFile, rm, writeFile } from "node:fs/promises";

// Only when neither is set, so a production build never mixes in the dev deployment.
const fromShell = process.env.VITE_CLERK_PUBLISHABLE_KEY || process.env.VITE_CONVEX_URL;
if (!fromShell && existsSync(".env.local")) process.loadEnvFile(".env.local");
const convexUrl = process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL;
const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!convexUrl || !publishableKey) {
  throw new Error("Set VITE_CONVEX_URL and VITE_CLERK_PUBLISHABLE_KEY, or run `pnpm dev` once to write .env.local.");
}

// The key encodes Clerk's Frontend API host, e.g. pk_live_<base64("clerk.example.com$")>.
const frontendApi = atob(publishableKey.split("_")[2] ?? "").replace(/\$$/, "");
const production = publishableKey.startsWith("pk_live_");
// Production's Frontend API is `clerk.` plus the web app's domain. In development, set
// PITLANE_APP_URL when the browser opens the web app on another host than localhost.
const appUrl = production
  ? `https://${frontendApi.replace(/^clerk\./, "")}`
  : (process.env.PITLANE_APP_URL ?? "http://localhost:5173");
// Where the web app keeps its Clerk session cookie, which the extension reads to share the
// sign-in: production's Frontend API host, or in development the web app's own host
// (cookies ignore the port).
const syncHost = production ? `https://${frontendApi}` : `${new URL(appUrl).protocol}//${new URL(appUrl).hostname}`;
const config: PitlaneConfig = { convexUrl, publishableKey, syncHost, appUrl };

const out = "dist/extension";
await rm(out, { recursive: true, force: true });
await build({
  entryPoints: ["extension/panel.ts", "extension/background.ts"],
  outdir: out,
  bundle: true,
  format: "esm",
  minify: true,
  // Clerk's sign-in UI: only its in-panel client loads it, and the extension never signs
  // in itself (see background.ts).
  external: ["@clerk/ui/*"],
  target: "chrome120",
  define: { PITLANE: JSON.stringify(config) },
});
for (const file of ["panel.html", "style.css"]) {
  await cp(`extension/${file}`, `${out}/${file}`);
}
const manifest = JSON.parse(await readFile("extension/manifest.json", "utf8"));
manifest.host_permissions = [...new Set([...manifest.host_permissions, `${syncHost}/*`, `https://${frontendApi}/*`])];
await writeFile(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`Built ${out} for ${production ? "production" : "development"} (${convexUrl})`);
