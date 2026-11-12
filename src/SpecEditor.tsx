import { useMutation } from "convex/react";
import { Check, Plus, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { preferredFor } from "../shared/fit";
import type { BoardData, ResolvedSpec } from "./format";

export const preferenceLabel = (kind: ResolvedSpec["kind"], value: string) =>
  kind === "check" ? (value === "yes" ? "Yes" : "No") : value;

type Props = {
  listingId: Id<"listings">;
  modelId: string | null;
  keySpecs: ResolvedSpec[];
  board: BoardData;
};

// A selected value is solid when the user set it, dashed when it only comes from the
// listing and still needs a look at the photos. Phones get thumb-sized targets.
const itemClass = (source: ResolvedSpec["source"]) =>
  cn(
    "h-10 sm:h-8",
    source === "listing"
      ? "data-pressed:border-dashed data-pressed:border-foreground/60 data-pressed:bg-secondary/60 data-pressed:font-semibold"
      : "data-pressed:bg-foreground data-pressed:text-background",
  );

export function SpecEditor({ listingId, modelId, keySpecs, board }: Props) {
  const setModel = useMutation(api.board.setModel);
  const setValue = useMutation(api.board.setSpecValue);
  const save = (specId: string, value: string | null) => void setValue({ listingId, specId, value });
  const toConfirm = keySpecs.filter((s) => s.source === "listing").length;
  const [pickingModel, setPickingModel] = useState(false);

  return (
    <div className="space-y-8">
      {board.models.length > 0 && (
        <section>
          <h2 id="model-label" className="font-semibold">
            Model
          </h2>
          <Separator className="my-3" />
          {/* The model rarely changes: show it, and open the full picker on request. */}
          {modelId && !pickingModel ? (
            <p className="flex items-center gap-3">
              <span className="condensed text-xl font-bold">
                {board.models.find((m) => m.id === modelId)?.name}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPickingModel(true)}>
                Change
              </Button>
            </p>
          ) : (
          <ToggleGroup
            aria-labelledby="model-label"
            variant="outline"
            size="sm"
            value={modelId ? [modelId] : []}
            onValueChange={(value) => {
              // Clicking the current model again closes the picker; it never clears the model.
              if (value[0]) void setModel({ listingId, modelId: value[0] });
              setPickingModel(false);
            }}
            className="flex-wrap"
          >
            {board.models.map((m) => (
              <ToggleGroupItem key={m.id} value={m.id} className={cn(itemClass("you"), "condensed text-base font-bold")}>
                {m.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          )}
        </section>
      )}

      {keySpecs.length > 0 && (
        <section>
          <h2 className="font-semibold">
            Key specs
            {toConfirm > 0 && <span className="font-normal text-muted-foreground"> · {toConfirm} to confirm</span>}
          </h2>
          <Separator className="my-3" />
          <p className="mb-4 text-sm text-muted-foreground">
            Check them against the photos. Dashed values come from the listing: confirm them, or pick another.
          </p>
          <dl className="space-y-4">
            {keySpecs.map((spec) => {
              const def = board.keySpecs.find((s) => s.id === spec.id);
              const options =
                spec.kind === "check"
                  ? [
                      { value: "yes", label: "Yes" },
                      { value: "no", label: "No" },
                    ]
                  : (def?.choices ?? []).map((c) => ({ value: c, label: c }));
              return (
                <div key={spec.id} className="grid gap-1.5 sm:grid-cols-[8rem_1fr] sm:items-start">
                  <dt className="text-sm font-medium sm:pt-1.5">
                    {spec.name}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {spec.source === "listing" ? "From listing" : spec.source === "you" ? "Yours" : "Unknown"}
                    </span>
                    {preferredFor(def, modelId).length > 0 && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        Preferred: {preferredFor(def, modelId).map((v) => preferenceLabel(spec.kind, v)).join(" or ")}
                      </span>
                    )}
                  </dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    <ToggleGroup
                      aria-label={spec.name}
                      variant="outline"
                      size="sm"
                      value={spec.value ? [spec.value] : []}
                      onValueChange={(value) => {
                        const next = value[0];
                        // Re-clicking the selected value confirms a listing value and otherwise does
                        // nothing: clearing is the explicit Clear button, so a stray tap loses nothing.
                        if (next) save(spec.id, next);
                        else if (spec.source === "listing") save(spec.id, spec.value);
                      }}
                      className="flex-wrap"
                    >
                      {options.map((o) => (
                        <ToggleGroupItem key={o.value} value={o.value} className={itemClass(spec.source)}>
                          {o.label}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                    {/* Actions sit apart from the value chips so they never read as another value. */}
                    {spec.source === "listing" && (
                      <span aria-hidden className="h-6 w-px bg-border" />
                    )}
                    {spec.source === "listing" && (
                      // Outline, behind a divider: the inverted fill means "selected value" only.
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-10 sm:h-8"
                        onClick={() => save(spec.id, spec.value)}
                      >
                        <Check data-icon="inline-start" aria-hidden />
                        Confirm {spec.kind === "check" ? (spec.value === "yes" ? "Yes" : "No") : spec.value}
                      </Button>
                    )}
                    {spec.source === "you" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-1 h-10 text-muted-foreground sm:h-8"
                        aria-label={`Reset ${spec.name} to unknown`}
                        onClick={() => save(spec.id, null)}
                      >
                        {/* No × here: on cards × means "No", so resetting must not look like it. */}
                        <RotateCcw data-icon="inline-start" aria-hidden />
                        Reset
                      </Button>
                    )}
                    {spec.kind === "choice" && <OtherChoice onAdd={(value) => save(spec.id, value)} />}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      )}
    </div>
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
