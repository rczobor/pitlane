import { ClerkProvider, useAuth } from "@clerk/react";
import { shadcn } from "@clerk/ui/themes";
import { createRootRoute, createRoute, createRouter, lazyRouteComponent, RouterProvider } from "@tanstack/react-router";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Board } from "./Board";
import { Compare } from "./Compare";
import { Connect } from "./Connect";
import { ListingPage } from "./ListingPage";
import { Root } from "./Root";
import { Settings } from "./Settings";
import "./styles.css";

const rootRoute = createRootRoute({ component: Root });
// `model` narrows the board to one model: that model's own tier list. `check` keeps only
// cars with key specs still to check (from the listing or unknown).
const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>): { model?: string; check?: true } => ({
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
const connectRoute = createRoute({ getParentRoute: () => rootRoute, path: "/connect", component: Connect });
const listingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/listings/$listingId",
  component: function Listing() {
    const { listingId } = listingRoute.useParams();
    // Keyed so check mode, open editors and unsaved notes never carry over to another car.
    return <ListingPage key={listingId} listingId={listingId} />;
  },
});

const router = createRouter({ routeTree: rootRoute.addChildren([boardRoute, listingRoute, compareRoute, mapRoute, settingsRoute, connectRoute]) });

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
        <RouterProvider router={router} />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  </StrictMode>,
);
