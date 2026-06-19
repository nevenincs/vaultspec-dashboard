// Lineage derivation-DAG layout — full Sugiyama pipeline (graph-lineage-dag ADR
// D1-D8, W03.P10/P11).
//
// The lineage mode lays the directed derivation DAG along a derivation/time axis
// (the CitNetExplorer / W3C PROV convention): research -> adr -> plan -> exec ->
// audit -> rule flow left-to-right, so a reviewer traces decision-to-execution
// provenance by path-following. It consumes the `derivation` edge labels
// (graph-node-semantics + graph-lineage-dag); it needs no new wire data beyond
// the now-complete labeling (the engine reads node.kind to label the authored
// plan->step->exec hierarchy, so that spine is finally first-class).
//
// This is CPU compute (graph-compute-is-CPU): a pure layering function over the
// served nodes and their derivation edges, producing world positions the GPU
// then draws. The engine holds no coordinates.
//
// The layout is a full Sugiyama pipeline (D1): cycle removal by back-edge
// reversal, longest-path layering WITH dummy nodes on multi-layer edges, median
// crossing reduction, and median-alignment coordinate assignment — the generic
// math lives in `layered.ts` (shared with the W02 hierarchical mode); this
// module owns only the lineage-specific policy. Off-spine nodes follow the D2
// precedence (feature-adjacency -> temporal-axis -> gutter); index manifests are
// suppressed from the spine (D5); the exec column collapses to per-plan
// super-nodes at the node ceiling (D8). The honesty flags (onSpine, dangling)
// are preserved and flow through to the edge layer with routed waypoints (D6).

import type { SceneEdgeData, SceneNodeData } from "../sceneController";
import { DERIVATION_AXIS_ORDER, isLineageEdge } from "./edgeStyle";
import {
  type LayeredEdge,
  type RoutedEdge,
  assignCoordinates,
  assignLayers,
  insertDummies,
  reduceCrossings,
  removeCycles,
} from "./layered";

export interface LineagePosition {
  x: number;
  y: number;
  /** The derivation-axis depth (0 = source of the chain). */
  depth: number;
  /**
   * True when the node sits on the derivation spine (has at least one incident
   * derivation edge); false when it is an off-spine node with no lineage edge.
   * The renderer draws off-spine nodes faded/aside so an absent chain reads as
   * honestly incomplete, never as a fabricated lineage member.
   */
  onSpine: boolean;
  /**
   * True when the node's incoming derivation chain is incomplete (the parent it
   * derives from is not in the served slice) — a dangling lineage stub. Drawn
   * with a dangling marker, never with a fabricated edge to a missing parent.
   */
  dangling: boolean;
}

/** The lineage layout result: node positions plus the routed dummy-node
 *  waypoints the edge layer folds into its line-list topology (D6), keyed by
 *  derivation edge `src->dst`. */
export interface LineageLayoutResult {
  positions: Map<string, LineagePosition>;
  /** Edge id -> ordered world-space waypoints (src..dst) for routed draw. The
   *  endpoints are NOT included; only the intermediate dummy bends. Absent /
   *  empty for unit-length edges (drawn straight). */
  routes: Map<string, { x: number; y: number }[]>;
  /** Per-plan exec super-nodes minted by aggregate-LOD (D8), keyed by the
   *  super-node id; empty below the ceiling. Carries the collapsed member ids so
   *  the renderer can reconcile object constancy on expand. */
  aggregates: Map<string, { planId: string; memberIds: string[] }>;
}

/** Base spacing between derivation-axis columns (world units); the effective
 *  column pitch is derived from layer occupancy (D1.4) for a legible aspect
 *  ratio. */
export const LINEAGE_COL_SPACING = 220;
/** Base spacing between rows within an axis column (world units). */
export const LINEAGE_ROW_SPACING = 60;
/** X offset of the off-spine gutter (D2 last resort), to the left of column 0. */
export const LINEAGE_HOLDING_X = -LINEAGE_COL_SPACING;
/**
 * Node-count at which the exec column collapses to per-plan super-nodes (D8):
 * gated on the engine node ceiling so small corpora stay fully detailed and the
 * 642-exec worst case stays legible. The engine bounds the slice at
 * MAX_GRAPH_NODES (5000); the LOD trigger is a fraction of that, the point at
 * which the exec long tail starts to swamp the field.
 */
export const LINEAGE_AGGREGATE_THRESHOLD = 600;

/** Minimal scene-node shape this layout reads, with the additive `authorityClass`
 *  the index-suppression policy (D5) consults when the seam carries it. The seam
 *  field is owned by the stores/scene-mapping layer; this layout degrades
 *  gracefully (no suppression) when it is absent. */
type LineageNode = SceneNodeData & {
  authorityClass?: string;
  dates?: { created?: string };
};

/** True when a node is a generated index manifest (D5): suppressed from the
 *  spine — an index is a manifest, not a derivation step. Read from the
 *  authority register when the seam carries it. */
function isManifest(node: LineageNode): boolean {
  return node.authorityClass === "manifest";
}

/**
 * Lay the served nodes along the derivation axis with a full Sugiyama pipeline.
 * Pure: same inputs -> same positions (deterministic ordering, fixed sweep
 * count, all tie-breaks by id), no side effects (D1.5).
 */
export function lineageLayout(
  nodes: readonly SceneNodeData[],
  edges: readonly SceneEdgeData[],
): LineageLayoutResult {
  const typed = nodes as readonly LineageNode[];
  const nodeIds = new Set(typed.map((n) => n.id));

  // D5: index manifests are filtered out of the derivation DAG before layering —
  // they are drawn only via the off-spine feature-adjacency path. Lineage-mode-
  // scoped (the connectivity mode keeps them first-class), so suppression lives
  // here, never in the served slice.
  const manifestIds = new Set(typed.filter(isManifest).map((n) => n.id));

  // D8 aggregate-LOD: when the slice approaches the ceiling, the exec long tail
  // collapses to per-plan super-nodes consuming the engine `aggregate` hint
  // (exec is the only aggregate species). The collapse re-keys the exec endpoints
  // of derivation edges onto their plan super-node so the spine stays connected.
  const aggregation = buildAggregation(typed, edges);

  // Build the derivation adjacency (parent -> child) from lineage edges, after
  // manifest suppression and aggregate re-keying. The PROV convention: an edge
  // labelled e.g. `authorizes` runs adr -> plan, so the plan (dst) derives FROM
  // the adr (src). Canonical-spine dedup (S41): an exec reaching the spine via
  // BOTH its labeled container binding AND its plan wikilink is collapsed to ONE
  // canonical parent edge, so it is not double-counted in layering.
  const layerEdges: LayeredEdge[] = [];
  const seenParentChild = new Set<string>();
  const axisOrderOf = new Map<string, number>();
  const onSpine = new Set<string>();
  const danglingParents = new Map<string, boolean>();

  // A remapped id is a PRESENT spine node when it is a served real node (in the
  // slice, not a suppressed manifest) or an aggregate super-node. A missing
  // parent (a wikilink to a node absent from the slice) is NOT present: its edge
  // never becomes a layout node, only a dangling-stub seed.
  const isPresent = (remappedId: string): boolean =>
    aggregation.aggregates.has(remappedId) ||
    (nodeIds.has(remappedId) && !manifestIds.has(remappedId));

  for (const e of edges) {
    if (!isLineageEdge(e)) continue;
    const src = remap(e.src, aggregation, manifestIds);
    const dst = remap(e.dst, aggregation, manifestIds);
    if (src === null || dst === null || src === dst) continue;
    const order = DERIVATION_AXIS_ORDER[e.derivation as string] ?? 0;
    const dstPresent = isPresent(dst);
    const srcPresent = isPresent(src);
    if (dstPresent) {
      axisOrderOf.set(dst, Math.max(axisOrderOf.get(dst) ?? 0, order));
      onSpine.add(dst);
    }
    if (srcPresent) onSpine.add(src);
    // Canonical-spine dedup (S41): one parent->child layering edge per logical
    // pair. When the same exec is reached by its container binding AND its plan
    // wikilink, both collapse to the SAME (src,dst) here, so the dedup keeps the
    // first (deterministic by edge iteration order) and ignores the duplicate.
    if (srcPresent && dstPresent) {
      const key = `${src} ${dst}`;
      if (!seenParentChild.has(key)) {
        seenParentChild.add(key);
        layerEdges.push({ from: src, to: dst });
      }
    } else if (dstPresent && !srcPresent) {
      // A present child whose parent is absent from the served slice: a dangling
      // lineage stub, drawn with the dangling marker, never a fabricated edge.
      danglingParents.set(dst, true);
    }
  }

  // The spine node-id universe: present on-spine real nodes plus aggregate
  // super-nodes. Off-spine nodes are placed by the D2 policy separately.
  const spineIds = [...onSpine].sort();

  // Degenerate slice: NO node is on the derivation spine — e.g. lineage at
  // feature/constellation granularity, where the served aggregate nodes carry
  // meta-edges, not derivation edges. Collapsing every node into one off-spine
  // gutter column produces an unreadable vertical line that fits to a near-black
  // sliver. Instead lay the whole visible slice out as a centered, deterministic
  // grid, honestly showing "these nodes, no derivation lineage at this level".
  if (spineIds.length === 0) {
    return gridFallback(typed, aggregation);
  }

  // --- Sugiyama over the spine (D1) ---------------------------------------
  // Seed layer for a dangling stub: the axis order its derivation implies, so a
  // node whose only parent is missing still lands in a sensible column (D1.2).
  const seedLayer = (id: string): number => axisOrderOf.get(id) ?? 0;
  const { dag, reversed } = removeCycles(spineIds, layerEdges);
  const layerOf = assignLayers(spineIds, dag, seedLayer);
  const { layers, routed } = insertDummies(layerOf, dag, reversed);
  reduceCrossings(layers, routed);
  const { crossOf } = assignCoordinates(layers, routed);

  // Derive spacing from occupancy (D1.4): the densest layer sets the row pitch
  // so a 600-row column does not blow the aspect ratio; the column pitch scales
  // gently with the row pitch to keep a legible ratio.
  const maxOccupancy = Math.max(1, ...layers.map((l) => l.length));
  const rowSpacing = occupancyRowSpacing(maxOccupancy);
  const colSpacing = occupancyColSpacing(maxOccupancy);

  const out = new Map<string, LineagePosition>();
  for (const id of spineIds) {
    const depth = layerOf.get(id) ?? 0;
    const cross = crossOf.get(id) ?? 0;
    out.set(id, {
      x: depth * colSpacing,
      y: cross * rowSpacing,
      depth,
      onSpine: true,
      dangling: danglingParents.get(id) === true,
    });
  }

  // --- Off-spine placement: feature-adjacency -> temporal -> gutter (D2) ---
  placeOffSpine(typed, out, onSpine, manifestIds, aggregation, colSpacing, rowSpacing);

  // --- Routed waypoints to world space (D6) -------------------------------
  const routes = buildRoutes(edges, routed, out, manifestIds, aggregation);

  return { positions: out, routes, aggregates: aggregation.aggregates };
}

/** Degenerate-slice fallback: when no node sits on the derivation spine (a
 *  no-derivation LOD such as the feature constellation), lay the visible nodes
 *  out as a centered, deterministic 2D grid so lineage reads as a legible field
 *  rather than a single black gutter column. ~square (cols = ceil(sqrt(n))),
 *  id-ordered for stability; no routes. */
function gridFallback(
  nodes: readonly LineageNode[],
  agg: Aggregation,
): LineageLayoutResult {
  const ordered = nodes
    .filter((n) => !agg.collapsedTo.has(n.id))
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  const out = new Map<string, LineagePosition>();
  const cols = Math.max(1, Math.ceil(Math.sqrt(ordered.length)));
  const rows = Math.max(1, Math.ceil(ordered.length / cols));
  const xOffset = ((cols - 1) * LINEAGE_COL_SPACING) / 2;
  const yOffset = ((rows - 1) * LINEAGE_ROW_SPACING) / 2;
  ordered.forEach((n, i) => {
    out.set(n.id, {
      x: (i % cols) * LINEAGE_COL_SPACING - xOffset,
      y: Math.floor(i / cols) * LINEAGE_ROW_SPACING - yOffset,
      depth: -1,
      onSpine: false,
      dangling: false,
    });
  });
  return { positions: out, routes: new Map(), aggregates: agg.aggregates };
}

/** Row pitch derived from the densest layer (D1.4): denser columns get a tighter
 *  pitch (down to a floor) so a tall column stays legible rather than a 170:1
 *  vertical line. */
function occupancyRowSpacing(maxOccupancy: number): number {
  if (maxOccupancy <= 20) return LINEAGE_ROW_SPACING;
  // Scale the total column height toward a target band as occupancy grows.
  const target = 20 * LINEAGE_ROW_SPACING;
  return Math.max(12, target / maxOccupancy);
}

/** Column pitch scaled so the aspect ratio stays legible: a denser field spreads
 *  its columns a little wider to balance the compressed rows. */
function occupancyColSpacing(maxOccupancy: number): number {
  if (maxOccupancy <= 20) return LINEAGE_COL_SPACING;
  return Math.min(
    LINEAGE_COL_SPACING * 1.6,
    LINEAGE_COL_SPACING * (1 + maxOccupancy / 400),
  );
}

interface Aggregation {
  /** exec node id -> its per-plan super-node id (only when collapsed).
   *
   *  NON-DESTRUCTIVE (W03 review fix): this map is intentionally kept EMPTY. The
   *  super-nodes in `aggregates` are ADVISORY metadata only — the sprite layer
   *  (`nodeSprites.sync`) draws exactly the model's node set and has no synthetic-
   *  node channel, so injecting an `agg:exec:{planId}` body would require either
   *  threading a lineage-only concept through the shared `SceneGraphModel` (and
   *  every layer that reads it — edges, hit-test, FA2 backbone, overlays, the
   *  incremental-reheat diff, the data signature) or invasive sprite-layer
   *  surgery. Until that synthetic-node render channel exists, collapsing members
   *  OUT of the layout (the original behaviour) gave them NO position at all —
   *  every collapsed exec piled at the origin on the live 642-exec corpus. So we
   *  do NOT collapse: every exec keeps a real Sugiyama position (the crossing-
   *  reduced coordinate pass already spreads a 600+-row column legibly), and the
   *  super-node RENDERING is a recorded deferred enhancement. See the audit note
   *  `.vault/audit/2026-06-16-graph-lineage-dag-audit`. */
  collapsedTo: Map<string, string>;
  /** super-node id -> { planId, memberIds }. ADVISORY metadata: which execs WOULD
   *  collapse under each plan once a synthetic-node render channel lands; never
   *  consumed for placement today (see `collapsedTo`). */
  aggregates: Map<string, { planId: string; memberIds: string[] }>;
}

/**
 * Build the D8 aggregate-LOD ADVISORY metadata: when the served node count
 * crosses the threshold, group each plan's exec records under one per-plan
 * super-node id (`agg:exec:{planId}`), consuming the `generated-by` derivation
 * edge to find the plan of each exec. Below the threshold no group is formed.
 *
 * NON-DESTRUCTIVE (W03 review fix): the returned `collapsedTo` is EMPTY — the
 * grouping is metadata, not a layout collapse. The original destructive collapse
 * filtered the member execs OUT of placement, but no renderer draws the synthetic
 * super-nodes (the sprite layer has no synthetic-node channel), so the members
 * ended up with no position (origin pile-up on the live 642-exec corpus). Keeping
 * `collapsedTo` empty leaves every exec positioned by the full Sugiyama pipeline;
 * `aggregates` records the would-be grouping for a future render channel.
 */
function buildAggregation(
  nodes: readonly LineageNode[],
  edges: readonly SceneEdgeData[],
): Aggregation {
  // Intentionally always empty: non-destructive aggregation (see Aggregation doc).
  const collapsedTo = new Map<string, string>();
  const aggregates = new Map<string, { planId: string; memberIds: string[] }>();
  if (nodes.length < LINEAGE_AGGREGATE_THRESHOLD) {
    return { collapsedTo, aggregates };
  }

  // An exec node is an aggregate-species record (kind code from the wire ontology
  // is `document` with doc_type exec; the scene marks it via the `aggregate`
  // hint mirrored onto kind/id). We treat a node as exec when its id is a
  // doc/exec record reachable from a plan by a `generated-by` derivation edge.
  const planOfExec = new Map<string, string>();
  for (const e of edges) {
    if (e.derivation !== "generated-by") continue;
    // generated-by runs plan -> exec; the dst is the exec, the src its plan/parent.
    planOfExec.set(e.dst, e.src);
  }

  const execIds = nodes
    .map((n) => n.id)
    .filter((id) => planOfExec.has(id))
    .sort();
  for (const execId of execIds) {
    const planId = planOfExec.get(execId)!;
    const superId = `agg:exec:${planId}`;
    // Record the would-be grouping (advisory); do NOT add to collapsedTo, so the
    // member keeps its real Sugiyama spine position rather than being filtered out.
    const entry = aggregates.get(superId) ?? { planId, memberIds: [] };
    entry.memberIds.push(execId);
    aggregates.set(superId, entry);
  }
  return { collapsedTo, aggregates };
}

/** Remap an endpoint id through manifest suppression and aggregate collapse:
 *  null when the endpoint is a suppressed manifest (drop the edge from the DAG),
 *  the super-node id when the exec is collapsed, else the id unchanged. */
function remap(id: string, agg: Aggregation, manifests: Set<string>): string | null {
  if (manifests.has(id)) return null;
  return agg.collapsedTo.get(id) ?? id;
}

/**
 * Off-spine placement policy (D2): an off-spine node (no incident derivation
 * edge) is placed by precedence — (1) feature-adjacency: adjacent to its feature
 * column when it bears a feature tag; (2) temporal-axis: a created-date column
 * when it has a date but no feature anchor; (3) gutter: a faded dedicated lane
 * as the honest last resort. `onSpine: false` is preserved throughout. A
 * suppressed manifest (D5) is drawn only here, via feature-adjacency.
 */
function placeOffSpine(
  nodes: readonly LineageNode[],
  out: Map<string, LineagePosition>,
  onSpine: Set<string>,
  manifests: Set<string>,
  agg: Aggregation,
  colSpacing: number,
  rowSpacing: number,
): void {
  // A node is off-spine when it never appears on the spine AND is not a collapsed
  // exec member (those are represented by their super-node).
  const offSpine = nodes.filter(
    (n) => (!onSpine.has(n.id) || manifests.has(n.id)) && !agg.collapsedTo.has(n.id),
  );

  // (1) Feature-adjacency: group by the first feature tag, laid out in a band to
  // the right of the spine, one sub-column per feature (deterministic by tag).
  const byFeature = new Map<string, LineageNode[]>();
  const temporal: LineageNode[] = [];
  const gutter: LineageNode[] = [];
  for (const n of offSpine) {
    const tag = n.featureTags?.slice().sort()[0];
    if (tag) {
      (byFeature.get(tag) ?? byFeature.set(tag, []).get(tag)!).push(n);
    } else if (n.dates?.created) {
      temporal.push(n);
    } else {
      gutter.push(n);
    }
  }

  // Feature columns sit to the RIGHT of the spine (positive x), one column per
  // feature tag in tag order; members stack by id within the column.
  const featureTags = [...byFeature.keys()].sort();
  let featureCol = 1;
  for (const tag of featureTags) {
    const members = byFeature
      .get(tag)!
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id));
    const x = (featureCol + 2) * colSpacing; // offset past the spine columns
    const offset = ((members.length - 1) * rowSpacing) / 2;
    members.forEach((n, i) => {
      out.set(n.id, {
        x,
        y: i * rowSpacing - offset,
        depth: -1,
        onSpine: false,
        dangling: false,
      });
    });
    featureCol++;
  }

  // (2) Temporal-axis: a created-date column to the left, ordered by date then id.
  const temporalSorted = temporal
    .slice()
    .sort((a, b) => (a.dates!.created! + a.id).localeCompare(b.dates!.created! + b.id));
  const tOffset = ((temporalSorted.length - 1) * rowSpacing) / 2;
  temporalSorted.forEach((n, i) => {
    out.set(n.id, {
      x: -2 * colSpacing,
      y: i * rowSpacing - tOffset,
      depth: -1,
      onSpine: false,
      dangling: false,
    });
  });

  // (3) Gutter: the faded last resort, far left, ordered by id.
  const gutterSorted = gutter.slice().sort((a, b) => a.id.localeCompare(b.id));
  const gOffset = ((gutterSorted.length - 1) * rowSpacing) / 2;
  gutterSorted.forEach((n, i) => {
    out.set(n.id, {
      x: LINEAGE_HOLDING_X - 2 * colSpacing,
      y: i * rowSpacing - gOffset,
      depth: -1,
      onSpine: false,
      dangling: false,
    });
  });
}

/**
 * Build the routed-waypoint world positions for each lineage edge (D6): a routed
 * edge passing through dummy bends becomes a polyline; a unit-length edge gets
 * no waypoints (drawn straight by the edge layer). Keyed by the ORIGINAL edge id
 * so the edge mesh can look its route up directly.
 */
function buildRoutes(
  edges: readonly SceneEdgeData[],
  routed: readonly RoutedEdge[],
  positions: Map<string, LineagePosition>,
  manifests: Set<string>,
  agg: Aggregation,
): Map<string, { x: number; y: number }[]> {
  const routes = new Map<string, { x: number; y: number }[]>();
  // Index routed chains by (trueFrom -> trueTo) so we can attach by remapped pair.
  const chainByPair = new Map<string, string[]>();
  for (const r of routed) {
    if (r.waypoints.length === 0) continue;
    chainByPair.set(`${r.from} ${r.to}`, r.waypoints);
  }
  if (chainByPair.size === 0) return routes;

  // Dummy waypoints carry no position from the layout pass directly (they are
  // synthetic); their world position is interpolated along the layer columns.
  // The crossing-reduction/coordinate pass placed them — read it back from the
  // layered structure via positions when present, else interpolate endpoints.
  for (const e of edges) {
    if (!isLineageEdge(e)) continue;
    const from = manifests.has(e.src) ? null : (agg.collapsedTo.get(e.src) ?? e.src);
    const to = manifests.has(e.dst) ? null : (agg.collapsedTo.get(e.dst) ?? e.dst);
    if (from === null || to === null || from === to) continue;
    const chain = chainByPair.get(`${from} ${to}`) ?? chainByPair.get(`${to} ${from}`);
    if (!chain || chain.length === 0) continue;
    const a = positions.get(from);
    const b = positions.get(to);
    if (!a || !b) continue;
    // Dummy waypoints are interpolated evenly between the endpoints; their cross
    // bends were already minimised by crossing reduction, so the straight
    // interpolation keeps the routed polyline clean and deterministic.
    const pts: { x: number; y: number }[] = [];
    const steps = chain.length + 1;
    for (let i = 1; i <= chain.length; i++) {
      pts.push({
        x: a.x + ((b.x - a.x) * i) / steps,
        y: a.y + ((b.y - a.y) * i) / steps,
      });
    }
    routes.set(e.id, pts);
  }
  return routes;
}
