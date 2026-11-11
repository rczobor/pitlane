import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ArrowUpRight, Import } from "lucide-react";
import { api } from "../convex/_generated/api";
import { formatAge } from "./format";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

// Listings shared from the phone that nobody has captured yet. The app knows only their
// links until an agent or the extension saves them, which takes them off this list.
export function PendingCaptures() {
  const pending = useQuery(api.captures.pending);
  const dismiss = useMutation(api.captures.dismiss);
  if (!pending?.length) return null;
  return (
    <section aria-labelledby="pending-heading" className="mb-6 max-w-3xl space-y-2">
      <h2 id="pending-heading" className="font-semibold">
        {pending.length === 1 ? "1 shared car" : `${pending.length} shared cars`} waiting for capture
      </h2>
      <Separator />
      <ul className="divide-y">
        {pending.map((request) => (
          <li key={request.requestId} className="flex items-center justify-between gap-3 py-1.5">
            <SharedListing {...request} />
            <Button variant="ghost" size="sm" onClick={() => void dismiss({ requestId: request.requestId })}>
              Remove<span className="sr-only"> {request.title ?? `listing ${request.externalId}`}</span>
            </Button>
          </li>
        ))}
      </ul>
      <CaptureHint />
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
      {title && <p className="font-medium">{title}</p>}
      <p className="text-sm text-muted-foreground">
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-4 hover:text-foreground">
          Listing {externalId}
          <span className="sr-only"> (opens in a new tab)</span>
          <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
        {sharedAt !== undefined && <> · shared {formatAge(sharedAt)}</>}
      </p>
    </div>
  );
}

// What turns a shared link into a car, and where to set that up.
export function CaptureHint() {
  return (
    <p>
      Ask your assistant to capture your shared listings, or open one on a computer and save it with the extension.{" "}
      <Link to="/add" className="inline-flex items-center gap-1 whitespace-nowrap underline underline-offset-4">
        <Import className="size-4" aria-hidden />
        Add cars
      </Link>
    </p>
  );
}
