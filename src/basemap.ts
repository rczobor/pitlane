import "mapbox-gl/dist/mapbox-gl.css";
import "./map.css";
import mapboxgl, { type MapOptions } from "mapbox-gl";
import { cn } from "@/lib/utils";
import { homeClass, notchClass } from "./pins";

// Every map in the app is Mapbox Standard, live: the Static Images API can't draw Standard.
// Its day or night light follows the system theme.
const lightPreset = (dark: boolean) => (dark ? "night" : "day");

export function createMap(
  container: HTMLElement,
  token: string,
  options: Omit<MapOptions, "container" | "accessToken" | "style" | "config">,
) {
  const dark = window.matchMedia("(prefers-color-scheme: dark)");
  const map = new mapboxgl.Map({
    ...options,
    container,
    accessToken: token,
    style: "mapbox://styles/mapbox/standard",
    // Parks, shops and stations say nothing about where a car is.
    config: { basemap: { lightPreset: lightPreset(dark.matches), showPointOfInterestLabels: false } },
  });
  const retheme = () => map.setConfigProperty("basemap", "lightPreset", lightPreset(dark.matches));
  dark.addEventListener("change", retheme);
  // Design captures wait for this: Mapbox's network never goes quiet, and its tiles and
  // labels draw in a worker.
  map.on("idle", () => container.setAttribute("data-map-ready", ""));
  return {
    map,
    remove: () => {
      dark.removeEventListener("change", retheme);
      map.remove();
    },
  };
}

// Standard sets a city's name just above its dot. The notch (6px) clears that name, so a
// pin never covers the name of the place it marks.
export const pinOffset: [number, number] = [0, -22];

export function homeMarker() {
  const element = document.createElement("div");
  element.className = cn(homeClass, "shadow-md");
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", "Home");
  // Lucide's "house" icon.
  element.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
  element.append(span(notchClass("home")));
  return element;
}

export function span(className: string, text = "") {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  if (!text) element.setAttribute("aria-hidden", "true");
  return element;
}
