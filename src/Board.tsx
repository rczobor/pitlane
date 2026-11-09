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
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { type BoardListing, type Tier, tiers } from "./format";
import { ListingCard } from "./ListingCard";
import { useBoardToken } from "./token";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function Board() {
  const token = useBoardToken();
  const board = useQuery(api.board.get, { token });
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
  const lanes = tiers.map(({ tier, label }) => ({
    tier,
    label,
    listings: board.listings.filter((l) => l.tier === tier).sort((a, b) => a.rank - b.rank),
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
      {board.listings.length === 0 && (
        <Alert className="mb-6 max-w-prose">
          <AlertDescription>
            No cars yet. Ask Claude to open a listing and save it to Pitlane; it lands in Watching.
          </AlertDescription>
        </Alert>
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
            <Lane key={lane.tier} {...lane} />
          ))}
        </div>
        <DragOverlay>{active && <ListingCard listing={active} lifted />}</DragOverlay>
      </DndContext>
    </main>
  );
}

function Lane({ tier, label, listings }: { tier: Tier; label: string; listings: BoardListing[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: tier });
  const isLetter = label.length === 1;
  return (
    <section
      aria-label={`${label} tier`}
      className={cn("flex flex-col sm:flex-row", tier === "rejected" && "opacity-70 hover:opacity-100")}
    >
      {/* The pit board: the one loud element on the page. */}
      <div
        className={cn(
          "flex shrink-0 items-baseline justify-between gap-3 rounded-t-lg px-4 py-2 sm:w-40 sm:flex-col sm:items-start sm:justify-start sm:rounded-l-lg sm:rounded-tr-none sm:py-4",
          tier === "S" ? "bg-signal text-signal-foreground" : "bg-slab text-slab-foreground",
        )}
      >
        <h2 className={`condensed leading-none font-extrabold ${isLetter ? "text-6xl sm:text-8xl" : "text-3xl sm:text-4xl"}`}>
          {label}
        </h2>
        <p className="text-sm opacity-75">{listings.length === 1 ? "1 car" : `${listings.length} cars`}</p>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-20 flex-1 gap-3 overflow-x-auto rounded-b-lg border p-3 transition-colors sm:min-h-40 sm:rounded-r-lg sm:rounded-bl-none sm:border-l-0",
          isOver && "bg-card",
        )}
      >
        <SortableContext items={listings.map((l) => l.listingId)}>
          {listings.map((listing) => (
            <SortableCard key={listing.listingId} listing={listing} />
          ))}
        </SortableContext>
        {listings.length === 0 && <p className="self-center px-2 text-sm text-muted-foreground">Drag a car here</p>}
      </div>
    </section>
  );
}

function SortableCard({ listing }: { listing: BoardListing }) {
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
      <ListingCard listing={listing} />
    </div>
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
