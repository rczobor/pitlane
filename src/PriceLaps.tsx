// Relative, not "@/": the unit test loads this file without the app's path alias.
import { cn } from "./lib/utils";
import { formatDateTime, formatPrice } from "./format";
import { PriceChange } from "./PriceChange";

type Capture = { capturedAt: number; price?: { amount: number; currency: string } };

type Lap = {
  number: number;
  at: number;
  price?: { amount: number; currency: string };
  /** Change from the capture before it; undefined for the first capture or one without a price. */
  gap?: { amount: number; percent: number };
};

/**
 * The price history as a timing printout's lap history: one numbered lap per capture,
 * newest first, each with its change from the lap before (no bars: from zero they all look
 * equal, and from anywhere else they overstate a change).
 */
export function priceLaps(history: Capture[]): Lap[] {
  let previous: Capture["price"];
  const laps = history.map((capture, index): Lap => {
    const price = capture.price;
    // Amounts in different currencies don't compare, so a currency switch shows no gap.
    const gap =
      price && previous && price.currency === previous.currency
        ? { amount: price.amount - previous.amount, percent: ((price.amount - previous.amount) / previous.amount) * 100 }
        : undefined;
    if (price) previous = price;
    return {
      number: index + 1,
      at: capture.capturedAt,
      price: capture.price,
      gap,
    };
  });
  return laps.toReversed();
}

/** Captures arrive oldest first. */
export function PriceLaps({ history, removed }: { history: Capture[]; removed: boolean }) {
  const laps = priceLaps(history);
  return (
    // Sized by its column, not the screen: theatre mode narrows the column on wide screens.
    <ol className="@container mb-3">
      {laps.map((lap, index) => {
        const now = index === 0 && !removed;
        const first = index === laps.length - 1;
        return (
          <li
            key={lap.at}
            className={cn(
              "grid items-center gap-x-2.5 gap-y-1 border-t py-2 text-sm first:border-t-0",
              // Narrow: number, date, price over its change. Wider: one line per lap.
              "grid-cols-[1rem_1fr_auto] [grid-template-areas:'n_d_p''n_._g']",
              "@md:grid-cols-[1.125rem_minmax(0,1fr)_auto_7rem_2.25rem] @md:[grid-template-areas:'n_d_p_g_t']",
            )}
          >
            <span
              className={cn(
                "condensed self-start text-[0.9375rem] font-extrabold [grid-area:n] @md:self-center",
                !now && "text-muted-foreground",
              )}
            >
              <span className="sr-only">Capture </span>
              {lap.number}
            </span>
            <span className={cn("text-[0.8125rem] whitespace-nowrap [grid-area:d]", !now && "text-muted-foreground")}>
              {formatDateTime(lap.at)}
              {now && <span className="font-semibold @md:hidden"> · Now</span>}
            </span>
            <span className="condensed text-right text-xl leading-none font-bold tabular-nums [grid-area:p]">
              {lap.price ? formatPrice(lap.price) : "Ad removed"}
            </span>
            <span className="text-right text-xs whitespace-nowrap tabular-nums [grid-area:g] @md:text-left @md:text-[0.8125rem]">
              {lap.gap && lap.price ? (
                lap.gap.amount === 0 ? (
                  <span className="text-muted-foreground">Same price</span>
                ) : (
                  <PriceChange
                    change={lap.gap.amount}
                    price={{ amount: lap.price.amount - lap.gap.amount, currency: lap.price.currency }}
                    quiet
                  />
                )
              ) : (
                first && <span className="text-muted-foreground">First seen</span>
              )}
            </span>
            <span className="hidden font-semibold [grid-area:t] @md:block">{now && "Now"}</span>
          </li>
        );
      })}
    </ol>
  );
}
