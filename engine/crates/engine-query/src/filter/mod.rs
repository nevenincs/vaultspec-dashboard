//! The engine-owned filter object (contract §4, D7.2): validated,
//! normalized, and echoed back; the filter vocabulary is server-enumerated
//! — clients render it, never define it.

use std::cell::RefCell;
use std::collections::BTreeMap;

use engine_graph::{LinkageGraph, StoredEdge, lifecycle_in_scope};
use engine_model::{Node, Progress, ResolutionState, ScopeRef};
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
    #[error("unknown plan state `{0}`")]
    UnknownPlanState(String),
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

/// A blob-true date window (`from`/`to` inclusive, ISO `yyyy-mm-dd`). Either
/// bound is optional (open on that side). Compared LEXICALLY — ISO dates are
/// well-ordered as strings, the same discipline the lineage range uses
/// (`lineage::created_in_range`) — so no date parsing is needed. Which date the
/// window tests is the sibling [`Filter::date_field`].
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct DateRange {
    pub from: Option<String>,
    pub to: Option<String>,
}

/// Which date a `date_range` window filters by — the timeline CRITERION. All
/// three compare as `yyyy-mm-dd`: `created`/`stamped` are frontmatter date
/// strings, and `modified` is the worktree mtime converted to its UTC calendar
/// day (`lineage::ms_to_date_key`), so the wire window stays uniform date-strings
/// regardless of criterion. `created` (frontmatter `date:`) is the DEFAULT and
/// the only criterion present blob-true on every view; `modified` (the mtime) is
/// ABSENT on historical/as-of views — a node with no value for the chosen field
/// is excluded (honest degradation); `stamped` (frontmatter `modified:` CLI
/// stamp) is blob-true.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DateField {
    #[default]
    Created,
    Modified,
    Stamped,
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
    /// Plan lifecycle states to KEEP: one of `active`/`complete`. A node passes
    /// if its scoped lifecycle state (the SAME `lifecycle_in_scope(node, scope)`
    /// the graph slice serves — never derived in the frontend) is in this set; a
    /// node with no lifecycle is excluded when the facet is non-empty, the same
    /// exclusion the `statuses` facet applies. Scope-dependent (lifecycle is
    /// per-facet), so it is applied in `graph_query` where the scope is in hand —
    /// the same place `health` is wired, not in the node-field `matches_node` pass.
    pub plan_states: Vec<String>,
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
    /// Which date the `date_range` window (and the timeline range slice) filters
    /// by — `created` (default), `modified`, or `stamped`. See [`DateField`]. An
    /// absent value defaults to `created`, so a client that never sets it sees the
    /// unchanged created-only behaviour.
    pub date_field: DateField,
}

/// The graph EDGE tiers a filter may name (declared/structural/temporal).
/// Semantic is NOT a graph tier (D3.5) — it is never minted as a graph edge, so
/// it is not a valid edge-filter key and is not part of the served edge-tier
/// vocabulary. (The separate `semantic` AVAILABILITY tier on the envelope
/// `tiers` block — rag up/down — is unrelated and lives in the envelope layer.)
const TIER_NAMES: &[&str] = &["declared", "structural", "temporal"];
const STATE_NAMES: &[&str] = &["resolved", "stale", "broken"];
/// The ADR H1 status enum (dashboard-pipeline-wire W01): the known status set
/// a status facet is validated against. `superseded` is a real in-corpus ADR
/// status (an ADR retired by a later one); it is served in the `statuses`
/// vocabulary, so the filter grammar must accept it or a Decision-status toggle
/// on a superseded ADR 400s.
const STATUS_NAMES: &[&str] = &[
    "proposed",
    "accepted",
    "rejected",
    "deprecated",
    "superseded",
];
/// The plan tier enum (dashboard-pipeline-wire W01): the known tier set a
/// plan-tier facet is validated against.
const PLAN_TIER_NAMES: &[&str] = &["L1", "L2", "L3", "L4"];
/// The plan-COMPLETION enum the engine derives from a plan's checkbox PROGRESS
/// (done/total), NOT from `lifecycle.state` — for a tiered plan `lifecycle.state`
/// is the TIER (`L1`-`L4`), so completion must come from `progress`. The set a
/// `plan_states` facet is validated against, and the only values ever served.
const PLAN_STATE_NAMES: &[&str] = &["not-started", "in-progress", "finished"];

/// Derive a plan's COMPLETION class from its checkbox progress (done/total).
/// This is the single source of plan-state truth — `lifecycle.state` is overloaded
/// (it is the plan TIER for a tiered plan, an ADR status for an ADR, a severity for
/// an audit, …), so plan completion is read from PROGRESS only. `total == 0` (no
/// checkboxes / not a progress-bearing facet) → `None` so the facet excludes it.
///
/// `pub(crate)` so the plan-interior projection (`node.rs`) derives a plan's served
/// `summary.plan_state` from this ONE authority rather than re-classifying — keeping
/// the per-plan summary state consistent with the `plan_states` filter facet.
pub(crate) fn plan_completion_from_progress(p: &Progress) -> Option<&'static str> {
    if p.total == 0 {
        None
    } else if p.done >= p.total {
        Some("finished")
    } else if p.done == 0 {
        Some("not-started")
    } else {
        Some("in-progress")
    }
}
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
        for state in &self.plan_states {
            if !PLAN_STATE_NAMES.contains(&state.as_str()) {
                return Err(FilterError::UnknownPlanState(state.clone()));
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
        self.plan_states.sort();
        self.plan_states.dedup();
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
        // date is excluded when the window is set. Routed through THE shared
        // `lineage::created_in_range` predicate (was a duplicate inline compare):
        // it normalizes both `created` and the bounds to their `yyyy-mm-dd` prefix
        // before the lexical compare, so a time-suffixed `date:` still compares as
        // its calendar date rather than being dropped at the `to` boundary.
        if let Some(range) = &self.date_range
            && !crate::lineage::created_in_range(
                node.dates
                    .as_ref()
                    .and_then(|d| crate::lineage::date_key_for(d, self.date_field))
                    .as_deref(),
                range.from.as_deref(),
                range.to.as_deref(),
            )
        {
            return false;
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

    /// Does a node pass the plan-state facet? Plan COMPLETION, derived from the
    /// scoped lifecycle's checkbox PROGRESS (done/total) — never from
    /// `lifecycle.state`, which is the plan TIER for a tiered plan and a
    /// type-specific status for other doc types. Scope-dependent (lifecycle is
    /// per-facet, `lifecycle_in_scope(node, scope)`), so it is applied in
    /// `graph_query` where the scope is in hand, the same place `matches_health`
    /// is, not in `matches_node`. A node passes only if it is a PLAN whose scoped
    /// progress maps (via `plan_completion_from_progress`) to a completion class
    /// in the requested set; a non-plan node, or a plan with no scoped progress
    /// (total 0), is EXCLUDED when the facet is set (the same exclusion the
    /// `statuses` facet applies). An empty facet is no constraint.
    pub fn matches_plan_state(&self, node: &Node, scope: &ScopeRef) -> bool {
        if self.plan_states.is_empty() {
            return true;
        }
        if node.doc_type.as_deref() != Some("plan") {
            return false;
        }
        match lifecycle_in_scope(node, scope)
            .and_then(|l| l.progress.as_ref())
            .and_then(plan_completion_from_progress)
        {
            Some(completion) => sorted_contains(&self.plan_states, completion),
            None => false,
        }
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

/// Per-CRITERION corpus date spans — the timeline's left/right edges for each
/// selectable [`DateField`]. Each is omitted (absent) when no node carries that
/// field, so a client reading `date_bounds_by_field[<criterion>]` gets the honest
/// span or nothing. `created`/`stamped` are frontmatter date strings; `modified`
/// is the worktree mtime mapped to its UTC calendar day. The flat `date_bounds`
/// remains the `created` span for back-compat.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DateBoundsByField {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created: Option<DateBounds>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified: Option<DateBounds>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stamped: Option<DateBounds>,
}

/// Min/max of one date CRITERION across the graph, each value normalized to its
/// `yyyy-mm-dd` prefix so a time-suffixed `created`/`stamped` never skews the
/// lexically-ordered span (consistent with `created_in_range`). `None` when no
/// node carries that field.
pub(crate) fn field_bounds(graph: &LinkageGraph, field: DateField) -> Option<DateBounds> {
    graph
        .nodes()
        .filter_map(|n| {
            n.dates
                .as_ref()
                .and_then(|d| crate::lineage::date_key_for(d, field))
                .map(|s| crate::lineage::date_key(&s).to_string())
        })
        .fold(None::<(String, String)>, |acc, date| match acc {
            None => Some((date.clone(), date)),
            Some((min, max)) => Some((min.min(date.clone()), max.max(date))),
        })
        .map(|(min, max)| DateBounds { min, max })
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
    /// Plan COMPLETION classes actually present among PLAN nodes' facets
    /// (`not-started`/`in-progress`/`finished`), derived from checkbox progress:
    /// the data-driven plan-state facet a client renders, sorted and deduped —
    /// never a hardcoded enum, so the UI never shows a dead control. Plan-scoped
    /// and progress-derived, so it never leaks a tier/status/severity. Empty when
    /// no plan carries progress.
    pub plan_states: Vec<String>,
    pub structural_states: Vec<&'static str>,
    /// Document-health conditions actually present in the graph (filter-controls
    /// campaign): the `dangling`/`orphaned` facet a client renders, sorted, never
    /// hardcoded — empty when the corpus is clean.
    pub health: Vec<String>,
    /// Inclusive corpus `created` date span; `null` when no node carries a created
    /// date. Back-compat alias of `date_bounds_by_field.created`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date_bounds: Option<DateBounds>,
    /// Per-criterion corpus date spans (created / modified / stamped) — the
    /// timeline's edges for each selectable date field. Each criterion is omitted
    /// when no node carries it (honest degradation).
    pub date_bounds_by_field: DateBoundsByField,
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
    // Plan COMPLETION classes actually present: derived from PROGRESS over PLAN
    // nodes only. `lifecycle.state` is overloaded across doc types (it is the plan
    // TIER for a tiered plan, an ADR status for an ADR, a severity for an audit,
    // …), so plan completion must come from `progress` (a checkbox done/total),
    // and only on `doc_type == "plan"` nodes. Both constraints together guarantee
    // the facet is exactly `not-started`/`in-progress`/`finished` and never leaks a
    // tier/status/severity.
    let mut plan_states: Vec<String> = graph
        .nodes()
        .filter(|n| n.doc_type.as_deref() == Some("plan"))
        .flat_map(|n| n.facets.iter())
        .filter_map(|f| f.lifecycle.as_ref().and_then(|l| l.progress.as_ref()))
        .filter_map(plan_completion_from_progress)
        .map(|s| s.to_string())
        .collect();
    plan_states.sort();
    plan_states.dedup();
    // Serve in the natural lifecycle order (not-started → in-progress → finished),
    // not alphabetical — the client renders the served order, and "Finished" before
    // "In progress" reads backwards (caught by the filter-flyout visual-parity pass).
    plan_states.sort_by_key(|s| match s.as_str() {
        "not-started" => 0,
        "in-progress" => 1,
        "finished" => 2,
        _ => 3,
    });
    // Corpus date span from frontmatter `created` dates, normalized to their
    // `yyyy-mm-dd` prefix (`lineage::date_key`) so a non-compliant time-suffixed
    // value never skews the lexically-ordered span — consistent with the
    // date-range facet's `created_in_range` compare. The bounds a date-range
    // facet selects within.
    // Per-criterion spans (created / modified / stamped) via the shared
    // `field_bounds`. The flat `date_bounds` stays the `created` span (back-compat).
    let created_bounds = field_bounds(graph, DateField::Created);
    let date_bounds = created_bounds.clone();
    let date_bounds_by_field = DateBoundsByField {
        created: created_bounds,
        modified: field_bounds(graph, DateField::Modified),
        stamped: field_bounds(graph, DateField::Stamped),
    };
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
        plan_states,
        structural_states: STATE_NAMES.to_vec(),
        health,
        date_bounds,
        date_bounds_by_field,
        refs,
    }
}

#[cfg(test)]
mod tests;
