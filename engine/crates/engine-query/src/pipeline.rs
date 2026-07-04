//! The bounded in-flight pipeline projection (dashboard-pipeline-wire W02,
//! ADR `dashboard-pipeline-wire`): a projection over the existing
//! `LinkageGraph` returning the active pipeline artifacts in the requested
//! scope — active plans (by lifecycle) and in-flight ADRs (by status) — each
//! with its progress summary, status/tier facet, pipeline phase, and stable
//! node id.
//!
//! This is a projection over the one model (`views-are-projections-of-one-model`),
//! not a new model: it reads node facets the ingest already derives. It is
//! bounded to active artifacts in scope (`graph-queries-are-bounded-by-default`)
//! — never an unbounded "all plans ever" — and surfaced through the shared
//! envelope helper by the route layer (`every-wire-response-carries-the-tiers-block`).

use engine_graph::{LinkageGraph, lifecycle_in_scope};
use engine_model::{Node, Progress, ScopeRef};
use serde::Serialize;

/// The pipeline phase an artifact sits in (dashboard-pipeline-wire W02.P04.S19),
/// derived from doc_type and status — the research -> adr -> plan -> execute ->
/// review arc the vaultspec pipeline runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PipelinePhase {
    Research,
    Adr,
    Plan,
    Execute,
    Review,
}

impl PipelinePhase {
    pub fn as_str(self) -> &'static str {
        match self {
            PipelinePhase::Research => "research",
            PipelinePhase::Adr => "adr",
            PipelinePhase::Plan => "plan",
            PipelinePhase::Execute => "execute",
            PipelinePhase::Review => "review",
        }
    }
}

/// The pipeline-phase LANE a vault document sits in (dashboard-timeline ADR,
/// W01.P01.S01), derived from its doc_type by a single deterministic mapping —
/// the framework's research -> adr -> plan -> exec -> review -> codify arc the
/// phase-lane timeline draws documents into.
///
/// Distinct from [`PipelinePhase`]: that enum is the in-flight Work-surface
/// phase derived from doc_type AND status/progress (an active plan with checked
/// work reads `execute`). This enum is the STATIC lane a document belongs to by
/// its kind alone, with one lane per pipeline phase including the audit-driven
/// `codify` step — what the timeline lanes are, not where a unit of work is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PipelineLanePhase {
    /// research + reference both ground the work — they share the first lane.
    Research,
    Adr,
    Plan,
    /// Execution records (`exec`).
    Exec,
    /// Audits (`audit`) — the review phase.
    Review,
    /// Rules (`rule`) — the discretionary codify phase.
    Codify,
}

impl PipelineLanePhase {
    pub fn as_str(self) -> &'static str {
        match self {
            PipelineLanePhase::Research => "research",
            PipelineLanePhase::Adr => "adr",
            PipelineLanePhase::Plan => "plan",
            PipelineLanePhase::Exec => "exec",
            PipelineLanePhase::Review => "review",
            PipelineLanePhase::Codify => "codify",
        }
    }
}

/// The single deterministic doc-type -> pipeline-lane mapping (dashboard-timeline
/// ADR, W01.P01.S01): research/reference -> research; adr -> adr; plan -> plan;
/// exec -> exec; audit -> review; rule -> codify.
///
/// Returns `None` for a doc-type with no pipeline lane: a `commit` is ambient
/// (off by default, toggle-on in the surface, per the ADR — it has no phase
/// lane), and an unknown or absent doc-type maps to no lane so the projection
/// never invents a phase for an artifact the pipeline does not own. The match is
/// over the `.vault/` subdirectory vocabulary the ingest already stamps on
/// `Node.doc_type`.
pub fn phase_for_doc_type(doc_type: &str) -> Option<PipelineLanePhase> {
    match doc_type {
        "research" | "reference" => Some(PipelineLanePhase::Research),
        "adr" => Some(PipelineLanePhase::Adr),
        "plan" => Some(PipelineLanePhase::Plan),
        "exec" => Some(PipelineLanePhase::Exec),
        "audit" => Some(PipelineLanePhase::Review),
        "rule" => Some(PipelineLanePhase::Codify),
        // `commit` is ambient (no phase lane); `index` and any unknown
        // doc-type own no pipeline lane.
        _ => None,
    }
}

/// One in-flight pipeline artifact (dashboard-pipeline-wire W02.P04.S17): a
/// plan or ADR currently being worked on, projected with everything the Work
/// surface renders. All fields are derived from node facets the ingest already
/// holds; nothing is computed beyond this projection.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PipelineArtifact {
    /// Stable node id (`doc:{stem}`) — identity-bearing, the GUI caches by it.
    pub node_id: String,
    /// Document stem (the node key).
    pub stem: String,
    /// Body H1 title, when the document carries one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Vault doc type (`plan`, `adr`, ...).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub doc_type: Option<String>,
    /// ADR H1 status (`proposed`/`accepted`/...); absent on plans.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    /// Plan tier (`L1`-`L4`); absent on ADRs.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tier: Option<String>,
    /// Checkbox progress summary for plans (done/total); absent on ADRs, whose
    /// in-flight-ness is the status, not a checkbox count.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<Progress>,
    /// The pipeline phase this artifact sits in.
    pub phase: PipelinePhase,
}

/// The in-flight pipeline projection (dashboard-pipeline-wire W02.P04.S18/S20):
/// the active pipeline artifacts in `scope`, sorted by stable id for
/// deterministic ordering. Bounded to ACTIVE artifacts — a complete plan and a
/// rejected/deprecated ADR are excluded, never an unbounded "all artifacts ever".
pub fn in_flight(graph: &LinkageGraph, scope: &ScopeRef) -> Vec<PipelineArtifact> {
    let mut artifacts: Vec<PipelineArtifact> = graph
        .nodes()
        .filter(|n| n.id.0.starts_with("doc:"))
        .filter_map(|n| artifact_if_active(n, scope))
        .collect();
    // Sort by stable id for deterministic ordering (S20): the GUI's list is
    // stable across re-indexes that do not change membership.
    artifacts.sort_by(|a, b| a.node_id.cmp(&b.node_id));
    artifacts
}

/// Project a single doc node into an in-flight artifact, or `None` if the node
/// is not an active pipeline artifact in this scope.
///
/// Active means:
/// - a **plan** whose lifecycle state in this scope is `active` (checkbox
///   progress not yet complete) — a complete plan is past, not in-flight; or
/// - an **ADR** whose status is `proposed` or `accepted` — a rejected or
///   deprecated ADR is settled, not in-flight (the honest read W01 enables: an
///   ADR has no steps, so its in-flight-ness is its real status, never a
///   checkbox guess).
///
/// Research and audit documents are not in-flight *work units* in v1 (they have
/// no active/settled axis of their own); the Work surface lists the pipeline's
/// unit of work — plans and ADRs — so they are excluded here.
fn artifact_if_active(node: &Node, scope: &ScopeRef) -> Option<PipelineArtifact> {
    let doc_type = node.doc_type.as_deref()?;
    let lifecycle = lifecycle_in_scope(node, scope);
    let progress = lifecycle.and_then(|l| l.progress);

    let (active, phase) = match doc_type {
        "plan" => {
            // Active plan: incomplete checkbox progress. Post graph-node-semantics
            // a plan's lifecycle.state carries its TIER (L1-L4), so in-flight-ness
            // is read from progress, not the state string — a plan with steps still
            // open (done < total) is active; a fully-checked plan is complete
            // (past); a plan with no checkboxes (no progress) is not a work unit.
            let active = progress.is_some_and(|p| p.done < p.total);
            (active, plan_phase(progress))
        }
        "adr" => {
            // In-flight ADR: proposed or accepted. Rejected/deprecated are
            // settled. An ADR with no status is not an in-flight work unit.
            let active = matches!(node.status.as_deref(), Some("proposed") | Some("accepted"));
            (active, PipelinePhase::Adr)
        }
        _ => (false, PipelinePhase::Research),
    };
    if !active {
        return None;
    }
    Some(PipelineArtifact {
        node_id: node.id.0.clone(),
        stem: node.key.clone(),
        title: node.title.clone(),
        doc_type: node.doc_type.clone(),
        status: node.status.clone(),
        tier: node.tier.clone(),
        progress,
        phase,
    })
}

/// Derive the phase of an active plan from its checkbox progress (S19): a plan
/// with no work checked yet is still in the `plan` phase; once any step is
/// checked it has entered `execute`. (A complete plan is excluded upstream, so
/// `review` is reached only by audit docs, not by a complete plan here.)
fn plan_phase(progress: Option<Progress>) -> PipelinePhase {
    match progress {
        Some(p) if p.done > 0 => PipelinePhase::Execute,
        _ => PipelinePhase::Plan,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine_model::{CanonicalKey, Facet, Lifecycle, NodeKind, Presence, node_id};

    fn scope() -> ScopeRef {
        ScopeRef::Ref {
            name: "main".into(),
        }
    }

    fn doc(
        stem: &str,
        doc_type: &str,
        status: Option<&str>,
        tier: Option<&str>,
        lifecycle: Option<Lifecycle>,
    ) -> Node {
        Node {
            id: node_id(&CanonicalKey::Document { stem }),
            kind: NodeKind::Document,
            key: stem.into(),
            title: Some(format!("{stem} title")),
            doc_type: Some(doc_type.into()),
            dates: None,
            feature_tags: vec!["x".into()],
            status: status.map(str::to_string),
            tier: tier.map(str::to_string),
            size: None,
            facets: vec![Facet {
                scope: scope(),
                presence: Presence::Exists,
                content_hash: None,
                lifecycle,
            }],
        }
    }

    fn active(done: u32, total: u32) -> Lifecycle {
        Lifecycle {
            state: "active".into(),
            progress: Some(Progress { done, total }),
        }
    }

    fn complete(total: u32) -> Lifecycle {
        Lifecycle {
            state: "complete".into(),
            progress: Some(Progress { done: total, total }),
        }
    }

    #[test]
    fn in_flight_includes_active_plan_and_proposed_adr_excludes_complete_and_rejected() {
        // W02.P04.S21: a complete plan and a rejected ADR are excluded while an
        // active plan and a proposed ADR are included — the projection is
        // bounded to in-flight artifacts, the honesty W01's status facet enables.
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("a-plan", "plan", None, Some("L3"), Some(active(2, 5))));
        g.upsert_node(doc(
            "z-plan-done",
            "plan",
            None,
            Some("L2"),
            Some(complete(4)),
        ));
        g.upsert_node(doc("b-adr", "adr", Some("proposed"), None, None));
        g.upsert_node(doc("c-adr-rejected", "adr", Some("rejected"), None, None));
        g.upsert_node(doc(
            "d-adr-deprecated",
            "adr",
            Some("deprecated"),
            None,
            None,
        ));
        g.upsert_node(doc("e-adr-accepted", "adr", Some("accepted"), None, None));
        // Research is not an in-flight work unit in v1.
        g.upsert_node(doc("f-research", "research", None, None, None));

        let result = in_flight(&g, &scope());
        let stems: Vec<&str> = result.iter().map(|a| a.stem.as_str()).collect();
        assert_eq!(
            stems,
            vec!["a-plan", "b-adr", "e-adr-accepted"],
            "active plan + proposed/accepted ADRs, sorted by stable id; \
             complete plan, rejected/deprecated ADRs, and research excluded"
        );

        // The active plan carries its tier, progress, and execute phase (work
        // has started: done > 0).
        let plan = result.iter().find(|a| a.stem == "a-plan").unwrap();
        assert_eq!(plan.tier.as_deref(), Some("L3"));
        assert_eq!(plan.progress, Some(Progress { done: 2, total: 5 }));
        assert_eq!(plan.phase, PipelinePhase::Execute);
        assert_eq!(plan.status, None, "a plan carries no ADR status");

        // The proposed ADR carries its status and the adr phase, no progress.
        let adr = result.iter().find(|a| a.stem == "b-adr").unwrap();
        assert_eq!(adr.status.as_deref(), Some("proposed"));
        assert_eq!(adr.phase, PipelinePhase::Adr);
        assert_eq!(adr.progress, None, "an ADR has no checkbox progress");
        assert_eq!(adr.node_id, "doc:b-adr");
    }

    #[test]
    fn an_active_plan_with_no_work_checked_is_in_the_plan_phase() {
        // S19: phase derivation from progress — a plan whose steps are all open
        // (done == 0) is still in the `plan` phase; once any step is checked it
        // is in `execute`.
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("p", "plan", None, Some("L1"), Some(active(0, 3))));
        let result = in_flight(&g, &scope());
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].phase, PipelinePhase::Plan);
    }

    #[test]
    fn doc_type_maps_to_its_single_pipeline_lane_for_each_phase() {
        // W01.P01.S07 (dashboard-timeline): the doc-type -> pipeline-lane
        // mapping is deterministic and total over the framework's phases —
        // research/reference -> research, adr -> adr, plan -> plan, exec ->
        // exec, audit -> review, rule -> codify. The mapping is what the
        // timeline lanes are.
        assert_eq!(
            phase_for_doc_type("research"),
            Some(PipelineLanePhase::Research)
        );
        assert_eq!(
            phase_for_doc_type("reference"),
            Some(PipelineLanePhase::Research),
            "reference shares the research lane (it grounds the work)"
        );
        assert_eq!(phase_for_doc_type("adr"), Some(PipelineLanePhase::Adr));
        assert_eq!(phase_for_doc_type("plan"), Some(PipelineLanePhase::Plan));
        assert_eq!(phase_for_doc_type("exec"), Some(PipelineLanePhase::Exec));
        assert_eq!(
            phase_for_doc_type("audit"),
            Some(PipelineLanePhase::Review),
            "audit is the review phase"
        );
        assert_eq!(
            phase_for_doc_type("rule"),
            Some(PipelineLanePhase::Codify),
            "rule is the codify phase"
        );

        // A commit is ambient (no phase lane); index and any unknown doc-type
        // own no lane — the projection never invents a phase.
        assert_eq!(phase_for_doc_type("commit"), None);
        assert_eq!(phase_for_doc_type("index"), None);
        assert_eq!(phase_for_doc_type("nonsense"), None);
        assert_eq!(phase_for_doc_type(""), None);

        // The wire form is the kebab-case lane token (serialized identically to
        // `as_str`).
        assert_eq!(PipelineLanePhase::Review.as_str(), "review");
        assert_eq!(PipelineLanePhase::Codify.as_str(), "codify");
        assert_eq!(
            serde_json::to_value(PipelineLanePhase::Codify).unwrap(),
            serde_json::Value::String("codify".into())
        );
    }

    #[test]
    fn projection_is_scoped_a_plan_active_only_on_another_scope_is_excluded() {
        // The projection reads the lifecycle facet for THIS scope; a plan whose
        // only facet is on a different scope contributes no lifecycle here, so
        // it is not in-flight in the requested scope (bounded to scope).
        let other = ScopeRef::Ref {
            name: "feature-x".into(),
        };
        let mut g = LinkageGraph::new();
        let mut n = doc("p", "plan", None, Some("L1"), Some(active(1, 2)));
        // Move the facet onto a different scope.
        n.facets[0].scope = other.clone();
        g.upsert_node(n);
        assert!(
            in_flight(&g, &scope()).is_empty(),
            "no lifecycle in the requested scope => not in-flight here"
        );
        assert_eq!(
            in_flight(&g, &other).len(),
            1,
            "in-flight in the scope where its lifecycle lives"
        );
    }
}
