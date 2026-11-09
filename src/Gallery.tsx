import { useState } from "react";
import { cn } from "@/lib/utils";
import { NoPhoto } from "./ListingCard";

type Photo = { url: string; sourceUrl: string };

export function Gallery({ photos, removed, className }: { photos: Photo[]; removed: boolean; className?: string }) {
  const [index, setIndex] = useState(0);
  const photo = photos[index];
  return (
    <section aria-label="Photos" className={className}>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
        {photo ? (
          <img
            src={photo.url}
            alt={`Photo ${index + 1} of ${photos.length}`}
            className={cn("size-full object-cover", removed && "grayscale")}
          />
        ) : (
          <NoPhoto />
        )}
        {photos.length > 1 && (
          <span className="absolute right-3 bottom-3 rounded-md bg-slab px-2 py-0.5 text-sm font-medium text-slab-foreground tabular-nums">
            {index + 1} / {photos.length}
          </span>
        )}
      </div>
      {photos.length > 1 && (
        // The fade at the end shows the strip scrolls when it holds more photos than fit.
        <div className="mt-2 flex gap-2 overflow-x-auto pb-2 [mask-image:linear-gradient(to_right,black_92%,transparent)]">
          {photos.map((p, i) => (
            <button
              key={p.sourceUrl}
              type="button"
              onClick={() => setIndex(i)}
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
    </section>
  );
}
