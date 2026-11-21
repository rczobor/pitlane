import { useMutation } from "convex/react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { type BoardData, formatDate, formatKm, formatPower, formatPrice, formatRegistration, type Tier, tiers } from "./format";
import { PriceChange } from "./ListingCard";
import { ModelControl } from "./SpecEditor";
import { slabColor, tierName } from "./TierSlab";

type Car = NonNullable<FunctionReturnType<typeof api.board.listing>>;

const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
};

const shortDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// Halfway between two neighbours' ranks; past either end, one step beyond it.
function rankBetween(before: number | undefined, after: number | undefined) {
  if (before !== undefined && after !== undefined) return (before + after) / 2;
  if (before !== undefined) return before + 1;
  if (after !== undefined) return after - 1;
  return Date.now();
}

// Moves the car on the board locally at once; Convex replaces this with the server's answer.
function useMove() {
  return useMutation(api.board.move).withOptimisticUpdate((store, { listingId, tier, rank }) => {
    const board = store.getQuery(api.board.get, {});
    if (!board) return;
    store.setQuery(
      api.board.get,
      {},
      { ...board, listings: board.listings.map((l) => (l.listingId === listingId ? { ...l, tier, rank } : l)) },
    );
  });
}

// The "driver detail" of a timing screen: the car's title, its tier slab beside the model
// and price, and the tier control with its place in the tier. The facts that decide a trip
// (price change, VAT, distance) sit under the price.
export function CarDriver({ car, board, distance }: { car: Car; board: BoardData | null | undefined; distance: string | null }) {
  const move = useMove();
  const removed = car.status === "removed";
  const { price } = car;
  const prices = car.history.flatMap((entry) => (entry.price ? [{ ...entry.price, at: entry.capturedAt }] : []));
  const change = prices.length > 1 ? price.amount - prices[0].amount : 0;

  // The car's place among the tier's cars on the board, which hides removed ads.
  const lane = (board?.listings ?? [])
    .filter((l) => l.tier === car.tier && l.status !== "removed")
    .toSorted((a, b) => a.rank - b.rank);
  const place = lane.findIndex((l) => l.listingId === car.listingId);
  const step = (by: -1 | 1) => {
    const [before, after] = by < 0 ? [lane[place - 2], lane[place - 1]] : [lane[place + 1], lane[place + 2]];
    void move({ listingId: car.listingId, tier: car.tier, rank: rankBetween(before?.rank, after?.rank) });
  };
  const label = tierName(car.tier);

  return (
    <section aria-label="Price and tier" className="min-w-0">
      {/* With photos, the band across the photo says it. */}
      {removed && car.removedAt && car.photos.length === 0 && (
        <Badge className="mb-2">Ad removed {formatDate(car.removedAt)}</Badge>
      )}
      <h1 className="mb-3.5 text-[1.0625rem] leading-snug font-semibold sm:text-[1.1875rem]">{car.title}</h1>
      <div className="flex items-stretch gap-4">
        <div
          className={cn(
            "condensed flex w-21 shrink-0 flex-col justify-between rounded-md px-3 pt-2.5 pb-2 sm:w-27",
            car.tier === "rejected" ? "bg-muted text-foreground" : slabColor(car.tier),
          )}
        >
          <span
            className={cn(
              "leading-[0.74] font-extrabold",
              label.length === 1 ? "text-[4.375rem] sm:text-[5.75rem]" : "text-xl leading-none sm:text-2xl",
            )}
          >
            {label}
          </span>
          {place >= 0 && (
            <span className="mt-2 text-xs font-bold sm:text-[0.8125rem]">
              {ordinal(place + 1)} of {lane.length}
            </span>
          )}
        </div>
        <div className="min-w-0 space-y-1">
          {board && <ModelControl listingId={car.listingId} modelId={car.modelId} board={board} />}
          {removed && <p className="text-sm text-muted-foreground">Last price</p>}
          <p className="condensed text-[2.75rem] leading-[0.95] font-bold tracking-tight tabular-nums sm:text-[3.625rem]">
            {formatPrice(price)}
          </p>
          {change !== 0 && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-sm">
              <PriceChange change={change} price={prices[0]} className="h-6 px-1.5 text-[0.9375rem]" />
              <span>since first seen, {shortDate(prices[0].at)}</span>
            </p>
          )}
          {price.vatDeductible && (
            <p className="text-[0.8125rem] text-muted-foreground">
              VAT reclaimable
              {price.netAmount !== undefined && `, ${formatPrice({ ...price, amount: price.netAmount })} net`}
            </p>
          )}
          {/* How far is a buy-or-skip fact, so it sits with the price (details in Location). */}
          {distance && (
            <p className="text-[0.8125rem]">
              {car.seller.location} · <span className="font-semibold">{distance} away</span>
            </p>
          )}
        </div>
      </div>

      <ToggleGroup
        aria-label="Tier"
        variant="outline"
        value={[car.tier]}
        onValueChange={(value) => {
          const tier = tiers.find((t) => t.tier === value[0])?.tier;
          if (tier) void move({ listingId: car.listingId, tier, rank: Date.now() });
        }}
        // The slab beside the price carries the colour; the control only marks the choice.
        className="mt-4 grid w-full grid-cols-[1fr_1fr_1fr_2fr_2fr] gap-1.5"
      >
        {tiers.map(({ tier, label }) => (
          <ToggleGroupItem
            key={tier}
            value={tier}
            className={cn(
              "condensed h-12 w-full rounded-md bg-card font-extrabold sm:h-11.5",
              label.length === 1 ? "text-[1.625rem] sm:text-[1.75rem]" : "text-base sm:text-lg",
            )}
          >
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {place >= 0 && (
        <TierPosition tier={car.tier} place={place} count={lane.length} onStep={step} />
      )}
    </section>
  );
}

function TierPosition({
  tier,
  place,
  count,
  onStep,
}: {
  tier: Tier;
  place: number;
  count: number;
  onStep: (by: -1 | 1) => void;
}) {
  return (
    <div className="mt-2.5 flex items-center gap-1.5 text-[0.8125rem]">
      <span className="text-muted-foreground">Position in {tierName(tier)}</span>
      <span className="condensed text-xl leading-none font-extrabold tabular-nums">{place + 1}</span>
      <span className="text-muted-foreground">of {count}</span>
      <span className="ml-auto flex gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-sm:h-11"
          disabled={place === 0}
          aria-label={`Move up in ${tierName(tier)}`}
          onClick={() => onStep(-1)}
        >
          <ChevronUp data-icon="inline-start" aria-hidden />
          Up
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-sm:h-11"
          disabled={place === count - 1}
          aria-label={`Move down in ${tierName(tier)}`}
          onClick={() => onStep(1)}
        >
          <ChevronDown data-icon="inline-start" aria-hidden />
          Down
        </Button>
      </span>
    </div>
  );
}

// Registration, mileage and power as a three-cell readout, read at a glance like the
// board's year, mileage and power columns.
export function CarNumbers({ details }: { details: Car["details"] }) {
  const cells = [
    ["Registered", formatRegistration(details.firstRegistration)],
    ["Mileage", formatKm(details.mileageKm)],
    ["Power", details.powerKw === undefined ? "—" : formatPower(details.powerKw)],
  ];
  return (
    <dl aria-label="Registration, mileage and power" className="@container grid grid-cols-3 rounded-md bg-card">
      {cells.map(([label, value]) => (
        <div key={label} className="flex min-w-0 flex-col gap-0.5 border-l px-2.5 py-2.5 first:border-l-0 @md:px-3.5">
          <dt className="condensed text-xs font-bold tracking-wide text-muted-foreground uppercase">{label}</dt>
          <dd className="condensed text-[1.375rem] leading-none font-bold whitespace-nowrap tabular-nums @md:text-[1.75rem]">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
