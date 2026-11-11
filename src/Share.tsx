import { Link, Navigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { findListingUrl } from "../shared/sources";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";

type Shared = { title?: string; text?: string; url?: string };
type State = { kind: "saving" } | { kind: "queued" } | { kind: "open"; listingId: Id<"listings"> } | { kind: "failed" };

// Where the installed app's share target lands (see the manifest in vite.config.ts). A car
// already on the board opens; a new one waits on the board until it is captured, since the
// app never opens listing pages itself.
export function Share({ title, text, url }: Shared) {
  const listing = findListingUrl(url, text, title);
  const share = useMutation(api.captures.share);
  const [state, setState] = useState<State>({ kind: "saving" });

  const listingUrl = listing?.canonicalUrl;
  useEffect(() => {
    if (!listingUrl) return;
    share({ url: listingUrl }).then(
      ({ listingId }) => setState(listingId ? { kind: "open", listingId } : { kind: "queued" }),
      () => setState({ kind: "failed" }),
    );
  }, [listingUrl, share]);

  if (state.kind === "open") return <Navigate to="/listings/$listingId" params={{ listingId: state.listingId }} replace />;

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-16 sm:px-8">
      <div className="max-w-prose">
        <Link to="/" className={buttonVariants({ variant: "ghost", className: "-ml-2.5" })}>
          <ArrowLeft data-icon="inline-start" aria-hidden />
          Board
        </Link>
        {!listing ? (
          <>
            <h1 className="condensed mt-4 text-4xl leading-none font-extrabold">Not a listing link</h1>
            <p className="mt-2 text-muted-foreground">
              Share a car's page from the listing site's app or your browser.
            </p>
            {(url || text) && <p className="mt-4 break-all text-sm">{url || text}</p>}
          </>
        ) : state.kind === "failed" ? (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>The listing couldn't be saved for capture. Share it again to retry.</AlertDescription>
          </Alert>
        ) : (
          <>
            <h1 className="condensed mt-4 text-4xl leading-none font-extrabold">
              {state.kind === "queued" ? "Waiting for capture" : "Saving…"}
            </h1>
            {state.kind === "queued" && (
              <p className="mt-2 text-muted-foreground">
                It shows on your board until it is captured. Ask Claude to capture your shared listings, or open it on
                a computer and save it with the extension.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
