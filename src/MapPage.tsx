import "mapbox-gl/dist/mapbox-gl.css";
import "./map.css";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import mapboxgl from "mapbox-gl";
import { ArrowLeft, House, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Point } from "../shared/geo";
import { type BoardData, type BoardListing, formatDistance, tiers } from "./format";
import { ListingCard } from "./ListingCard";
import { mapboxToken, mapStyle } from "./mapbox";
import { countClass, homeClass, notchClass, pinClass, pinFor } from "./pins";
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
  const results = useRef<HTMLElement>(null);
  const select = (place: Place | undefined) => {
    void navigate({ search: place ? { car: place.cars[0].listingId } : {}, replace: true });
    // The cars of a picked place sit below the map: bring them into view. Phones show them
    // from the top; wide screens scroll only as far as needed, keeping part of the map.
    if (place) {
      const phone = window.matchMedia("(max-width: 639px)").matches;
      requestAnimationFrame(() =>
        results.current?.scrollIntoView({ block: phone ? "start" : "nearest", behavior: "smooth" }),
      );
    }
  };
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
        <>
          <CarMap
            token={mapboxToken}
            places={places}
            home={board.home}
            selectedKey={selected?.key}
            onSelect={select}
          />
          <Legend home={board.home !== null} />
        </>
      ) : (
        <Alert>
          <AlertDescription>
            Maps need a public Mapbox token. Set <code className="font-semibold text-foreground">VITE_MAPBOX_TOKEN</code>{" "}
            and reload.
          </AlertDescription>
        </Alert>
      )}
      <section ref={results} aria-live="polite" className="mt-6 scroll-mt-4">
        {selected ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="font-semibold">
                {selected.location}
                {board.home && (
                  <span className="font-normal"> · {formatDistance(board.home, selected.point)} away</span>
                )}
              </h2>
              <span className="text-sm text-muted-foreground">{count(selected.cars.length)}</span>
              <Button variant="ghost" size="sm" onClick={() => select(undefined)}>
                <X data-icon="inline-start" aria-hidden />
                Clear
              </Button>
            </div>
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
                    showTier
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

// The notch (6px) plus the cap height of the base map's city labels, so a pin never sits on
// the name of the place it marks.
const pinOffset: [number, number] = [0, -14];

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
      // Anchored above the place, clear of the base map's own city name below it.
      const marker = new mapboxgl.Marker({ element, anchor: "bottom", offset: pinOffset }).setLngLat(place.point).addTo(map);
      // Mapbox marks every marker as an image; this one is a button.
      element.removeAttribute("role");
      return marker;
    });
    if (home) {
      added.push(new mapboxgl.Marker({ element: homeMarker(), anchor: "bottom", offset: pinOffset }).setLngLat(home).addTo(map));
    }

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

  // Shorter on phones, so the cars of a picked place are a short scroll away.
  return <div ref={container} className="h-[50svh] min-h-72 overflow-hidden rounded-lg bg-muted sm:h-[60svh]" />;
}

// The pit board in miniature: the best tier's letter (S in signal yellow), a dot for cars
// not ranked yet, muted when every car there is rejected or gone. Plain DOM, as Mapbox
// positions the element itself.
function placeMarker(place: Place) {
  const best = place.cars[0];
  const live = place.cars.some((c) => c.status === "available" && c.tier !== "rejected");
  const { letter, tone } = pinFor(best.tier, live);
  const element = document.createElement("button");
  element.type = "button";
  // Never scale a marker: CSS `scale` also multiplies Mapbox's positioning transform.
  // Pins keep full ink when another place is picked; the picked one gets a ring.
  element.className = cn(
    "cursor-pointer shadow-md data-selected:z-10 data-selected:ring-3 data-selected:ring-foreground data-selected:ring-offset-2 data-selected:ring-offset-background",
    pinClass(letter !== null, tone),
  );
  element.textContent = letter ?? "";
  if (place.cars.length > 1) element.append(span(countClass, String(place.cars.length)));
  element.append(span(notchClass(tone)));
  const tierNames = place.cars.map((c) => tiers.find((t) => t.tier === c.tier)!.label).join(", ");
  element.setAttribute("aria-label", `${place.location}: ${count(place.cars.length)} (${tierNames})`);
  return element;
}

function span(className: string, text = "") {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  if (!text) element.setAttribute("aria-hidden", "true");
  return element;
}

// What the pins mean. Shown, not described, so it matches the map exactly.
function Legend({ home }: { home: boolean }) {
  const item = "flex items-center gap-2";
  return (
    <ul aria-label="Map legend" className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
      <li className={item}>
        <span className={pinClass(true, "signal")} aria-hidden>
          S
        </span>
        <span className={pinClass(true, "slab")} aria-hidden>
          A
        </span>
        Best tier at that place
      </li>
      <li className={item}>
        <span className={pinClass(false, "slab")} aria-hidden />
        Watching
      </li>
      <li className={item}>
        <span className={cn(pinClass(true, "slab"), "relative")} aria-hidden>
          A<span className={countClass}>2</span>
        </span>
        Cars at one place
      </li>
      <li className={item}>
        <span className={pinClass(false, "gone")} aria-hidden />
        Rejected or ad removed
      </li>
      {home && (
        <li className={item}>
          <span className={homeClass} aria-hidden>
            <House className="size-4" strokeWidth={2.5} />
          </span>
          Home
        </li>
      )}
    </ul>
  );
}

function homeMarker() {
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
      // Wraps on phones: the place is shown in full so the user can check it.
      <p className="max-w-xl text-sm">
        <span className="text-muted-foreground">Distances are straight lines from </span>
        <span className="font-medium">{home.place}</span>{" "}
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 align-baseline underline underline-offset-4"
          onClick={() => setEditing(true)}
        >
          Change home
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
