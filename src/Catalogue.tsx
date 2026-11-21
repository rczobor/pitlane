import { DndContext, DragOverlay, useDroppable } from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type MouseEvent, useEffect, useState } from "react";
import { CardMenu } from "./BoardActions";
import { type BoardListing, type Tier, tiers } from "./format";
import { type CardVariant, ListingCard } from "./ListingCard";
import { scrollBehavior } from "./Strip";
import { sectionSlabColor } from "./TierSlab";
import { indexTarget, keyStep, sectionsOf, type TierViewProps, useTierDrag } from "./useTierDrag";
import { cn } from "@/lib/utils";

const sectionId = (tier: Tier) => `tier-${tier}`;

// Card size signals rank: the cars get denser further down the catalogue.
function variantFor(tier: Tier, count: number): CardVariant {
  if (tier === "S") return count === 1 ? "feature" : "lot";
  if (tier === "watching") return "compact";
  if (tier === "rejected") return "index";
  return "lot";
}

// Each lot spans two rows of its grid (see ListingCard's subgrid) and pads its own foot, as a
// row gap would also fall between a lot's two rows; the grid takes back the last row's.
const grids: Record<CardVariant, string> = {
  feature: "",
  lot: "grid gap-x-6 not-empty:-mb-6 sm:grid-cols-2 lg:grid-cols-3",
  compact: "grid grid-cols-2 gap-x-4 not-empty:-mb-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
  index: "border-t",
};
const lotFoot: Partial<Record<CardVariant, string>> = { lot: "pb-6", compact: "pb-4" };

/**
 * The board from 640px up: one catalogue read top to bottom, a section per tier with every
 * car on screen, and a sticky index that jumps to a tier and takes drops while dragging.
 */
export function Catalogue(view: TierViewProps) {
  const drag = useTierDrag({ ...view, axis: "x" });
  const sections = sectionsOf(drag.lanes, view.byId, tiers);
  const total = sections.reduce((sum, s) => sum + s.listings.length, 0);
  const current = useCurrentSection();
  const { active } = drag;
  return (
    <DndContext {...drag.dndProps}>
      <nav
        aria-label="Tiers"
        className="sticky top-0 z-20 -mx-4 flex h-12 items-stretch overflow-x-auto border-b-2 border-foreground bg-background px-4 [scrollbar-width:none] sm:-mx-8 sm:px-8"
      >
        <span className="mr-3 self-center text-[0.6875rem] font-bold tracking-[0.08em] text-muted-foreground uppercase">Index</span>
        {sections.map(({ tier, label, listings }) => (
          <IndexTab
            key={tier}
            tier={tier}
            label={label}
            count={listings.length}
            current={!active && current === tier}
            dragging={active !== undefined}
            over={drag.overIndex === tier}
          />
        ))}
        <p className="ml-auto shrink-0 self-center pl-4 text-[0.8125rem] whitespace-nowrap text-muted-foreground">
          {active ? (
            <span className="font-semibold text-foreground">Drop on a tier to move it there</span>
          ) : (
            <>
              <b className="font-semibold text-foreground tabular-nums">{total}</b> {total === 1 ? "car" : "cars"}, best first
            </>
          )}
        </p>
      </nav>
      {sections.map((section, index) => (
        <CatalogueSection
          key={section.tier}
          {...section}
          first={index === 0}
          variant={variantFor(section.tier, section.listings.length)}
          dragging={active !== undefined}
          target={drag.targetTier === section.tier}
          view={view}
        />
      ))}
      <DragOverlay>
        {active && (
          <ListingCard
            listing={active}
            lot={view.lots.get(active.listingId)}
            variant={variantFor(active.tier, view.lanes[active.tier].length)}
            {...view.cardProps(active)}
            lifted
            className="w-full"
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}

function IndexTab({
  tier,
  label,
  count,
  current,
  dragging,
  over,
}: {
  tier: Tier;
  label: string;
  count: number;
  current: boolean;
  dragging: boolean;
  over: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: indexTarget(tier) });
  const jump = (event: MouseEvent) => {
    event.preventDefault();
    document.getElementById(sectionId(tier))?.scrollIntoView({ behavior: scrollBehavior() });
  };
  return (
    <a
      ref={setNodeRef}
      href={`#${sectionId(tier)}`}
      onClick={jump}
      aria-current={current ? "location" : undefined}
      className={cn(
        "condensed flex shrink-0 items-center gap-1.25 px-3 text-[1.1875rem] font-extrabold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        count === 0 && "text-muted-foreground",
        current && "shadow-[inset_0_-4px_0_var(--color-foreground)]",
        // While dragging, every tab is a drop target; the one under the car fills with ink.
        dragging && "rounded-[10px] outline-1 -outline-offset-[7px] outline-foreground/55",
        over && "bg-foreground text-background outline-foreground",
      )}
    >
      {label}
      <span className={cn("text-sm font-medium [font-stretch:85%]", over ? "opacity-75" : "text-muted-foreground")}>
        <span className="sr-only">, </span>
        {count}
        <span className="sr-only">{count === 1 ? " car" : " cars"}</span>
      </span>
    </a>
  );
}

// The section whose top has passed under the sticky index: the one being read.
function useCurrentSection() {
  const [current, setCurrent] = useState<Tier>("S");
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        let reading: Tier = "S";
        for (const { tier } of tiers) {
          const top = document.getElementById(sectionId(tier))?.getBoundingClientRect().top;
          if (top !== undefined && top <= 64) reading = tier;
        }
        setCurrent(reading);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return current;
}

function CatalogueSection({
  tier,
  label,
  listings,
  first,
  variant,
  dragging,
  target,
  view,
}: {
  tier: Tier;
  label: string;
  listings: BoardListing[];
  first: boolean;
  variant: CardVariant;
  dragging: boolean;
  /** The dragged car would land in this section. */
  target: boolean;
  view: TierViewProps;
}) {
  const { setNodeRef } = useDroppable({ id: tier });
  const empty = listings.length === 0;
  const isLetter = label.length === 1;
  return (
    <section
      ref={setNodeRef}
      id={sectionId(tier)}
      aria-label={`${label} tier`}
      className={cn(
        "-mx-4 scroll-mt-12 px-4 pt-7 pb-9 sm:-mx-8 sm:px-8 lg:grid lg:grid-cols-[7rem_minmax(0,1fr)] lg:items-start lg:gap-6",
        !first && "border-t",
        empty && "lg:py-4",
      )}
    >
      {/* The pit board: a thumb-index tab that stays in view while its section scrolls. Its
          count is pinned to its foot in every state. */}
      <div
        className={cn(
          "mb-4 flex h-14 items-center justify-between rounded-md px-3.5 lg:sticky lg:top-15 lg:mb-0 lg:h-37 lg:flex-col lg:items-start lg:px-3 lg:pt-3 lg:pb-2.5",
          sectionSlabColor(tier),
          empty && "lg:static lg:h-19 lg:py-2",
        )}
      >
        {/* Phones and tablets share one label size, so the bars match; letters grow on wide screens. */}
        <h2
          className={cn(
            "condensed text-[2.125rem] leading-none font-extrabold",
            isLetter ? (empty ? "lg:text-[2.875rem] lg:leading-[0.8]" : "lg:mt-1 lg:text-[6.5rem] lg:leading-[0.78]") : "lg:text-[1.6875rem]",
          )}
        >
          {label}
        </h2>
        <p className="text-[0.8125rem] font-medium">
          <b className="condensed text-[1.4375rem] leading-none font-bold">{listings.length}</b> {listings.length === 1 ? "car" : "cars"}
        </p>
      </div>
      <div
        className={cn(
          "min-w-0 rounded-md transition-colors",
          // The section a dragged car would land in tints and takes an ink outline.
          target && "bg-foreground/9 outline-2 outline-offset-8 outline-foreground",
        )}
      >
        <SortableContext items={listings.map((l) => l.listingId)} strategy={rectSortingStrategy}>
          <div className={cn(grids[variant], empty && "border-t-0")}>
            {listings.map((listing) => (
              <SortableLot key={listing.listingId} listing={listing} variant={variant} view={view} />
            ))}
          </div>
        </SortableContext>
        {empty && (
          <p className="pt-1.5 text-[0.9375rem] text-muted-foreground">
            {dragging ? "Drop here" : tier === "watching" ? "No cars. New cars land here." : "No cars"}
          </p>
        )}
      </div>
    </section>
  );
}

// A lot: drag it anywhere (the photo is the handle), or focus it and press Alt with an arrow:
// up and down change its tier, left and right its place in the section.
function SortableLot({ listing, variant, view }: { listing: BoardListing; variant: CardVariant; view: TierViewProps }) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: listing.listingId });
  const subgrid = variant === "lot" || variant === "compact";
  return (
    // Alt+arrow keys arrive here from the focused lot link.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // The long press that lifts a car on touch would otherwise open iOS's link preview or
      // select the card's text, and either cancels the drag.
      className={cn(
        "group/card relative select-none [-webkit-touch-callout:none]",
        variant === "index" && "border-b",
        subgrid && cn("row-span-2 grid grid-rows-subgrid bg-clip-content", lotFoot[variant]),
        // The lot's old place: a flat tinted slot, never dashed (dashed means "from the listing").
        isDragging && "rounded-sm bg-foreground/8 *:invisible",
      )}
      {...listeners}
      onKeyDown={(event) => {
        const step = keyStep(event, {
          ArrowUp: { by: "tier", delta: -1 },
          ArrowDown: { by: "tier", delta: 1 },
          ArrowLeft: { by: "place", delta: -1 },
          ArrowRight: { by: "place", delta: 1 },
        });
        if (step) view.onStep(listing.listingId, step);
      }}
    >
      <ListingCard
        listing={listing}
        lot={view.lots.get(listing.listingId)}
        variant={variant}
        {...view.cardProps(listing)}
        subgrid={subgrid}
        className={cn("w-full", variant === "index" && "pr-11")}
      />
      <CardMenu
        listing={listing}
        canMarkRemoved={view.canMarkRemoved}
        onAction={(action) => view.onAction(listing, action)}
        className={cn("absolute", variant === "index" ? "top-1/2 right-0 -translate-y-1/2" : "top-2 right-2")}
      />
    </div>
  );
}
