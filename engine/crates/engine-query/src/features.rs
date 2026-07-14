//! The bounded feature-coverage projection (feature-group-authoring ADR D2/D3):
//! a projection over the existing `LinkageGraph` that answers, per feature tag,
//! what the feature's pipeline group already contains — for each pipeline doc
//! type the present documents' newest stem and a present flag, the missing
//! types, per-type eligibility (the hierarchy gate the feature-group panel
//! renders), and a served `next_step` token; plus a compact all-features roster.
//!
//! This is a projection over the one model (`views-are-projections-of-one-model`),
//! not a new model: it reads the `doc_type` + `feature_tags` + `key` (stem) the
//! ingest already stamps on every document node. It is read-and-infer, CPU-only,
//! computed over the FULL pre-truncation corpus (no node ceiling — coverage must
//! be honest), and surfaced through the shared envelope by the route layer
//! (`every-wire-response-carries-the-tiers-block`). Eligibility is served
//! guidance; the engine and core refuse nothing new (ADR D3) — the gate lives in
//! the presentation plane.

use std::collections::BTreeMap;

use engine_graph::LinkageGraph;
use serde::Serialize;

/// The pipeline document types this projection reports coverage for, in pipeline
/// order (research/reference are the parallel entry points → adr → plan → exec →
/// audit). `exec` is reported for coverage but is NEVER eligible from this
/// surface (ADR D4: exec records are plan-derived scaffolds, not free-form
/// creates); `audit` legally opens a pipeline so it is always eligible with an
/// advisory when nothing upstream exists (ADR D3).
pub const PIPELINE_DOC_TYPES: &[&str] = &["research", "reference", "adr", "plan", "exec", "audit"];

/// Hard cap on the number of features carried in the coverage map / roster
/// (`bounded-by-default-for-every-accumulator`, resource-bounds rule). A vault's
/// feature count is inherently corpus-bounded (one tag per work stream), but the
/// served roster is capped so a pathological corpus can never emit an unbounded
/// list; the retained features are the lexicographically-first `CAP`.
pub const FEATURE_COVERAGE_ROSTER_CAP: usize = 500;

/// Coverage of one pipeline doc type within a feature group (ADR D2/D3). Present
/// carries the newest stem (the link target the panel pre-fills, ADR D5) and a
/// count (multiple same-type documents per feature are legal). `eligible` is the
/// served hierarchy gate; `note` names why a type is ineligible or carries
/// advice, for the disabled-with-reason / advisory the panel renders — a single
/// token the dumb chrome maps to plain language (design-system labels law).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TypeCoverage {
    /// The pipeline doc type token (`research`/`reference`/`adr`/`plan`/`exec`/`audit`).
    pub doc_type: &'static str,
    /// Whether at least one document of this type exists in the feature group.
    pub present: bool,
    /// How many documents of this type the feature has (0 when absent).
    pub count: u32,
    /// The newest present stem (newest by date prefix, ties by stem ordering) —
    /// the deterministic cross-link target (ADR D5). Absent when the type is
    /// missing.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub newest_stem: Option<String>,
    /// Whether this type may be created from the feature-group panel right now
    /// (served guidance, not an integrity boundary — ADR D3).
    pub eligible: bool,
    /// A token naming why the type is ineligible, or an advisory when eligible:
    /// `requires-research-or-reference` (adr), `requires-adr` (plan),
    /// `plan-derived` (exec, never eligible here), `no-upstream` (audit opening a
    /// pipeline). Absent when eligible with nothing to note.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<&'static str>,
}

/// Full pipeline coverage for one feature group (ADR D2). Served for a requested
/// feature; an unknown feature (a brand-new one being started in the panel)
/// yields an all-missing coverage whose `next_step` is the first entry point.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct FeatureCoverage {
    /// The feature tag this coverage describes.
    pub feature: String,
    /// One entry per pipeline doc type, in pipeline order.
    pub types: Vec<TypeCoverage>,
    /// The pipeline doc types with no document present, in pipeline order — a
    /// convenience derived from `types`, so the panel need not recompute it.
    pub missing: Vec<&'static str>,
    /// The advised next pipeline link to close (`research` when no entry point
    /// exists, then `adr`, then `plan`); absent once the research/reference → adr
    /// → plan chain is satisfied.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_step: Option<&'static str>,
}

/// A compact per-feature roster entry (ADR D2, all-features variant): the feature
/// tag, its document counts, and the advised next step — enough for the panel's
/// feature combobox to show group progress without a per-feature round trip.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct FeatureRosterEntry {
    /// The feature tag.
    pub feature: String,
    /// Total pipeline documents present in the feature group.
    pub doc_count: u32,
    /// How many of the pipeline doc types are present (0..=6).
    pub types_present: u32,
    /// The advised next pipeline link to close; absent once the chain is
    /// satisfied.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_step: Option<&'static str>,
}

/// The generation-stable coverage map over the whole corpus (ADR D2). Holds full
/// per-feature coverage for the lexicographically-first `FEATURE_COVERAGE_ROSTER_CAP`
/// features, so ONE memoized structure serves both the per-feature read and the
/// roster. Memoized on graph `generation` by the cell (S05).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CoverageMap {
    features: BTreeMap<String, FeatureCoverage>,
}

impl CoverageMap {
    /// The coverage for a requested feature. An unknown feature (one with no
    /// document yet — a new feature being started in the panel, or one beyond the
    /// roster cap) yields an all-missing coverage: every type absent, the entry
    /// point advised. This is exactly the panel's "start a new feature" state.
    pub fn coverage_for(&self, feature: &str) -> FeatureCoverage {
        self.features
            .get(feature)
            .cloned()
            .unwrap_or_else(|| empty_coverage(feature))
    }

    /// The compact all-features roster, sorted by feature tag, capped at
    /// `FEATURE_COVERAGE_ROSTER_CAP` (the map is already capped at build).
    pub fn roster(&self) -> Vec<FeatureRosterEntry> {
        self.features
            .values()
            .map(|coverage| {
                let doc_count = coverage.types.iter().map(|t| t.count).sum();
                let types_present = coverage.types.iter().filter(|t| t.present).count() as u32;
                FeatureRosterEntry {
                    feature: coverage.feature.clone(),
                    doc_count,
                    types_present,
                    next_step: coverage.next_step,
                }
            })
            .collect()
    }
}

/// The `yyyy-mm-dd` date prefix of a stem, used to pick the newest document.
/// Vault stems are `{date}-{feature}-{doc_type}`, so the date leads the stem and
/// a lexical stem compare already orders by date first; extracting the prefix
/// keeps the newest-by-date intent explicit. Returns the leading 10 chars when
/// they are shaped like an ISO date, else an empty prefix (an unconventional stem
/// sorts oldest, then ties break on the full stem).
fn date_prefix(stem: &str) -> &str {
    let bytes = stem.as_bytes();
    if bytes.len() >= 10
        && bytes[..10].iter().enumerate().all(|(i, b)| {
            if i == 4 || i == 7 {
                *b == b'-'
            } else {
                b.is_ascii_digit()
            }
        })
    {
        &stem[..10]
    } else {
        ""
    }
}

/// Is `candidate` newer than `current` (newest by date prefix; ties by stem
/// ordering — the max stem lexically among the newest date)?
fn is_newer(candidate: &str, current: &str) -> bool {
    (date_prefix(candidate), candidate) > (date_prefix(current), current)
}

/// The all-missing coverage for a feature with no observed documents — every
/// pipeline type absent, eligibility from the empty presence set, entry point
/// advised.
fn empty_coverage(feature: &str) -> FeatureCoverage {
    build_coverage(feature, &BTreeMap::new())
}

/// Per-type accumulator during the corpus scan: document count + newest stem.
#[derive(Default)]
struct TypeAcc {
    count: u32,
    newest_stem: Option<String>,
}

/// Build one feature's coverage from its per-type accumulators (or an empty map
/// for an unobserved feature). Presence, eligibility, the missing set, and the
/// next-step token are all derived here from the one presence signal.
fn build_coverage(feature: &str, per_type: &BTreeMap<&'static str, TypeAcc>) -> FeatureCoverage {
    let present_of = |dt: &str| per_type.get(dt).is_some_and(|acc| acc.count > 0);
    let entry_present = present_of("research") || present_of("reference");
    let adr_present = present_of("adr");
    let plan_present = present_of("plan");
    let has_upstream = entry_present || adr_present || plan_present;

    let types: Vec<TypeCoverage> = PIPELINE_DOC_TYPES
        .iter()
        .map(|&dt| {
            let acc = per_type.get(dt);
            let count = acc.map(|a| a.count).unwrap_or(0);
            let present = count > 0;
            let newest_stem = acc.and_then(|a| a.newest_stem.clone());
            let (eligible, note) = eligibility(dt, entry_present, adr_present, has_upstream);
            TypeCoverage {
                doc_type: dt,
                present,
                count,
                newest_stem,
                eligible,
                note,
            }
        })
        .collect();

    let missing: Vec<&'static str> = types
        .iter()
        .filter(|t| !t.present)
        .map(|t| t.doc_type)
        .collect();

    FeatureCoverage {
        feature: feature.to_string(),
        types,
        missing,
        next_step: next_step(entry_present, adr_present, plan_present),
    }
}

/// The per-type eligibility gate + reason token (ADR D3). research/reference are
/// always eligible; adr needs an entry point (research OR reference); plan needs
/// an adr; exec is never eligible from this surface (plan-derived, ADR D4); audit
/// is always eligible but carries a `no-upstream` advisory when it would open the
/// pipeline.
fn eligibility(
    doc_type: &str,
    entry_present: bool,
    adr_present: bool,
    has_upstream: bool,
) -> (bool, Option<&'static str>) {
    match doc_type {
        "research" | "reference" => (true, None),
        "adr" => {
            if entry_present {
                (true, None)
            } else {
                (false, Some("requires-research-or-reference"))
            }
        }
        "plan" => {
            if adr_present {
                (true, None)
            } else {
                (false, Some("requires-adr"))
            }
        }
        // exec records are plan-derived scaffolds; the free-form panel never
        // offers them (ADR D4) — a removed non-capability, surfaced with its
        // reason rather than silently dropped.
        "exec" => (false, Some("plan-derived")),
        // audit legally opens a pipeline, so it is always eligible; the advisory
        // fires only when nothing upstream exists.
        "audit" => {
            if has_upstream {
                (true, None)
            } else {
                (true, Some("no-upstream"))
            }
        }
        _ => (false, None),
    }
}

/// The advised next link to close along the research/reference → adr → plan chain
/// (ADR D2/D5). `research` names the primary entry point when neither entry
/// document exists; then `adr`, then `plan`. Absent once a plan exists (exec and
/// audit are plan-derived / closeout, not part of the linear next chain).
fn next_step(entry_present: bool, adr_present: bool, plan_present: bool) -> Option<&'static str> {
    if !entry_present {
        Some("research")
    } else if !adr_present {
        Some("adr")
    } else if !plan_present {
        Some("plan")
    } else {
        None
    }
}

/// Build the whole-corpus coverage map (ADR D2). One pass over the document nodes
/// groups each pipeline document under every feature tag it carries, tracking the
/// newest stem and count per type; the map is then capped at
/// `FEATURE_COVERAGE_ROSTER_CAP` (lexicographically-first features) and each
/// retained feature's coverage is derived. Computed over the full corpus — no
/// node ceiling, because coverage must not lie about what exists.
pub fn coverage_map(graph: &LinkageGraph) -> CoverageMap {
    // feature tag → (doc_type → accumulator). BTreeMap keeps the feature order
    // deterministic so the roster cap retains a stable, lexicographically-first
    // slice. The accumulator is inherently corpus-bounded (one entry per
    // feature/type pair actually present), the same unbounded-but-corpus-bounded
    // discipline `filter::vocabulary` uses for feature_tags; the SERVED map is
    // hard-capped below.
    let mut by_feature: BTreeMap<String, BTreeMap<&'static str, TypeAcc>> = BTreeMap::new();

    for node in graph.nodes() {
        let Some(doc_type) = node.doc_type.as_deref() else {
            continue;
        };
        let Some(&canonical) = PIPELINE_DOC_TYPES.iter().find(|&&t| t == doc_type) else {
            continue;
        };
        let stem = node.key.as_str();
        for feature in &node.feature_tags {
            let per_type = by_feature.entry(feature.clone()).or_default();
            let acc = per_type.entry(canonical).or_default();
            acc.count += 1;
            let replace = acc
                .newest_stem
                .as_deref()
                .map(|current| is_newer(stem, current))
                .unwrap_or(true);
            if replace {
                acc.newest_stem = Some(stem.to_string());
            }
        }
    }

    let features: BTreeMap<String, FeatureCoverage> = by_feature
        .into_iter()
        .take(FEATURE_COVERAGE_ROSTER_CAP)
        .map(|(feature, per_type)| {
            let coverage = build_coverage(&feature, &per_type);
            (feature, coverage)
        })
        .collect();

    CoverageMap { features }
}

/// Convenience: the coverage for a single feature over a graph (unmemoized). The
/// route reads through the cell's memoized `coverage_map`; this is the direct
/// path for tests and any caller that already holds the graph.
pub fn feature_coverage(graph: &LinkageGraph, feature: &str) -> FeatureCoverage {
    coverage_map(graph).coverage_for(feature)
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine_model::{CanonicalKey, NodeKind, node_id};

    fn doc(stem: &str, doc_type: &str, features: &[&str]) -> engine_model::Node {
        engine_model::Node {
            id: node_id(&CanonicalKey::Document { stem }),
            kind: NodeKind::Document,
            key: stem.into(),
            title: None,
            doc_type: Some(doc_type.into()),
            dates: None,
            feature_tags: features.iter().map(|s| s.to_string()).collect(),
            status: None,
            tier: None,
            size: None,
            facets: vec![],
        }
    }

    fn type_of<'a>(cov: &'a FeatureCoverage, dt: &str) -> &'a TypeCoverage {
        cov.types
            .iter()
            .find(|t| t.doc_type == dt)
            .expect("pipeline type present in coverage")
    }

    #[test]
    fn an_unobserved_feature_is_all_missing_and_advises_the_entry_point() {
        // The panel's "start a new feature" state: nothing exists, every type is
        // absent, and the advised next step is the primary entry point.
        let g = LinkageGraph::new();
        let cov = feature_coverage(&g, "brand-new");
        assert_eq!(cov.feature, "brand-new");
        assert!(cov.types.iter().all(|t| !t.present && t.count == 0));
        assert_eq!(cov.missing, PIPELINE_DOC_TYPES.to_vec());
        assert_eq!(cov.next_step, Some("research"));
        // With nothing upstream, adr/plan are ineligible with their reasons and
        // audit carries the no-upstream advisory; research/reference stay open.
        assert!(type_of(&cov, "research").eligible);
        assert!(type_of(&cov, "reference").eligible);
        assert!(!type_of(&cov, "adr").eligible);
        assert_eq!(
            type_of(&cov, "adr").note,
            Some("requires-research-or-reference")
        );
        assert!(!type_of(&cov, "plan").eligible);
        assert_eq!(type_of(&cov, "plan").note, Some("requires-adr"));
        assert!(type_of(&cov, "audit").eligible);
        assert_eq!(type_of(&cov, "audit").note, Some("no-upstream"));
    }

    #[test]
    fn research_only_unlocks_adr_and_advises_it() {
        // With research present, adr becomes eligible and is the advised next
        // step; plan stays gated behind adr; audit's advisory clears (upstream
        // now exists).
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("2026-07-14-x-research", "research", &["x"]));
        let cov = feature_coverage(&g, "x");
        assert!(type_of(&cov, "research").present);
        assert_eq!(cov.next_step, Some("adr"));
        assert!(type_of(&cov, "adr").eligible);
        assert_eq!(type_of(&cov, "adr").note, None);
        assert!(!type_of(&cov, "plan").eligible);
        assert!(type_of(&cov, "audit").eligible);
        assert_eq!(type_of(&cov, "audit").note, None, "upstream now exists");
        assert_eq!(
            cov.missing,
            vec!["reference", "adr", "plan", "exec", "audit"]
        );
    }

    #[test]
    fn reference_alone_also_satisfies_the_adr_precondition() {
        // research and reference are parallel entry points — either unlocks adr.
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("2026-07-14-x-reference", "reference", &["x"]));
        let cov = feature_coverage(&g, "x");
        assert!(type_of(&cov, "adr").eligible);
        assert_eq!(cov.next_step, Some("adr"));
    }

    #[test]
    fn research_and_adr_unlocks_plan() {
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("2026-07-14-x-research", "research", &["x"]));
        g.upsert_node(doc("2026-07-14-x-adr", "adr", &["x"]));
        let cov = feature_coverage(&g, "x");
        assert!(type_of(&cov, "plan").eligible);
        assert_eq!(type_of(&cov, "plan").note, None);
        assert_eq!(cov.next_step, Some("plan"));
    }

    #[test]
    fn a_full_chain_through_plan_has_no_next_step() {
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("2026-07-14-x-research", "research", &["x"]));
        g.upsert_node(doc("2026-07-14-x-adr", "adr", &["x"]));
        g.upsert_node(doc("2026-07-14-x-plan", "plan", &["x"]));
        let cov = feature_coverage(&g, "x");
        assert_eq!(cov.next_step, None, "chain satisfied through plan");
    }

    #[test]
    fn exec_is_never_eligible_from_this_surface() {
        // ADR D4: even with a plan present, exec is not offered — it is
        // plan-derived, surfaced with its reason.
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("2026-07-14-x-research", "research", &["x"]));
        g.upsert_node(doc("2026-07-14-x-adr", "adr", &["x"]));
        g.upsert_node(doc("2026-07-14-x-plan", "plan", &["x"]));
        let cov = feature_coverage(&g, "x");
        let exec = type_of(&cov, "exec");
        assert!(!exec.eligible);
        assert_eq!(exec.note, Some("plan-derived"));
    }

    #[test]
    fn newest_stem_is_the_latest_by_date_prefix_then_stem_order() {
        // Multiple same-type documents are legal; the newest stem (by date
        // prefix, then stem ordering) is the cross-link target.
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("2026-07-10-x-research", "research", &["x"]));
        g.upsert_node(doc("2026-07-14-x-research", "research", &["x"]));
        // A same-day second audit with a topic infix: the date ties, so the stem
        // ordering (lexical max) breaks it.
        g.upsert_node(doc("2026-07-14-x-alpha-audit", "audit", &["x"]));
        g.upsert_node(doc("2026-07-14-x-beta-audit", "audit", &["x"]));
        let cov = feature_coverage(&g, "x");
        let research = type_of(&cov, "research");
        assert_eq!(research.count, 2);
        assert_eq!(
            research.newest_stem.as_deref(),
            Some("2026-07-14-x-research"),
            "newest by date prefix"
        );
        let audit = type_of(&cov, "audit");
        assert_eq!(audit.count, 2);
        assert_eq!(
            audit.newest_stem.as_deref(),
            Some("2026-07-14-x-beta-audit"),
            "date ties break on stem ordering (lexical max)"
        );
    }

    #[test]
    fn a_document_counts_toward_every_feature_tag_it_carries() {
        // A document with two feature tags contributes to both groups' coverage.
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("2026-07-14-shared-research", "research", &["a", "b"]));
        assert!(type_of(&feature_coverage(&g, "a"), "research").present);
        assert!(type_of(&feature_coverage(&g, "b"), "research").present);
    }

    #[test]
    fn non_pipeline_and_typeless_nodes_are_ignored() {
        // A feature node (no doc_type) and a non-pipeline doc type (rule/commit)
        // never enter coverage.
        let mut g = LinkageGraph::new();
        g.upsert_node(engine_model::Node {
            id: node_id(&CanonicalKey::Feature { tag: "x" }),
            kind: NodeKind::Feature,
            key: "x".into(),
            title: None,
            doc_type: None,
            dates: None,
            feature_tags: vec!["x".into()],
            status: None,
            tier: None,
            size: None,
            facets: vec![],
        });
        g.upsert_node(doc("2026-07-14-x-rule", "rule", &["x"]));
        let cov = feature_coverage(&g, "x");
        assert!(
            cov.types.iter().all(|t| !t.present),
            "nothing pipeline-typed"
        );
    }

    #[test]
    fn the_roster_reports_counts_and_next_step_per_feature() {
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("2026-07-14-a-research", "research", &["a"]));
        g.upsert_node(doc("2026-07-14-a-adr", "adr", &["a"]));
        g.upsert_node(doc("2026-07-14-b-research", "research", &["b"]));
        let roster = coverage_map(&g).roster();
        let a = roster.iter().find(|e| e.feature == "a").unwrap();
        assert_eq!(a.doc_count, 2);
        assert_eq!(a.types_present, 2);
        assert_eq!(a.next_step, Some("plan"));
        let b = roster.iter().find(|e| e.feature == "b").unwrap();
        assert_eq!(b.doc_count, 1);
        assert_eq!(b.types_present, 1);
        assert_eq!(b.next_step, Some("adr"));
    }

    #[test]
    fn the_roster_is_capped_at_the_bound() {
        // More features than the cap: the served roster is bounded to
        // FEATURE_COVERAGE_ROSTER_CAP, retaining the lexicographically-first
        // features deterministically.
        let mut g = LinkageGraph::new();
        for i in 0..(FEATURE_COVERAGE_ROSTER_CAP + 50) {
            let tag = format!("f{i:04}");
            g.upsert_node(doc(
                &format!("2026-07-14-{tag}-research"),
                "research",
                &[tag.as_str()],
            ));
        }
        let map = coverage_map(&g);
        let roster = map.roster();
        assert_eq!(roster.len(), FEATURE_COVERAGE_ROSTER_CAP);
        // The lexicographically-first feature is retained; one past the cap is
        // not (it falls back to all-missing on a direct read).
        assert!(roster.iter().any(|e| e.feature == "f0000"));
        assert!(!roster.iter().any(|e| e.feature == "f0500"));
        // A feature beyond the cap reads as an unobserved (all-missing) coverage.
        let beyond = map.coverage_for("f0549");
        assert!(beyond.types.iter().all(|t| !t.present));
        assert_eq!(beyond.next_step, Some("research"));
    }
}
