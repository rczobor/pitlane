import { ArrowDownUp, ChevronDown, ChevronUp, Ellipsis, Flag, ImageOff, Trash2 } from "lucide-react";
import type { SyntheticEvent } from "react";
import { ordinal } from "./boardOrder";
import { type BoardListing, formatPrice, type Tier, tiers } from "./format";
import { tierName } from "./TierSlab";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type CarAction = "move" | "markRemoved" | "remove";

// A car's actions, beside its link (a link cannot hold a button). Presses stop here so they
// never start a drag; React events from the menu's portal bubble through here too.
export function CardMenu({
  listing,
  canMarkRemoved,
  onAction,
  className,
}: {
  listing: BoardListing;
  canMarkRemoved: boolean;
  onAction: (action: CarAction) => void;
  className?: string;
}) {
  const stop = (event: SyntheticEvent) => event.stopPropagation();
  return (
    // Only keeps a press on the menu from starting a drag.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className={className} onMouseDown={stop} onTouchStart={stop} onKeyDown={stop}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="secondary"
              size="icon-sm"
              aria-label={`Actions for ${listing.title}`}
              // Shown on hover or focus where there is a mouse; always on touch screens.
              className="shadow-sm opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 any-pointer-coarse:opacity-100"
            />
          }
        >
          <Ellipsis aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto">
          <DropdownMenuItem onClick={() => onAction("move")}>
            <ArrowDownUp aria-hidden />
            Move to…
          </DropdownMenuItem>
          {canMarkRemoved && listing.status !== "removed" && (
            <DropdownMenuItem onClick={() => onAction("markRemoved")}>
              <Flag aria-hidden />
              Mark ad as removed…
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => onAction("remove")}>
            <Trash2 aria-hidden />
            Delete from board…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// The touch and keyboard way to move a car: pick its tier, then its place in that tier. The
// sheet stays open, so a car can go to A and then up two places. Only the person moves cars.
export function MoveSheet({
  car,
  model,
  tier,
  index,
  count,
  open,
  onOpenChange,
  onTier,
  onStep,
}: {
  car: BoardListing | undefined;
  model?: string;
  /** Where the car is now, in the board's current order. */
  tier: Tier | undefined;
  index: number;
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTier: (tier: Tier) => void;
  onStep: (delta: -1 | 1) => void;
}) {
  const name = model ?? car?.title ?? "car";
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-xl">
        {car && tier && (
          <div className="mx-auto w-full max-w-lg px-4 pb-6">
            <SheetHeader className="flex-row items-center gap-3 px-0 pb-3">
              <span className="flex aspect-video w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted text-muted-foreground">
                {car.coverUrl ? (
                  <img src={car.coverUrl} alt="" className={cn("size-full object-cover", car.status === "removed" && "grayscale")} />
                ) : (
                  <ImageOff className="size-4" aria-hidden />
                )}
              </span>
              <div className="min-w-0">
                <SheetTitle className="condensed text-xl leading-none font-bold">
                  Move {name}
                </SheetTitle>
                <SheetDescription className="mt-1 text-foreground tabular-nums">
                  {formatPrice(car.price)} · {tierName(tier)}, {ordinal(index + 1)}
                </SheetDescription>
              </div>
            </SheetHeader>
            <h3 className="border-b pb-2 font-semibold">Move to tier</h3>
            <div className="flex flex-wrap gap-2 pt-3 pb-5">
              {tiers.map(({ tier: option, label }) => (
                <Button
                  key={option}
                  variant="outline"
                  aria-pressed={option === tier}
                  onClick={() => option !== tier && onTier(option)}
                  className={cn(
                    "condensed h-11 min-w-11 px-3 font-extrabold",
                    label.length === 1 ? "text-2xl" : "text-lg",
                    // The current tier is marked in ink, never in a slab's colour.
                    option === tier && "border-foreground bg-foreground text-background hover:bg-foreground hover:text-background",
                  )}
                >
                  {label}
                </Button>
              ))}
            </div>
            <h3 className="border-b pb-2 font-semibold">Position in {tierName(tier)}</h3>
            <div className="flex items-center gap-2 pt-3">
              <Button variant="outline" className="h-11" disabled={index === 0} onClick={() => onStep(-1)}>
                <ChevronUp data-icon="inline-start" aria-hidden />
                Up
              </Button>
              <Button variant="outline" className="h-11" disabled={index >= count - 1} onClick={() => onStep(1)}>
                <ChevronDown data-icon="inline-start" aria-hidden />
                Down
              </Button>
              <p className="ml-2 text-sm text-muted-foreground tabular-nums">
                <b className="condensed text-lg text-foreground">{index + 1}</b> of {count}
              </p>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Or drag the car: press and hold it, then move it.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
