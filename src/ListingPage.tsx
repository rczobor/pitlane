import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, Columns3, Flag, Languages, ScanSearch, Trash2, Undo2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { lazy, type ReactNode, Suspense, useId, useState } from "react";
import { api } from "../convex/_generated/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDateTime, formatDistance, formatDrivetrain, formatKm, formatPower, formatRegistration } from "./format";
import { toCheck } from "../shared/fit";
import { lastBoardSearch } from "./Board";
import { CarDriver, CarNumbers } from "./CarDriver";
import { CheckMode } from "./CheckMode";
import { FitSection } from "./Fit";
import { Gallery, galleryColumns, useTheatre } from "./Gallery";
import { mapboxToken } from "./mapbox";
import { PriceLaps } from "./PriceLaps";
import { type CarExit, RemoveCarDialog } from "./RemoveCar";
import { SpecReadout } from "./SpecEditor";
import { YourTake } from "./YourTake";

const SellerMap = lazy(() => import("./SellerMap"));

export function ListingPage({ listingId }: { listingId: string }) {
  const listing = useQuery(api.board.listing, { listingId });
  // Model and key-spec definitions live on the board; this shares the board's subscription.
  const board = useQuery(api.board.get);
  const putBack = useMutation(api.board.putBack);
  const [putBackFailed, setPutBackFailed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [theatre, toggleTheatre] = useTheatre();
  // Set while removing: the listing query turns null before the navigation to the board lands.
  const [leaving, setLeaving] = useState(false);
  // The kind stays set while the dialog animates closed, so its text does not switch.
  const [exitKind, setExitKind] = useState<CarExit>("remove");
  const [exitOpen, setExitOpen] = useState(false);
  const navigate = useNavigate();

  if (listing === undefined) return <ListingSkeleton />;
  if (listing === null && leaving) return null;
  if (listing === null) {
    return (
      <main className="max-w-[1600px] space-y-2 px-4 sm:px-8">
        <p>This car isn't on your board.</p>
        <BackLink />
      </main>
    );
  }

  const { details, seller } = listing;
  const removed = listing.status === "removed";
  // A failed re-check leaves the data as it was; say so until a later check succeeds.
  const failed = listing.lastFailedCheckAt !== undefined && listing.lastFailedCheckAt > listing.lastCheckedAt;
  const specs = [
    ["First registration", formatRegistration(details.firstRegistration)],
    ["Mileage", formatKm(details.mileageKm)],
    ["Power", details.powerKw === undefined ? undefined : `${details.powerKw} kW (${formatPower(details.powerKw)})`],
    ["Gearbox", formatDrivetrain(details)],
    ["Body", details.bodyType],
    ["Colour", details.color],
    ["Previous owners", details.previousOwners?.toString()],
  ].filter((row): row is [string, string] => row[1] !== undefined);

  const unchecked = toCheck(listing.keySpecs);
  const model = board?.models.find((m) => m.id === listing.modelId);
  const distance = formatDistance(board?.home, listing.geo);

  if (checking && board) {
    return (
      <main className="max-w-[1600px] px-4 pb-16 sm:px-8">
        <BackLink />
        <CheckMode
          listingId={listing.listingId}
          title={listing.title}
          modelId={listing.modelId}
          keySpecs={listing.keySpecs}
          photos={listing.photos}
          removed={removed}
          removedAt={listing.removedAt}
          board={board}
          onDone={() => setChecking(false)}
          theatre={theatre}
          onTheatreToggle={toggleTheatre}
        />
      </main>
    );
  }

  // The way off the board comes last at every width: it is rare, and one of its actions
  // deletes the user's take on the car. A removed ad has nothing else left to decide (put
  // back or delete), so there it follows the price and tier.
  const offBoard = (
    <Section title="Off the board" id="off-board" className="order-12 lg:order-none">
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-[11rem_1fr] sm:items-start">
        {removed && board?.canMarkRemoved && (
          <ExitRow
            icon={<Undo2 data-icon="inline-start" aria-hidden />}
            label="Put back on board"
            hint="If the ad is still up: shows it on the board again, and re-checks resume."
            error={putBackFailed ? "Putting it back failed. Try again." : undefined}
            onClick={() => {
              setPutBackFailed(false);
              putBack({ listingId: listing.listingId }).catch(() => setPutBackFailed(true));
            }}
          />
        )}
        {!removed && board?.canMarkRemoved && (
          <ExitRow
            icon={<Flag data-icon="inline-start" aria-hidden />}
            label="Mark ad as removed"
            hint="Sold or withdrawn. Keeps everything: tier, notes, key specs, price history and photos. Hidden from the board; “Show removed” lists it."
            onClick={() => {
              setExitKind("markRemoved");
              setExitOpen(true);
            }}
          />
        )}
        <ExitRow
          icon={<Trash2 data-icon="inline-start" aria-hidden />}
          label="Delete from board"
          hint={
            removed
              ? "Deletes everything: tier, notes, key specs, price history and photos. The ad is gone, so this can't be undone."
              : "Deletes everything: tier, notes, key specs, price history and photos. Adding the listing again starts it over in Watching."
          }
          onClick={() => {
            setExitKind("remove");
            setExitOpen(true);
          }}
        />
      </div>
      <RemoveCarDialog
        kind={exitKind}
        car={listing}
        open={exitOpen}
        onOpenChange={setExitOpen}
        onLeaving={setLeaving}
        onRemoved={() =>
          exitKind === "remove" ? navigate({ to: "/", search: lastBoardSearch(), replace: true }) : undefined
        }
      />
    </Section>
  );

  return (
    <main className="max-w-[1600px] px-4 pb-16 sm:px-8">
      <BackLink />
      {/* Wide screens: photos with the key-spec readout under them (it is checked against
          them), and the car's "driver detail" beside. Phones: one column in task order, with
          the columns dissolved (display: contents) so `order` can interleave them: photos,
          price and tier, the numbers, key specs, how it fits, listing details, price
          history, options, description, your take, location, then off the board. On wide
          screens the orders reset and each column follows its source order. */}
      <div className={cn("mt-2 flex flex-col gap-7 lg:grid lg:items-start lg:gap-x-11", galleryColumns(theatre && listing.photos.length > 0))}>
        <div className="contents lg:flex lg:flex-col lg:gap-8">
          <Gallery
            photos={listing.photos}
            removed={removed}
            removedAt={listing.removedAt}
            theatre={theatre}
            onTheatreToggle={toggleTheatre}
            className="order-1 max-sm:-mx-4 lg:order-none"
          />
          {board && listing.keySpecs.length > 0 && (
            <Section
              title="Key specs"
              note={unchecked > 0 ? `${unchecked} to confirm` : undefined}
              aside={
                // The photo-side checker; wide screens only, as phones confirm here.
                unchecked > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setChecking(true)} className="-my-1 max-sm:hidden">
                    <ScanSearch data-icon="inline-start" aria-hidden />
                    Check {unchecked === 1 ? "1 key spec" : `${unchecked} key specs`}
                  </Button>
                )
              }
              className="order-4 lg:order-none"
            >
              <p className="mb-3 text-[0.8125rem] text-muted-foreground">
                In your priority order. Dashed values come from the listing: confirm them against the photos, or pick
                another.
              </p>
              <SpecReadout
                listingId={listing.listingId}
                modelId={listing.modelId}
                keySpecs={listing.keySpecs}
                board={board}
              />
            </Section>
          )}
          <div className="order-10 min-w-0 lg:order-none">
            <YourTake listingId={listing.listingId} notes={listing.notes} pros={listing.pros} cons={listing.cons} />
          </div>
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-7">
          <div className="order-2 min-w-0 lg:order-none">
            <CarDriver car={listing} board={board} distance={distance} />
          </div>
          <div className="order-3 min-w-0 lg:order-none">
            <CarNumbers details={details} />
          </div>
          {removed && <div className="order-3 min-w-0 lg:order-none">{offBoard}</div>}
          {board && (
            <div className="order-5 min-w-0 lg:order-none">
              <FitSection
                car={{ price: listing.price, firstRegistration: details.firstRegistration, mileageKm: details.mileageKm }}
                criteria={model}
                specDefs={board.keySpecs}
                keySpecs={listing.keySpecs}
                modelId={listing.modelId}
              />
            </div>
          )}

          {/* As the listing states them; the key specs are where the user's own values live. */}
          <Section title="Listing details" id="listing-details" className="order-6 lg:order-none">
            <dl className="mb-3.5 grid grid-cols-[7.75rem_1fr] gap-x-3 gap-y-2 sm:grid-cols-[8.75rem_1fr]">
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
            <div className="flex flex-wrap gap-2">
              <a
                href={listing.url}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline", className: "max-sm:h-11" })}
              >
                Open the listing
                <ArrowUpRight data-icon="inline-end" aria-hidden />
              </a>
              <Link
                to="/compare"
                search={{ ids: listing.listingId }}
                className={buttonVariants({ variant: "outline", className: "max-sm:h-11" })}
              >
                <Columns3 data-icon="inline-start" aria-hidden />
                Compare with others
              </Link>
            </div>
          </Section>

          <Section
            title="Price history"
            note={listing.history.length === 1 ? "1 capture" : `${listing.history.length} captures`}
            className="order-7 lg:order-none"
          >
            <PriceLaps history={listing.history} removed={removed} />
            <p className="text-[0.8125rem] text-muted-foreground">
              {listing.history.length > 1 && "Shorter bar, lower price. "}
              Added {formatDateTime(listing.firstSeenAt)}; last checked {formatDateTime(listing.lastCheckedAt)}. A
              re-check that finds no change adds no line.
            </p>
            {failed && (
              <p className="mt-1 text-[0.8125rem] text-muted-foreground">
                The last re-check, {formatDateTime(listing.lastFailedCheckAt!)}, could not read the ad
                {listing.failureReason && ` (${listing.failureReason})`}. It will be tried again.
              </p>
            )}
          </Section>

          {/* Pitlane's own measure, so it has its own section outside the listing's facts. */}
          {listing.geo && (
            <Section title="Location" id="location-heading" className="order-11 lg:order-none">
              <p className="text-sm">
                {seller.location}
                {distance ? (
                  <>
                    {" "}
                    · {distance} away
                    {board?.home && (
                      <span className="text-muted-foreground"> (straight line from home, {board.home.place})</span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    {seller.location && ". "}Set your home on the{" "}
                    <Link to="/map" className="text-foreground underline underline-offset-4">
                      map
                    </Link>{" "}
                    to see how far this car is.
                  </span>
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
                <Suspense fallback={<div className="mt-3 aspect-[2/1] rounded-lg bg-muted" />}>
                  <SellerMap
                    token={mapboxToken}
                    listingId={listing.listingId}
                    geo={listing.geo}
                    home={board?.home ?? null}
                    tier={listing.tier}
                    live={!removed && listing.tier !== "rejected"}
                    location={seller.location}
                  />
                </Suspense>
              )}
            </Section>
          )}

          {details.options.length > 0 && (
            <Section title="Options" className="order-8 lg:order-none">
              <ul className="gap-6 text-sm sm:columns-2">
                {details.options.map((option) => (
                  <li key={option} className="break-inside-avoid py-0.5">
                    {option}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {listing.description && (
            <div className="order-9 min-w-0 lg:order-none">
              <Description original={listing.description} translation={listing.descriptionTranslation} />
            </div>
          )}
          {!removed && offBoard}
        </div>
      </div>
    </main>
  );
}

// A car-page section: heading (with an optional muted note and an action at its end), a
// hairline, then the content. No section sits in its own card.
function Section({
  title,
  note,
  aside,
  id,
  className,
  children,
}: {
  title: string;
  note?: string;
  aside?: ReactNode;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={id ?? headingId} className={cn("min-w-0", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={id ?? headingId} className="font-semibold">
          {title}
          {note && <span className="font-normal text-muted-foreground"> · {note}</span>}
        </h2>
        {aside}
      </div>
      <Separator className="my-3" />
      {children}
    </section>
  );
}

// One way off the board: the button, and what it does beside it (under it on phones). The
// text's pt-1.5 sets its first line level with the button's label.
function ExitRow({
  icon,
  label,
  hint,
  error,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  error?: string;
  onClick: () => void;
}) {
  return (
    <div className="contents">
      <Button variant="outline" className="justify-self-start" onClick={onClick}>
        {icon}
        {label}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive max-sm:-mt-1 max-sm:mb-2 sm:pt-1.5">
          {error}
        </p>
      ) : (
        <p className="text-sm text-pretty text-muted-foreground max-sm:-mt-1 max-sm:mb-2 sm:pt-1.5">{hint}</p>
      )}
    </div>
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

function BackLink() {
  return (
    <Link to="/" search={lastBoardSearch()} className={buttonVariants({ variant: "ghost", className: "-ml-2.5" })}>
      <ArrowLeft data-icon="inline-start" aria-hidden />
      Board
    </Link>
  );
}

function ListingSkeleton() {
  return (
    <main className="grid max-w-[1600px] gap-8 px-4 pt-12 sm:px-8 lg:grid-cols-[3fr_2fr]" aria-busy="true">
      <Skeleton className="aspect-[4/3] rounded-xl" />
      <div className="space-y-4">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-48" />
      </div>
    </main>
  );
}
