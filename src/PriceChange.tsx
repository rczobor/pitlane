// Relative, not "@/": the price history's unit test loads this file without the app's path alias.
import { formatPrice } from "./format";
import { cn } from "./lib/utils";

/**
 * A price change, the same token everywhere a price shows one: an ink chip (inverted fill;
 * colour only marks change) with an arrow, the amount where there is room, and the
 * percentage. The caller sizes it, and says "since first seen" where it says when; `quiet`
 * is the outlined variant for lists of changes (price history).
 */
export function PriceChange({
  change,
  price,
  amountClassName,
  quiet = false,
  className,
}: {
  change: number;
  /** The price before the change, which the percentage is of. */
  price: { amount: number; currency: string };
  /** Hides the amount where there is no room for it ("sr-only"): screen readers still hear it. */
  amountClassName?: string;
  quiet?: boolean;
  className?: string;
}) {
  const money = formatPrice({ ...price, amount: Math.abs(change) });
  const percent = `${((Math.abs(change) / price.amount) * 100).toFixed(1)}%`;
  return (
    <span
      className={cn(
        "condensed inline-flex shrink-0 items-center gap-1 rounded-[3px] px-1 leading-none font-bold whitespace-nowrap tabular-nums",
        quiet ? "shadow-[inset_0_0_0_1px_var(--color-foreground)]" : "bg-slab text-slab-foreground",
        className,
      )}
    >
      <svg aria-hidden viewBox="0 0 8 8" className={cn("size-[0.6em]", change > 0 && "rotate-180")}>
        <path d="M0 1.5h8L4 7z" fill="currentColor" />
      </svg>
      <span className="sr-only">{change < 0 ? "Down" : "Up"} </span>
      <span className={amountClassName}>{money} · </span>
      {percent}
    </span>
  );
}
