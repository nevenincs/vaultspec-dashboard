import { QueryCache, QueryClient } from "@tanstack/react-query";

import { classifyError, queryErrorRouter } from "../../platform/policy/failurePolicy";

// Server state lives exclusively in TanStack Query (gui-spec §5.2): every
// engine read flows through it. SSE streams will feed targeted cache
// invalidation + small live slices once the engine's /stream lands.
//
// Every query failure routes through the platform failure policy (ADR D4): it
// is classified and logged once here, and the retry predicate honors the
// taxonomy - retry only the transient kinds (503/429/network blip), fail fast
// on degraded/fatal so the degradation surfaces render immediately.
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      queryErrorRouter(error, { queryKey: query.queryHash });
    },
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        failureCount < 1 && classifyError(error).retryable,
      staleTime: 5_000,
    },
  },
});
