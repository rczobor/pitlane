import { Link } from "@tanstack/react-router";
import { Ban, ImageOff } from "lucide-react";
import { type ReactNode, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { type Criteria, evaluate } from "../shared/fit";
import type { Point } from "../shared/geo";
import { KeySpecLedger } from "./KeySpecLedger";
import { TierSlab } from "./TierSlab";
import {
  type BoardListing,
  type KeySpecDef,
  formatDistance,
  formatKm,
  formatPower,
  formatPrice,
  formatRegistrationYear,
  otherFuel,
  dealBreakerLabel,
} from "./format";

export type CardProps = {
  modelName?: string;
  /** The limits of the car's model (budget, years, mileage). */
  criteria?: Criteria;
  /** The board's key specs, in priority order (or a settings draft, for the preview). */
  specDefs: KeySpecDef[];
  /** The user's home, for the distance to the seller. */
  home?: Point | null;
};

/**
 * How much room a car gets. The catalogue gives cars less further down the board:
 * - feature: S, a spread with the photo beside the facts;
 * - lot: A and B (and cars shown on their own), photo over a placard;
 * - compact: Watching, a smaller lot;
 * - index: Rejected, one row with a thumbnail and no ledger.
 */
export type CardVariant = "feature" | "lot" | "compact" | "index";

// The card's photo and the car page's first photo are the same image, so opening a car morphs
// one into the other and coming back morphs it home (the router's view transition, main.tsx).
// A view-transition-name must be unique on the page, and the board can show hundreds of cards,
// so only the car opened last carries it.
export const carPhotoTransition = { viewTransitionName: "car-photo" };
let openedCar: string | undefined;
const openedCarListeners = new Set<() => void>();
const subscribeOpenedCar = (listener: () => void) => {
  openedCarListeners.add(listener);
  return () => openedCarListeners.delete(listener);
};
// Called by a card's click and by the car page's route, so a car opened from elsewhere (the
// comparison) still morphs into its own card on the way back to the board.
export function openCar(listingId: string) {
  if (openedCar === listingId) return;
  openedCar = listingId;
  // Synchronously, so the board's snapshot shows the name on this card and no longer on the last one.
  flushSync(() => openedCarListeners.forEach((listener) => listener()));
}

/** Whether this car's photo carries the morph to and from its page. */
export const useOpenedCar = (listingId: string) =>
  useSyncExternalStore(subscribeOpenedCar, () => openedCar === listingId);

// A removed ad's pit board across the photo's foot, in opaque slab colours so it holds on any
// photo; the photo itself turns grey. The smallest thumbnails drop the date.
export function RemovedBand({ removedAt, size = "md" }: { removedAt?: number; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "condensed block w-full bg-slab text-center leading-none font-extrabold tracking-wide whitespace-nowrap text-slab-foreground uppercase",
        size === "sm" ? "py-0.5 text-[0.625rem]" : "py-1 text-sm",
      )}
    >
      Ad removed
      {removedAt !== undefined && size !== "sm" && (
        <> {new Date(removedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</>
      )}
    </span>
  );
}

// The price as a pit board bolted to the photo's corner: opaque ink in both themes.
const plateSizes = {
  sm: { box: "gap-1.5 pt-1.25 pr-2.25 pb-1 pl-2", price: "text-[1.3125rem]", change: "text-[0.6875rem]" },
  md: { box: "gap-2 pt-1.75 pr-2.75 pb-1.5 pl-2.5", price: "text-[1.6875rem]", change: "text-xs" },
  xl: {
    box: "gap-3 pt-2 pr-3.5 pb-2 pl-3 lg:pt-2.5 lg:pr-4 lg:pb-2.25 lg:pl-3.5",
    price: "text-[2.5rem] lg:text-[3.25rem]",
    change: "text-sm lg:text-[0.9375rem]",
  },
};

function PricePlate({ listing, size }: { listing: BoardListing; size: keyof typeof plateSizes }) {
  const change = priceChange(listing);
  const sizes = plateSizes[size];
  return (
    <p className={cn("flex items-baseline rounded-tr-sm bg-plate text-plate-foreground", sizes.box)}>
      {/* A removed ad keeps its price unstruck; strikethrough would read as "reduced". */}
      {listing.status === "removed" && (
        <span className="self-center text-[0.6875rem] font-semibold tracking-wide text-plate-muted uppercase">Last price</span>
      )}
      <span className={cn("condensed leading-none font-extrabold tabular-nums", sizes.price)}>{formatPrice(listing.price)}</span>
      {change !== 0 && (
        <span className={cn("font-semibold whitespace-nowrap text-plate-muted tabular-nums", sizes.change)}>
          <span className="sr-only">{change < 0 ? "Down" : "Up"} </span>
          <span aria-hidden>{change < 0 ? "−" : "+"}</span>
          {formatPrice({ ...listing.price, amount: Math.abs(change) })}
        </span>
      )}
    </p>
  );
}

/** How far the price has moved since the car was first seen (0 across currencies). */
export const priceChange = (listing: Pick<BoardListing, "price" | "firstPrice">) =>
  listing.price.currency === listing.firstPrice.currency ? listing.price.amount - listing.firstPrice.amount : 0;

// The photo box keeps its ratio whatever it holds (shrink-0), and clips the photo
// (overflow-hidden) so a photo's natural height never overrides the ratio.
function Photo({
  listing,
  small = false,
  className,
  children,
}: {
  listing: BoardListing;
  /** A thumbnail: the no-photo panel says less. */
  small?: boolean;
  className?: string;
  /** Laid along the photo's foot: the price plate, then a removed ad's band. */
  children?: ReactNode;
}) {
  const removed = listing.status === "removed";
  const opened = useOpenedCar(listing.listingId);
  return (
    <div className={cn("relative shrink-0 overflow-hidden bg-muted", className)}>
      {listing.coverUrl ? (
        <img
          src={listing.coverUrl}
          alt=""
          draggable={false}
          loading="lazy"
          style={opened ? carPhotoTransition : undefined}
          className={cn("size-full object-cover", removed && "grayscale")}
        />
      ) : small ? (
        <NoPhoto className="flex-col gap-1 text-xs" label="No photo" />
      ) : (
        <NoPhoto className="flex-col gap-1.5 text-[0.8125rem] font-medium [&_svg]:size-5.5" />
      )}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-start">
        {children}
        {removed && <RemovedBand removedAt={listing.removedAt} size={children ? "md" : "sm"} />}
      </div>
    </div>
  );
}

export function ListingCard({
  listing,
  modelName,
  criteria,
  specDefs,
  home,
  lot,
  variant = "lot",
  lifted = false,
  preview = false,
  showTier = false,
  className,
}: CardProps & {
  listing: BoardListing;
  /** The car's lot number on the board. */
  lot?: number;
  variant?: CardVariant;
  /** Overrides the card's width. */
  className?: string;
  lifted?: boolean;
  /** Off the board (the map), where no section says the car's tier. */
  showTier?: boolean;
  /** A static rendering for the settings preview: no link, so unsaved edits are not lost. */
  preview?: boolean;
}) {
  const { specs } = listing;
  const { dealBreakers } = evaluate(
    { price: listing.price, firstRegistration: specs.firstRegistration, mileageKm: specs.mileageKm },
    criteria,
    specDefs,
    listing.keySpecs,
    listing.modelId,
  );
  const lotLine = <LotLine lot={lot} model={modelName} large={variant === "feature"} />;
  const badges = <Badges listing={listing} home={home} />;
  const ledger = (
    <div className="mt-auto space-y-2">
      <KeySpecLedger specs={listing.keySpecs} defs={specDefs} modelId={listing.modelId} size={variant === "feature" ? "lg" : "md"} />
      {dealBreakers.length > 0 && (
        <p className="flex items-center gap-1 text-xs font-semibold text-destructive">
          <Ban className="size-3.5 shrink-0" aria-hidden />
          Deal-breaker: {dealBreakers.map((d) => dealBreakerLabel(d, listing.keySpecs)).join(", ")}
        </p>
      )}
    </div>
  );
  const tierSlab = showTier && (
    <TierSlab
      tier={listing.tier}
      className={cn("absolute top-2 left-2 h-8 min-w-8 px-2", listing.tier.length === 1 ? "text-2xl" : "text-base")}
    />
  );

  let card: ReactNode;
  if (variant === "feature") {
    card = (
      <article className="grid h-full overflow-hidden rounded-sm bg-card lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Photo listing={listing} className="aspect-[4/3] sm:aspect-[3/2]">
          <PricePlate listing={listing} size="xl" />
        </Photo>
        <div className="flex min-w-0 flex-col gap-4 p-4 sm:px-7 sm:py-6">
          {lotLine}
          <h3 className="text-base leading-snug">{listing.title}</h3>
          <dl className="flex flex-wrap gap-x-7 gap-y-2">
            <Figure label="Year" value={formatRegistrationYear(specs.firstRegistration)} />
            <Figure label="Mileage" value={formatKm(specs.mileageKm)} />
            {specs.powerKw !== undefined && <Figure label="Power" value={formatPower(specs.powerKw)} />}
          </dl>
          {badges}
          {ledger}
        </div>
      </article>
    );
  } else if (variant === "index") {
    card = (
      // Index rows have no ledger: rejected cars are decided, and their specs are a click away.
      <article className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 py-2 lg:grid-cols-[6.5rem_13rem_minmax(0,1fr)_auto_7rem] lg:gap-x-5">
        <Photo listing={listing} small className="row-span-2 aspect-[4/3] w-24 rounded-xs lg:row-span-1 lg:w-26" />
        {lotLine}
        <h3 className="sr-only text-[0.8125rem] lg:not-sr-only lg:truncate">{listing.title}</h3>
        <div className="col-span-2 col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 lg:col-span-1 lg:col-start-auto">
          <Stats specs={specs} className="text-sm" />
          {badges}
        </div>
        <p className="col-start-3 row-start-1 text-right lg:col-start-auto lg:row-start-auto">
          {listing.status === "removed" && <span className="mr-1.5 text-xs text-muted-foreground">Last price</span>}
          <span className="condensed text-[1.3125rem] leading-none font-extrabold tabular-nums lg:text-2xl">
            {formatPrice(listing.price)}
          </span>
        </p>
      </article>
    );
  } else {
    const compact = variant === "compact";
    card = (
      <article className="flex h-full min-w-0 flex-col">
        <Photo listing={listing} className={cn("rounded-t-sm", compact ? "aspect-[4/3]" : "aspect-[3/2]")}>
          <PricePlate listing={listing} size={compact ? "sm" : "md"} />
        </Photo>
        {tierSlab}
        <div className={cn("flex flex-1 flex-col rounded-b-sm bg-card", compact ? "gap-1.5 p-2.5" : "gap-2 px-3.5 pt-3 pb-3.5")}>
          {lotLine}
          <h3 className={cn("line-clamp-2 leading-snug", compact ? "text-xs" : "text-[0.8125rem]")}>{listing.title}</h3>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Stats specs={specs} className={compact ? "text-[0.8125rem]" : "text-[0.9375rem]"} />
            <div className="ml-auto">{badges}</div>
          </div>
          {ledger}
        </div>
      </article>
    );
  }

  const frame = cn(
    "block h-full w-(--board-card) shrink-0 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    lifted && "-rotate-2 bg-card shadow-[0_18px_40px_rgb(0_0_0/0.28),0_2px_6px_rgb(0_0_0/0.2)]",
    className,
  );
  return preview ? (
    <div className={frame}>{card}</div>
  ) : (
    <Link
      to="/listings/$listingId"
      params={{ listingId: listing.listingId }}
      draggable={false}
      onClick={() => openCar(listing.listingId)}
      data-car={listing.listingId}
      className={frame}
    >
      {card}
    </Link>
  );
}

// "LOT 2  718 GT4 RS": the lot number to say out loud, then the model when the board shows several.
function LotLine({ lot, model, large }: { lot?: number; model?: string; large: boolean }) {
  if (lot === undefined && !model) return null;
  return (
    <p className="flex min-w-0 items-baseline gap-2">
      {lot !== undefined && (
        <span
          className={cn(
            "condensed font-bold tracking-[0.07em] whitespace-nowrap text-muted-foreground uppercase",
            large ? "text-sm" : "text-xs",
          )}
        >
          Lot {lot}
        </span>
      )}
      {model && (
        <span className={cn("condensed leading-tight font-bold", large ? "text-[1.375rem] sm:text-[1.625rem]" : "text-[1.0625rem]")}>
          {model}
        </span>
      )}
    </p>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-bold tracking-[0.07em] text-muted-foreground uppercase">{label}</dt>
      <dd className="condensed text-[1.6875rem] leading-tight font-bold tabular-nums sm:text-[2rem]">{value}</dd>
    </div>
  );
}

// Year, mileage and power stay at glance level, above the key specs. The values explain
// themselves; the labels are there for screen readers.
function Stats({ specs, className }: { specs: BoardListing["specs"]; className?: string }) {
  const values = [
    ["First registration", formatRegistrationYear(specs.firstRegistration)],
    ["Mileage", formatKm(specs.mileageKm)],
    ...(specs.powerKw !== undefined ? [["Power", formatPower(specs.powerKw)]] : []),
  ];
  return (
    <dl className={cn("flex items-baseline gap-x-1.5 font-semibold whitespace-nowrap tabular-nums", className)}>
      {values.map(([label, value], index) => (
        <div key={label} className="flex items-baseline gap-x-1.5">
          {index > 0 && (
            <span aria-hidden className="font-normal text-muted-foreground">
              ·
            </span>
          )}
          <dt className="sr-only">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Badges({ listing, home }: { listing: BoardListing; home?: Point | null }) {
  const { specs, country } = listing;
  const fuel = otherFuel(specs.fuel);
  const distance = formatDistance(home, listing.geo);
  const place = [listing.location ?? country, distance && `${distance} away`].filter(Boolean).join(" · ");
  const vat = listing.status !== "removed" && listing.price.vatDeductible;
  if (!fuel && specs.gearbox !== "manual" && !country && !vat) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {fuel && <Badge variant="outline">{fuel}</Badge>}
      {/* Nearly every car is an automatic (PDK), so only a manual is worth a badge.
          "MT" keeps the badges on the specs line, where "Manual" wrapped them. */}
      {specs.gearbox === "manual" && (
        <Tooltip>
          <TooltipTrigger render={<Badge variant="outline" />}>
            <span aria-hidden>MT</span>
            <span className="sr-only">Manual</span>
          </TooltipTrigger>
          <TooltipContent>Manual</TooltipContent>
        </Tooltip>
      )}
      {/* The country is enough to judge the trip at a glance; the place and distance
          are on hover and on the car page. */}
      {country && (
        <Tooltip>
          <TooltipTrigger render={<Badge variant="outline" />}>
            <span aria-hidden>{country}</span>
            <span className="sr-only">Seller: {place}</span>
          </TooltipTrigger>
          <TooltipContent>{place}</TooltipContent>
        </Tooltip>
      )}
      {vat && <Badge variant="outline">VAT reclaimable</Badge>}
    </div>
  );
}

// The title sits right below, so the panel only states what is missing.
export function NoPhoto({ className, label = "No photo saved" }: { className?: string; label?: string }) {
  return (
    <div className={cn("flex size-full items-center justify-center gap-2 text-sm text-muted-foreground", className)}>
      <ImageOff className="size-4" aria-hidden />
      {label}
    </div>
  );
}
