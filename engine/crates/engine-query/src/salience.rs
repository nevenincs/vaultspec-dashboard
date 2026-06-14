//! Node salience (graph-node-salience ADR): an engine-computed, CPU-bound,
//! per-lens Degree-of-Interest projection over the bounded graph, served as a
//! single active-lens `salience` float node field.
//!
//! The governing formalism is Furnas's Degree-of-Interest:
//! `interest = a-priori-importance - distance-from-focus`. A "lens" is a
//! parameterization of that one model, not a separate code path. The six CPU
//! stages (ADR Implementation):
//!
//! 1. Build the tier-weighted backbone graph (declared >= structural >>
//!    temporal >= semantic) so the high-precision backbone dominates topology
//!    and the dense semantic tier cannot hijack centrality.
//! 2. Precompute the lens basis once per graph generation: sparse
//!    power-iteration Personalized PageRank with a shared partial-vector hub
//!    basis, one Brandes betweenness pass, one linear k-core peeling, and the
//!    structural-role and aggregated-exec features in one sweep.
//! 3. Rank-normalize each criterion to `[0,1]` within the bounded subgraph.
//! 4. Compose the per-lens a-priori importance as a weighted-linear blend, then
//!    subtract the backbone focus-distance term to realize the DOI form.
//! 5. Fold focus into the same warm-started PPR on demand.
//! 6. Memoize and serve the scalar as an additive per-lens node field.
//!
//! Everything here is CPU work over the in-memory adjacency
//! (graph-compute-is-cpu-gpu-is-render-and-search): no GPU, no scene-layer
//! compute. Every measure is computed over the bounded served subgraph under the
//! existing node ceiling (graph-queries-are-bounded-by-default); Brandes
//! betweenness is affordable ONLY because of that ceiling.

use std::collections::HashMap;

use engine_graph::{LinkageGraph, degree_by_tier};
use engine_model::{Node, NodeId, ScopeRef, Tier};

mod ontology;
pub use ontology::{AuthorityClass, LifecyclePhase, authority_class, lifecycle_phase};

// --- Stage 1: the tier-weighted backbone graph ---------------------------------

/// Per-tier topology weight (ADR stage 1; research "edge-tier weighting"). The
/// declared and structural tiers are identity-bearing high precision; temporal
/// is correlation (medium); semantic is dense, soft, lowest. Headline centrality
/// (PageRank, betweenness, k-core) runs over the declared+structural BACKBONE
/// only (`backbone_weight` returns 0 for temporal/semantic), so the dense
/// semantic tier cannot hijack centrality; temporal/semantic enter later stages
/// only as damped enrichment (recency, the status burst).
///
/// `declared >= structural >> temporal >= semantic` per the research's strong
/// recommendation.
pub fn tier_weight(tier: Tier) -> f64 {
    match tier {
        Tier::Declared => 1.0,
        Tier::Structural => 0.9,
        Tier::Temporal => 0.3,
        Tier::Semantic => 0.15,
    }
}

/// The headline-centrality backbone admits ONLY the high-precision declared and
/// structural tiers (ADR Rationale: "computing the headline centrality on the
/// high-precision declared/structural backbone"). Temporal and semantic edges
/// are excluded from the backbone topology entirely; they enter as damped
/// enrichment in later stages. Returns `None` for an off-backbone tier.
pub fn backbone_weight(tier: Tier) -> Option<f64> {
    match tier {
        Tier::Declared | Tier::Structural => Some(tier_weight(tier)),
        Tier::Temporal | Tier::Semantic => None,
    }
}

/// A bounded, tier-weighted, undirected backbone adjacency over a node set.
///
/// Built over the SUBGRAPH membership the query already bounded (the served node
/// set), never the whole corpus — `graph-queries-are-bounded-by-default`. Edges
/// are admitted only when BOTH endpoints are members and the edge rides a
/// backbone tier (declared/structural); the weight is the summed tier weight of
/// admitted edges between a pair (an edge observed multiple times accumulates).
/// Undirected: PageRank/betweenness/k-core treat the backbone as undirected
/// embeddedness, mirroring how the graph's mention edges are read.
#[derive(Debug, Clone, Default)]
pub struct Backbone {
    /// Stable node order: index ↔ NodeId. All vectors below index by this order.
    pub ids: Vec<NodeId>,
    /// NodeId → dense index.
    index: HashMap<NodeId, usize>,
    /// Per-node adjacency: (neighbor index, accumulated backbone weight).
    pub adjacency: Vec<Vec<(usize, f64)>>,
}

impl Backbone {
    pub fn node_count(&self) -> usize {
        self.ids.len()
    }

    pub fn index_of(&self, id: &NodeId) -> Option<usize> {
        self.index.get(id).copied()
    }

    /// Weighted degree (sum of incident backbone weights) of node `i`.
    pub fn weighted_degree(&self, i: usize) -> f64 {
        self.adjacency[i].iter().map(|&(_, w)| w).sum()
    }

    /// Build the backbone over the given bounded node set. `members` is the
    /// served subgraph; only edges among members on a backbone tier are kept.
    pub fn build(graph: &LinkageGraph, members: &[&Node]) -> Self {
        // Dense indexing over the bounded member set, id-sorted for determinism.
        let mut ids: Vec<NodeId> = members.iter().map(|n| n.id.clone()).collect();
        ids.sort_by(|a, b| a.0.cmp(&b.0));
        let index: HashMap<NodeId, usize> = ids
            .iter()
            .enumerate()
            .map(|(i, id)| (id.clone(), i))
            .collect();

        // Accumulate symmetric backbone weights between member pairs. A pair may
        // be touched by several edges (multiple mentions / both tiers); weights
        // sum. We dedup the per-edge contribution with a (min,max) keyed map so a
        // single undirected pair has one accumulated weight.
        let mut pair_weight: HashMap<(usize, usize), f64> = HashMap::new();
        for stored in graph.edges() {
            let Some(w) = backbone_weight(stored.edge.tier) else {
                continue;
            };
            let (Some(&a), Some(&b)) =
                (index.get(&stored.edge.src), index.get(&stored.edge.dst))
            else {
                continue;
            };
            if a == b {
                continue; // self-loops carry no topology
            }
            let key = if a < b { (a, b) } else { (b, a) };
            *pair_weight.entry(key).or_insert(0.0) += w;
        }

        let mut adjacency: Vec<Vec<(usize, f64)>> = vec![Vec::new(); ids.len()];
        for ((a, b), w) in pair_weight {
            adjacency[a].push((b, w));
            adjacency[b].push((a, w));
        }
        // Deterministic neighbor order.
        for row in &mut adjacency {
            row.sort_by(|x, y| x.0.cmp(&y.0));
        }
        Backbone {
            ids,
            index,
            adjacency,
        }
    }
}

// --- Stage 2a: Personalized PageRank over the backbone --------------------------

const PPR_DAMPING: f64 = 0.85;
const PPR_MAX_ITERS: usize = 100;
const PPR_TOLERANCE: f64 = 1e-9;

/// Sparse power-iteration Personalized PageRank over the weighted backbone.
///
/// `teleport` is the restart distribution (the lens's biased teleport vector);
/// it need not be normalized (it is normalized internally). Dangling nodes (no
/// backbone out-edges) redistribute their mass to the teleport distribution so
/// the chain stays stochastic. Returns the stationary distribution, indexed by
/// backbone node order. An empty backbone returns an empty vector.
///
/// O(edges) per iteration, tens of iterations on a bounded graph (research:
/// PageRank is CPU-cheap). This is the production form of intent-driven
/// importance: a teleport biased toward a document type makes the surfer spend
/// its time on that type and what it endorses.
pub fn personalized_pagerank(backbone: &Backbone, teleport: &[f64]) -> Vec<f64> {
    let n = backbone.node_count();
    if n == 0 {
        return Vec::new();
    }
    assert_eq!(teleport.len(), n, "teleport vector matches backbone order");

    // Normalize the teleport distribution; an all-zero teleport degenerates to
    // uniform (a sane restart rather than a divide-by-zero).
    let teleport_sum: f64 = teleport.iter().sum();
    let restart: Vec<f64> = if teleport_sum > 0.0 {
        teleport.iter().map(|&t| t / teleport_sum).collect()
    } else {
        vec![1.0 / n as f64; n]
    };

    let mut rank = restart.clone();
    let mut next = vec![0.0; n];
    for _ in 0..PPR_MAX_ITERS {
        // Base: the teleport (restart) mass.
        for i in 0..n {
            next[i] = (1.0 - PPR_DAMPING) * restart[i];
        }
        // Dangling mass: nodes with no out-weight send their rank to restart.
        let mut dangling = 0.0;
        for i in 0..n {
            let out: f64 = backbone.weighted_degree(i);
            if out <= 0.0 {
                dangling += rank[i];
            } else {
                let share = PPR_DAMPING * rank[i] / out;
                for &(j, w) in &backbone.adjacency[i] {
                    next[j] += share * w;
                }
            }
        }
        if dangling > 0.0 {
            for i in 0..n {
                next[i] += PPR_DAMPING * dangling * restart[i];
            }
        }
        // Convergence on the L1 delta.
        let delta: f64 = (0..n).map(|i| (next[i] - rank[i]).abs()).sum();
        std::mem::swap(&mut rank, &mut next);
        if delta < PPR_TOLERANCE {
            break;
        }
    }
    rank
}

// --- Stage 2b: the partial-vector hub basis (Jeh-Widom) -------------------------

/// A shared Personalized PageRank partial-vector basis (Jeh & Widom 2003): one
/// PPR vector per hub teleport, precomputed once, so a per-lens teleport that is
/// a convex blend of hub teleports is the SAME convex blend of the precomputed
/// hub vectors (PPR is linear in the teleport distribution). This makes per-lens
/// vectors cheap: the expensive power iteration runs once per hub, and a lens is
/// a weighted sum (`combine`) at serve time.
#[derive(Debug, Clone)]
pub struct PartialVectorBasis {
    /// One PPR vector per hub, each indexed by backbone node order.
    vectors: Vec<Vec<f64>>,
    n: usize,
}

impl PartialVectorBasis {
    /// Precompute one PPR vector per hub teleport. Each `hub_teleport` is a
    /// restart distribution over backbone node order.
    pub fn compute(backbone: &Backbone, hub_teleports: &[Vec<f64>]) -> Self {
        let n = backbone.node_count();
        let vectors = hub_teleports
            .iter()
            .map(|t| personalized_pagerank(backbone, t))
            .collect();
        PartialVectorBasis { vectors, n }
    }

    pub fn hub_count(&self) -> usize {
        self.vectors.len()
    }

    /// Linearly combine the hub vectors by `weights` (one per hub). Because PPR
    /// is linear in the teleport distribution, the result equals the PPR of the
    /// `weights`-blended teleport — without re-running power iteration. `weights`
    /// are normalized; an all-zero / empty combination is the zero vector.
    pub fn combine(&self, weights: &[f64]) -> Vec<f64> {
        assert_eq!(
            weights.len(),
            self.vectors.len(),
            "one weight per hub vector"
        );
        let sum: f64 = weights.iter().sum();
        let mut out = vec![0.0; self.n];
        if sum <= 0.0 {
            return out;
        }
        for (vec, &w) in self.vectors.iter().zip(weights) {
            if w == 0.0 {
                continue;
            }
            let scale = w / sum;
            for i in 0..self.n {
                out[i] += scale * vec[i];
            }
        }
        out
    }
}

// --- Stage 2c: Brandes betweenness ---------------------------------------------

/// Brandes' betweenness over the (undirected, weighted) backbone, returning a
/// per-node betweenness indexed by backbone node order.
///
/// This implementation uses the unweighted-BFS Brandes variant: backbone edges
/// are treated as unit-length for shortest-path counting (the weight tunes
/// topology admission, not path length — a declared and a structural edge are
/// both one hop). O(n*m) (research: the algorithm that makes betweenness
/// affordable; naive all-pairs is O(n^3)). Affordable ONLY under the node
/// ceiling (ADR Constraints; the W05 benchmark proves it).
pub fn brandes_betweenness(backbone: &Backbone) -> Vec<f64> {
    let n = backbone.node_count();
    let mut centrality = vec![0.0; n];
    if n == 0 {
        return centrality;
    }
    for s in 0..n {
        // Single-source shortest paths (BFS) accumulating dependencies.
        let mut stack: Vec<usize> = Vec::new();
        let mut predecessors: Vec<Vec<usize>> = vec![Vec::new(); n];
        let mut sigma = vec![0.0_f64; n]; // # shortest paths
        let mut dist = vec![-1_i64; n];
        sigma[s] = 1.0;
        dist[s] = 0;
        let mut queue = std::collections::VecDeque::new();
        queue.push_back(s);
        while let Some(v) = queue.pop_front() {
            stack.push(v);
            for &(w, _) in &backbone.adjacency[v] {
                if dist[w] < 0 {
                    dist[w] = dist[v] + 1;
                    queue.push_back(w);
                }
                if dist[w] == dist[v] + 1 {
                    sigma[w] += sigma[v];
                    predecessors[w].push(v);
                }
            }
        }
        // Back-propagate dependencies.
        let mut delta = vec![0.0_f64; n];
        while let Some(w) = stack.pop() {
            for &v in &predecessors[w] {
                if sigma[w] > 0.0 {
                    delta[v] += (sigma[v] / sigma[w]) * (1.0 + delta[w]);
                }
            }
            if w != s {
                centrality[w] += delta[w];
            }
        }
    }
    // Undirected graphs double-count each shortest path (s..t and t..s).
    for c in &mut centrality {
        *c /= 2.0;
    }
    centrality
}

// --- Stage 2d: k-core coreness --------------------------------------------------

/// Linear-time k-core peeling over the backbone (Seidman 1983; Batagelj-Zaversnik
/// peeling), returning per-node coreness indexed by backbone node order.
///
/// Coreness is fan-out robust: pendant exec leaves peel in the first round and
/// cannot inflate a plan's coreness (research: directly defuses the hub problem).
/// Uses unweighted degree for the peeling order (the standard k-core definition).
pub fn coreness(backbone: &Backbone) -> Vec<usize> {
    let n = backbone.node_count();
    let mut core = vec![0usize; n];
    if n == 0 {
        return core;
    }
    let mut degree: Vec<usize> = (0..n).map(|i| backbone.adjacency[i].len()).collect();
    let mut removed = vec![false; n];
    // Repeatedly peel the minimum-degree node; its core number is the current
    // peel level (the running max of minimum degrees encountered).
    let mut level = 0usize;
    for _ in 0..n {
        // Find the unremoved node of minimum current degree.
        let Some(v) = (0..n)
            .filter(|&i| !removed[i])
            .min_by_key(|&i| degree[i])
        else {
            break;
        };
        level = level.max(degree[v]);
        core[v] = level;
        removed[v] = true;
        for &(u, _) in &backbone.adjacency[v] {
            if !removed[u] && degree[u] > 0 {
                degree[u] -= 1;
            }
        }
    }
    core
}

// --- Stage 2e: structural role + aggregated-exec features -----------------------

/// The structural role of a node on the backbone (research mitigation 5: role !=
/// community != raw centrality). Computed from the cheap measures: an authority
/// is pointed-to (high in-weight, low out), a hub points-out (high out, low in),
/// a bridge sits on many shortest paths (high betweenness, modest degree), a leaf
/// is a pendant.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StructuralRole {
    Authority,
    Hub,
    Bridge,
    Leaf,
}

impl StructuralRole {
    /// A role's salience prior in `[0,1]`: bridges and authorities are the
    /// load-bearing roles, hubs assemble, leaves recede.
    pub fn prior(self) -> f64 {
        match self {
            StructuralRole::Authority => 1.0,
            StructuralRole::Bridge => 0.9,
            StructuralRole::Hub => 0.6,
            StructuralRole::Leaf => 0.2,
        }
    }
}

/// The aggregated-exec feature (ADR hub/fan-out mitigation; research mitigation
/// 2): exec records are an aggregate species rolled into their parent plan as one
/// evidential signal, so exec volume reads as evidence, not inflation. The hint
/// is read from the node ontology (the `aggregate` semantics field, derived
/// locally here until the semantics feature lands it natively).
#[derive(Debug, Clone, Copy, Default)]
pub struct AggregatedExec {
    /// How many exec children roll into this node (0 for non-aggregating nodes).
    pub child_count: usize,
    /// True when this node is itself an aggregate (exec record) species, so it
    /// gets a low type-prior and recedes unless individually focused.
    pub is_aggregate: bool,
}

// --- Stage 2: the assembled lens basis ------------------------------------------

/// The per-graph-generation centrality basis: the expensive measures computed
/// ONCE in one sweep over the backbone, shared by every lens
/// (`provenance-stable` per-generation memoization, ADR Constraints). All vectors
/// are indexed by backbone node order. Per-lens PPR is then a cheap `combine`
/// over the partial-vector hubs.
#[derive(Debug, Clone)]
pub struct LensBasis {
    pub backbone: Backbone,
    /// The shared partial-vector hub basis: one PPR vector per authority-class
    /// hub, so any lens teleport (a convex blend of hubs) is a cheap `combine`.
    pub ppr_basis: PartialVectorBasis,
    /// The authority class each hub biases toward, in `ppr_basis` order.
    pub hub_classes: Vec<AuthorityClass>,
    pub betweenness: Vec<f64>,
    pub coreness: Vec<usize>,
    pub roles: Vec<StructuralRole>,
    pub aggregated_exec: Vec<AggregatedExec>,
    /// Per-node authority class (from the ontology seam), in backbone order.
    pub authority: Vec<AuthorityClass>,
    /// Per-node lifecycle phase (from the ontology seam), in backbone order.
    pub lifecycle: Vec<LifecyclePhase>,
    /// Per-node `modified` timestamp (ms since epoch), in backbone order;
    /// `None` when the node carries no date (historical/blob-true views).
    pub modified: Vec<Option<i64>>,
}

/// The authority-class hubs the shared partial-vector basis is built over. A
/// lens biases its teleport toward a subset of these (the design lens onto design
/// authority; the status lens onto roadmap authority), and the basis lets that
/// bias be a cheap linear combination.
const HUB_CLASSES: [AuthorityClass; 5] = [
    AuthorityClass::DesignAuthority,
    AuthorityClass::RoadmapAuthority,
    AuthorityClass::Evidence,
    AuthorityClass::Judgment,
    AuthorityClass::Law,
];

impl LensBasis {
    /// Compute the full basis in one sweep over the bounded member set. This is
    /// the per-graph-generation precompute the route memoizes; it is intended to
    /// run once per `(graph-generation)` and be shared by all lenses.
    pub fn compute(graph: &LinkageGraph, scope: &ScopeRef, members: &[&Node]) -> Self {
        let backbone = Backbone::build(graph, members);
        let n = backbone.node_count();

        // Per-node ontology reads (the integration seam): authority class and
        // lifecycle phase derived locally from doc_type / lifecycle / dates until
        // graph-node-semantics provides them natively.
        let node_by_index: Vec<&Node> = backbone
            .ids
            .iter()
            .map(|id| {
                members
                    .iter()
                    .copied()
                    .find(|nd| &nd.id == id)
                    .expect("backbone id is a member")
            })
            .collect();
        let authority: Vec<AuthorityClass> =
            node_by_index.iter().map(|n| authority_class(n)).collect();
        let lifecycle: Vec<LifecyclePhase> = node_by_index
            .iter()
            .map(|n| lifecycle_phase(n, scope))
            .collect();
        let modified: Vec<Option<i64>> = node_by_index
            .iter()
            .map(|n| n.dates.as_ref().and_then(|d| d.modified))
            .collect();

        // The shared partial-vector hub basis: one PPR vector per authority-class
        // hub, each teleport an indicator over the nodes of that class.
        let hub_classes: Vec<AuthorityClass> = HUB_CLASSES.to_vec();
        let hub_teleports: Vec<Vec<f64>> = hub_classes
            .iter()
            .map(|class| {
                let mut t = vec![0.0; n];
                for i in 0..n {
                    if authority[i] == *class {
                        t[i] = 1.0;
                    }
                }
                t
            })
            .collect();
        let ppr_basis = PartialVectorBasis::compute(&backbone, &hub_teleports);

        let betweenness = brandes_betweenness(&backbone);
        let coreness = coreness(&backbone);
        let roles = structural_roles(&backbone, &betweenness);
        let aggregated_exec = aggregated_exec_features(graph, &backbone, &node_by_index);

        LensBasis {
            backbone,
            ppr_basis,
            hub_classes,
            betweenness,
            coreness,
            roles,
            aggregated_exec,
            authority,
            lifecycle,
            modified,
        }
    }

    pub fn node_count(&self) -> usize {
        self.backbone.node_count()
    }
}

/// Classify each backbone node's structural role from in/out weight balance and
/// betweenness. Undirected backbone: "in" vs "out" is approximated by the share
/// of weight to higher-authority vs lower-authority neighbors — but with no
/// direction available here we use the cheap signals: a high-betweenness modest-
/// degree node is a bridge, a high-degree node is a hub, an isolated/pendant node
/// is a leaf, otherwise an authority.
fn structural_roles(backbone: &Backbone, betweenness: &[f64]) -> Vec<StructuralRole> {
    let n = backbone.node_count();
    if n == 0 {
        return Vec::new();
    }
    let max_between = betweenness.iter().cloned().fold(0.0_f64, f64::max);
    let degrees: Vec<usize> = (0..n).map(|i| backbone.adjacency[i].len()).collect();
    let max_degree = degrees.iter().copied().max().unwrap_or(0);
    (0..n)
        .map(|i| {
            let deg = degrees[i];
            if deg <= 1 {
                return StructuralRole::Leaf;
            }
            let between_share = if max_between > 0.0 {
                betweenness[i] / max_between
            } else {
                0.0
            };
            let degree_share = if max_degree > 0 {
                deg as f64 / max_degree as f64
            } else {
                0.0
            };
            if between_share >= 0.5 && degree_share < 0.8 {
                StructuralRole::Bridge
            } else if degree_share >= 0.6 {
                StructuralRole::Hub
            } else {
                StructuralRole::Authority
            }
        })
        .collect()
}

/// Compute the aggregated-exec feature per backbone node: a plan node's exec
/// children (aggregate-species neighbors) rolled into one count, and the
/// aggregate flag for the exec records themselves. Reads the ontology aggregate
/// hint (derived locally from doc_type until semantics lands it natively).
fn aggregated_exec_features(
    graph: &LinkageGraph,
    backbone: &Backbone,
    nodes: &[&Node],
) -> Vec<AggregatedExec> {
    let n = backbone.node_count();
    let mut features = vec![AggregatedExec::default(); n];
    for i in 0..n {
        let node = nodes[i];
        let is_aggregate = ontology::is_aggregate(node);
        features[i].is_aggregate = is_aggregate;
        if is_aggregate {
            continue;
        }
        // Count aggregate-species neighbors that roll into this node (any tier:
        // the generated-by/aggregates edges are structural, but we count all
        // graph neighbors flagged aggregate so the rollup is robust to tier).
        let mut child_count = 0usize;
        for stored in graph.edges_of(&node.id) {
            let other = if stored.edge.src == node.id {
                &stored.edge.dst
            } else {
                &stored.edge.src
            };
            if let Some(child) = graph.node(other)
                && ontology::is_aggregate(child)
            {
                child_count += 1;
            }
        }
        features[i].child_count = child_count;
    }
    features
}

// --- Helpers --------------------------------------------------------------------

/// A node's raw (unweighted) backbone degree from the live graph projection —
/// retained as a base signal (research: degree is the substrate for the
/// hub/fan-out treatment, never a headline measure on its own).
pub fn backbone_degree(graph: &LinkageGraph, id: &NodeId) -> usize {
    let counts = degree_by_tier(graph, id);
    counts.get("declared").copied().unwrap_or(0)
        + counts.get("structural").copied().unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine_graph::EdgeAttrs;
    use engine_model::{
        CanonicalKey, Dates, Facet, NodeKind, Presence, Provenance, RelationKind,
        ResolutionState, edge_id, node_id,
    };

    fn scope() -> ScopeRef {
        ScopeRef::Ref {
            name: "main".into(),
        }
    }

    pub(super) fn doc(stem: &str, doc_type: &str, feature: &str) -> Node {
        Node {
            id: node_id(&CanonicalKey::Document { stem }),
            kind: NodeKind::Document,
            key: stem.into(),
            title: None,
            doc_type: Some(doc_type.into()),
            dates: Some(Dates {
                created: Some("2026-06-14".into()),
                modified: Some(1_000_000),
            }),
            feature_tags: vec![feature.into()],
            facets: vec![Facet {
                scope: scope(),
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: None,
            }],
        }
    }

    pub(super) fn edge(src: &str, dst: &str, tier: Tier) -> engine_model::Edge {
        let s = node_id(&CanonicalKey::Document { stem: src });
        let d = node_id(&CanonicalKey::Document { stem: dst });
        let provenance = Provenance::DocumentBody {
            blob_hash: "b".into(),
            span: (0, 1),
            target: dst.into(),
        };
        // Tier-calibrated confidence bands (engine-model D3.2): declared is
        // exactly 1.0, the others sit in their bands.
        let confidence = match tier {
            Tier::Declared => 1.0,
            Tier::Structural => 0.9,
            Tier::Temporal => 0.7,
            Tier::Semantic => 0.6,
        };
        engine_model::Edge {
            id: edge_id(&s, &d, &RelationKind::Mentions, tier, &provenance),
            src: s,
            dst: d,
            relation: RelationKind::Mentions,
            tier,
            confidence,
            state: (tier == Tier::Structural).then_some(ResolutionState::Resolved),
            provenance,
            scope: scope(),
            observed_at: 0,
        }
    }

    /// A small known graph: adr <- plan -> research, plan -> exec leaf, plus a
    /// temporal edge that must NOT enter the backbone (semantic edges are never
    /// graph fact — D3.5 — so temporal is the off-backbone tier we can ingest).
    pub(super) fn fixture() -> (LinkageGraph, Vec<Node>) {
        let nodes = vec![
            doc("p", "plan", "f"),
            doc("a", "adr", "f"),
            doc("r", "research", "f"),
            doc("e", "exec", "f"),
            doc("s", "reference", "f"),
        ];
        let mut g = LinkageGraph::new();
        for n in &nodes {
            g.upsert_node(n.clone());
        }
        engine_graph::ingest(&mut g, edge("p", "a", Tier::Declared), EdgeAttrs::default())
            .unwrap();
        engine_graph::ingest(
            &mut g,
            edge("p", "r", Tier::Structural),
            EdgeAttrs::default(),
        )
        .unwrap();
        engine_graph::ingest(
            &mut g,
            edge("p", "e", Tier::Structural),
            EdgeAttrs::default(),
        )
        .unwrap();
        // A temporal edge a<->s: must be excluded from the backbone topology
        // (only declared/structural enter the backbone).
        engine_graph::ingest(&mut g, edge("a", "s", Tier::Temporal), EdgeAttrs::default())
            .unwrap();
        (g, nodes)
    }

    fn members(nodes: &[Node]) -> Vec<&Node> {
        nodes.iter().collect()
    }

    #[test]
    fn backbone_applies_tier_weight_and_damps_semantic() {
        let (g, nodes) = fixture();
        let backbone = Backbone::build(&g, &members(&nodes));
        // 5 members; the semantic a<->s edge is excluded, so `s` is isolated.
        assert_eq!(backbone.node_count(), 5);
        let s = backbone.index_of(&node_id(&CanonicalKey::Document { stem: "s" })).unwrap();
        assert_eq!(
            backbone.adjacency[s].len(),
            0,
            "off-backbone (temporal) edge is not part of the backbone topology"
        );
        // The declared p<->a edge weights higher than a structural p<->r edge.
        let p = backbone.index_of(&node_id(&CanonicalKey::Document { stem: "p" })).unwrap();
        let a = backbone.index_of(&node_id(&CanonicalKey::Document { stem: "a" })).unwrap();
        let pa = backbone.adjacency[p].iter().find(|&&(j, _)| j == a).unwrap().1;
        assert!((pa - tier_weight(Tier::Declared)).abs() < 1e-9);
    }

    #[test]
    fn backbone_membership_is_preserved_under_bounding() {
        let (g, nodes) = fixture();
        // Bound to a 3-node subset; edges to dropped nodes must not appear.
        let subset: Vec<&Node> = nodes
            .iter()
            .filter(|n| matches!(n.key.as_str(), "p" | "a" | "r"))
            .collect();
        let backbone = Backbone::build(&g, &subset);
        assert_eq!(backbone.node_count(), 3);
        // `e` was dropped, so p has only the a and r backbone edges.
        let p = backbone.index_of(&node_id(&CanonicalKey::Document { stem: "p" })).unwrap();
        assert_eq!(backbone.adjacency[p].len(), 2);
    }

    #[test]
    fn pagerank_converges_and_sums_to_one() {
        let (g, nodes) = fixture();
        let backbone = Backbone::build(&g, &members(&nodes));
        let n = backbone.node_count();
        let teleport = vec![1.0; n];
        let rank = personalized_pagerank(&backbone, &teleport);
        let total: f64 = rank.iter().sum();
        assert!((total - 1.0).abs() < 1e-6, "stationary distribution sums to 1");
        // The central plan node `p` outranks the isolated semantic-only node `s`.
        let p = backbone.index_of(&node_id(&CanonicalKey::Document { stem: "p" })).unwrap();
        let s = backbone.index_of(&node_id(&CanonicalKey::Document { stem: "s" })).unwrap();
        assert!(rank[p] > rank[s], "the hub plan outranks the isolated node");
    }

    #[test]
    fn personalized_teleport_biases_toward_the_preference_set() {
        let (g, nodes) = fixture();
        let backbone = Backbone::build(&g, &members(&nodes));
        let n = backbone.node_count();
        let a = backbone.index_of(&node_id(&CanonicalKey::Document { stem: "a" })).unwrap();
        // Teleport biased entirely onto the ADR `a`.
        let mut teleport = vec![0.0; n];
        teleport[a] = 1.0;
        let biased = personalized_pagerank(&backbone, &teleport);
        let uniform = personalized_pagerank(&backbone, &vec![1.0; n]);
        assert!(
            biased[a] > uniform[a],
            "biasing the teleport onto `a` raises its stationary mass"
        );
    }

    #[test]
    fn partial_vector_basis_is_linear_in_the_teleport() {
        // Jeh-Widom linearity: combining hub vectors equals the PPR of the
        // combined teleport. This is what makes per-lens vectors cheap.
        let (g, nodes) = fixture();
        let backbone = Backbone::build(&g, &members(&nodes));
        let n = backbone.node_count();
        let a = backbone.index_of(&node_id(&CanonicalKey::Document { stem: "a" })).unwrap();
        let r = backbone.index_of(&node_id(&CanonicalKey::Document { stem: "r" })).unwrap();
        let mut ta = vec![0.0; n];
        ta[a] = 1.0;
        let mut tr = vec![0.0; n];
        tr[r] = 1.0;
        let basis = PartialVectorBasis::compute(&backbone, &[ta.clone(), tr.clone()]);
        let combined = basis.combine(&[1.0, 1.0]);
        // The PPR of the (a+r)/2 teleport computed directly.
        let mut blended = vec![0.0; n];
        blended[a] = 0.5;
        blended[r] = 0.5;
        let direct = personalized_pagerank(&backbone, &blended);
        for i in 0..n {
            assert!(
                (combined[i] - direct[i]).abs() < 1e-6,
                "partial-vector linearity holds at index {i}"
            );
        }
    }

    #[test]
    fn brandes_betweenness_finds_the_bridge() {
        // path a - p - r: p is the only bridge, so it carries all the
        // betweenness; a and r carry none.
        let nodes = vec![doc("a", "adr", "f"), doc("p", "plan", "f"), doc("r", "research", "f")];
        let mut g = LinkageGraph::new();
        for nd in &nodes {
            g.upsert_node(nd.clone());
        }
        engine_graph::ingest(&mut g, edge("a", "p", Tier::Structural), EdgeAttrs::default())
            .unwrap();
        engine_graph::ingest(&mut g, edge("p", "r", Tier::Structural), EdgeAttrs::default())
            .unwrap();
        let backbone = Backbone::build(&g, &members(&nodes));
        let bc = brandes_betweenness(&backbone);
        let p = backbone.index_of(&node_id(&CanonicalKey::Document { stem: "p" })).unwrap();
        let a = backbone.index_of(&node_id(&CanonicalKey::Document { stem: "a" })).unwrap();
        let r = backbone.index_of(&node_id(&CanonicalKey::Document { stem: "r" })).unwrap();
        assert!((bc[p] - 1.0).abs() < 1e-9, "the middle node is the only bridge");
        assert!(bc[a] < 1e-9 && bc[r] < 1e-9, "the endpoints bridge nothing");
    }

    #[test]
    fn coreness_peels_pendant_exec_leaves_first() {
        let (g, nodes) = fixture();
        let backbone = Backbone::build(&g, &members(&nodes));
        let core = coreness(&backbone);
        let e = backbone.index_of(&node_id(&CanonicalKey::Document { stem: "e" })).unwrap();
        // The exec leaf `e` is a pendant (degree 1): coreness 1, peeled first.
        assert_eq!(core[e], 1, "pendant exec leaf has minimal coreness");
    }

    #[test]
    fn lens_basis_computes_every_measure_in_one_sweep() {
        let (g, nodes) = fixture();
        let basis = LensBasis::compute(&g, &scope(), &members(&nodes));
        assert_eq!(basis.node_count(), 5);
        assert_eq!(basis.betweenness.len(), 5);
        assert_eq!(basis.coreness.len(), 5);
        assert_eq!(basis.roles.len(), 5);
        assert_eq!(basis.aggregated_exec.len(), 5);
        assert_eq!(basis.ppr_basis.hub_count(), HUB_CLASSES.len());
        // The plan `p` aggregates its exec child `e`.
        let p = basis.backbone.index_of(&node_id(&CanonicalKey::Document { stem: "p" })).unwrap();
        assert_eq!(basis.aggregated_exec[p].child_count, 1, "exec child rolled up");
        let e = basis.backbone.index_of(&node_id(&CanonicalKey::Document { stem: "e" })).unwrap();
        assert!(basis.aggregated_exec[e].is_aggregate, "exec record is aggregate species");
    }
}
