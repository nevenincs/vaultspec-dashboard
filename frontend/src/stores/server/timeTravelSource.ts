// Time-travel data source (F-H4, dashboard-layer-ownership): the time-travel
// driver fetches a historical `asof` snapshot plus a `diff`-to-now to replay a
// scrubbed slice. Those are WIRE reads, and the wire client belongs to the
// stores layer — the app/timeline driver must NOT import `engineClient` itself
// (the leaf chrome never fetches). This module owns that binding behind a small
// interface the driver consumes, exactly the F-H1/F-H2 pattern (the engine
// access lives in stores; the app gets it through a stores-provided seam).
//
// The `engineClientSource` wrapper keeps the binding injectable so tests can
// drive a counting / mock client through the same shape the production path uses.

import {
  engineClient,
  type EngineClient,
  type GraphAsofResponse,
  type GraphDiffResponse,
} from "./engine";

/** The two historical reads the time-travel driver needs, as a stores seam. */
export interface TimeTravelSource {
  /** Snapshot of the graph as of instant `t` (epoch ms). */
  asof(scope: string, t: number): Promise<GraphAsofResponse>;
  /** Diff of the graph from `from` to `to` (epoch ms). */
  diff(scope: string, from: number, to: number): Promise<GraphDiffResponse>;
}

/** Bind any `EngineClient` as a time-travel source (stores owns the wire calls). */
export function engineClientSource(client: EngineClient): TimeTravelSource {
  return {
    asof: (scope, t) => client.graphAsof({ scope, t }),
    diff: (scope, from, to) => client.graphDiff({ scope, from, to }),
  };
}

/** Production source, bound to the singleton wire client (stores-owned). */
export const timeTravelSource: TimeTravelSource = engineClientSource(engineClient);
