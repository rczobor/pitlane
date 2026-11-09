import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import {
  formatDate,
  formatDateTime,
  formatDrivetrain,
  formatKm,
  formatPower,
  formatPrice,
  formatRegistration,
  tiers,
} from "./format";
import { NoPhoto } from "./ListingCard";
import { SpecEditor } from "./SpecEditor";
import { TierSlab } from "./TierSlab";
import { useBoardToken } from "./token";

export function ListingPage({ listingId }: { listingId: string }) {
  const token = useBoardToken();
  const listing = useQuery(api.board.listing, { token, listingId });
  // Model and key-spec definitions live on the board; this shares the board's subscription.
  const board = useQuery(api.board.get, { token });
  const move = useMutation(api.board.move);
  const [photoIndex, setPhotoIndex] = useState(0);

  if (listing === undefined) return <ListingSkeleton />;
  if (listing === null) {
    return (
      <main className="mx-auto max-w-[1600px] space-y-2 px-4 sm:px-8">
        <p>This car isn't on your board.</p>
        <BackLink />
      </main>
    );
  }

  const { details, price, seller } = listing;
  const photo = listing.photos[photoIndex];
  const removed = listing.status === "removed";
  // Price history arrives oldest first; the change is measured from the first price seen.
  const prices = listing.history.flatMap((entry) => (entry.price ? [entry.price] : []));
  const change = prices.length > 1 ? price.amount - prices[0].amount : 0;
  const history = listing.history.toReversed();
  const specs = [
    ["First registration", formatRegistration(details.firstRegistration)],
    ["Mileage", formatKm(details.mileageKm)],
    ["Power", details.powerKw === undefined ? undefined : `${details.powerKw} kW (${formatPower(details.powerKw)})`],
    ["Fuel and gearbox", formatDrivetrain(details)],
    ["Body", details.bodyType],
    ["Colour", details.color],
    ["Previous owners", details.previousOwners?.toString()],
  ].filter((row): row is [string, string] => row[1] !== undefined);

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-16 sm:px-8">
      <BackLink />
      {/* Wide screens: photos with the key-spec editor under them (it is checked against
          them), and the car's details beside. Phones: one column in task order, with the
          columns dissolved (display: contents) so `order` can interleave them: photos,
          price and tier, key specs, listing details, then options and description. */}
      <div className="mt-4 flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-8">
        <section aria-label="Photos" className="order-1">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
            {photo ? (
              <img
                src={photo.url}
                alt={`Photo ${photoIndex + 1} of ${listing.photos.length}`}
                className={cn("size-full object-cover", removed && "grayscale")}
              />
            ) : (
              <NoPhoto />
            )}
            {listing.photos.length > 1 && (
              <span className="absolute right-3 bottom-3 rounded-md bg-slab px-2 py-0.5 text-sm font-medium text-slab-foreground tabular-nums">
                {photoIndex + 1} / {listing.photos.length}
              </span>
            )}
          </div>
          {listing.photos.length > 1 && (
            // The fade at the end shows the strip scrolls when it holds more photos than fit.
            <div className="mt-2 flex gap-2 overflow-x-auto pb-2 [mask-image:linear-gradient(to_right,black_92%,transparent)]">
              {listing.photos.map((p, index) => (
                <button
                  key={p.sourceUrl}
                  type="button"
                  onClick={() => setPhotoIndex(index)}
                  aria-label={`Show photo ${index + 1}`}
                  aria-current={index === photoIndex}
                  className={cn(
                    "h-16 w-20 shrink-0 overflow-hidden rounded-md border-2",
                    index === photoIndex ? "border-foreground" : "border-transparent",
                  )}
                >
                  <img src={p.url} alt="" loading="lazy" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </section>
        {board && (
          <div className="order-3 min-w-0">
            <SpecEditor listingId={listing.listingId} modelId={listing.modelId} keySpecs={listing.keySpecs} board={board} />
          </div>
        )}
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-6">
        <section aria-label="Price and tier" className="order-2 min-w-0 space-y-6">
          <div className="space-y-3">
            {removed && listing.removedAt && <Badge>Ad removed {formatDate(listing.removedAt)}</Badge>}
            <h1 className="text-xl leading-snug font-semibold">{listing.title}</h1>
            <div className="flex items-stretch gap-4">
              <TierSlab tier={listing.tier} className="min-w-20" />
              <div className="space-y-1">
                {removed && <p className="text-sm text-muted-foreground">Last price</p>}
                <p className="condensed text-5xl leading-none font-bold">{formatPrice(price)}</p>
                {change !== 0 && (
                  <p className="text-sm font-medium">
                    {change < 0 ? "Down" : "Up"} {formatPrice({ ...price, amount: Math.abs(change) })} (
                    {Math.abs((change / prices[0].amount) * 100).toFixed(1)}%) since first seen
                  </p>
                )}
                {price.vatDeductible && (
                  <p className="text-sm text-muted-foreground">
                    VAT reclaimable
                    {price.netAmount !== undefined && `, ${formatPrice({ ...price, amount: price.netAmount })} net`}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div>
            <h2 id="tier-label" className="font-semibold">
              Tier
            </h2>
            <Separator className="my-3" />
            <ToggleGroup
              aria-labelledby="tier-label"
              variant="outline"
              value={[listing.tier]}
              onValueChange={(value) => {
                const tier = tiers.find((t) => t.tier === value[0])?.tier;
                if (tier) void move({ token, listingId: listing.listingId, tier, rank: Date.now() });
              }}
              className="flex-wrap"
            >
              {tiers.map(({ tier, label }) => (
                <ToggleGroupItem
                  key={tier}
                  value={tier}
                  // The slab beside the price carries the colour; the control only marks the choice.
                  className="condensed text-lg font-bold data-pressed:bg-foreground data-pressed:text-background"
                >
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </section>

        <section aria-labelledby="listing-details" className="order-4 min-w-0 space-y-6">
          <div>
            {/* As the listing states them; key specs above are where the user's own values live. */}
            <h2 id="listing-details" className="font-semibold">
              Listing details
            </h2>
            <Separator className="my-3" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
            {specs.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
            <dt className="text-muted-foreground">Seller</dt>
            <dd>
              {[seller.name, seller.location].filter(Boolean).join(", ")}
              <span className="text-muted-foreground"> ({seller.type === "dealer" ? "dealer" : "private seller"})</span>
            </dd>
          </dl>
          </div>

          <Button variant="outline" nativeButton={false} render={<a href={listing.url} target="_blank" rel="noreferrer" />}>
            Open on mobile.de
          </Button>

          <section>
            <h2 className="font-semibold">Price history</h2>
            <Separator className="my-3" />
            <ol className="space-y-1">
                {history.map((entry, index) => (
                  <li key={entry.capturedAt} className="flex gap-4 tabular-nums">
                    <span className="w-40 text-muted-foreground">{formatDateTime(entry.capturedAt)}</span>
                    <span className={cn(index === 0 && "font-semibold")}>
                      {entry.price ? formatPrice(entry.price) : "Ad removed"}
                    </span>
                    <span className="text-muted-foreground">
                      {index === 0 && !removed ? "Now" : index === history.length - 1 ? "First seen" : ""}
                    </span>
                  </li>
                ))}
            </ol>
            <p className="mt-3 text-sm text-muted-foreground">
              Added {formatDate(listing.firstSeenAt)}, last checked {formatDateTime(listing.lastCheckedAt)}.
            </p>
          </section>
        </section>
        <div className="order-5 min-w-0 space-y-10 lg:mt-4">
        {details.options.length > 0 && (
          <section>
            <h2 className="font-semibold">Options</h2>
            <Separator className="my-3" />
            <ul className="columns-2 gap-6 text-sm sm:columns-3 lg:columns-2">
              {details.options.map((option) => (
                <li key={option} className="break-inside-avoid py-0.5">
                  {option}
                </li>
              ))}
            </ul>
          </section>
        )}

        {listing.description && (
          <section>
            <h2 className="font-semibold">Seller's description</h2>
            <Separator className="my-3" />
            <p className="max-w-[70ch] text-sm leading-relaxed whitespace-pre-line">{listing.description}</p>
          </section>
        )}
        </div>
        </div>
      </div>
    </main>
  );
}

function BackLink() {
  return (
    <Button variant="ghost" className="-ml-2.5" nativeButton={false} render={<Link to="/" />}>
      <ArrowLeft data-icon="inline-start" aria-hidden />
      Board
    </Button>
  );
}

function ListingSkeleton() {
  return (
    <main className="mx-auto grid max-w-[1600px] gap-8 px-4 pt-12 sm:px-8 lg:grid-cols-[3fr_2fr]" aria-busy="true">
      <Skeleton className="aspect-[4/3] rounded-xl" />
      <div className="space-y-4">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-48" />
      </div>
    </main>
  );
}
