import { SignIn, UserButton, useClerk, useUser } from "@clerk/react";
import { Link, Outlet } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Columns3, Import, MapIcon, SlidersHorizontal } from "lucide-react";
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
  const { user } = useUser();
  const name = user?.firstName || user?.username || user?.primaryEmailAddress?.emailAddress || "";
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
      <header className="flex items-center justify-between gap-4 px-4 pt-6 pb-4 sm:px-8">
        <Link
          to="/"
          className="condensed rounded-md bg-slab px-2 py-1 text-2xl leading-none font-extrabold tracking-tight text-slab-foreground"
        >
          Pitlane
        </Link>
        {/* Phones show the icons only; the labels stay for screen readers. */}
        <nav aria-label="Main" className="flex items-center gap-1">
          <Link
            to="/add"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "relative" })}
            activeProps={{ className: "underline underline-offset-4 max-sm:bg-muted" }}
          >
            {/* Not a "+": it opens the setup guide, not a form to add one car. */}
            <Import data-icon="inline-start" aria-hidden />
            <span className="max-sm:sr-only">Add cars</span>
          </Link>
          <Link
            to="/compare"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "relative" })}
            activeProps={{ className: "underline underline-offset-4 max-sm:bg-muted" }}
          >
            <Columns3 data-icon="inline-start" aria-hidden />
            <span className="max-sm:sr-only">Compare</span>
          </Link>
          <Link
            to="/map"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "relative" })}
            activeProps={{ className: "underline underline-offset-4 max-sm:bg-muted" }}
          >
            <MapIcon data-icon="inline-start" aria-hidden />
            <span className="max-sm:sr-only">Map</span>
          </Link>
          <Link
            to="/settings"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "relative" })}
            activeProps={{ className: "underline underline-offset-4 max-sm:bg-muted" }}
          >
            <SlidersHorizontal data-icon="inline-start" aria-hidden />
            <span className="max-sm:sr-only">Specs</span>
          </Link>
          <div className="ml-2 flex">
            <UserButton appearance={user && !user.hasImage ? inkAvatar(name.charAt(0).toUpperCase()) : undefined} />
          </div>
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

// Clerk draws a violet avatar for people without a photo: a second accent beside the signal
// yellow. They get an ink disc with their initial instead (inverted in dark mode, like the
// slabs), on the header button and in the menu it opens. A photo the user uploaded is shown
// as it is.
function inkAvatar(letter: string) {
  const disc = (fontSize: string) => ({
    backgroundColor: "var(--foreground)",
    "&::after": {
      content: JSON.stringify(letter),
      margin: "auto",
      color: "var(--background)",
      fontFamily: "inherit",
      fontSize,
      fontWeight: 700,
    },
  });
  return {
    elements: {
      userButtonAvatarImage: { display: "none" },
      userButtonAvatarBox: disc("0.875rem"),
      userPreviewAvatarImage: { display: "none" },
      userPreviewAvatarBox: disc("1rem"),
    },
  };
}
