import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Kbd as KbdBase } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { preferredFor } from "../shared/fit";
import type { BoardData, ResolvedSpec } from "./format";
import { Gallery } from "./Gallery";
import { OtherChoice, preferenceLabel } from "./SpecEditor";

type Props = {
  listingId: Id<"listings">;
  title: string;
  modelId: string | null;
  keySpecs: ResolvedSpec[];
  photos: { url: string; sourceUrl: string }[];
  removed: boolean;
  board: BoardData;
  onDone: () => void;
};

// One spec at a time beside the photos, for checking what the listing claims (or leaves
// out) against what the pictures show. Keys: 1–9 pick a value, Enter confirms the
// listing's value, → / J skip, ← / K go back, Esc leaves.
// Keyboard hints are noise on touch screens, where there are no keys to press.
const Kbd = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <KbdBase className={cn("hidden [@media(hover:hover)]:inline-flex", className)}>{children}</KbdBase>
);

export function CheckMode({ listingId, title, modelId, keySpecs, photos, removed, board, onDone }: Props) {
  const setValue = useMutation(api.board.setSpecValue);
  // The queue is fixed on entry, so confirming a spec does not reshuffle what is left.
  const [queue] = useState(() => keySpecs.filter((s) => s.source !== "you").map((s) => s.id));
  const [position, setPosition] = useState(0);
  // Each step starts with focus on the spec, so a button focused on the previous step
  // cannot be activated by the next key press.
  const stepRef = useRef<HTMLDivElement>(null);
  useEffect(() => stepRef.current?.focus({ preventScroll: true }), [position]);
  const spec = keySpecs.find((s) => s.id === queue[position]);
  const def = board.keySpecs.find((s) => s.id === spec?.id);
  const options =
    spec?.kind === "check"
      ? [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ]
      : (def?.choices ?? []).map((c) => ({ value: c, label: c }));

  const advance = () => setPosition((p) => Math.min(p + 1, queue.length));
  const pick = (value: string) => {
    if (!spec) return;
    void setValue({ listingId, specId: spec.id, value });
    advance();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Typing a new choice must not trigger shortcuts, and Enter on a focused control
      // (Skip, Back, a value, a photo) does what that control says. The photo gallery
      // claims the arrow keys while it has focus.
      if (event.defaultPrevented || event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key === "Enter" && (event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement)) {
        return;
      }
      if (event.key === "Escape") onDone();
      else if (event.key === "ArrowRight" || event.key === "j") advance();
      else if (event.key === "ArrowLeft" || event.key === "k") setPosition((p) => Math.max(p - 1, 0));
      else if (event.key === "Enter" && spec?.source === "listing" && spec.value) pick(spec.value);
      else if (/^[1-9]$/.test(event.key) && options[Number(event.key) - 1]) pick(options[Number(event.key) - 1].value);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const preferred = preferredFor(def, modelId);
  return (
    <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      {/* Pinned, so the photo stays in view while answering. */}
      <Gallery photos={photos} removed={removed} className="lg:sticky lg:top-6" />
      <section aria-label="Check key specs" aria-live="polite" className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">Checking key specs of</p>
          <h1 className="text-xl leading-snug font-semibold">{title}</h1>
        </div>
        <ol aria-label="Progress" className="flex gap-1">
          {queue.map((id, i) => (
            <li
              key={id}
              aria-label={keySpecs.find((s) => s.id === id)?.name}
              aria-current={i === position ? "step" : undefined}
              className={cn("h-1.5 flex-1 rounded-full", i < position ? "bg-foreground" : i === position ? "bg-foreground/50" : "bg-border")}
            />
          ))}
        </ol>

        {spec ? (
          <div ref={stepRef} tabIndex={-1} className="space-y-4 outline-none">
            <div>
              <p className="text-sm text-muted-foreground tabular-nums">
                {position + 1} of {queue.length}
              </p>
              <h2 className="condensed text-4xl leading-none font-extrabold">{spec.name}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {spec.source === "listing"
                  ? `The listing says ${spec.kind === "check" ? (spec.value === "yes" ? "yes" : "no") : spec.value}.`
                  : spec.source === "you"
                    ? `You set ${spec.value}.`
                    : "The listing does not say."}
                {preferred.length > 0 && ` You prefer ${preferred.map((v) => preferenceLabel(spec.kind, v)).join(" or ")}.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {options.map((o, i) => (
                <Button
                  key={o.value}
                  type="button"
                  variant="outline"
                  size="lg"
                  aria-pressed={spec.value === o.value && spec.source === "you"}
                  onClick={() => pick(o.value)}
                  className={cn(
                    "h-11 gap-2",
                    spec.value === o.value && spec.source === "listing" && "border-dashed border-foreground/60",
                    spec.value === o.value && spec.source === "you" && "bg-foreground text-background hover:bg-foreground/90",
                  )}
                >
                  {i < 9 && <Kbd>{i + 1}</Kbd>}
                  {o.label}
                </Button>
              ))}
              {spec.kind === "choice" && <OtherChoice onAdd={pick} />}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {spec.source === "listing" && spec.value && (
                <Button type="button" onClick={() => pick(spec.value!)}>
                  Confirm {spec.kind === "check" ? (spec.value === "yes" ? "Yes" : "No") : spec.value}
                  <Kbd className="ml-1">Enter</Kbd>
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={advance}>
                Skip
                <Kbd className="ml-1">→</Kbd>
              </Button>
              <Button type="button" variant="ghost" disabled={position === 0} onClick={() => setPosition((p) => p - 1)}>
                Back
                <Kbd className="ml-1">←</Kbd>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="condensed text-4xl leading-none font-extrabold">
              {queue.length === 0 ? "Nothing to check" : "All checked"}
            </h2>
            <p className="text-muted-foreground">
              {queue.length === 0
                ? "Every key spec on this car is already yours."
                : "Skipped specs stay as they were; check them again any time."}
            </p>
          </div>
        )}
        <Button type="button" variant="outline" onClick={onDone}>
          Done
          <Kbd className="ml-1">Esc</Kbd>
        </Button>
      </section>
    </div>
  );
}
