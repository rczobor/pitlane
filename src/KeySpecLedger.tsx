import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResolvedSpec } from "./format";

export function specDescription(spec: ResolvedSpec) {
  const value = spec.value === null ? "unknown" : spec.value;
  const source = spec.source === "listing" ? ", from the listing, not confirmed" : "";
  return `${spec.name}: ${value}${source}`;
}

// How many key specs a card shows: two rows of three, in priority order.
const ledgerSize = 6;

// A fixed grid in the board's priority order, so the same spec sits in the same cell on
// every card and a lane reads down its columns. A spec that does not apply to this car's
// model leaves its cell blank rather than letting later specs shift into it. Each cell
// names its spec, which keeps values such as "Black" (exterior or interior?) unambiguous.
// States: confirmed (light fill), from the listing (dashed, the only dashed thing),
// missing (× No), unknown (a bare "—").
export function KeySpecLedger({
  specs,
  order,
  className,
}: {
  specs: ResolvedSpec[];
  /** Every key-spec id on the board, in priority order. */
  order: string[];
  className?: string;
}) {
  if (specs.length === 0) return null;
  const slots = order.slice(0, ledgerSize).map((id) => specs.find((s) => s.id === id) ?? null);
  return (
    <dl aria-label="Key specs" className={cn("grid grid-cols-3 gap-1", className)}>
      {slots.map((spec, index) => (spec ? <LedgerCell key={spec.id} spec={spec} /> : <div key={index} aria-hidden />))}
    </dl>
  );
}

function LedgerCell({ spec }: { spec: ResolvedSpec }) {
  const missing = spec.kind === "check" && spec.value === "no";
  const value = spec.value === null ? "—" : spec.kind === "check" ? (missing ? "No" : "Yes") : spec.value;
  return (
    <div
      title={specDescription(spec)}
      className={cn(
        "min-w-0 rounded-sm border border-transparent px-1.5 py-1",
        // Confirmed carries an asphalt edge, so it outranks the dashed "from the listing" cells.
        spec.value !== null &&
          spec.source === "you" &&
          "bg-secondary/60 shadow-[inset_2px_0_0_var(--foreground)] dark:bg-secondary",
        spec.value !== null && spec.source === "listing" && "border-dashed border-foreground/45",
      )}
    >
      <dt className="text-xs leading-tight break-words text-muted-foreground">{spec.name}</dt>
      <dd
        className={cn(
          // Comparing these values is the board's job: near the size of the year and mileage line.
          // A fixed two-line height keeps rows level across the cards of a lane.
          "flex min-h-[2.5em] items-start gap-0.5 text-[0.8125rem] leading-tight font-semibold break-words",
          // A confirmed "No" is as definite as any other value; only unknown is quiet.
          spec.value === null && "font-medium text-muted-foreground",
        )}
      >
        {missing && <X className="mt-px size-3 shrink-0" aria-hidden />}
        {/* Long choices ("Adaptive sport seats") wrap to a second line instead of being cut off. */}
        <span className="line-clamp-3 sm:line-clamp-2">{value}</span>
        {spec.source === "listing" && <span className="sr-only">(from the listing, not confirmed)</span>}
      </dd>
    </div>
  );
}
