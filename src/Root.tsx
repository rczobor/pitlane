import { SignIn, useClerk } from "@clerk/react";
import { Link, Outlet } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Columns3, LogOut, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../convex/_generated/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";

export function Root() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading) return null;
  return isAuthenticated ? <SignedIn /> : <SignInScreen />;
}

function SignedIn() {
  const { signOut } = useClerk();
  const board = useQuery(api.board.get);
  const ensureUser = useMutation(api.users.ensureUser);
  const [failed, setFailed] = useState(false);

  // A first sign-in has no user or board yet; set them up, then the board query updates.
  useEffect(() => {
    if (board === null) ensureUser().catch(() => setFailed(true));
  }, [board, ensureUser]);

  if (failed) {
    return (
      <main className="mx-auto max-w-md space-y-4 px-4 pt-[24svh]">
        <Alert variant="destructive">
          <AlertDescription>Your board couldn't be set up. Reload to try again.</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => void signOut()}>
          Sign out
        </Button>
      </main>
    );
  }
  if (board === null) return null;

  return (
    <>
      <header className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 pt-6 pb-4 sm:px-8">
        <Link
          to="/"
          className="condensed rounded-md bg-slab px-2 py-1 text-2xl leading-none font-extrabold tracking-tight text-slab-foreground"
        >
          Pitlane
        </Link>
        {/* Phones show the icons only; the labels stay for screen readers. */}
        <nav aria-label="Main" className="flex items-center gap-1">
          <Link
            to="/compare"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "relative" })}
            activeProps={{ className: "underline underline-offset-4 max-sm:bg-muted" }}
          >
            <Columns3 data-icon="inline-start" aria-hidden />
            <span className="max-sm:sr-only">Compare</span>
          </Link>
          <Link
            to="/settings"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "relative" })}
            activeProps={{ className: "underline underline-offset-4 max-sm:bg-muted" }}
          >
            <SlidersHorizontal data-icon="inline-start" aria-hidden />
            <span className="max-sm:sr-only">Models and key specs</span>
          </Link>
          <Button variant="ghost" size="sm" className="relative" onClick={() => void signOut()}>
            <LogOut data-icon="inline-start" aria-hidden className="sm:hidden" />
            <span className="max-sm:sr-only">Sign out</span>
          </Button>
        </nav>
      </header>
      <Outlet />
    </>
  );
}

function SignInScreen() {
  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {/* The pit board: the product's signature, the only yellow on the screen. */}
      <div className="flex min-h-[28svh] items-end bg-signal px-4 pt-10 pb-6 text-signal-foreground sm:px-8 lg:min-h-svh lg:px-12 lg:pb-12">
        <p className="condensed text-[clamp(4.5rem,16vw,11rem)] leading-[0.8] font-extrabold tracking-tight">Pitlane</p>
      </div>
      <div className="px-4 pt-10 pb-12 sm:px-8 lg:px-16 lg:pt-[18svh]">
        {/* Hash routing keeps Clerk's steps out of the app's routes, and signing in
            returns to the page that was opened. Sign-up is invite-only, so invited
            people arrive through Clerk's email link. */}
        <SignIn routing="hash" fallbackRedirectUrl={location.pathname + location.search} />
      </div>
    </main>
  );
}
