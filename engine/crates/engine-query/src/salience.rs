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

use std::collections::{BTreeMap, HashMap};

use engine_graph::{LinkageGraph, degree_by_tier};
use engine_model::{Node, NodeId, ScopeRef, Tier};

mod ontology;
pub use ontology::{AuthorityClass, LifecyclePhase, authority_class, lifecycle_phase};

// --- The lens: a parameterization of one DOI model ------------------------------

/// A viewer-intent "lens" (ADR: a lens is a *parameterization* of the one DOI
/// model, not a separate code path). The two launch lenses are concrete
/// parameterizations — teleport bias, weight row, type priors — over the SAME
/// machinery. STATUS is the default (first-load is "what is in-flight", the most
/// common review intent).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Lens {
    /// Authority-led: teleport biased to ADR + research, PageRank-led with high
    /// coreness and low recency (decisions are durable).
    Design,
    /// Pivotal-bridge-led: teleport biased to in-flight plans, betweenness +
    /// hub-led, high recency + activity burst, exec children aggregated.
    #[default]
    Status,
}

impl Lens {
    /// Parse the wire `lens` request parameter, defaulting to STATUS when omitted
    /// (ADR wire amendment: "defaulted to the status lens when omitted").
    pub fn parse(raw: Option<&str>) -> Option<Lens> {
        match raw {
            None | Some("status") => Some(Lens::Status),
            Some("design") => Some(Lens::Design),
            Some(_) => None,
        }
    }

    /// The stable wire name.
    pub fn as_str(self) -> &'static str {
        match self {
            Lens::Design => "design",
            Lens::Status => "status",
        }
    }

    /// The lens's teleport bias toward an authority class (the PPR restart
    /// preference set). The design lens biases onto design authority (ADR) and
    /// its substrate (reference/research); the status lens biases onto roadmap
    /// authority (plans), with a secondary on evidence so its in-flight exec
    /// activity is reachable. Returns a per-hub weight; 0 means "not in the
    /// preference set".
    pub fn teleport_bias(self, class: AuthorityClass) -> f64 {
        match self {
            // Design lens: ADR + research authority.
            Lens::Design => match class {
                AuthorityClass::DesignAuthority => 1.0,
                AuthorityClass::Substrate => 0.6,
                AuthorityClass::Judgment => 0.2,
                _ => 0.0,
            },
            // Status lens: in-flight plans (roadmap authority) lead.
            Lens::Status => match class {
                AuthorityClass::RoadmapAuthority => 1.0,
                AuthorityClass::Evidence => 0.3,
                AuthorityClass::Judgment => 0.2,
                _ => 0.0,
            },
        }
    }

    /// The lens's type prior for an authority class (research composition table:
    /// "ADR, research, reference high" for design; "plan high; exec aggregated"
    /// for status). A raw [0,1]-ish prior, rank-normalized downstream.
    pub fn type_prior(self, class: AuthorityClass) -> f64 {
        match self {
            Lens::Design => match class {
                AuthorityClass::DesignAuthority => 1.0,
                AuthorityClass::Substrate => 0.8,
                AuthorityClass::Law => 0.5,
                AuthorityClass::Judgment => 0.5,
                AuthorityClass::RoadmapAuthority => 0.4,
                AuthorityClass::Evidence => 0.1,
                AuthorityClass::None => 0.0,
            },
            Lens::Status => match class {
                AuthorityClass::RoadmapAuthority => 1.0,
                AuthorityClass::Judgment => 0.6,
                AuthorityClass::DesignAuthority => 0.5,
                // Exec records are aggregated into the parent: individually low.
                AuthorityClass::Evidence => 0.2,
                AuthorityClass::Substrate => 0.3,
                AuthorityClass::Law => 0.4,
                AuthorityClass::None => 0.0,
            },
        }
    }

    /// The lens's weight row (research composition table). The design lens is
    /// authority-dominant with low recency; the status lens is betweenness-and-
    /// recency-led with the activity burst. The weights come FROM the lens
    /// definition (not tuned), validated by the sensitivity sweep.
    pub fn weights(self) -> WeightRow {
        match self {
            Lens::Design => WeightRow {
                type_prior: 0.30,
                centrality: 0.35,
                recency: 0.05,
                structural_role: 0.30,
                burst: 0.0,
                focus_gamma: 0.4,
                // Design leads with PPR authority, not betweenness.
                betweenness_blend: 0.2,
                // Decisions are durable: a long half-life.
                recency_half_life_days: 365.0,
            },
            Lens::Status => WeightRow {
                type_prior: 0.20,
                centrality: 0.30,
                recency: 0.25,
                structural_role: 0.10,
                burst: 0.15,
                focus_gamma: 0.5,
                // Status leads with the pivotal bridges (Brandes betweenness).
                betweenness_blend: 0.7,
                // Freshness is the point: a short half-life.
                recency_half_life_days: 30.0,
            },
        }
    }
}

// --- Stage 1: the tier-weighted backbone graph ---------------------------------

/// Per-tier topology weight (ADR stage 1; research "edge-tier weighting"). The
/// declared and structural tiers are identity-bearing high precision; temporal
/// is correlation (medium). Headline centrality (PageRank, betweenness, k-core)
/// runs over the declared+structural BACKBONE only (`backbone_weight` returns 0
/// for temporal), so a soft correlation tier cannot hijack centrality; temporal
/// enters later stages only as damped enrichment (recency, the status burst).
/// Semantic (RAG) is never a graph tier (D3.5), so it carries no topology weight.
///
/// `declared >= structural >> temporal` per the research's strong
/// recommendation.
pub fn tier_weight(tier: Tier) -> f64 {
    match tier {
        Tier::Declared => 1.0,
        Tier::Structural => 0.9,
        Tier::Temporal => 0.3,
    }
}

/// The headline-centrality backbone admits ONLY the high-precision declared and
/// structural tiers (ADR Rationale: "computing the headline centrality on the
/// high-precision declared/structural backbone"). Temporal edges are excluded
/// from the backbone topology entirely; they enter as damped enrichment in later
/// stages. (Semantic is never a graph tier — D3.5.) Returns `None` for an
/// off-backbone tier.
pub fn backbone_weight(tier: Tier) -> Option<f64> {
    match tier {
        Tier::Declared | Tier::Structural => Some(tier_weight(tier)),
        Tier::Temporal => None,
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
            let (Some(&a), Some(&b)) = (index.get(&stored.edge.src), index.get(&stored.edge.dst))
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
            row.sort_by_key(|&(j, _)| j);
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
// The power-iteration kernel scatters rank across parallel arrays (rank, next,
// restart, adjacency) indexed by the same node index; an index loop is the
// clearest and most efficient form for it.
#[allow(clippy::needless_range_loop)]
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
    if n == 0 {
        return Vec::new();
    }
    let mut degree: Vec<usize> = (0..n).map(|i| backbone.adjacency[i].len()).collect();
    let max_degree = degree.iter().copied().max().unwrap_or(0);

    let mut bin = vec![0usize; max_degree + 1];
    for &d in &degree {
        bin[d] += 1;
    }

    let mut start = 0usize;
    for count in &mut bin {
        let next = start + *count;
        *count = start;
        start = next;
    }

    let mut pos = vec![0usize; n];
    let mut vert = vec![0usize; n];
    for (v, &d) in degree.iter().enumerate() {
        pos[v] = bin[d];
        vert[pos[v]] = v;
        bin[d] += 1;
    }

    for d in (1..=max_degree).rev() {
        bin[d] = bin[d - 1];
    }
    bin[0] = 0;

    for i in 0..n {
        let v = vert[i];
        for &(u, _) in &backbone.adjacency[v] {
            if degree[u] > degree[v] {
                let du = degree[u];
                let pu = pos[u];
                let pw = bin[du];
                let w = vert[pw];

                if u != w {
                    vert[pu] = w;
                    vert[pw] = u;
                    pos[u] = pw;
                    pos[w] = pu;
                }
                bin[du] += 1;
                degree[u] -= 1;
            }
        }
    }

    degree
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
                    .find(|node| &node.id == id)
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
    counts.get("declared").copied().unwrap_or(0) + counts.get("structural").copied().unwrap_or(0)
}

// --- Stage 3 inputs: recency, lifecycle multiplier, status burst ----------------

const MS_PER_DAY: f64 = 86_400_000.0;

/// Exponential recency decay (research: `recency(t) = exp(-ln2 * age / H)`), the
/// half-life `H` the single interpretable per-lens knob ("loses half its
/// freshness every H days"). `age_days` is the node's age in days from `now`;
/// `half_life_days` is the lens parameter. A node with no `modified` date (a
/// historical/blob-true view) yields the neutral midpoint so it neither inflates
/// nor zeroes — recency simply carries no information there.
pub fn recency(modified_ms: Option<i64>, now_ms: i64, half_life_days: f64) -> f64 {
    let Some(modified) = modified_ms else {
        return 0.5;
    };
    let age_days = ((now_ms - modified).max(0) as f64) / MS_PER_DAY;
    let lambda = std::f64::consts::LN_2 / half_life_days.max(f64::EPSILON);
    (-lambda * age_days).exp()
}

/// The discrete per-lens lifecycle multiplier (research: kept distinct from
/// recency so "recent but archived" and "old but in-flight" both resolve
/// correctly). In-flight strongly boosts the status lens; archived heavily damps
/// it but must NOT zero a still-authoritative archived ADR in the design lens.
/// The multiplier is a function of the lens AND the lifecycle phase, applied as a
/// scaling factor on the a-priori score (composed below).
pub fn lifecycle_multiplier(lens: Lens, phase: LifecyclePhase) -> f64 {
    match (lens, phase) {
        // Status lens: freshness and in-flight are the point.
        (Lens::Status, LifecyclePhase::InFlight) => 1.5,
        (Lens::Status, LifecyclePhase::Durable) => 0.9,
        (Lens::Status, LifecyclePhase::Archived) => 0.3,
        (Lens::Status, LifecyclePhase::Unknown) => 1.0,
        // Design lens: decisions are durable; an archived ADR is damped, not zeroed.
        (Lens::Design, LifecyclePhase::InFlight) => 1.0,
        (Lens::Design, LifecyclePhase::Durable) => 1.1,
        (Lens::Design, LifecyclePhase::Archived) => 0.7,
        (Lens::Design, LifecyclePhase::Unknown) => 1.0,
    }
}

/// The status-lens activity-burst term: weight recent edge activity (new exec
/// records and commit-correlation edges in the recent window) so "what moved this
/// week" rises (research: edge-recency on the temporal tier, distinct from node
/// age). Counts the node's incident temporal-tier edges observed within
/// `window_days` of `now`, normalized by a soft cap so a hot node saturates
/// rather than dominating unboundedly.
pub fn activity_burst(graph: &LinkageGraph, id: &NodeId, now_ms: i64, window_days: f64) -> f64 {
    let window_ms = (window_days * MS_PER_DAY) as i64;
    let mut recent = 0usize;
    for stored in graph.edges_of(id) {
        if stored.edge.tier == Tier::Temporal && (now_ms - stored.edge.observed_at) <= window_ms {
            recent += 1;
        }
    }
    // Soft saturation: 1 - exp(-k) maps an unbounded count into [0,1), so a burst
    // of activity reads as "hot" without letting one node's churn swamp the field.
    1.0 - (-(recent as f64) / 3.0).exp()
}

// --- Stage 3: rank-normalization within the bounded subgraph --------------------

/// Rank-normalize a criterion vector to `[0,1]` within the bounded served
/// subgraph (research: the real source of ad-hocness; PageRank is heavy-tailed,
/// betweenness an unbounded count, so combining raw values is meaningless).
/// Robust to heavy tails because it uses RANK, not magnitude: the i-th smallest
/// value maps to `i/(n-1)`, ties share the average rank. An empty or single-
/// element vector maps to all-0.5 (no spread to normalize).
pub fn rank_normalize(values: &[f64]) -> Vec<f64> {
    let n = values.len();
    if n == 0 {
        return Vec::new();
    }
    if n == 1 {
        return vec![0.5];
    }
    // Sort indices by value; assign average ranks for ties.
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|&a, &b| {
        values[a]
            .partial_cmp(&values[b])
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let mut normalized = vec![0.0; n];
    let mut i = 0;
    while i < n {
        // Find the run of equal values.
        let mut j = i + 1;
        while j < n && (values[order[j]] - values[order[i]]).abs() < 1e-12 {
            j += 1;
        }
        // Average rank for the tie group [i, j).
        let avg_rank = (i + j - 1) as f64 / 2.0;
        let normed = avg_rank / (n - 1) as f64;
        for &idx in &order[i..j] {
            normalized[idx] = normed;
        }
        i = j;
    }
    normalized
}

// --- Stage 4: the weighted-linear DOI composition -------------------------------

/// The per-lens weight row (research's composition table; the weights are derived
/// from the lens definition, not tuned ad hoc, then validated by the sensitivity
/// sweep). Each names the contribution of one rank-normalized criterion to the
/// a-priori importance; `focus_gamma` is the DOI focus-distance coefficient.
#[derive(Debug, Clone, Copy)]
pub struct WeightRow {
    /// alpha: type/authority prior weight.
    pub type_prior: f64,
    /// beta: personalized centrality (PPR, plus betweenness for status).
    pub centrality: f64,
    /// delta: exponential recency weight.
    pub recency: f64,
    /// zeta: structural-role + coreness embeddedness weight.
    pub structural_role: f64,
    /// The status-lens activity-burst weight (0 for the design lens).
    pub burst: f64,
    /// gamma_L: focus-distance coefficient (DOI subtracts gamma * distance).
    pub focus_gamma: f64,
    /// Betweenness emphasis within the centrality term (status leads with it).
    pub betweenness_blend: f64,
    /// Recency exponential half-life in days (the single interpretable knob).
    pub recency_half_life_days: f64,
}

/// All the rank-normalized per-node criteria the composition blends, in backbone
/// node order. Produced by `normalize_criteria` from a `LensBasis` and the live
/// graph; consumed by `compose_api`.
#[derive(Debug, Clone)]
pub struct NormalizedCriteria {
    pub type_prior: Vec<f64>,
    pub centrality_ppr: Vec<f64>,
    pub betweenness: Vec<f64>,
    pub recency: Vec<f64>,
    pub structural_role: Vec<f64>,
    pub burst: Vec<f64>,
    /// The lifecycle multiplier per node (NOT rank-normalized: it is a discrete
    /// scaling factor applied after the weighted blend).
    pub lifecycle_mult: Vec<f64>,
}

/// Rank-normalize every criterion for one lens within the bounded subgraph
/// (stage 3) and carry the lifecycle multiplier through. The per-lens PPR vector
/// is the cheap `combine` over the partial-vector basis using the lens's teleport
/// weights; betweenness and the structural-role prior come from the shared basis.
pub fn normalize_criteria(
    basis: &LensBasis,
    graph: &LinkageGraph,
    lens: Lens,
    now_ms: i64,
) -> NormalizedCriteria {
    let n = basis.node_count();
    let row = lens.weights();

    // Per-lens PPR: combine the partial-vector hubs by the lens's teleport bias.
    let hub_weights: Vec<f64> = basis
        .hub_classes
        .iter()
        .map(|class| lens.teleport_bias(*class))
        .collect();
    let ppr_raw = basis.ppr_basis.combine(&hub_weights);

    // Type prior (authority class): the lens's per-class importance.
    let type_prior_raw: Vec<f64> = basis
        .authority
        .iter()
        .map(|class| lens.type_prior(*class))
        .collect();

    // Structural-role prior + coreness embeddedness combined as one raw signal.
    let max_core = basis.coreness.iter().copied().max().unwrap_or(0).max(1) as f64;
    let role_raw: Vec<f64> = (0..n)
        .map(|i| basis.roles[i].prior() + basis.coreness[i] as f64 / max_core)
        .collect();

    // Recency and burst read the live graph timestamps.
    let recency_raw: Vec<f64> = (0..n)
        .map(|i| recency(basis.modified[i], now_ms, row.recency_half_life_days))
        .collect();
    let burst_raw: Vec<f64> = (0..n)
        .map(|i| {
            if row.burst > 0.0 {
                activity_burst(graph, &basis.backbone.ids[i], now_ms, 7.0)
            } else {
                0.0
            }
        })
        .collect();

    let lifecycle_mult: Vec<f64> = basis
        .lifecycle
        .iter()
        .map(|phase| lifecycle_multiplier(lens, *phase))
        .collect();

    NormalizedCriteria {
        type_prior: rank_normalize(&type_prior_raw),
        centrality_ppr: rank_normalize(&ppr_raw),
        betweenness: rank_normalize(&basis.betweenness),
        recency: rank_normalize(&recency_raw),
        structural_role: rank_normalize(&role_raw),
        burst: rank_normalize(&burst_raw),
        lifecycle_mult,
    }
}

/// Compose the per-lens a-priori importance API(n|L) as the weighted-linear blend
/// of the rank-normalized criteria, scaled by the discrete lifecycle multiplier
/// (research's composition form). Returns API per backbone node order; the DOI
/// focus-distance subtraction (`apply_focus_distance`) happens in stage 5.
pub fn compose_api(criteria: &NormalizedCriteria, lens: Lens) -> Vec<f64> {
    let row = lens.weights();
    let n = criteria.type_prior.len();
    (0..n)
        .map(|i| {
            // The centrality term blends PPR with betweenness (the status lens
            // leads with betweenness; the design lens leans on PPR authority).
            let centrality = (1.0 - row.betweenness_blend) * criteria.centrality_ppr[i]
                + row.betweenness_blend * criteria.betweenness[i];
            let api = row.type_prior * criteria.type_prior[i]
                + row.centrality * centrality
                + row.recency * criteria.recency[i]
                + row.structural_role * criteria.structural_role[i]
                + row.burst * criteria.burst[i];
            // The discrete lifecycle multiplier scales the blended a-priori.
            api * criteria.lifecycle_mult[i]
        })
        .collect()
}

/// Subtract the backbone focus-distance term to realize the DOI scalar
/// `I(n|L) = API(n|L) - gamma_L * D_backbone(n, focus)` (research DOI form).
/// `distance` is the per-node backbone distance from the focus node (in the same
/// backbone order), rank-normalized to `[0,1]` so gamma is a clean coefficient.
/// With no focus, `distance` is all-zero and DOI == API.
pub fn apply_focus_distance(api: &[f64], distance: &[f64], lens: Lens) -> Vec<f64> {
    let gamma = lens.weights().focus_gamma;
    api.iter()
        .zip(distance)
        .map(|(&a, &d)| a - gamma * d)
        .collect()
}

/// Backbone graph distance from a focus node (BFS hop count), rank-normalized to
/// `[0,1]` within the subgraph for the DOI subtraction. Unreachable nodes take
/// the maximum normalized distance (1.0): they are maximally far in interest
/// terms. Returns all-zero when there is no focus.
pub fn backbone_distance(backbone: &Backbone, focus: Option<&NodeId>) -> Vec<f64> {
    let n = backbone.node_count();
    let Some(focus) = focus else {
        return vec![0.0; n];
    };
    let Some(start) = backbone.index_of(focus) else {
        return vec![0.0; n];
    };
    let mut dist = vec![-1_i64; n];
    dist[start] = 0;
    let mut queue = std::collections::VecDeque::new();
    queue.push_back(start);
    while let Some(v) = queue.pop_front() {
        for &(w, _) in &backbone.adjacency[v] {
            if dist[w] < 0 {
                dist[w] = dist[v] + 1;
                queue.push_back(w);
            }
        }
    }
    // Map hop counts to f64, unreachable (-1) to the max finite distance + 1 so
    // it normalizes to the far end.
    let max_reachable = dist.iter().copied().filter(|&d| d >= 0).max().unwrap_or(0);
    let raw: Vec<f64> = dist
        .iter()
        .map(|&d| {
            if d < 0 {
                (max_reachable + 1) as f64
            } else {
                d as f64
            }
        })
        .collect();
    rank_normalize(&raw)
}

// --- Stage 5: the weight-sensitivity sweep --------------------------------------

/// Kendall's tau-b rank correlation between two orderings of the same items
/// (research weight-robustness: "Kendall's tau between perturbed orderings").
/// `+1` is identical order, `-1` is reversed. Used by the sensitivity sweep to
/// confirm the top-k ranking is not fragile under weight perturbation.
pub fn kendall_tau(a: &[f64], b: &[f64]) -> f64 {
    let n = a.len();
    if n < 2 {
        return 1.0;
    }
    let mut concordant = 0i64;
    let mut discordant = 0i64;
    let mut ties_a = 0i64;
    let mut ties_b = 0i64;
    for i in 0..n {
        for j in (i + 1)..n {
            let da = a[i] - a[j];
            let db = b[i] - b[j];
            let sa = da.partial_cmp(&0.0).unwrap_or(std::cmp::Ordering::Equal);
            let sb = db.partial_cmp(&0.0).unwrap_or(std::cmp::Ordering::Equal);
            if sa == std::cmp::Ordering::Equal {
                ties_a += 1;
            }
            if sb == std::cmp::Ordering::Equal {
                ties_b += 1;
            }
            if sa == std::cmp::Ordering::Equal || sb == std::cmp::Ordering::Equal {
                continue;
            }
            if sa == sb {
                concordant += 1;
            } else {
                discordant += 1;
            }
        }
    }
    let total = (n * (n - 1) / 2) as i64;
    let denom = (((total - ties_a) * (total - ties_b)) as f64).sqrt();
    if denom <= 0.0 {
        return 1.0;
    }
    (concordant - discordant) as f64 / denom
}

/// The top-`k` node ids of a score vector (highest first), in backbone order.
fn top_k_ids(backbone: &Backbone, scores: &[f64], k: usize) -> Vec<NodeId> {
    let mut order: Vec<usize> = (0..scores.len()).collect();
    order.sort_by(|&a, &b| {
        scores[b]
            .partial_cmp(&scores[a])
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    order
        .into_iter()
        .take(k)
        .map(|i| backbone.ids[i].clone())
        .collect()
}

/// The result of the weight-sensitivity sweep for one lens: the minimum top-k
/// Kendall-tau stability observed across all single-weight +/- perturbations, plus
/// the worst-case overlap of the perturbed top-k against the baseline top-k. The
/// lens is "stable" when `min_tau` stays above the stability floor.
#[derive(Debug, Clone)]
pub struct SweepResult {
    pub lens: Lens,
    pub k: usize,
    /// The minimum Kendall-tau over the full top-k ordering across perturbations.
    pub min_tau: f64,
    /// The minimum fraction of the baseline top-k that survives any perturbation.
    pub min_topk_overlap: f64,
}

impl SweepResult {
    /// The stability floor (research: "if top-k flips under small perturbation the
    /// lens is ill-defined"). A defensible lens keeps its top-k overlap above this.
    pub const STABILITY_FLOOR: f64 = 0.6;

    pub fn is_stable(&self) -> bool {
        self.min_topk_overlap >= Self::STABILITY_FLOOR
    }
}

/// Run the weight-sensitivity sweep for one lens (research: the artifact that
/// turns the lens-derived weights from magic numbers into tested ones). Perturbs
/// each weight in the lens's row by `+/- perturb` (a fraction, e.g. 0.3 for 30%),
/// recomposes the API, and measures top-k Kendall-tau stability and overlap
/// against the unperturbed baseline. Returns the worst case across all
/// perturbations.
pub fn weight_sensitivity_sweep(
    basis: &LensBasis,
    graph: &LinkageGraph,
    lens: Lens,
    now_ms: i64,
    k: usize,
    perturb: f64,
) -> SweepResult {
    let criteria = normalize_criteria(basis, graph, lens, now_ms);
    let baseline = compose_api(&criteria, lens);
    let baseline_top: std::collections::HashSet<String> = top_k_ids(&basis.backbone, &baseline, k)
        .into_iter()
        .map(|id| id.0)
        .collect();

    let mut min_tau = 1.0_f64;
    let mut min_overlap = 1.0_f64;

    // Each scalar field of the weight row is perturbed up and down independently.
    let setters: [fn(&mut WeightRow, f64); 5] = [
        |r, f| r.type_prior *= f,
        |r, f| r.centrality *= f,
        |r, f| r.recency *= f,
        |r, f| r.structural_role *= f,
        |r, f| r.burst *= f,
    ];
    for setter in setters {
        for factor in [1.0 - perturb, 1.0 + perturb] {
            let mut row = lens.weights();
            setter(&mut row, factor);
            let perturbed = compose_api_with(&criteria, lens, row);
            let tau = kendall_tau(&baseline, &perturbed);
            min_tau = min_tau.min(tau);
            let perturbed_top: std::collections::HashSet<String> =
                top_k_ids(&basis.backbone, &perturbed, k)
                    .into_iter()
                    .map(|id| id.0)
                    .collect();
            let overlap = if baseline_top.is_empty() {
                1.0
            } else {
                baseline_top.intersection(&perturbed_top).count() as f64 / baseline_top.len() as f64
            };
            min_overlap = min_overlap.min(overlap);
        }
    }
    SweepResult {
        lens,
        k,
        min_tau,
        min_topk_overlap: min_overlap,
    }
}

/// Compose the API with an explicit (perturbed) weight row, reusing the already-
/// normalized criteria — the sweep's inner loop (avoids re-normalizing per
/// perturbation, which is the expensive part).
fn compose_api_with(criteria: &NormalizedCriteria, _lens: Lens, row: WeightRow) -> Vec<f64> {
    let n = criteria.type_prior.len();
    (0..n)
        .map(|i| {
            let centrality = (1.0 - row.betweenness_blend) * criteria.centrality_ppr[i]
                + row.betweenness_blend * criteria.betweenness[i];
            let api = row.type_prior * criteria.type_prior[i]
                + row.centrality * centrality
                + row.recency * criteria.recency[i]
                + row.structural_role * criteria.structural_role[i]
                + row.burst * criteria.burst[i];
            api * criteria.lifecycle_mult[i]
        })
        .collect()
}

// --- Stage 5/6: focus folding + the served per-node salience map ----------------

/// The served salience: per-node DOI scalar keyed by node id, plus the partial
/// flag (ADR Constraints: a salience computed while a tier is degraded is flagged
/// partial via the tiers block, never presented as complete). Final scores are
/// rank-normalized to `[0,1]` so the served `salience` float is a stable,
/// comparable per-node importance within the bounded subgraph.
#[derive(Debug, Clone, Default)]
pub struct SalienceScores {
    /// NodeId string -> salience float in `[0,1]`.
    pub by_id: BTreeMap<String, f64>,
    /// The active lens the scores were computed for.
    pub lens: Lens,
    /// True when computed over fewer than all available tiers (a degraded tier),
    /// so the wire flags it partial rather than presenting a complete ranking.
    pub partial: bool,
}

impl SalienceScores {
    pub fn get(&self, id: &str) -> Option<f64> {
        self.by_id.get(id).copied()
    }
}

/// Compute the served per-node salience for one lens and an optional focus node,
/// over a precomputed basis (stages 3-6). This is the focus-folded DOI: when a
/// focus is given, the backbone distance term is subtracted from the a-priori
/// importance (`apply_focus_distance`) — the warm-started form, since the
/// expensive PPR basis is already computed and shared. With no focus, DOI == API.
///
/// `partial` carries through to the result so the route flags degraded-tier
/// salience honestly. Final scores are rank-normalized to `[0,1]`.
pub fn compute_salience(
    basis: &LensBasis,
    graph: &LinkageGraph,
    lens: Lens,
    focus: Option<&NodeId>,
    now_ms: i64,
    partial: bool,
) -> SalienceScores {
    let criteria = normalize_criteria(basis, graph, lens, now_ms);
    let api = compose_api(&criteria, lens);
    let distance = backbone_distance(&basis.backbone, focus);
    let doi = apply_focus_distance(&api, &distance, lens);
    // Rank-normalize the final DOI to a comparable [0,1] served scalar.
    let normed = rank_normalize(&doi);
    let by_id: BTreeMap<String, f64> = basis
        .backbone
        .ids
        .iter()
        .zip(normed)
        .map(|(id, s)| (id.0.clone(), s))
        .collect();
    SalienceScores {
        by_id,
        lens,
        partial,
    }
}

/// A memoization key for the focus-folded score (ADR: memoize the basis per
/// `(graph-generation, lens)` and the focus-folded final score per
/// `(lens, focus)`). The graph generation is the caller's responsibility (it
/// keys the basis); this keys the focus-folded score within a fixed basis.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct FocusKey {
    pub lens: &'static str,
    pub focus: Option<String>,
    pub partial: bool,
}

impl FocusKey {
    pub fn new(lens: Lens, focus: Option<&NodeId>, partial: bool) -> Self {
        FocusKey {
            lens: lens.as_str(),
            focus: focus.map(|f| f.0.clone()),
            partial,
        }
    }
}

/// Attach the active-lens `salience` float to each served document node view
/// (ADR Constraints: "a single `salience` float computed for the *requested*
/// lens ... an additive node field"). Mutates each node Value in place, adding a
/// `salience` key. A node not in the scored set (e.g. a feature-convergence node,
/// which the salience model does not rank) gets no salience field — truthful
/// absence rather than a guessed zero.
pub fn annotate_nodes(nodes: &mut [serde_json::Value], scores: &SalienceScores) {
    for node in nodes.iter_mut() {
        let Some(id) = node.get("id").and_then(|v| v.as_str()) else {
            continue;
        };
        if let Some(score) = scores.get(id)
            && let Some(obj) = node.as_object_mut()
        {
            obj.insert(
                "salience".to_string(),
                serde_json::Value::from((score * 1e6).round() / 1e6),
            );
        }
    }
}

/// Order document node views by descending active-lens salience, so a DOI
/// truncation under the node ceiling keeps the TOP-salience nodes for the active
/// lens and focus (ADR: "MAX_GRAPH_NODES truncation selects the top-DOI nodes for
/// the active lens and focus"). Nodes without a salience score sort last (their
/// importance is unknown, so they recede under truncation), with id as the
/// deterministic tie-break.
pub fn order_by_salience(nodes: &mut [serde_json::Value], scores: &SalienceScores) {
    nodes.sort_by(|a, b| {
        let sa = a
            .get("id")
            .and_then(|v| v.as_str())
            .and_then(|id| scores.get(id));
        let sb = b
            .get("id")
            .and_then(|v| v.as_str())
            .and_then(|id| scores.get(id));
        match (sa, sb) {
            (Some(x), Some(y)) => y
                .partial_cmp(&x)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| id_str(a).cmp(id_str(b))),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => id_str(a).cmp(id_str(b)),
        }
    });
}

fn id_str(v: &serde_json::Value) -> &str {
    v.get("id").and_then(|x| x.as_str()).unwrap_or("")
}

/// Whether the backbone admits any degraded tier into the partial flag: the
/// backbone is declared+structural only, so the salience is "partial" iff EITHER
/// of those backbone tiers is degraded. A degraded temporal or semantic tier does
/// NOT make the BACKBONE salience partial (those tiers never entered the headline
/// centrality), but it is surfaced as partial when the status lens's recency/burst
/// inputs (which read the temporal tier) are degraded. The caller passes the set
/// of unavailable tiers; this decides the flag for the active lens.
pub fn is_partial(lens: Lens, unavailable_tiers: &[&str]) -> bool {
    // Backbone tiers always affect every lens.
    if unavailable_tiers
        .iter()
        .any(|t| *t == "declared" || *t == "structural")
    {
        return true;
    }
    // The status lens additionally reads the temporal tier (recency burst), so a
    // degraded temporal tier makes the status salience partial.
    if lens == Lens::Status && unavailable_tiers.contains(&"temporal") {
        return true;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine_graph::EdgeAttrs;
    use engine_model::{
        CanonicalKey, Dates, Facet, NodeKind, Presence, Provenance, RelationKind, ResolutionState,
        edge_id, node_id,
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
                stamped: None,
            }),
            feature_tags: vec![feature.into()],
            status: None,
            tier: None,
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
        engine_graph::ingest(&mut g, edge("p", "a", Tier::Declared), EdgeAttrs::default()).unwrap();
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
        engine_graph::ingest(&mut g, edge("a", "s", Tier::Temporal), EdgeAttrs::default()).unwrap();
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
        let s = backbone
            .index_of(&node_id(&CanonicalKey::Document { stem: "s" }))
            .unwrap();
        assert_eq!(
            backbone.adjacency[s].len(),
            0,
            "off-backbone (temporal) edge is not part of the backbone topology"
        );
        // The declared p<->a edge weights higher than a structural p<->r edge.
        let p = backbone
            .index_of(&node_id(&CanonicalKey::Document { stem: "p" }))
            .unwrap();
        let a = backbone
            .index_of(&node_id(&CanonicalKey::Document { stem: "a" }))
            .unwrap();
        let pa = backbone.adjacency[p]
            .iter()
            .find(|&&(j, _)| j == a)
            .unwrap()
            .1;
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
        let p = backbone
            .index_of(&node_id(&CanonicalKey::Document { stem: "p" }))
            .unwrap();
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
        assert!(
            (total - 1.0).abs() < 1e-6,
            "stationary distribution sums to 1"
        );
        // The central plan node `p` outranks the isolated semantic-only node `s`.
        let p = backbone
            .index_of(&node_id(&CanonicalKey::Document { stem: "p" }))
            .unwrap();
        let s = backbone
            .index_of(&node_id(&CanonicalKey::Document { stem: "s" }))
            .unwrap();
        assert!(rank[p] > rank[s], "the hub plan outranks the isolated node");
    }

    #[test]
    fn personalized_teleport_biases_toward_the_preference_set() {
        let (g, nodes) = fixture();
        let backbone = Backbone::build(&g, &members(&nodes));
        let n = backbone.node_count();
        let a = backbone
            .index_of(&node_id(&CanonicalKey::Document { stem: "a" }))
            .unwrap();
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
        let a = backbone
            .index_of(&node_id(&CanonicalKey::Document { stem: "a" }))
            .unwrap();
        let r = backbone
            .index_of(&node_id(&CanonicalKey::Document { stem: "r" }))
            .unwrap();
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
        let nodes = vec![
            doc("a", "adr", "f"),
            doc("p", "plan", "f"),
            doc("r", "research", "f"),
        ];
        let mut g = LinkageGraph::new();
        for node in &nodes {
            g.upsert_node(node.clone());
        }
        engine_graph::ingest(
            &mut g,
            edge("a", "p", Tier::Structural),
            EdgeAttrs::default(),
        )
        .unwrap();
        engine_graph::ingest(
            &mut g,
            edge("p", "r", Tier::Structural),
            EdgeAttrs::default(),
        )
        .unwrap();
        let backbone = Backbone::build(&g, &members(&nodes));
        let bc = brandes_betweenness(&backbone);
        let p = backbone
            .index_of(&node_id(&CanonicalKey::Document { stem: "p" }))
            .unwrap();
        let a = backbone
            .index_of(&node_id(&CanonicalKey::Document { stem: "a" }))
            .unwrap();
        let r = backbone
            .index_of(&node_id(&CanonicalKey::Document { stem: "r" }))
            .unwrap();
        assert!(
            (bc[p] - 1.0).abs() < 1e-9,
            "the middle node is the only bridge"
        );
        assert!(bc[a] < 1e-9 && bc[r] < 1e-9, "the endpoints bridge nothing");
    }

    #[test]
    fn coreness_peels_pendant_exec_leaves_first() {
        let (g, nodes) = fixture();
        let backbone = Backbone::build(&g, &members(&nodes));
        let core = coreness(&backbone);
        let e = backbone
            .index_of(&node_id(&CanonicalKey::Document { stem: "e" }))
            .unwrap();
        // The exec leaf `e` is a pendant (degree 1): coreness 1, peeled first.
        assert_eq!(core[e], 1, "pendant exec leaf has minimal coreness");
    }

    #[test]
    fn coreness_preserves_dense_core_with_many_pendant_leaves() {
        let mut g = LinkageGraph::new();
        let mut nodes = Vec::new();
        for i in 0..20 {
            nodes.push(doc(&format!("core-{i}"), "plan", "f"));
        }
        for i in 0..80 {
            nodes.push(doc(&format!("leaf-{i}"), "exec", "f"));
        }
        for node in &nodes {
            g.upsert_node(node.clone());
        }

        for a in 0..20 {
            for b in (a + 1)..20 {
                engine_graph::ingest(
                    &mut g,
                    edge(&format!("core-{a}"), &format!("core-{b}"), Tier::Structural),
                    EdgeAttrs::default(),
                )
                .unwrap();
            }
        }
        for i in 0..80 {
            engine_graph::ingest(
                &mut g,
                edge("core-0", &format!("leaf-{i}"), Tier::Structural),
                EdgeAttrs::default(),
            )
            .unwrap();
        }

        let backbone = Backbone::build(&g, &members(&nodes));
        let core = coreness(&backbone);
        let dense = backbone
            .index_of(&node_id(&CanonicalKey::Document { stem: "core-7" }))
            .unwrap();
        let connector = backbone
            .index_of(&node_id(&CanonicalKey::Document { stem: "core-0" }))
            .unwrap();
        let leaf = backbone
            .index_of(&node_id(&CanonicalKey::Document { stem: "leaf-42" }))
            .unwrap();

        assert_eq!(core[dense], 19, "a 20-node clique has coreness 19");
        assert_eq!(
            core[connector], 19,
            "pendant fan-out does not inflate the dense core"
        );
        assert_eq!(core[leaf], 1, "pendant leaves stay in the outer shell");
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
        let p = basis
            .backbone
            .index_of(&node_id(&CanonicalKey::Document { stem: "p" }))
            .unwrap();
        assert_eq!(
            basis.aggregated_exec[p].child_count, 1,
            "exec child rolled up"
        );
        let e = basis
            .backbone
            .index_of(&node_id(&CanonicalKey::Document { stem: "e" }))
            .unwrap();
        assert!(
            basis.aggregated_exec[e].is_aggregate,
            "exec record is aggregate species"
        );
    }

    // --- W02.P03: recency, lifecycle, burst ------------------------------------

    #[test]
    fn recency_halves_at_the_half_life() {
        let now = 100 * MS_PER_DAY as i64;
        // A node modified exactly one half-life (30 days) ago.
        let modified = now - (30.0 * MS_PER_DAY) as i64;
        let r = recency(Some(modified), now, 30.0);
        assert!((r - 0.5).abs() < 1e-6, "freshness halves at the half-life");
        // A brand-new node is ~1.0; an ancient node tends to 0.
        assert!(recency(Some(now), now, 30.0) > 0.99);
        assert!(recency(Some(0), now, 30.0) < 0.1);
        // No date -> neutral midpoint, never inflating or zeroing.
        assert_eq!(recency(None, now, 30.0), 0.5);
    }

    #[test]
    fn lifecycle_multiplier_handles_recent_archived_and_old_in_flight() {
        // Status lens: in-flight strongly boosts; archived heavily damps.
        assert!(lifecycle_multiplier(Lens::Status, LifecyclePhase::InFlight) > 1.0);
        assert!(lifecycle_multiplier(Lens::Status, LifecyclePhase::Archived) < 0.5);
        // Design lens: an archived ADR is damped but NEVER zeroed.
        let design_archived = lifecycle_multiplier(Lens::Design, LifecyclePhase::Archived);
        assert!(design_archived > 0.0 && design_archived < 1.0);
    }

    #[test]
    fn activity_burst_weights_recent_temporal_edges() {
        // A node with a recent temporal edge bursts; one with none does not.
        let mut g = LinkageGraph::new();
        let a = doc("a", "plan", "f");
        let c = doc("c", "exec", "f");
        g.upsert_node(a.clone());
        g.upsert_node(c.clone());
        let now = 100 * MS_PER_DAY as i64;
        let mut recent_edge = edge("a", "c", Tier::Temporal);
        recent_edge.observed_at = now - (1.0 * MS_PER_DAY) as i64; // 1 day ago
        engine_graph::ingest(&mut g, recent_edge, EdgeAttrs::default()).unwrap();
        let hot = activity_burst(&g, &a.id, now, 7.0);
        assert!(hot > 0.0, "a node with a recent temporal edge bursts");
        // A node with no temporal edges has zero burst.
        let mut g2 = LinkageGraph::new();
        let q = doc("q", "plan", "f");
        g2.upsert_node(q.clone());
        assert_eq!(activity_burst(&g2, &q.id, now, 7.0), 0.0);
    }

    // --- W02.P04: normalization + composition + DOI ----------------------------

    #[test]
    fn rank_normalize_is_robust_to_heavy_tails() {
        // A heavy-tailed input: rank normalization spreads it evenly to [0,1].
        let values = vec![0.001, 0.002, 0.003, 1000.0];
        let normed = rank_normalize(&values);
        assert_eq!(normed[0], 0.0, "smallest maps to 0");
        assert_eq!(normed[3], 1.0, "largest maps to 1 regardless of magnitude");
        assert!(
            normed[1] > normed[0] && normed[2] > normed[1],
            "rank order preserved"
        );
        // Ties share the average rank.
        let tied = rank_normalize(&[5.0, 5.0, 9.0]);
        assert!(
            (tied[0] - tied[1]).abs() < 1e-12,
            "tied values share a rank"
        );
    }

    #[test]
    fn weighted_composition_matches_a_hand_blend() {
        // A single node with known normalized criteria and a known weight row:
        // API = alpha*tp + beta*centrality + delta*rec + zeta*role + burst, *mult.
        let criteria = NormalizedCriteria {
            type_prior: vec![1.0],
            centrality_ppr: vec![0.5],
            betweenness: vec![0.0],
            recency: vec![1.0],
            structural_role: vec![0.0],
            burst: vec![0.0],
            lifecycle_mult: vec![1.0],
        };
        let row = Lens::Design.weights();
        // centrality blend with a single node normalizes to 0.5 (single elem).
        let expected = row.type_prior * 1.0
            + row.centrality * ((1.0 - row.betweenness_blend) * 0.5 + row.betweenness_blend * 0.0)
            + row.recency * 1.0
            + row.structural_role * 0.0
            + row.burst * 0.0;
        let api = compose_api(&criteria, Lens::Design);
        assert!(
            (api[0] - expected).abs() < 1e-9,
            "weighted blend matches by hand"
        );
    }

    #[test]
    fn doi_subtracts_the_focus_distance() {
        let api = vec![1.0, 1.0, 1.0];
        // Node 1 is far (distance 1.0), node 0 is the focus (0.0).
        let distance = vec![0.0, 1.0, 0.5];
        let doi = apply_focus_distance(&api, &distance, Lens::Status);
        let gamma = Lens::Status.weights().focus_gamma;
        assert!(
            (doi[0] - 1.0).abs() < 1e-9,
            "the focus node keeps its full API"
        );
        assert!(
            (doi[1] - (1.0 - gamma)).abs() < 1e-9,
            "a far node loses gamma*distance"
        );
        assert!(
            doi[0] > doi[2] && doi[2] > doi[1],
            "interest falls with distance"
        );
    }

    #[test]
    fn backbone_distance_is_bfs_hops_from_focus() {
        // path a - p - r: distance from a is 0,1,2.
        let nodes = vec![
            doc("a", "adr", "f"),
            doc("p", "plan", "f"),
            doc("r", "research", "f"),
        ];
        let mut g = LinkageGraph::new();
        for node in &nodes {
            g.upsert_node(node.clone());
        }
        engine_graph::ingest(
            &mut g,
            edge("a", "p", Tier::Structural),
            EdgeAttrs::default(),
        )
        .unwrap();
        engine_graph::ingest(
            &mut g,
            edge("p", "r", Tier::Structural),
            EdgeAttrs::default(),
        )
        .unwrap();
        let backbone = Backbone::build(&g, &members(&nodes));
        let a = node_id(&CanonicalKey::Document { stem: "a" });
        let dist = backbone_distance(&backbone, Some(&a));
        let ia = backbone.index_of(&a).unwrap();
        let ir = backbone
            .index_of(&node_id(&CanonicalKey::Document { stem: "r" }))
            .unwrap();
        assert!(
            dist[ia] < dist[ir],
            "the focus is nearest, the far node farthest"
        );
        // No focus -> all zero distance.
        assert!(backbone_distance(&backbone, None).iter().all(|&d| d == 0.0));
    }

    // --- W02.P05: the weight-sensitivity sweep ---------------------------------

    /// A richer fixture with enough structure that a top-k is meaningful: two
    /// features, several plans/adrs/exec records.
    fn sweep_fixture() -> (LinkageGraph, Vec<Node>) {
        let mut nodes = Vec::new();
        for (stem, dt) in [
            ("p1", "plan"),
            ("p2", "plan"),
            ("a1", "adr"),
            ("a2", "adr"),
            ("r1", "research"),
            ("e1", "exec"),
            ("e2", "exec"),
            ("e3", "exec"),
            ("au1", "audit"),
        ] {
            nodes.push(doc(stem, dt, "f"));
        }
        let mut g = LinkageGraph::new();
        for n in &nodes {
            g.upsert_node(n.clone());
        }
        for (s, d, t) in [
            ("p1", "a1", Tier::Declared),
            ("p1", "r1", Tier::Structural),
            ("p1", "e1", Tier::Structural),
            ("p1", "e2", Tier::Structural),
            ("p2", "a2", Tier::Declared),
            ("p2", "e3", Tier::Structural),
            ("a1", "r1", Tier::Structural),
            ("au1", "p1", Tier::Structural),
        ] {
            engine_graph::ingest(&mut g, edge(s, d, t), EdgeAttrs::default()).unwrap();
        }
        (g, nodes)
    }

    #[test]
    fn weight_sweep_top_k_stays_stable_for_both_lenses() {
        let (g, nodes) = sweep_fixture();
        let basis = LensBasis::compute(&g, &scope(), &members(&nodes));
        let now = 100 * MS_PER_DAY as i64;
        for lens in [Lens::Design, Lens::Status] {
            let sweep = weight_sensitivity_sweep(&basis, &g, lens, now, 3, 0.3);
            assert!(
                sweep.is_stable(),
                "{:?} top-k must stay stable under +/-30% weight perturbation: overlap={}, tau={}",
                lens,
                sweep.min_topk_overlap,
                sweep.min_tau
            );
        }
    }

    #[test]
    fn kendall_tau_is_one_for_identical_orders_and_negative_for_reversed() {
        let a = vec![1.0, 2.0, 3.0, 4.0];
        assert!((kendall_tau(&a, &a) - 1.0).abs() < 1e-9);
        let reversed = vec![4.0, 3.0, 2.0, 1.0];
        assert!((kendall_tau(&a, &reversed) + 1.0).abs() < 1e-9);
    }

    // --- W03.P06: the two lenses from one model --------------------------------

    #[test]
    fn the_two_lenses_yield_distinct_orderings_on_the_same_graph() {
        let (g, nodes) = sweep_fixture();
        let basis = LensBasis::compute(&g, &scope(), &members(&nodes));
        let now = 100 * MS_PER_DAY as i64;
        let design = compose_api(
            &normalize_criteria(&basis, &g, Lens::Design, now),
            Lens::Design,
        );
        let status = compose_api(
            &normalize_criteria(&basis, &g, Lens::Status, now),
            Lens::Status,
        );
        let design_top = top_k_ids(&basis.backbone, &design, 3);
        let status_top = top_k_ids(&basis.backbone, &status, 3);
        assert_ne!(
            design_top, status_top,
            "the design (authority-led) and status (pivotal-bridge-led) lenses \
             order the same graph differently"
        );
        // Design should rank an ADR highly; status should favor a plan.
        assert!(
            design_top
                .iter()
                .any(|id| id.0.contains("a1") || id.0.contains("a2")),
            "design lens surfaces an authority ADR in its top-k: {design_top:?}"
        );
        assert!(
            status_top
                .iter()
                .any(|id| id.0.contains("p1") || id.0.contains("p2")),
            "status lens surfaces a plan in its top-k: {status_top:?}"
        );
    }

    #[test]
    fn lens_parse_defaults_to_status() {
        assert_eq!(Lens::parse(None), Some(Lens::Status));
        assert_eq!(Lens::parse(Some("status")), Some(Lens::Status));
        assert_eq!(Lens::parse(Some("design")), Some(Lens::Design));
        assert_eq!(Lens::parse(Some("bogus")), None);
        assert_eq!(Lens::default(), Lens::Status);
    }

    // --- W03.P07: focus folding + memoization keys -----------------------------

    #[test]
    fn focus_folding_raises_nodes_near_the_focus() {
        let (g, nodes) = sweep_fixture();
        let basis = LensBasis::compute(&g, &scope(), &members(&nodes));
        let now = 100 * MS_PER_DAY as i64;
        let no_focus = compute_salience(&basis, &g, Lens::Status, None, now, false);
        let a1 = node_id(&CanonicalKey::Document { stem: "a1" });
        let focused = compute_salience(&basis, &g, Lens::Status, Some(&a1), now, false);
        // The focus node itself (distance 0) is not penalized; a node FAR from the
        // focus loses interest relative to the unfocused ranking.
        let far = node_id(&CanonicalKey::Document { stem: "p2" });
        // Focused score of the focus's own neighborhood should not collapse.
        assert!(focused.get(&a1.0).is_some());
        // The no-focus and focused maps differ (focus folding actually changed
        // the ordering for at least the far node).
        assert!(
            (no_focus.get(&far.0).unwrap_or(0.0) - focused.get(&far.0).unwrap_or(0.0)).abs() > 1e-9
                || no_focus.by_id != focused.by_id,
            "focus folding shifts the DOI ranking"
        );
    }

    #[test]
    fn no_focus_lens_switch_keys_differ_focus_keys_match() {
        // A no-focus lens switch is a different (lens,focus) key; a focus change
        // for one lens is a different key too (the route memoizes per this key).
        let status_none = FocusKey::new(Lens::Status, None, false);
        let design_none = FocusKey::new(Lens::Design, None, false);
        assert_ne!(status_none, design_none, "lens is part of the key");
        let a = node_id(&CanonicalKey::Document { stem: "a" });
        let status_focus = FocusKey::new(Lens::Status, Some(&a), false);
        assert_ne!(status_none, status_focus, "focus is part of the key");
        // Same lens + same focus + same partiality is a cache hit (equal key).
        assert_eq!(status_focus, FocusKey::new(Lens::Status, Some(&a), false));
    }

    // --- W03.P08.S33: partial-tier flag ----------------------------------------

    #[test]
    fn salience_is_partial_when_a_relevant_tier_is_degraded() {
        // A degraded BACKBONE tier (declared/structural) makes ANY lens partial.
        assert!(is_partial(Lens::Design, &["declared"]));
        assert!(is_partial(Lens::Status, &["structural"]));
        // A degraded temporal tier makes the STATUS lens partial (it reads the
        // recency burst) but NOT the design lens (no temporal input).
        assert!(is_partial(Lens::Status, &["temporal"]));
        assert!(!is_partial(Lens::Design, &["temporal"]));
        // A degraded semantic tier alone never makes the backbone salience partial.
        assert!(!is_partial(Lens::Design, &["semantic"]));
        assert!(!is_partial(Lens::Status, &["semantic"]));
        // No degradation -> not partial.
        assert!(!is_partial(Lens::Status, &[]));
        // The partial flag carries through compute_salience to the served scores.
        let (g, nodes) = fixture();
        let basis = LensBasis::compute(&g, &scope(), &members(&nodes));
        let scores = compute_salience(&basis, &g, Lens::Status, None, 0, true);
        assert!(
            scores.partial,
            "the partial flag carries into the served scores"
        );
    }

    // --- W03.P08: annotate + DOI-ordered bounding ------------------------------

    #[test]
    fn annotate_attaches_salience_to_scored_nodes_only() {
        let mut scores = SalienceScores::default();
        scores.by_id.insert("doc:a".into(), 0.75);
        let mut nodes = vec![
            serde_json::json!({"id": "doc:a"}),
            serde_json::json!({"id": "feature:x"}), // unscored
        ];
        annotate_nodes(&mut nodes, &scores);
        assert_eq!(nodes[0]["salience"].as_f64().unwrap(), 0.75);
        assert!(
            nodes[1].get("salience").is_none(),
            "an unscored node gets no guessed salience"
        );
    }

    #[test]
    fn order_by_salience_puts_top_doi_first_unscored_last() {
        let mut scores = SalienceScores::default();
        scores.by_id.insert("doc:a".into(), 0.2);
        scores.by_id.insert("doc:b".into(), 0.9);
        let mut nodes = vec![
            serde_json::json!({"id": "doc:a"}),
            serde_json::json!({"id": "doc:unscored"}),
            serde_json::json!({"id": "doc:b"}),
        ];
        order_by_salience(&mut nodes, &scores);
        assert_eq!(nodes[0]["id"], "doc:b", "highest DOI first");
        assert_eq!(nodes[1]["id"], "doc:a");
        assert_eq!(
            nodes[2]["id"], "doc:unscored",
            "unscored recedes under truncation"
        );
    }
}
