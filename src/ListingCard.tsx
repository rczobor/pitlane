import { Link } from "@tanstack/react-router";
import { Ban, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { type Criteria, evaluate, toCheck } from "../shared/fit";
import type { Point } from "../shared/geo";
import { KeySpecLedger } from "./KeySpecLedger";
import { TierSlab } from "./TierSlab";
import {
  type BoardListing,
  type KeySpecDef,
  formatAge,
  formatDate,
  formatDistance,
  formatDrivetrain,
  formatKm,
  formatPower,
  formatPrice,
  formatRegistration,
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
}: CardProps & {
  listing: BoardListing;
  lifted?: boolean;
  /** Off the board (the map), where no lane says the car's tier. */
  showTier?: boolean;
  /** A static rendering for the settings preview: no link, so unsaved edits are not lost. */
  preview?: boolean;
}) {
  const { specs } = listing;
  const removed = listing.status === "removed";
  const { met, total, dealBreakers } = evaluate(
    { price: listing.price, firstRegistration: specs.firstRegistration, mileageKm: specs.mileageKm },
    criteria,
    specDefs,
    listing.keySpecs,
    listing.modelId,
  );
  const unchecked = toCheck(listing.keySpecs);
  const distance = formatDistance(home, listing.geo);
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
        <CardContent className="space-y-3">
          {/* Year, mileage and power stay at glance level, above the key specs. */}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
            <Spec
              label="First registration"
              value={specs.firstRegistration ? `Reg. ${formatRegistration(specs.firstRegistration)}` : "New"}
            />
            <Spec label="Mileage" value={formatKm(specs.mileageKm)} />
            {specs.powerKw !== undefined && <Spec label="Power" value={formatPower(specs.powerKw)} />}
            <Spec label="Fuel and gearbox" value={formatDrivetrain(specs)} />
          </dl>
          <KeySpecLedger specs={listing.keySpecs} defs={specDefs} modelId={listing.modelId} />
          {(total > 0 || unchecked > 0) && (
            <p className="flex justify-between gap-2 text-xs tabular-nums">
              <span className="font-semibold">{total > 0 && `${met} of ${total} met`}</span>
              <span className="text-muted-foreground">{unchecked > 0 && `${unchecked} to check`}</span>
            </p>
          )}
          {dealBreakers.length > 0 && (
            <p className="flex items-center gap-1 text-xs font-semibold text-destructive">
              <Ban className="size-3.5 shrink-0" aria-hidden />
              Deal-breaker: {dealBreakers.map((d) => dealBreakerLabel(d, listing.keySpecs)).join(", ")}
            </p>
          )}
          {/* Two fixed lines, so footers line up across a lane. The place wraps rather than
              truncates: it is what the distance is measured to. */}
          <div className="space-y-0.5 text-xs text-muted-foreground">
            <p>
              {listing.location}
              {distance && <span className="text-foreground"> · {distance} away</span>}
            </p>
            <p>Added {formatAge(listing.firstSeenAt)}</p>
          </div>
        </CardContent>
      </Card>
    </>
  );
  // Cards grow on wide screens so photos use the lane, within a readable range.
  const frame = "block w-[clamp(16rem,22vw,22.5rem)] shrink-0 rounded-lg";
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
    <div className="min-w-0">
      <dt className="sr-only">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}
