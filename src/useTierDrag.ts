import {
  closestCenter,
  type CollisionDetection,
  type DndContextProps,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { isTier, type Lanes, laneOf, placeCar, rankIn, type Step } from "./boardOrder";
import type { BoardListing, Tier } from "./format";
import type { CarAction } from "./BoardActions";
import type { CardProps } from "./ListingCard";
import { grabbing } from "./Strip";

/** What the catalogue and the tower need from the board to show and move its cars. */
export type TierViewProps = {
  /** Car ids per tier, in board order, for the cars this view shows. */
  lanes: Lanes;
  byId: Map<string, BoardListing>;
  cardProps: (listing: BoardListing) => CardProps;
  lots: Map<string, number>;
  canMarkRemoved: boolean;
  onAction: (listing: BoardListing, action: CarAction) => void;
  /** Saves a drag: the car's new tier and rank. */
  onMove: (listingId: string, tier: Tier, rank: number) => void;
  /** Applies one keyboard step to a car; see stepCar. */
  onStep: (listingId: string, step: Step) => void;
};

/** The sections of a view, with each tier's cars in order. */
export const sectionsOf = (lanes: Lanes, byId: Map<string, BoardListing>, tiers: { tier: Tier; label: string }[]) =>
  tiers.map(({ tier, label }) => ({ tier, label, listings: lanes[tier].flatMap((id) => byId.get(id) ?? []) }));

// The catalogue's sticky index doubles as a drop target for every tier, so a car can reach
// Rejected without scrolling a tall page with it.
export const indexTarget = (tier: Tier) => `index:${tier}`;
const indexTier = (id: unknown) => {
  const tier = typeof id === "string" && id.startsWith("index:") ? id.slice(6) : undefined;
  return isTier(tier) ? tier : undefined;
};

// dnd-kit's MouseSensor only ignores the right button, so the middle button would drag a car.
class LeftMouseSensor extends MouseSensor {
  static activators: typeof MouseSensor.activators = MouseSensor.activators.map((activator) => ({
    ...activator,
    handler: (event, options) => event.nativeEvent.button === 0 && activator.handler(event, options),
  }));
}

/**
 * Dragging cars between tiers. While a car is dragged it moves between the lanes it is
 * dragged over, so the section it is heading for makes room for it as its own cars would.
 * `axis` is the direction cars run in a tier: "x" for the catalogue's grids (reading order),
 * "y" for the tower's rows.
 */
export function useTierDrag({ lanes: boardLanes, byId, onMove, axis }: Pick<TierViewProps, "lanes" | "byId" | "onMove"> & { axis: "x" | "y" }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragLanes, setDragLanes] = useState<Lanes | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const lastOver = useRef<string | null>(null);
  // Moving the car to another section reflows the board; until that settles, the old
  // measurements could bounce it straight back.
  const justMoved = useRef(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      justMoved.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [dragLanes]);
  // A short travel threshold keeps a plain click opening the car; on touch a long press
  // starts the drag so swiping still scrolls.
  const sensors = useSensors(
    useSensor(LeftMouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  // Leaving the board mid-drag must not leave the grabbing hand behind.
  useEffect(() => () => grabbing(false), []);

  // The index under the pointer wins; then the section under the pointer decides the tier,
  // so an empty section takes a car anywhere along it, slab included. Within a section the
  // nearest car decides the spot.
  const collisionDetection: CollisionDetection = (args) => {
    if (justMoved.current && lastOver.current) return [{ id: lastOver.current }];
    const index = pointerWithin({ ...args, droppableContainers: args.droppableContainers.filter((c) => indexTier(c.id)) })[0]?.id;
    if (index !== undefined) {
      lastOver.current = String(index);
      return [{ id: index }];
    }
    const lane = pointerWithin({ ...args, droppableContainers: args.droppableContainers.filter((c) => isTier(c.id)) })[0]?.id;
    // Between two sections the car stays where it was heading.
    if (!isTier(lane) || !dragLanes) return lastOver.current ? [{ id: lastOver.current }] : [];
    const cars = args.droppableContainers.filter((c) => dragLanes[lane].includes(String(c.id)));
    const hit = cars.length > 0 ? closestCenter({ ...args, droppableContainers: cars })[0]?.id : lane;
    lastOver.current = String(hit ?? lane);
    return [{ id: lastOver.current }];
  };

  function onDragStart({ active, activatorEvent }: DragStartEvent) {
    grabbing(true);
    // A tick tells a long press it has lifted the car. Safari has no vibrate.
    if ("touches" in activatorEvent && "vibrate" in navigator) navigator.vibrate(10);
    setActiveId(String(active.id));
    setDragLanes(boardLanes);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    setOverId(over ? String(over.id) : null);
    if (!over) return;
    const id = String(active.id);
    const overKey = String(over.id);
    setDragLanes((current) => {
      if (!current) return current;
      const from = laneOf(current, id);
      const onIndex = indexTier(overKey);
      const to = onIndex ?? (isTier(overKey) ? overKey : laneOf(current, overKey));
      if (!from || !to || from === to) return current;
      // In front of the car it is over, or behind it once past that car's middle.
      const target = current[to];
      const overIndex = target.indexOf(overKey);
      const dragged = active.rect.current.translated;
      const behind =
        dragged !== null &&
        (axis === "x"
          ? dragged.left + dragged.width / 2 > over.rect.left + over.rect.width / 2
          : dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2);
      const index = overIndex === -1 ? target.length : overIndex + (behind ? 1 : 0);
      justMoved.current = true;
      return placeCar(current, id, to, index);
    });
  }

  function endDrag() {
    grabbing(false);
    setActiveId(null);
    setDragLanes(null);
    setOverId(null);
    lastOver.current = null;
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const finalLanes = dragLanes;
    endDrag();
    const id = String(active.id);
    const dragged = byId.get(id);
    const tier = finalLanes && laneOf(finalLanes, id);
    if (!dragged || !over || !finalLanes || !tier) return;
    const ids = finalLanes[tier];
    const overIndex = ids.indexOf(String(over.id));
    const lanes = overIndex === -1 ? finalLanes : { ...finalLanes, [tier]: arrayMove(ids, ids.indexOf(id), overIndex) };
    // Dropped back where it started: nothing to save.
    if (tier === dragged.tier && lanes[tier].join() === boardLanes[tier].join()) return;
    const placed = rankIn(lanes, id, (other) => byId.get(other)?.rank);
    if (placed) onMove(id, placed.tier, placed.rank);
  }

  const dndProps: DndContextProps = {
    sensors,
    collisionDetection,
    // Cars move between sections mid-drag, so sections and cars are measured as they reflow.
    measuring: { droppable: { strategy: MeasuringStrategy.Always } },
    onDragStart,
    onDragOver,
    onDragCancel: endDrag,
    onDragEnd,
  };
  const lanes = dragLanes ?? boardLanes;
  return {
    dndProps,
    lanes,
    active: activeId ? byId.get(activeId) : undefined,
    /** The tier the dragged car would land in. */
    targetTier: activeId ? laneOf(lanes, activeId) : undefined,
    /** The index tab under the pointer. */
    overIndex: indexTier(overId),
  };
}

/** Keyboard moves on a focused car: Alt plus an arrow key (see each view for the mapping). */
export function keyStep(
  event: KeyboardEvent,
  map: Partial<Record<string, Step>>,
): Step | undefined {
  if (!event.altKey || event.ctrlKey || event.metaKey) return undefined;
  const step = map[event.key];
  if (step) event.preventDefault();
  return step;
}
