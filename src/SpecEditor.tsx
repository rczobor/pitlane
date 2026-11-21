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
import { specTone, specValueText, specVerdict } from "./KeySpecLedger";
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
// value came from, and the one action it needs (Confirm a listing value, Change the rest).
// One box at a time opens its value chips below the readout, so the chips for six specs
// never stack into a wall.
export function SpecReadout({ listingId, modelId, keySpecs, board }: Props) {
  const setValue = useMutation(api.board.setSpecValue);
  const save = (specId: string, value: string | null) => void setValue({ listingId, specId, value });
  // Opens on the first spec that still needs a look, so its chips are a click closer.
  const [openId, setOpenId] = useState<string | null>(
    () => (keySpecs.find((s) => s.source !== "you") ?? keySpecs[0])?.id ?? null,
  );
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
          return (
            <div
              key={spec.id}
              role="group"
              aria-label={spec.name}
              className={cn(
                // Hairlines between sectors drawn as shadows into the 1px gaps; the rounded
                // box clips them at its edges, so a short last row leaves no stray lines.
                "flex min-w-0 flex-col gap-1.5 p-2.5 shadow-[-1px_0_0_var(--border),0_-1px_0_var(--border)]",
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
                  specTone(spec, { hit, breaker }),
                  spec.value === null && "font-medium text-muted-foreground",
                )}
              >
                {spec.kind === "check" && spec.value === "no" && <X className="size-3.5 shrink-0" aria-hidden />}
                {specValueText(spec)}
                {spec.value === null && <span className="sr-only">unknown</span>}
                {spec.source === "listing" && <span className="sr-only">(from the listing, not confirmed)</span>}
              </p>
              <p className="text-xs leading-snug text-muted-foreground">
                {spec.source ? sourceWord[spec.source] : "Unknown"}
                {hit ? (
                  <>
                    {" · "}
                    <span className="font-semibold text-foreground">preferred</span>
                  </>
                ) : breaker ? (
                  <>
                    {" · "}
                    <span className="font-semibold text-destructive">deal-breaker</span>
                  </>
                ) : (
                  preferred.length > 0 && (
                    <>
                      {" · "}
                      <span className="font-semibold text-foreground">
                        preferred: {preferred.map((v) => preferenceLabel(spec.kind, v)).join(" or ")}
                      </span>
                    </>
                  )
                )}
              </p>
              <div className="mt-auto pt-1">
                {spec.source === "listing" ? (
                  // Outline: the inverted fill only ever marks a selected value.
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 sm:h-7"
                    aria-label={`Confirm ${spec.name}: ${specValueText(spec)}`}
                    onClick={() => save(spec.id, spec.value)}
                  >
                    <Check data-icon="inline-start" aria-hidden />
                    Confirm
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-9 sm:h-7"
                    aria-label={`Change ${spec.name}`}
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? editorId : undefined}
                    onClick={() => setOpenId(isOpen ? null : spec.id)}
                  >
                    Change
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {open && (
        <SpecChips
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
