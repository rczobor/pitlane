import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { toCheck } from "../shared/fit";
import { type BoardData, type BoardListing, type Tier, tiers } from "./format";
import { type CardProps, ListingCard } from "./ListingCard";
import { slabColor } from "./TierSlab";
import { useBoardToken } from "./token";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export function Board() {
  const token = useBoardToken();
  const board = useQuery(api.board.get, { token });
  const { model, check } = useSearch({ from: "/" });
  const move = useMoveListing();
  const [activeId, setActiveId] = useState<Id<"listings"> | null>(null);
  // A short travel threshold keeps a plain click opening the car; on touch a long press
  // starts the drag so swiping still scrolls the lane. Keyboard users move cars with the
  // tier buttons on the car's page.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
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
    return { modelName: filter ? undefined : carModel?.name, criteria: carModel, specDefs: board.keySpecs };
  };
  const lanes = tiers.map(({ tier, label }) => ({
    tier,
    label,
    listings: visible.filter((l) => l.tier === tier).sort((a, b) => a.rank - b.rank),
  }));
  const active = board.listings.find((l) => l.listingId === activeId);

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const dragged = board!.listings.find((l) => l.listingId === active.id);
    if (!dragged || !over) return;
    const overListing = board!.listings.find((l) => l.listingId === over.id);
    const tier = overListing?.tier ?? tiers.find((t) => t.tier === over.id)?.tier;
    if (!tier) return;
    const lane = lanes.find((l) => l.tier === tier)!.listings;

    let order: BoardListing[];
    if (dragged.tier === tier) {
      const to = overListing ? lane.indexOf(overListing) : lane.length - 1;
      order = arrayMove(lane, lane.indexOf(dragged), to);
    } else {
      // From another lane: land in front of the car it was dropped on, or at the end.
      order = lane.slice();
      order.splice(overListing ? lane.indexOf(overListing) : lane.length, 0, dragged);
    }
    const index = order.indexOf(dragged);
    const rank = rankBetween(order[index - 1]?.rank, order[index + 1]?.rank);
    if (dragged.tier !== tier || rank !== dragged.rank) {
      void move({ token, listingId: dragged.listingId, tier, rank });
    }
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
            you are hunting, so cards show what decides a car's tier. Then ask Claude to open a listing and
            save it to Pitlane; new cars land in Watching.
          </p>
          <p className="text-muted-foreground">
            For example:{" "}
            <span className="text-foreground">
              “Open this listing and save it to Pitlane: https://listings.example/fahrzeuge/details.html?id=…”
            </span>
          </p>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveId(board.listings.find((l) => l.listingId === active.id)?.listingId ?? null)}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={onDragEnd}
      >
        <div className="space-y-3">
          {lanes.map((lane) => (
            <Lane key={lane.tier} {...lane} cardProps={cardProps} dragging={active !== undefined} />
          ))}
        </div>
        <DragOverlay>
          {active && <ListingCard listing={active} {...cardProps(active)} lifted />}
        </DragOverlay>
      </DndContext>
    </main>
  );
}

function Lane({
  tier,
  label,
  listings,
  cardProps,
  dragging,
}: {
  tier: Tier;
  label: string;
  listings: BoardListing[];
  cardProps: (listing: BoardListing) => CardProps;
  dragging: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: tier });
  const isLetter = label.length === 1;
  return (
    <section
      aria-label={`${label} tier`}
      className="flex flex-col sm:flex-row"
    >
      {/* The pit board: the one loud element on the page. */}
      <div
        className={cn(
          "flex shrink-0 items-baseline justify-between gap-3 rounded-t-lg px-4 py-2 sm:w-40 sm:flex-col sm:items-start sm:justify-start sm:rounded-l-lg sm:rounded-tr-none sm:py-4",
          // Rejected is quieter through its fill only: label and count keep full contrast, and
          // the cars keep full ink so a live ad never looks removed.
          tier === "rejected" ? "bg-muted text-foreground" : slabColor(tier),
        )}
      >
        {/* On phones every label shares one size, so the header bars match; the letters grow on wider screens. */}
        <h2 className={cn("condensed text-4xl leading-none font-extrabold", isLetter ? "sm:text-8xl" : "sm:text-4xl")}>
          {label}
        </h2>
        {/* Pinned to the slab's foot, so it sits in the same place whatever the label. */}
        <p className="text-sm opacity-75 sm:mt-auto sm:pt-3">
          {listings.length === 1 ? "1 car" : `${listings.length} cars`}
        </p>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "relative flex min-h-20 flex-1 gap-3 overflow-x-auto rounded-b-lg p-3 transition-colors sm:min-h-44 sm:rounded-r-lg sm:rounded-bl-none",
          isOver && "bg-muted",
        )}
      >
        <SortableContext items={listings.map((l) => l.listingId)}>
          {listings.map((listing) => (
            <SortableCard key={listing.listingId} listing={listing} {...cardProps(listing)} />
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

function SortableCard({ listing, ...props }: { listing: BoardListing } & CardProps) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: listing.listingId,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? "opacity-30" : ""}
      {...listeners}
    >
      <ListingCard listing={listing} {...props} />
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

function rankBetween(before: number | undefined, after: number | undefined) {
  if (before !== undefined && after !== undefined) return (before + after) / 2;
  if (before !== undefined) return before + 1;
  if (after !== undefined) return after - 1;
  return Date.now();
}

// Moves the card locally at once; Convex replaces this with the server's answer.
function useMoveListing() {
  return useMutation(api.board.move).withOptimisticUpdate((store, { token, listingId, tier, rank }) => {
    const board = store.getQuery(api.board.get, { token });
    if (!board) return;
    store.setQuery(
      api.board.get,
      { token },
      { ...board, listings: board.listings.map((l) => (l.listingId === listingId ? { ...l, tier, rank } : l)) },
    );
  });
}
