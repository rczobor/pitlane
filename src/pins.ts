import { cn } from "@/lib/utils";
import type { Tier } from "./format";

// Map pins are the pit board in miniature, the same on the map page, its legend and the
// car page's map: the tier letter for S, A and B (S in signal yellow), a dot for a car not
// ranked yet, and a muted outlined dot when the car is rejected or its ad is gone.
export type PinTone = "signal" | "slab" | "gone";

export function pinFor(tier: Tier, live: boolean): { letter: string | null; tone: PinTone } {
  if (!live) return { letter: null, tone: "gone" };
  const letter = tier === "S" || tier === "A" || tier === "B" ? tier : null;
  return { letter, tone: tier === "S" ? "signal" : "slab" };
}

export function pinClass(letter: boolean, tone: PinTone) {
  return cn(
    "condensed flex items-center justify-center gap-0.5 font-extrabold leading-none",
    letter ? "h-8 min-w-8 rounded-md px-1.5 text-2xl" : "size-6 rounded-full",
    tone === "signal" && "bg-signal text-signal-foreground",
    tone === "slab" && "bg-slab text-slab-foreground",
    tone === "gone" && "border-2 border-muted-foreground bg-muted text-muted-foreground",
  );
}

// Full ink in light; the dimmer slab grey in dark, so home never outshines the cars.
export const homeClass =
  "flex size-7 items-center justify-center rounded-full border-2 border-background bg-foreground text-background dark:bg-slab dark:text-slab-foreground";

// The notch under a pin that points at its place. The pin must be positioned (Mapbox
// markers already are, absolutely; never give one `relative`).
export function notchClass(tone: PinTone | "home") {
  return cn(
    "pointer-events-none absolute top-full left-1/2 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent",
    tone === "signal" && "border-t-signal",
    tone === "slab" && "border-t-slab",
    tone === "gone" && "border-t-muted-foreground",
    tone === "home" && "border-t-foreground dark:border-t-slab",
  );
}

// How many cars share a place, on the pin's corner.
export const countClass =
  "absolute -top-2 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 font-sans text-[10px] leading-none font-bold text-background";
