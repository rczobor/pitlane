import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  // The Babel React Compiler: plugin-react's native one is still experimental.
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // `convex dev` writes CONVEX_URL to .env.local; expose just that to the app.
  envPrefix: ["VITE_", "CONVEX_URL"],
  // Reachable over Tailscale from other machines.
  server: { host: true, allowedHosts: ["homelab"] },
  build: { outDir: "dist/web" },
});
