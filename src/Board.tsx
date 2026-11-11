import {
  closestCenter,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  type UniqueIdentifier,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Ellipsis, Trash2, X } from "lucide-react";
import { type MouseEvent as ReactMouseEvent, type SyntheticEvent, useEffect, useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { toCheck } from "../shared/fit";
import { type BoardData, type BoardListing, type Tier, tiers } from "./format";
import { type CardProps, ListingCard } from "./ListingCard";
import { type RemovableCar, RemoveCarDialog } from "./RemoveCar";
import { slabColor } from "./TierSlab";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export function Board() {
  const board = useQuery(api.board.get);
  const { model, check } = useSearch({ from: "/" });
  const move = useMoveListing();
  const [activeId, setActiveId] = useState<Id<"listings"> | null>(null);
  // While a car is dragged, each lane's car ids, with the dragged car in the lane under the
  // pointer, so the lane it is heading for makes room for it as its own cars would.
  const [dragLanes, setDragLanes] = useState<LaneIds | null>(null);
  const lastOver = useRef<UniqueIdentifier | null>(null);
  // Moving the car to another lane reflows the board; until that settles, the old
  // measurements could bounce it straight back.
  const justMoved = useRef(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      justMoved.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [dragLanes]);
  const [removing, setRemoving] = useState<RemovableCar | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  // A short travel threshold keeps a plain click opening the car; on touch a long press
  // starts the drag so swiping still scrolls the lane. Keyboard users move cars with the
  // tier buttons on the car's page.
  const sensors = useSensors(
    useSensor(LeftMouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  if (!board) return <BoardSkeleton />;
  // One board for every model; picking a model shows that model's own tier list.
  const filter = model === "none" || board.models.some((m) => m.id === model) ? model : undefined;
  const ofModel = filter ? board.listings.filter((l) => (l.modelId ?? "none") === filter) : board.listings;
  const visible = check ? ofModel.filter((l) => toCheck(l.keySpecs) > 0) : ofModel;
  const modelsById = new Map(board.models.map((m) => [m.id, m]));
  const modelNames = new Map(board.models.map((m) => [m.id, m.name]));
  // What each card needs besides its listing. The model name is noise when the board
  // already shows a single model; the model's limits feed the card's fit count.
  const cardProps = (listing: BoardListing): CardProps => {
    const carModel = modelsById.get(listing.modelId ?? "");
    return {
      modelName: filter ? undefined : carModel?.name,
      criteria: carModel,
      specDefs: board.keySpecs,
      home: board.home,
    };
  };
  const byId = new Map<UniqueIdentifier, BoardListing>(board.listings.map((l) => [l.listingId, l]));
  const boardLanes = laneIds(visible);
  const lanes = tiers.map(({ tier, label }) => ({
    tier,
    label,
    listings: (dragLanes ?? boardLanes)[tier].flatMap((id) => byId.get(id) ?? []),
  }));
  const active = activeId ? byId.get(activeId) : undefined;

  // The lane under the pointer decides the tier, so an empty lane takes a car anywhere
  // along it, slab included. Within a lane the nearest car decides the spot.
  const collisionDetection: CollisionDetection = (args) => {
    if (justMoved.current && lastOver.current) return [{ id: lastOver.current }];
    const lane = pointerWithin({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => isTier(c.id)),
    })[0]?.id;
    // Between two lanes the car stays where it was heading.
    if (!isTier(lane) || !dragLanes) return lastOver.current ? [{ id: lastOver.current }] : [];
    const cars = args.droppableContainers.filter((c) => dragLanes[lane].includes(c.id));
    const hit = cars.length > 0 ? closestCenter({ ...args, droppableContainers: cars })[0]?.id : lane;
    lastOver.current = hit ?? lane;
    return [{ id: lastOver.current }];
  };

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const { id } = active;
    setDragLanes((current) => {
      if (!current) return current;
      const from = laneOf(current, id);
      const to = isTier(over.id) ? over.id : laneOf(current, over.id);
      if (!from || !to || from === to) return current;
      // In front of the car it is over, or behind it once past that car's middle.
      const target = current[to];
      const overIndex = target.indexOf(over.id);
      const dragged = active.rect.current.translated;
      const behind = dragged !== null && dragged.left + dragged.width / 2 > over.rect.left + over.rect.width / 2;
      const index = overIndex === -1 ? target.length : overIndex + (behind ? 1 : 0);
      justMoved.current = true;
      return { ...current, [from]: current[from].filter((l) => l !== id), [to]: target.toSpliced(index, 0, id) };
    });
  }

  function endDrag() {
    setActiveId(null);
    setDragLanes(null);
    lastOver.current = null;
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const finalLanes = dragLanes;
    endDrag();
    const dragged = byId.get(active.id);
    const tier = finalLanes && laneOf(finalLanes, dragged?.listingId);
    if (!dragged || !over || !tier) return;
    let ids = finalLanes[tier];
    const overIndex = ids.indexOf(over.id);
    if (overIndex !== -1) ids = arrayMove(ids, ids.indexOf(dragged.listingId), overIndex);
    // Dropped back where it started: nothing to save.
    if (tier === dragged.tier && ids.join() === boardLanes[tier].join()) return;
    const index = ids.indexOf(dragged.listingId);
    const rank = rankBetween(byId.get(ids[index - 1])?.rank, byId.get(ids[index + 1])?.rank);
    void move({ listingId: dragged.listingId, tier, rank });
  }

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-16 sm:px-8">
      {board.listings.length > 0 && (board.models.length > 0 || board.keySpecs.length > 0) && (
        <BoardFilters board={board} selected={filter} check={check === true} ofModel={ofModel} />
      )}
      {(filter || check) && (
        <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="condensed text-4xl leading-none font-extrabold">
            {!filter ? "Cars to check" : filter === "none" ? "Cars without a model" : `${modelNames.get(filter)} tier list`}
          </h1>
          <p className="text-muted-foreground">
            {visible.length === 1 ? "1 car" : `${visible.length} cars`}
            {check && filter && " to check"}
          </p>
          {/* On phones the filter strip may have scrolled "All models" out of view. */}
          <Link to="/" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <X data-icon="inline-start" aria-hidden />
            Clear filter
          </Link>
        </div>
      )}
      {board.listings.length === 0 && (
        <div className="mb-6 max-w-prose space-y-1">
          <h1 className="condensed text-4xl leading-none font-extrabold">No cars yet</h1>
          <p className="text-muted-foreground">
            Set the{" "}
            <Link to="/settings" className="text-foreground underline underline-offset-4">
              models and key specs
            </Link>{" "}
            you are hunting, so cards show what decides a car's tier. Then{" "}
            <Link to="/add" className="text-foreground underline underline-offset-4">
              add cars
            </Link>
            ; new cars land in Watching.
          </p>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        // Cars move between lanes mid-drag, so lanes and cars are measured as they reflow.
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={({ active }) => {
          setActiveId(byId.get(active.id)?.listingId ?? null);
          setDragLanes(boardLanes);
        }}
        onDragOver={onDragOver}
        onDragCancel={endDrag}
        onDragEnd={onDragEnd}
      >
        <div className="space-y-3">
          {lanes.map((lane) => (
            <Lane
              key={lane.tier}
              {...lane}
              cardProps={cardProps}
              dragging={active !== undefined}
              target={active !== undefined && lane.listings.includes(active)}
              onRemove={(car) => {
                setRemoving(car);
                setRemoveOpen(true);
              }}
            />
          ))}
        </div>
        <DragOverlay>
          {active && <ListingCard listing={active} {...cardProps(active)} lifted />}
        </DragOverlay>
      </DndContext>
      {/* Keyed by car, so one car's pending or failed removal never carries over to the next. */}
      <RemoveCarDialog key={removing?.listingId} car={removing} open={removeOpen} onOpenChange={setRemoveOpen} />
    </main>
  );
}

function Lane({
  tier,
  label,
  listings,
  cardProps,
  dragging,
  target,
  onRemove,
}: {
  tier: Tier;
  label: string;
  listings: BoardListing[];
  cardProps: (listing: BoardListing) => CardProps;
  dragging: boolean;
  /** The dragged car would land in this lane. */
  target: boolean;
  onRemove: (car: RemovableCar) => void;
}) {
  const { setNodeRef } = useDroppable({ id: tier });
  const isLetter = label.length === 1;
  return (
    <section
      ref={setNodeRef}
      aria-label={`${label} tier`}
      className="flex flex-col sm:flex-row"
    >
      {/* The pit board: the one loud element on the page. */}
      <div
        className={cn(
          "flex shrink-0 items-baseline justify-between gap-3 rounded-t-lg px-4 py-2 sm:w-28 sm:flex-col sm:px-3 sm:items-start sm:justify-start sm:rounded-l-lg sm:rounded-tr-none sm:py-4",
          // Rejected is quieter through its fill only: label and count keep full contrast, and
          // the cars keep full ink so a live ad never looks removed.
          tier === "rejected" ? "bg-muted text-foreground" : slabColor(tier),
        )}
      >
        {/* On phones every label shares one size, so the header bars match; the letters grow on wider screens. */}
        <h2 className={cn("condensed text-4xl leading-none font-extrabold", isLetter ? "sm:text-7xl" : "sm:text-2xl")}>
          {label}
        </h2>
        {/* Pinned to the slab's foot, so it sits in the same place whatever the label. */}
        <p className="text-sm opacity-75 sm:mt-auto sm:pt-3">
          {listings.length === 1 ? "1 car" : `${listings.length} cars`}
        </p>
      </div>
      {/* Middle-button panning is a mouse extra; the lane scrolls like any other. */}
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        onMouseDown={panWithMiddleButton}
        className={cn(
          "relative flex min-h-20 flex-1 gap-3 overflow-x-auto rounded-b-lg p-3 transition-colors sm:min-h-44 sm:rounded-r-lg sm:rounded-bl-none",
          target && "bg-muted",
        )}
      >
        <SortableContext items={listings.map((l) => l.listingId)}>
          {listings.map((listing) => (
            <SortableCard key={listing.listingId} listing={listing} onRemove={onRemove} {...cardProps(listing)} />
          ))}
        </SortableContext>
        {listings.length === 0 && (
          <p className="self-center px-2 text-sm text-muted-foreground">
            {dragging ? "Drop here" : tier === "watching" ? "New cars from Claude land here" : "No cars"}
          </p>
        )}
      </div>
    </section>
  );
}

// dnd-kit's MouseSensor only ignores the right button, so the middle button would drag
// a car; it pans the lane instead (see panWithMiddleButton).
class LeftMouseSensor extends MouseSensor {
  static activators: typeof MouseSensor.activators = MouseSensor.activators.map((activator) => ({
    ...activator,
    handler: (event, options) => event.nativeEvent.button === 0 && activator.handler(event, options),
  }));
}

// Holding the middle button and moving the mouse drags a lane sideways, so a long lane
// scrolls without a horizontal wheel or the scrollbar.
function panWithMiddleButton(event: ReactMouseEvent<HTMLElement>) {
  if (event.button !== 1) return;
  // Stops the browser's own autoscroll and, on Linux, pasting the primary selection.
  event.preventDefault();
  const lane = event.currentTarget;
  const startX = event.clientX;
  const startScroll = lane.scrollLeft;
  let panned = false;
  const onMove = (move: MouseEvent) => {
    const dx = move.clientX - startX;
    if (!panned && Math.abs(dx) < 4) return;
    panned = true;
    lane.scrollLeft = startScroll - dx;
  };
  const onUp = (up: MouseEvent) => {
    if (up.button !== 1) return;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    if (!panned) return;
    // A middle click on a car opens it in a new tab; after a pan it should not. The
    // auxclick follows this mouseup in the same task, if it fires at all.
    const swallow = (click: MouseEvent) => click.preventDefault();
    window.addEventListener("auxclick", swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("auxclick", swallow, { capture: true }));
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

function SortableCard({
  listing,
  onRemove,
  ...props
}: { listing: BoardListing; onRemove: (car: RemovableCar) => void } & CardProps) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: listing.listingId,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("group/card relative", isDragging && "opacity-30")}
      {...listeners}
    >
      <ListingCard listing={listing} {...props} />
      <CardMenu title={listing.title} onRemove={() => onRemove(listing)} />
    </div>
  );
}

// Beside the card's link, which cannot hold a button. Presses stop here so they never
// start a drag or a lane pan; React events from the menu's portal bubble through here too.
function CardMenu({ title, onRemove }: { title: string; onRemove: () => void }) {
  const stop = (event: SyntheticEvent) => event.stopPropagation();
  return (
    // Only keeps a press on the menu from starting a card drag.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className="absolute top-2 right-2" onMouseDown={stop} onTouchStart={stop}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="secondary"
              size="icon-sm"
              aria-label={`Actions for ${title}`}
              // Shown on hover or focus where there is a mouse; always on touch screens.
              className="shadow-sm opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 any-pointer-coarse:opacity-100"
            />
          }
        >
          <Ellipsis aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto">
          <DropdownMenuItem variant="destructive" onClick={onRemove}>
            <Trash2 aria-hidden />
            Remove from board…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function BoardFilters({
  board,
  selected,
  check,
  ofModel,
}: {
  board: BoardData;
  selected: string | undefined;
  check: boolean;
  /** The cars of the selected model, for the to-check count. */
  ofModel: BoardListing[];
}) {
  const navigate = useNavigate({ from: "/" });
  const nav = useRef<HTMLElement>(null);
  // On phones the strip scrolls; keep the selected model in view.
  useEffect(() => {
    nav.current?.querySelector("[data-pressed]")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selected]);
  const count = (id: string) => board.listings.filter((l) => (l.modelId ?? "none") === id).length;
  const options = [
    { id: "all", label: "All models", count: board.listings.length },
    ...board.models.map((m) => ({ id: m.id, label: m.name, count: count(m.id) })),
    ...(count("none") > 0 ? [{ id: "none", label: "No model", count: count("none") }] : []),
  ];
  const unchecked = ofModel.filter((l) => toCheck(l.keySpecs) > 0).length;
  const chip = "condensed h-8 gap-1.5 text-base font-bold data-pressed:bg-foreground data-pressed:text-background";
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
            if (next) void navigate({ search: { ...(next !== "all" && { model: next }), ...(check && { check: true }) } });
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
            pressed={check}
            onPressedChange={(pressed) =>
              void navigate({ search: { ...(selected && { model: selected }), ...(pressed && { check: true }) } })
            }
            className={chip}
          >
            To check
            <span className="tabular-nums opacity-60">{unchecked}</span>
          </Toggle>
        </>
      )}
    </nav>
  );
}

function BoardSkeleton() {
  return (
    <main className="mx-auto max-w-[1600px] space-y-3 px-4 sm:px-8" aria-busy="true">
      {tiers.map(({ tier }) => (
        <Skeleton key={tier} className="h-40 rounded-lg" />
      ))}
    </main>
  );
}

// Car ids per lane, in board order.
type LaneIds = Record<Tier, UniqueIdentifier[]>;

function laneIds(listings: BoardListing[]): LaneIds {
  const lanes = Object.fromEntries(tiers.map(({ tier }) => [tier, [] as UniqueIdentifier[]])) as LaneIds;
  for (const l of listings.toSorted((a, b) => a.rank - b.rank)) lanes[l.tier].push(l.listingId);
  return lanes;
}

function laneOf(lanes: LaneIds, id: UniqueIdentifier | undefined) {
  return tiers.find(({ tier }) => id !== undefined && lanes[tier].includes(id))?.tier;
}

function isTier(id: UniqueIdentifier | undefined): id is Tier {
  return tiers.some(({ tier }) => tier === id);
}

function rankBetween(before: number | undefined, after: number | undefined) {
  if (before !== undefined && after !== undefined) return (before + after) / 2;
  if (before !== undefined) return before + 1;
  if (after !== undefined) return after - 1;
  return Date.now();
}

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
