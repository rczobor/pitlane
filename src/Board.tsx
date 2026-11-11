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
import { ChevronLeft, ChevronRight, Ellipsis, ImageOff, LayoutGrid, Trash2, X } from "lucide-react";
import { type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject, type SyntheticEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { toCheck } from "../shared/fit";
import { type BoardData, type BoardListing, formatKm, formatPrice, formatRegistrationYear, type Tier, tiers } from "./format";
import { type CardProps, ListingCard } from "./ListingCard";
import { type RemovableCar, RemoveCarDialog } from "./RemoveCar";
import { slabColor, TierSlab } from "./TierSlab";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
          {/* Lanes size their own cards; the lifted card takes the size of the one it lifts. */}
          {active && <ListingCard listing={active} {...cardProps(active)} lifted className="w-full" />}
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
  const { frame, lane, view } = useLaneScroll(listings.length);
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
        <div className="sm:mt-auto sm:pt-3">
          <LaneCount
            tier={tier}
            label={label}
            listings={listings}
            view={view}
            jump={(index) => jumpTo(lane.current, index)}
            modelName={(listing) => cardProps(listing).modelName}
          />
        </div>
      </div>
      {/* Middle-button panning is a mouse extra; the lane scrolls like any other. */}
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        ref={frame}
        data-more-start={view?.start || undefined}
        data-more-end={view?.end || undefined}
        className={cn(
          "group/lane relative flex min-w-0 flex-1 rounded-b-lg transition-colors sm:rounded-r-lg sm:rounded-bl-none",
          target && "bg-muted",
        )}
      >
        {/* The lane fades out at an end that hides cars; the ticks below show each car and
            which are on screen. The scroll padding keeps a card scrolled into view
            (by the arrows or by tabbing) clear of the fade. Phones fade less, so the peek of
            the next card stays legible. */}
        <div
          ref={lane}
          onMouseDown={panWithMiddleButton}
          className="relative flex min-h-20 flex-1 scroll-px-6 gap-3 overflow-x-auto p-3 [--fade-end:0px] [--fade-start:0px] [mask-image:linear-gradient(to_right,transparent,black_var(--fade-start),black_calc(100%-var(--fade-end)),transparent)] [scrollbar-width:none] [--fade:1.5rem] group-data-more-end/lane:[--fade-end:var(--fade)] group-data-more-start/lane:[--fade-start:var(--fade)] sm:min-h-44 sm:scroll-px-16 sm:[--fade:4rem]"
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
        <LaneArrow direction="back" onClick={() => lane.current && pageLane(lane.current, "back")} />
        <LaneArrow direction="forward" onClick={() => lane.current && pageLane(lane.current, "forward")} />
        {view && (
          <LaneIndex listings={listings} view={view} lane={lane} modelName={(listing) => cardProps(listing).modelName} />
        )}
      </div>
    </section>
  );
}

// One tick per car under a lane that hides cars, filled for the cars on screen; a click
// brings that car into view. A compact index from the lane's start, so no tick reads as the
// card above it; ticks shrink only when a long lane would not fit them. The click area
// reaches into the gap below the lane, so it is 24px tall without covering the cards.
// Under a mouse, hovering the ticks opens a strip of the cars' photos and prices, so the
// user can aim at a car by sight; touch screens tap the ticks.
function LaneIndex({
  listings,
  view,
  lane,
  modelName,
}: {
  listings: BoardListing[];
  view: LaneView;
  lane: RefObject<HTMLDivElement | null>;
  /** Undefined when the board shows one model. */
  modelName: (listing: BoardListing) => string | undefined;
}) {
  // The car under the pointer, marked on both its tick and its photo: the strip's photos are
  // wider than the ticks, so the two rows do not line up.
  const [pointed, setPointed] = useState<number>();
  const jump = (index: number) => jumpTo(lane.current, index);
  const shown = (index: number) => index >= view.first && index <= view.last;
  // Only a mouse points: a tap would leave its tick marked.
  const point = (index: number) => ({
    onPointerEnter: (event: ReactPointerEvent) => event.pointerType === "mouse" && setPointed(index),
    onPointerLeave: () => setPointed((current) => (current === index ? undefined : current)),
  });
  return (
    // No gap between the ticks' click areas (the gap is padding inside each), so the pointer
    // never falls through between ticks and the strip stays open while it sweeps along them.
    <div aria-hidden className="group/index pointer-events-none absolute inset-x-3 -bottom-3 flex h-6">
      {/* Bottom padding, not a margin, so the pointer keeps the hover on its way up. */}
      <div className="pointer-events-auto absolute bottom-full left-0 hidden max-w-full pb-1 group-hover/index:block pointer-coarse:hidden">
        {/* Tiles keep their width and wrap onto more rows in a long lane, rather than
            shrinking until prices and models no longer read. */}
        <div className="flex flex-wrap gap-1.5 rounded-lg bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/40">
          {listings.map((listing, index) => (
            <button
              key={listing.listingId}
              type="button"
              tabIndex={-1}
              title={listing.title}
              onClick={() => jump(index)}
              {...point(index)}
              className={cn(
                "w-20 shrink-0 border-b-2 pb-1 text-left",
                pointed === index ? "border-foreground" : "border-transparent",
              )}
            >
              <CarThumb listing={listing} model={modelName(listing)} shown={shown(index)} />
            </button>
          ))}
        </div>
      </div>
      {listings.map((listing, index) => (
        <button
          key={listing.listingId}
          type="button"
          tabIndex={-1}
          onClick={() => jump(index)}
          {...point(index)}
          className="pointer-events-auto flex max-w-7 min-w-0 flex-1 items-end pr-1 pb-4"
        >
          <span
            className={cn(
              "h-1 w-full rounded-full bg-foreground/55",
              shown(index) && "bg-foreground",
              // The pointed tick grows, keeping its on/off fill; only where a fine pointer points.
              pointed === index && "pointer-fine:h-2",
            )}
          />
        </button>
      ))}
    </div>
  );
}

// A car in the lane's photo index: photo (or the no-photo mark), price and model. The cars
// on screen are outlined in ink, as their ticks are filled.
// The sheet's tiles are larger and add year and mileage: its cars are often alike to the eye.
function CarThumb({
  listing,
  model,
  shown,
  large = false,
}: {
  listing: BoardListing;
  model: string | undefined;
  shown: boolean;
  large?: boolean;
}) {
  return (
    <span className="flex flex-col gap-1">
      <span
        className={cn(
          "flex aspect-video w-full items-center justify-center overflow-hidden rounded-sm bg-muted text-muted-foreground",
          shown && "ring-2 ring-foreground",
        )}
      >
        {listing.coverUrl ? (
          <img src={listing.coverUrl} alt="" draggable={false} className="size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1">
            <ImageOff className="size-4" aria-hidden />
            {large && <span className="text-xs">No photo</span>}
          </span>
        )}
      </span>
      <span className={cn("condensed truncate leading-none font-bold tabular-nums", large ? "text-base" : "text-xs")}>
        {formatPrice(listing.price)}
      </span>
      {model && <span className="condensed line-clamp-2 text-xs leading-tight font-semibold">{model}</span>}
      {large && (
        <span className="truncate text-xs leading-tight text-muted-foreground tabular-nums">
          {formatRegistrationYear(listing.specs.firstRegistration)} · {formatKm(listing.specs.mileageKm)}
        </span>
      )}
    </span>
  );
}

// The slab's count, in lap-board type: "3–6 /8" while the lane hides cars, "8 cars" when it
// fits. A lane that hides cars makes the count a button that lists every car in a sheet, so a
// phone (no hover strip) and the keyboard can find one and jump to it.
function LaneCount({
  tier,
  label,
  listings,
  view,
  jump,
  modelName,
}: {
  tier: Tier;
  label: string;
  listings: BoardListing[];
  view: LaneView | null;
  jump: (index: number) => void;
  modelName: (listing: BoardListing) => string | undefined;
}) {
  const [open, setOpen] = useState(false);
  // The car picked in the sheet; the lane scrolls once the sheet has closed and released the
  // page's scroll lock.
  const picked = useRef<string>(undefined);
  const total = listings.length;
  // A lane that comes to fit (a resize, a car moved away) drops its sheet; it must not reopen
  // on its own when the lane overflows again.
  if (!view && open) setOpen(false);
  if (!view) {
    return (
      <p className="tabular-nums">
        <span className="condensed text-xl leading-none font-bold">{total}</span>
        <span className="condensed leading-none font-bold opacity-75 dark:opacity-100"> {total === 1 ? "car" : "cars"}</span>
      </p>
    );
  }
  const range = `${view.first + 1}${view.last > view.first ? `–${view.last + 1}` : ""}`;
  const onScreen = view.last > view.first ? `Cars ${view.first + 1} to ${view.last + 1}` : `Car ${view.first + 1}`;
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(isOpen) => {
        // By car, not position: the lane can change while the sheet closes.
        const index = listings.findIndex((listing) => listing.listingId === picked.current);
        picked.current = undefined;
        if (!isOpen && index !== -1) jump(index);
      }}
    >
      {/* A hairline plate with a grid mark says the count opens a list; its numerals sit on the
          letter's edge and keep the lap board's size, and the hit area reaches past it to 44px+. */}
      <SheetTrigger
        className="relative -ml-1.75 inline-flex items-baseline gap-1 rounded-sm border border-current/60 px-1.5 py-0.5 tabular-nums outline-none after:absolute after:-inset-x-2 after:-inset-y-3 hover:bg-current/10 focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={`${onScreen} of ${total} on screen. Show all ${total} cars in ${label}`}
      >
        <span className="condensed text-xl leading-none font-bold">{range}</span>
        <span className="condensed leading-none font-bold opacity-75 dark:opacity-100">/{total}</span>
        <LayoutGrid className="size-3.5 self-center opacity-75 dark:opacity-100" aria-hidden />
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80dvh]">
        {/* Headed by the tier's slab with the same lap board, so the list reads as this lane. */}
        <SheetHeader className="pb-0 sm:px-8">
          <div className="flex items-center gap-3">
            <SheetTitle className="leading-none">
              <span className="sr-only">{label} tier</span>
              <span aria-hidden>
                <TierSlab tier={tier} className={cn("h-10 min-w-10 px-2", label.length === 1 ? "text-3xl" : "text-xl")} />
              </span>
            </SheetTitle>
            <p aria-hidden className="tabular-nums">
              <span className="condensed text-2xl leading-none font-bold">{range}</span>
              <span className="condensed text-base leading-none font-bold text-muted-foreground"> /{total}</span>
            </p>
          </div>
          <SheetDescription>
            <span className="sr-only">
              {onScreen} of {total} on screen.{" "}
            </span>
            {/* The outline is visual; screen readers have the sentence above instead. */}
            <span aria-hidden>Outlined cars are on screen. </span>Pick one to jump to it.
          </SheetDescription>
        </SheetHeader>
        <ul className="grid grid-cols-3 gap-3 overflow-y-auto px-4 pt-1 pb-6 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] sm:px-8">
          {listings.map((listing, index) => (
            <li key={listing.listingId}>
              <button
                type="button"
                className="w-full rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                onClick={() => {
                  picked.current = listing.listingId;
                  setOpen(false);
                }}
              >
                <span className="sr-only">
                  {index + 1}. {listing.title}, {formatPrice(listing.price)}
                </span>
                <span aria-hidden>
                  <CarThumb
                    listing={listing}
                    model={modelName(listing)}
                    shown={index >= view.first && index <= view.last}
                    large
                  />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

// Brings a lane's car into view, clear of the fades (the lane's scroll padding).
function jumpTo(lane: HTMLElement | null, index: number) {
  lane?.children[index]?.scrollIntoView({ behavior: scrollBehavior(), block: "nearest", inline: "nearest" });
}

// What a lane that hides cars shows: whether cars are hidden at each end, and the first and
// last car on screen (at least half clear of the fades, or else the most visible one). Null
// when every car fits.
type LaneView = { start: boolean; end: boolean; first: number; last: number };

// Measures the lane on scroll and resize, and sizes its cards. Re-renders only when the view
// changes, not on every scroll event. `cars` re-measures when cars come or go: the lane's
// own box keeps its size.
function useLaneScroll(cars: number) {
  const frame = useRef<HTMLDivElement>(null);
  const lane = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<LaneView | null>(null);
  useLayoutEffect(() => {
    const frameEl = frame.current;
    const laneEl = lane.current;
    if (!frameEl || !laneEl) return;
    const update = () => {
      const next = measureLane(laneEl);
      setView((current) =>
        current && next && (Object.keys(next) as (keyof LaneView)[]).every((key) => current[key] === next[key])
          ? current
          : next,
      );
    };
    const fit = () => {
      frameEl.style.setProperty("--board-card", `${cardWidth(laneEl)}px`);
      update();
    };
    // Once now, so the first paint already shows the count, fades and ticks.
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(laneEl);
    laneEl.addEventListener("scroll", update, { passive: true });
    return () => {
      laneEl.removeEventListener("scroll", update);
      resize.disconnect();
    };
  }, [cars]);
  return { frame, lane, view };
}

function measureLane(lane: HTMLElement): LaneView | null {
  const hidden = lane.scrollWidth - lane.clientWidth;
  if (hidden <= 1) return null;
  const start = lane.scrollLeft > 1;
  const end = lane.scrollLeft < hidden - 1;
  // The scroll padding is the fade's width.
  const box = lane.getBoundingClientRect();
  const { scrollPaddingLeft, scrollPaddingRight } = getComputedStyle(lane);
  const from = box.left + (start ? parseFloat(scrollPaddingLeft) : 0);
  const to = box.right - (end ? parseFloat(scrollPaddingRight) : 0);
  const clear = [...lane.children].map((card) => {
    const { left, right, width } = card.getBoundingClientRect();
    return Math.max(0, Math.min(right, to) - Math.max(left, from)) / width;
  });
  const shown = clear.flatMap((part, index) => (part >= 0.5 ? [index] : []));
  if (shown.length === 0) shown.push(clear.indexOf(Math.max(...clear)));
  return { start, end, first: shown[0], last: shown[shown.length - 1] };
}

// A card cut near its end passes for a whole one, so the lane's last card on screen shows
// about 40% of itself. Of the widths that do that within the card range, the widest one
// no wider than usual wins, since more cars on screen beats bigger photos; a lane too narrow
// for any keeps the usual width. The range and the usual width match --board-card in
// styles.css.
function cardWidth(lane: HTMLElement) {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const [min, max] = [16 * rem, 22.5 * rem];
  const usual = Math.min(max, Math.max(min, 0.22 * window.innerWidth));
  const { columnGap, paddingLeft } = getComputedStyle(lane);
  const gap = parseFloat(columnGap);
  const room = lane.clientWidth - parseFloat(paddingLeft);
  // More whole cards make each one narrower, so the first width at or under usual is the widest.
  for (let whole = 1; ; whole++) {
    const width = (room - whole * gap) / (whole + 0.4);
    if (width < min) return usual;
    if (width <= usual) return width;
  }
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
}

// Brings the next cars into view: the card cut off at that end moves to the other end, so
// the user keeps one card of context.
function pageLane(lane: HTMLElement, direction: "back" | "forward") {
  const view = lane.getBoundingClientRect();
  const { scrollPaddingLeft, scrollPaddingRight } = getComputedStyle(lane);
  const start = view.left + parseFloat(scrollPaddingLeft);
  const end = view.right - parseFloat(scrollPaddingRight);
  const cards = [...lane.children];
  const target =
    direction === "forward"
      ? cards.find((card) => card.getBoundingClientRect().right > end + 1)
      : cards.findLast((card) => card.getBoundingClientRect().left < start - 1);
  target?.scrollIntoView({
    behavior: scrollBehavior(),
    block: "nearest",
    inline: direction === "forward" ? "start" : "end",
  });
}

// Shown while the mouse is over a lane that hides cars at that end. An opaque fill and an
// ink border keep it visible on pale photos under the fade. Tabbing through the
// cards already scrolls the lane, so the arrows are for the mouse only; touch screens swipe.
function LaneArrow({ direction, onClick }: { direction: "back" | "forward"; onClick: () => void }) {
  const Icon = direction === "back" ? ChevronLeft : ChevronRight;
  return (
    <Button
      variant="outline"
      size="icon-lg"
      tabIndex={-1}
      aria-hidden
      onClick={onClick}
      className={cn(
        // Centred on the photos (16:9, below the lane's padding), clear of prices and titles.
        // A negative margin centres it, not a translate: the button's pressed state sets the
        // translate, and the jump would move the release off the button and lose the click.
        "invisible absolute top-[calc(0.75rem+var(--board-card)*9/32)] -mt-5 size-10 border-foreground/30 bg-card shadow-sm opacity-0 dark:border-foreground/30 dark:bg-card transition-opacity group-hover/lane:opacity-100 pointer-coarse:hidden",
        direction === "back" ? "left-2 group-data-more-start/lane:visible" : "right-2 group-data-more-end/lane:visible",
      )}
    >
      <Icon aria-hidden />
    </Button>
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
