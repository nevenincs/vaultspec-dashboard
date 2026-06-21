//! The engine-owned filter object (contract §4, D7.2): validated,
//! normalized, and echoed back; the filter vocabulary is server-enumerated
//! — clients render it, never define it.

use std::cell::RefCell;
use std::collections::BTreeMap;

use engine_graph::{LinkageGraph, StoredEdge};
use engine_model::{Node, ResolutionState};
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum FilterError {
    #[error("unknown tier `{0}`")]
    UnknownTier(String),
    #[error("unknown structural state `{0}`")]
    UnknownState(String),
    #[error("unknown status `{0}`")]
    UnknownStatus(String),
    #[error("unknown plan tier `{0}`")]
    UnknownPlanTier(String),
    #[error("unknown health condition `{0}`")]
    UnknownHealth(String),
    #[error("min_confidence for `{tier}` must be 0..=1, found {found}")]
    ConfidenceRange { tier: String, found: f32 },
    #[error("invalid feature query `{value}`: {reason}")]
    InvalidFeatureQuery { value: String, reason: String },
}

/// How a [`FeatureQuery`] pattern is interpreted: a shell-style glob (anchored
/// full-match, `*`→any, `?`→one) or a regular expression (unanchored search).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FeatureQueryMode {
    Glob,
    Regex,
}

/// A glob or regex search over a node's feature tags (filter-controls campaign):
/// a node passes if ANY of its `feature_tags` matches. Distinct from the exact
/// `feature_tags` membership facet — this is the power-search the feature field
/// graduates to. Case-insensitive. The compiled program is size-bounded
/// (`bounded-by-default-for-every-accumulator`) and validated at parse time, so a
/// malformed pattern 400s rather than silently matching nothing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FeatureQuery {
    pub value: String,
    pub mode: FeatureQueryMode,
}

/// Byte ceiling on a feature-query PATTERN STRING before it is compiled
/// (bounded-by-default + defense-in-depth). The `regex` crate is linear-time, so a
/// long pattern cannot cause catastrophic backtracking, and `size_limit` already
/// bounds the compiled program — this simply rejects an absurd source up front (so
/// the only bound is not the 1 MiB wire body limit) and keeps compile work
/// trivial. Mirrors the frontend's per-value cap.
const FEATURE_QUERY_MAX_LEN: usize = 512;

/// Translate a shell-style glob to an anchored regex source. `*`→`.*`, `?`→`.`;
/// every other regex metacharacter is escaped so the glob stays literal.
fn glob_to_regex(glob: &str) -> String {
    let mut re = String::with_capacity(glob.len() + 4);
    re.push('^');
    for ch in glob.chars() {
        match ch {
            '*' => re.push_str(".*"),
            '?' => re.push('.'),
            '.' | '+' | '(' | ')' | '|' | '[' | ']' | '{' | '}' | '^' | '$' | '\\' => {
                re.push('\\');
                re.push(ch);
            }
            _ => re.push(ch),
        }
    }
    re.push('$');
    re
}

fn feature_regex_source(query: &FeatureQuery) -> String {
    match query.mode {
        FeatureQueryMode::Glob => glob_to_regex(&query.value),
        FeatureQueryMode::Regex => query.value.clone(),
    }
}

fn compile_feature_regex(query: &FeatureQuery) -> Result<Regex, regex::Error> {
    RegexBuilder::new(&feature_regex_source(query))
        .case_insensitive(true)
        // Bound the compiled program (≈1 MiB) so a pathological pattern cannot
        // blow the heap — the subprocess/accumulator-bounding discipline.
        .size_limit(1 << 20)
        .build()
}

thread_local! {
    // Per-thread one-entry cache of the last compiled feature pattern, keyed by
    // its regex source. matches_node runs per-node (and in parallel under rayon),
    // so this compiles once per worker per query instead of once per node.
    static FEATURE_RE_CACHE: RefCell<Option<(String, Regex)>> = const { RefCell::new(None) };
}

fn feature_query_matches(query: &FeatureQuery, tags: &[String]) -> bool {
    let source = feature_regex_source(query);
    FEATURE_RE_CACHE.with(|cell| {
        let mut slot = cell.borrow_mut();
        let stale = slot.as_ref().map(|(s, _)| s != &source).unwrap_or(true);
        if stale {
            match compile_feature_regex(query) {
                // validated() already rejected non-compiling patterns; a miss here
                // (cache cold) recompiles the validated source.
                Ok(re) => *slot = Some((source.clone(), re)),
                Err(_) => return false,
            }
        }
        let re = &slot.as_ref().expect("just populated").1;
        tags.iter().any(|tag| re.is_match(tag))
    })
}

/// A blob-true creation-date window (`from`/`to` inclusive, ISO `yyyy-mm-dd`).
/// Either bound is optional (open on that side). Compared LEXICALLY — ISO dates
/// are well-ordered as strings, the same discipline the lineage range uses
/// (`lineage::created_in_range`) — so no date parsing is needed.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct DateRange {
    pub from: Option<String>,
    pub to: Option<String>,
}

/// The wire filter (contract §4). All facets optional; absent = no
/// constraint. `deny_unknown_fields` keeps the grammar engine-owned:
/// a client inventing a facet fails loud instead of being ignored.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct Filter {
    /// Tier toggles: tier wire name → on/off.
    pub tiers: BTreeMap<String, bool>,
    /// Per-tier minimum confidence, floats 0..=1 (contract R3).
    pub min_confidence: BTreeMap<String, f32>,
    /// Edge relation wire names.
    pub relations: Vec<String>,
    /// Structural edge states (powers the "show broken" lens).
    pub structural_state: Vec<String>,
    /// Node kind wire names.
    pub kinds: Vec<String>,
    /// Vault doc-type wire names (`research`/`adr`/`plan`/`exec`/`audit`/...).
    /// The filter vocabulary already enumerates these as a filterable facet, so
    /// the grammar must accept them: a node passes if its `doc_type` is in this
    /// set. Open, data-driven vocabulary (like `feature_tags`) — not enum-checked.
    pub doc_types: Vec<String>,
    /// Feature tags (exact membership).
    pub feature_tags: Vec<String>,
    /// Glob/regex search over feature tags (filter-controls campaign): a node
    /// passes if any of its `feature_tags` matches the compiled pattern. The
    /// feature search field graduates to this for power queries.
    pub feature_query: Option<FeatureQuery>,
    /// ADR statuses (dashboard-pipeline-wire W01.P03.S12): one of
    /// `proposed`/`accepted`/`rejected`/`deprecated`. A node passes if it
    /// carries a status in this set; non-ADR nodes (no status) are excluded
    /// when the facet is non-empty, the same way the kinds facet narrows.
    pub statuses: Vec<String>,
    /// Plan tiers (dashboard-pipeline-wire W01.P03.S13): one of `L1`-`L4`. A
    /// node passes if it carries a tier in this set.
    pub plan_tiers: Vec<String>,
    /// Document health/validity conditions (filter-controls campaign): a node
    /// passes if it carries ANY requested condition. Engine-derivable subset:
    /// `dangling` (has a broken outgoing structural edge) and `orphaned` (no
    /// incoming edge). Graph-context — applied in `graph_query`, not `matches_node`.
    /// (`invalid`/`empty-scaffold` arrive with the vaultspec-core check ingestion.)
    pub health: Vec<String>,
    /// Case-insensitive text match over node key/title.
    pub text: Option<String>,
    /// Blob-true creation-date window: a node passes if its `created` date falls
    /// within `[from, to]` (inclusive, open bounds allowed). The filter
    /// vocabulary advertises the corpus `date_bounds`, and the client
    /// `GraphFilter` already emits `date_range`, so the grammar must accept it
    /// (it 400'd before). A node with no `created` date is excluded when the
    /// window is set — it has no position to test, the same exclusion the lineage
    /// range applies.
    pub date_range: Option<DateRange>,
}

const TIER_NAMES: &[&str] = &["declared", "structural", "temporal", "semantic"];
const STATE_NAMES: &[&str] = &["resolved", "stale", "broken"];
/// The ADR H1 status enum (dashboard-pipeline-wire W01): the known status set
/// a status facet is validated against.
const STATUS_NAMES: &[&str] = &["proposed", "accepted", "rejected", "deprecated"];
/// The plan tier enum (dashboard-pipeline-wire W01): the known tier set a
/// plan-tier facet is validated against.
const PLAN_TIER_NAMES: &[&str] = &["L1", "L2", "L3", "L4"];
/// The document-health conditions the engine derives from its own graph
/// (filter-controls campaign): `dangling` = a node with a broken outgoing
/// structural edge; `orphaned` = a node nothing links to. The schema-dependent
/// `invalid`/`empty-scaffold` conditions join this set with the vaultspec-core
/// check ingestion.
const HEALTH_NAMES: &[&str] = &["dangling", "orphaned"];

/// The health conditions a node carries, derived from the graph it lives in.
/// `dangling` when it has at least one broken outgoing structural edge (a link
/// that resolves to nothing); `orphaned` when no edge points at it. Reads the
/// node's incident edges via `edges_of` — graph context, not a stored field.
pub fn node_health(graph: &LinkageGraph, node: &Node) -> Vec<&'static str> {
    let mut has_incoming = false;
    let mut has_dangling = false;
    for stored in graph.edges_of(&node.id) {
        let edge = &stored.edge;
        if edge.dst == node.id {
            has_incoming = true;
        }
        if edge.src == node.id && edge.state == Some(ResolutionState::Broken) {
            has_dangling = true;
        }
    }
    let mut conditions = Vec::new();
    if has_dangling {
        conditions.push("dangling");
    }
    if !has_incoming {
        conditions.push("orphaned");
    }
    conditions
}

fn sorted_contains(values: &[String], needle: &str) -> bool {
    debug_assert!(
        values.windows(2).all(|pair| pair[0] <= pair[1]),
        "filter facets should be sorted by Filter::validated before matching"
    );
    values
        .binary_search_by(|candidate| candidate.as_str().cmp(needle))
        .is_ok()
}

impl Filter {
    /// Validate and normalize (sort lists, lowercase names). The
    /// normalized form is what gets echoed back to clients.
    pub fn validated(mut self) -> Result<Filter, FilterError> {
        for name in self.tiers.keys().chain(self.min_confidence.keys()) {
            if !TIER_NAMES.contains(&name.as_str()) {
                return Err(FilterError::UnknownTier(name.clone()));
            }
        }
        for (tier, value) in &self.min_confidence {
            if !(0.0..=1.0).contains(value) {
                return Err(FilterError::ConfidenceRange {
                    tier: tier.clone(),
                    found: *value,
                });
            }
        }
        for state in &self.structural_state {
            if !STATE_NAMES.contains(&state.as_str()) {
                return Err(FilterError::UnknownState(state.clone()));
            }
        }
        for status in &self.statuses {
            if !STATUS_NAMES.contains(&status.as_str()) {
                return Err(FilterError::UnknownStatus(status.clone()));
            }
        }
        for tier in &self.plan_tiers {
            if !PLAN_TIER_NAMES.contains(&tier.as_str()) {
                return Err(FilterError::UnknownPlanTier(tier.clone()));
            }
        }
        for condition in &self.health {
            if !HEALTH_NAMES.contains(&condition.as_str()) {
                return Err(FilterError::UnknownHealth(condition.clone()));
            }
        }
        self.relations.sort();
        self.relations.dedup();
        self.structural_state.sort();
        self.structural_state.dedup();
        self.kinds.sort();
        self.kinds.dedup();
        self.doc_types.sort();
        self.doc_types.dedup();
        self.feature_tags.sort();
        self.feature_tags.dedup();
        self.statuses.sort();
        self.statuses.dedup();
        self.plan_tiers.sort();
        self.plan_tiers.dedup();
        self.health.sort();
        self.health.dedup();
        self.text = self.text.map(|text| text.to_lowercase());
        // Feature query: drop an empty pattern (no constraint), else validate it
        // compiles so a malformed pattern 400s loud instead of silently matching
        // nothing.
        if let Some(query) = &self.feature_query {
            if query.value.trim().is_empty() {
                self.feature_query = None;
            } else if query.value.len() > FEATURE_QUERY_MAX_LEN {
                return Err(FilterError::InvalidFeatureQuery {
                    value: query.value.clone(),
                    reason: format!("pattern exceeds {FEATURE_QUERY_MAX_LEN} bytes"),
                });
            } else {
                compile_feature_regex(query).map_err(|err| FilterError::InvalidFeatureQuery {
                    value: query.value.clone(),
                    reason: err.to_string(),
                })?;
            }
        }
        Ok(self)
    }

    /// Does an edge pass this filter?
    pub fn matches_edge(&self, stored: &StoredEdge) -> bool {
        let edge = &stored.edge;
        let tier_name = edge.tier.as_str();
        if let Some(false) = self.tiers.get(tier_name) {
            return false;
        }
        if let Some(min) = self.min_confidence.get(tier_name) {
            // Broken edges are surfaced via the structural-state facet,
            // not hidden by confidence arithmetic (audit ruling
            // W02P05-201): when the state facet explicitly asks for
            // broken, the floor does not apply to them.
            let explicitly_broken = edge.state == Some(ResolutionState::Broken)
                && sorted_contains(&self.structural_state, "broken");
            if !explicitly_broken && edge.confidence < *min {
                return false;
            }
        }
        if !self.relations.is_empty() && !sorted_contains(&self.relations, edge.relation.as_str()) {
            return false;
        }
        if !self.structural_state.is_empty() {
            // Non-structural edges (state None) are not excluded by the
            // structural facet; the facet narrows structural edges only.
            let state_name = match edge.state {
                Some(ResolutionState::Resolved) => Some("resolved"),
                Some(ResolutionState::Stale) => Some("stale"),
                Some(ResolutionState::Broken) => Some("broken"),
                None => None,
            };
            if let Some(name) = state_name
                && !sorted_contains(&self.structural_state, name)
            {
                return false;
            }
        }
        true
    }

    /// Does a node pass this filter?
    pub fn matches_node(&self, node: &Node) -> bool {
        if !self.kinds.is_empty() {
            let kind = serde_json::to_value(&node.kind)
                .ok()
                .and_then(|v| v.as_str().map(str::to_string))
                .unwrap_or_default();
            if !sorted_contains(&self.kinds, &kind) {
                return false;
            }
        }
        if !self.feature_tags.is_empty()
            && !node
                .feature_tags
                .iter()
                .any(|t| sorted_contains(&self.feature_tags, t))
        {
            return false;
        }
        // Feature glob/regex search: a node passes if any feature tag matches the
        // compiled pattern (validated at parse time, compiled once per worker).
        if let Some(query) = &self.feature_query
            && !feature_query_matches(query, &node.feature_tags)
        {
            return false;
        }
        // Doc-type facet: a non-empty facet narrows to nodes whose vault doc-type
        // is in the requested set; a node with no doc_type (a feature/code node)
        // does not match, the same exclusion the kinds/status facets apply. This
        // is what powers the left-rail category chips as a SERVER-side narrowing
        // (the vocabulary already advertises these doc-types as filterable).
        if !self.doc_types.is_empty()
            && !node
                .doc_type
                .as_deref()
                .is_some_and(|t| sorted_contains(&self.doc_types, t))
        {
            return false;
        }
        // Status facet (W01.P03.S12): a non-empty facet narrows to nodes whose
        // status is in the requested set; a node with no status (non-ADR) does
        // not match, the same exclusion the kinds facet applies.
        if !self.statuses.is_empty()
            && !node
                .status
                .as_deref()
                .is_some_and(|s| sorted_contains(&self.statuses, s))
        {
            return false;
        }
        // Plan-tier facet (W01.P03.S13): narrows to nodes whose tier is in the
        // requested set; a node with no tier (non-plan) does not match.
        if !self.plan_tiers.is_empty()
            && !node
                .tier
                .as_deref()
                .is_some_and(|t| sorted_contains(&self.plan_tiers, t))
        {
            return false;
        }
        if let Some(text) = &self.text {
            let hit = node.key.to_lowercase().contains(text)
                || node
                    .title
                    .as_deref()
                    .is_some_and(|t| t.to_lowercase().contains(text));
            if !hit {
                return false;
            }
        }
        // Date-range facet: a node passes if its blob-true `created` date is in
        // the window (inclusive, open bounds allowed); a node with no created
        // date is excluded when the window is set. Lexical ISO compare, mirroring
        // `lineage::created_in_range`.
        if let Some(range) = &self.date_range {
            let created = node.dates.as_ref().and_then(|d| d.created.as_deref());
            let Some(created) = created else {
                return false;
            };
            if let Some(from) = range.from.as_deref()
                && created < from
            {
                return false;
            }
            if let Some(to) = range.to.as_deref()
                && created > to
            {
                return false;
            }
        }
        true
    }

    /// Does a node pass the health facet? Graph-context (orphaned/dangling need
    /// the node's incident edges), so it is applied in `graph_query` after the
    /// `matches_node` pass — a node passes if it carries ANY requested condition.
    /// An empty health facet is no constraint.
    pub fn matches_health(&self, graph: &LinkageGraph, node: &Node) -> bool {
        if self.health.is_empty() {
            return true;
        }
        let conditions = node_health(graph, node);
        self.health
            .iter()
            .any(|wanted| conditions.iter().any(|have| have == wanted))
    }
}

/// Inclusive corpus date span (contract §4 `/filters` date bounds): the
/// min/max of the nodes' frontmatter `created` dates, the field a client's
/// date-range facet constrains against. ISO `yyyy-mm-dd` strings compare
/// lexically, so the bounds are well-ordered without date parsing. Absent
/// (serialized `null`) when no node in the graph carries a created date.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DateBounds {
    pub min: String,
    pub max: String,
}

/// The legal filter vocabulary actually present in a graph (contract §4
/// `/filters`): data-driven, nothing hardcoded client-side. Carries the full
/// §4 facet set — relation types, tiers, doc types, feature tags, node kinds,
/// date bounds, and refs — so the filter UI enumerates every facet from one
/// server read.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Vocabulary {
    pub tiers: Vec<&'static str>,
    pub relations: Vec<String>,
    pub kinds: Vec<String>,
    pub doc_types: Vec<String>,
    pub feature_tags: Vec<String>,
    /// ADR statuses actually present in the graph (dashboard-pipeline-wire
    /// W01.P03.S10): the data-driven status facet a client renders, sorted and
    /// deduped, never a hardcoded enum.
    pub statuses: Vec<String>,
    /// Plan tiers actually present in the graph (dashboard-pipeline-wire
    /// W01.P03.S11): the data-driven tier facet, sorted and deduped.
    pub plan_tiers: Vec<String>,
    pub structural_states: Vec<&'static str>,
    /// Document-health conditions actually present in the graph (filter-controls
    /// campaign): the `dangling`/`orphaned` facet a client renders, sorted, never
    /// hardcoded — empty when the corpus is clean.
    pub health: Vec<String>,
    /// Inclusive corpus date span; `null` when no node carries a created date.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date_bounds: Option<DateBounds>,
    /// The corpus-view refs actually present in node facets (worktree paths
    /// or ref names) — the time/scope axis surfaced data-driven, never a
    /// hardcoded client list.
    pub refs: Vec<String>,
}

pub fn vocabulary(graph: &LinkageGraph) -> Vocabulary {
    let mut relations: Vec<String> = graph
        .edges()
        .map(|s| s.edge.relation.as_str().to_string())
        .collect();
    relations.sort();
    relations.dedup();
    let mut kinds: Vec<String> = graph
        .nodes()
        .filter_map(|n| {
            serde_json::to_value(&n.kind)
                .ok()
                .and_then(|v| v.as_str().map(str::to_string))
        })
        .collect();
    kinds.sort();
    kinds.dedup();
    let mut doc_types: Vec<String> = graph.nodes().filter_map(|n| n.doc_type.clone()).collect();
    doc_types.sort();
    doc_types.dedup();
    let mut feature_tags: Vec<String> = graph
        .nodes()
        .flat_map(|n| n.feature_tags.iter().cloned())
        .collect();
    feature_tags.sort();
    feature_tags.dedup();
    // ADR statuses + plan tiers actually present (W01.P03.S10/S11): enumerated
    // from the nodes' query-time facets, sorted and deduped — the same
    // data-driven discipline as doc_types and feature_tags.
    let mut statuses: Vec<String> = graph.nodes().filter_map(|n| n.status.clone()).collect();
    statuses.sort();
    statuses.dedup();
    let mut plan_tiers: Vec<String> = graph.nodes().filter_map(|n| n.tier.clone()).collect();
    plan_tiers.sort();
    plan_tiers.dedup();
    // Corpus date span from frontmatter `created` dates (ISO yyyy-mm-dd,
    // lexically ordered): the bounds a date-range facet selects within.
    let date_bounds = graph
        .nodes()
        .filter_map(|n| n.dates.as_ref().and_then(|d| d.created.clone()))
        .fold(None::<(String, String)>, |acc, date| match acc {
            None => Some((date.clone(), date)),
            Some((min, max)) => Some((min.min(date.clone()), max.max(date))),
        })
        .map(|(min, max)| DateBounds { min, max });
    // Refs actually present in node facets: the scope/time axis, data-driven.
    let mut refs: Vec<String> = graph
        .nodes()
        .flat_map(|n| n.facets.iter())
        .map(|f| match &f.scope {
            engine_model::ScopeRef::Worktree { path } => path.clone(),
            engine_model::ScopeRef::Ref { name } => name.clone(),
        })
        .collect();
    refs.sort();
    refs.dedup();
    // Document-health conditions actually present (filter-controls campaign):
    // scan each node's incident edges once (O(E) total) and collect the derived
    // conditions in canonical order — `null`/empty when the corpus is clean.
    let mut health_present: Vec<&'static str> = Vec::new();
    for node in graph.nodes() {
        for condition in node_health(graph, node) {
            if !health_present.contains(&condition) {
                health_present.push(condition);
            }
        }
        if health_present.len() == HEALTH_NAMES.len() {
            break;
        }
    }
    // Canonical order (dangling, orphaned) for a stable echo.
    let health: Vec<String> = HEALTH_NAMES
        .iter()
        .filter(|name| health_present.contains(name))
        .map(|name| name.to_string())
        .collect();
    Vocabulary {
        tiers: TIER_NAMES.to_vec(),
        relations,
        kinds,
        doc_types,
        feature_tags,
        statuses,
        plan_tiers,
        structural_states: STATE_NAMES.to_vec(),
        health,
        date_bounds,
        refs,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validation_rejects_unknown_names_and_bad_ranges() {
        let bad_tier: Filter = serde_json::from_str(r#"{"tiers": {"psychic": true}}"#).unwrap();
        assert_eq!(
            bad_tier.validated(),
            Err(FilterError::UnknownTier("psychic".into()))
        );
        let bad_conf: Filter =
            serde_json::from_str(r#"{"min_confidence": {"temporal": 1.5}}"#).unwrap();
        assert!(matches!(
            bad_conf.validated(),
            Err(FilterError::ConfidenceRange { .. })
        ));
        let bad_state: Filter = serde_json::from_str(r#"{"structural_state": ["wonky"]}"#).unwrap();
        assert_eq!(
            bad_state.validated(),
            Err(FilterError::UnknownState("wonky".into()))
        );
        // Engine-owned grammar: unknown facets fail loud.
        assert!(serde_json::from_str::<Filter>(r#"{"vibes": "good"}"#).is_err());
    }

    #[test]
    fn vocabulary_emits_the_full_contract_facet_set() {
        // Contract §4 names the complete /filters facet set: relations,
        // tiers, doc types, feature tags, node kinds, date bounds, and refs.
        // This is the data-driven enumeration the filter UI renders.
        use engine_model::{
            CanonicalKey, Dates, Facet, Node, NodeKind, Presence, ScopeRef, node_id,
        };

        fn doc(stem: &str, doc_type: &str, created: &str, feature: &str, scope: ScopeRef) -> Node {
            Node {
                id: node_id(&CanonicalKey::Document { stem }),
                kind: NodeKind::Document,
                key: stem.to_string(),
                title: None,
                doc_type: Some(doc_type.to_string()),
                dates: Some(Dates {
                    created: Some(created.to_string()),
                    modified: None,
                }),
                feature_tags: vec![feature.to_string()],
                status: None,
                tier: None,
                facets: vec![Facet {
                    scope,
                    presence: Presence::Exists,
                    content_hash: None,
                    lifecycle: None,
                }],
            }
        }

        let mut graph = LinkageGraph::new();
        graph.upsert_node(doc(
            "p1",
            "plan",
            "2026-06-12",
            "alpha",
            ScopeRef::Worktree {
                path: "/wt/main".into(),
            },
        ));
        graph.upsert_node(doc(
            "a1",
            "adr",
            "2026-06-10",
            "beta",
            ScopeRef::Ref {
                name: "feature-x".into(),
            },
        ));
        // Duplicate doc_type / scope to prove dedup; later created date to
        // prove the max bound moves.
        graph.upsert_node(doc(
            "p2",
            "plan",
            "2026-06-14",
            "alpha",
            ScopeRef::Worktree {
                path: "/wt/main".into(),
            },
        ));

        let vocab = vocabulary(&graph);
        assert_eq!(vocab.doc_types, vec!["adr", "plan"], "sorted, deduped");
        assert_eq!(vocab.feature_tags, vec!["alpha", "beta"]);
        assert_eq!(
            vocab.date_bounds,
            Some(DateBounds {
                min: "2026-06-10".into(),
                max: "2026-06-14".into(),
            }),
            "corpus min/max over created dates"
        );
        assert_eq!(
            vocab.refs,
            vec!["/wt/main", "feature-x"],
            "distinct facet scopes, sorted + deduped"
        );

        // An empty graph carries absent date bounds (serialized null), never a
        // bogus pair.
        let empty = vocabulary(&LinkageGraph::new());
        assert_eq!(empty.date_bounds, None);
        assert!(empty.doc_types.is_empty() && empty.refs.is_empty());
    }

    #[test]
    fn status_and_plan_tier_facets_are_enumerated_sorted_and_deduped() {
        // W01.P03.S14: the status and plan-tier vocabulary is data-driven —
        // enumerated from the nodes actually present, sorted, deduped. A node
        // with neither contributes to neither facet.
        use engine_model::{CanonicalKey, NodeKind, Presence, ScopeRef, node_id};

        fn node(stem: &str, doc_type: &str, status: Option<&str>, tier: Option<&str>) -> Node {
            Node {
                id: node_id(&CanonicalKey::Document { stem }),
                kind: NodeKind::Document,
                key: stem.to_string(),
                title: None,
                doc_type: Some(doc_type.to_string()),
                dates: None,
                feature_tags: vec![],
                status: status.map(str::to_string),
                tier: tier.map(str::to_string),
                facets: vec![engine_model::Facet {
                    scope: ScopeRef::Ref {
                        name: "main".into(),
                    },
                    presence: Presence::Exists,
                    content_hash: None,
                    lifecycle: None,
                }],
            }
        }

        let mut graph = LinkageGraph::new();
        // Two ADRs sharing `accepted` (proves dedup), one `proposed`.
        graph.upsert_node(node("a1", "adr", Some("accepted"), None));
        graph.upsert_node(node("a2", "adr", Some("proposed"), None));
        graph.upsert_node(node("a3", "adr", Some("accepted"), None));
        // Two plans, tiers L3 and L1 (proves sort), plus a duplicate L3.
        graph.upsert_node(node("p1", "plan", None, Some("L3")));
        graph.upsert_node(node("p2", "plan", None, Some("L1")));
        graph.upsert_node(node("p3", "plan", None, Some("L3")));
        // A research doc with neither — contributes to neither facet.
        graph.upsert_node(node("r1", "research", None, None));

        let vocab = vocabulary(&graph);
        assert_eq!(
            vocab.statuses,
            vec!["accepted", "proposed"],
            "statuses sorted + deduped from the graph"
        );
        assert_eq!(
            vocab.plan_tiers,
            vec!["L1", "L3"],
            "plan tiers sorted + deduped from the graph"
        );

        // An empty graph carries empty facets, never a hardcoded enum.
        let empty = vocabulary(&LinkageGraph::new());
        assert!(empty.statuses.is_empty() && empty.plan_tiers.is_empty());
    }

    #[test]
    fn status_and_plan_tier_filters_narrow_and_reject_out_of_enum() {
        // W01.P03.S12/S13: the matches_node check narrows to the requested set;
        // a node with no status/tier is excluded when the facet is non-empty;
        // validation rejects an out-of-enum status or tier.
        use engine_model::{CanonicalKey, NodeKind, Presence, ScopeRef, node_id};
        let node = |status: Option<&str>, tier: Option<&str>| Node {
            id: node_id(&CanonicalKey::Document { stem: "x" }),
            kind: NodeKind::Document,
            key: "x".into(),
            title: None,
            doc_type: None,
            dates: None,
            feature_tags: vec![],
            status: status.map(str::to_string),
            tier: tier.map(str::to_string),
            facets: vec![engine_model::Facet {
                scope: ScopeRef::Ref {
                    name: "main".into(),
                },
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: None,
            }],
        };
        let _ = NodeKind::Document;

        let by_status = Filter {
            statuses: vec!["accepted".into()],
            ..Default::default()
        };
        assert!(by_status.matches_node(&node(Some("accepted"), None)));
        assert!(!by_status.matches_node(&node(Some("proposed"), None)));
        assert!(
            !by_status.matches_node(&node(None, None)),
            "a status-less node is excluded by a non-empty status facet"
        );

        let by_tier = Filter {
            plan_tiers: vec!["L3".into()],
            ..Default::default()
        };
        assert!(by_tier.matches_node(&node(None, Some("L3"))));
        assert!(!by_tier.matches_node(&node(None, Some("L1"))));
        assert!(!by_tier.matches_node(&node(None, None)));

        // Out-of-enum facets fail validation loud.
        let bad_status: Filter = serde_json::from_str(r#"{"statuses": ["superseded"]}"#).unwrap();
        assert_eq!(
            bad_status.validated(),
            Err(FilterError::UnknownStatus("superseded".into()))
        );
        let bad_tier: Filter = serde_json::from_str(r#"{"plan_tiers": ["L9"]}"#).unwrap();
        assert_eq!(
            bad_tier.validated(),
            Err(FilterError::UnknownPlanTier("L9".into()))
        );
    }

    #[test]
    fn doc_type_facet_narrows_and_is_an_accepted_grammar_field() {
        // The filter vocabulary advertises `doc_types` as filterable, so the
        // grammar must ACCEPT them (it 400'd before): a non-empty facet narrows
        // to nodes whose doc_type is in the set; a doc_type-less node (a feature/
        // code node) is excluded, the same exclusion kinds/statuses apply.
        use engine_model::{CanonicalKey, NodeKind, Presence, ScopeRef, node_id};
        let node = |doc_type: Option<&str>| Node {
            id: node_id(&CanonicalKey::Document { stem: "x" }),
            kind: NodeKind::Document,
            key: "x".into(),
            title: None,
            doc_type: doc_type.map(str::to_string),
            dates: None,
            feature_tags: vec![],
            status: None,
            tier: None,
            facets: vec![engine_model::Facet {
                scope: ScopeRef::Ref {
                    name: "main".into(),
                },
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: None,
            }],
        };
        // `doc_types` is an accepted field (no deny_unknown_fields rejection) and
        // normalizes (sort + dedup) like the other data-driven facets.
        let by_doc_type: Filter =
            serde_json::from_str(r#"{"doc_types": ["plan", "adr", "adr"]}"#).unwrap();
        let normalized = by_doc_type.validated().unwrap();
        assert_eq!(normalized.doc_types, vec!["adr", "plan"], "sorted, deduped");
        assert!(normalized.matches_node(&node(Some("adr"))));
        assert!(normalized.matches_node(&node(Some("plan"))));
        assert!(!normalized.matches_node(&node(Some("research"))));
        assert!(
            !normalized.matches_node(&node(None)),
            "a doc_type-less node is excluded by a non-empty doc_types facet"
        );
    }

    #[test]
    fn date_range_facet_narrows_by_created_and_is_an_accepted_grammar_field() {
        // The client GraphFilter emits `date_range`; the grammar must accept it
        // (it 400'd before). A node passes if its blob-true `created` date is in
        // the inclusive window; open bounds are allowed; an undated node is
        // excluded when the window is set (mirrors lineage::created_in_range).
        use engine_model::{CanonicalKey, Dates, NodeKind, Presence, ScopeRef, node_id};
        let node = |created: Option<&str>| Node {
            id: node_id(&CanonicalKey::Document { stem: "x" }),
            kind: NodeKind::Document,
            key: "x".into(),
            title: None,
            doc_type: Some("adr".into()),
            dates: created.map(|c| Dates {
                created: Some(c.to_string()),
                modified: None,
            }),
            feature_tags: vec![],
            status: None,
            tier: None,
            facets: vec![engine_model::Facet {
                scope: ScopeRef::Ref {
                    name: "main".into(),
                },
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: None,
            }],
        };
        // `date_range` is an accepted field (no deny_unknown_fields rejection).
        let f: Filter =
            serde_json::from_str(r#"{"date_range": {"from": "2026-06-01", "to": "2026-06-15"}}"#)
                .unwrap();
        let f = f.validated().unwrap();
        assert!(f.matches_node(&node(Some("2026-06-10"))), "in range");
        assert!(
            f.matches_node(&node(Some("2026-06-01"))),
            "from is inclusive"
        );
        assert!(f.matches_node(&node(Some("2026-06-15"))), "to is inclusive");
        assert!(!f.matches_node(&node(Some("2026-05-31"))), "before from");
        assert!(!f.matches_node(&node(Some("2026-06-16"))), "after to");
        assert!(
            !f.matches_node(&node(None)),
            "an undated node is excluded by a set window"
        );
        // Open upper bound.
        let open: Filter =
            serde_json::from_str(r#"{"date_range": {"from": "2026-06-10"}}"#).unwrap();
        assert!(open.matches_node(&node(Some("2026-12-31"))));
        assert!(!open.matches_node(&node(Some("2026-06-09"))));
    }

    #[test]
    fn feature_query_glob_and_regex_search_over_feature_tags() {
        // filter-controls campaign: the feature query narrows by glob or regex
        // over a node's feature_tags (any-match), case-insensitive; an empty
        // pattern is dropped; a malformed regex 400s.
        use engine_model::{CanonicalKey, NodeKind, Presence, ScopeRef, node_id};
        let node = |tags: &[&str]| Node {
            id: node_id(&CanonicalKey::Document { stem: "x" }),
            kind: NodeKind::Document,
            key: "x".into(),
            title: None,
            doc_type: None,
            dates: None,
            feature_tags: tags.iter().map(|t| t.to_string()).collect(),
            status: None,
            tier: None,
            facets: vec![engine_model::Facet {
                scope: ScopeRef::Ref {
                    name: "main".into(),
                },
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: None,
            }],
        };

        // Glob: anchored full-match, `*` wildcard, case-insensitive.
        let glob: Filter =
            serde_json::from_str(r#"{"feature_query": {"value": "dashboard-*", "mode": "glob"}}"#)
                .unwrap();
        let glob = glob.validated().unwrap();
        assert!(glob.matches_node(&node(&["dashboard-gui"])));
        assert!(glob.matches_node(&node(&["unrelated", "Dashboard-Settings"])));
        assert!(!glob.matches_node(&node(&["engine-hardening"])));
        // Anchored: a glob must match the whole tag, not a substring.
        assert!(!glob.matches_node(&node(&["my-dashboard-gui"])));

        // Regex: unanchored search.
        let regex: Filter =
            serde_json::from_str(r#"{"feature_query": {"value": "sync$", "mode": "regex"}}"#)
                .unwrap();
        let regex = regex.validated().unwrap();
        assert!(regex.matches_node(&node(&["delta-sync"])));
        assert!(!regex.matches_node(&node(&["sync-engine"])));

        // An empty pattern is normalized away (no constraint).
        let empty: Filter =
            serde_json::from_str(r#"{"feature_query": {"value": "   ", "mode": "glob"}}"#).unwrap();
        let empty = empty.validated().unwrap();
        assert_eq!(empty.feature_query, None);
        assert!(empty.matches_node(&node(&["anything"])));

        // A malformed regex 400s loud rather than silently matching nothing.
        let bad: Filter =
            serde_json::from_str(r#"{"feature_query": {"value": "(unclosed", "mode": "regex"}}"#)
                .unwrap();
        assert!(matches!(
            bad.validated(),
            Err(FilterError::InvalidFeatureQuery { .. })
        ));
    }

    #[test]
    fn normalization_sorts_and_dedups_for_a_stable_echo() {
        let filter: Filter = serde_json::from_str(
            r#"{"relations": ["mentions", "fulfills", "mentions"],
                "structural_state": ["stale", "broken", "stale"]}"#,
        )
        .unwrap();
        let normalized = filter.validated().unwrap();
        assert_eq!(normalized.relations, vec!["fulfills", "mentions"]);
        assert_eq!(normalized.structural_state, vec!["broken", "stale"]);
    }
}
