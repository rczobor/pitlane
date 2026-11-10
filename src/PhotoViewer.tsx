import { Dialog } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type ReactZoomPanPinchRef, TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { Button } from "@/components/ui/button";
import { Carousel, type CarouselApi, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

export type Photo = { url: string; sourceUrl: string };

type Props = {
  photos: Photo[];
  removed: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  index: number;
  onIndexChange: (index: number) => void;
};

export function PhotoViewer({ open, onOpenChange, ...props }: Props) {
  const carousel = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Popup
          initialFocus={carousel}
          aria-label="Photos"
          className="fixed inset-0 z-50 bg-black text-white transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0"
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
  carousel,
}: Omit<Props, "open" | "onOpenChange"> & { carousel: React.Ref<HTMLDivElement> }) {
  const [api, setApi] = useState<CarouselApi>();
  const [zoomed, setZoomed] = useState(false);
  const zooms = useRef<(ReactZoomPanPinchRef | null)[]>([]);
  // Swiping would fight panning a zoomed photo. Embla asks on every press, so it reads
  // a ref; changing its options instead would re-create the carousel.
  const zoomedRef = useRef(false);
  zoomedRef.current = zoomed;
  const [opts] = useState(() => ({ startIndex: index, watchDrag: () => !zoomedRef.current }));

  useEffect(() => {
    if (!api) return;
    const onSelect = () => {
      const selected = api.selectedScrollSnap();
      // A photo left zoomed in would still be zoomed when stepped back to. 1 ms, not 0:
      // an instant reset leaves a running zoom animation (a double-click) to finish.
      zooms.current.forEach((z, i) => i !== selected && z?.resetTransform(1));
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
      <div className="relative min-h-0 flex-1 *:data-[slot=carousel-content]:h-full">
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
                doubleClick={{ mode: "toggle", step: 1 }}
                // At full size a drag swipes to the next photo instead.
                panning={{ disabled: !(zoomed && i === index) }}
                onTransform={(_, { scale }) => i === index && setZoomed(scale > 1.01)}
              >
                <TransformComponent wrapperClass="size-full!" contentClass="size-full!">
                  <img
                    src={p.url}
                    alt={`Photo ${i + 1} of ${photos.length}`}
                    loading={Math.abs(i - index) <= 1 ? "eager" : "lazy"}
                    draggable={false}
                    className={cn("size-full object-contain", removed && "grayscale")}
                  />
                </TransformComponent>
              </TransformWrapper>
            </CarouselItem>
          ))}
        </CarouselContent>
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-4 bg-gradient-to-b from-black/60 to-transparent p-3">
          <span className="text-sm font-medium tabular-nums">
            {index + 1} / {photos.length}
          </span>
          <span className="hidden text-sm text-white/70 pointer-fine:inline">Double-click or Ctrl + scroll to zoom</span>
          <Dialog.Close
            render={<Button variant="secondary" size="icon-lg" className="pointer-events-auto" />}
            aria-label="Close"
          >
            <XIcon />
          </Dialog.Close>
        </div>
        {photos.length > 1 && (
          <>
            <CarouselPrevious
              variant="secondary"
              size="icon-lg"
              focusableWhenDisabled
              className="left-3 data-disabled:pointer-events-none data-disabled:opacity-50"
            />
            <CarouselNext
              variant="secondary"
              size="icon-lg"
              focusableWhenDisabled
              className="right-3 data-disabled:pointer-events-none data-disabled:opacity-50"
            />
          </>
        )}
      </div>
      {photos.length > 1 && (
        <Thumbnails
          photos={photos}
          index={index}
          onSelect={(i) => api?.scrollTo(i)}
          className="mx-auto w-full max-w-5xl px-3 pt-2 [&>[aria-current=true]]:border-white"
        />
      )}
    </Carousel>
  );
}

export function Thumbnails({
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
  const strip = useRef<HTMLDivElement>(null);

  // Keep the selected thumbnail in view as the photos are swiped or stepped through.
  // This scrolls only the strip: scrollIntoView would also scroll the page.
  useEffect(() => {
    const el = strip.current;
    const thumb = el?.children[index];
    if (!el || !(thumb instanceof HTMLElement)) return;
    const left = thumb.offsetLeft - el.offsetLeft;
    if (left < el.scrollLeft) el.scrollTo({ left, behavior: "smooth" });
    else if (left + thumb.offsetWidth > el.scrollLeft + el.clientWidth * 0.9) {
      // 0.9 keeps the thumbnail clear of the fade at the strip's end.
      el.scrollTo({ left: left + thumb.offsetWidth - el.clientWidth * 0.9, behavior: "smooth" });
    }
  }, [index]);

  return (
    // The fade at the end shows the strip scrolls when it holds more photos than fit.
    <div
      ref={strip}
      className={cn(
        "flex gap-2 overflow-x-auto pb-2 [mask-image:linear-gradient(to_right,black_92%,transparent)]",
        className,
      )}
    >
      {photos.map((p, i) => (
        <button
          key={p.sourceUrl}
          type="button"
          onClick={() => onSelect(i)}
          aria-label={`Show photo ${i + 1}`}
          aria-current={i === index}
          className={cn(
            "h-16 w-20 shrink-0 overflow-hidden rounded-md border-2",
            i === index ? "border-foreground" : "border-transparent",
          )}
        >
          <img src={p.url} alt="" loading="lazy" className="size-full object-cover" />
        </button>
      ))}
    </div>
  );
}
