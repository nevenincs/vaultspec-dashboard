import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";

import { AppShell } from "./app/AppShell";

// Code-based route tree for the scaffold; file-based routing can replace
// this once the route surface grows (gui-spec §5.2: TanStack Router).
const rootRoute = createRootRoute({
  component: AppShell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => null,
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
