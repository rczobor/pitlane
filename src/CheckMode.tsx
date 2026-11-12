import { ArrowLeft, ArrowRight } from "lucide-react";
import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Kbd as KbdBase } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { preferredFor } from "../shared/fit";
import type { BoardData, ResolvedSpec } from "./format";
import { Gallery, galleryColumns } from "./Gallery";
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
  theatre: boolean;
  onTheatreToggle: () => void;
};

// One spec at a time beside the photos, for checking what the listing claims (or leaves
// out) against what the pictures show; the full-screen viewer shows the same step beside
// the photo. Keys: 1–9 pick a value, Enter confirms the listing's value, → / J skip,
// ← / K go back, Esc leaves. The gallery adds F (full screen) and T (theatre mode). In the
// viewer the arrows step through photos and Esc closes it, so only J and K skip and go back.
// Keyboard hints are noise on touch screens, where there are no keys to press.
const Kbd = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <KbdBase className={cn("hidden [@media(hover:hover)]:inline-flex", className)}>{children}</KbdBase>
);

export function CheckMode({ listingId, title, modelId, keySpecs, photos, removed, board, onDone, theatre, onTheatreToggle }: Props) {
  const setValue = useMutation(api.board.setSpecValue);
  // The queue is fixed on entry, so confirming a spec does not reshuffle what is left.
  const [queue] = useState(() => keySpecs.filter((s) => s.source !== "you").map((s) => s.id));
  const [position, setPosition] = useState(0);
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
  const back = () => setPosition((p) => Math.max(p - 1, 0));
  const pick = (value: string) => {
    if (!spec) return;
    void setValue({ listingId, specId: spec.id, value });
    advance();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Typing a new choice must not trigger shortcuts, and Enter on a focused control
      // (Skip, Back, a value, a photo) does what that control says. The photo gallery
      // claims the arrow keys while it has focus, and the full-screen photo viewer
      // (a dialog) claims every key, Escape included.
      if (event.defaultPrevented || event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const dialog = event.target instanceof Element ? event.target.closest('[role="dialog"]') : null;
      if (dialog && (!dialog.hasAttribute("data-photo-viewer") || event.key === "Escape" || event.key.startsWith("Arrow"))) {
        return;
      }
      if (event.key === "Enter" && (event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement)) {
        return;
      }
      if (event.key === "Escape") onDone();
      else if (event.key === "ArrowRight" || event.key === "j") advance();
      else if (event.key === "ArrowLeft" || event.key === "k") back();
      else if (event.key === "Enter" && spec?.source === "listing" && spec.value) pick(spec.value);
      else if (/^[1-9]$/.test(event.key) && options[Number(event.key) - 1]) pick(options[Number(event.key) - 1].value);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const step = (inViewer: boolean) => (
    <CheckStep
      queue={queue.map((id) => ({ id, name: keySpecs.find((s) => s.id === id)?.name }))}
      position={position}
      spec={spec}
      options={options}
      preferred={preferredFor(def, modelId)}
      pick={pick}
      advance={advance}
      back={back}
      inViewer={inViewer}
    />
  );
  return (
    <div className={cn("mt-4 grid gap-8 lg:items-start", galleryColumns(theatre && photos.length > 0))}>
      {/* Pinned, so the photo stays in view while answering. */}
      <Gallery
        photos={photos}
        removed={removed}
        theatre={theatre}
        onTheatreToggle={onTheatreToggle}
        viewerPanel={step(true)}
        className="lg:sticky lg:top-6"
      />
      <section aria-label="Check key specs" aria-live="polite" className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">Checking key specs of</p>
          <h1 className="text-xl leading-snug font-semibold">{title}</h1>
        </div>
        {step(false)}
        <Button type="button" variant="outline" onClick={onDone}>
          Done
          <Kbd className="ml-1">Esc</Kbd>
        </Button>
      </section>
    </div>
  );
}

// The progress through the queue and the current spec, with its values and actions. Each step
// starts with focus on the step, so a button focused on the previous step cannot be activated
// by the next key press. While the viewer is open its step takes focus, never the page's behind
// it: focus there can fall to the body (an answered last spec unmounts its buttons).
function CheckStep({
  queue,
  position,
  spec,
  options,
  preferred,
  pick,
  advance,
  back,
  inViewer,
}: {
  queue: { id: string; name: string | undefined }[];
  position: number;
  spec: ResolvedSpec | undefined;
  options: { value: string; label: string }[];
  preferred: string[];
  pick: (value: string) => void;
  advance: () => void;
  back: () => void;
  inViewer: boolean;
}) {
  const stepRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (inViewer || !document.querySelector("[data-photo-viewer]")) stepRef.current?.focus({ preventScroll: true });
  }, [position, inViewer]);
  return (
    <div ref={stepRef} tabIndex={-1} className="space-y-6 outline-none">
      <ol aria-label="Progress" className="flex gap-1">
        {queue.map(({ id, name }, i) => (
          <li
            key={id}
            aria-label={name}
            aria-current={i === position ? "step" : undefined}
            className={cn("h-1.5 flex-1 rounded-full", i < position ? "bg-foreground" : i === position ? "bg-foreground/50" : "bg-border")}
          />
        ))}
      </ol>
      {spec ? (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground tabular-nums">
              {position + 1} of {queue.length}
            </p>
            <h2 className={cn("condensed leading-none font-extrabold", inViewer ? "text-3xl" : "text-4xl")}>{spec.name}</h2>
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
              <Kbd className="ml-1">{inViewer ? "J" : <ArrowRight aria-label="Right arrow" />}</Kbd>
            </Button>
            <Button type="button" variant="ghost" disabled={position === 0} onClick={back}>
              Back
              <Kbd className="ml-1">{inViewer ? "K" : <ArrowLeft aria-label="Left arrow" />}</Kbd>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className={cn("condensed leading-none font-extrabold", inViewer ? "text-3xl" : "text-4xl")}>
            {queue.length === 0 ? "Nothing to check" : "All checked"}
          </h2>
          <p className="text-muted-foreground">
            {queue.length === 0
              ? "Every key spec on this car is already yours."
              : "Skipped specs stay as they were; check them again any time."}
          </p>
        </div>
      )}
    </div>
  );
}
