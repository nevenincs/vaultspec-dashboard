// The mock engine (W02.P05.S19) — serves the S18 fixture corpus through
// the same transport surface the live engine will serve, so the S17 client
// and everything above it run unchanged before the engine plan's serve
// wave lands. This phase is the cross-plan dependency fence.
//
// Faithfulness rules, from the contract:
// - every response carries a `tiers` degradation block (§2) — and the mock
//   exposes `degrade()` so the W03 degradation matrix is reachable;
// - diff entries and the `graph` SSE channel share one monotonic delta
//   clock (§5/§7): seq derives from the corpus event log, `since=` resumes
//   or implies a gap the client must re-keyframe over;
// - remove/change deltas carry the entity payload with id load-bearing
//   (the S06 canonical shape).
//
// Toggled by env flag: `VITE_MOCK_ENGINE=1` (read by the app bootstrap,
// which swaps the client transport; S49 swaps it back to the live origin).

import type {
  EngineEdge,
  EngineEvent,
  EngineNode,
  FetchLike,
  GraphDeltaEntry,
  TiersBlock,
  WireMetaEdge,
} from "../stores/server/engine";
import type { FixtureCorpus } from "./fixtures/corpus";
import { buildFixtureCorpus } from "./fixtures/corpus";

export const MOCK_SCOPE = "wt-main";

export function isMockEngineEnabled(): boolean {
  return import.meta.env.VITE_MOCK_ENGINE === "1";
}

// --- delta timeline (pure, derived from the corpus event log) -------------------

export interface TimelineDelta extends GraphDeltaEntry {
  /** ms timestamp, mirrors `t`. */
  ts: number;
}

/**
 * Derive the ordered delta log from the corpus: each doc-created event adds
 * its node and edges; commits add the commit node and its temporal edge;
 * step-checked events change the plan node. seq is 1-based in ts order —
 * the single delta clock everything splices on.
 */
export function buildDeltaTimeline(corpus: FixtureCorpus): TimelineDelta[] {
  const nodeById = new Map(corpus.nodes.map((n) => [n.id, n]));
  const deltas: TimelineDelta[] = [];
  // Feature nodes (the default stage species) enter the timeline at their
  // creation date — historical slices must carry them (audit finding
  // mock-asof-omits-feature-nodes-009).
  const featureCreated = new Map<string, number>();
  for (const node of corpus.nodes) {
    if (node.kind !== "feature") continue;
    const ts = Date.parse(node.dates?.created ?? corpus.events[0]?.ts ?? "");
    if (!Number.isFinite(ts)) continue;
    featureCreated.set(node.id, ts);
    deltas.push({ op: "add", node, t: ts, ts, seq: 0 });
  }
  // Constellation meta-edges appear once both endpoint features exist.
  for (const meta of corpus.metaEdges) {
    const ts = Math.max(
      featureCreated.get(meta.src) ?? 0,
      featureCreated.get(meta.dst) ?? 0,
    );
    if (ts > 0) deltas.push({ op: "add", edge: meta, t: ts, ts, seq: 0 });
  }
  const emittedEdges = new Set<string>();
  for (const event of corpus.events) {
    const ts = Date.parse(event.ts);
    const primary = event.node_ids[0];
    const node = nodeById.get(primary);
    if (!node) continue;
    if (event.kind === "doc-created" || event.kind === "commit") {
      deltas.push({ op: "add", node, t: ts, ts, seq: 0 });
      for (const edge of corpus.edges) {
        if (edge.src === primary && Date.parse(edge.observed_at ?? event.ts) <= ts) {
          deltas.push({ op: "add", edge, t: ts, ts, seq: 0 });
          emittedEdges.add(edge.id);
        }
      }
    } else if (event.kind === "step-checked") {
      deltas.push({ op: "change", node, t: ts, ts, seq: 0 });
    }
  }
  // Edges observed after their source's creation event (e.g. semantic
  // discoveries) enter the timeline at their own observed_at — every
  // corpus edge exists somewhere on the clock.
  for (const edge of corpus.edges) {
    if (emittedEdges.has(edge.id) || !edge.observed_at) continue;
    const ts = Date.parse(edge.observed_at);
    if (Number.isFinite(ts)) deltas.push({ op: "add", edge, t: ts, ts, seq: 0 });
  }
  deltas.sort((a, b) => a.ts - b.ts);
  deltas.forEach((d, i) => {
    d.seq = i + 1;
    d.t = d.ts;
  });
  return deltas;
}

/**
 * Project the mock's internal meta-edge (an `EngineEdge` carrying the
 * aggregation on `.meta`, the shape the delta timeline replays) onto the
 * live serve wire (engine addendum S02): the SEPARATE `meta_edges` array
 * element, with the bare feature ids decomposed back to `src_feature` /
 * `dst_feature`. The client's adaptGraphSlice folds this back into edges —
 * exercising the exact path the live origin takes.
 */
function toWireMetaEdge(edge: EngineEdge): WireMetaEdge {
  return {
    src: edge.src,
    dst: edge.dst,
    src_feature: edge.src.replace(/^feature:/, ""),
    dst_feature: edge.dst.replace(/^feature:/, ""),
    count: edge.meta?.count ?? 0,
    breakdown_by_tier: edge.meta?.breakdown_by_tier ?? {},
  };
}

// --- the mock engine --------------------------------------------------------------

type StreamSubscriber = (channel: string, data: unknown) => void;

export class MockEngine {
  readonly corpus: FixtureCorpus;
  readonly timeline: TimelineDelta[];
  private degradations = new Map<string, string>();
  private subscribers = new Set<StreamSubscriber>();
  // Debug-switch conditions that degrade SERVED data (finding 035): the
  // corpus disappears (no vault) or the lifecycle lane runs dry (core
  // date-mandate not landed).
  private noVault = false;
  private lifecycleSparse = false;

  /** No vault in the worktree: the served corpus is empty (035). */
  setNoVault(on: boolean): void {
    this.noVault = on;
  }

  /** Date-mandate missing: lifecycle-lane events drop from serving (035). */
  setLifecycleSparse(on: boolean): void {
    this.lifecycleSparse = on;
  }

  constructor(corpus: FixtureCorpus = buildFixtureCorpus()) {
    this.corpus = corpus;
    this.timeline = buildDeltaTimeline(corpus);
  }

  /** Mark a tier degraded (the W03 degradation matrix debug switch input). */
  degrade(tier: string, reason: string | null): void {
    if (reason === null) this.degradations.delete(tier);
    else this.degradations.set(tier, reason);
  }

  tiersBlock(): TiersBlock {
    const block: TiersBlock = {};
    for (const tier of ["declared", "structural", "temporal", "semantic"]) {
      const reason = this.degradations.get(tier);
      block[tier] = reason ? { available: false, reason } : { available: true };
    }
    return block;
  }

  /** Push a live event onto a stream channel (tests and demos drive this). */
  push(channel: string, data: unknown): void {
    for (const subscriber of this.subscribers) {
      subscriber(channel, data);
    }
  }

  get lastSeq(): number {
    return this.timeline.length;
  }

  /** The corpus's edge of history — the LIVE boundary on the data's clock. */
  get maxEventTs(): number {
    return this.timeline.length > 0 ? this.timeline[this.timeline.length - 1].ts : 0;
  }

  /** Sequence position of the last delta at or before a ms timestamp. */
  seqAt(t: number): number {
    let seq = 0;
    for (const delta of this.timeline) {
      if (delta.ts > t) break;
      seq = delta.seq;
    }
    return seq;
  }

  /** Slice as of a ms timestamp (or now for live). */
  sliceAsOf(t: number): { nodes: EngineNode[]; edges: EngineEdge[]; seq: number } {
    const nodes = new Map<string, EngineNode>();
    const edges = new Map<string, EngineEdge>();
    let seq = 0;
    for (const delta of this.timeline) {
      if (delta.ts > t) break;
      seq = delta.seq;
      if (delta.node) {
        if (delta.op === "remove") nodes.delete(delta.node.id);
        else nodes.set(delta.node.id, delta.node);
      }
      if (delta.edge) {
        if (delta.op === "remove") edges.delete(delta.edge.id);
        else edges.set(delta.edge.id, delta.edge);
      }
    }
    // Historical views: declared + structural + temporal only (§5).
    // Classified against the CORPUS's clock, never the wall clock (audit
    // finding asof-wallclock-historical-012).
    const historical = t < this.maxEventTs;
    const edgeList = [...edges.values()]
      .filter((e) => !historical || e.tier !== "semantic")
      .filter((e) => this.tierServed(e));
    return { nodes: [...nodes.values()], edges: edgeList, seq };
  }

  /**
   * Degradation gates CONTENT, not just the block (audit finding
   * degraded-tier-still-served-011): a degraded tier's edges — and
   * meta-edges whose breakdown is exclusively that tier — drop out.
   */
  private tierServed(edge: EngineEdge): boolean {
    if (edge.meta) {
      return Object.keys(edge.meta.breakdown_by_tier).some(
        (tier) => !this.degradations.has(tier),
      );
    }
    return !this.degradations.has(edge.tier);
  }

  /** The fetch-shaped transport the EngineClient plugs into. */
  fetchImpl: FetchLike = (input, init) => {
    const url = new URL(input, "http://mock.local");
    const path = url.pathname.replace(/^\/api/, "");
    const params = url.searchParams;
    try {
      if (path === "/stream") return Promise.resolve(this.streamResponse(params));
      const body = this.route(path, params, init);
      return Promise.resolve(json(body));
    } catch (err) {
      if (err instanceof RouteError) {
        return Promise.resolve(
          json({ ok: false, error: err.message, tiers: this.tiersBlock() }, err.status),
        );
      }
      throw err;
    }
  };

  // --- routes ----------------------------------------------------------------

  private route(path: string, params: URLSearchParams, init?: RequestInit): unknown {
    const tiers = this.tiersBlock();
    const c = this.corpus;
    if (path === "/status") {
      return {
        ok: true,
        nodes: this.noVault ? 0 : c.nodes.length,
        edges: this.noVault ? 0 : c.edges.length,
        degradations: [...this.degradations.keys()],
        tiers,
        git: { branch: "main", ahead: 0, behind: 0, dirty: [] },
        core: { reachable: true, vault_health: "green" },
        rag: this.degradations.has("semantic")
          ? { service: "stopped" }
          : { service: "running", watcher: "watching", index: "fresh", jobs: 0 },
      };
    }
    if (path === "/map") {
      return {
        repositories: [
          {
            path: "/repo",
            branches: [
              { name: "main", kind: "default" },
              { name: "feature/timeline", kind: "feature" },
            ],
            worktrees: [
              {
                id: MOCK_SCOPE,
                path: "/repo",
                branch: "main",
                has_vault: true,
                is_default: true,
              },
              {
                id: "wt-bare",
                path: "/repo-bare",
                branch: "feature/timeline",
                has_vault: false,
                degraded: ["structural"],
              },
            ],
          },
        ],
        tiers,
      };
    }
    if (path === "/vault-tree") {
      requireScope(params);
      return { entries: this.noVault ? [] : c.vaultTree, tiers };
    }
    if (path === "/graph/query") {
      // Match the live serve wire (contract §4, engine addendum S02): the
      // request's granularity selects document edges OR feature-convergence
      // nodes plus a SEPARATE meta_edges array (edges empty) — never folded
      // into edges. Document is the default, mirroring the engine. Degraded
      // tiers gate content here too (011); an absent corpus serves
      // nothing (035).
      const reqBody = init?.body
        ? (JSON.parse(String(init.body)) as { granularity?: string; filter?: unknown })
        : {};
      const filter = reqBody.filter;
      if (this.noVault) {
        return { nodes: [], edges: [], meta_edges: [], filter, tiers };
      }
      if (reqBody.granularity === "feature") {
        return {
          nodes: c.nodes.filter((n) => n.kind === "feature"),
          edges: [],
          meta_edges: c.metaEdges.filter((e) => this.tierServed(e)).map(toWireMetaEdge),
          filter,
          tiers,
        };
      }
      return {
        nodes: c.nodes.filter((n) => n.kind !== "feature"),
        edges: c.edges.filter((e) => this.tierServed(e)),
        meta_edges: [],
        filter,
        tiers,
      };
    }
    if (path === "/filters") {
      requireScope(params);
      return {
        relations: [...new Set(c.edges.map((e) => e.relation))].sort(),
        tiers: ["declared", "structural", "temporal", "semantic"],
        doc_types: ["research", "adr", "plan", "exec", "audit"],
        feature_tags: c.features,
        kinds: [...new Set(c.nodes.map((n) => n.kind))].sort(),
        date_bounds: {
          from: c.events[0]?.ts,
          to: c.events[c.events.length - 1]?.ts,
        },
        tiers_block: tiers,
      };
    }
    const nodeMatch = /^\/nodes\/([^/]+)(\/(neighbors|evidence|discover))?$/.exec(path);
    if (nodeMatch) {
      const id = decodeURIComponent(nodeMatch[1]);
      const sub = nodeMatch[3];
      const node = c.nodes.find((n) => n.id === id);
      if (!node) throw new RouteError(404, `unknown node ${id}`);
      if (!sub) {
        return { node, interior: this.interiorOf(id), tiers };
      }
      if (sub === "neighbors") {
        const incident = c.edges.filter(
          (e) => (e.src === id || e.dst === id) && this.tierServed(e),
        );
        const ids = new Set([id, ...incident.flatMap((e) => [e.src, e.dst])]);
        return {
          nodes: c.nodes.filter((n) => ids.has(n.id)),
          edges: incident,
          tiers,
        };
      }
      if (sub === "evidence") {
        return {
          documents: c.vaultTree
            .filter((e) => node.feature_tags?.some((t) => e.feature_tags.includes(t)))
            .map((e) => ({ path: e.path, doc_type: e.doc_type })),
          code_locations: [
            {
              path: `src/${node.feature_tags?.[0] ?? "core"}/mod.rs`,
              state: "resolved",
            },
          ],
          commits: [
            {
              sha: "abc1234",
              subject: `feat: ${node.title ?? id}`,
              // The correlating rule is the attribution that makes a
              // correlated commit honest (finding 028).
              rule: "step-id-correlation",
            },
          ],
          tiers,
        };
      }
      if (sub === "discover") {
        if (this.degradations.has("semantic")) {
          throw new RouteError(502, "rag service down");
        }
        return {
          candidates: c.edges.filter((e) => e.tier === "semantic" && e.src === id),
          tiers,
        };
      }
    }
    if (path === "/events") {
      requireScope(params);
      const from = params.get("from") ? Date.parse(params.get("from")!) : -Infinity;
      const to = params.get("to") ? Date.parse(params.get("to")!) : Infinity;
      const source = this.noVault
        ? c.events.filter((e) => e.kind === "commit") // git still live (§8)
        : this.lifecycleSparse
          ? c.events.filter((e) => e.kind === "commit" || e.kind.startsWith("doc-"))
          : c.events;
      const within = source.filter((e) => {
        const ts = Date.parse(e.ts);
        return ts >= from && ts <= to;
      });
      const bucket = params.get("bucket");
      if (bucket && bucket !== "raw") {
        return { buckets: bucketEvents(within, bucket), tiers };
      }
      return { events: within, tiers };
    }
    if (path === "/graph/asof") {
      requireScope(params);
      const t = Number(params.get("t"));
      const slice = this.sliceAsOf(t);
      return { nodes: slice.nodes, edges: slice.edges, t, seq: slice.seq, tiers };
    }
    if (path === "/graph/diff") {
      requireScope(params);
      // The window is keyed on SEQ, mirroring the stream's since= splice:
      // ts boundaries resolve to sequence positions first, so ts-collision
      // siblings can never be dropped at the boundary (audit finding
      // diff-splice-lossy-ts-010).
      const fromSeq = this.seqAt(Number(params.get("from")));
      const toSeq = this.seqAt(Number(params.get("to")));
      const deltas = this.timeline
        .filter((d) => d.seq > fromSeq && d.seq <= toSeq)
        .map(({ op, node, edge, t, seq }) => ({ op, node, edge, t, seq }));
      return { deltas, last_seq: this.lastSeq, tiers };
    }
    if (path === "/search") {
      if (this.degradations.has("semantic")) {
        throw new RouteError(502, "rag service down");
      }
      return {
        results: c.nodes
          .filter((n) => n.kind !== "feature")
          .slice(0, 8)
          .map((n, i) => ({
            score: 0.9 - i * 0.07,
            source: n.title ?? n.id,
            excerpt: `…${n.title ?? n.id}…`,
            node_id: n.id,
          })),
        tiers,
      };
    }
    const ops = /^\/ops\/(core|rag)\/([^/]+)$/.exec(path);
    if (ops) {
      if (ops[1] === "rag" && this.degradations.has("semantic")) {
        throw new RouteError(502, "rag service down");
      }
      return { ok: true, envelope: { status: "success", verb: ops[2] }, tiers };
    }
    throw new RouteError(404, `no mock route for ${path}`);
  }

  private interiorOf(id: string) {
    const interior = this.corpus.planInteriors.get(id);
    if (!interior) return undefined;
    return { nodes: interior.nodes, edges: interior.edges, tiers: this.tiersBlock() };
  }

  // --- SSE -----------------------------------------------------------------------

  private streamResponse(params: URLSearchParams): Response {
    const channels = new Set((params.get("channels") ?? "").split(","));
    const since = params.get("since");
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const send = (channel: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${channel}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        };
        // Splice semantics (§7): resume from a known seq or signal the gap.
        // When `since` is provided this is a bounded replay request: emit
        // the missed deltas in order and close the stream (the replay window
        // is finite; no live-tail subscription is added). This lets a
        // refetch-after-reconnect pattern resolve cleanly in tests that model
        // the idempotent splice (§7) — the stream terminates once caught up.
        if (channels.has("graph") && since !== null) {
          const sinceSeq = Number(since);
          if (sinceSeq < this.lastSeq) {
            for (const d of this.timeline.filter((d) => d.seq > sinceSeq)) {
              send("graph", {
                op: d.op,
                node: d.node,
                edge: d.edge,
                t: d.t,
                seq: d.seq,
              });
            }
          }
          // Replay complete — close the stream so callers (e.g. refetchQueries)
          // can settle without waiting for an indefinitely-open connection.
          controller.close();
          return;
        }
        // No since= → live-tail mode: stay open for pushed events.
        const subscriber: StreamSubscriber = (channel, data) => {
          if (channels.has(channel)) send(channel, data);
        };
        this.subscribers.add(subscriber);
        unsubscribe = () => this.subscribers.delete(subscriber);
      },
      cancel: () => {
        unsubscribe?.();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }
}

class RouteError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function requireScope(params: URLSearchParams): void {
  if (!params.get("scope")) throw new RouteError(400, "scope is required");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function bucketEvents(
  events: EngineEvent[],
  bucket: string,
): { from: string; to: string; counts_by_kind: Record<string, number> }[] {
  const sizeMs = bucket === "1h" ? 3600_000 : 24 * 3600_000; // auto/1d → daily
  const buckets = new Map<number, Record<string, number>>();
  for (const event of events) {
    const slot = Math.floor(Date.parse(event.ts) / sizeMs) * sizeMs;
    const counts = buckets.get(slot) ?? {};
    counts[event.kind] = (counts[event.kind] ?? 0) + 1;
    buckets.set(slot, counts);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([slot, counts_by_kind]) => ({
      from: new Date(slot).toISOString(),
      to: new Date(slot + sizeMs).toISOString(),
      counts_by_kind,
    }));
}

// --- app bootstrap installation ----------------------------------------------------

let instance: MockEngine | null = null;

/** The process-wide mock instance (created on first use). */
export function getMockEngine(): MockEngine {
  if (!instance) instance = new MockEngine();
  return instance;
}
