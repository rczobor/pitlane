import { X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { avoidedFor, preferredFor, verdict } from "../shared/fit";
import type { KeySpecDef, ResolvedSpec } from "./format";

function specDescription(spec: ResolvedSpec, hit = false) {
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
  size = "md",
  className,
}: {
  specs: ResolvedSpec[];
  /** Every key spec on the board, in priority order. */
  defs: KeySpecDef[];
  modelId: string | null;
  /** "lg" for the catalogue's feature lot, where the ledger has room to read from further away. */
  size?: "md" | "lg";
  className?: string;
}) {
  if (specs.length === 0) return null;
  const slots = defs.slice(0, ledgerSize).map((def) => specs.find((s) => s.id === def.id) ?? null);
  return (
    <dl aria-label="Key specs" className={cn("grid grid-cols-3 gap-1", className)}>
      {slots.map((spec, index) =>
        spec ? (
          <LedgerCell key={spec.id} spec={spec} size={size} {...specVerdict(spec, defs[index], modelId)} />
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

/**
 * The cell states shared by card ledgers and the comparison table. A deal-breaker keeps its
 * state and takes an InkMark: red is kept for deleting.
 */
export const specTone = (spec: ResolvedSpec, { hit }: { hit: boolean }) =>
  cn(
    "rounded-sm border border-transparent",
    spec.value !== null && spec.source === "you" && "bg-secondary/60 dark:bg-secondary",
    spec.value !== null && spec.source === "listing" && "border-dashed border-foreground/45",
    hit && "bg-foreground text-background dark:bg-foreground",
  );

const marks = {
  year: ["Out", "outside the model's years"],
  mileage: ["Over", "over the model's mileage limit"],
  breaker: ["Deal-breaker", "a deal-breaker for this model"],
} as const;

/**
 * A year or mileage outside the model's limits, or a value ruled out for the model: a small
 * ink tag beside or under the value, never colour (colour only marks change, and red would
 * be a second accent).
 */
export function InkMark({ mark, className }: { mark: keyof typeof marks; className?: string }) {
  const [text, description] = marks[mark];
  return (
    <span
      className={cn(
        "inline-flex h-3.75 items-center rounded-[3px] bg-slab px-1 font-sans text-[0.625rem] leading-none font-bold tracking-wide whitespace-nowrap text-slab-foreground uppercase [font-stretch:75%]",
        className,
      )}
    >
      <span aria-hidden>{text}</span>
      <span className="sr-only">({description})</span>
    </span>
  );
}

/**
 * The key specs as one line of cells, for the catalogue's Rejected rows. Same order, blanks
 * and spec-name-over-value as the ledger, so a dash or a "Yes" is never read without its spec.
 */
export function SpecRow({ specs, defs, modelId }: { specs: ResolvedSpec[]; defs: KeySpecDef[]; modelId: string | null }) {
  if (specs.length === 0) return null;
  const slots = defs.slice(0, ledgerSize);
  return (
    <div aria-label="Key specs" role="group" className="grid grid-cols-6 items-start gap-1">
      {slots.map((def) => {
        const spec = specs.find((s) => s.id === def.id);
        if (!spec) return <div key={def.id} aria-hidden />;
        const verdict = specVerdict(spec, def, modelId);
        return (
          <Tooltip key={def.id}>
            <TooltipTrigger render={<div className="min-w-0" />}>
              <SpecCell spec={spec} {...verdict} />
            </TooltipTrigger>
            <TooltipContent>{specDescription(spec, verdict.hit)}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

// The ledger's four states, with the spec's name over its value.
function SpecCell({ spec, hit, breaker }: { spec: ResolvedSpec; hit: boolean; breaker: boolean }) {
  const missing = spec.kind === "check" && spec.value === "no";
  return (
    <div
      className={cn(
        "px-1 py-0.75 text-[0.71875rem] leading-tight font-semibold break-words hyphens-auto",
        specTone(spec, { hit }),
        spec.value === null && "font-medium text-muted-foreground",
      )}
    >
      <span className={cn("block text-[0.6875rem] font-normal", hit ? "text-background/75" : "text-muted-foreground")}>
        {spec.name}
        <span className="sr-only">: </span>
      </span>
      <span className="inline-flex items-start gap-0.5">
        {missing && <X className="mt-px size-2.75 shrink-0" aria-hidden />}
        {specValueText(spec)}
      </span>
      {spec.source === "listing" && <span className="sr-only"> (from the listing, not confirmed)</span>}
      {hit && <span className="sr-only"> (preferred)</span>}
      {/* A narrow column breaks the tag at its hyphen rather than overflowing. */}
      {breaker && <InkMark mark="breaker" className="mt-0.5 flex h-auto w-fit py-0.5 whitespace-normal" />}
    </div>
  );
}

function LedgerCell({ spec, hit, breaker, size }: { spec: ResolvedSpec; hit: boolean; breaker: boolean; size: "md" | "lg" }) {
  const missing = spec.kind === "check" && spec.value === "no";
  const value = specValueText(spec);
  return (
    // A hover extra, not a focus stop: the sr-only notes below say the same to screen readers.
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className={cn(
              "group/cell min-w-0",
              size === "lg" ? "px-2 pt-1 pb-1.5" : "px-1.5 py-0.5",
              specTone(spec, { hit }),
            )}
          />
        }
      >
        <dt
          className={cn(
            "leading-tight break-words",
            size === "lg" ? "text-xs" : "text-[0.6875rem]",
            hit ? "text-background/75" : "text-muted-foreground",
          )}
        >
          {spec.name}
        </dt>
        <dd
          className={cn(
            // Most values fit one line; a long choice ("Adaptive sport seats") wraps, never truncates.
            "flex flex-wrap items-start gap-0.5 leading-tight font-semibold break-words",
            size === "lg" ? "text-sm" : "text-xs",
            // A confirmed "No" is as definite as any other value; only unknown is quiet.
            spec.value === null && "font-medium text-muted-foreground",
          )}
        >
          {missing && <X className="mt-px size-3 shrink-0" aria-hidden />}
          <span className="min-w-0">{value}</span>
          {spec.source === "listing" && <span className="sr-only">(from the listing, not confirmed)</span>}
          {hit && <span className="sr-only">(preferred)</span>}
          {breaker && (
            <span className="basis-full">
              <InkMark mark="breaker" />
            </span>
          )}
        </dd>
      </TooltipTrigger>
      <TooltipContent>{specDescription(spec, hit)}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The key specs as one wrapping line of small marks, for the phone board's cards: the ledger's
 * order and states, each mark naming its spec beside its value as the ledger words it (a tick
 * on a dashed, unconfirmed mark read as verified). Unknown values are left out: on a
 * narrow row their dashes cost a line and say little, and the car page lists them.
 */
export function SpecMarks({ specs, defs, modelId }: { specs: ResolvedSpec[]; defs: KeySpecDef[]; modelId: string | null }) {
  const marks = defs.slice(0, ledgerSize).flatMap((def) => {
    const spec = specs.find((s) => s.id === def.id);
    return spec && spec.value !== null ? [{ spec, ...specVerdict(spec, def, modelId) }] : [];
  });
  if (marks.length === 0) return null;
  return (
    <span role="group" aria-label="Key specs" className="flex flex-wrap gap-1.5">
      {marks.map(({ spec, hit, breaker }) => (
        <span
          key={spec.id}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 text-xs leading-tight font-semibold",
            specTone(spec, { hit }),
          )}
        >
          <span className={cn("font-normal", hit ? "text-background/75" : "text-muted-foreground")}>
            {spec.name}
            <span className="sr-only">: </span>
          </span>
          <span className="inline-flex items-center gap-0.5">
            {spec.kind === "check" && spec.value === "no" && <X className="size-3 shrink-0" aria-hidden />}
            {specValueText(spec)}
          </span>
          {spec.source === "listing" && <span className="sr-only"> (from the listing, not confirmed)</span>}
          {hit && <span className="sr-only"> (preferred)</span>}
          {breaker && <InkMark mark="breaker" />}
        </span>
      ))}
    </span>
  );
}
