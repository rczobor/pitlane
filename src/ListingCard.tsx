import { Link } from "@tanstack/react-router";
import { Ban, ImageOff } from "lucide-react";
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { type Criteria, evaluate } from "../shared/fit";
import type { Point } from "../shared/geo";
import { KeySpecLedger } from "./KeySpecLedger";
import { TierSlab } from "./TierSlab";
import {
  type BoardListing,
  type KeySpecDef,
  formatDate,
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

// Covers a removed car's photo panel, on the card and in the board's photo indexes, so a gone
// car reads the same everywhere. The overlay, not a photo filter, darkens the panel, so the
// white stamp also reads on a car without a photo. The smallest tiles drop the date.
const stampSizes = {
  sm: "border px-1 pt-0.5 text-[0.625rem]",
  md: "border-2 px-1.5 pt-0.5 text-sm",
  lg: "border-2 px-3 pt-1 pb-0.5 text-3xl",
};

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

export function RemovedStamp({ removedAt, size = "lg" }: { removedAt?: number; size?: keyof typeof stampSizes }) {
  return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/65 text-white">
      <span className={cn("condensed -rotate-3 border-current leading-none font-bold tracking-wide uppercase", stampSizes[size])}>
        Ad removed
      </span>
      {removedAt !== undefined && size !== "sm" && (
        <span className={cn("font-semibold", size === "lg" ? "text-xs" : "text-[0.625rem]")}>{formatDate(removedAt)}</span>
      )}
    </span>
  );
}

export function ListingCard({
  listing,
  modelName,
  criteria,
  specDefs,
  home,
  lifted = false,
  preview = false,
  showTier = false,
  className,
}: CardProps & {
  listing: BoardListing;
  /** Overrides the card's width. */
  className?: string;
  lifted?: boolean;
  /** Off the board (the map), where no lane says the car's tier. */
  showTier?: boolean;
  /** A static rendering for the settings preview: no link, so unsaved edits are not lost. */
  preview?: boolean;
}) {
  const { specs } = listing;
  const removed = listing.status === "removed";
  const opened = useSyncExternalStore(subscribeOpenedCar, () => openedCar === listing.listingId);
  const { dealBreakers } = evaluate(
    { price: listing.price, firstRegistration: specs.firstRegistration, mileageKm: specs.mileageKm },
    criteria,
    specDefs,
    listing.keySpecs,
    listing.modelId,
  );
  const distance = formatDistance(home, listing.geo);
  const country = listing.country;
  const place = [listing.location ?? country, distance && `${distance} away`].filter(Boolean).join(" · ");
  const fuel = otherFuel(specs.fuel);
  const change =
    listing.price.currency === listing.firstPrice.currency ? listing.price.amount - listing.firstPrice.amount : 0;
  const card = (
    <>
      {/* A removed car keeps only its outline on the board, so it reads as gone at a glance.
          Lifted, it floats over other cards, so it takes its fill back. */}
      <Card
        size="sm"
        className={cn(
          "h-full rounded-lg pt-0",
          removed && "bg-transparent text-muted-foreground",
          lifted && "rotate-1 bg-card shadow-xl",
        )}
      >
        {/* overflow-hidden lets aspect-ratio win over a photo's natural height. */}
        <div className="relative aspect-video shrink-0 overflow-hidden bg-muted">
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
            // The removed stamp takes the empty panel's place.
            !removed && <NoPhoto />
          )}
          {removed && <RemovedStamp removedAt={listing.removedAt} />}
          {showTier && (
            <TierSlab
              tier={listing.tier}
              className={cn("absolute top-2 left-2 h-8 min-w-8 px-2", listing.tier.length === 1 ? "text-2xl" : "text-base")}
            />
          )}
        </div>
        <CardHeader>
          {/* Wraps on narrow cards: the badge drops below the price instead of being clipped. */}
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <p className="flex items-baseline gap-1.5">
              <span className="condensed text-3xl leading-none font-bold">{formatPrice(listing.price)}</span>
              {change !== 0 && (
                <span className="text-xs font-semibold whitespace-nowrap tabular-nums">
                  <span className="sr-only">{change < 0 ? "Down" : "Up"} </span>
                  <span aria-hidden>{change < 0 ? "−" : "+"}</span>
                  {formatPrice({ ...listing.price, amount: Math.abs(change) })}
                </span>
              )}
            </p>
            {removed ? (
              <span className="text-xs text-muted-foreground">Last price</span>
            ) : (
              listing.price.vatDeductible && <Badge variant="secondary">VAT reclaimable</Badge>
            )}
          </div>
          {modelName && <p className="condensed text-lg leading-none font-bold">{modelName}</p>}
          <h3 className="line-clamp-2 min-h-[2.5em] leading-tight font-medium">{listing.title}</h3>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Year, mileage and power stay at glance level, above the key specs. */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <dl className="flex gap-x-3 tabular-nums">
              <Spec label="First registration" value={formatRegistrationYear(specs.firstRegistration)} />
              <Spec label="Mileage" value={formatKm(specs.mileageKm)} />
              {specs.powerKw !== undefined && <Spec label="Power" value={formatPower(specs.powerKw)} />}
            </dl>
            <div className="flex gap-1">
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
            </div>
          </div>
          <KeySpecLedger specs={listing.keySpecs} defs={specDefs} modelId={listing.modelId} className={cn(removed && "opacity-50")} />
          {dealBreakers.length > 0 && (
            <p className="flex items-center gap-1 text-xs font-semibold text-destructive">
              <Ban className="size-3.5 shrink-0" aria-hidden />
              Deal-breaker: {dealBreakers.map((d) => dealBreakerLabel(d, listing.keySpecs)).join(", ")}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
  // Full height, so cards in one row of a lane end together.
  const frame = cn("block h-full w-(--board-card) shrink-0 rounded-lg", className);
  return preview ? (
    <div className={frame}>{card}</div>
  ) : (
    <Link
      to="/listings/$listingId"
      params={{ listingId: listing.listingId }}
      draggable={false}
      onClick={() => openCar(listing.listingId)}
      className={frame}
    >
      {card}
    </Link>
  );
}

// The title sits right below, so the panel only states what is missing.
export function NoPhoto({ className }: { className?: string }) {
  return (
    <div className={cn("flex size-full items-center justify-center gap-2 text-sm text-muted-foreground", className)}>
      <ImageOff className="size-4" aria-hidden />
      No photo saved
    </div>
  );
}

// Values are self-explanatory on the card; the labels are there for screen readers.
function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="whitespace-nowrap">
      <dt className="sr-only">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
