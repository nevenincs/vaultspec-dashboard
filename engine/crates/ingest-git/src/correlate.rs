//! The four named temporal correlation rules (engine-spec §3, D3.4).
//!
//! Rules are additive and independently attributable: every produced edge
//! names, in its provenance, exactly the rule that fired. The core
//! commit-metadata enrichment (rule 1) upgrades confidence where adopted —
//! its absence degrades confidence, never breaks the tier (U2).

use engine_model::{
    CanonicalKey, Edge, Provenance, RelationKind, ScopeRef, Tier, Timestamp, edge_id, node_id,
};

use crate::log::CommitEvent;

/// Rule names and confidences, descending (mirrors `TEMPORAL_RULES`).
pub const RULE_EXPLICIT_ID: (&str, f32) = ("explicit-step-identifier", 0.9);
pub const RULE_DOC_AND_CODE: (&str, f32) = ("doc-and-code-in-one-commit", 0.7);
pub const RULE_PATH_OVERLAP: (&str, f32) = ("path-overlap-time-window", 0.4);
/// Renamed from `same-day-same-branch` (audit nit W02P07-403): the rule
/// carries no branch predicate — branch context rides the edge's scope.
pub const RULE_SAME_DAY_BRANCH: (&str, f32) = ("same-day-co-activity", 0.3);

/// Window for the path-overlap rule: ±3 days around the record's date.
pub const PATH_OVERLAP_WINDOW_MS: i64 = 3 * 24 * 60 * 60 * 1000;

/// What the correlator needs to know about one vault record.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecordInfo {
    /// Vault stem (document identity key).
    pub stem: String,
    /// The record's date, ms since epoch (frontmatter `date`).
    pub date_ms: Timestamp,
    /// Repo-relative paths the record's body mentions.
    pub mentioned_paths: Vec<String>,
    /// Canonical step/feature identifiers the record carries (e.g.
    /// `W01.P02.S03`, a feature tag) — matched against commit messages.
    pub identifiers: Vec<String>,
}

/// A commit plus its message (the log walk carries paths; rule 1 needs the
/// message too).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitContext {
    pub event: CommitEvent,
    pub message: String,
}

/// Run all four rules over one commit against the record set; returns one
/// temporal edge per (rule, record) match, each independently attributed.
pub fn correlate(
    commit: &CommitContext,
    records: &[RecordInfo],
    scope: &ScopeRef,
    observed_at: Timestamp,
) -> Vec<Edge> {
    let mut out = Vec::new();
    let commit_node = node_id(&CanonicalKey::Commit {
        sha: &commit.event.sha,
    });
    let touches_vault_doc = |stem: &str| {
        commit
            .event
            .touched_paths
            .iter()
            .any(|p| p.starts_with(".vault/") && p.ends_with(".md") && p.contains(stem))
    };
    let touches_code = commit
        .event
        .touched_paths
        .iter()
        .any(|p| !p.starts_with(".vault/"));

    for record in records {
        let doc_node = node_id(&CanonicalKey::Document { stem: &record.stem });
        let mut emit = |(rule, confidence): (&str, f32)| {
            let provenance = Provenance::CommitCorrelation {
                sha: commit.event.sha.clone(),
                rule: rule.to_string(),
            };
            let id = edge_id(
                &commit_node,
                &doc_node,
                &RelationKind::Touches,
                Tier::Temporal,
                &provenance,
            );
            out.push(Edge {
                id,
                src: commit_node.clone(),
                dst: doc_node.clone(),
                relation: RelationKind::Touches,
                tier: Tier::Temporal,
                confidence,
                state: None,
                provenance,
                scope: scope.clone(),
                observed_at,
            });
        };

        // Rule 1 (0.9): explicit identifier in the commit message — the
        // opt-in core enrichment, consumed opportunistically (U2).
        if record
            .identifiers
            .iter()
            .any(|id| !id.is_empty() && commit.message.contains(id.as_str()))
        {
            emit(RULE_EXPLICIT_ID);
            continue; // strongest rule wins per (commit, record)
        }

        // Rule 2 (0.7): one commit touches both this vault document and
        // code files.
        if touches_code && touches_vault_doc(&record.stem) {
            emit(RULE_DOC_AND_CODE);
            continue;
        }

        // Rule 3 (0.4): commit touches paths the record mentions, within
        // a time window around the record's date.
        let in_window = (commit.event.ts - record.date_ms).abs() <= PATH_OVERLAP_WINDOW_MS;
        if in_window
            && record
                .mentioned_paths
                .iter()
                .any(|p| commit.event.touched_paths.contains(p))
        {
            emit(RULE_PATH_OVERLAP);
            continue;
        }

        // Rule 4 (0.3): same-day co-activity on the same branch.
        const DAY_MS: i64 = 24 * 60 * 60 * 1000;
        if in_window && commit.event.ts / DAY_MS == record.date_ms / DAY_MS {
            emit(RULE_SAME_DAY_BRANCH);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn commit(sha: &str, ts: i64, message: &str, paths: &[&str]) -> CommitContext {
        CommitContext {
            event: CommitEvent {
                sha: sha.into(),
                // The correlation rules read only `touched_paths`; the subject
                // is immaterial here, so derive it from the test message.
                subject: message.lines().next().unwrap_or_default().to_string(),
                ts,
                kind: "commit",
                git_ref: "main".into(),
                touched_paths: paths.iter().map(|p| p.to_string()).collect(),
                // The correlation rules read only `touched_paths`; the
                // per-path kind is immaterial here, so mirror each path as a
                // Modified change to satisfy the additive field.
                changes: paths
                    .iter()
                    .map(|p| crate::log::PathChange {
                        path: p.to_string(),
                        kind: crate::log::ChangeKind::Modified,
                    })
                    .collect(),
            },
            message: message.into(),
        }
    }

    fn record(stem: &str, date_ms: i64, paths: &[&str], ids: &[&str]) -> RecordInfo {
        RecordInfo {
            stem: stem.into(),
            date_ms,
            mentioned_paths: paths.iter().map(|p| p.to_string()).collect(),
            identifiers: ids.iter().map(|i| i.to_string()).collect(),
        }
    }

    fn scope() -> ScopeRef {
        ScopeRef::Ref {
            name: "main".into(),
        }
    }

    const T: i64 = 1_700_000_000_000;

    #[test]
    fn each_rule_fires_with_its_own_confidence_and_attribution() {
        let records = [
            record("plan-with-id", T, &[], &["W01.P02.S03"]),
            record("doc-in-commit", T, &[], &[]),
            record("path-overlap-doc", T, &["src/lib.rs"], &[]),
            record("same-day-doc", T, &[], &[]),
        ];

        // Rule 1: message carries the identifier.
        let edges = correlate(
            &commit("c1", T, "feat: close W01.P02.S03", &["src/other.rs"]),
            &records[..1],
            &scope(),
            0,
        );
        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0].confidence, 0.9);
        assert!(matches!(&edges[0].provenance,
            Provenance::CommitCorrelation { rule, .. } if rule == "explicit-step-identifier"));

        // Rule 2: commit touches the doc AND code.
        let edges = correlate(
            &commit(
                "c2",
                T,
                "wip",
                &[".vault/plan/doc-in-commit.md", "src/lib.rs"],
            ),
            &records[1..2],
            &scope(),
            0,
        );
        assert_eq!(edges[0].confidence, 0.7);

        // Rule 3: path overlap inside the window.
        let edges = correlate(
            &commit("c3", T + 1000, "wip", &["src/lib.rs"]),
            &records[2..3],
            &scope(),
            0,
        );
        assert_eq!(edges[0].confidence, 0.4);

        // Rule 4: same day, no other signal.
        let edges = correlate(
            &commit("c4", T + 1000, "wip", &["unrelated.txt"]),
            &records[3..4],
            &scope(),
            0,
        );
        assert_eq!(edges[0].confidence, 0.3);
    }

    #[test]
    fn strongest_rule_wins_and_out_of_window_does_not_fire() {
        // Identifier present AND doc+code touched: only rule 1 fires.
        let r = [record("x-plan", T, &["src/lib.rs"], &["S01"])];
        let edges = correlate(
            &commit(
                "c5",
                T,
                "close S01",
                &[".vault/plan/x-plan.md", "src/lib.rs"],
            ),
            &r,
            &scope(),
            0,
        );
        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0].confidence, 0.9);

        // Ten days away: neither path-overlap nor same-day fires.
        let r = [record("y-doc", T, &["src/lib.rs"], &[])];
        let edges = correlate(
            &commit("c6", T + 10 * 24 * 3600 * 1000, "wip", &["src/lib.rs"]),
            &r,
            &scope(),
            0,
        );
        assert!(edges.is_empty());
    }

    #[test]
    fn enrichment_adoption_upgrades_confidence_without_churning_ids() {
        // Audit redline W02P07-401: when a repo adopts the U2 commit-id
        // enrichment, a (commit, record) pair previously correlated by
        // rule 2 upgrades to rule 1 — same edge id, higher confidence.
        let r = [record("up-doc", T, &[], &["S07"])];
        let before = correlate(
            &commit("c8", T, "wip", &[".vault/plan/up-doc.md", "src/lib.rs"]),
            &r,
            &scope(),
            0,
        );
        let after = correlate(
            &commit(
                "c8",
                T,
                "close S07",
                &[".vault/plan/up-doc.md", "src/lib.rs"],
            ),
            &r,
            &scope(),
            0,
        );
        assert_eq!(before[0].confidence, 0.7);
        assert_eq!(after[0].confidence, 0.9);
        assert_eq!(
            before[0].id, after[0].id,
            "identity is per (commit, record)"
        );
    }

    #[test]
    fn temporal_edges_pass_the_graph_band_validation() {
        let r = [record("z-doc", T, &[], &["S09"])];
        let edges = correlate(&commit("c7", T, "S09 done", &[]), &r, &scope(), 0);
        // 0.9 is inside the temporal band 0.3..=0.9.
        assert!((0.3..=0.9).contains(&edges[0].confidence));
    }
}
