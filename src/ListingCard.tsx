import { Link } from "@tanstack/react-router";
import { Ban, ImageOff } from "lucide-react";
import { type ReactNode, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { type Criteria, evaluate } from "../shared/fit";
import type { Point } from "../shared/geo";
import { InkMark, KeySpecLedger } from "./KeySpecLedger";
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
  /** In the check view: how many key specs are still from the listing or unknown. */
  toConfirm?: number;
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
  sm: { box: "gap-1.5 pt-1.25 pr-2.25 pb-1 pl-2", price: "text-[1.3125rem]", change: "h-4 text-[0.6875rem]" },
  md: { box: "gap-2 pt-1.75 pr-2.75 pb-1.5 pl-2.5", price: "text-[1.6875rem]", change: "h-4.5 text-xs" },
  xl: {
    box: "gap-3 pt-2 pr-3.5 pb-2 pl-3 lg:pt-2.5 lg:pr-4 lg:pb-2.25 lg:pl-3.5",
    price: "text-[2.5rem] lg:text-[3.25rem]",
    change: "h-5.5 px-1.5 text-sm lg:h-6 lg:text-[0.9375rem]",
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
        <PriceChange
          change={change}
          price={listing.firstPrice}
          amount={size !== "sm"}
          className={cn("self-center bg-plate-foreground text-plate", sizes.change)}
        />
      )}
    </p>
  );
}

/** How far the price has moved since the car was first seen (0 across currencies). */
export const priceChange = (listing: Pick<BoardListing, "price" | "firstPrice">) =>
  listing.price.currency === listing.firstPrice.currency ? listing.price.amount - listing.firstPrice.amount : 0;

/**
 * A price change, the same token everywhere a price shows one: an ink chip (inverted fill;
 * colour only marks change) with an arrow, the amount where there is room, and the
 * percentage. The caller sizes it, and says "since first seen" where it says when.
 */
export function PriceChange({
  change,
  price,
  amount = true,
  className,
}: {
  change: number;
  /** The first price, which the percentage is of. */
  price: { amount: number; currency: string };
  /** Whether to show the amount; without it, only screen readers hear it. */
  amount?: boolean;
  className?: string;
}) {
  const money = formatPrice({ ...price, amount: Math.abs(change) });
  const percent = `${((Math.abs(change) / price.amount) * 100).toFixed(1)}%`;
  return (
    <span
      className={cn(
        "condensed inline-flex shrink-0 items-center gap-1 rounded-[3px] bg-slab px-1 leading-none font-bold whitespace-nowrap text-slab-foreground tabular-nums",
        className,
      )}
    >
      <svg aria-hidden viewBox="0 0 8 8" className={cn("size-[0.6em]", change > 0 && "rotate-180")}>
        <path d="M0 1.5h8L4 7z" fill="currentColor" />
      </svg>
      <span className="sr-only">{change < 0 ? "Down" : "Up"} </span>
      {amount ? (
        <>
          {money} · {percent}
        </>
      ) : (
        <>
          <span className="sr-only">{money} (</span>
          {percent}
          <span className="sr-only">)</span>
        </>
      )}
    </span>
  );
}

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
  toConfirm,
  lot,
  variant = "lot",
  lifted = false,
  preview = false,
  showTier = false,
  subgrid = false,
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
  /** A lot or compact card whose parent spans two rows of the catalogue's grid as a subgrid. */
  subgrid?: boolean;
}) {
  const { specs } = listing;
  const { dealBreakers, checks } = evaluate(
    { price: listing.price, firstRegistration: specs.firstRegistration, mileageKm: specs.mileageKm },
    criteria,
    specDefs,
    listing.keySpecs,
    listing.modelId,
  );
  const outside = (kind: Limit) => checks.some((c) => c.kind === kind && c.status === "missed");
  const lotLine = <LotLine lot={lot} model={modelName} large={variant === "feature"} />;
  // In the check view: closes the year · km · hp line, so the lot line stays one line. An index
  // row says it under its price instead.
  const confirmCount = toConfirm !== undefined && (
    <span className={cn("ml-auto shrink-0 self-center pl-2 font-semibold whitespace-nowrap", variant === "feature" ? "text-sm" : "text-xs")}>
      {toConfirm} to confirm
    </span>
  );
  const badges = <Badges listing={listing} home={home} />;
  const ledger = (
    <div className="space-y-2">
      <KeySpecLedger specs={listing.keySpecs} defs={specDefs} modelId={listing.modelId} size={variant === "feature" ? "lg" : "md"} />
      {dealBreakers.length > 0 && (
        <p className="flex items-center gap-1 text-xs font-semibold">
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
      <div className="grid h-full overflow-hidden rounded-sm bg-card lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Photo listing={listing} className="aspect-[4/3] sm:aspect-[3/2]">
          <PricePlate listing={listing} size="xl" />
        </Photo>
        <div className="flex min-w-0 flex-col gap-4 p-4 sm:px-7 sm:py-6 lg:pb-7">
          {lotLine}
          <h3 className="text-base leading-snug">{listing.title}</h3>
          <div className="flex flex-wrap items-end gap-y-2">
            <dl className="flex flex-wrap gap-x-7 gap-y-2">
              <Figure label="Year" value={formatRegistrationYear(specs.firstRegistration)} mark={outside("year") && "year"} />
              <Figure label="Mileage" value={formatKm(specs.mileageKm)} mark={outside("mileage") && "mileage"} />
              {specs.powerKw !== undefined && <Figure label="Power" value={formatPower(specs.powerKw)} />}
            </dl>
            {confirmCount}
          </div>
          {badges}
          {/* Pinned to the foot, on the price plate's line, so the panel has no dead band. */}
          <div className="mt-auto">{ledger}</div>
        </div>
      </div>
    );
  } else if (variant === "index") {
    card = (
      // Index rows have no ledger: rejected cars are decided, and their specs are a click away.
      <div className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 py-2 lg:grid-cols-[6.5rem_13rem_minmax(0,1fr)_auto_7rem] lg:gap-x-5">
        <Photo listing={listing} small className="row-span-2 aspect-[4/3] w-24 rounded-xs lg:row-span-1 lg:w-26" />
        {lotLine}
        <h3 className="sr-only text-[0.8125rem] lg:not-sr-only lg:truncate">{listing.title}</h3>
        <div className="col-span-2 col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 lg:col-span-1 lg:col-start-auto">
          <Stats specs={specs} outside={outside} className="text-sm" />
          {badges}
        </div>
        <p className="col-start-3 row-start-1 text-right lg:col-start-auto lg:row-start-auto">
          {listing.status === "removed" && <span className="mr-1.5 text-xs text-muted-foreground">Last price</span>}
          <span className="condensed text-[1.3125rem] leading-none font-extrabold tabular-nums lg:text-2xl">
            {formatPrice(listing.price)}
          </span>
          {toConfirm !== undefined && (
            <span className="mt-1 block text-xs font-semibold whitespace-nowrap">{toConfirm} to confirm</span>
          )}
        </p>
      </div>
    );
  } else {
    const compact = variant === "compact";
    card = (
      // A lot is two rows: everything down to the stats, then the ledger. In the catalogue they
      // are its row's tracks (a subgrid), so every ledger in a row starts at one height;
      // elsewhere the ledger is pinned to the foot, so lots that end together align.
      <div className={cn("min-w-0 rounded-sm bg-card", subgrid ? "row-span-2 grid grid-rows-subgrid" : "flex h-full flex-col")}>
        <div className="flex flex-col">
          <Photo listing={listing} className={cn("rounded-t-sm", compact ? "aspect-[4/3]" : "aspect-[3/2]")}>
            <PricePlate listing={listing} size={compact ? "sm" : "md"} />
          </Photo>
          {tierSlab}
          <div className={cn("flex flex-col", compact ? "gap-1.5 px-2.5 pt-2.5" : "gap-2 px-3.5 pt-3")}>
            {lotLine}
            <h3 className={cn("line-clamp-2 leading-snug", compact ? "text-xs" : "text-[0.8125rem]")}>{listing.title}</h3>
            {/* The badges follow the stats, and wrap under them from the left. */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <Stats specs={specs} outside={outside} className={compact ? "text-[0.8125rem]" : "text-[0.9375rem]"} />
              {badges}
              {confirmCount}
            </div>
          </div>
        </div>
        <div className={cn(compact ? "px-2.5 pt-1.5 pb-2.5" : "px-3.5 pt-2 pb-3.5", !subgrid && "mt-auto")}>{ledger}</div>
      </div>
    );
  }

  const frame = cn(
    subgrid ? "row-span-2 grid grid-rows-subgrid" : "block h-full",
    "w-(--board-card) shrink-0 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
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
    <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
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

function Figure({ label, value, mark = false }: { label: string; value: string; mark?: Limit | false }) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-bold tracking-[0.07em] text-muted-foreground uppercase">{label}</dt>
      <dd className="condensed text-[1.6875rem] leading-tight font-bold tabular-nums sm:text-[2rem]">
        {value}
        {mark && <InkMark mark={mark} className="ml-1.5 align-middle" />}
      </dd>
    </div>
  );
}

type Limit = "year" | "mileage";

// Year, mileage and power stay at glance level, above the key specs. The values explain
// themselves; the labels are there for screen readers.
function Stats({
  specs,
  outside,
  className,
}: {
  specs: BoardListing["specs"];
  /** Whether the value is outside the model's limits. */
  outside: (limit: Limit) => boolean;
  className?: string;
}) {
  const values = [
    { label: "First registration", value: formatRegistrationYear(specs.firstRegistration), mark: outside("year") && "year" },
    { label: "Mileage", value: formatKm(specs.mileageKm), mark: outside("mileage") && "mileage" },
    ...(specs.powerKw !== undefined ? [{ label: "Power", value: formatPower(specs.powerKw), mark: false as const }] : []),
  ] satisfies { label: string; value: string; mark: Limit | false }[];
  return (
    <dl className={cn("flex flex-wrap items-baseline gap-x-1.5 font-semibold whitespace-nowrap tabular-nums", className)}>
      {values.map(({ label, value, mark }, index) => (
        <div key={label} className="flex items-baseline gap-x-1.5">
          {index > 0 && (
            <span aria-hidden className="font-normal text-muted-foreground">
              ·
            </span>
          )}
          <dt className="sr-only">{label}</dt>
          <dd>
            {value}
            {mark && <InkMark mark={mark} className="ml-1 -translate-y-px align-middle" />}
          </dd>
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
