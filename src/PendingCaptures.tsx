import { useMutation, useQuery } from "convex/react";
import { ArrowUpRight, Import } from "lucide-react";
import { api } from "../convex/_generated/api";
import { formatDateTime } from "./format";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// Listings shared from the phone that nobody has captured yet. The app knows only their
// links until an agent or the extension saves them, which takes them off this list. How
// to capture them is on the share landing; the board stays a compact list.
export function PendingCaptures() {
  const pending = useQuery(api.captures.pending);
  const dismiss = useMutation(api.captures.dismiss);
  if (!pending?.length) return null;
  return (
    <section aria-labelledby="pending-heading" className="mb-6 max-w-xl">
      <h2 id="pending-heading" className="font-semibold">
        {pending.length === 1 ? "1 shared car" : `${pending.length} shared cars`} waiting for capture
      </h2>
      <Separator className="mt-2" />
      <ul className="divide-y">
        {pending.map((request) => (
          <li key={request.requestId} className="flex items-center justify-between gap-3 py-1.5">
            <SharedListing {...request} />
            <Button variant="outline" size="sm" onClick={() => void dismiss({ requestId: request.requestId })}>
              Remove<span className="sr-only"> {request.title ?? `listing ${request.externalId}`}</span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The tower's version (phones): each shared car waits at the top of Watching, where it will
// appear once captured. No dashed borders or tints: waiting is not "from the listing".
export function PendingRows({ className }: { className?: string }) {
  const pending = useQuery(api.captures.pending);
  const dismiss = useMutation(api.captures.dismiss);
  return pending?.map((request) => {
    const name = request.title || `Listing ${request.externalId}`;
    return (
      <div key={request.requestId} className={cn("flex items-center gap-2 py-2 pr-2 pl-6", className)}>
        <span className="flex aspect-video w-15 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
          <Import className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 text-xs text-muted-foreground">
          <p className="truncate text-[0.8125rem] font-semibold text-foreground">{name}</p>
          <p>
            Waiting for capture{request.sharedAt !== undefined && <> · shared {formatDateTime(request.sharedAt)}</>}
          </p>
          <a href={request.url} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">
            Open listing
            <span className="sr-only"> (opens in a new tab)</span>
            <ArrowUpRight className="ml-0.5 inline size-3.5 align-[-0.125em]" aria-hidden />
          </a>
        </div>
        <Button variant="outline" className="h-9" onClick={() => void dismiss({ requestId: request.requestId })}>
          Remove<span className="sr-only"> {name}</span>
        </Button>
      </div>
    );
  });
}

// A shared listing as far as the app knows it: the share sheet's title and the link.
export function SharedListing({
  url,
  externalId,
  title,
  sharedAt,
}: {
  url: string;
  externalId: string;
  title?: string | null;
  sharedAt?: number;
}) {
  return (
    <div className="min-w-0">
      <p className="font-medium">{title || `Listing ${externalId}`}</p>
      <p className="text-sm text-muted-foreground">
        <a href={url} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">
          Open listing
          <span className="sr-only"> (opens in a new tab)</span>
          <ArrowUpRight className="ml-0.5 inline size-3.5 align-[-0.125em]" aria-hidden />
        </a>
        {sharedAt !== undefined && <> · shared {formatDateTime(sharedAt)}</>}
      </p>
    </div>
  );
}
