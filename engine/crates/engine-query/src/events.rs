//! Event bucketing (contract §5): `bucket=auto|raw|<interval>`. The engine
//! owns downsampling — the timeline must never render ten thousand
//! individual marks; zoomed out it gets per-bucket counts by kind.

use std::collections::BTreeMap;

use engine_store::EventRow;
use serde::Serialize;

/// Bucketing mode requested by the client.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BucketMode {
    /// Raw events (fine zoom; client renders individual marks).
    Raw,
    /// Engine picks an interval targeting [`AUTO_TARGET_BUCKETS`].
    Auto,
    /// Fixed interval in milliseconds (`1h` = 3_600_000, `1d` = 86_400_000).
    Fixed(i64),
}

/// Auto mode aims for at most this many buckets across the range.
pub const AUTO_TARGET_BUCKETS: i64 = 100;

/// One bucket: per-kind counts over [from, to).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Bucket {
    pub from: i64,
    pub to: i64,
    pub counts_by_kind: BTreeMap<String, u64>,
}

/// The bucketed-or-raw response payload.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case", tag = "shape")]
pub enum EventsPayload {
    Raw { events: Vec<RawEvent> },
    Bucketed { buckets: Vec<Bucket> },
}

/// Contract §5 raw event fields: stable id, ts, kind, ref, node_ids.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RawEvent {
    /// Stable event id: the store's monotonic seq, prefixed.
    pub id: String,
    pub ts: i64,
    pub kind: String,
    #[serde(rename = "ref")]
    pub git_ref: String,
    pub node_ids: Vec<String>,
    /// Code-artifact ids dropped by the wire bound (addendum S05);
    /// omitted when nothing was truncated.
    #[serde(skip_serializing_if = "is_zero")]
    pub truncated_node_ids: u64,
}

fn is_zero(n: &u64) -> bool {
    *n == 0
}

impl From<&EventRow> for RawEvent {
    fn from(row: &EventRow) -> Self {
        RawEvent {
            id: format!("ev:{}", row.seq),
            ts: row.ts,
            kind: row.kind.clone(),
            git_ref: row.git_ref.clone(),
            node_ids: row.node_ids.clone(),
            truncated_node_ids: row.truncated_node_ids,
        }
    }
}

/// Bucket (or pass through) events for [from_ts, to_ts].
pub fn bucket_events(
    rows: &[EventRow],
    from_ts: i64,
    to_ts: i64,
    mode: BucketMode,
) -> EventsPayload {
    let interval = match mode {
        BucketMode::Raw => {
            return EventsPayload::Raw {
                events: rows.iter().map(RawEvent::from).collect(),
            };
        }
        BucketMode::Auto => {
            // Saturating arithmetic (robustness M3): `from_ts`/`to_ts` arrive
            // unsanitized from the wire, so a hostile `to=i64::MAX,
            // from=i64::MIN` would overflow the subtraction. Release builds run
            // with overflow-checks off — the wrap is SILENT and corrupts every
            // bucket. Saturate instead so the span is a clamped, sane value.
            let span = to_ts.saturating_sub(from_ts).max(1);
            (span / AUTO_TARGET_BUCKETS).max(1)
        }
        BucketMode::Fixed(ms) => ms.max(1),
    };

    let mut buckets: BTreeMap<i64, BTreeMap<String, u64>> = BTreeMap::new();
    for row in rows {
        if row.ts < from_ts || row.ts > to_ts {
            continue;
        }
        // Saturating arithmetic (robustness M3): every step — the offset
        // subtraction, the bucket multiply, and the start addition — can
        // overflow i64 on unsanitized bounds; saturate so a wrap can never
        // silently mislabel a bucket in a release build.
        let offset = row.ts.saturating_sub(from_ts);
        let bucket_start = (offset / interval).saturating_mul(interval);
        let start = from_ts.saturating_add(bucket_start);
        *buckets
            .entry(start)
            .or_default()
            .entry(row.kind.clone())
            .or_default() += 1;
    }
    EventsPayload::Bucketed {
        buckets: buckets
            .into_iter()
            .map(|(from, counts_by_kind)| Bucket {
                from,
                to: from.saturating_add(interval),
                counts_by_kind,
            })
            .collect(),
    }
}

/// Parse the wire bucket parameter: `raw`, `auto`, `1h`, `1d`, `15m`, `30s`.
pub fn parse_bucket_param(param: &str) -> Option<BucketMode> {
    match param {
        "raw" => Some(BucketMode::Raw),
        "auto" => Some(BucketMode::Auto),
        other => {
            let (digits, unit) = other.split_at(other.len().checked_sub(1)?);
            let n: i64 = digits.parse().ok()?;
            let ms = match unit {
                "s" => n.checked_mul(1_000)?,
                "m" => n.checked_mul(60_000)?,
                "h" => n.checked_mul(3_600_000)?,
                "d" => n.checked_mul(86_400_000)?,
                _ => return None,
            };
            (ms > 0).then_some(BucketMode::Fixed(ms))
        }
    }
}

/// Wire bound on code-artifact ids per commit event (contract §5,
/// addendum S05): doc ids always survive — they are the timeline's join
/// key — while code ids beyond the cap truncate with a count.
pub const CODE_NODE_IDS_CAP: usize = 20;

/// Event kind for a commit that modified one or more `.vault/` documents
/// (contract §5 second event kind). The commit pulse addresses the whole
/// touched set; the doc-modified pulse addresses ONLY the document nodes, so
/// the timeline can light "these docs changed at T" distinctly from "this
/// commit landed at T".
pub const DOC_MODIFIED_KIND: &str = "doc-modified";

/// Event kind for a commit that CREATED a `.vault/` document — the path was
/// Added at this commit (contract §5 third event kind, the create half of
/// vault-lifecycle). Distinct from `doc-modified`: the timeline can mark a
/// document's birth, not just a change.
pub const VAULT_CREATED_KIND: &str = "vault-created";

/// Event kind for a commit that ARCHIVED a `.vault/` document — the path was
/// deleted, or renamed into `.vault/archive/` (contract §5 third event kind,
/// the archive half of vault-lifecycle). Distinct from `doc-modified`: the
/// timeline can mark a document's retirement.
pub const VAULT_ARCHIVED_KIND: &str = "vault-archived";

/// True for a repo-relative path that is a `.vault/` markdown document.
fn is_vault_doc(path: &str) -> bool {
    path.starts_with(".vault/") && path.ends_with(".md")
}

/// The doc node id a `.vault/` markdown path correlates to (by stem),
/// matching `engine_store::events::node_ids_for_paths`.
fn vault_doc_node_id(path: &str) -> Option<String> {
    use engine_model::{CanonicalKey, node_id};
    path.strip_prefix(".vault/")
        .and_then(|rest| rest.split('/').next_back())
        .and_then(|file| file.strip_suffix(".md"))
        .map(|stem| node_id(&CanonicalKey::Document { stem }).0)
}

/// Source commit events from a workspace ref into contract-shaped rows
/// (audit G7: event sourcing lives in the query core; both front doors
/// delegate here — D6.1, no capability in only one door).
///
/// Emits all THREE contract §5 event kinds from one commit walk:
/// a `commit` row per commit (the full touched set); a `doc-modified` row per
/// commit that touched at least one `.vault/` document (the document nodes
/// only); and the vault-lifecycle kinds — `vault-created` when a `.vault/`
/// document was Added, `vault-archived` when one was deleted or renamed into
/// `.vault/archive/`. The lifecycle kinds read the per-path change KIND now
/// carried on `CommitEvent::changes` (added / deleted / renamed), which the
/// flat `touched_paths` list cannot express. A created or archived document is
/// ALSO reported on `doc-modified` (its content changed at this commit); the
/// lifecycle row is the distinct, additive birth/retirement mark.
///
/// `known` bounds the correlation (S05): when given, code-artifact ids
/// keep only graph-known nodes; the survivors cap at
/// [`CODE_NODE_IDS_CAP`] with the dropped count reported on the row. Doc
/// and commit ids are never truncated.
pub fn commit_rows(
    workspace: &ingest_git::workspace::Workspace,
    reference: &str,
    limit: usize,
    known: Option<&engine_graph::LinkageGraph>,
) -> Result<Vec<EventRow>, String> {
    let commits = ingest_git::log::walk(workspace, reference, limit).map_err(|e| e.to_string())?;
    // Build the rows with a PLACEHOLDER seq, then assign seq AFTER the
    // chronological sort. `walk` returns newest-first, so assigning seq from
    // walk order and then sorting by ts made id and ts ANTI-correlated — id 1
    // was the newest event, last in the ts-ascending array (sweep LOW,
    // 2026-06-13). The contract calls the id a monotonic seq and the stream
    // splices by `since=<id>`, so id order MUST track time order. Tiebreak
    // same-ts events by (sha, kind) for a deterministic, stable id assignment
    // when a commit yields both a `commit` and a `doc-modified` row at the
    // same ts.
    let mut rows: Vec<(String, EventRow)> = Vec::with_capacity(commits.len());
    for c in &commits {
        let correlated =
            engine_store::events::node_ids_for_paths(c.touched_paths.iter().map(String::as_str));
        let (docs, code): (Vec<String>, Vec<String>) = correlated
            .into_iter()
            .partition(|id| !id.starts_with("code:"));
        let mut code: Vec<String> = match known {
            Some(graph) => code
                .into_iter()
                .filter(|id| graph.node(&engine_model::NodeId(id.clone())).is_some())
                .collect(),
            None => code,
        };
        let truncated = code.len().saturating_sub(CODE_NODE_IDS_CAP) as u64;
        code.truncate(CODE_NODE_IDS_CAP);

        // doc-modified: a commit that touched any `.vault/` document is a
        // document-modification event addressing just those doc nodes (the
        // join is doc/feature-centric; doc ids are never truncated). Emitted
        // BEFORE the commit row's `docs` vec is moved.
        if !docs.is_empty() {
            rows.push((
                c.sha.clone(),
                EventRow {
                    seq: 0,
                    ts: c.ts,
                    kind: DOC_MODIFIED_KIND.to_string(),
                    git_ref: c.git_ref.clone(),
                    node_ids: docs.clone(),
                    truncated_node_ids: 0,
                },
            ));
        }

        // vault-lifecycle: the per-path change kind (now carried on
        // `c.changes`) distinguishes a document's BIRTH (Added) and its
        // RETIREMENT (deleted, or renamed into `.vault/archive/`) from a plain
        // modification. Each lifecycle row addresses only the affected doc
        // node — the distinct, additive birth/retirement mark.
        use ingest_git::log::ChangeKind;
        let mut created: Vec<String> = Vec::new();
        let mut archived: Vec<String> = Vec::new();
        for change in &c.changes {
            match &change.kind {
                ChangeKind::Added if is_vault_doc(&change.path) => {
                    if let Some(id) = vault_doc_node_id(&change.path) {
                        created.push(id);
                    }
                }
                ChangeKind::Deleted if is_vault_doc(&change.path) => {
                    if let Some(id) = vault_doc_node_id(&change.path) {
                        archived.push(id);
                    }
                }
                // A rename into `.vault/archive/` is an archival keyed on the
                // doc's SOURCE stem (its identity before the move). A rename
                // elsewhere is neither a create nor an archive here.
                ChangeKind::Renamed { from }
                    if change.path.starts_with(".vault/archive/") && is_vault_doc(from) =>
                {
                    if let Some(id) = vault_doc_node_id(from) {
                        archived.push(id);
                    }
                }
                _ => {}
            }
        }
        if !created.is_empty() {
            rows.push((
                c.sha.clone(),
                EventRow {
                    seq: 0,
                    ts: c.ts,
                    kind: VAULT_CREATED_KIND.to_string(),
                    git_ref: c.git_ref.clone(),
                    node_ids: created,
                    truncated_node_ids: 0,
                },
            ));
        }
        if !archived.is_empty() {
            rows.push((
                c.sha.clone(),
                EventRow {
                    seq: 0,
                    ts: c.ts,
                    kind: VAULT_ARCHIVED_KIND.to_string(),
                    git_ref: c.git_ref.clone(),
                    node_ids: archived,
                    truncated_node_ids: 0,
                },
            ));
        }

        let mut node_ids = Vec::with_capacity(1 + docs.len() + code.len());
        node_ids.push(format!("commit:{}", c.sha));
        node_ids.extend(docs);
        node_ids.extend(code);
        rows.push((
            c.sha.clone(),
            EventRow {
                seq: 0,
                ts: c.ts,
                kind: c.kind.to_string(),
                git_ref: c.git_ref.clone(),
                node_ids,
                truncated_node_ids: truncated,
            },
        ));
    }
    rows.sort_by(|(a_sha, a), (b_sha, b)| {
        a.ts
            .cmp(&b.ts)
            .then_with(|| a_sha.cmp(b_sha))
            .then_with(|| a.kind.cmp(&b.kind))
    });
    Ok(rows
        .into_iter()
        .enumerate()
        .map(|(i, (_, mut row))| {
            row.seq = i as i64 + 1;
            row
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(seq: i64, ts: i64, kind: &str) -> EventRow {
        EventRow {
            seq,
            ts,
            kind: kind.into(),
            git_ref: "main".into(),
            node_ids: vec![format!("doc:{seq}")],
            truncated_node_ids: 0,
        }
    }

    fn git(dir: &std::path::Path, args: &[&str]) {
        let output = std::process::Command::new("git")
            .current_dir(dir)
            .args(args)
            .env("GIT_AUTHOR_NAME", "f")
            .env("GIT_AUTHOR_EMAIL", "f@t")
            .env("GIT_COMMITTER_NAME", "f")
            .env("GIT_COMMITTER_EMAIL", "f@t")
            .output()
            .expect("git runs");
        assert!(
            output.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn commit_rows_surface_doc_modification_events_alongside_commits() {
        // Contract §5 second event kind: a commit that touches a `.vault/`
        // document yields a `doc-modified` event addressing ONLY the document
        // nodes, distinct from the `commit` event addressing the full touched
        // set. A commit touching only code yields no doc-modified event.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        git(root, &["init", "-b", "main", "."]);
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
        std::fs::create_dir_all(root.join("src")).unwrap();

        // Commit 1: a vault doc + a code file -> commit + doc-modified.
        std::fs::write(
            root.join(".vault/plan/2026-06-13-x-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#x'\n---\n\nbody\n",
        )
        .unwrap();
        std::fs::write(root.join("src/lib.rs"), "// v1\n").unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-m", "doc and code"]);

        // Commit 2: code only -> commit, NO doc-modified.
        std::fs::write(root.join("src/lib.rs"), "// v2\n").unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-m", "code only"]);

        let ws = ingest_git::workspace::Workspace::discover(root).unwrap();
        let rows = commit_rows(&ws, "HEAD", 100, None).unwrap();

        let commit_rows_ct = rows.iter().filter(|r| r.kind == "commit").count();
        let doc_rows: Vec<&EventRow> = rows
            .iter()
            .filter(|r| r.kind == DOC_MODIFIED_KIND)
            .collect();
        assert_eq!(commit_rows_ct, 2, "one commit event per commit");
        assert_eq!(
            doc_rows.len(),
            1,
            "only the vault-touching commit yields a doc-modified event"
        );

        // The doc-modified event addresses exactly the document node, and no
        // commit/code id (the doc-centric join key).
        let doc = doc_rows[0];
        assert_eq!(doc.node_ids, vec!["doc:2026-06-13-x-plan"]);
        assert!(
            doc.node_ids
                .iter()
                .all(|id| !id.starts_with("commit:") && !id.starts_with("code:")),
            "doc-modified addresses only doc nodes: {:?}",
            doc.node_ids
        );

        // The commit event for the same commit carries the commit id AND the
        // doc id AND the code id - the full touched set.
        let paired_commit = rows
            .iter()
            .find(|r| {
                r.kind == "commit" && r.node_ids.contains(&"doc:2026-06-13-x-plan".to_string())
            })
            .expect("the vault-touching commit event");
        assert!(
            paired_commit
                .node_ids
                .iter()
                .any(|id| id.starts_with("commit:"))
        );
        assert!(
            paired_commit
                .node_ids
                .contains(&"code:src/lib.rs".to_string())
        );

        // Seqs stay monotonic and time-ordered across the interleaved kinds.
        assert!(rows.windows(2).all(|w| w[1].seq > w[0].seq));
        assert!(rows.windows(2).all(|w| w[1].ts >= w[0].ts));
    }

    #[test]
    fn commit_rows_surface_vault_lifecycle_events_distinct_from_doc_modified() {
        // Contract §5 third event kind: a commit that CREATES a `.vault/` doc
        // yields a `vault-created` event; one that ARCHIVES it (a rename into
        // `.vault/archive/`, or a delete) yields `vault-archived`. Both address
        // only the affected doc node and are distinct from `doc-modified`.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        git(root, &["init", "-b", "main", "."]);
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();

        // Commit 1: create a vault doc -> vault-created (+ doc-modified).
        let doc = ".vault/plan/2026-06-13-life-plan.md";
        std::fs::write(
            root.join(doc),
            "---\ntags:\n  - '#plan'\n  - '#life'\n---\n\nbody\n",
        )
        .unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-m", "create doc"]);

        // Commit 2: rename it into `.vault/archive/` -> vault-archived.
        std::fs::create_dir_all(root.join(".vault/archive/plan")).unwrap();
        git(
            root,
            &[
                "mv",
                doc,
                ".vault/archive/plan/2026-06-13-life-plan.md",
            ],
        );
        git(root, &["commit", "-m", "archive doc"]);

        let ws = ingest_git::workspace::Workspace::discover(root).unwrap();
        let rows = commit_rows(&ws, "HEAD", 100, None).unwrap();

        let doc_node = "doc:2026-06-13-life-plan";

        let created: Vec<&EventRow> =
            rows.iter().filter(|r| r.kind == VAULT_CREATED_KIND).collect();
        assert_eq!(created.len(), 1, "exactly one vault-created event");
        assert_eq!(
            created[0].node_ids,
            vec![doc_node],
            "vault-created addresses only the created doc node"
        );

        let archived: Vec<&EventRow> = rows
            .iter()
            .filter(|r| r.kind == VAULT_ARCHIVED_KIND)
            .collect();
        assert_eq!(archived.len(), 1, "exactly one vault-archived event");
        assert_eq!(
            archived[0].node_ids,
            vec![doc_node],
            "vault-archived keyed on the doc's source stem"
        );

        // The lifecycle kinds are DISTINCT from doc-modified (which still
        // reports the same docs' content change).
        assert!(
            created[0].kind != DOC_MODIFIED_KIND && archived[0].kind != DOC_MODIFIED_KIND
        );

        // Seqs stay monotonic and time-ordered across all interleaved kinds.
        assert!(rows.windows(2).all(|w| w[1].seq > w[0].seq));
        assert!(rows.windows(2).all(|w| w[1].ts >= w[0].ts));
    }

    #[test]
    fn deleting_a_vault_doc_is_an_archival() {
        // The archive half also covers an outright deletion of a `.vault/`
        // doc (not only a rename into `.vault/archive/`).
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        git(root, &["init", "-b", "main", "."]);
        std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
        let doc = ".vault/adr/2026-06-13-del-adr.md";
        std::fs::write(
            root.join(doc),
            "---\ntags:\n  - '#adr'\n  - '#del'\n---\n\nbody\n",
        )
        .unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-m", "create"]);

        std::fs::remove_file(root.join(doc)).unwrap();
        git(root, &["add", "-A"]);
        git(root, &["commit", "-m", "delete"]);

        let ws = ingest_git::workspace::Workspace::discover(root).unwrap();
        let rows = commit_rows(&ws, "HEAD", 100, None).unwrap();
        let archived: Vec<&EventRow> = rows
            .iter()
            .filter(|r| r.kind == VAULT_ARCHIVED_KIND)
            .collect();
        assert_eq!(archived.len(), 1, "a delete of a vault doc is an archival");
        assert_eq!(archived[0].node_ids, vec!["doc:2026-06-13-del-adr"]);
    }

    #[test]
    fn raw_mode_passes_contract_shaped_events_through() {
        let rows = [row(1, 1000, "commit"), row(2, 2000, "doc-modified")];
        let EventsPayload::Raw { events } = bucket_events(&rows, 0, 3000, BucketMode::Raw) else {
            panic!("raw expected");
        };
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].id, "ev:1");
        assert_eq!(events[0].node_ids, vec!["doc:1"]);
    }

    #[test]
    fn fixed_interval_buckets_count_by_kind() {
        let rows = [
            row(1, 500, "commit"),
            row(2, 900, "commit"),
            row(3, 900, "doc-modified"),
            row(4, 1500, "commit"),
            row(5, 99_999, "commit"), // outside range: dropped
        ];
        let EventsPayload::Bucketed { buckets } =
            bucket_events(&rows, 0, 2000, BucketMode::Fixed(1000))
        else {
            panic!("bucketed expected");
        };
        assert_eq!(buckets.len(), 2);
        assert_eq!(buckets[0].from, 0);
        assert_eq!(buckets[0].to, 1000);
        assert_eq!(buckets[0].counts_by_kind["commit"], 2);
        assert_eq!(buckets[0].counts_by_kind["doc-modified"], 1);
        assert_eq!(buckets[1].counts_by_kind["commit"], 1);
    }

    #[test]
    fn auto_mode_caps_bucket_count() {
        let rows: Vec<EventRow> = (0..1000).map(|i| row(i, i * 1000, "commit")).collect();
        let EventsPayload::Bucketed { buckets } =
            bucket_events(&rows, 0, 1_000_000, BucketMode::Auto)
        else {
            panic!("bucketed expected");
        };
        assert!(buckets.len() as i64 <= AUTO_TARGET_BUCKETS + 1);
        let total: u64 = buckets.iter().flat_map(|b| b.counts_by_kind.values()).sum();
        assert_eq!(total, 1000, "no event lost to bucketing");
    }

    #[test]
    fn extreme_bounds_do_not_overflow_the_bucketing_math() {
        // Robustness M3: `from_ts`/`to_ts` arrive unsanitized from the wire. A
        // hostile `to=i64::MAX, from=i64::MIN` overflows the span subtraction
        // and the start offset/add. In the test profile (overflow-checks ON)
        // an unchecked subtraction PANICS; in release it would silently wrap
        // and corrupt the buckets. With saturating arithmetic the call returns
        // a sane payload either way — this test fails loudly on a regression.
        let rows = [row(1, 0, "commit"), row(2, 1000, "doc-modified")];

        // Auto mode: span = to - from would overflow.
        let EventsPayload::Bucketed { buckets } =
            bucket_events(&rows, i64::MIN, i64::MAX, BucketMode::Auto)
        else {
            panic!("bucketed expected");
        };
        let total: u64 = buckets.iter().flat_map(|b| b.counts_by_kind.values()).sum();
        assert_eq!(total, 2, "every in-range event counted, no overflow panic");

        // Fixed mode with extreme bounds: the start offset/add would overflow.
        let EventsPayload::Bucketed { .. } =
            bucket_events(&rows, i64::MIN, i64::MAX, BucketMode::Fixed(1000))
        else {
            panic!("bucketed expected");
        };

        // A degenerate from > to range must also not panic (empty/clamped).
        let _ = bucket_events(&rows, i64::MAX, i64::MIN, BucketMode::Auto);
    }

    #[test]
    fn bucket_param_grammar() {
        assert_eq!(parse_bucket_param("raw"), Some(BucketMode::Raw));
        assert_eq!(parse_bucket_param("auto"), Some(BucketMode::Auto));
        assert_eq!(parse_bucket_param("1h"), Some(BucketMode::Fixed(3_600_000)));
        assert_eq!(
            parse_bucket_param("1d"),
            Some(BucketMode::Fixed(86_400_000))
        );
        assert_eq!(parse_bucket_param("15m"), Some(BucketMode::Fixed(900_000)));
        assert_eq!(parse_bucket_param("bogus"), None);
        assert_eq!(parse_bucket_param("0h"), None);
    }
}
