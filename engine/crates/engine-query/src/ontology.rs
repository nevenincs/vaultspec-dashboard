//! The node/edge ontology projection (graph-node-semantics ADR): additive,
//! read-and-infer enrichment of the contract §4 node and edge shapes.
//!
//! Every function here is a PURE projection over what the engine already reads
//! (doc_type, the node key, the lifecycle facet, the relation, and the edge
//! provenance). Nothing is written back into documents, no state is minted, and
//! the id derivation is untouched — the ontology is fully re-computable and
//! deletable (ADR `Constraints`: read-and-infer only).

use engine_model::{NodeKind, Provenance, RelationKind};

/// The authority register a document type answers in (ADR `Authority class`):
/// the stable handle the salience lenses bias toward. A fixed map from
/// `doc_type` to register — `design`, `roadmap`, `evidence`, `judgment`, `law`,
/// `substrate`, or `manifest`. An unknown or absent type degrades honestly to
/// `unknown` rather than being silently coerced (ADR: an unparseable type is a
/// data state, never a fiction).
pub fn authority_class(doc_type: Option<&str>) -> &'static str {
    match doc_type {
        Some("adr") => "design",
        // Research and reference are secondary design-authority substrate
        // (high value to an implementer mid-task, low to a status dashboard).
        Some("research") | Some("reference") => "substrate",
        Some("plan") => "roadmap",
        Some("exec") => "evidence",
        Some("audit") => "judgment",
        Some("rule") => "law",
        Some("index") => "manifest",
        // An unknown or absent doc_type: surfaced as a data state (a node
        // species the ontology does not yet name), never coerced into a
        // register it does not belong to.
        _ => "unknown",
    }
}

/// Whether a node is an AGGREGATE species — collapsible into a parent at
/// overview LOD (ADR `Aggregate-versus-individual weight hint`). Exec records
/// are the long tail (≈72% of the corpus) whose value is aggregate, not
/// individual; the representation LOD and salience fan-out both consume this
/// hint to keep the tail from swamping the field. ADRs/plans/audits/rules are
/// individually weighted, so the hint is `false` for them.
pub fn is_aggregate_species(doc_type: Option<&str>) -> bool {
    matches!(doc_type, Some("exec"))
}

/// The closed pipeline-derivation vocabulary (ADR `Typed derivation
/// relations`). These labels say *what the relationship is in the framework* —
/// orthogonal to the four inference tiers, which say *how the engine knows two
/// documents are related*. The label is carried ALONGSIDE the tier, never
/// instead of it.
pub const DERIVATION_LABELS: &[&str] = &[
    "grounds",
    "authorizes",
    "generated-by",
    "aggregates",
    "reviews",
    "promoted-from",
];

/// The derivation-relation label for one edge, inferred from the relation
/// kind, the endpoint document types, and the edge provenance (ADR
/// `Implementation`: assigned by reading the `related:` provenance and the
/// structural id encoding). Returns `None` when the edge carries no recognized
/// pipeline relationship — a bare structural mention, a feature-membership
/// edge, or a cross-reference whose shape the vocabulary does not name. The
/// label is ADDITIVE on the wire and NEVER part of the edge stable key
/// (`derivation_label` is not threaded into [`engine_model::edge_id`]), so
/// labeling an edge never re-keys it.
///
/// `src_type`/`dst_type` are the endpoint nodes' `doc_type`s (the strongest
/// signal); `is_exec_container_path` is true when the edge derives from an exec
/// record's `W##/P##/S##` id encoding (the most reliable edge in the corpus,
/// the `generated-by` plan→exec link).
pub fn derivation_label(
    relation: &RelationKind,
    src_type: Option<&str>,
    dst_type: Option<&str>,
    provenance: &Provenance,
    is_exec_container_path: bool,
) -> Option<&'static str> {
    // The `generated-by` plan→exec edge read directly from the record id's
    // container path is the most reliable derivation in the corpus — it wins
    // over any relation-kind heuristic.
    if is_exec_container_path {
        return Some("generated-by");
    }
    // A commit-correlation or rag-match edge is an inference tier, not a
    // pipeline-derivation relationship: it carries no derivation label.
    match provenance {
        Provenance::CommitCorrelation { .. } | Provenance::RagMatch { .. } => return None,
        _ => {}
    }
    // Otherwise read the pipeline edge from the endpoint document types, which
    // pin the framework relationship the `related:` link expresses.
    match (src_type, dst_type) {
        // ADR ← research/reference: the grounding consulted by the decision.
        (Some("adr"), Some("research")) | (Some("adr"), Some("reference")) => Some("grounds"),
        (Some("research"), Some("adr")) | (Some("reference"), Some("adr")) => Some("grounds"),
        // plan ↔ adr: the ADR authorizes the plan it binds.
        (Some("plan"), Some("adr")) | (Some("adr"), Some("plan")) => Some("authorizes"),
        // plan ↔ exec: the plan generates the execution record.
        (Some("plan"), Some("exec")) | (Some("exec"), Some("plan")) => Some("generated-by"),
        // exec → summary aggregation (both carry doc_type `exec`).
        (Some("exec"), Some("exec")) => Some("aggregates"),
        // audit ↔ {plan, exec}: the audit reviews the work.
        (Some("audit"), Some("plan"))
        | (Some("audit"), Some("exec"))
        | (Some("plan"), Some("audit"))
        | (Some("exec"), Some("audit")) => Some("reviews"),
        // rule ↔ audit: the rule was promoted from the audit that bore it.
        (Some("rule"), Some("audit")) | (Some("audit"), Some("rule")) => Some("promoted-from"),
        // Map the relation kind as a weak fallback for the lifecycle-axis
        // edges core authors (reviews/fulfills) when the doc types are
        // unavailable (e.g. a phantom endpoint).
        _ => match relation {
            RelationKind::Reviews => Some("reviews"),
            _ => None,
        },
    }
}

/// Detect the exec-record id container-path encoding (`…-W##-P##-S##`,
/// `…-P##-S##`, or `…-S##`) on a document stem — the structural signal that an
/// exec record is generated by its parent plan (ADR: the record's id encodes
/// the plan container path). Used by the edge projection to assign the
/// `generated-by` label from the most reliable signal in the corpus.
pub fn stem_is_exec_record(stem: &str) -> bool {
    // A phase summary ends `…-W##-P##-summary` / `…-P##-summary`: its container
    // leaf is the `P##` phase, not an `S##` step. Both summary and step records
    // are exec evidence generated by the parent plan.
    if let Some(prefix) = stem.strip_suffix("-summary") {
        let tail = prefix.rsplit('-').next().unwrap_or("");
        return is_container_segment(tail, 'P');
    }
    // A step record's container leaf is `S##`, with any `W##`/`P##` ancestors
    // already consumed by the rsplit; require an `S` followed by digits.
    let tail = stem.rsplit('-').next().unwrap_or("");
    is_container_segment(tail, 'S')
}

fn is_container_segment(segment: &str, prefix: char) -> bool {
    let Some(rest) = segment.strip_prefix(prefix) else {
        return false;
    };
    !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit())
}

/// Map a [`NodeKind`] back to the authority class for node species that carry
/// no `doc_type` (the synthesized `rule` species lives outside `.vault/` and so
/// has no subdirectory type). Falls through to [`authority_class`] semantics
/// for the document kinds.
pub fn authority_class_for_kind(kind: &NodeKind, doc_type: Option<&str>) -> &'static str {
    match kind {
        NodeKind::Rule => "law",
        NodeKind::Feature => "roadmap",
        _ => authority_class(doc_type),
    }
}

/// The closed treatment-family vocabulary the scene status stamp maps onto
/// (node-visual-richness ADR P01): a per-type lifecycle status collapses to one
/// of exactly these six classes, while the literal type-specific status string
/// rides in [`Status::value`]. The class is the rendering channel (which stamp
/// family); the value is the human-meaningful state. An unknown or absent status
/// has NO class — both fields are absent — never a fabricated treatment.
pub const STATUS_CLASSES: &[&str] = &[
    "affirmed",
    "provisional",
    "negated",
    "retired",
    "graded",
    "tiered",
];

/// A per-type lifecycle status: the literal type-specific status string
/// ([`value`](Status::value), e.g. `accepted`, `L2`, `high`) and the closed
/// treatment-family class ([`class`](Status::class), one of [`STATUS_CLASSES`]).
/// Both ride ADDITIVELY on the wire node; they perturb no existing field and are
/// NEVER part of the node id derivation (a re-inferred status never re-keys the
/// node). Absent status is the absence of this whole struct, never a filled
/// fiction (ADR `read-and-infer`; semantics ADR `Frontier caution`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Status {
    /// The literal type-specific status token (`accepted`, `L2`, `critical`,
    /// `superseded`, `in_flight`, …) — carries the level for graded/tiered.
    pub value: &'static str,
    /// The closed treatment-family class, one of [`STATUS_CLASSES`].
    pub class: &'static str,
}

/// Project the per-type lifecycle status (node-visual-richness ADR P01) from the
/// node's `doc_type`/[`NodeKind`] and its ALREADY-PARSED lifecycle `state`
/// string — a pure read-and-infer projection over what `engine-graph` already
/// reads (`doc_lifecycle`: the ADR H1 status line, the plan frontmatter tier,
/// the audit worst-severity, the rule active/superseded). NOTHING is re-parsed
/// or written back, and the id derivation is untouched.
///
/// Returns `None` — BOTH wire fields absent — for any type whose lifecycle does
/// not encode a per-type status (exec/research/reference/index), for an unknown
/// or absent `doc_type`, and for a document that predates the status convention
/// (its `lifecycle_state` is the generic `active`/`complete` checkbox collapse,
/// never a type-specific token). A status is never fabricated.
///
/// `lifecycle_state` is the node's `lifecycle.state` in the queried scope (the
/// same `lifecycle_in_scope(node, scope).state` the slice serves); `None` when
/// the node carries no lifecycle facet.
pub fn status(
    kind: &NodeKind,
    doc_type: Option<&str>,
    lifecycle_state: Option<&str>,
) -> Option<Status> {
    // The synthesized feature-convergence species carries no `doc_type`; its
    // lifecycle is the aggregate member progress (`active`/`complete`), which
    // reads as IN-FLIGHT. An archived feature surfaces as `archived` (the
    // salience lifecycle phase and the facet presence both name it).
    if matches!(kind, NodeKind::Feature) {
        return match lifecycle_state {
            Some("archived") => Some(Status {
                value: "archived",
                class: "retired",
            }),
            // A live convergence (any non-archived lifecycle, or none) is
            // in-flight: a feature with members in the corpus is being worked.
            _ => Some(Status {
                value: "in_flight",
                class: "affirmed",
            }),
        };
    }
    let state = lifecycle_state?;
    match doc_type {
        // ADR: the four-state decision machine from the H1 status line.
        Some("adr") => match state {
            "proposed" => Some(Status {
                value: "proposed",
                class: "provisional",
            }),
            "accepted" => Some(Status {
                value: "accepted",
                class: "affirmed",
            }),
            "rejected" => Some(Status {
                value: "rejected",
                class: "negated",
            }),
            "deprecated" => Some(Status {
                value: "deprecated",
                class: "retired",
            }),
            // An ADR predating the H1 status line falls back to the generic
            // checkbox collapse (`active`/`complete`): no per-type status.
            _ => None,
        },
        // Plan: the complexity tier (`L1`..`L4`), carrying its ordinal in the
        // value; the checkbox progress stays the SEPARATE `progress` channel.
        Some("plan") => match state {
            "L1" | "L2" | "L3" | "L4" => Some(Status {
                value: match state {
                    "L1" => "L1",
                    "L2" => "L2",
                    "L3" => "L3",
                    _ => "L4",
                },
                class: "tiered",
            }),
            // A plan with no frontmatter tier collapses to checkbox state: no
            // tiered status.
            _ => None,
        },
        // Audit: the worst finding severity, carrying the level in the value.
        Some("audit") => match state {
            "critical" => Some(Status {
                value: "critical",
                class: "graded",
            }),
            "high" => Some(Status {
                value: "high",
                class: "graded",
            }),
            "medium" => Some(Status {
                value: "medium",
                class: "graded",
            }),
            "low" => Some(Status {
                value: "low",
                class: "graded",
            }),
            _ => None,
        },
        // Rule: active vs superseded (the `## Status` successor signal).
        Some("rule") => match state {
            "active" => Some(Status {
                value: "active",
                class: "affirmed",
            }),
            "superseded" => Some(Status {
                value: "superseded",
                class: "retired",
            }),
            _ => None,
        },
        // exec/research/reference/index or any other type: no per-type status
        // (their lifecycle is the generic checkbox collapse). Honest absence.
        _ => None,
    }
}

/// The synthesized `Rule` node species (`.vaultspec/rules/`, outside `.vault/`)
/// carries no `doc_type` but IS a rule: its status reads from its active/
/// superseded lifecycle the same way a vault `rule` document does. Bridges the
/// `NodeKind::Rule` species onto the [`status`] rule branch.
pub fn status_for_node(
    kind: &NodeKind,
    doc_type: Option<&str>,
    lifecycle_state: Option<&str>,
) -> Option<Status> {
    let effective_type = match kind {
        // The native rule species answers the rule status machine even without
        // a `doc_type` subdirectory.
        NodeKind::Rule => Some("rule"),
        _ => doc_type,
    };
    status(kind, effective_type, lifecycle_state)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authority_class_covers_every_doc_type_and_unknown() {
        assert_eq!(authority_class(Some("adr")), "design");
        assert_eq!(authority_class(Some("plan")), "roadmap");
        assert_eq!(authority_class(Some("exec")), "evidence");
        assert_eq!(authority_class(Some("audit")), "judgment");
        assert_eq!(authority_class(Some("rule")), "law");
        assert_eq!(authority_class(Some("index")), "manifest");
        assert_eq!(authority_class(Some("research")), "substrate");
        assert_eq!(authority_class(Some("reference")), "substrate");
        // Honest degradation, never coercion.
        assert_eq!(authority_class(None), "unknown");
        assert_eq!(authority_class(Some("brainstorm")), "unknown");
    }

    #[test]
    fn only_exec_is_an_aggregate_species() {
        assert!(is_aggregate_species(Some("exec")));
        for t in ["adr", "plan", "audit", "rule", "research", "index"] {
            assert!(
                !is_aggregate_species(Some(t)),
                "{t} is individually weighted"
            );
        }
        assert!(!is_aggregate_species(None));
    }

    #[test]
    fn exec_record_stems_are_detected_from_the_container_path() {
        assert!(stem_is_exec_record("2026-06-14-feature-W01-P02-S03"));
        assert!(stem_is_exec_record("2026-06-14-feature-P02-S03"));
        assert!(stem_is_exec_record("2026-06-14-feature-S03"));
        assert!(stem_is_exec_record("2026-06-14-feature-W01-P02-summary"));
        // Not exec records: a plan/adr stem has no S## leaf.
        assert!(!stem_is_exec_record("2026-06-14-feature-plan"));
        assert!(!stem_is_exec_record("2026-06-14-feature-adr"));
        assert!(!stem_is_exec_record("2026-06-14-feature-S0x"));
    }

    fn body_prov() -> Provenance {
        Provenance::DocumentBody {
            blob_hash: "h".into(),
            span: (0, 1),
            target: "t".into(),
        }
    }

    #[test]
    fn derivation_labels_span_the_pipeline_vocabulary() {
        let p = body_prov();
        assert_eq!(
            derivation_label(
                &RelationKind::Resolves,
                Some("adr"),
                Some("research"),
                &p,
                false
            ),
            Some("grounds")
        );
        assert_eq!(
            derivation_label(
                &RelationKind::Implements,
                Some("plan"),
                Some("adr"),
                &p,
                false
            ),
            Some("authorizes")
        );
        assert_eq!(
            derivation_label(
                &RelationKind::Reviews,
                Some("audit"),
                Some("exec"),
                &p,
                false
            ),
            Some("reviews")
        );
        assert_eq!(
            derivation_label(
                &RelationKind::References,
                Some("rule"),
                Some("audit"),
                &p,
                false
            ),
            Some("promoted-from")
        );
        // The exec container-path signal wins, regardless of types.
        assert_eq!(
            derivation_label(&RelationKind::Mentions, None, None, &p, true),
            Some("generated-by")
        );
        // A temporal/semantic provenance carries no derivation label.
        let commit = Provenance::CommitCorrelation {
            sha: "abc".into(),
            rule: "r".into(),
        };
        assert_eq!(
            derivation_label(
                &RelationKind::Mentions,
                Some("exec"),
                Some("exec"),
                &commit,
                false
            ),
            None
        );
        // A bare structural mention with no pipeline shape: no label.
        assert_eq!(
            derivation_label(&RelationKind::Mentions, Some("plan"), None, &p, false),
            None
        );
    }

    #[test]
    fn derivation_label_is_not_part_of_the_edge_stable_key() {
        // The label is a query-time projection, never an id input: the edge_id
        // signature takes (src, dst, relation, tier, provenance) and NOTHING
        // about derivation. Re-deriving the same logical edge yields the same
        // id, so labeling it `authorizes` vs `generated-by` cannot re-key it.
        use engine_model::{NodeId, Tier, edge_id};
        let src = NodeId("doc:a-plan".into());
        let dst = NodeId("doc:b-adr".into());
        let p = body_prov();
        let id_a = edge_id(&src, &dst, &RelationKind::Mentions, Tier::Structural, &p);
        let id_b = edge_id(&src, &dst, &RelationKind::Mentions, Tier::Structural, &p);
        assert_eq!(id_a, id_b, "edge identity excludes the derivation label");
        // And the two derivation outcomes the same edge could carry never enter
        // that computation — the function above takes no EdgeId and returns no
        // id, it only reads relation/types/provenance.
        let labelled = derivation_label(
            &RelationKind::Mentions,
            Some("plan"),
            Some("adr"),
            &p,
            false,
        );
        assert_eq!(labelled, Some("authorizes"));
    }

    #[test]
    fn status_maps_every_adr_decision_state() {
        // node-visual-richness ADR P01: the four-state ADR machine.
        for (state, value, class) in [
            ("proposed", "proposed", "provisional"),
            ("accepted", "accepted", "affirmed"),
            ("rejected", "rejected", "negated"),
            ("deprecated", "deprecated", "retired"),
        ] {
            let s = status(&NodeKind::Document, Some("adr"), Some(state))
                .unwrap_or_else(|| panic!("adr {state} has a status"));
            assert_eq!(s.value, value, "adr {state} value");
            assert_eq!(s.class, class, "adr {state} class");
        }
    }

    #[test]
    fn status_maps_every_plan_tier_to_the_tiered_class() {
        for tier in ["L1", "L2", "L3", "L4"] {
            let s = status(&NodeKind::Document, Some("plan"), Some(tier))
                .unwrap_or_else(|| panic!("plan {tier} has a status"));
            assert_eq!(s.value, tier, "the tier ordinal rides in the value");
            assert_eq!(s.class, "tiered");
        }
    }

    #[test]
    fn status_maps_every_audit_severity_to_the_graded_class() {
        for sev in ["critical", "high", "medium", "low"] {
            let s = status(&NodeKind::Document, Some("audit"), Some(sev))
                .unwrap_or_else(|| panic!("audit {sev} has a status"));
            assert_eq!(s.value, sev, "the severity level rides in the value");
            assert_eq!(s.class, "graded");
        }
    }

    #[test]
    fn status_maps_rule_active_and_superseded() {
        let active = status(&NodeKind::Document, Some("rule"), Some("active")).unwrap();
        assert_eq!((active.value, active.class), ("active", "affirmed"));
        let superseded = status(&NodeKind::Document, Some("rule"), Some("superseded")).unwrap();
        assert_eq!(
            (superseded.value, superseded.class),
            ("superseded", "retired")
        );
        // The native Rule species (no doc_type) reads the same machine.
        let native = status_for_node(&NodeKind::Rule, None, Some("superseded")).unwrap();
        assert_eq!((native.value, native.class), ("superseded", "retired"));
        let native_active = status_for_node(&NodeKind::Rule, None, Some("active")).unwrap();
        assert_eq!(
            (native_active.value, native_active.class),
            ("active", "affirmed")
        );
    }

    #[test]
    fn status_maps_feature_in_flight_and_archived() {
        // The synthesized feature convergence: a live (active/complete) feature
        // is in-flight; an archived feature is retired.
        let in_flight = status(&NodeKind::Feature, None, Some("active")).unwrap();
        assert_eq!(
            (in_flight.value, in_flight.class),
            ("in_flight", "affirmed")
        );
        let complete = status(&NodeKind::Feature, None, Some("complete")).unwrap();
        assert_eq!(
            (complete.value, complete.class),
            ("in_flight", "affirmed"),
            "a complete-but-live convergence is still in-flight, not retired"
        );
        let no_lifecycle = status(&NodeKind::Feature, None, None).unwrap();
        assert_eq!(
            (no_lifecycle.value, no_lifecycle.class),
            ("in_flight", "affirmed")
        );
        let archived = status(&NodeKind::Feature, None, Some("archived")).unwrap();
        assert_eq!((archived.value, archived.class), ("archived", "retired"));
    }

    #[test]
    fn status_is_absent_for_types_without_a_per_type_state_machine() {
        // exec/research/reference/index carry only the generic checkbox
        // collapse (`active`/`complete`), never a per-type status: BOTH fields
        // absent, never fabricated.
        for t in ["exec", "research", "reference", "index"] {
            assert_eq!(
                status(&NodeKind::Document, Some(t), Some("active")),
                None,
                "{t} has no per-type status"
            );
            assert_eq!(
                status(&NodeKind::Document, Some(t), Some("complete")),
                None,
                "{t} has no per-type status"
            );
        }
    }

    #[test]
    fn status_is_absent_for_unknown_type_and_for_a_doc_predating_the_convention() {
        // An unknown or absent doc_type: no status.
        assert_eq!(status(&NodeKind::Document, None, Some("active")), None);
        assert_eq!(
            status(&NodeKind::Document, Some("brainstorm"), Some("active")),
            None
        );
        // A doc PREDATING the convention: an ADR with no H1 status line falls to
        // the generic checkbox collapse (`active`), which is NOT a decision
        // token, so the status is honestly absent (never a fabricated
        // `accepted`).
        assert_eq!(
            status(&NodeKind::Document, Some("adr"), Some("active")),
            None
        );
        assert_eq!(
            status(&NodeKind::Document, Some("adr"), Some("complete")),
            None
        );
        // A plan with no frontmatter tier: the lifecycle is the checkbox state,
        // not an `L#` tier, so no tiered status.
        assert_eq!(
            status(&NodeKind::Document, Some("plan"), Some("active")),
            None
        );
        // A node with no lifecycle at all: nothing to read for a doc node.
        assert_eq!(status(&NodeKind::Document, Some("adr"), None), None);
    }

    #[test]
    fn every_status_class_is_in_the_closed_vocabulary() {
        // Drive every doc-type branch and the feature species and assert the
        // class is one of the closed six — the scene's treatment-family enum.
        let cases = [
            status(&NodeKind::Document, Some("adr"), Some("proposed")),
            status(&NodeKind::Document, Some("adr"), Some("accepted")),
            status(&NodeKind::Document, Some("adr"), Some("rejected")),
            status(&NodeKind::Document, Some("adr"), Some("deprecated")),
            status(&NodeKind::Document, Some("plan"), Some("L3")),
            status(&NodeKind::Document, Some("audit"), Some("high")),
            status(&NodeKind::Document, Some("rule"), Some("active")),
            status(&NodeKind::Document, Some("rule"), Some("superseded")),
            status(&NodeKind::Feature, None, Some("active")),
            status(&NodeKind::Feature, None, Some("archived")),
        ];
        for s in cases.into_iter().flatten() {
            assert!(
                STATUS_CLASSES.contains(&s.class),
                "{} not in the closed status-class vocab",
                s.class
            );
        }
    }

    #[test]
    fn status_is_not_part_of_the_node_stable_key() {
        // The status is a query-time projection: the node id derives from the
        // canonical key alone (NodeKind + key), never from any status, so a
        // re-inferred status (accepted -> deprecated on an ADR re-read) cannot
        // re-key the node.
        use engine_model::{CanonicalKey, node_id};
        let id_a = node_id(&CanonicalKey::Document { stem: "x-adr" });
        let id_b = node_id(&CanonicalKey::Document { stem: "x-adr" });
        assert_eq!(id_a, id_b, "node identity excludes the status projection");
        // And the two status outcomes the same ADR could carry never enter that
        // computation — the function takes no NodeId and returns no id.
        let accepted = status(&NodeKind::Document, Some("adr"), Some("accepted"));
        let deprecated = status(&NodeKind::Document, Some("adr"), Some("deprecated"));
        assert_ne!(
            accepted, deprecated,
            "the two states are distinct projections"
        );
    }

    #[test]
    fn every_label_is_in_the_closed_vocabulary() {
        let p = body_prov();
        for label in [
            derivation_label(
                &RelationKind::Resolves,
                Some("adr"),
                Some("research"),
                &p,
                false,
            ),
            derivation_label(
                &RelationKind::Implements,
                Some("plan"),
                Some("adr"),
                &p,
                false,
            ),
            derivation_label(&RelationKind::Mentions, None, None, &p, true),
            derivation_label(
                &RelationKind::Reviews,
                Some("audit"),
                Some("plan"),
                &p,
                false,
            ),
            derivation_label(
                &RelationKind::References,
                Some("rule"),
                Some("audit"),
                &p,
                false,
            ),
            derivation_label(
                &RelationKind::Fulfills,
                Some("exec"),
                Some("exec"),
                &p,
                false,
            ),
        ]
        .into_iter()
        .flatten()
        {
            assert!(
                DERIVATION_LABELS.contains(&label),
                "{label} not in closed vocab"
            );
        }
    }
}
