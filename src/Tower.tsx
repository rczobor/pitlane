import { DndContext, DragOverlay, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "@tanstack/react-router";
import { ImageOff, X } from "lucide-react";
import { type CSSProperties, type HTMLAttributes, type ReactNode, type Ref, useEffect, useRef, useState } from "react";
import { evaluate } from "../shared/fit";
import { CardMenu } from "./BoardActions";
import {
  type BoardListing,
  formatDistance,
  formatKm,
  formatPower,
  formatPrice,
  formatRegistration,
  type KeySpecDef,
  type ResolvedSpec,
  type Tier,
  tiers,
} from "./format";
import { specTone, specValueText, specVerdict } from "./KeySpecLedger";
import { openCar, OutsideMark, priceChange, RemovedBand, useOpenedCar, carPhotoTransition } from "./ListingCard";
import { PendingRows } from "./PendingCaptures";
import { panWithMiddleButton } from "./Strip";
import { sectionSlabColor } from "./TierSlab";
import { keyStep, sectionsOf, type TierViewProps, useTierDrag } from "./useTierDrag";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// The frozen car column, as wide as the mock's timing tower: position, thumbnail, price, model.
const identity = 200;
// The frozen actions column at the row's end, the grid's gap, and the narrowest a scrolling
// column may get before one fewer fits on screen.
const menu = 32;
const gap = 4;
const minColumn = 52;

/**
 * The board under 640px: a timing tower. One row per car in rank order, the car column
 * frozen (price, the model when the board shows several, registration and mileage), and the
 * key-spec columns then the seller scrolling sideways together (one scroller, so the header
 * and every sector share one scroll position).
 */
export function Tower({
  view,
  specDefs,
  pending,
}: {
  view: TierViewProps;
  /** The board's key specs, in priority order: one column each. */
  specDefs: KeySpecDef[];
  /** Shared listings waiting at the top of Watching. */
  pending: boolean;
}) {
  const drag = useTierDrag({ ...view, axis: "y" });
  const sections = sectionsOf(drag.lanes, view.byId, tiers);
  const hasCars = sections.some((s) => s.listings.length > 0);
  // The key specs, then the seller.
  const [scroller, column] = useSideScroll(specDefs.length + 1);
  const cols = `${identity}px repeat(${specDefs.length + 1}, ${column}px) ${menu}px`;
  const style = { "--cols": cols, scrollPaddingInline: `${identity + gap}px ${menu + gap}px` } as CSSProperties;
  const { active } = drag;
  const rowProps = { view, specDefs };
  return (
    <DndContext {...drag.dndProps}>
      {/* Middle-button panning is a mouse extra; the tower scrolls like any other row. */}
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        ref={scroller}
        style={style}
        data-scroll-restoration-id="tower"
        onMouseDown={panWithMiddleButton}
        // Positioned, so screen-reader-only text inside stays clipped instead of widening the page.
        // The columns snap between the frozen ones, so the ones on screen are whole at rest; a
        // middle-button pan follows the mouse and snaps when it lets go.
        className="group/tower relative snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] in-data-grabbing:snap-none [&::-webkit-scrollbar]:hidden"
      >
        <div className="w-max min-w-full">
          {/* Hidden until a car exists: an empty board has nothing to read down. */}
          {hasCars && <TowerHeader specDefs={specDefs} />}
          {sections.map((section) => (
            <TowerSector
              key={section.tier}
              {...section}
              dragging={active !== undefined}
              target={drag.targetTier === section.tier}
              pending={pending && section.tier === "watching"}
              rowProps={rowProps}
            />
          ))}
        </div>
      </div>
      <DragOverlay>
        {active && (
          <div style={style}>
            <TowerRow listing={active} lifted {...rowProps} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

const headText = "text-[0.71875rem] leading-tight font-bold tracking-[0.05em] text-muted-foreground uppercase [font-stretch:75%]";

function TowerHeader({ specDefs }: { specDefs: KeySpecDef[] }) {
  return (
    <div className="[--row-bg:var(--color-background)]">
      <div aria-hidden className="grid grid-cols-(--cols) items-end gap-x-1 border-b-2 border-foreground pb-1.25">
        <div className={cn(headText, "sticky left-0 z-10 self-stretch bg-background")}>Car · price</div>
        {/* The header's cells are the snap points for every row. */}
        {specDefs.map((def) => (
          <div key={def.id} className={cn(headText, "snap-start pl-1.25")}>
            {def.name}
          </div>
        ))}
        <div className={cn(headText, "snap-start border-l pl-1.75")}>Seller</div>
        <EndCell />
      </div>
      {/* One continuous rail with the stretch on screen in ink, under the scrolling columns. */}
      <div aria-hidden className="sticky left-0 hidden w-(--pw) pt-1.25 group-data-overflow/tower:block">
        <div className="relative h-0.75 rounded-full bg-foreground/20" style={{ marginLeft: identity + gap, marginRight: menu + gap }}>
          <i data-rail className="absolute inset-y-0 rounded-full bg-foreground" />
        </div>
      </div>
    </div>
  );
}

// The frozen end of a row, holding its actions in a column of their own: the scrolling
// columns stop at its edge, which takes a rule while columns hide under it.
function EndCell({ children }: { children?: ReactNode }) {
  return (
    <div className="sticky right-0 z-10 flex items-center justify-end self-stretch bg-(--row-bg) group-data-overflow/tower:shadow-[-1px_0_0_var(--color-border)]">
      {children}
    </div>
  );
}

function TowerSector({
  tier,
  label,
  listings,
  dragging,
  target,
  pending,
  rowProps,
}: {
  tier: Tier;
  label: string;
  listings: BoardListing[];
  dragging: boolean;
  target: boolean;
  pending: boolean;
  rowProps: RowProps;
}) {
  const { setNodeRef } = useDroppable({ id: tier });
  const count = listings.length;
  return (
    <section ref={setNodeRef} aria-label={`${label} tier`} className="mt-2.5">
      {/* Every tier label shares one size on phones, so the bars match. */}
      <div className={cn("sticky left-0 flex h-11 w-(--pw) items-center justify-between rounded-t-md px-3", sectionSlabColor(tier))}>
        <h2 className="condensed text-[1.875rem] leading-none font-extrabold">{label}</h2>
        <p className="text-[0.78125rem] font-semibold">
          <b className="condensed text-[1.0625rem] font-extrabold">{count}</b> {count === 1 ? "car" : "cars"}
        </p>
      </div>
      {/* Clipped, not hidden: overflow-hidden would make this a scroller and unstick the frozen columns. */}
      <div
        className={cn(
          "overflow-clip rounded-b-md bg-(--row-bg) transition-colors [--row-bg:var(--color-card)] [&>*:first-child]:border-t-0",
          // The sector a dragged car would land in tints.
          target && "[--row-bg:color-mix(in_oklab,var(--color-foreground)_9%,var(--color-card))]",
        )}
      >
        {pending && <PendingRows className="sticky left-0 w-(--pw) border-t" />}
        <SortableContext items={listings.map((l) => l.listingId)} strategy={verticalListSortingStrategy}>
          {listings.map((listing) => (
            <SortableRow key={listing.listingId} listing={listing} {...rowProps} />
          ))}
        </SortableContext>
        {count === 0 && (
          <p className="sticky left-0 flex min-h-13 w-(--pw) items-center border-t px-3 font-semibold">
            {dragging ? "Drop here" : tier === "watching" ? "No cars. New cars land here." : "No cars"}
          </p>
        )}
      </div>
    </section>
  );
}

type RowProps = { view: TierViewProps; specDefs: KeySpecDef[] };

// A long press lifts the row to drag it up or down the tower; Alt+↑/↓ moves the focused car
// one place, into the next tier at a sector's edge.
function SortableRow({ listing, ...props }: RowProps & { listing: BoardListing }) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: listing.listingId });
  return (
    <TowerRow
      listing={listing}
      {...props}
      rowRef={setNodeRef}
      placeholder={isDragging}
      rowProps={{
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

function TowerRow({
  listing,
  view,
  specDefs,
  lifted = false,
  placeholder = false,
  rowRef,
  rowProps,
}: RowProps & {
  listing: BoardListing;
  lifted?: boolean;
  /** The row's old place while it is dragged: a flat tint. */
  placeholder?: boolean;
  rowRef?: Ref<HTMLDivElement>;
  rowProps?: HTMLAttributes<HTMLDivElement>;
}) {
  const { specs } = listing;
  const { criteria, home, modelName, toConfirm } = view.cardProps(listing);
  const removed = listing.status === "removed";
  const { checks } = evaluate(
    { price: listing.price, firstRegistration: specs.firstRegistration, mileageKm: specs.mileageKm },
    criteria,
    specDefs,
    listing.keySpecs,
    listing.modelId,
  );
  const over = (kind: "year" | "mileage") => checks.some((c) => c.kind === kind && c.status === "missed");
  const distance = formatDistance(home, listing.geo);
  return (
    <div
      ref={rowRef}
      {...rowProps}
      className={cn(
        "group/card relative grid min-h-14.5 grid-cols-(--cols) items-center gap-x-1 border-t bg-(--row-bg) select-none [-webkit-touch-callout:none]",
        // A removed ad sits on the concrete, with full-ink text.
        removed && "[--row-bg:var(--color-background)]",
        lifted && "-rotate-[0.6deg] rounded-md border-0 shadow-[0_14px_30px_-8px_rgb(0_0_0/0.35),0_0_0_1px_var(--color-input)] [--row-bg:var(--color-card)]",
        placeholder && "bg-foreground/8 [--row-bg:transparent] *:invisible",
      )}
    >
      <Link
        to="/listings/$listingId"
        params={{ listingId: listing.listingId }}
        draggable={false}
        onClick={() => openCar(listing.listingId)}
        data-car={listing.listingId}
        className="sticky left-0 z-10 flex min-w-0 items-center gap-1.5 self-stretch bg-(--row-bg) py-1.5 pl-1 shadow-[1px_0_0_var(--color-border)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        {/* The car's lot number, as the catalogue shows it. */}
        <span className="condensed w-4 shrink-0 text-center text-[0.9375rem] font-bold tabular-nums">
          {view.lots.get(listing.listingId)}
          <span className="sr-only">.</span>
        </span>
        <Thumb listing={listing} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1">
            <span className="condensed text-[1.1875rem] leading-none font-bold tabular-nums">{formatPrice(listing.price)}</span>
            <PriceNote listing={listing} />
          </span>
          {/* Power sits beside the model, or alone when the board shows one model. */}
          <span className="condensed text-[0.84375rem] leading-tight font-bold">
            {[modelName, specs.powerKw !== undefined && formatPower(specs.powerKw)].filter(Boolean).join(" · ")}
          </span>
          <span className="condensed text-[0.84375rem] leading-tight font-bold">
            {formatRegistration(specs.firstRegistration)}
            {over("year") && <OutsideMark limit="year" className="ml-0.75 align-[1px]" />}
            {" · "}
            {formatKm(specs.mileageKm)}
            {over("mileage") && <OutsideMark limit="mileage" className="ml-0.75 align-[1px]" />}
          </span>
          {toConfirm !== undefined && <span className="text-[0.75rem] leading-tight font-semibold">{toConfirm} to confirm</span>}
          {/* The title names the car for screen readers and find-in-page; the row shows the model. */}
          <span className="sr-only">{listing.title}</span>
        </span>
      </Link>
      {specDefs.map((def) => {
        const spec = listing.keySpecs.find((s) => s.id === def.id);
        return <div key={def.id} className="min-w-0">{spec && <SpecCell spec={spec} {...specVerdict(spec, def, listing.modelId)} />}</div>;
      })}
      <p className="flex min-w-0 flex-col justify-center self-stretch border-l pl-1.75 text-[0.78125rem] leading-tight break-words">
        <span className="sr-only">Seller: </span>
        {distance && <span className="font-semibold">{distance}</span>}
        <span className="text-muted-foreground">{listing.location ?? listing.country}</span>
      </p>
      <EndCell>
        {!lifted && (
          <CardMenu listing={listing} canMarkRemoved={view.canMarkRemoved} onAction={(action) => view.onAction(listing, action)} />
        )}
      </EndCell>
    </div>
  );
}

// Beside the price: an ink flag where the price moved (colour only marks change), the VAT
// badge, or "Last price" on a removed ad.
function PriceNote({ listing }: { listing: BoardListing }) {
  if (listing.status === "removed") return <span className="text-[0.6875rem] font-semibold text-muted-foreground">Last price</span>;
  const change = priceChange(listing);
  if (change !== 0) {
    const percent = ((Math.abs(change) / listing.firstPrice.amount) * 100).toFixed(1);
    return (
      <span className="inline-flex h-4 items-center gap-0.5 rounded-[3px] bg-slab px-1 text-[0.6875rem] font-bold whitespace-nowrap text-slab-foreground [font-stretch:75%]">
        <svg aria-hidden viewBox="0 0 8 8" className={cn("size-2", change > 0 && "rotate-180")}>
          <path d="M0 1.5h8L4 7z" fill="currentColor" />
        </svg>
        <span className="sr-only">
          {change < 0 ? "Down" : "Up"} {formatPrice({ ...listing.price, amount: Math.abs(change) })} (
        </span>
        {percent}%<span className="sr-only">) since first seen</span>
      </span>
    );
  }
  return listing.price.vatDeductible ? (
    <Badge variant="outline" className="h-4 rounded-sm px-1 text-[0.59375rem]">
      VAT<span className="sr-only"> reclaimable</span>
    </Badge>
  ) : null;
}

function Thumb({ listing }: { listing: BoardListing }) {
  const removed = listing.status === "removed";
  const opened = useOpenedCar(listing.listingId);
  return (
    <span className="relative flex aspect-video w-14 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted text-muted-foreground">
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
        <>
          <ImageOff className="size-3.25" aria-hidden />
          <span className="sr-only">No photo</span>
        </>
      )}
      {removed && (
        <span className="absolute inset-x-0 bottom-0">
          <RemovedBand size="sm" />
        </span>
      )}
    </span>
  );
}

// The ledger's four states, laid along the row; the column header names the spec.
function SpecCell({ spec, hit, breaker }: { spec: ResolvedSpec; hit: boolean; breaker: boolean }) {
  const missing = spec.kind === "check" && spec.value === "no";
  return (
    <div
      className={cn(
        "px-1 py-0.75 text-[0.71875rem] leading-tight font-semibold break-words hyphens-auto",
        specTone(spec, { hit, breaker }),
        spec.value === null && "font-medium text-muted-foreground",
      )}
    >
      <span className="sr-only">{spec.name}: </span>
      <span className="inline-flex items-start gap-0.5">
        {missing && <X className="mt-px size-2.75 shrink-0" aria-hidden />}
        {specValueText(spec)}
      </span>
      {spec.source === "listing" && <span className="sr-only"> (from the listing, not confirmed)</span>}
      {hit && <span className="sr-only"> (preferred)</span>}
      {breaker && <span className="sr-only"> (deal-breaker)</span>}
    </div>
  );
}

// Tracks the shared sideways scroll without re-rendering the tower: the scroller's width
// (--pw, for the sticky full-width parts), whether it overflows (a data attribute), and the
// rail's ink stretch. Returns the scrolling columns' width, which divides the room between
// the frozen columns evenly, so whole columns fill it exactly and snapping leaves none cut.
function useSideScroll(columns: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(minColumn);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      el.style.setProperty("--pw", `${el.clientWidth}px`);
      const room = el.clientWidth - identity - menu - 2 * gap;
      const fit = Math.min(columns, Math.max(1, Math.floor((room + gap) / (minColumn + gap))));
      setWidth(Math.max(minColumn, (room - (fit - 1) * gap) / fit));
      el.toggleAttribute("data-overflow", el.scrollWidth - el.clientWidth > 1);
      const rail = el.querySelector<HTMLElement>("[data-rail]");
      const frozen = identity + menu + 2 * gap;
      const track = el.scrollWidth - frozen;
      if (rail && track > 0) {
        rail.style.left = `${(el.scrollLeft / track) * 100}%`;
        rail.style.width = `${((el.clientWidth - frozen) / track) * 100}%`;
      }
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [columns]);
  return [ref, width] as const;
}
