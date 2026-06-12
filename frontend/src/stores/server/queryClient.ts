import { QueryClient } from "@tanstack/react-query";

// Server state lives exclusively in TanStack Query (gui-spec §5.2): every
// engine read flows through it. SSE streams will feed targeted cache
// invalidation + small live slices once the engine's /stream lands.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Local engine on loopback: retries are cheap but failures are
      // usually "engine not running" — fail fast, render degradation.
      retry: 1,
      staleTime: 5_000,
    },
  },
});
