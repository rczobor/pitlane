import { cn } from "@/lib/utils";
import { type Tier, tiers } from "./format";

// The pit board: S in signal yellow, every other tier in asphalt (inverted in dark mode).
export const slabColor = (tier: Tier) =>
  tier === "S" ? "bg-signal text-signal-foreground" : "bg-slab text-slab-foreground";

export const tierName = (tier: Tier) => tiers.find((t) => t.tier === tier)!.label;

export function TierSlab({ tier, className }: { tier: Tier; className?: string }) {
  const label = tierName(tier);
  return (
    <span
      className={cn(
        "condensed inline-flex shrink-0 items-center justify-center rounded-md px-3 leading-none font-extrabold",
        label.length === 1 ? "text-6xl" : "text-3xl",
        slabColor(tier),
        className,
      )}
    >
      {label}
    </span>
  );
}

// A board section's slab: Rejected is quieter through its fill only, with a full-contrast
// label, so its cars never look removed.
export const sectionSlabColor = (tier: Tier) => (tier === "rejected" ? "bg-muted text-foreground" : slabColor(tier));
