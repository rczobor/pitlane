import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { avoidedFor, preferredFor, verdict } from "../shared/fit";
import type { KeySpecDef, ResolvedSpec } from "./format";

export function specDescription(spec: ResolvedSpec, hit = false) {
  const value = spec.value === null ? "unknown" : spec.value;
  const source = spec.source === "listing" ? ", from the listing, not confirmed" : "";
  return `${spec.name}: ${value}${source}${hit ? ", preferred" : ""}`;
}

// How many key specs a card shows: two rows of three, in priority order.
const ledgerSize = 6;

// A fixed grid in the board's priority order, so the same spec sits in the same cell on
// every card and a lane reads down its columns. A spec that does not apply to this car's
// model leaves its cell blank rather than letting later specs shift into it. Each cell
// names its spec, which keeps values such as "Black" (exterior or interior?) unambiguous.
// States: confirmed (light fill), from the listing (dashed, the only dashed thing),
// missing (× No), unknown (a bare "—"). A confirmed value the user prefers for this model
// is a hit: the cell inverts to solid asphalt, so a lane shows why each car ranks where it does.
export function KeySpecLedger({
  specs,
  defs,
  modelId,
  className,
}: {
  specs: ResolvedSpec[];
  /** Every key spec on the board, in priority order. */
  defs: KeySpecDef[];
  modelId: string | null;
  className?: string;
}) {
  if (specs.length === 0) return null;
  const slots = defs.slice(0, ledgerSize).map((def) => specs.find((s) => s.id === def.id) ?? null);
  return (
    <dl aria-label="Key specs" className={cn("grid grid-cols-3 gap-1", className)}>
      {slots.map((spec, index) =>
        spec ? (
          <LedgerCell key={spec.id} spec={spec} {...specVerdict(spec, defs[index], modelId)} />
        ) : (
          <div key={index} aria-hidden />
        ),
      )}
    </dl>
  );
}

/** The verdict on one car's spec value, against the preferences for the car's model. */
export function specVerdict(spec: ResolvedSpec, def: KeySpecDef | undefined, modelId: string | null) {
  return {
    hit: verdict(preferredFor(def, modelId), spec) === "hit",
    breaker: spec.source === "you" && spec.value !== null && avoidedFor(def, modelId).includes(spec.value),
  };
}

export const specValueText = (spec: ResolvedSpec) =>
  spec.value === null ? "—" : spec.kind === "check" ? (spec.value === "no" ? "No" : "Yes") : spec.value;

/** The cell states shared by card ledgers and the comparison table. */
export const specTone = (spec: ResolvedSpec, { hit, breaker }: { hit: boolean; breaker: boolean }) =>
  cn(
    "rounded-sm border border-transparent",
    // Confirmed carries an asphalt edge, so it outranks the dashed "from the listing" cells.
    spec.value !== null && spec.source === "you" && "bg-secondary/60 shadow-[inset_2px_0_0_var(--foreground)] dark:bg-secondary",
    spec.value !== null && spec.source === "listing" && "border-dashed border-foreground/45",
    hit && "bg-foreground text-background shadow-none dark:bg-foreground",
    // A confirmed value the user ruled out for this model.
    breaker && "border-destructive bg-transparent text-destructive shadow-none dark:bg-transparent",
  );

function LedgerCell({ spec, hit, breaker }: { spec: ResolvedSpec; hit: boolean; breaker: boolean }) {
  const missing = spec.kind === "check" && spec.value === "no";
  const value = specValueText(spec);
  return (
    <div title={specDescription(spec, hit)} className={cn("group/cell min-w-0 px-1.5 py-1", specTone(spec, { hit, breaker }))}>
      <dt className={cn("text-xs leading-tight break-words", hit ? "text-background/75" : "text-muted-foreground")}>
        {spec.name}
      </dt>
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
        {hit && <span className="sr-only">(preferred)</span>}
        {breaker && <span className="sr-only">(deal-breaker)</span>}
      </dd>
    </div>
  );
}
