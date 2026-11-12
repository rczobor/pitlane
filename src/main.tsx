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
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AddCars } from "./AddCars";
import { Board, type BoardSearch } from "./Board";
import { Compare } from "./Compare";
import { ListingPage } from "./ListingPage";
import { Root } from "./Root";
import { Settings } from "./Settings";
import { Share } from "./Share";
import { UpdatePrompt } from "./UpdatePrompt";
import "./styles.css";

const rootRoute = createRootRoute({ component: Root });
// `model` narrows the board to one model: that model's own tier list. `check` keeps only
// cars with key specs still to check (from the listing or unknown).
const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>): BoardSearch => ({
    ...(typeof search.model === "string" && { model: search.model }),
    ...(search.check === true && { check: true }),
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
  component: function Listing() {
    const { listingId } = listingRoute.useParams();
    // Keyed so check mode, open editors and unsaved notes never carry over to another car.
    return <ListingPage key={listingId} listingId={listingId} />;
  },
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
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const convex = new ConvexReactClient(import.meta.env.CONVEX_URL);

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
