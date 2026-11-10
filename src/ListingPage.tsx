import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Columns3, House, Languages, ScanSearch, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import {
  formatDate,
  formatDateTime,
  formatDistance,
  formatDrivetrain,
  formatKm,
  formatPower,
  formatPrice,
  formatRegistration,
  type Tier,
  tiers,
} from "./format";
import { toCheck } from "../shared/fit";
import type { Point } from "../shared/geo";
import { CheckMode } from "./CheckMode";
import { FitList } from "./Fit";
import { Gallery } from "./Gallery";
import { fitView, mapboxToken, staticMapUrl } from "./mapbox";
import { homeClass, notchClass, pinClass, pinFor } from "./pins";
import { PriceChart } from "./PriceChart";
import { SpecEditor } from "./SpecEditor";
import { TierSlab } from "./TierSlab";
import { YourTake } from "./YourTake";

export function ListingPage({ listingId }: { listingId: string }) {
  const listing = useQuery(api.board.listing, { listingId });
  // Model and key-spec definitions live on the board; this shares the board's subscription.
  const board = useQuery(api.board.get);
  const move = useMutation(api.board.move);
  const [checking, setChecking] = useState(false);

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
  const removed = listing.status === "removed";
  // Price history arrives oldest first; the change is measured from the first price seen.
  const prices = listing.history.flatMap((entry) => (entry.price ? [{ ...entry.price, at: entry.capturedAt }] : []));
  const change = prices.length > 1 ? price.amount - prices[0].amount : 0;
  // A failed re-check leaves the data as it was; say so until a later check succeeds.
  const failed = listing.lastFailedCheckAt !== undefined && listing.lastFailedCheckAt > listing.lastCheckedAt;
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

  const unchecked = toCheck(listing.keySpecs);
  const model = board?.models.find((m) => m.id === listing.modelId);
  const distance = formatDistance(board?.home, listing.geo);

  if (checking && board) {
    return (
      <main className="mx-auto max-w-[1600px] px-4 pb-16 sm:px-8">
        <BackLink />
        <CheckMode
          listingId={listing.listingId}
          title={listing.title}
          modelId={listing.modelId}
          keySpecs={listing.keySpecs}
          photos={listing.photos}
          removed={removed}
          board={board}
          onDone={() => setChecking(false)}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-16 sm:px-8">
      <BackLink />
      {/* Wide screens: photos with the key-spec editor under them (it is checked against
          them), and the car's details beside. Phones: one column in task order, with the
          columns dissolved (display: contents) so `order` can interleave them: photos,
          price and tier, key specs, listing details, then options and description. */}
      <div className="mt-4 flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-8">
        <Gallery photos={listing.photos} removed={removed} className="order-1" />
        {board && (
          <div className="order-3 min-w-0">
            <SpecEditor listingId={listing.listingId} modelId={listing.modelId} keySpecs={listing.keySpecs} board={board} />
          </div>
        )}
        <div className="order-3 min-w-0">
          <YourTake listingId={listing.listingId} notes={listing.notes} pros={listing.pros} cons={listing.cons} />
        </div>
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
                {/* How far is a buy-or-skip fact, so it sits with the price (details in Location). */}
                {distance && (
                  <p className="text-sm text-muted-foreground">
                    {seller.location} · <span className="text-foreground">{distance} away</span>
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
                if (tier) void move({ listingId: listing.listingId, tier, rank: Date.now() });
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
          {/* The cue that something still needs a look; opens the photo-side checker. */}
          {board && unchecked > 0 && (
            <Button variant="outline" onClick={() => setChecking(true)}>
              <ScanSearch data-icon="inline-start" aria-hidden />
              Check {unchecked === 1 ? "1 key spec" : `${unchecked} key specs`}
            </Button>
          )}
          {board && (
            <section aria-labelledby="fit">
              <h2 id="fit" className="font-semibold">
                How it fits
              </h2>
              <Separator className="my-3" />
              <FitList
                car={{ price, firstRegistration: details.firstRegistration, mileageKm: details.mileageKm }}
                criteria={model}
                specDefs={board.keySpecs}
                keySpecs={listing.keySpecs}
                modelId={listing.modelId}
              />
            </section>
          )}
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

          <div className="flex flex-wrap gap-2">
            <a href={listing.url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
              Open the listing
            </a>
            <Link to="/compare" search={{ ids: listing.listingId }} className={buttonVariants({ variant: "outline" })}>
              <Columns3 data-icon="inline-start" aria-hidden />
              Compare with others
            </Link>
            <RemoveCar listingId={listing.listingId} title={listing.title} />
          </div>

          {/* Pitlane's own measure, so it has its own section outside the listing's facts. */}
          {listing.geo && (
            <section aria-labelledby="location-heading">
              <h2 id="location-heading" className="font-semibold">
                Location
              </h2>
              <Separator className="my-3" />
              <p className="text-sm text-muted-foreground">
                {seller.location}
                {distance ? (
                  <span className="text-foreground"> · {distance} away</span>
                ) : (
                  <>
                    {seller.location && ". "}Set your home on the{" "}
                    <Link to="/map" className="text-foreground underline underline-offset-4">
                      map
                    </Link>{" "}
                    to see how far this car is.
                  </>
                )}
              </p>
              {mapboxToken && (
                <Link
                  to="/map"
                  search={{ car: listing.listingId }}
                  className="mt-1 inline-block text-sm underline underline-offset-4"
                >
                  Show on map
                </Link>
              )}
              {mapboxToken && (
                <SellerMap
                  token={mapboxToken}
                  listingId={listing.listingId}
                  geo={listing.geo}
                  home={board?.home ?? null}
                  tier={listing.tier}
                  live={!removed && listing.tier !== "rejected"}
                  location={seller.location}
                />
              )}
            </section>
          )}

          <section>
            <h2 className="font-semibold">Price history</h2>
            <Separator className="my-3" />
            {prices.length > 1 && (
              <PriceChart
                points={prices}
                currency={price.currency}
                until={(removed && listing.removedAt) || listing.lastCheckedAt}
              />
            )}
            <ol className="mt-3 space-y-1">
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
            {failed && (
              <p className="mt-1 text-sm text-muted-foreground">
                The last re-check, {formatDateTime(listing.lastFailedCheckAt!)}, could not read the ad
                {listing.failureReason && ` (${listing.failureReason})`}. It will be tried again.
              </p>
            )}
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
          <Description original={listing.description} translation={listing.descriptionTranslation} />
        )}
        </div>
        </div>
      </div>
    </main>
  );
}

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });

// Shows the English translation the capturing agent saved, with the seller's own words a click away.
function Description({ original, translation }: { original: string; translation?: { from: string; text: string } }) {
  const [showOriginal, setShowOriginal] = useState(false);
  const language = translation && languageNames.of(translation.from);
  const translated = translation && !showOriginal;
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Seller's description</h2>
        {translation && (
          <Button variant="ghost" size="sm" className="-my-1" onClick={() => setShowOriginal(!showOriginal)}>
            <Languages data-icon="inline-start" aria-hidden />
            {showOriginal ? "Show English" : `Show original (${language})`}
          </Button>
        )}
      </div>
      <Separator className="my-3" />
      {translated && <p className="mb-2 text-xs text-muted-foreground">Translated from {language}</p>}
      <p
        lang={translated ? "en" : translation?.from}
        className="max-w-[70ch] text-sm leading-relaxed whitespace-pre-line"
      >
        {translated ? translation.text : original}
      </p>
    </section>
  );
}

// A static image, so the car page loads no map library, with the map page's own pins
// drawn on it. It opens the full map with this car's place picked.
function SellerMap({
  token,
  listingId,
  geo,
  home,
  tier,
  live,
  location,
}: {
  token: string;
  listingId: string;
  geo: Point;
  home: Point | null;
  tier: Tier;
  live: boolean;
  location: string | undefined;
}) {
  const [width, height] = [640, 320];
  // Generous padding: pins stand 14px above their place, as on the map page.
  const view = fitView(home ? [geo, home] : [geo], width, height, 64);
  const { letter, tone } = pinFor(tier, live);
  const pinAt = (point: Point) => {
    const { left, top } = view.at(point);
    return { left: `${left * 100}%`, top: `${top * 100}%`, transform: "translate(-50%, calc(-100% - 14px))" };
  };
  return (
    <Link
      to="/map"
      search={{ car: listingId }}
      className="relative mt-3 block overflow-hidden rounded-lg bg-muted outline-offset-2"
      aria-label={`Open the map${location ? ` at ${location}` : ""}`}
    >
      <picture>
        <source media="(prefers-color-scheme: dark)" srcSet={staticMapUrl(token, view, width, height, true)} />
        <img
          src={staticMapUrl(token, view, width, height, false)}
          alt=""
          width={width}
          height={height}
          loading="lazy"
          className="aspect-[2/1] w-full object-cover"
        />
      </picture>
      {home && (
        <span aria-hidden className="absolute" style={pinAt(home)}>
          <span className={cn(homeClass, "relative shadow-md")}>
            <House className="size-4" strokeWidth={2.5} />
            <span className={notchClass("home")} />
          </span>
        </span>
      )}
      <span aria-hidden className="absolute" style={pinAt(geo)}>
        <span className={cn(pinClass(letter !== null, tone), "relative shadow-md")}>
          {letter}
          <span className={notchClass(tone)} />
        </span>
      </span>
    </Link>
  );
}

// Removing is final: the car's notes, key specs and tier go with it.
function RemoveCar({ listingId, title }: { listingId: Id<"listings">; title: string }) {
  const remove = useMutation(api.board.remove);
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await remove({ listingId });
      await navigate({ to: "/", replace: true });
    } catch (caught) {
      setError(caught instanceof ConvexError ? String(caught.data.message) : "Removing failed. Try again.");
      setPending(false);
    }
  };

  return (
    <AlertDialog onOpenChange={() => setError(null)}>
      <AlertDialogTrigger render={<Button variant="ghost" className="text-muted-foreground" />}>
        <Trash2 data-icon="inline-start" aria-hidden />
        Remove from board
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this car?</AlertDialogTitle>
          <AlertDialogDescription>
            {title} comes off your board, and its tier, notes and key-spec values are deleted. Saving the listing
            again adds it back as a new car.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={() => void confirm()}>
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function BackLink() {
  return (
    <Link to="/" className={buttonVariants({ variant: "ghost", className: "-ml-2.5" })}>
      <ArrowLeft data-icon="inline-start" aria-hidden />
      Board
    </Link>
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
