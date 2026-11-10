import { Link } from "@tanstack/react-router";
import mapboxgl from "mapbox-gl";
import { useEffect, useRef, useState } from "react";
import type { Point } from "../shared/geo";
import type { Tier } from "./format";
import { createMap, homeMarker, pinOffset, span } from "./basemap";
import { notchClass, pinClass, pinFor } from "./pins";
import { cn } from "@/lib/utils";

// A still map of where the car is (and home), with the map page's own pins. It opens the
// full map with this car's place picked. Loaded with its own chunk, so a car page only
// fetches the map library when it shows a map.
export default function SellerMap({
  token,
  listingId,
  geo,
  home,
  tier,
  live,
  location,
}: {
  token: string;
  listingId: string;
  geo: Point;
  home: Point | null;
  tier: Tier;
  live: boolean;
  location: string | undefined;
}) {
  const container = useRef<HTMLDivElement>(null);
  // One marker element for the map's life: a tier change repaints the pin inside it rather
  // than rebuilding the map (a reload, a blank flash and another Mapbox map load). Mapbox
  // owns the marker element's classes, so the pin is a child.
  const [pin] = useState(() => document.createElement("div"));

  useEffect(() => {
    const { letter, tone } = pinFor(tier, live);
    const face = document.createElement("div");
    face.className = cn(pinClass(letter !== null, tone), "relative shadow-md");
    face.textContent = letter ?? "";
    face.append(span(notchClass(tone)));
    pin.replaceChildren(face);
  }, [pin, tier, live]);

  useEffect(() => {
    const points = home ? [geo, home] : [geo];
    const bounds = new mapboxgl.LngLatBounds();
    for (const p of points) bounds.extend(p);
    const { map, remove } = createMap(container.current!, token, {
      bounds,
      // Room above each place for its pin, which stands on a notch, and enough country
      // around them to see where they are.
      fitBoundsOptions: { padding: { top: 88, bottom: 40, left: 64, right: 64 }, maxZoom: 6 },
      interactive: false,
    });
    pin.setAttribute("aria-hidden", "true");
    const markers = [new mapboxgl.Marker({ element: pin, anchor: "bottom", offset: pinOffset }).setLngLat(geo).addTo(map)];
    if (home) {
      const element = homeMarker();
      element.setAttribute("aria-hidden", "true");
      markers.push(new mapboxgl.Marker({ element, anchor: "bottom", offset: pinOffset }).setLngLat(home).addTo(map));
    }
    // The link below covers the map; the pins are pictures, not controls.
    for (const marker of markers) marker.getElement().removeAttribute("role");
    return remove;
    // Coordinates, not objects, so a re-render never rebuilds the map.
  }, [token, pin, geo.lat, geo.lng, home?.lat, home?.lng]);

  return (
    <div className="relative mt-3">
      {/* Sized by its ratio, not by `inset`: Mapbox's stylesheet makes the map `relative`
          (and clips it, so the corners round here and the link's focus ring stays visible). */}
      <div ref={container} className="aspect-[2/1] rounded-lg bg-muted" />
      {/* Beside the map, not around it: Mapbox's attribution button must not sit inside a
          link. Its controls stack above this. */}
      <Link
        to="/map"
        search={{ car: listingId }}
        className="absolute inset-0 z-[1] rounded-lg outline-offset-2"
        aria-label={`Open the map${location ? ` at ${location}` : ""}`}
      />
    </div>
  );
}
