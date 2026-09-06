import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";
import { cleanup as rtlCleanup } from "@testing-library/react";

import { getAuthoringLifecycleStopSettlement } from "../stores/server/authoring";

interface ActiveQuery {
  readonly hash: string;
  readonly promise: Promise<unknown>;
}

export interface LiveRenderQueryTeardownDependencies {
  readonly cleanup: () => void;
  readonly getAuthoringStopSettlement: () => Promise<void>;
}

export interface LiveRenderQueryTeardown {
  enroll<TClient extends QueryClient>(client: TClient): TClient;
  run(resetStores: () => void): Promise<void>;
}

export function isStructuralQueryKey(key: QueryKey): boolean {
  return (
    (key[0] === "engine" && key[1] === "stream") ||
    (key[0] === "a2a" && key[1] === "run-relay")
  );
}

function activeQueries(
  clients: ReadonlySet<QueryClient>,
  structural: boolean,
): ActiveQuery[] {
  const active: ActiveQuery[] = [];
  for (const client of clients) {
    for (const query of client.getQueryCache().getAll()) {
      if (
        query.state.fetchStatus !== "fetching" ||
        isStructuralQueryKey(query.queryKey) !== structural
      ) {
        continue;
      }
      const promise = (query as Query).promise;
      if (promise) active.push({ hash: query.queryHash, promise });
    }
  }
  return active;
}

async function observeQuerySettlements(queries: readonly ActiveQuery[]): Promise<void> {
  await Promise.allSettled(queries.map(({ promise }) => promise));
}

export function createLiveRenderQueryTeardown(
  dependencies: LiveRenderQueryTeardownDependencies = {
    cleanup: rtlCleanup,
    getAuthoringStopSettlement: getAuthoringLifecycleStopSettlement,
  },
): LiveRenderQueryTeardown {
  const clients = new Set<QueryClient>();

  return {
    enroll<TClient extends QueryClient>(client: TClient): TClient {
      clients.add(client);
      return client;
    },

    async run(resetStores: () => void): Promise<void> {
      const finite = activeQueries(clients, false);
      await observeQuerySettlements(finite);

      const unexpectedFinite = activeQueries(clients, false);
      if (unexpectedFinite.length > 0) {
        throw new Error(
          `new finite query work started during teardown: ${unexpectedFinite
            .map(({ hash }) => hash)
            .sort()
            .join(", ")}`,
        );
      }

      const structural = activeQueries(clients, true);
      dependencies.cleanup();
      await observeQuerySettlements(structural);
      await dependencies.getAuthoringStopSettlement();

      for (const client of clients) client.clear();
      clients.clear();
      resetStores();
    },
  };
}
