import { Maximize2Icon, RectangleHorizontalIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Carousel, type CarouselApi, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { carPhotoTransition, NoPhoto } from "./ListingCard";
import { type Photo, PhotoCount, PhotoGrid, PhotoViewer, Thumbnails } from "./PhotoViewer";

// Theatre mode (T) gives the photos more of the page on wide screens. It is a standing
// preference, like a video player's: it carries over to the next car and into check
// mode. Storage can be unavailable (private windows); the default is then off.
const theatreKey = "pitlane:theatre";

export function useTheatre() {
  const [theatre, setTheatre] = useState(() => {
    try {
      return localStorage.getItem(theatreKey) === "on";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(theatreKey, theatre ? "on" : "off");
    } catch {
      // Still applies until the page reloads.
    }
  }, [theatre]);
  const toggle = useCallback(() => setTheatre((on) => !on), []);
  return [theatre, toggle] as const;
}

// The grid beside the gallery. In theatre mode the photo column grows until the photo
// fills the screen's height (13.5rem is the header, back link and thumbnails), but never
// below its usual 3/5 on short screens. The other column keeps at least 22rem. Callers
// pass false without photos: the gallery then has no toggle to turn it off.
export function galleryColumns(theatre: boolean) {
  return theatre
    ? "lg:grid-cols-[minmax(0,max(calc((100%-2rem)*3/5),calc((100dvh-13.5rem)*4/3)))_minmax(22rem,1fr)]"
    : "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]";
}

type Props = {
  photos: Photo[];
  removed: boolean;
  className?: string;
  theatre: boolean;
  onTheatreToggle: () => void;
  /** Shown in the full-screen viewer beside the photo. */
  viewerPanel?: React.ReactNode;
};

export function Gallery({ photos, removed, className, theatre, onTheatreToggle, viewerPanel }: Props) {
  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(0);
  const [viewing, setViewing] = useState(false);
  const [sheet, setSheet] = useState(false);
  // The viewer steps through the same photos; the gallery follows, so closing it
  // lands on the last photo viewed.
  const follow = useCallback(
    (i: number) => {
      setIndex(i);
      api?.scrollTo(i, true);
    },
    [api],
  );

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setIndex(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect).on("reInit", onSelect);
    return () => {
      api.off("select", onSelect).off("reInit", onSelect);
    };
  }, [api]);

  // F opens and closes the full-screen viewer and T toggles theatre mode, as in video
  // players. Typing either letter into a field must not. T is for the page, so it does
  // nothing while the viewer is open.
  useEffect(() => {
    if (photos.length === 0) return;
    const onKey = (event: KeyboardEvent) => {
      const t = event.target;
      const key = event.key.toLowerCase();
      if ((key !== "f" && key !== "t") || event.repeat || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      if (t instanceof HTMLElement && t.isContentEditable) return;
      // Another dialog (the photo sheet) keeps its keys; the viewer is closed with F too.
      const dialog = t instanceof Element ? t.closest('[role="dialog"]') : null;
      if (dialog && !dialog.hasAttribute("data-photo-viewer")) return;
      if (key === "t" && viewing) return;
      event.preventDefault();
      if (key === "f") setViewing((v) => !v);
      else onTheatreToggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photos.length, viewing, onTheatreToggle]);

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
    <>
      {/* The whole gallery is the carousel, so the arrow keys step through photos while
          a thumbnail has focus too. min-w-0 stops the row of slides from widening a grid
          column it sits in. */}
      <Carousel setApi={setApi} aria-label="Photos" className={cn("min-w-0", className)}>
        <div className="relative">
          <CarouselContent className="ml-0">
            {photos.map((p, i) => (
              <CarouselItem key={p.sourceUrl} className="pl-0">
                <div className="aspect-[4/3] overflow-hidden rounded-xl bg-muted">
                  {/* A mouse shortcut: keyboards use the Full screen button or F. */}
                  {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
                  <img
                    src={p.url}
                    alt={`${i + 1} of ${photos.length}`}
                    // Off-screen slides sit clipped inside the carousel, so lazy loading would
                    // wait until a slide is already in view; the neighbours load ahead instead.
                    loading={Math.abs(i - index) <= 1 ? "eager" : "lazy"}
                    draggable={false}
                    // The board card shows the first photo, so only it morphs back into the
                    // card; from any other photo the pages just cross-fade.
                    style={i === 0 && index === 0 ? carPhotoTransition : undefined}
                    // Embla swallows the click that ends a swipe, so only a tap opens the viewer.
                    onClick={() => setViewing(true)}
                    className={cn("size-full cursor-zoom-in object-cover", removed && "grayscale")}
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <div className="absolute top-3 right-3 flex gap-2">
            {/* Wide screens only: on a phone the photo already has the full width. */}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="secondary"
                    size="icon-lg"
                    onClick={onTheatreToggle}
                    aria-label="Theatre mode"
                    aria-pressed={theatre}
                    className="hidden aria-pressed:bg-foreground aria-pressed:text-background lg:inline-flex"
                  />
                }
              >
                <RectangleHorizontalIcon />
              </TooltipTrigger>
              <TooltipContent>
                Theatre mode <Kbd>T</Kbd>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={<Button variant="secondary" size="icon-lg" onClick={() => setViewing(true)} aria-label="Full screen" />}
              >
                <Maximize2Icon />
              </TooltipTrigger>
              <TooltipContent>
                Full screen <Kbd>F</Kbd>
              </TooltipContent>
            </Tooltip>
          </div>
          {photos.length > 1 && (
            <>
              {/* Focusable when disabled: otherwise reaching either end drops focus to the
                  page, where check mode's shortcuts would take the next key press. */}
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
              {/* Phones only: wider screens show the count beside the thumbnails' ticks. */}
              <PhotoCount
                index={index}
                total={photos.length}
                onShowAll={() => setSheet(true)}
                className="absolute right-3 bottom-3 rounded-md bg-black/75 px-2 py-1 text-white hover:bg-black/90 sm:hidden"
              />
            </>
          )}
        </div>
        {photos.length > 1 && (
          <Thumbnails
            photos={photos}
            index={index}
            onSelect={(i) => api?.scrollTo(i)}
            counter={
              <PhotoCount
                index={index}
                total={photos.length}
                onShowAll={() => setSheet(true)}
                className="rounded-sm border border-current/60 px-1.5 py-0.5 hover:bg-current/10"
              />
            }
            className="mt-2"
          />
        )}
      </Carousel>
      {/* Outside the carousel: React events bubble through portals, so the gallery
          would also take the viewer's arrow keys. */}
      <PhotoViewer
        photos={photos}
        removed={removed}
        open={viewing}
        onOpenChange={setViewing}
        index={index}
        onIndexChange={follow}
        panel={viewerPanel}
      />
      {/* Every photo at once, like a lane's sheet of cars: a phone's way to the photo it wants. */}
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="bottom" className="max-h-[80dvh]">
          <SheetHeader className="pb-0 sm:px-8">
            {/* Headed by the lap board, as a lane's sheet is. */}
            <SheetTitle className="leading-none">
              <span className="sr-only">Photos</span>
              <span aria-hidden>
                <PhotoCount index={index} total={photos.length} large />
              </span>
            </SheetTitle>
            <SheetDescription>
              <span className="sr-only">
                Photo {index + 1} of {photos.length}.{" "}
              </span>
              Pick one to show it.
            </SheetDescription>
          </SheetHeader>
          <PhotoGrid
            photos={photos}
            index={index}
            onSelect={(i) => {
              api?.scrollTo(i);
              setSheet(false);
            }}
            className="grid-cols-3 px-4 pt-1 pb-6 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] sm:px-8"
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
