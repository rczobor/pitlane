import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    // The Babel React Compiler: plugin-react's native one is still experimental.
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    // Installable app. The service worker precaches the app shell so it starts without
    // waiting on the network; board data still comes live from Convex. A new version
    // waits until the user reloads (src/UpdatePrompt.tsx), so nothing mid-edit is lost.
    VitePWA({
      registerType: "prompt",
      // Vercel's deployment protection only lets the manifest through with credentials.
      useCredentials: true,
      manifest: {
        name: "Pitlane",
        short_name: "Pitlane",
        description: "A ranked watchlist for the cars you are hunting.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#e4e5e0",
        theme_color: "#e4e5e0",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        // A listing shared from the phone's share sheet opens /share (src/Share.tsx).
        // Apps disagree on where the link goes, so all three fields are read.
        share_target: {
          action: "/share",
          method: "GET",
          enctype: "application/x-www-form-urlencoded",
          params: { title: "title", text: "text", url: "url" },
        },
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: "/index.html",
      },
    }),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // `convex dev` writes CONVEX_URL to .env.local; expose just that to the app.
  envPrefix: ["VITE_", "CONVEX_URL"],
  // Reachable over Tailscale from other machines.
  server: { host: true, allowedHosts: ["homelab"] },
  build: { outDir: "dist/web" },
});
