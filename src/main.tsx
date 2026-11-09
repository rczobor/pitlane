import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Board } from "./Board";
import { ListingPage } from "./ListingPage";
import { Root } from "./Root";
import { Settings } from "./Settings";
import "./styles.css";

const rootRoute = createRootRoute({ component: Root });
// `model` narrows the board to one model: that model's own tier list.
const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>): { model?: string } =>
    typeof search.model === "string" ? { model: search.model } : {},
  component: Board,
});
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: Settings });
const listingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/listings/$listingId",
  component: function Listing() {
    return <ListingPage listingId={listingRoute.useParams().listingId} />;
  },
});

const router = createRouter({ routeTree: rootRoute.addChildren([boardRoute, listingRoute, settingsRoute]) });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const convex = new ConvexReactClient(import.meta.env.CONVEX_URL);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <RouterProvider router={router} />
    </ConvexProvider>
  </StrictMode>,
);
