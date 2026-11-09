import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Board } from "./Board";
import { ListingPage } from "./ListingPage";
import { Root } from "./Root";
import "./styles.css";

const rootRoute = createRootRoute({ component: Root });
const boardRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Board });
const listingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/listings/$listingId",
  component: function Listing() {
    return <ListingPage listingId={listingRoute.useParams().listingId} />;
  },
});

const router = createRouter({ routeTree: rootRoute.addChildren([boardRoute, listingRoute]) });

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
