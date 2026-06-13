// TanStack Query wiring (W02.P05.S20, ADR G5.b).
//
// Every engine read flows through TanStack Query; cache keys carry
// (scope, filter, as-of) because the contract makes scope fully stateless —
// responses are cacheable by exactly that triple and two scopes never
// interfere. SSE consumption rides v5's streamedQuery over the engine's
// multiplexed stream, through the same client transport the mock engine
// implements.

import {
  experimental_streamedQuery as streamedQuery,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";

import type { GraphFilter } from "./engine";
import { engineClient } from "./engine";

// --- stable serialization for key parts -----------------------------------------

/** Stable JSON for cache keys: object keys sorted, undefined dropped. */
export function stableKey(value: unknown): string {
  if (value === undefined || value === null) return "";
  return JSON.stringify(value, (_, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, val]) => val !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : 1)),
      );
    }
    return v;
  });
}

/** The (scope, filter, as-of) key triple, the contract's cacheability unit. */
export const engineKeys = {
  all: ["engine"] as const,
  status: () => [...engineKeys.all, "status"] as const,
  map: () => [...engineKeys.all, "map"] as const,
  vaultTree: (scope: string) => [...engineKeys.all, "vault-tree", scope] as const,
  filters: (scope: string) => [...engineKeys.all, "filters", scope] as const,
  graph: (
    scope: string,
    filter?: GraphFilter,
    asOf?: string | number,
    granularity?: "document" | "feature",
  ) =>
    [
      ...engineKeys.all,
      "graph",
      scope,
      stableKey(filter),
      asOf ?? "live",
      granularity ?? "document",
    ] as const,
  node: (id: string) => [...engineKeys.all, "node", id] as const,
  neighbors: (id: string, depth: number) =>
    [...engineKeys.all, "neighbors", id, depth] as const,
  evidence: (id: string) => [...engineKeys.all, "evidence", id] as const,
  events: (scope: string, range: { from?: string; to?: string }, bucket?: string) =>
    [...engineKeys.all, "events", scope, stableKey(range), bucket ?? "raw"] as const,
  search: (query: string, target?: string) =>
    [...engineKeys.all, "search", target ?? "vault", query] as const,
  stream: (channels: readonly string[]) =>
    [...engineKeys.all, "stream", channels.join(",")] as const,
};

// --- read hooks --------------------------------------------------------------------

export function useWorkspaceMap() {
  return useQuery({
    queryKey: engineKeys.map(),
    queryFn: () => engineClient.map(),
  });
}

export function useVaultTree(scope: string | null) {
  return useQuery({
    queryKey: engineKeys.vaultTree(scope ?? ""),
    queryFn: () => engineClient.vaultTree(scope!),
    enabled: scope !== null,
  });
}

export function useFiltersVocabulary(scope: string | null) {
  return useQuery({
    queryKey: engineKeys.filters(scope ?? ""),
    queryFn: () => engineClient.filters(scope!),
    enabled: scope !== null,
  });
}

export function useGraphSlice(
  scope: string | null,
  filter?: GraphFilter,
  asOf?: string | number,
  granularity?: "document" | "feature",
) {
  return useQuery({
    queryKey: engineKeys.graph(scope ?? "", filter, asOf, granularity),
    queryFn: () =>
      engineClient.graphQuery({ scope: scope!, filter, as_of: asOf, granularity }),
    enabled: scope !== null,
  });
}

export function useNodeDetail(id: string | null) {
  return useQuery({
    queryKey: engineKeys.node(id ?? ""),
    queryFn: () => engineClient.node(id!),
    enabled: id !== null,
  });
}

export function useNodeNeighbors(id: string | null, depth = 1) {
  return useQuery({
    queryKey: engineKeys.neighbors(id ?? "", depth),
    queryFn: () => engineClient.nodeNeighbors(id!, { depth }),
    enabled: id !== null,
  });
}

export function useNodeEvidence(id: string | null) {
  return useQuery({
    queryKey: engineKeys.evidence(id ?? ""),
    queryFn: () => engineClient.nodeEvidence(id!),
    enabled: id !== null,
  });
}

export function useEngineEvents(
  scope: string | null,
  range: { from?: string; to?: string } = {},
  bucket?: string,
) {
  return useQuery({
    queryKey: engineKeys.events(scope ?? "", range, bucket),
    queryFn: () => engineClient.events({ scope: scope!, ...range, bucket }),
    enabled: scope !== null,
  });
}

export function useEngineSearch(query: string, target: "vault" | "code" = "vault") {
  return useQuery({
    queryKey: engineKeys.search(query, target),
    queryFn: () => engineClient.search({ query, target }),
    enabled: query.length > 0,
  });
}

// --- SSE consumption (§7) -------------------------------------------------------------

export interface StreamChunk {
  channel: string;
  data: unknown;
}

/**
 * Incremental text/event-stream parser: returns completed frames and the
 * unconsumed remainder (pure; transport-independent).
 */
export function parseSseFrames(buffer: string): {
  frames: StreamChunk[];
  rest: string;
} {
  const frames: StreamChunk[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    let channel = "message";
    let data = "";
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) channel = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (data.length === 0) continue;
    try {
      frames.push({ channel, data: JSON.parse(data) });
    } catch {
      frames.push({ channel, data });
    }
  }
  return { frames, rest };
}

/** Consume an SSE Response body as an async iterable of chunks. */
export async function* sseChunks(
  response: Response,
): AsyncGenerator<StreamChunk, void, unknown> {
  if (!response.ok || !response.body) {
    throw new Error(`stream responded ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      const { frames, rest } = parseSseFrames(buffer);
      buffer = rest;
      for (const frame of frames) {
        yield frame;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/**
 * Streamed query over the engine's multiplexed SSE stream. Chunks
 * accumulate in the cache as they arrive (append mode); `since` resumes
 * the graph channel from a known sequence point (§7 splice).
 */
export function engineStreamOptions(channels: readonly string[], since?: number) {
  return queryOptions({
    queryKey: engineKeys.stream(channels),
    queryFn: streamedQuery({
      streamFn: async (context) =>
        sseChunks(await engineClient.openStream([...channels], since, context.signal)),
      refetchMode: "append",
    }),
    staleTime: Infinity,
    retry: true,
  });
}

export function useEngineStream(channels: readonly string[], since?: number) {
  return useQuery(engineStreamOptions(channels, since));
}
