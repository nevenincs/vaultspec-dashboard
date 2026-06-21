// Test helper: an isolated QueryClient seeded so the scope-reading query hooks
// (`useActiveScope` → `useWorkspaceMap` + `useSession`) resolve synchronously to
// "no active scope" without hitting the network. Surfaces that read the active
// scope / selected node id (e.g. the context-menu host, which threads
// `ctx.selectedNodeId` per the unified-action-plane) need a QueryClient in the
// tree, but a unit test of their structural behaviour must not depend on a live
// engine. Seeding the cache (rather than letting the live `queryClient` error
// and re-render on its poll/retry path) keeps the render loop-free.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { engineKeys } from "../stores/server/queries";
import type { MapResponse, SessionState } from "../stores/server/engine";

const EMPTY_MAP: MapResponse = {
  repositories: [],
  tiers: {},
};

const EMPTY_SESSION: SessionState = {
  workspace: "",
  active_scope: "",
  active_workspace: null,
  scope_context: { folder: null, feature_tags: [] },
  recents: [],
  tiers: {},
};

/**
 * Build an isolated, retry-free QueryClient with the map + session reads seeded
 * to an empty (no-scope) snapshot, so `useActiveScope` derives `null` with no
 * fetch and the consuming surface renders deterministically.
 */
export function createMenuTestQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
  client.setQueryData(engineKeys.map(), EMPTY_MAP);
  client.setQueryData(engineKeys.session(), EMPTY_SESSION);
  return client;
}

/** Wrap children in a freshly-seeded menu test QueryClient. */
export function MenuTestProviders({
  client,
  children,
}: {
  client: QueryClient;
  children: ReactNode;
}) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
