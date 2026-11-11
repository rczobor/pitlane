import { useMutation, useQuery } from "convex/react";
import { ArrowUpRight } from "lucide-react";
import { api } from "../convex/_generated/api";
import { formatDateTime } from "./format";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

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
      <p className="font-semibold">{title || `Listing ${externalId}`}</p>
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
