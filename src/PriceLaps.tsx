// Relative, not "@/": the unit test loads this file without the app's path alias.
import { cn } from "./lib/utils";
import { formatDateTime, formatPrice } from "./format";

type Capture = { capturedAt: number; price?: { amount: number; currency: string } };

export type Lap = {
  number: number;
  at: number;
  price?: { amount: number; currency: string };
  /** Bar length in percent: shorter means cheaper. */
  bar?: number;
  /** Change from the capture before it; undefined for the first capture or one without a price. */
  gap?: { amount: number; percent: number };
};

/**
 * The price history as a timing printout's lap history: one numbered lap per capture,
 * newest first. Bars share a scale whose floor sits one price range below the lowest
 * price, so the cheapest lap still shows half a bar and the differences stay visible.
 */
export function priceLaps(history: Capture[]): Lap[] {
  const amounts = history.flatMap((c) => (c.price ? [c.price.amount] : []));
  const high = Math.max(...amounts);
  const low = Math.min(...amounts);
  const floor = low - (high - low);
  let previous: number | undefined;
  const laps = history.map((capture, index): Lap => {
    const amount = capture.price?.amount;
    const gap =
      amount !== undefined && previous !== undefined
        ? { amount: amount - previous, percent: ((amount - previous) / previous) * 100 }
        : undefined;
    if (amount !== undefined) previous = amount;
    return {
      number: index + 1,
      at: capture.capturedAt,
      price: capture.price,
      bar: amount === undefined ? undefined : high === floor ? 100 : ((amount - floor) / (high - floor)) * 100,
      gap,
    };
  });
  return laps.toReversed();
}

const signed = (amount: number, currency: string) =>
  `${amount < 0 ? "−" : "+"}${formatPrice({ amount: Math.abs(amount), currency })}`;

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
              // Narrow: number, date over bar, price over gap. Wider: one line per lap.
              "grid-cols-[1rem_1fr_auto] [grid-template-areas:'n_d_p''n_b_g']",
              "@md:grid-cols-[1.125rem_8.5rem_1fr_5.75rem_7rem_2.25rem] @md:[grid-template-areas:'n_d_b_p_g_t']",
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
            <span aria-hidden className="h-2 overflow-hidden rounded-xs bg-foreground/8 [grid-area:b]">
              {lap.bar !== undefined && (
                <span
                  className={cn("block h-full", now ? "bg-foreground" : "bg-foreground/45")}
                  style={{ width: `${lap.bar}%` }}
                />
              )}
            </span>
            <span className="condensed text-right text-xl leading-none font-bold tabular-nums [grid-area:p]">
              {lap.price ? formatPrice(lap.price) : "Ad removed"}
            </span>
            <span className="text-right text-xs whitespace-nowrap tabular-nums [grid-area:g] @md:text-left @md:text-[0.8125rem]">
              {lap.gap && lap.price ? (
                lap.gap.amount === 0 ? (
                  <span className="text-muted-foreground">Same price</span>
                ) : (
                  <>
                    {signed(lap.gap.amount, lap.price.currency)}{" "}
                    <span className="text-muted-foreground">{Math.abs(lap.gap.percent).toFixed(1)}%</span>
                  </>
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
