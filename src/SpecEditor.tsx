import { useMutation } from "convex/react";
import { Check, Plus, RotateCcw, X } from "lucide-react";
import { type CSSProperties, useId, useState } from "react";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { preferredFor } from "../shared/fit";
import { InkMark, specTone, specValueText, specVerdict } from "./KeySpecLedger";
import type { BoardData, ResolvedSpec } from "./format";

export const preferenceLabel = (kind: ResolvedSpec["kind"], value: string) =>
  kind === "check" ? (value === "yes" ? "Yes" : "No") : value;

const sourceWord = { you: "Yours", listing: "From listing" } as const;

type Props = {
  listingId: Id<"listings">;
  modelId: string | null;
  keySpecs: ResolvedSpec[];
  board: BoardData;
};

// The car's key specs as a timing screen's sector readout: one numbered box per spec in
// the board's priority order, each with its value in the board's ledger state, where the
// value came from, and its actions (Confirm a listing value; Change any value). Change opens
// that box's value chips below the readout, one box at a time, so the chips for six specs
// never stack into a wall; none are open until asked, so a value never has two sets of controls.
export function SpecReadout({ listingId, modelId, keySpecs, board }: Props) {
  const setValue = useMutation(api.board.setSpecValue);
  const save = (specId: string, value: string | null) => void setValue({ listingId, specId, value });
  const [openId, setOpenId] = useState<string | null>(null);
  const editorId = useId();
  if (keySpecs.length === 0) return null;
  const open = keySpecs.find((s) => s.id === openId);
  // Six sectors fit one row on wide screens; more wrap into even rows.
  const columns = keySpecs.length <= 6 ? keySpecs.length : Math.ceil(keySpecs.length / 2);

  return (
    <div>
      <div
        style={{ "--sectors": columns } as CSSProperties}
        className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-card sm:grid-cols-3 xl:grid-cols-[repeat(var(--sectors),minmax(0,1fr))]"
      >
        {keySpecs.map((spec, index) => {
          const def = board.keySpecs.find((s) => s.id === spec.id);
          const { hit, breaker } = specVerdict(spec, def, modelId);
          const preferred = preferredFor(def, modelId);
          const isOpen = spec.id === openId;
          // "Preferred" only for a confirmed match; otherwise what the user prefers, if anything.
          const preference = hit
            ? "Preferred"
            : preferred.length > 0
              ? `You prefer ${preferred.map((v) => preferenceLabel(spec.kind, v)).join(" or ")}`
              : undefined;
          return (
            <div
              key={spec.id}
              role="group"
              aria-label={spec.name}
              className={cn(
                // Hairlines between sectors drawn as shadows into the 1px gaps; the rounded
                // box clips them at its edges, so a short last row leaves no stray lines.
                "flex min-w-0 flex-col gap-1 px-2.5 py-2 shadow-[-1px_0_0_var(--border),0_-1px_0_var(--border)]",
                isOpen && "bg-selected shadow-[inset_0_3px_0_var(--foreground),-1px_0_0_var(--border),0_-1px_0_var(--border)]",
              )}
            >
              <p className="condensed flex items-baseline gap-1.5 text-xs leading-tight font-bold tracking-wide break-words text-muted-foreground uppercase">
                <span className="text-sm font-extrabold text-foreground">{index + 1}</span>
                {spec.name}
              </p>
              <p
                className={cn(
                  "flex max-w-full items-center gap-1 self-start px-1.5 py-1 text-[0.9375rem] leading-tight font-semibold break-words",
                  specTone(spec, { hit }),
                  spec.value === null && "font-medium text-muted-foreground",
                )}
              >
                {spec.kind === "check" && spec.value === "no" && <X className="size-3.5 shrink-0" aria-hidden />}
                {specValueText(spec)}
                {spec.value === null && <span className="sr-only">unknown</span>}
                {spec.source === "listing" && <span className="sr-only">(from the listing, not confirmed)</span>}
              </p>
              {spec.source === "listing" && (
                // Outline: the inverted fill only ever marks a selected value.
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 self-start sm:h-7"
                  aria-label={`Confirm ${spec.name}: ${specValueText(spec)}`}
                  onClick={() => save(spec.id, spec.value)}
                >
                  <Check data-icon="inline-start" aria-hidden />
                  Confirm
                </Button>
              )}
              {breaker && <InkMark mark="breaker" className="self-start" />}
              {/* A fixed two-line foot pinned to the sector's bottom, so every Change in a row
                  sits at one height: the source with Change, then the preference. Neither
                  line wraps; a sector too narrow for "From listing" says "Listing". */}
              <div className="@container mt-auto pt-1 text-xs leading-snug whitespace-nowrap text-muted-foreground">
                <p className="flex items-center justify-between gap-1">
                  {spec.source === "listing" ? (
                    <span>
                      <span className="@[7.75rem]:hidden">Listing</span>
                      <span className="hidden @[7.75rem]:inline">From listing</span>
                    </span>
                  ) : (
                    <span>{spec.source === "you" ? "Yours" : "Unknown"}</span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    // Compact on the line, with a touch target that reaches past it.
                    className="relative -my-1 -mr-1.5 h-6 px-1.5 after:absolute after:-inset-x-1 after:-inset-y-2"
                    aria-label={`Change ${spec.name}`}
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? editorId : undefined}
                    onClick={() => setOpenId(isOpen ? null : spec.id)}
                  >
                    Change
                  </Button>
                </p>
                <p className="min-h-lh truncate" title={preference}>
                  {preference}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {open && (
        <SpecChips
          // A fresh editor per spec, so an "Other" draft never saves against the next spec opened.
          key={open.id}
          id={editorId}
          spec={open}
          choices={board.keySpecs.find((s) => s.id === open.id)?.choices ?? []}
          onSave={(value) => save(open.id, value)}
        />
      )}
    </div>
  );
}

// The open sector's values as chips. A listing value is dashed until confirmed; actions
// (Reset, Other) sit apart from the chips so they never read as another value.
function SpecChips({
  id,
  spec,
  choices,
  onSave,
}: {
  id: string;
  spec: ResolvedSpec;
  choices: string[];
  onSave: (value: string | null) => void;
}) {
  const options =
    spec.kind === "check"
      ? [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ]
      : choices.map((c) => ({ value: c, label: c }));
  return (
    <div id={id} className="mt-3 pt-2">
      <p className="mb-2 flex items-baseline gap-2.5">
        <span className="font-semibold">{spec.name}</span>
        <span className="text-xs text-muted-foreground">
          {spec.source ? sourceWord[spec.source] : "Unknown"}
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <ToggleGroup
          aria-label={spec.name}
          variant="outline"
          value={spec.value ? [spec.value] : []}
          onValueChange={(value) => {
            const next = value[0];
            // Re-clicking the selected value confirms a listing value and otherwise does
            // nothing: clearing is the explicit Reset button, so a stray tap loses nothing.
            if (next) onSave(next);
            else if (spec.source === "listing") onSave(spec.value);
          }}
          className="flex-wrap"
        >
          {options.map((o) => (
            <ToggleGroupItem
              key={o.value}
              value={o.value}
              className={cn(
                "h-10 sm:h-8",
                spec.source === "listing" &&
                  "data-pressed:border-dashed data-pressed:border-foreground/60 data-pressed:bg-secondary/60 data-pressed:font-semibold data-pressed:text-foreground",
              )}
            >
              {o.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {(spec.source === "you" || spec.kind === "choice") && <span aria-hidden className="mx-1 h-6 w-px bg-border" />}
        {spec.source === "you" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 text-muted-foreground sm:h-8"
            aria-label={`Reset ${spec.name} to unknown`}
            onClick={() => onSave(null)}
          >
            {/* No × here: on cards × means "No", so resetting must not look like it. */}
            <RotateCcw data-icon="inline-start" aria-hidden />
            Reset
          </Button>
        )}
        {spec.kind === "choice" && <OtherChoice onAdd={onSave} />}
      </div>
    </div>
  );
}

// The car's model, beside its price: shown with "Change", since it rarely changes, and
// the full picker on request.
export function ModelControl({
  listingId,
  modelId,
  board,
}: {
  listingId: Id<"listings">;
  modelId: string | null;
  board: BoardData;
}) {
  const setModel = useMutation(api.board.setModel);
  const [picking, setPicking] = useState(false);
  if (board.models.length === 0) return null;
  const name = board.models.find((m) => m.id === modelId)?.name;
  if (!picking) {
    return (
      <p className="flex flex-wrap items-center gap-1">
        {name ? (
          <span className="condensed text-lg leading-tight font-bold sm:text-xl">{name}</span>
        ) : (
          <span className="text-sm text-muted-foreground">No model</span>
        )}
        <Button type="button" variant="ghost" size="xs" className="max-sm:h-9" onClick={() => setPicking(true)}>
          {name ? "Change model" : "Set model"}
        </Button>
      </p>
    );
  }
  return (
    <ToggleGroup
      aria-label="Model"
      variant="outline"
      size="sm"
      value={modelId ? [modelId] : []}
      onValueChange={(value) => {
        // Clicking the current model again closes the picker; it never clears the model.
        if (value[0]) void setModel({ listingId, modelId: value[0] });
        setPicking(false);
      }}
      className="flex-wrap"
    >
      {board.models.map((m) => (
        <ToggleGroupItem key={m.id} value={m.id} className="condensed h-10 text-base font-bold sm:h-8">
          {m.name}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

// Colours and seat types vary by car, so new choices are added where they are needed.
export function OtherChoice({ onAdd }: { onAdd: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" className="h-10 sm:h-8" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        Other
      </Button>
    );
  }
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) onAdd(value.trim());
        setValue("");
        setOpen(false);
      }}
    >
      <Input
        autoFocus
        aria-label="New value"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          // Closes only the field, not the full-screen viewer it can sit in.
          event.stopPropagation();
          setOpen(false);
        }}
        placeholder="New value"
        maxLength={60}
        className="h-10 w-36 sm:h-8"
      />
      <Button type="submit" size="sm" className="h-10 sm:h-8" disabled={!value.trim()}>
        Add
      </Button>
    </form>
  );
}
