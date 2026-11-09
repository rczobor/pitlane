import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // `convex dev` writes CONVEX_URL to .env.local; expose just that to the app.
  envPrefix: ["VITE_", "CONVEX_URL"],
  // Reachable over Tailscale from other machines.
  server: { host: true, allowedHosts: ["homelab"] },
  build: { outDir: "dist/web" },
});
