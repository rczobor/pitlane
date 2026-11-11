/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly CONVEX_URL: string;
  // A public Mapbox token (pk.…); without it the app shows no maps.
  readonly VITE_MAPBOX_TOKEN?: string;
}
