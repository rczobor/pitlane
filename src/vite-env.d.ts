/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly CONVEX_URL: string;
  // A public Mapbox token (pk.…); without it the app shows no maps.
  readonly VITE_MAPBOX_TOKEN?: string;
}
