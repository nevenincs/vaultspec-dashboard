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
