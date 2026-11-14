import { ClerkProvider, useAuth } from "@clerk/react";
import { shadcn } from "@clerk/ui/themes";
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
  RouterProvider,
} from "@tanstack/react-router";
import { ConvexReactClient } from "convex/react";
import { api } from "../convex/_generated/api";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AddCars } from "./AddCars";
import { Board, type BoardSearch } from "./Board";
import { Compare } from "./Compare";
import { openCar } from "./ListingCard";
import { ListingPage } from "./ListingPage";
import { Root } from "./Root";
import { Settings } from "./Settings";
import { Share } from "./Share";
import { UpdatePrompt } from "./UpdatePrompt";
import "./styles.css";

const convex = new ConvexReactClient(import.meta.env.CONVEX_URL);

const rootRoute = createRootRoute({ component: Root });
// `model` narrows the board to one model: that model's own tier list. `check` keeps only
// cars with key specs still to check (from the listing or unknown).
// Removed ads are usually noise, so the board hides them unless `removed` asks for them.
const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>): BoardSearch => ({
    ...(typeof search.model === "string" && { model: search.model }),
    ...(search.check === true && { check: true }),
    ...(search.removed === true && { removed: true }),
  }),
  component: Board,
});
// `ids` is a comma-separated list, so a comparison is a plain shareable URL.
const compareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/compare",
  validateSearch: (search: Record<string, unknown>): { ids?: string } =>
    typeof search.ids === "string" ? { ids: search.ids } : {},
  component: function CompareRoute() {
    const { ids } = compareRoute.useSearch();
    return <Compare ids={ids?.split(",").filter(Boolean) ?? []} />;
  },
});
// `car` selects the place of that car. The map library is large, so it loads with this page only.
const mapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/map",
  validateSearch: (search: Record<string, unknown>): { car?: string } =>
    typeof search.car === "string" ? { car: search.car } : {},
  component: lazyRouteComponent(() => import("./MapPage"), "MapPage"),
});
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: Settings });
const addRoute = createRoute({ getParentRoute: () => rootRoute, path: "/add", component: AddCars });
// The assistants' guide lived here before the extension joined it; old links and bookmarks still work.
const connectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/connect",
  beforeLoad: () => {
    throw redirect({ to: "/add", replace: true });
  },
});
// The installed app's share target: the share sheet passes these three fields.
const shareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/share",
  validateSearch: (search: Record<string, unknown>): { title?: string; text?: string; url?: string } => ({
    ...(typeof search.title === "string" && { title: search.title }),
    ...(typeof search.text === "string" && { text: search.text }),
    ...(typeof search.url === "string" && { url: search.url }),
  }),
  component: function ShareRoute() {
    return <Share {...shareRoute.useSearch()} />;
  },
});
const listingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/listings/$listingId",
  // Holds a click from the board until the car's data is here, but never long, so the page
  // arrives whole and its photo morphs out of the card rather than into a skeleton. The
  // prewarmed subscription stays open until ListingPage's useQuery takes it over. Opened
  // straight from a link, the board is not there yet and the page shows its skeleton at once.
  loader: async ({ params: { listingId } }) => {
    openCar(listingId);
    if (convex.watchQuery(api.board.get, {}).localQueryResult() === undefined) return;
    convex.prewarmQuery({ query: api.board.listing, args: { listingId } });
    await Promise.race([
      convex.query(api.board.listing, { listingId }).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 400)),
    ]);
  },
  component: function Listing() {
    const { listingId } = listingRoute.useParams();
    // Keyed so check mode, open editors and unsaved notes never carry over to another car.
    return <ListingPage key={listingId} listingId={listingId} />;
  },
});

// iOS Safari's swipe back already slides the board in, so animating again once it lands
// looks like a second navigation. The browser says so on that popstate. Registered before the
// router's own listener, so it is set when the router decides whether to animate.
let browserAnimated = false;
addEventListener("popstate", (event) => {
  browserAnimated = event.hasUAVisualTransition === true;
  // Back on an entry: the browser restores its scroll after this event unless it is manual.
  // The router restores it itself once the page has rendered (see onResolved below).
  history.scrollRestoration = "manual";
});

const router = createRouter({
  routeTree: rootRoute.addChildren([
    boardRoute,
    listingRoute,
    compareRoute,
    mapRoute,
    settingsRoute,
    addRoute,
    connectRoute,
    shareRoute,
  ]),
  // The window and each board lane (by `data-scroll-restoration-id`) keep their scroll. The
  // board is keyed by its URL rather than the history entry, so the car page's Board link,
  // which pushes a new entry, returns to the same spot as the browser's back. Restoring
  // runs on the first render, so whatever sits above the lanes has to be there by then:
  // Root keeps the board and the pending captures subscribed.
  scrollRestoration: true,
  // Opening a car from the board and coming back are the only animated navigations: the
  // car's photo morphs between the card and the gallery (carPhotoTransition in ListingCard).
  defaultViewTransition: {
    types: ({ fromLocation, toLocation }) => {
      // Read once: a later click is not a popstate and must not inherit it.
      const animated = browserAnimated;
      browserAnimated = false;
      const paths = [fromLocation?.pathname, toLocation.pathname];
      const carHop = paths.includes("/") && paths.some((path) => path?.startsWith("/listings/"));
      return carHop && !animated && !matchMedia("(prefers-reduced-motion: reduce)").matches ? ["car"] : false;
    },
  },
  getScrollRestorationKey: (location) =>
    location.pathname === "/" ? location.href : (location.state.__TSR_key ?? location.href),
});

// iOS Safari previews the page a swipe goes back to only if its history entry restores its own
// scroll, or the scroll happens to match: WebKit checks this as the swipe begins. The router
// turns the browser's restoration off for every entry (manual), so swiping back to a scrolled
// board showed a blank page. Each page is marked auto once shown, and manual again on
// returning to it (popstate above), before the browser would act on it.
router.subscribe("onResolved", () => {
  history.scrollRestoration = "auto";
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Reads VITE_CLERK_PUBLISHABLE_KEY. */}
    <ClerkProvider appearance={{ theme: shadcn }} afterSignOutUrl="/">
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {/* Not instant: cards are dense with tooltips, and passing over a card should not open one.
            Once one is open, its neighbours open at once, so reading a ledger stays quick. */}
        <TooltipProvider delay={500}>
          <RouterProvider router={router} />
        </TooltipProvider>
        <UpdatePrompt />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  </StrictMode>,
);
