import "mapbox-gl/dist/mapbox-gl.css";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import mapboxgl from "mapbox-gl";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Point } from "../shared/geo";
import { type BoardData, type BoardListing, formatDistance, tiers } from "./format";
import { ListingCard } from "./ListingCard";
import { mapboxToken, mapStyle } from "./mapbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Cars at one place: usually one dealer's stock. Best tier first.
type Place = { key: string; point: Point; location: string; cars: BoardListing[] };

const tierOrder = tiers.map((t) => t.tier);
const placeKey = ({ lat, lng }: Point) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

export function MapPage() {
  const board = useQuery(api.board.get);
  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-16 sm:px-8">
      <Link to="/" className={buttonVariants({ variant: "ghost", className: "-ml-2.5" })}>
        <ArrowLeft data-icon="inline-start" aria-hidden />
        Board
      </Link>
      {board ? <MapView board={board} /> : <Skeleton className="mt-4 h-[60svh] rounded-lg" />}
    </main>
  );
}

function MapView({ board }: { board: BoardData }) {
  const { car } = useSearch({ from: "/map" });
  const navigate = useNavigate({ from: "/map" });
  const places = useMemo(() => {
    const byKey = new Map<string, Place>();
    for (const listing of board.listings) {
      if (!listing.geo) continue;
      const key = placeKey(listing.geo);
      const place = byKey.get(key) ?? { key, point: listing.geo, location: listing.location ?? "", cars: [] };
      place.cars.push(listing);
      byKey.set(key, place);
    }
    for (const place of byKey.values()) {
      place.cars.sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier) || a.rank - b.rank);
    }
    return [...byKey.values()];
  }, [board.listings]);
  const unplaced = board.listings.length - places.reduce((n, p) => n + p.cars.length, 0);
  const selected = places.find((p) => p.cars.some((c) => c.listingId === car));
  const select = (place: Place | undefined) =>
    void navigate({ search: place ? { car: place.cars[0].listingId } : {}, replace: true });
  const modelsById = new Map(board.models.map((m) => [m.id, m]));

  return (
    <>
      <div className="mt-4 mb-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="space-y-1">
          <h1 className="condensed text-4xl leading-none font-extrabold">Map</h1>
          <p className="text-muted-foreground">
            {places.length === 0 ? "No cars on the map yet" : `${count(board.listings.length - unplaced)} on the map`}
            {unplaced > 0 && `, ${count(unplaced)} without a known location`}
          </p>
        </div>
        <HomeControl home={board.home} />
      </div>
      {mapboxToken ? (
        <CarMap
          token={mapboxToken}
          places={places}
          home={board.home}
          selectedKey={selected?.key}
          onSelect={select}
        />
      ) : (
        <Alert>
          <AlertDescription>
            Maps need a public Mapbox token. Set <code className="font-semibold text-foreground">VITE_MAPBOX_TOKEN</code>{" "}
            and reload.
          </AlertDescription>
        </Alert>
      )}
      <section aria-live="polite" className="mt-6">
        {selected ? (
          <>
            <h2 className="mb-3 flex flex-wrap items-baseline gap-x-3 font-semibold">
              {selected.location}
              {board.home && (
                <span className="text-sm font-normal text-muted-foreground">
                  {formatDistance(board.home, selected.point)} from home, in a straight line
                </span>
              )}
            </h2>
            {/* relative: keeps the cards' screen-reader labels inside the scroller, as in board lanes. */}
            <div className="relative flex gap-3 overflow-x-auto pb-2">
              {selected.cars.map((listing) => {
                const model = modelsById.get(listing.modelId ?? "");
                return (
                  <ListingCard
                    key={listing.listingId}
                    listing={listing}
                    modelName={model?.name}
                    criteria={model}
                    specDefs={board.keySpecs}
                    home={board.home}
                  />
                );
              })}
            </div>
          </>
        ) : (
          places.length > 0 && <p className="text-muted-foreground">Pick a pin to see the cars there.</p>
        )}
      </section>
    </>
  );
}

const count = (n: number) => (n === 1 ? "1 car" : `${n} cars`);

function CarMap({
  token,
  places,
  home,
  selectedKey,
  onSelect,
}: {
  token: string;
  places: Place[];
  home: Point | null;
  selectedKey: string | undefined;
  onSelect: (place: Place | undefined) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const markers = useRef(new Map<string, HTMLElement>());
  const framed = useRef(false);
  // Markers are created once per data change; the latest handler is read at click time.
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    const created = new mapboxgl.Map({
      container: container.current!,
      accessToken: token,
      style: mapStyle(dark.matches),
      center: [10, 50],
      zoom: 3.5,
      // Scrolling the page over the map should scroll the page.
      cooperativeGestures: true,
    });
    created.addControl(new mapboxgl.NavigationControl({ showCompass: false }));
    const restyle = () => created.setStyle(mapStyle(dark.matches));
    dark.addEventListener("change", restyle);
    setMap(created);
    return () => {
      dark.removeEventListener("change", restyle);
      created.remove();
      framed.current = false;
    };
  }, [token]);

  useEffect(() => {
    if (!map) return;
    const added = places.map((place) => {
      const element = placeMarker(place);
      element.addEventListener("click", () => select.current(place));
      markers.current.set(place.key, element);
      const marker = new mapboxgl.Marker({ element }).setLngLat(place.point).addTo(map);
      // Mapbox marks every marker as an image; this one is a button.
      element.removeAttribute("role");
      return marker;
    });
    if (home) added.push(new mapboxgl.Marker({ element: homeMarker() }).setLngLat(home).addTo(map));

    // Frame every car and home once; later updates leave the view where the user put it.
    const points = [...places.map((p) => p.point), ...(home ? [home] : [])];
    if (!framed.current && points.length > 0) {
      framed.current = true;
      const bounds = new mapboxgl.LngLatBounds();
      for (const p of points) bounds.extend(p);
      map.fitBounds(bounds, { padding: 64, maxZoom: 7, animate: false });
    }
    return () => {
      for (const marker of added) marker.remove();
      markers.current.clear();
    };
  }, [map, places, home]);

  useEffect(() => {
    for (const [key, element] of markers.current) {
      if (key === selectedKey) element.dataset.selected = "true";
      else delete element.dataset.selected;
    }
  }, [map, places, selectedKey]);

  return <div ref={container} className="h-[60svh] min-h-80 overflow-hidden rounded-lg bg-muted" />;
}

// The pit board in miniature: the best tier's letter (S in signal yellow), a dot for cars
// not ranked yet, muted when every car there is rejected or gone. Plain DOM, as Mapbox
// positions the element itself.
function placeMarker(place: Place) {
  const best = place.cars[0];
  const live = place.cars.filter((c) => c.status === "available" && c.tier !== "rejected");
  const letter = ["S", "A", "B"].includes(best.tier) && live.length > 0 ? best.tier : null;
  const element = document.createElement("button");
  element.type = "button";
  element.className = cn(
    "condensed flex cursor-pointer items-center justify-center gap-0.5 font-extrabold leading-none shadow-md data-selected:ring-3 data-selected:ring-foreground",
    letter ? "h-8 min-w-8 rounded-md px-1.5 text-2xl" : "h-6 min-w-6 rounded-full px-1 text-sm",
    live.length === 0
      ? "border border-muted-foreground/50 bg-muted text-muted-foreground"
      : best.tier === "S"
        ? "bg-signal text-signal-foreground"
        : "bg-slab text-slab-foreground",
  );
  element.textContent = letter ?? (place.cars.length > 1 ? String(place.cars.length) : "");
  if (letter && place.cars.length > 1) {
    const more = document.createElement("span");
    more.className = "text-xs opacity-75";
    more.textContent = `+${place.cars.length - 1}`;
    element.append(more);
  }
  const tierNames = place.cars.map((c) => tiers.find((t) => t.tier === c.tier)!.label).join(", ");
  element.setAttribute("aria-label", `${place.location}: ${count(place.cars.length)} (${tierNames})`);
  return element;
}

function homeMarker() {
  const element = document.createElement("div");
  element.className =
    "flex size-7 items-center justify-center rounded-full border-2 border-background bg-foreground text-background shadow-md";
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", "Home");
  // Lucide's "house" icon.
  element.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
  return element;
}

// Where distances are measured from. Looked up on the server, so the place it found is
// shown back for the user to confirm.
function HomeControl({ home }: { home: BoardData["home"] }) {
  const setHome = useAction(api.board.setHome);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(home?.query ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(query: string) {
    setBusy(true);
    setError(null);
    try {
      await setHome({ query });
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof ConvexError ? String(caught.data.message) : "Saving failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (home && !editing) {
    return (
      <p className="flex max-w-full min-w-0 items-baseline gap-2 text-sm">
        <span className="shrink-0 text-muted-foreground">Distances from</span>
        <span className="truncate font-medium" title={home.place}>
          {home.place}
        </span>
        <Button variant="link" size="sm" className="h-auto shrink-0 p-0" onClick={() => setEditing(true)}>
          Change
        </Button>
      </p>
    );
  }
  return (
    <form
      className="w-full max-w-md space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) void save(value);
      }}
    >
      <Label htmlFor="home">Your home</Label>
      <div className="flex gap-2">
        <Input
          id="home"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Postcode and city, e.g. 1010 Wien"
          autoComplete="postal-code"
          aria-invalid={error !== null || undefined}
          aria-describedby={error ? "home-error" : "home-hint"}
        />
        <Button type="submit" disabled={busy || !value.trim()}>
          {busy ? "Finding…" : "Set home"}
        </Button>
        {home && (
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
      </div>
      {error ? (
        <p id="home-error" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p id="home-hint" className="text-sm text-muted-foreground">
          Cards then show how far each car is, in a straight line.
          {home && (
            <>
              {" "}
              <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => void save("")}>
                Remove home
              </Button>
            </>
          )}
        </p>
      )}
    </form>
  );
}
