import { useEffect, useRef, useState } from "react";
import { Carousel, type CarouselApi, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import { NoPhoto } from "./ListingCard";

type Photo = { url: string; sourceUrl: string };

export function Gallery({ photos, removed, className }: { photos: Photo[]; removed: boolean; className?: string }) {
  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(0);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setIndex(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect).on("reInit", onSelect);
    return () => {
      api.off("select", onSelect).off("reInit", onSelect);
    };
  }, [api]);

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

  if (photos.length === 0) {
    return (
      <section aria-label="Photos" className={className}>
        <div className="aspect-[4/3] overflow-hidden rounded-xl bg-muted">
          <NoPhoto />
        </div>
      </section>
    );
  }

  return (
    // The whole gallery is the carousel, so the arrow keys step through photos while
    // a thumbnail has focus too. min-w-0 stops the row of slides from widening a grid
    // column it sits in (check mode on phones).
    <Carousel setApi={setApi} aria-label="Photos" className={cn("min-w-0", className)}>
      <div className="relative">
        <CarouselContent className="ml-0">
          {photos.map((p, i) => (
            <CarouselItem key={p.sourceUrl} className="pl-0">
              <div className="aspect-[4/3] overflow-hidden rounded-xl bg-muted">
                <img
                  src={p.url}
                  alt={`Photo ${i + 1} of ${photos.length}`}
                  // Off-screen slides sit clipped inside the carousel, so lazy loading would
                  // wait until a slide is already in view; the neighbours load ahead instead.
                  loading={Math.abs(i - index) <= 1 ? "eager" : "lazy"}
                  draggable={false}
                  className={cn("size-full object-cover", removed && "grayscale")}
                />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        {photos.length > 1 && (
          <>
            {/* Focusable when disabled: otherwise reaching either end drops focus to the
                page, where check mode's shortcuts would take the next key press. */}
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
            <span className="absolute right-3 bottom-3 rounded-md bg-slab px-2 py-0.5 text-sm font-medium text-slab-foreground tabular-nums">
              {index + 1} / {photos.length}
            </span>
          </>
        )}
      </div>
      {photos.length > 1 && (
        // The fade at the end shows the strip scrolls when it holds more photos than fit.
        <div
          ref={strip}
          className="mt-2 flex gap-2 overflow-x-auto pb-2 [mask-image:linear-gradient(to_right,black_92%,transparent)]"
        >
          {photos.map((p, i) => (
            <button
              key={p.sourceUrl}
              type="button"
              onClick={() => api?.scrollTo(i)}
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
      )}
    </Carousel>
  );
}
