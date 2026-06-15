// Synthetic vault corpus fixtures (W02.P05.S18) — the data the mock engine
// (S19) serves. Mirrors the contract shapes at capability level: features
// with document lifecycles, plan interiors, tiered edges (declared along
// the lifecycle axis, structural with states, temporal with confidence,
// semantic candidates), engine-aggregated feature meta-edges, an event log
// with monotonic sequence numbers, and a vault tree. Deterministic (seeded
// PRNG) so tests and visual runs are comparable.

import type {
  EngineEdge,
  EngineEvent,
  EngineNode,
  VaultTreeEntry,
} from "../../stores/server/engine";

export interface FixtureCorpus {
  features: string[];
  /** Feature constellation nodes plus all document/code nodes. */
  nodes: EngineNode[];
  /** Document-level edges (all four tiers). */
  edges: EngineEdge[];
  /** Engine-aggregated feature↔feature meta-edges (contract §4). */
  metaEdges: EngineEdge[];
  /** Plan interior subgraphs keyed by plan node id. */
  planInteriors: Map<string, { nodes: EngineNode[]; edges: EngineEdge[] }>;
  /** Dated event log, ts-ascending, seq monotonic from 1. */
  events: EngineEvent[];
  vaultTree: VaultTreeEntry[];
  /**
   * The worktree file tree the mock `/file-tree` route serves (dashboard-code-
   * tree ADR): the ALREADY-ignore-filtered set of repo-relative paths (the live
   * engine excludes `.git`/build/vendored trees before listing, so the fixture
   * carries only what a real listing would show). The mock derives ONE directory
   * level per call from this flat path set, mirroring the live one-level grammar.
   * Some `src/<feature>/mod.rs` paths map to a `code:` graph node (the structural
   * tier indexed them — the interlink lights up); others have no node (the quiet
   * absent-interlink state).
   */
  codeTree: string[];
  /**
   * Per-lens salience scalar by node id (graph-node-salience ADR): the engine
   * serves a SINGLE `salience` for the REQUESTED lens, so the mock projects this
   * map at query time. Each entry is the node's [0,1] importance under each lens.
   * Computed deterministically from authority/type prior, centrality (degree),
   * and recency; the engine producer is an integration seam.
   */
  salienceByLens: Map<string, { status: number; design: number }>;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FEATURE_NAMES = [
  "editor-demo",
  "text-layout",
  "live-preview",
  "grid-engine",
  "auth-flow",
  "sync-service",
  "search-index",
  "graph-stage",
  "timeline-core",
  "vault-browser",
  "ops-panel",
  "glyph-family",
];

const DOC_TYPES = ["research", "adr", "plan", "exec", "audit"] as const;
const LIFECYCLE_RELATIONS: Record<string, string> = {
  adr: "resolves", // adr -resolves-> research
  plan: "implements", // plan -implements-> adr
  exec: "fulfills", // exec -fulfills-> plan
  audit: "reviews", // audit -reviews-> exec
};

// The ontology projection the live engine serves on document nodes
// (graph-node-semantics ADR): the authority register each doc_type answers in,
// mirrored byte-for-byte so the mock matches the live wire
// (mock-mirrors-live-wire-shape).
const AUTHORITY_CLASS: Record<string, string> = {
  adr: "design",
  research: "substrate",
  reference: "substrate",
  plan: "roadmap",
  exec: "evidence",
  audit: "judgment",
  rule: "law",
  index: "manifest",
};
const authorityClass = (docType: string): string =>
  AUTHORITY_CLASS[docType] ?? "unknown";

// The derivation label the live engine assigns to a pipeline edge between two
// document types (graph-node-semantics ADR): carried alongside the §4 relation,
// never instead of it. The representation layer's lineage layout consumes the
// resulting `derivation` field on the derivation axis.
const DERIVATION_BY_PAIR: Record<string, string> = {
  "adr->research": "grounds",
  "plan->adr": "authorizes",
  "exec->plan": "generated-by",
  "audit->exec": "reviews",
};

/** Per-lens type prior (graph-node-salience ADR): the design lens biases toward
 *  design authority (adr/research), the status lens toward in-flight roadmap
 *  authority (plan) and evidence. Mirrors the live salience model's shape so the
 *  mock orders the same node set the way the engine does. */
const TYPE_PRIOR: Record<string, { status: number; design: number }> = {
  research: { status: 0.25, design: 0.7 },
  adr: { status: 0.35, design: 0.95 },
  plan: { status: 0.95, design: 0.5 },
  exec: { status: 0.55, design: 0.15 },
  audit: { status: 0.45, design: 0.45 },
  feature: { status: 0.8, design: 0.8 },
  code: { status: 0.3, design: 0.2 },
  commit: { status: 0.4, design: 0.1 },
};

/** Deterministic D-dim embedding clustered by feature (graph-representation §4):
 *  a per-feature base vector plus per-doc-type jitter, so the semantic UMAP mode
 *  separates feature meaning-clusters legibly. Mirrors the additive `embedding`
 *  wire field shape the engine + rag serve. */
const EMBEDDING_DIM = 8;
function featureEmbedding(featureIndex: number, docTypeIndex: number): number[] {
  const v: number[] = [];
  for (let d = 0; d < EMBEDDING_DIM; d++) {
    const center = Math.sin((featureIndex + 1) * (d + 1) * 0.7);
    const offset = Math.cos((docTypeIndex + 1) * (d + 1) * 0.3) * 0.12;
    v.push(center + offset);
  }
  return v;
}

const BASE_TS = Date.parse("2026-01-05T09:00:00Z");
const DAY = 24 * 3600 * 1000;

const iso = (ts: number) => new Date(ts).toISOString();

export function buildFixtureCorpus(seed = 7): FixtureCorpus {
  const rand = mulberry32(seed);
  const features = FEATURE_NAMES.slice();
  const nodes: EngineNode[] = [];
  const edges: EngineEdge[] = [];
  const events: EngineEvent[] = [];
  const vaultTree: VaultTreeEntry[] = [];
  const planInteriors = new Map<string, { nodes: EngineNode[]; edges: EngineEdge[] }>();
  let seq = 0;
  const nextEvent = (ts: number, kind: string, ref: string, nodeIds: string[]) => {
    seq += 1;
    events.push({ id: `evt-${seq}`, ts: iso(ts), kind, ref, node_ids: nodeIds });
  };

  features.forEach((feature, fi) => {
    const featureId = `feature:${feature}`;
    const startTs = BASE_TS + fi * 9 * DAY;
    const docIds: Partial<Record<(typeof DOC_TYPES)[number], string>> = {};
    const total = 4 + Math.floor(rand() * 8);
    const done = Math.floor(rand() * (total + 1));
    const state = done === total ? "complete" : "active";

    nodes.push({
      id: featureId,
      kind: "feature",
      title: feature,
      feature_tags: [feature],
      dates: { created: iso(startTs), modified: iso(startTs + 6 * DAY) },
      lifecycle: { state, progress: { done, total } },
      degree_by_tier: { declared: 4, structural: 2, temporal: 2, semantic: 1 },
      // Documents converging on the feature (contract §4, engine S02): one
      // per doc type, the constellation center-of-gravity sizing input.
      member_count: DOC_TYPES.length,
    });

    DOC_TYPES.forEach((docType, di) => {
      const stem = `2026-01-${String(5 + fi).padStart(2, "0")}-${feature}-${docType}`;
      const docId = `doc:${stem}`;
      docIds[docType] = docId;
      const created = startTs + di * DAY;
      // Status/tier query-time facets (dashboard-pipeline-wire W01): an ADR
      // carries its H1 status, a plan its frontmatter tier — the exact facets
      // the live engine extracts and mirrors on doc nodes. Deterministic spread
      // so the in-flight projection has both included (proposed/accepted, active
      // plan) and excluded (rejected/deprecated, complete plan) artifacts.
      const adrStatus =
        docType === "adr"
          ? (["proposed", "accepted", "rejected", "deprecated"] as const)[fi % 4]
          : undefined;
      const planTier =
        docType === "plan" ? (["L1", "L2", "L3", "L4"] as const)[fi % 4] : undefined;
      nodes.push({
        id: docId,
        kind: docType,
        doc_type: docType,
        title: `${feature} ${docType}`,
        feature_tags: [feature],
        ...(adrStatus ? { status: adrStatus } : {}),
        ...(planTier ? { tier: planTier } : {}),
        dates: { created: iso(created), modified: iso(created + DAY) },
        lifecycle:
          docType === "plan"
            ? { state, progress: { done, total } }
            : { state: "complete" },
        degree_by_tier: { declared: 2, structural: 1 },
        // Ontology projection mirrored from the live wire
        // (graph-node-semantics ADR): the authority register and the
        // aggregate-species hint (only exec records collapse).
        authority_class: authorityClass(docType),
        aggregate: docType === "exec",
        // Per-node embedding (graph-representation §4): clustered by feature so
        // the semantic UMAP mode separates meaning-clusters.
        embedding: featureEmbedding(fi, di),
      });
      vaultTree.push({
        path: `.vault/${docType}/${stem}.md`,
        doc_type: docType,
        feature_tags: [feature],
        ...(adrStatus ? { status: adrStatus } : {}),
        ...(planTier ? { tier: planTier } : {}),
        dates: { created: iso(created), modified: iso(created + DAY) },
      });
      nextEvent(created, "doc-created", `${stem}.md`, [docId, featureId]);
      // Document belongs to its feature convergence. A feature-membership edge
      // carries no pipeline-derivation label (derivation: null), exactly as the
      // live engine serves it.
      edges.push({
        id: `e:${docId}->${featureId}:declares`,
        src: docId,
        dst: featureId,
        relation: "declares",
        tier: "declared",
        confidence: 1,
        provenance: "frontmatter",
        observed_at: iso(created),
        derivation: null,
      });
      // Lifecycle-axis declared edge to the previous doc type. The pipeline
      // pair carries its derivation label alongside the §4 relation
      // (graph-node-semantics ADR), mirrored from the live wire.
      const relation = LIFECYCLE_RELATIONS[docType];
      const prevType = DOC_TYPES[di - 1];
      const prev = docIds[prevType];
      if (relation && prev) {
        edges.push({
          id: `e:${docId}->${prev}:${relation}`,
          src: docId,
          dst: prev,
          relation,
          tier: "declared",
          confidence: 1,
          provenance: "wiki-link",
          observed_at: iso(created),
          // Pipeline-derivation label ALONGSIDE the declared tier
          // (graph-node-semantics): drives the representation lineage layout.
          derivation: (DERIVATION_BY_PAIR[`${docType}->${prevType}`] ??
            null) as EngineEdge["derivation"],
        });
      }
    });

    // Structural edge to a code artifact, state varies.
    const codeId = `code:src/${feature}/mod.rs`;
    nodes.push({ id: codeId, kind: "code", title: `src/${feature}/mod.rs` });
    // Deterministic state spread: every fifth feature carries a broken
    // link so the degradation surfaces always have data to show.
    const structuralState =
      fi % 5 === 3 ? "broken" : rand() < 0.3 ? "stale" : "resolved";
    edges.push({
      id: `e:${docIds.plan}->${codeId}:mentions`,
      src: docIds.plan!,
      dst: codeId,
      relation: "mentions",
      tier: "structural",
      // Broken structural edges carry confidence 0.0 on the wire
      // (engine-architect ruling W02P05-201): broken-ness is STATE, not
      // low confidence — selection rides the state facet, never a floor.
      confidence: structuralState === "broken" ? 0 : 1,
      state: structuralState,
      provenance: "path-extraction",
      observed_at: iso(startTs + 3 * DAY),
    });

    // Temporal edge: a commit correlated to the exec record.
    const sha = ((fi * 2654435761) % 0xffffff).toString(16).padStart(7, "0");
    const commitId = `commit:${sha}`;
    const commitTs = startTs + 4 * DAY + Math.floor(rand() * DAY);
    nodes.push({ id: commitId, kind: "commit", title: `feat: ${feature} step` });
    edges.push({
      id: `e:${commitId}->${docIds.exec}:correlates`,
      src: commitId,
      dst: docIds.exec!,
      relation: "correlates",
      tier: "temporal",
      confidence: 0.5 + rand() * 0.5,
      provenance: "co-occurrence",
      observed_at: iso(commitTs),
    });
    nextEvent(commitTs, "commit", sha, [commitId, docIds.exec!, featureId]);
    nextEvent(startTs + 5 * DAY, "step-checked", `${feature} S0${1 + (fi % 3)}`, [
      docIds.plan!,
      featureId,
    ]);

    // Semantic candidate to a neighboring feature's research doc.
    if (fi > 0) {
      const otherFeature = features[fi - 1];
      edges.push({
        id: `e:${docIds.research}->doc:2026-01-${String(4 + fi).padStart(2, "0")}-${otherFeature}-research:similar`,
        src: docIds.research!,
        dst: `doc:2026-01-${String(4 + fi).padStart(2, "0")}-${otherFeature}-research`,
        relation: "similar-to",
        tier: "semantic",
        confidence: 0.35 + rand() * 0.6, // capped below 1 by construction
        provenance: "rag",
        observed_at: iso(startTs + 6 * DAY),
      });
    }

    // Plan interior: 2 phases, `total` steps spread across them.
    const planId = docIds.plan!;
    const interiorNodes: EngineNode[] = [];
    const interiorEdges: EngineEdge[] = [];
    for (let s = 1; s <= total; s++) {
      const stepId = `${planId}#S${String(s).padStart(2, "0")}`;
      interiorNodes.push({
        id: stepId,
        kind: "step",
        title: `S${String(s).padStart(2, "0")}`,
        lifecycle: { state: s <= done ? "complete" : "active" },
      });
      interiorEdges.push({
        id: `e:${planId}->${stepId}:contains`,
        src: planId,
        dst: stepId,
        relation: "contains",
        tier: "declared",
        confidence: 1,
      });
    }
    planInteriors.set(planId, { nodes: interiorNodes, edges: interiorEdges });
  });

  // Engine-aggregated meta-edges between adjacent features (contract §4):
  // derived here exactly as the engine would — from underlying doc edges.
  const metaEdges: EngineEdge[] = [];
  const crossFeature = edges.filter((e) => e.tier === "semantic");
  const byPair = new Map<string, EngineEdge[]>();
  for (const e of crossFeature) {
    const srcFeature = nodes.find((n) => n.id === e.src)?.feature_tags?.[0];
    const dstFeature = e.dst.match(/doc:\d{4}-\d{2}-\d{2}-(.+)-research/)?.[1];
    if (!srcFeature || !dstFeature || srcFeature === dstFeature) continue;
    const key = [srcFeature, dstFeature].sort().join("|");
    byPair.set(key, [...(byPair.get(key) ?? []), e]);
  }
  for (const [key, pairEdges] of byPair) {
    const [a, b] = key.split("|");
    const breakdown: Record<string, number> = {};
    for (const e of pairEdges) {
      breakdown[e.tier] = (breakdown[e.tier] ?? 0) + 1;
    }
    metaEdges.push({
      id: `meta:${key}`,
      src: `feature:${a}`,
      dst: `feature:${b}`,
      relation: "related",
      tier: "semantic",
      confidence: Math.max(...pairEdges.map((e) => e.confidence)),
      meta: { count: pairEdges.length, breakdown_by_tier: breakdown },
    });
  }

  events.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  events.forEach((e, i) => (e.id = `evt-${i + 1}`));

  // The worktree file tree the mock serves: already ignore-filtered repo-relative
  // paths (no `.git`/build/vendored noise — the live engine excludes those before
  // listing). Each feature gets a `src/<feature>/mod.rs` (these MATCH the
  // `code:src/<feature>/mod.rs` graph nodes built above, so their interlink lights
  // up) plus a `src/<feature>/helpers.rs` with NO graph node (the quiet absent-
  // interlink state). Two root files round out a realistic root level.
  const codeTree: string[] = ["Cargo.toml", "README.md"];
  for (const feature of features) {
    codeTree.push(`src/${feature}/mod.rs`);
    codeTree.push(`src/${feature}/helpers.rs`);
  }

  // Per-lens salience (graph-node-salience ADR): a deterministic, defensible
  // blend of the per-lens type prior, rank-normalized degree (centrality proxy),
  // and recency. The status lens weights recency high; the design lens weights it
  // low (decisions are durable). Each criterion is in [0,1] and the blend is
  // clamped to [0,1]. The engine producer computes the real PPR/betweenness/
  // coreness field; this mirror is a realistic stand-in (integration seam).
  const salienceByLens = computeSalience(nodes, edges);

  return {
    features,
    nodes,
    edges,
    metaEdges,
    planInteriors,
    events,
    vaultTree,
    codeTree,
    salienceByLens,
  };
}

/** Deterministic per-lens salience over the corpus (graph-node-salience mirror). */
function computeSalience(
  nodes: EngineNode[],
  edges: EngineEdge[],
): Map<string, { status: number; design: number }> {
  // Degree as a cheap centrality proxy (the engine uses PPR/betweenness/coreness).
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.src, (degree.get(e.src) ?? 0) + 1);
    degree.set(e.dst, (degree.get(e.dst) ?? 0) + 1);
  }
  let maxDegree = 1;
  for (const d of degree.values()) maxDegree = Math.max(maxDegree, d);

  // Recency: newest modification = 1, oldest = 0 (rank-normalized by time).
  const mods = nodes
    .map((n) => (n.dates?.modified ? Date.parse(n.dates.modified) : NaN))
    .filter((t) => Number.isFinite(t));
  const minMod = mods.length ? Math.min(...mods) : 0;
  const maxMod = mods.length ? Math.max(...mods) : 1;
  const span = Math.max(1, maxMod - minMod);

  const out = new Map<string, { status: number; design: number }>();
  for (const node of nodes) {
    const prior = TYPE_PRIOR[node.kind] ?? { status: 0.4, design: 0.4 };
    const centrality = (degree.get(node.id) ?? 0) / maxDegree;
    const modTs = node.dates?.modified ? Date.parse(node.dates.modified) : minMod;
    const recency = (modTs - minMod) / span;
    // Status lens: roadmap prior + centrality + HIGH recency weight.
    const status = clamp01(0.5 * prior.status + 0.25 * centrality + 0.25 * recency);
    // Design lens: authority prior dominant + centrality + LOW recency weight.
    const design = clamp01(0.65 * prior.design + 0.25 * centrality + 0.1 * recency);
    out.set(node.id, { status, design });
  }
  return out;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
