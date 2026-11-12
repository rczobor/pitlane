import { Dialog } from "@base-ui/react/dialog";
import { LayoutGrid, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type ReactZoomPanPinchRef, TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { Button } from "@/components/ui/button";
import { Carousel, type CarouselApi, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import { jumpTo, panWithMiddleButton, scrollBehavior, StripArrow, StripTicks, stripEnds, stripFade, usePointed, useStrip } from "./Strip";

export type Photo = { url: string; sourceUrl: string };

type Props = {
  photos: Photo[];
  removed: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  index: number;
  onIndexChange: (index: number) => void;
  /** Shown beside the photo on wide screens: check mode's current key spec. */
  panel?: React.ReactNode;
};

export function PhotoViewer({ open, onOpenChange, ...props }: Props) {
  const carousel = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Popup
          initialFocus={carousel}
          // Check mode's keys (1–9, Enter) work in here too; other dialogs keep their keys.
          data-photo-viewer
          className="fixed inset-0 z-50 bg-black text-white on-black transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0"
        >
          <Dialog.Title className="sr-only">Photos</Dialog.Title>
          {/* Mounted only while open, so each opening starts on the gallery's photo. */}
          <Slides {...props} carousel={carousel} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Slides({
  photos,
  removed,
  index,
  onIndexChange,
  panel,
  carousel,
}: Omit<Props, "open" | "onOpenChange"> & { carousel: React.RefObject<HTMLDivElement | null> }) {
  const [api, setApi] = useState<CarouselApi>();
  const [zoomed, setZoomed] = useState(false);
  const zooms = useRef<(ReactZoomPanPinchRef | null)[]>([]);
  // Swiping would fight panning a zoomed photo. Embla asks on every press, so it reads
  // a ref; changing its options instead would re-create the carousel.
  const zoomedRef = useRef(false);
  useEffect(() => {
    zoomedRef.current = zoomed;
  }, [zoomed]);
  const [opts] = useState(() => ({ startIndex: index, watchDrag: () => !zoomedRef.current }));

  // The second click of a double-click that opened the viewer would zoom straight in.
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOpened(true), 500);
    return () => clearTimeout(t);
  }, []);

  // Ctrl + scroll over the bars and thumbnails would zoom the page behind the viewer.
  // React's wheel listener is passive, so this one is added by hand.
  useEffect(() => {
    const el = carousel.current;
    const block = (event: WheelEvent) => event.ctrlKey && event.preventDefault();
    el?.addEventListener("wheel", block, { passive: false });
    return () => el?.removeEventListener("wheel", block);
  }, [carousel]);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => {
      const selected = api.selectedScrollSnap();
      // A photo left zoomed in would still be zoomed when stepped back to. 1 ms, not 0:
      // an instant reset leaves a running zoom animation (a double-click) to finish.
      for (const [i, z] of zooms.current.entries()) if (i !== selected) void z?.resetTransform(1);
      setZoomed(false);
      onIndexChange(selected);
    };
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api, onIndexChange]);

  return (
    // The whole viewer is the carousel, so the arrow keys step through photos wherever
    // focus is inside it. It takes focus itself (on opening, and on a click on a photo),
    // or focus would sit on the dialog, outside the carousel's key handling.
    <Carousel
      ref={carousel}
      tabIndex={-1}
      setApi={setApi}
      opts={opts}
      aria-label="Photos"
      className="flex h-dvh flex-col outline-none"
    >
      {/* Over the photo on wide screens; its own row on phones, where a landscape photo leaves
          room above it. */}
      <div className="pointer-events-none z-10 flex items-center justify-between gap-4 p-3 sm:absolute sm:inset-x-0 sm:top-0 sm:bg-gradient-to-b sm:from-black/60 sm:to-transparent">
        {/* Wide screens show the count beside the strip's ticks. */}
        <PhotoCount index={index} total={photos.length} large className={cn(photos.length > 1 && "sm:invisible")} />
        <span className={cn("hidden animate-hint-out text-sm text-white/70 pointer-fine:inline", zoomed && "invisible")}>
          Double-click or Ctrl + scroll to zoom
        </span>
        <Dialog.Close
          render={<Button variant="secondary" size="icon-lg" className="pointer-events-auto" />}
          aria-label="Close"
        >
          <XIcon />
        </Dialog.Close>
      </div>
      {/* Phones in portrait: the photo at full width, then every photo in a grid, rather than
          black bands around a landscape photo. Wider screens put the strip under the photo and
          the panel beside both. */}
      <div className="flex min-h-0 flex-1 max-sm:flex-col">
        <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", photos.length > 1 && "max-sm:flex-none")}>
        <div
          className={cn(
            "relative min-h-0 flex-1 *:data-[slot=carousel-content]:h-full",
            // A lone photo has no grid below it, so it keeps the full height.
            photos.length > 1 && "max-sm:aspect-[4/3] max-sm:w-full max-sm:flex-none",
          )}
        >
          <CarouselContent className="ml-0 h-full">
            {photos.map((p, i) => (
              <CarouselItem key={p.sourceUrl} className="h-full pl-0">
                <TransformWrapper
                  ref={(z) => {
                    zooms.current[i] = z;
                  }}
                  maxScale={6}
                  // Ctrl + scroll and trackpad pinches zoom (browsers send a pinch as a
                  // wheel event with ctrlKey); a plain wheel does nothing.
                  wheel={{ wheelDisabled: true, step: 0.003 }}
                  doubleClick={{ mode: "toggle", step: 1, disabled: !opened }}
                  // At full size a drag swipes to the next photo instead.
                  panning={{ disabled: !(zoomed && i === index) }}
                  onTransform={(_, { scale }) => i === index && setZoomed(scale > 1.01)}
                >
                  <TransformComponent wrapperClass="size-full!" contentClass="size-full!">
                    <img
                      src={p.url}
                      alt={`${i + 1} of ${photos.length}`}
                      loading={Math.abs(i - index) <= 1 ? "eager" : "lazy"}
                      draggable={false}
                      className={cn("size-full object-contain", removed && "grayscale")}
                    />
                  </TransformComponent>
                </TransformWrapper>
              </CarouselItem>
            ))}
          </CarouselContent>
          {photos.length > 1 && (
            <>
              <CarouselPrevious
                variant="secondary"
                size="icon-lg"
                focusableWhenDisabled
                className="left-3 size-10 rounded-lg data-disabled:pointer-events-none data-disabled:opacity-100 data-disabled:[&_svg]:opacity-40"
              />
              <CarouselNext
                variant="secondary"
                size="icon-lg"
                focusableWhenDisabled
                className="right-3 size-10 rounded-lg data-disabled:pointer-events-none data-disabled:opacity-100 data-disabled:[&_svg]:opacity-40"
              />
            </>
          )}
        </div>
        {photos.length > 1 && (
          <Thumbnails
            photos={photos}
            index={index}
            onSelect={(i) => api?.scrollTo(i)}
            counter={<PhotoCount index={index} total={photos.length} large />}
            centred
            className="mt-2 mb-3 max-w-[calc(100%-1.5rem)] max-sm:hidden"
          />
        )}
        </div>
        {panel && (
          // Check mode is for wide screens; a narrow one (a phone turned upright) leaves it out.
          <div className="w-80 shrink-0 overflow-y-auto border-l border-white/15 px-5 pt-20 pb-3 max-sm:hidden">
            {panel}
          </div>
        )}
        {photos.length > 1 && (
          <PhotoGrid photos={photos} index={index} onSelect={(i) => api?.scrollTo(i)} className="min-h-0 flex-1 p-3 sm:hidden" />
        )}
      </div>
    </Carousel>
  );
}

// Which photo is showing, in the lap board's type: "12 /24", the number condensed bold and as
// wide as the total, so the count keeps its width as it changes. With `onShowAll` it is a
// button with a grid mark, like a lane's count, that shows every photo in a sheet.
export function PhotoCount({
  index,
  total,
  onShowAll,
  large = false,
  className,
}: {
  index: number;
  total: number;
  onShowAll?: () => void;
  /** The viewer's size, readable on a big black screen. */
  large?: boolean;
  className?: string;
}) {
  const count = (
    <>
      <span
        className={cn("condensed text-right leading-none font-bold", large ? "text-2xl" : "text-lg")}
        style={{ minWidth: `${String(total).length}ch` }}
      >
        {index + 1}
      </span>
      <span className={cn("condensed leading-none font-bold opacity-75", large && "text-base")}>/{total}</span>
    </>
  );
  if (!onShowAll) return <span className={cn("inline-flex items-baseline gap-1 leading-none tabular-nums", className)}>{count}</span>;
  return (
    <button
      type="button"
      onClick={onShowAll}
      aria-label={`Photo ${index + 1} of ${total}. Show all ${total} photos`}
      // The hit area reaches past the count to 44px.
      className={cn(
        "relative inline-flex items-baseline gap-1 leading-none tabular-nums outline-none after:absolute after:-inset-x-2 after:-inset-y-2.5 focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      {count}
      <LayoutGrid className="size-3.5 self-center opacity-75" aria-hidden />
    </button>
  );
}

// The photos as a strip of thumbnails, the selected one framed. A long strip behaves like a
// board lane: it fades at an end that hides photos, offers arrows under a mouse, and shows
// one tick per photo, filled for the thumbnails on screen. `counter` starts the ticks' row on
// wide screens (phones show the count on the photo). On the page a strip that fits starts at
// the left, under the photo's edge; `centred` (the viewer) centres it, the count with it.
export function Thumbnails({
  photos,
  index,
  onSelect,
  counter,
  centred = false,
  className,
}: {
  photos: Photo[];
  index: number;
  onSelect: (index: number) => void;
  counter: React.ReactNode;
  centred?: boolean;
  className?: string;
}) {
  const { frame, row, view } = useStrip(photos.length);
  const [pointed, point] = usePointed();
  const placed = useRef(false);

  // As the photos are swiped or stepped through, a selected thumbnail under a fade or an arrow
  // (or out of view) scrolls to the middle, so the photos either side of it show too. One
  // already clear stays put, so a clicked thumbnail never slides away from the pointer. The
  // first time (the viewer opening on a later photo) it does not animate. This scrolls only
  // the strip: scrollIntoView would also scroll the page.
  useEffect(() => {
    const el = row.current;
    const thumb = el?.children[index];
    if (!el || !(thumb instanceof HTMLElement)) return;
    // The scroll padding clears the fades and the arrows.
    const margin = parseFloat(getComputedStyle(el).scrollPaddingLeft);
    const clear =
      thumb.offsetLeft - el.scrollLeft >= margin &&
      thumb.offsetLeft + thumb.offsetWidth - el.scrollLeft <= el.clientWidth - margin;
    const behavior = placed.current ? scrollBehavior() : "instant";
    placed.current = true;
    if (!clear) el.scrollTo({ left: thumb.offsetLeft + thumb.offsetWidth / 2 - el.clientWidth / 2, behavior });
  }, [index, row]);

  return (
    // A centred strip that fits is only as wide as its photos, so the count starts under the
    // first; one that hides photos fills the width, as fit-content stops at the available width.
    <div ref={frame} {...stripEnds(view)} className={cn("group/strip relative", centred && "mx-auto w-fit", className)}>
      {/* Middle-button panning is a mouse extra; the strip scrolls like any other. */}
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        ref={row}
        onMouseDown={panWithMiddleButton}
        // The scroll padding clears the arrows (40px), which reach past the fades.
        className={cn("relative flex gap-2 overflow-x-auto scroll-px-12 [--fade:2rem]", stripFade)}
      >
        {photos.map((p, i) => (
          <button
            key={p.sourceUrl}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={`Show photo ${i + 1}`}
            aria-current={i === index}
            className={cn(
              "h-16 w-20 shrink-0 overflow-hidden rounded-md border-3",
              i === index ? "border-foreground" : "border-transparent",
            )}
          >
            <img src={p.url} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
          </button>
        ))}
      </div>
      {/* Flush with the strip's ends, so no sliver of a thumbnail shows beyond them. */}
      <StripArrow direction="back" row={row} className="top-8 left-0" />
      <StripArrow direction="forward" row={row} className="top-8 right-0" />
      {/* Phones show the rail only while the strip hides photos. */}
      <div className={cn("flex items-start gap-3 pt-2", !view && "max-sm:hidden")}>
        <div className="flex h-6 items-center max-sm:hidden">{counter}</div>
        {view && (
          // Lowered so the tick (at the top of its 24px click area) sits level with the count.
          <div aria-hidden className="flex h-6 flex-1 sm:mt-1.5">
            <StripTicks count={photos.length} view={view} jump={(i) => jumpTo(row.current, i)} pointed={pointed} point={point} />
          </div>
        )}
      </div>
    </div>
  );
}

// Every photo in a grid, the selected one framed: the photo viewer's lower half on phones, and
// the sheet behind the gallery's count. It scrolls itself, and brings the selected photo into
// view when it is cut off.
export function PhotoGrid({
  photos,
  index,
  onSelect,
  className,
}: {
  photos: Photo[];
  index: number;
  onSelect: (index: number) => void;
  className?: string;
}) {
  const grid = useRef<HTMLUListElement>(null);
  const placed = useRef(false);
  useEffect(() => {
    const el = grid.current;
    const item = el?.children[index];
    if (!el || !(item instanceof HTMLElement)) return;
    const clear = item.offsetTop >= el.scrollTop && item.offsetTop + item.offsetHeight <= el.scrollTop + el.clientHeight;
    const behavior = placed.current ? scrollBehavior() : "instant";
    placed.current = true;
    if (!clear) el.scrollTo({ top: item.offsetTop + item.offsetHeight / 2 - el.clientHeight / 2, behavior });
  }, [index]);
  return (
    <ul ref={grid} className={cn("relative grid grid-cols-4 content-start gap-2 overflow-y-auto", className)}>
      {photos.map((p, i) => (
        <li key={p.sourceUrl}>
          <button
            type="button"
            onClick={() => onSelect(i)}
            aria-label={`Show photo ${i + 1}`}
            aria-current={i === index}
            className={cn(
              "block aspect-[4/3] w-full overflow-hidden rounded-md border-3",
              i === index ? "border-foreground" : "border-transparent",
            )}
          >
            <img src={p.url} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
          </button>
        </li>
      ))}
    </ul>
  );
}
