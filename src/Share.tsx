import { Link, Navigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { findListingUrl } from "../shared/sources";
import { CaptureHint, SharedListing } from "./PendingCaptures";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";

type Shared = { title?: string; text?: string; url?: string };
type State = { kind: "saving" } | { kind: "queued" } | { kind: "open"; listingId: Id<"listings"> } | { kind: "failed" };

// Where the installed app's share target lands (see the manifest in vite.config.ts). A car
// already on the board opens; a new one waits on the board until it is captured, since the
// app never opens listing pages itself.
export function Share({ title, text, url }: Shared) {
  const listing = findListingUrl(url, text, title);
  // Browsers send the page title; some apps send the link there instead.
  const label = title?.replace(/https?:\/\/\S+/g, "").trim() || undefined;
  const share = useMutation(api.captures.share);
  const [state, setState] = useState<State>({ kind: "saving" });

  const listingUrl = listing?.canonicalUrl;
  useEffect(() => {
    if (!listingUrl) return;
    share({ url: listingUrl, title: label }).then(
      ({ listingId }) => setState(listingId ? { kind: "open", listingId } : { kind: "queued" }),
      () => setState({ kind: "failed" }),
    );
  }, [listingUrl, label, share]);

  if (state.kind === "open") return <Navigate to="/listings/$listingId" params={{ listingId: state.listingId }} replace />;

  const heading = !listing
    ? "Not a listing link"
    : state.kind === "queued"
      ? "Saved for capture"
      : state.kind === "failed"
        ? "Not saved"
        : "Saving…";
  return (
    <main className="mx-auto max-w-[1600px] px-4 pt-4 pb-16 sm:px-8">
      <div className="max-w-prose space-y-4">
        <h1 className="condensed text-4xl leading-none font-extrabold">{heading}</h1>
        {!listing ? (
          <>
            <p>Nothing was saved. Share a car's page from the listing site's app or your browser.</p>
            {(url || text) && (
              <figure className="space-y-1">
                <figcaption className="text-sm text-muted-foreground">You shared</figcaption>
                <blockquote className="border-l-2 pl-3 break-all">{url || text}</blockquote>
              </figure>
            )}
          </>
        ) : state.kind === "failed" ? (
          <Alert variant="destructive">
            <AlertDescription>The listing couldn't be saved for capture. Share it again to retry.</AlertDescription>
          </Alert>
        ) : (
          <>
            <SharedListing url={listing.canonicalUrl} externalId={listing.externalId} title={label} />
            {state.kind === "queued" && (
              <>
                <p>It waits at the top of your board, and joins Watching as a car once it is captured.</p>
                <CaptureHint />
              </>
            )}
          </>
        )}
        {(!listing || state.kind !== "saving") && (
          <Link to="/" className={buttonVariants({ size: "lg" })}>
            Open board
          </Link>
        )}
      </div>
    </main>
  );
}
