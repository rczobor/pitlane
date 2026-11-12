import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// A row that scrolls sideways: a board lane of cars, or a gallery's thumbnails. Both fade
// out at an end that hides items, offer arrows under a mouse, and show one tick per item.
//
// The frame (`group/strip`, with `stripEnds(view)`) holds the scrolling row (`stripFade`), its
// arrows and its ticks. The row sets `--fade` and a matching scroll padding, so an item
// scrolled into view (by the arrows, a tick or tabbing) lands clear of the fade.

// Whether items are hidden at each end, the first and last item on screen (at least half
// clear of the fades, or else the most visible one), and the scroll as an item index, from
// the first item at the start to the last at the end. Null when every item fits.
export type StripView = { start: boolean; end: boolean; first: number; last: number; position: number };

export const stripFade =
  "[--fade-end:0px] [--fade-start:0px] [mask-image:linear-gradient(to_right,transparent,black_var(--fade-start),black_calc(100%-var(--fade-end)),transparent)] [scrollbar-width:none] group-data-more-end/strip:[--fade-end:var(--fade)] group-data-more-start/strip:[--fade-start:var(--fade)]";

export function stripEnds(view: StripView | null) {
  return { "data-more-start": view?.start || undefined, "data-more-end": view?.end || undefined };
}

// Measures the row on scroll and resize. Re-renders only when the view changes, not on every
// scroll event. `items` re-measures when items come or go: the row's own box keeps its size.
// `fit` runs before each measure on resize (the board sizes its cards to the lane).
export function useStrip(items: number, fit?: (frame: HTMLElement, row: HTMLElement) => void) {
  const frame = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<StripView | null>(null);
  useLayoutEffect(() => {
    const frameEl = frame.current;
    const rowEl = row.current;
    if (!frameEl || !rowEl) return;
    const update = () => {
      const next = measureStrip(rowEl);
      setView((current) =>
        current && next && (Object.keys(next) as (keyof StripView)[]).every((key) => current[key] === next[key])
          ? current
          : next,
      );
    };
    const resized = () => {
      fit?.(frameEl, rowEl);
      update();
    };
    // Once now, so the first paint already shows the count, fades and ticks.
    resized();
    const resize = new ResizeObserver(resized);
    resize.observe(rowEl);
    rowEl.addEventListener("scroll", update, { passive: true });
    return () => {
      rowEl.removeEventListener("scroll", update);
      resize.disconnect();
    };
  }, [items, fit]);
  return { frame, row, view };
}

function measureStrip(row: HTMLElement): StripView | null {
  const hidden = row.scrollWidth - row.clientWidth;
  if (hidden <= 1) return null;
  const start = row.scrollLeft > 1;
  const end = row.scrollLeft < hidden - 1;
  // The scroll padding is the fade's width.
  const box = row.getBoundingClientRect();
  const { scrollPaddingLeft, scrollPaddingRight } = getComputedStyle(row);
  const from = box.left + (start ? parseFloat(scrollPaddingLeft) : 0);
  const to = box.right - (end ? parseFloat(scrollPaddingRight) : 0);
  const clear = [...row.children].map((item) => {
    const { left, right, width } = item.getBoundingClientRect();
    return Math.max(0, Math.min(right, to) - Math.max(left, from)) / width;
  });
  const shown = clear.flatMap((part, index) => (part >= 0.5 ? [index] : []));
  if (shown.length === 0) shown.push(clear.indexOf(Math.max(...clear)));
  // Rounded, so a lane about one card wide reads the car at its start after a jump. The ends
  // come from the same 1px tolerance as `start` and `end`, so the count reads the last item
  // once the end fade goes.
  const progress = !start ? 0 : !end ? 1 : row.scrollLeft / hidden;
  const position = Math.round(progress * (clear.length - 1));
  return { start, end, first: shown[0], last: shown[shown.length - 1], position };
}

export function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
}

// Brings an item into view, clear of the fades (the row's scroll padding).
export function jumpTo(row: HTMLElement | null, index: number) {
  row?.children[index]?.scrollIntoView({ behavior: scrollBehavior(), block: "nearest", inline: "nearest" });
}

// Brings the next items into view: the item cut off at that end moves to the other end, so
// the user keeps one item of context.
function pageStrip(row: HTMLElement, direction: "back" | "forward") {
  const view = row.getBoundingClientRect();
  const { scrollPaddingLeft, scrollPaddingRight } = getComputedStyle(row);
  const start = view.left + parseFloat(scrollPaddingLeft);
  const end = view.right - parseFloat(scrollPaddingRight);
  const items = [...row.children];
  const target =
    direction === "forward"
      ? items.find((item) => item.getBoundingClientRect().right > end + 1)
      : items.findLast((item) => item.getBoundingClientRect().left < start - 1);
  target?.scrollIntoView({
    behavior: scrollBehavior(),
    block: "nearest",
    inline: direction === "forward" ? "start" : "end",
  });
}

// Shown while the mouse is over a strip that hides items at that end. An opaque fill and an
// ink border keep it visible on pale photos under the fade. Tabbing through the items
// already scrolls the row, so the arrows are for the mouse only; touch screens swipe.
// `className` places it vertically, centred on the items' photos.
export function StripArrow({
  direction,
  row,
  className,
}: {
  direction: "back" | "forward";
  row: React.RefObject<HTMLElement | null>;
  className: string;
}) {
  const Icon = direction === "back" ? ChevronLeft : ChevronRight;
  return (
    <Button
      variant="outline"
      size="icon-lg"
      tabIndex={-1}
      aria-hidden
      onClick={() => row.current && pageStrip(row.current, direction)}
      className={cn(
        // A negative margin centres it, not a translate: the button's pressed state sets the
        // translate, and the jump would move the release off the button and lose the click.
        "invisible absolute -mt-5 size-10 border-foreground/30 bg-card text-foreground shadow-sm opacity-0 dark:border-foreground/30 dark:bg-card transition-opacity group-hover/strip:opacity-100 pointer-coarse:hidden",
        direction === "back" ? "left-2 group-data-more-start/strip:visible" : "right-2 group-data-more-end/strip:visible",
        className,
      )}
    >
      <Icon aria-hidden />
    </Button>
  );
}

// The item under the mouse, for whatever marks it (its tick grows). Only a mouse points: a
// tap would leave its tick marked.
export function usePointed() {
  const [pointed, setPointed] = useState<number>();
  const point = useCallback(
    (index: number) => ({
      onPointerEnter: (event: ReactPointerEvent) => event.pointerType === "mouse" && setPointed(index),
      onPointerLeave: () => setPointed((current) => (current === index ? undefined : current)),
    }),
    [],
  );
  return [pointed, point] as const;
}

// One tick per item, filled for the items on screen; a click brings that item into view. A
// compact index from the strip's start, so no tick reads as the item above it; ticks shrink
// only when a long strip would not fit them. Each tick's click area is 24px tall with the tick
// at its top, and has no gap to the next (the gap is padding inside each), so the pointer
// never falls between ticks. The caller's container is a 24px-tall flex row, aria-hidden: the
// items themselves are the accessible way to them.
// Phones get one rail instead (its track as strong as an empty tick), the stretch on screen in ink: a long strip's ticks would shrink
// into a dashed rule too fine to tap, and a phone swipes the strip anyway.
export function StripTicks({
  count,
  view,
  jump,
  pointed,
  point,
}: {
  count: number;
  view: StripView;
  jump: (index: number) => void;
  pointed: number | undefined;
  point: ReturnType<typeof usePointed>[1];
}) {
  return (
    <>
      <span className="flex flex-1 items-end pb-4 sm:hidden">
        <span className="relative h-1 w-full rounded-[2px] bg-foreground/55">
          <span
            className="absolute inset-y-0 rounded-[2px] bg-foreground"
            style={{ left: `${(view.first / count) * 100}%`, width: `${((view.last - view.first + 1) / count) * 100}%` }}
          />
        </span>
      </span>
      {Array.from({ length: count }, (_, index) => (
        <button
          // Ticks stand for positions, so the index is their identity.
          key={index}
          type="button"
          tabIndex={-1}
          onClick={() => jump(index)}
          {...point(index)}
          className="pointer-events-auto flex max-w-7 min-w-0 flex-1 items-end pr-1 pb-4 max-sm:hidden"
        >
          <span
            className={cn(
              "h-1 w-full rounded-[2px] bg-foreground/55",
              index >= view.first && index <= view.last && "bg-foreground",
              // The pointed tick grows, keeping its on/off fill; only where a fine pointer points.
              pointed === index && "pointer-fine:h-2",
            )}
          />
        </button>
      ))}
    </>
  );
}

// Shows the grabbing hand everywhere until the drop, not only over what is dragged.
export function grabbing(on: boolean) {
  document.documentElement.toggleAttribute("data-grabbing", on);
}

// Holding the middle button and moving the mouse drags a strip sideways, so a long strip
// scrolls without a horizontal wheel or the scrollbar.
export function panWithMiddleButton(event: ReactMouseEvent<HTMLElement>) {
  if (event.button !== 1) return;
  // Stops the browser's own autoscroll and, on Linux, pasting the primary selection.
  event.preventDefault();
  const row = event.currentTarget;
  const startX = event.clientX;
  const startScroll = row.scrollLeft;
  let panned = false;
  const onMove = (move: MouseEvent) => {
    const dx = move.clientX - startX;
    if (!panned && Math.abs(dx) < 4) return;
    if (!panned) grabbing(true);
    panned = true;
    row.scrollLeft = startScroll - dx;
  };
  const onUp = (up: MouseEvent) => {
    if (up.button !== 1) return;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    if (!panned) return;
    grabbing(false);
    // A middle click on a car opens it in a new tab; after a pan it should not. The
    // auxclick follows this mouseup in the same task, if it fires at all.
    const swallow = (click: MouseEvent) => click.preventDefault();
    window.addEventListener("auxclick", swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("auxclick", swallow, { capture: true }));
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}
