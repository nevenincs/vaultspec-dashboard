//! Immutable feedback batches (agent-wire-gaps ADR D7 / feedback-loop ADR D3+D4).
//!
//! A batch freezes the reviewer's chosen section-anchored comments into ONE
//! digest-addressed engine record the next prompt turn references by id — so
//! comment feedback rides the turn contract as DATA (auditable, immutable),
//! not just serialized prose, and the a2a edge transports only the opaque id.
//!
//! Immutability is STRUCTURAL: the batch id IS its content digest
//! (`feedback-batch:<blob-oid>`), the row is insert-only under that primary
//! key, and no update path exists in this module. Re-creating identical
//! content replays the existing record idempotently; later comment edits
//! never touch a frozen batch (feedback-loop D3, verbatim).

use serde::{Deserialize, Serialize};

use ingest_struct::reader::blob_oid;

use super::model::{ActorRef, SessionId};
use super::store::unit_of_work::{Repository, SqliteRepository, UnitOfWork};
use super::store::{Result as StoreResult, StoreError};

const FEEDBACK_BATCH_SCHEMA: &str = "authoring.feedback_batch.v1";

/// Comment-count cap, matching the shipped composer batch cap (ADR D7).
pub const FEEDBACK_BATCH_COMMENT_CAP: usize = 32;

/// Bound on the serialized batch (bodies + anchors + instruction). Generous for
/// 32 review comments while bounding a pathological payload at creation
/// (resource-bounds rule: every accumulator bounded where it is created).
pub const FEEDBACK_BATCH_MAX_BYTES: usize = 256 * 1024;

/// One frozen comment: id, body, and its section anchor at freeze time. The
/// anchor mirrors the section-comment plane's selector coordinates.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FeedbackBatchItem {
    pub comment_id: String,
    pub body: String,
    pub anchor: FeedbackAnchor,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FeedbackAnchor {
    pub heading_path: Vec<String>,
    pub content_start: u32,
    pub content_end: u32,
}

/// The immutable, digest-addressed batch record (stored verbatim as
/// `record_json`; the row carries the queryable columns beside it).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FeedbackBatchRecord {
    pub schema_version: String,
    pub feedback_batch_id: String,
    pub digest: String,
    pub session_id: SessionId,
    /// The document the comments anchor into (node id), at `source_revision`.
    pub source_document: String,
    pub source_revision: String,
    /// The freezing principal (server-resolved, never client-claimed).
    pub author: ActorRef,
    pub items: Vec<FeedbackBatchItem>,
    /// Optional general instruction riding beside the per-comment bodies.
    pub instruction: Option<String>,
    pub total_bytes: usize,
    pub created_at_ms: i64,
}

/// Creation input: everything content-addressed EXCEPT `created_at_ms`, which
/// is recorded but excluded from the digest so an idempotent retry replays the
/// original record instead of minting a sibling.
#[derive(Debug, Clone)]
pub struct CreateFeedbackBatchInput {
    pub session_id: SessionId,
    pub source_document: String,
    pub source_revision: String,
    pub author: ActorRef,
    pub items: Vec<FeedbackBatchItem>,
    pub instruction: Option<String>,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone)]
pub struct FeedbackBatchOutcome {
    pub record: FeedbackBatchRecord,
    pub replayed: bool,
}

/// The canonical digest input: the content that DEFINES the batch. Timestamps
/// are excluded (retry-stable); the author is included (the same comments
/// frozen by a different principal are a different batch).
#[derive(Serialize)]
struct BatchDigestInput<'a> {
    schema_version: &'a str,
    session_id: &'a SessionId,
    source_document: &'a str,
    source_revision: &'a str,
    author: &'a ActorRef,
    items: &'a [FeedbackBatchItem],
    instruction: &'a Option<String>,
}

pub struct FeedbackBatchRepository<'repo, 'conn> {
    repo: SqliteRepository<'repo, 'conn>,
}

impl<'conn> UnitOfWork<'conn> {
    pub fn feedback_batches<'repo>(&'repo self) -> FeedbackBatchRepository<'repo, 'conn> {
        FeedbackBatchRepository {
            repo: self.repository("authoring_feedback_batches"),
        }
    }
}

impl FeedbackBatchRepository<'_, '_> {
    /// Freeze a batch. Validates the caps, computes the content digest, and
    /// inserts under `feedback-batch:<digest>`. Identical content replays the
    /// stored record (idempotent create); there is no update path, so a stored
    /// batch can never change (immutability by construction).
    pub fn create(&self, input: CreateFeedbackBatchInput) -> StoreResult<FeedbackBatchOutcome> {
        if input.items.is_empty() {
            return Err(StoreError::Validation(
                "a feedback batch must carry at least one comment".to_string(),
            ));
        }
        if input.items.len() > FEEDBACK_BATCH_COMMENT_CAP {
            return Err(StoreError::Validation(format!(
                "feedback batch exceeds the comment cap ({} > {FEEDBACK_BATCH_COMMENT_CAP})",
                input.items.len()
            )));
        }
        for item in &input.items {
            if item.comment_id.trim().is_empty() || item.body.trim().is_empty() {
                return Err(StoreError::Validation(
                    "feedback batch comments require a non-empty id and body".to_string(),
                ));
            }
        }
        let digest_bytes = serde_json::to_vec(&BatchDigestInput {
            schema_version: FEEDBACK_BATCH_SCHEMA,
            session_id: &input.session_id,
            source_document: &input.source_document,
            source_revision: &input.source_revision,
            author: &input.author,
            items: &input.items,
            instruction: &input.instruction,
        })
        .map_err(|err| StoreError::Validation(err.to_string()))?;
        if digest_bytes.len() > FEEDBACK_BATCH_MAX_BYTES {
            return Err(StoreError::Validation(format!(
                "feedback batch exceeds the byte bound ({} > {FEEDBACK_BATCH_MAX_BYTES})",
                digest_bytes.len()
            )));
        }
        let digest = blob_oid(&digest_bytes);
        let feedback_batch_id = format!("feedback-batch:{digest}");

        if let Some(existing) = self.get(&feedback_batch_id)? {
            return Ok(FeedbackBatchOutcome {
                record: existing,
                replayed: true,
            });
        }

        let record = FeedbackBatchRecord {
            schema_version: FEEDBACK_BATCH_SCHEMA.to_string(),
            feedback_batch_id: feedback_batch_id.clone(),
            digest,
            session_id: input.session_id,
            source_document: input.source_document,
            source_revision: input.source_revision,
            author: input.author,
            items: input.items,
            instruction: input.instruction,
            total_bytes: digest_bytes.len(),
            created_at_ms: input.created_at_ms,
        };
        let record_json = serde_json::to_string(&record)
            .map_err(|err| StoreError::Validation(err.to_string()))?;
        self.repo.execute(
            "INSERT INTO authoring_feedback_batches
                (feedback_batch_id, session_id, source_revision, author_actor_id,
                 author_actor_kind, author_delegated_by_actor_id, comment_count,
                 total_bytes, record_json, created_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(feedback_batch_id) DO NOTHING",
            rusqlite::params![
                record.feedback_batch_id,
                record.session_id.as_str(),
                record.source_revision,
                record.author.id.as_str(),
                super::actors::actor_kind_name(record.author.kind),
                record
                    .author
                    .delegated_by
                    .as_ref()
                    .map(|id| id.as_str())
                    .unwrap_or(""),
                record.items.len() as i64,
                record.total_bytes as i64,
                record_json,
                record.created_at_ms,
            ],
        )?;
        Ok(FeedbackBatchOutcome {
            record,
            replayed: false,
        })
    }

    /// The frozen batch for an id, if any.
    pub fn get(&self, feedback_batch_id: &str) -> StoreResult<Option<FeedbackBatchRecord>> {
        let json = self.repo.query_optional(
            "SELECT record_json
             FROM authoring_feedback_batches
             WHERE feedback_batch_id = ?1",
            [feedback_batch_id],
            |row| row.get::<_, String>(0),
        )?;
        match json {
            Some(json) => Ok(Some(read_batch(&json)?)),
            None => Ok(None),
        }
    }
}

fn read_batch(json: &str) -> StoreResult<FeedbackBatchRecord> {
    let record: FeedbackBatchRecord =
        serde_json::from_str(json).map_err(|err| StoreError::Validation(err.to_string()))?;
    if record.schema_version != FEEDBACK_BATCH_SCHEMA {
        return Err(StoreError::Validation(format!(
            "unsupported feedback-batch schema `{}`",
            record.schema_version
        )));
    }
    Ok(record)
}

#[cfg(test)]
mod tests {
    use super::super::model::{ActorId, ActorKind, CommandKind};
    use super::super::store::Store;
    use super::*;

    fn author() -> ActorRef {
        ActorRef {
            id: ActorId::new("human:reviewer").unwrap(),
            kind: ActorKind::Human,
            delegated_by: None,
        }
    }

    fn item(id: &str, body: &str) -> FeedbackBatchItem {
        FeedbackBatchItem {
            comment_id: id.to_string(),
            body: body.to_string(),
            anchor: FeedbackAnchor {
                heading_path: vec!["Decisions".to_string()],
                content_start: 10,
                content_end: 42,
            },
        }
    }

    fn input(items: Vec<FeedbackBatchItem>) -> CreateFeedbackBatchInput {
        CreateFeedbackBatchInput {
            session_id: SessionId::new("session_fb_1").unwrap(),
            source_document: "doc:plan-under-review".to_string(),
            source_revision: "blob:abc123".to_string(),
            author: author(),
            items,
            instruction: Some("Address every comment.".to_string()),
            created_at_ms: 1_000,
        }
    }

    fn with_store<T>(f: impl FnOnce(&mut Store) -> T) -> T {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(&dir.path().join(".vault")).unwrap();
        f(&mut store)
    }

    #[test]
    fn create_is_digest_addressed_and_replays_identical_content() {
        with_store(|store| {
            store
                .with_unit_of_work(CommandKind::CreateSession, |uow| {
                    let first = uow
                        .feedback_batches()
                        .create(input(vec![item("comment_1", "Tighten the rationale.")]))?;
                    assert!(!first.replayed);
                    assert!(
                        first
                            .record
                            .feedback_batch_id
                            .starts_with("feedback-batch:")
                    );
                    assert_eq!(
                        first.record.feedback_batch_id,
                        format!("feedback-batch:{}", first.record.digest)
                    );

                    // Identical content — different timestamp — replays the SAME record.
                    let mut retry = input(vec![item("comment_1", "Tighten the rationale.")]);
                    retry.created_at_ms = 9_999;
                    let second = uow.feedback_batches().create(retry)?;
                    assert!(second.replayed);
                    assert_eq!(second.record, first.record);
                    assert_eq!(second.record.created_at_ms, 1_000, "original stamp kept");

                    // Different content mints a different id.
                    let third = uow
                        .feedback_batches()
                        .create(input(vec![item("comment_1", "Different body.")]))?;
                    assert!(!third.replayed);
                    assert_ne!(
                        third.record.feedback_batch_id,
                        first.record.feedback_batch_id
                    );
                    Ok(())
                })
                .unwrap();
        });
    }

    #[test]
    fn caps_and_byte_bound_are_enforced_at_creation() {
        with_store(|store| {
            store
                .with_unit_of_work(CommandKind::CreateSession, |uow| {
                    let over_cap: Vec<_> = (0..FEEDBACK_BATCH_COMMENT_CAP + 1)
                        .map(|i| item(&format!("comment_{i}"), "body"))
                        .collect();
                    let err = uow.feedback_batches().create(input(over_cap)).unwrap_err();
                    assert!(err.to_string().contains("comment cap"), "{err}");

                    let oversized =
                        vec![item("comment_big", &"x".repeat(FEEDBACK_BATCH_MAX_BYTES))];
                    let err = uow.feedback_batches().create(input(oversized)).unwrap_err();
                    assert!(err.to_string().contains("byte bound"), "{err}");

                    let err = uow.feedback_batches().create(input(vec![])).unwrap_err();
                    assert!(err.to_string().contains("at least one"), "{err}");
                    Ok(())
                })
                .unwrap();
        });
    }

    #[test]
    fn stored_batch_round_trips_and_has_no_update_path() {
        with_store(|store| {
            store
                .with_unit_of_work(CommandKind::CreateSession, |uow| {
                    let created = uow
                        .feedback_batches()
                        .create(input(vec![item("comment_1", "Frozen body.")]))?
                        .record;
                    let read = uow
                        .feedback_batches()
                        .get(&created.feedback_batch_id)?
                        .expect("stored batch");
                    assert_eq!(read, created);
                    assert_eq!(read.items[0].body, "Frozen body.");
                    assert_eq!(read.items[0].anchor.heading_path, vec!["Decisions"]);
                    Ok(())
                })
                .unwrap();
        });
    }
}
