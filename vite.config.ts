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
    // Installable app. The service worker precaches the scripts and styles so it starts
    // quickly; board data still comes live from Convex. The page itself comes from the
    // network first, so a reload always loads the newest version. An open page never
    // swaps versions on its own (src/UpdatePrompt.tsx), so nothing mid-edit is lost.
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
        // No html: a precached index.html would answer every reload with the old version
        // until the new worker takes over, which only the update prompt makes it do.
        globPatterns: ["**/*.{js,css,svg,png,ico,woff2}"],
        navigateFallback: null,
        runtimeCaching: [
          {
            // Offline, the last page this URL loaded.
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: { cacheName: "pages", expiration: { maxEntries: 20 } },
          },
          {
            // A reload can run a page newer than the active worker, whose precache lacks the
            // page's scripts. The waiting worker has already stored them, and the server drops
            // them at the next deploy, so look in every cache before the network.
            urlPattern: ({ url }) => url.pathname.startsWith("/assets/"),
            handler: async ({ request }) => (await caches.match(request)) ?? fetch(request),
          },
        ],
        // The map chunk is close to the 2 MiB default. A chunk left out of the precache would
        // be fetched from a newer deploy that no longer has it, and the map page would break.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
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
