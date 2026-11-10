import type { Point } from "../shared/geo";

// A public token, restricted to the app's URLs in the Mapbox account. Map loads and static
// images both fit Mapbox's free tier for one person's watchlist.
export const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN || undefined;

const styleId = (dark: boolean) => (dark ? "dark-v11" : "light-v11");
export const mapStyle = (dark: boolean) => `mapbox://styles/mapbox/${styleId(dark)}`;

// A static image of the seller's pin, framed with home when it is set (Static Images API).
export function staticMapUrl(token: string, car: Point, home: Point | null, dark: boolean) {
  const at = (p: Point) => `${p.lng.toFixed(4)},${p.lat.toFixed(4)}`;
  const pins = [...(home ? [`pin-s-home+${dark ? "a2a8ad" : "5f656b"}(${at(home)})`] : []), `pin-l-car+f4be1a(${at(car)})`];
  const view = home ? "auto" : `${at(car)},5`;
  const params = new URLSearchParams({ access_token: token, ...(home && { padding: "48" }) });
  return `https://api.mapbox.com/styles/v1/mapbox/${styleId(dark)}/static/${pins.join(",")}/${view}/640x320@2x?${params}`;
}
