import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ArrowUpRight, Import, X } from "lucide-react";
import { api } from "../convex/_generated/api";
import { formatAge } from "./format";
import { Button, buttonVariants } from "@/components/ui/button";
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
      <ul>
        {pending.map(({ requestId, url, externalId, sharedAt }) => (
          <li key={requestId} className="flex items-center gap-1">
            <SharedListing url={url} externalId={externalId} />
            <span className="text-muted-foreground">· shared {formatAge(sharedAt)}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove listing ${externalId} from the list`}
              onClick={() => void dismiss({ requestId })}
            >
              <X aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <CaptureHint />
      </p>
    </section>
  );
}

export function SharedListing({ url, externalId }: { url: string; externalId: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline-offset-4 hover:underline">
      Listing {externalId}
      <span className="sr-only"> (opens in a new tab)</span>
      <ArrowUpRight className="size-3.5" aria-hidden />
    </a>
  );
}

// What turns a shared link into a car, and where to set that up.
export function CaptureHint() {
  return (
    <>
      Ask your assistant to capture your shared listings, or open one on a computer and save it with the
      extension.
      <Link to="/add" className={buttonVariants({ variant: "outline", size: "sm" })}>
        <Import data-icon="inline-start" aria-hidden />
        Add cars
      </Link>
    </>
  );
}
