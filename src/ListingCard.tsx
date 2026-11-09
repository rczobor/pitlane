import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  type BoardListing,
  formatAge,
  formatDrivetrain,
  formatKm,
  formatPower,
  formatPrice,
  formatRegistration,
} from "./format";

export function ListingCard({ listing, lifted = false }: { listing: BoardListing; lifted?: boolean }) {
  const { specs } = listing;
  const removed = listing.status === "removed";
  return (
    <Link
      to="/listings/$listingId"
      params={{ listingId: listing.listingId }}
      draggable={false}
      className="block w-64 shrink-0 rounded-xl"
    >
      <Card size="sm" className={cn("h-full pt-0", lifted && "rotate-1 shadow-xl")}>
        <div className="relative aspect-[4/3] bg-muted">
          {listing.coverUrl && (
            <img
              src={listing.coverUrl}
              alt=""
              draggable={false}
              loading="lazy"
              className={cn("size-full object-cover", removed && "grayscale")}
            />
          )}
          {removed && <Badge className="absolute top-2 left-2">Ad removed</Badge>}
        </div>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <span className={cn("condensed text-3xl leading-none font-bold", removed && "line-through")}>
              {formatPrice(listing.price)}
            </span>
            {listing.price.vatDeductible && <Badge variant="secondary">VAT reclaimable</Badge>}
          </div>
          <h3 className="line-clamp-2 min-h-[2.5em] leading-tight font-medium">{listing.title}</h3>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            <Spec label="First registration" value={formatRegistration(specs.firstRegistration)} />
            <Spec label="Mileage" value={formatKm(specs.mileageKm)} />
            {specs.powerKw !== undefined && <Spec label="Power" value={formatPower(specs.powerKw)} />}
            <Spec label="Fuel and gearbox" value={formatDrivetrain(specs)} />
          </dl>
        </CardContent>
        <CardFooter className="mt-auto justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">{listing.location}</span>
          <span className="shrink-0">Added {formatAge(listing.firstSeenAt)}</span>
        </CardFooter>
      </Card>
    </Link>
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
