import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Import, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api } from "../convex/_generated/api";
import { toCheck } from "../shared/fit";
import { type CarAction, MoveSheet } from "./BoardActions";
import { laneIds, laneOf, type Lanes, lotNumbers, ordinal, placeCar, rankIn, stepCar } from "./boardOrder";
import { Catalogue } from "./Catalogue";
import { type BoardData, type BoardListing, checkLabel, formatDateTime, tiers } from "./format";
import type { CardProps } from "./ListingCard";
import { PendingCaptures } from "./PendingCaptures";
import { type CarExit, type RemovableCar, RemoveCarDialog } from "./RemoveCar";
import { tierName } from "./TierSlab";
import { Tower } from "./Tower";
import type { TierViewProps } from "./useTierDrag";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type BoardSearch = { model?: string; check?: true; removed?: true };

// The filter the board was last shown with, so a car's page leads back to the same view.
let lastSearch: BoardSearch = {};
export const lastBoardSearch = () => lastSearch;

// From 640px up the board is a catalogue of photo lots; under it, a timing tower of rows.
const wideQuery = "(min-width: 640px)";
const subscribeWide = (listener: () => void) => {
  const query = window.matchMedia(wideQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};
const useWide = () => useSyncExternalStore(subscribeWide, () => window.matchMedia(wideQuery).matches);

export function Board() {
  const board = useQuery(api.board.get);
  const search = useSearch({ from: "/" });
  const { model, check, removed } = search;
  useEffect(() => {
    lastSearch = search;
  }, [search]);
  const wide = useWide();
  const move = useMoveListing();
  const [removing, setRemoving] = useState<{ car: RemovableCar; kind: CarExit } | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  // Keyboard and sheet moves are announced, and keep focus on the car they moved.
  const [announcement, setAnnouncement] = useState("");
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    const id = refocus.current;
    if (!id) return;
    refocus.current = null;
    const link = document.querySelector<HTMLElement>(`[data-car="${id}"]`);
    link?.focus({ preventScroll: true });
    link?.scrollIntoView({ block: "nearest" });
  });

  if (!board) return <BoardSkeleton />;
  // One board for every model; picking a model shows that model's own tier list.
  const filter = model === "none" || board.models.some((m) => m.id === model) ? model : undefined;
  const shown = removed ? board.listings : board.listings.filter((l) => l.status !== "removed");
  const ofModel = filter ? shown.filter((l) => (l.modelId ?? "none") === filter) : shown;
  const visible = check ? ofModel.filter((l) => toCheck(l.keySpecs) > 0) : ofModel;
  const modelsById = new Map(board.models.map((m) => [m.id, m]));
  const filteredModel = filter ? modelsById.get(filter) : undefined;
  // What each card needs besides its listing. The model name is noise when the board
  // already shows a single model; the model's limits feed the card's fit.
  const cardProps = (listing: BoardListing): CardProps => {
    const carModel = modelsById.get(listing.modelId ?? "");
    return {
      modelName: filter ? undefined : carModel?.name,
      criteria: carModel,
      specDefs: board.keySpecs,
      home: board.home,
    };
  };
  const byId = new Map(board.listings.map((l) => [l.listingId as string, l]));
  const lanes = laneIds(visible);
  const carName = (listing: BoardListing) => modelsById.get(listing.modelId ?? "")?.name ?? listing.title;

  // Saves the car's place in `next` and says where it went.
  function place(next: Lanes, id: string) {
    const car = byId.get(id);
    const placed = rankIn(next, id, (other) => byId.get(other)?.rank);
    if (!car || !placed) return;
    void move({ listingId: car.listingId, tier: placed.tier, rank: placed.rank });
    setAnnouncement(`${carName(car)} moved to ${tierName(placed.tier)}, ${ordinal(placed.index + 1)}`);
  }

  const view: TierViewProps = {
    lanes,
    byId,
    cardProps,
    lots: lotNumbers(lanes),
    canMarkRemoved: board.canMarkRemoved,
    onAction: (listing: BoardListing, action: CarAction) => {
      if (action === "move") {
        setMoving(listing.listingId);
        setMoveOpen(true);
      } else {
        setRemoving({ car: listing, kind: action });
        setRemoveOpen(true);
      }
    },
    onMove: (id, tier, rank) => {
      const car = byId.get(id);
      if (car) void move({ listingId: car.listingId, tier, rank });
    },
    onStep: (id, step) => {
      const next = stepCar(lanes, id, step);
      if (!next) return;
      refocus.current = id;
      place(next, id);
    },
  };

  const movingCar = moving ? byId.get(moving) : undefined;
  const movingTier = moving ? laneOf(lanes, moving) : undefined;
  const empty = board.listings.length === 0;
  const lastCheck = Math.max(...visible.map((l) => l.lastCheckedAt ?? 0));

  return (
    <main className="px-4 pb-16 sm:px-8">
      {!empty && (board.models.length > 0 || board.keySpecs.length > 0 || hasRemoved(board.listings)) && (
        <BoardFilters board={board} search={{ ...search, model: filter }} shown={shown} ofModel={ofModel} />
      )}
      {(filter || check) && (
        <div className="mb-4">
          {/* A filtered board names itself; on phones the heading sits on the tower's 2px rule. */}
          <h1 className="condensed border-foreground text-[1.75rem] leading-none font-extrabold max-sm:border-b-2 max-sm:pb-2 sm:text-[2.125rem]">
            {!filter ? "Cars to check" : filter === "none" ? "Cars without a model" : `${filteredModel?.name} tier list`}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
            <span>
              {visible.length === 1 ? "1 car" : `${visible.length} cars`}
              {check && filter && " to check"}
              {/* The tower reads its limits against the model's targets. */}
              {!wide &&
                filteredModel &&
                criteriaLabels(filteredModel).map((label) => <span key={label}> · {label}</span>)}
            </span>
            {/* On phones the filter strip may have scrolled "All models" out of view. */}
            <Link to="/" search={removed ? { removed } : {}} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <X data-icon="inline-start" aria-hidden />
              Clear filter
            </Link>
          </p>
        </div>
      )}
      {!filter && !check && !empty && !wide && (
        <p className="mb-3 text-[0.8125rem] text-muted-foreground">
          <b className="font-semibold text-foreground">{visible.length}</b> {visible.length === 1 ? "car" : "cars"} ranked
          {lastCheck > 0 && <> · Last re-check {formatDateTime(lastCheck)}</>}
        </p>
      )}
      {empty && (
        <div className="mb-6 max-w-prose space-y-2">
          <h1 className="condensed text-4xl leading-none font-extrabold">{wide ? "Your catalogue is empty" : "Your board is empty"}</h1>
          <p className="text-muted-foreground">
            Set the{" "}
            <Link to="/settings" className="text-foreground underline underline-offset-4">
              models and key specs
            </Link>{" "}
            you are hunting, so cars show what decides their tier. New cars land in Watching.
          </p>
          <Link to="/add" className={buttonVariants({ variant: "outline" })}>
            <Import data-icon="inline-start" aria-hidden />
            Add cars
          </Link>
        </div>
      )}
      {/* Shared cars have no model or specs yet, so filtered views leave them out. */}
      {wide ? (
        <>
          {!filter && !check && <PendingCaptures />}
          <Catalogue {...view} />
        </>
      ) : (
        <Tower view={view} specDefs={board.keySpecs} pending={!filter && !check} />
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <MoveSheet
        car={movingCar}
        model={movingCar && carName(movingCar)}
        tier={movingTier}
        index={moving && movingTier ? lanes[movingTier].indexOf(moving) : 0}
        count={movingTier ? lanes[movingTier].length : 0}
        open={moveOpen && movingCar !== undefined}
        onOpenChange={setMoveOpen}
        onTier={(tier) => moving && place(placeCar(lanes, moving, tier, lanes[tier].length), moving)}
        onStep={(delta) => {
          const next = moving && stepCar(lanes, moving, { by: "place", delta });
          if (moving && next) place(next, moving);
        }}
      />
      {/* Keyed by car, so one car's pending or failed removal never carries over to the next. */}
      <RemoveCarDialog
        key={removing?.car.listingId}
        kind={removing?.kind}
        car={removing?.car ?? null}
        open={removeOpen}
        onOpenChange={setRemoveOpen}
      />
    </main>
  );
}

// The model's limits, in the words the car page uses ("Budget up to €165,000").
function criteriaLabels(model: BoardData["models"][number]) {
  const labels: string[] = [];
  if (model.maxPrice !== undefined) labels.push(checkLabel({ kind: "price", limit: model.maxPrice, status: "unknown" }));
  if (model.minYear !== undefined || model.maxYear !== undefined) {
    labels.push(checkLabel({ kind: "year", min: model.minYear, max: model.maxYear, status: "unknown" }));
  }
  if (model.maxMileageKm !== undefined) labels.push(checkLabel({ kind: "mileage", limit: model.maxMileageKm, status: "unknown" }));
  return labels;
}

function BoardFilters({
  board,
  search,
  shown,
  ofModel,
}: {
  board: BoardData;
  /** With an unknown model already dropped. */
  search: BoardSearch;
  /** The cars the board shows, removed ads included only when asked for. */
  shown: BoardListing[];
  /** The shown cars of the selected model, for the to-check count. */
  ofModel: BoardListing[];
}) {
  const { model: selected, check, removed } = search;
  const navigate = useNavigate({ from: "/" });
  // Each control changes its own part of the view and keeps the rest.
  const go = (next: BoardSearch) =>
    void navigate({
      search: {
        ...(next.model && { model: next.model }),
        ...(next.check && { check: true }),
        ...(next.removed && { removed: true }),
      },
    });
  const nav = useRef<HTMLElement>(null);
  // On phones the strip scrolls; keep the selected model in view.
  useEffect(() => {
    nav.current?.querySelector("[data-pressed]")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selected]);
  const count = (id: string) => shown.filter((l) => (l.modelId ?? "none") === id).length;
  const options = [
    { id: "all", label: "All models", count: shown.length },
    ...board.models.map((m) => ({ id: m.id, label: m.name, count: count(m.id) })),
    ...(count("none") > 0 ? [{ id: "none", label: "No model", count: count("none") }] : []),
  ];
  const unchecked = ofModel.filter((l) => toCheck(l.keySpecs) > 0).length;
  const gone = board.listings.filter(
    (l) => l.status === "removed" && (!selected || (l.modelId ?? "none") === selected),
  ).length;
  // shrink-0: the strip scrolls on phones, and the Toggle's min-w-7 would otherwise let it squeeze a chip.
  const chip = "condensed h-8 shrink-0 gap-1.5 text-base font-bold";
  return (
    <nav
      ref={nav}
      aria-label="Filter the board"
      className="mb-4 flex items-center gap-3 overflow-x-auto pb-1 [mask-image:linear-gradient(to_right,black_92%,transparent)] sm:[mask-image:none]"
    >
      {board.models.length > 0 && (
        <ToggleGroup
          aria-label="Model"
          variant="outline"
          size="sm"
          value={[selected ?? "all"]}
          onValueChange={(value) => {
            const next = value[0];
            // Clicking the selected model again is a no-op rather than an empty selection.
            if (next) go({ ...search, model: next === "all" ? undefined : next });
          }}
        >
          {options.map((option) => (
            <ToggleGroupItem key={option.id} value={option.id} className={chip}>
              {option.label}
              <span className="tabular-nums opacity-60">{option.count}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      {board.keySpecs.length > 0 && (
        <>
          <span aria-hidden className="h-6 w-px shrink-0 bg-border" />
          {/* Cars whose key specs still need a look at the photos; combines with the model. */}
          <Toggle
            variant="outline"
            size="sm"
            pressed={check === true}
            onPressedChange={(pressed) => go({ ...search, check: pressed || undefined })}
            className={chip}
          >
            To check
            <span className="tabular-nums opacity-60">{unchecked}</span>
          </Toggle>
        </>
      )}
      {hasRemoved(board.listings) && (
        <>
          <span aria-hidden className="h-6 w-px shrink-0 bg-border" />
          {/* "Show" because a pressed filter chip otherwise reads as "only these cars". */}
          <Toggle
            variant="outline"
            size="sm"
            pressed={removed === true}
            onPressedChange={(pressed) => go({ ...search, removed: pressed || undefined })}
            className={chip}
          >
            Show removed
            <span className="tabular-nums opacity-60">{gone}</span>
          </Toggle>
        </>
      )}
    </nav>
  );
}

function BoardSkeleton() {
  return (
    <main className="space-y-3 px-4 sm:px-8" aria-busy="true">
      {tiers.map(({ tier }) => (
        <Skeleton key={tier} className="h-40 rounded-lg" />
      ))}
    </main>
  );
}


const hasRemoved = (listings: BoardListing[]) => listings.some((l) => l.status === "removed");

// Moves the card locally at once; Convex replaces this with the server's answer.
function useMoveListing() {
  return useMutation(api.board.move).withOptimisticUpdate((store, { listingId, tier, rank }) => {
    const board = store.getQuery(api.board.get, {});
    if (!board) return;
    store.setQuery(
      api.board.get,
      {},
      { ...board, listings: board.listings.map((l) => (l.listingId === listingId ? { ...l, tier, rank } : l)) },
    );
  });
}
