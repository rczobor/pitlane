import { Link } from "@tanstack/react-router";
import { Ban, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
      <Card size="sm" className={cn("h-full rounded-lg pt-0", lifted && "rotate-1 shadow-xl")}>
        {/* overflow-hidden lets aspect-ratio win over a photo's natural height. */}
        <div className="relative aspect-video shrink-0 overflow-hidden bg-muted">
          {listing.coverUrl ? (
            <img
              src={listing.coverUrl}
              alt=""
              draggable={false}
              loading="lazy"
              className={cn("size-full object-cover", removed && "grayscale")}
            />
          ) : (
            <NoPhoto />
          )}
          {showTier && (
            <TierSlab
              tier={listing.tier}
              className={cn("absolute top-2 left-2 h-8 min-w-8 px-2", listing.tier.length === 1 ? "text-2xl" : "text-base")}
            />
          )}
          {removed && (
            <p className="absolute inset-x-0 bottom-0 bg-slab px-3 py-1 text-xs font-semibold text-slab-foreground">
              Ad removed{listing.removedAt && ` ${formatDate(listing.removedAt)}`}
            </p>
          )}
        </div>
        <CardHeader>
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
            {removed && <span className="text-xs text-muted-foreground">Last price</span>}
          </div>
          {modelName && <p className="condensed text-lg leading-none font-bold">{modelName}</p>}
          <h3 className="line-clamp-2 min-h-[2.5em] leading-tight font-medium">{listing.title}</h3>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Year, mileage and power stay at glance level, above the key specs. The badges get
              their own row, kept even when empty, so across a lane of narrow cards the stats
              and the ledgers start at the same height. */}
          <div className="space-y-1">
            <dl className="flex gap-x-3 tabular-nums">
              <Spec label="First registration" value={formatRegistrationYear(specs.firstRegistration)} />
              <Spec label="Mileage" value={formatKm(specs.mileageKm)} />
              {specs.powerKw !== undefined && <Spec label="Power" value={formatPower(specs.powerKw)} />}
            </dl>
            {/* VAT sits here too, so it has one place on every card and never wraps the price. */}
            <div className="flex min-h-5 flex-wrap gap-1">
              {!removed && listing.price.vatDeductible && <Badge variant="secondary">VAT reclaimable</Badge>}
              {fuel && <Badge variant="outline">{fuel}</Badge>}
              {/* Nearly every car is an automatic (PDK), so only a manual is worth a badge.
                  "MT" keeps the badges on the specs line, where "Manual" wrapped them. */}
              {specs.gearbox === "manual" && (
                <Badge variant="outline" title="Manual">
                  <span aria-hidden>MT</span>
                  <span className="sr-only">Manual</span>
                </Badge>
              )}
              {/* The country is enough to judge the trip at a glance; the place and distance
                  are on hover and on the car page. */}
              {country && (
                <Badge variant="outline" title={place}>
                  <span aria-hidden>{country}</span>
                  <span className="sr-only">Seller: {place}</span>
                </Badge>
              )}
            </div>
          </div>
          <KeySpecLedger specs={listing.keySpecs} defs={specDefs} modelId={listing.modelId} />
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
    <Link to="/listings/$listingId" params={{ listingId: listing.listingId }} draggable={false} className={frame}>
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
