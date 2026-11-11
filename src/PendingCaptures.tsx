import { useMutation, useQuery } from "convex/react";
import { ArrowUpRight, X } from "lucide-react";
import { api } from "../convex/_generated/api";
import { formatAge } from "./format";
import { Button } from "@/components/ui/button";

// Listings shared from the phone that nobody has captured yet. The app knows only their
// links until an agent or the extension saves them, which takes them off this list.
export function PendingCaptures() {
  const pending = useQuery(api.captures.pending);
  const dismiss = useMutation(api.captures.dismiss);
  if (!pending?.length) return null;
  return (
    <section aria-labelledby="pending-heading" className="mb-4 rounded-lg border border-dashed p-3">
      <h2 id="pending-heading" className="font-semibold">
        {pending.length === 1 ? "1 shared car" : `${pending.length} shared cars`} waiting for capture
      </h2>
      <p className="text-sm text-muted-foreground">
        Ask Claude to capture your shared listings, or open one on a computer and save it with the extension.
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {pending.map(({ requestId, url, externalId, sharedAt }) => (
          <li key={requestId} className="flex items-center gap-1 rounded-md bg-card py-1 pr-1 pl-2.5 text-sm">
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
              Listing {externalId}
              <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
            <span className="text-muted-foreground">· shared {formatAge(sharedAt)}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Dismiss listing ${externalId}`}
              onClick={() => void dismiss({ requestId })}
            >
              <X aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
