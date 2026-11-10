// A public token, restricted to the app's URLs in the Mapbox account. Map loads fit
// Mapbox's free tier for one person's watchlist. Kept apart from the map library, so a
// page can check for maps without loading it.
export const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN || undefined;
