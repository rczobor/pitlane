// Builds the Chrome extension into dist/extension, ready for "Load unpacked".
import { build } from "esbuild";
import { cp, rm } from "node:fs/promises";

const out = "dist/extension";
await rm(out, { recursive: true, force: true });
await build({
  entryPoints: ["extension/popup.ts", "extension/options.ts"],
  outdir: out,
  bundle: true,
  format: "esm",
  target: "chrome120",
});
for (const file of ["manifest.json", "popup.html", "options.html", "style.css"]) {
  await cp(`extension/${file}`, `${out}/${file}`);
}
console.log(`Built ${out}`);
