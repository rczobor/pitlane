import type { Point } from "../shared/geo";

// A public token, restricted to the app's URLs in the Mapbox account. Map loads and static
// images both fit Mapbox's free tier for one person's watchlist.
export const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN || undefined;

const styleId = (dark: boolean) => (dark ? "dark-v11" : "light-v11");
export const mapStyle = (dark: boolean) => `mapbox://styles/mapbox/${styleId(dark)}`;

// Mapbox's maps use 512px tiles: at zoom z the world is 512 × 2^z pixels wide.
const tileSize = 512;

const mercator = ({ lat, lng }: Point) => {
  const sin = Math.sin((lat * Math.PI) / 180);
  return { x: (lng + 180) / 360, y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI) };
};

// The view that fits every point into a width × height image with padding, and where each
// point lands in it (as fractions of the image), so the app can draw its own pins on a
// static map instead of Mapbox's.
export function fitView(points: Point[], width: number, height: number, padding: number) {
  const projected = points.map(mercator);
  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const spanX = (maxX - minX) * tileSize;
  const spanY = (maxY - minY) * tileSize;
  const fit = Math.min((width - 2 * padding) / spanX, (height - 2 * padding) / spanY);
  // Zoom 0 at least: points far apart (other continents) would ask for less, which the
  // Static Images API rejects.
  const zoom = Number.isFinite(fit) ? Math.max(0, Math.min(8, Math.log2(fit))) : 6;
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const scale = tileSize * 2 ** zoom;
  return {
    zoom,
    center: {
      lng: center.x * 360 - 180,
      lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * center.y))) * 180) / Math.PI,
    },
    at(point: Point) {
      const p = mercator(point);
      return { left: (width / 2 + (p.x - center.x) * scale) / width, top: (height / 2 + (p.y - center.y) * scale) / height };
    },
  };
}

// A static map image without overlays (Static Images API); the app draws the pins.
export function staticMapUrl(token: string, view: { center: Point; zoom: number }, width: number, height: number, dark: boolean) {
  const { center, zoom } = view;
  const at = `${center.lng.toFixed(4)},${center.lat.toFixed(4)},${zoom.toFixed(2)}`;
  return `https://api.mapbox.com/styles/v1/mapbox/${styleId(dark)}/static/${at}/${width}x${height}@2x?access_token=${token}`;
}
