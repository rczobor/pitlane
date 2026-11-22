import { DndContext, DragOverlay, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "@tanstack/react-router";
import { ImageOff } from "lucide-react";
import type { HTMLAttributes, Ref } from "react";
import { evaluate } from "../shared/fit";
import { CardMenu } from "./BoardActions";
import { type BoardListing, formatKm, formatPrice, type KeySpecDef, type Tier, tiers } from "./format";
import { InkMark, SpecMarks } from "./KeySpecLedger";
import { carPhotoTransition, openCar, priceChange, RemovedBand, useOpenedCar } from "./ListingCard";
import { PriceChange } from "./PriceChange";
import { sectionSlabColor } from "./TierSlab";
import { keyStep, sectionsOf, type TierViewProps, useTierDrag } from "./useTierDrag";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The board under 640px: one card per car in rank order, each a full-width photo with the
 * price, mileage and key specs under it (owner's call, 2026-11-22: the photo decides at a
 * glance; the car page has the rest).
 */
export function Tower({
  view,
  specDefs,
}: {
  view: TierViewProps;
  /** The board's key specs, in priority order. */
  specDefs: KeySpecDef[];
}) {
  const drag = useTierDrag({ ...view, axis: "y" });
  const sections = sectionsOf(drag.lanes, view.byId, tiers);
  const { active } = drag;
  const rowProps = { view, specDefs };
  return (
    <DndContext {...drag.dndProps}>
      <div data-scroll-restoration-id="tower">
        {sections.map((section) => (
          <TowerSector
            key={section.tier}
            {...section}
            dragging={active !== undefined}
            target={drag.targetTier === section.tier}
            rowProps={rowProps}
          />
        ))}
      </div>
      <DragOverlay>{active && <TowerCard listing={active} lifted {...rowProps} />}</DragOverlay>
    </DndContext>
  );
}

function TowerSector({
  tier,
  label,
  listings,
  dragging,
  target,
  rowProps,
}: {
  tier: Tier;
  label: string;
  listings: BoardListing[];
  dragging: boolean;
  target: boolean;
  rowProps: RowProps;
}) {
  const { setNodeRef } = useDroppable({ id: tier });
  const count = listings.length;
  return (
    <section ref={setNodeRef} aria-label={`${label} tier`} className="mt-4 first:mt-2.5">
      {/* Every tier label shares one size on phones, so the bars match. */}
      <div className={cn("flex h-11 items-center justify-between rounded-md px-3", sectionSlabColor(tier))}>
        <h2 className="condensed text-[1.875rem] leading-none font-extrabold">{label}</h2>
        <p className="text-[0.78125rem] font-semibold">
          <b className="condensed text-[1.0625rem] font-extrabold">{count}</b> {count === 1 ? "car" : "cars"}
        </p>
      </div>
      <div
        className={cn(
          "mt-2 flex flex-col gap-3 rounded-md transition-colors",
          // The sector a dragged car would land in tints.
          target && "bg-foreground/9",
        )}
      >
        <SortableContext items={listings.map((l) => l.listingId)} strategy={verticalListSortingStrategy}>
          {listings.map((listing) => (
            <SortableCard key={listing.listingId} listing={listing} {...rowProps} />
          ))}
        </SortableContext>
        {count === 0 && (
          <p className="flex min-h-13 items-center rounded-md bg-card px-3 font-semibold">
            {dragging ? "Drop here" : tier === "watching" ? "No cars. New cars land here." : "No cars"}
          </p>
        )}
      </div>
    </section>
  );
}

type RowProps = { view: TierViewProps; specDefs: KeySpecDef[] };

// A long press lifts the card to drag it up or down the board; Alt+↑/↓ moves the focused car
// one place, into the next tier at a sector's edge.
function SortableCard({ listing, ...props }: RowProps & { listing: BoardListing }) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: listing.listingId });
  return (
    <TowerCard
      listing={listing}
      {...props}
      cardRef={setNodeRef}
      placeholder={isDragging}
      cardProps={{
        style: { transform: CSS.Translate.toString(transform), transition },
        ...listeners,
        onKeyDown: (event) => {
          const step = keyStep(event, { ArrowUp: { by: "place", delta: -1, cross: true }, ArrowDown: { by: "place", delta: 1, cross: true } });
          if (step) props.view.onStep(listing.listingId, step);
        },
      }}
    />
  );
}

function TowerCard({
  listing,
  view,
  specDefs,
  lifted = false,
  placeholder = false,
  cardRef,
  cardProps,
}: RowProps & {
  listing: BoardListing;
  lifted?: boolean;
  /** The card's old place while it is dragged: a flat tint. */
  placeholder?: boolean;
  cardRef?: Ref<HTMLDivElement>;
  cardProps?: HTMLAttributes<HTMLDivElement>;
}) {
  const { specs } = listing;
  const { criteria, modelName, toConfirm } = view.cardProps(listing);
  const { checks } = evaluate(
    { price: listing.price, firstRegistration: specs.firstRegistration, mileageKm: specs.mileageKm },
    criteria,
    specDefs,
    listing.keySpecs,
    listing.modelId,
  );
  const overMileage = checks.some((c) => c.kind === "mileage" && c.status === "missed");
  return (
    <div
      ref={cardRef}
      {...cardProps}
      className={cn(
        "group/card relative overflow-hidden rounded-md bg-card select-none [-webkit-touch-callout:none]",
        // A removed ad sits on the concrete.
        listing.status === "removed" && "bg-background ring-1 ring-border ring-inset",
        lifted && "-rotate-[0.6deg] shadow-[0_14px_30px_-8px_rgb(0_0_0/0.35),0_0_0_1px_var(--color-input)]",
        placeholder && "bg-foreground/8 *:invisible",
      )}
    >
      <Link
        to="/listings/$listingId"
        params={{ listingId: listing.listingId }}
        draggable={false}
        onClick={() => openCar(listing.listingId)}
        data-car={listing.listingId}
        className="block rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <Photo listing={listing} />
        <span className="flex flex-col gap-2 px-3 pt-2.5 pb-3">
          <span className="flex items-center gap-2">
            {/* The car's lot number, as the catalogue shows it. */}
            <span className="condensed text-base font-bold text-muted-foreground tabular-nums">
              {view.lots.get(listing.listingId)}
              <span className="sr-only">.</span>
            </span>
            <span className="condensed text-[1.625rem] leading-none font-extrabold tabular-nums">{formatPrice(listing.price)}</span>
            <PriceNote listing={listing} />
            <span className="condensed ml-auto text-[1.0625rem] font-bold whitespace-nowrap tabular-nums">
              {formatKm(specs.mileageKm)}
              {overMileage && <InkMark mark="mileage" className="ml-1 align-[2px]" />}
            </span>
          </span>
          <SpecMarks specs={listing.keySpecs} defs={specDefs} modelId={listing.modelId} />
          {toConfirm !== undefined && <span className="text-xs leading-tight font-semibold">{toConfirm} to confirm</span>}
          {/* The title and model name the car for screen readers and find-in-page; the card shows the photo. */}
          <span className="sr-only">
            {modelName && `${modelName}: `}
            {listing.title}
          </span>
        </span>
      </Link>
      {!lifted && (
        <CardMenu
          listing={listing}
          canMarkRemoved={view.canMarkRemoved}
          onAction={(action) => view.onAction(listing, action)}
          className="absolute top-2 right-2"
        />
      )}
    </div>
  );
}

// Beside the price: an ink flag where the price moved (colour only marks change), the VAT
// badge, or "Last price" on a removed ad.
function PriceNote({ listing }: { listing: BoardListing }) {
  if (listing.status === "removed") return <span className="text-xs font-semibold text-muted-foreground">Last price</span>;
  const change = priceChange(listing);
  if (change !== 0) {
    return (
      <span>
        <PriceChange change={change} price={listing.firstPrice} amountClassName="sr-only" className="gap-0.5 px-1" />
        <span className="sr-only"> since first seen</span>
      </span>
    );
  }
  return listing.price.vatDeductible ? (
    <Badge variant="outline" className="h-4.5 rounded-sm px-1 text-[0.625rem]">
      VAT<span className="sr-only"> reclaimable</span>
    </Badge>
  ) : null;
}

function Photo({ listing }: { listing: BoardListing }) {
  const removed = listing.status === "removed";
  const opened = useOpenedCar(listing.listingId);
  return (
    <span className="relative flex aspect-[3/2] w-full items-center justify-center overflow-hidden bg-muted text-muted-foreground">
      {listing.coverUrl ? (
        <img
          src={listing.coverUrl}
          alt=""
          draggable={false}
          loading="lazy"
          style={opened ? carPhotoTransition : undefined}
          className={cn("size-full object-cover", removed && "grayscale")}
        />
      ) : (
        // The card shows no model, so the panel names the car (screen readers hear the title once, below).
        <span className="flex flex-col items-center gap-1.5 px-8 text-center text-[0.8125rem] font-medium">
          <ImageOff className="size-5.5" aria-hidden />
          <span aria-hidden className="line-clamp-2 text-sm font-semibold text-foreground">
            {listing.title}
          </span>
          No photo saved
        </span>
      )}
      {removed && (
        <span className="absolute inset-x-0 bottom-0">
          <RemovedBand removedAt={listing.removedAt} />
        </span>
      )}
    </span>
  );
}
