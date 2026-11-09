// Packs the MCP server as a Claude Desktop extension: dist/pitlane.mcpb.
// Bundled into one file so it runs on the Node that ships with Claude Desktop.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";

const out = "dist/mcpb";
await rm("dist", { recursive: true, force: true });
await build({
  entryPoints: ["mcp/server.ts"],
  outfile: `${out}/server/index.mjs`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
});

// Pre-fill the API URL with this checkout's deployment, so installing only asks for the token.
const manifest = JSON.parse(await readFile("mcp/manifest.json", "utf8"));
const env = parseEnv(await readFile(".env.local", "utf8").catch(() => ""));
const siteUrl = process.env.CONVEX_SITE_URL ?? env.CONVEX_SITE_URL;
if (siteUrl?.startsWith("https://")) manifest.user_config.api_url.default = siteUrl;
await writeFile(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));

execFileSync("mcpb", ["pack", out, "dist/pitlane.mcpb"], { stdio: "inherit" });
