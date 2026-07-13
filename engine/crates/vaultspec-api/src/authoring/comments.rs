//! Section-anchored document comments (authoring-surface ADR D2).
//!
//! A comment is a durable, NON-re-derivable authoring-state entity: a note a
//! human (or, later, an agent) attaches to a heading SECTION of a vault document.
//! Its home is the authoring store — the only sanctioned place for state that
//! cannot be re-derived from the corpus — never engine-data and never a vault
//! document (ADR: comments-as-documents was rejected for the core-verb weight and
//! feature-index pollution it would add).
//!
//! Two invariants shape this module:
//!
//! - **Anchoring is exact-or-conflict, never a silent re-anchor.** A comment
//!   anchors through the SAME [`SectionSelector`] a `SectionEdit` uses (heading
//!   path + advisory range hint + expected content hash), so it inherits that
//!   selector's honest drift signal. On read, each anchor is resolved against the
//!   CURRENT document body: an exact match serves the comment as anchored; a
//!   missing heading, an ambiguous heading, or a content-hash mismatch serves the
//!   comment as [`CommentAnchorState::Orphaned`] with typed evidence — STILL
//!   listed, marked stale, offering re-anchor or resolve. Resolution NEVER mutates
//!   the stored selector; re-anchoring to the current section is an EXPLICIT
//!   mutation ([`CommentRepository::reanchor`]).
//! - **Every accumulator is bounded at creation** (resource-bounds law). The
//!   comment body is size-capped; the table is bounded by a per-document cap, a
//!   per-store cap, and a resolved-comment retention window pruned opportunistically
//!   on create. Like the advisory lease table, a comment is not rollback/review/
//!   audit material, so it carries no formal retention/compaction lifecycle — that
//!   would lie to the compaction system about what the row is.
//!
//! Granularity caveat (ADR constraint): the section selector anchors HEADING
//! sections, not arbitrary spans. Inline / sub-paragraph anchoring is a named
//! follow-on needing a finer selector, an explicit non-goal here.
#![allow(dead_code)]

use ingest_struct::reader::blob_oid;
use serde::{Deserialize, Serialize};

use super::events::{LifecycleEventKind, comment_event};
use super::model::{ActorRef, CommandKind, CommentId, IdempotencyKey};
use super::sections::{SectionResolveError, SectionSelector, resolve_section};
use super::store::outbox::AppendDecision;
use super::store::unit_of_work::{Repository, SqliteRepository, UnitOfWork};
use super::store::{Result as StoreResult, Store, StoreError};

const COMMENT_SCHEMA: &str = "authoring.comment.v1";

/// Maximum comment body size (resource-bounds: a bounded field at creation). A
/// comment is a review note, not a document — 16 KiB is generous prose while
/// capping an unbounded paste or an agent-loop dump. Measured in UTF-8 bytes,
/// matching how the store sizes every other capped text field.
pub const MAX_COMMENT_BODY_BYTES: usize = 16 * 1024;

/// Maximum LIVE comments retained per document (resource-bounds: the per-document
/// listing would otherwise grow without bound). Generous for real human annotation
/// density across a document's sections while fencing runaway growth; enforced on
/// create AFTER the opportunistic retention prune, so long-resolved comments free
/// room before the cap refuses.
pub const MAX_COMMENTS_PER_DOCUMENT: usize = 500;

/// Maximum comments retained across the WHOLE store (resource-bounds: the table is
/// an only-growing accumulator otherwise). A hard ceiling independent of the
/// per-document cap so a broad corpus cannot sum past a safe total.
pub const MAX_COMMENTS_PER_STORE: usize = 50_000;

/// Retention window for RESOLVED comments (resource-bounds: a retention window on a
/// durable store). A comment resolved longer ago than this is eligible for prune on
/// the next create; UNRESOLVED comments are live product state and are NEVER
/// auto-pruned. 180 days keeps a resolved note visible across a long review cycle
/// before it is reclaimed.
pub const RESOLVED_COMMENT_RETENTION_MS: i64 = 180 * 24 * 60 * 60 * 1000;

/// The document a comment is attached to, identified SOLELY by its stable
/// linkage-graph node id — the key the per-document listing narrows on, surviving
/// content edits and most renames so a comment stays with its document. The current
/// worktree PATH is never stored: it is derived server-side from the node id through
/// the confined `DocumentResolver` at every read, so no client-supplied path is ever
/// trusted (the alternative would be an arbitrary-file-read seam).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommentDocument {
    pub node_id: String,
}

/// The durable comment record. `selector` is the section anchor (exact-or-conflict
/// resolved on read, never on write); `author` carries the full actor ref so
/// attribution upgrades in place when per-human identity lands (V1 is
/// single-principal by ADR). `resolved_at_ms` is set when a comment is resolved and
/// cleared when it is re-opened — it is the retention prune's clock.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommentRecord {
    pub schema_version: String,
    pub comment_id: CommentId,
    pub document: CommentDocument,
    pub selector: SectionSelector,
    pub body: String,
    pub author: ActorRef,
    pub resolved: bool,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resolved_at_ms: Option<i64>,
}

/// How a comment's anchor resolved against the CURRENT document body. Serialized
/// tagged so the frontend can branch on `state` without positional guessing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum CommentAnchorState {
    /// The selector resolved EXACTLY: the comment attaches to a live section.
    Anchored {
        heading_path: Vec<String>,
        content_start: usize,
        content_end: usize,
    },
    /// The selector no longer resolves exactly — the commented section drifted.
    /// The comment is STILL served (never dropped, never silently re-anchored);
    /// the evidence names why so the reader can re-anchor to the current section
    /// or resolve the comment.
    Orphaned { evidence: CommentOrphanEvidence },
}

/// Typed evidence for why a comment orphaned, mirroring the section resolver's own
/// conflict vocabulary so a reviewer sees the same reason a `SectionEdit` would.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "reason", rename_all = "snake_case")]
pub enum CommentOrphanEvidence {
    /// No heading matched the anchor's path — the section was removed or renamed.
    MissingAnchor { heading_path: Vec<String> },
    /// The anchor's path matched more than one heading — the document grew a
    /// duplicate; the comment needs a disambiguating re-anchor.
    AmbiguousAnchor {
        heading_path: Vec<String>,
        candidate_count: usize,
    },
    /// The heading still exists but its content changed — the exact-match fence
    /// tripped. This is the ordinary "the section I commented on was edited" case.
    ContentHashMismatch {
        heading_path: Vec<String>,
        expected: String,
        observed: String,
    },
    /// The stored selector is malformed (empty heading path). Defensive: creation
    /// validates against this, so it can only arise from a corrupted record.
    MalformedAnchor,
}

/// A comment paired with its anchor resolution against a specific document body.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedComment {
    pub record: CommentRecord,
    pub anchor: CommentAnchorState,
}

impl ResolvedComment {
    pub fn is_orphaned(&self) -> bool {
        matches!(self.anchor, CommentAnchorState::Orphaned { .. })
    }
}

/// The default per-document comment listing page size (resource-bounds: a bounded
/// read). Well above ordinary annotation density on one document; the per-document
/// cap is the hard ceiling.
pub const COMMENT_LIST_CAP_DEFAULT: u32 = 200;

/// The maximum per-document comment listing page size a caller may request.
pub const COMMENT_LIST_CAP_MAX: u32 = MAX_COMMENTS_PER_DOCUMENT as u32;

/// The wire view of one comment: the stored record, its anchor resolution against
/// the current document body, and the flat `orphaned` boolean the reader filters on
/// (backend-served, never frontend-derived — the anchor evidence is authoritative).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ServedComment {
    pub comment: CommentRecord,
    pub anchor: CommentAnchorState,
    pub orphaned: bool,
}

/// Resolve one stored comment for serving. `body` is the current document text, or
/// `None` when the document could not be read from the worktree at all (missing or
/// moved) — in which case the comment is served as orphaned with a missing-anchor
/// evidence, the honest "the whole section is unreachable" signal.
pub fn serve_comment(record: CommentRecord, body: Option<&str>) -> ServedComment {
    let anchor = match body {
        Some(text) => resolve_comment_anchor(text, &record.selector),
        None => CommentAnchorState::Orphaned {
            evidence: CommentOrphanEvidence::MissingAnchor {
                heading_path: record.selector.heading_path.clone(),
            },
        },
    };
    let orphaned = matches!(anchor, CommentAnchorState::Orphaned { .. });
    ServedComment {
        comment: record,
        anchor,
        orphaned,
    }
}

/// Resolve one comment anchor against `body` — the PURE exact-or-conflict core the
/// listing runs per comment. Never mutates anything; an exact match is `Anchored`,
/// every section-resolver conflict maps to a typed `Orphaned` evidence.
pub fn resolve_comment_anchor(body: &str, selector: &SectionSelector) -> CommentAnchorState {
    match resolve_section(body, selector) {
        Ok(resolved) => CommentAnchorState::Anchored {
            heading_path: resolved.heading_path,
            content_start: resolved.content_start,
            content_end: resolved.content_end,
        },
        Err(SectionResolveError::MissingAnchor { heading_path }) => CommentAnchorState::Orphaned {
            evidence: CommentOrphanEvidence::MissingAnchor { heading_path },
        },
        Err(SectionResolveError::AmbiguousAnchor {
            heading_path,
            candidate_count,
            ..
        }) => CommentAnchorState::Orphaned {
            evidence: CommentOrphanEvidence::AmbiguousAnchor {
                heading_path,
                candidate_count,
            },
        },
        Err(SectionResolveError::ContentHashMismatch {
            heading_path,
            expected,
            observed,
        }) => CommentAnchorState::Orphaned {
            evidence: CommentOrphanEvidence::ContentHashMismatch {
                heading_path,
                expected,
                observed,
            },
        },
        Err(SectionResolveError::EmptyHeadingPath) => CommentAnchorState::Orphaned {
            evidence: CommentOrphanEvidence::MalformedAnchor,
        },
    }
}

/// Pair a stored comment with its anchor resolution against `body`.
pub fn resolve_comment(record: CommentRecord, body: &str) -> ResolvedComment {
    let anchor = resolve_comment_anchor(body, &record.selector);
    ResolvedComment { record, anchor }
}

/// Resolve every comment in `records` against one document `body`, preserving order.
pub fn resolve_comments(records: Vec<CommentRecord>, body: &str) -> Vec<ResolvedComment> {
    records
        .into_iter()
        .map(|record| resolve_comment(record, body))
        .collect()
}

/// Deterministic comment id from the target document node id and the request's
/// idempotency key: a replayed create resolves to the SAME id (the repository
/// upserts on `comment_id`), so a create is idempotent under retry. The blob-oid
/// digest is hex, always a valid id token.
pub fn mint_comment_id(document_node_id: &str, idempotency_key: &IdempotencyKey) -> CommentId {
    let oid = blob_oid(format!("{document_node_id}\u{0}{}", idempotency_key.as_str()).as_bytes());
    CommentId::new(format!("comment:{oid}")).expect("blob-oid comment id is a valid token")
}

/// Input to create a comment. `comment_id` is minted by the caller (the HTTP layer);
/// the selector and body are validated here before the row lands.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateCommentInput {
    pub comment_id: CommentId,
    pub document: CommentDocument,
    pub selector: SectionSelector,
    pub body: String,
    pub author: ActorRef,
    pub created_at_ms: i64,
}

/// The section-anchored comment repository: create / read / list / edit / resolve /
/// re-anchor / delete over the bounded `authoring_comments` table, with the
/// per-document cap, per-store cap, and resolved-comment retention prune.
pub struct CommentRepository<'repo, 'conn> {
    repo: SqliteRepository<'repo, 'conn>,
    uow: &'repo UnitOfWork<'conn>,
}

impl<'conn> UnitOfWork<'conn> {
    pub fn comments<'repo>(&'repo self) -> CommentRepository<'repo, 'conn> {
        CommentRepository {
            repo: self.repository("authoring_comments"),
            uow: self,
        }
    }
}

impl CommentRepository<'_, '_> {
    /// Create a comment. The author must be a registered active actor; the body and
    /// selector are validated. Bounds are enforced at creation: the store first
    /// prunes resolved comments past the retention window, then refuses if the
    /// per-document or per-store cap is already reached (a bounded accumulator, never
    /// an only-growing table).
    pub fn create(&self, input: CreateCommentInput) -> StoreResult<CommentRecord> {
        self.uow.actors().ensure_active(&input.author)?;
        validate_body(&input.body)?;
        validate_selector(&input.selector)?;

        // Retention: reclaim comments resolved longer ago than the window before the
        // cap is measured, so a live create is never blocked by long-dead notes.
        let cutoff = input
            .created_at_ms
            .saturating_sub(RESOLVED_COMMENT_RETENTION_MS);
        self.prune_resolved_before(cutoff)?;

        // A deterministic comment id makes create idempotent: a replay with the same id
        // is an UPSERT of a row that already counts against the caps, so the cap gate
        // and the created_at_ms clock only apply to a genuinely NEW row. Without this,
        // an idempotent retry at exactly the cap boundary would be a false refusal, and
        // the upsert would overwrite the original creation time.
        let existing = self.get(&input.comment_id)?;
        if existing.is_none() {
            let per_document = self.count_for_document(&input.document.node_id)?;
            if per_document >= MAX_COMMENTS_PER_DOCUMENT {
                return Err(StoreError::Comment(format!(
                    "document `{}` has reached its {MAX_COMMENTS_PER_DOCUMENT}-comment cap",
                    input.document.node_id
                )));
            }
            let total = self.count_total()?;
            if total >= MAX_COMMENTS_PER_STORE {
                return Err(StoreError::Comment(format!(
                    "the authoring store has reached its {MAX_COMMENTS_PER_STORE}-comment cap"
                )));
            }
        }
        let created_at_ms = existing
            .as_ref()
            .map(|record| record.created_at_ms)
            .unwrap_or(input.created_at_ms);

        let record = CommentRecord {
            schema_version: COMMENT_SCHEMA.to_string(),
            comment_id: input.comment_id,
            document: input.document,
            selector: input.selector,
            body: input.body,
            author: input.author,
            resolved: false,
            created_at_ms,
            updated_at_ms: input.created_at_ms,
            resolved_at_ms: None,
        };
        self.insert_record(&record)?;
        Ok(record)
    }

    /// One comment by id, or `None` if it was never created or was deleted.
    pub fn get(&self, comment_id: &CommentId) -> StoreResult<Option<CommentRecord>> {
        let json = self.repo.query_optional(
            "SELECT record_json
             FROM authoring_comments
             WHERE comment_id = ?1",
            [comment_id.as_str()],
            |row| row.get::<_, String>(0),
        )?;
        match json {
            Some(json) => Ok(Some(read_record(&json)?)),
            None => Ok(None),
        }
    }

    /// Every comment on a document in creation order, bounded by `cap`. The caller
    /// resolves each anchor against the current body via [`resolve_comments`]; this
    /// read returns the raw stored records only.
    pub fn list_for_document(
        &self,
        document_node_id: &str,
        cap: u32,
    ) -> StoreResult<Vec<CommentRecord>> {
        let rows = self.repo.query_collect(
            "SELECT record_json
             FROM authoring_comments
             WHERE document_node_id = ?1
             ORDER BY created_at_ms ASC, comment_id ASC
             LIMIT ?2",
            rusqlite::params![document_node_id, cap],
            |row| row.get::<_, String>(0),
        )?;
        rows.iter().map(|json| read_record(json)).collect()
    }

    /// Count of comments currently retained for a document (the per-document cap gate).
    pub fn count_for_document(&self, document_node_id: &str) -> StoreResult<usize> {
        let count: i64 = self.repo.query_row(
            "SELECT count(*) FROM authoring_comments WHERE document_node_id = ?1",
            [document_node_id],
            |row| row.get(0),
        )?;
        Ok(count.max(0) as usize)
    }

    /// Count of comments across the whole store (the per-store cap gate).
    pub fn count_total(&self) -> StoreResult<usize> {
        let count: i64 =
            self.repo
                .query_row("SELECT count(*) FROM authoring_comments", [], |row| {
                    row.get(0)
                })?;
        Ok(count.max(0) as usize)
    }

    /// Edit a comment's body. Re-validates the new body; bumps `updated_at_ms`. The
    /// anchor and resolved state are untouched.
    pub fn update_body(
        &self,
        comment_id: &CommentId,
        body: impl Into<String>,
        now_ms: i64,
    ) -> StoreResult<CommentRecord> {
        let body = body.into();
        validate_body(&body)?;
        let mut record = self.require(comment_id)?;
        record.body = body;
        record.updated_at_ms = now_ms;
        self.insert_record(&record)?;
        Ok(record)
    }

    /// Set (or clear) a comment's resolved flag. Resolving stamps `resolved_at_ms`
    /// (the retention clock); re-opening clears it, restoring the comment to live
    /// product state that is never auto-pruned. Idempotent: setting the current
    /// state only bumps `updated_at_ms`.
    pub fn set_resolved(
        &self,
        comment_id: &CommentId,
        resolved: bool,
        now_ms: i64,
    ) -> StoreResult<CommentRecord> {
        let mut record = self.require(comment_id)?;
        record.resolved = resolved;
        record.resolved_at_ms = resolved.then_some(now_ms);
        record.updated_at_ms = now_ms;
        self.insert_record(&record)?;
        Ok(record)
    }

    /// Re-anchor a comment to the CURRENT state of its section — the ONLY sanctioned
    /// way a stored selector changes. The caller supplies a fresh selector computed
    /// from the current document (the same heading path with the current section's
    /// content hash, or a disambiguated path). This is an explicit mutation, never a
    /// side effect of reading an orphaned comment.
    pub fn reanchor(
        &self,
        comment_id: &CommentId,
        selector: SectionSelector,
        now_ms: i64,
    ) -> StoreResult<CommentRecord> {
        validate_selector(&selector)?;
        let mut record = self.require(comment_id)?;
        record.selector = selector;
        record.updated_at_ms = now_ms;
        self.insert_record(&record)?;
        Ok(record)
    }

    /// Delete a comment. Returns whether a row was removed (`false` when the id was
    /// already absent — an idempotent delete).
    pub fn delete(&self, comment_id: &CommentId) -> StoreResult<bool> {
        let affected = self.repo.execute(
            "DELETE FROM authoring_comments WHERE comment_id = ?1",
            [comment_id.as_str()],
        )?;
        Ok(affected > 0)
    }

    /// Prune every comment RESOLVED strictly before `cutoff_ms`. Unresolved comments
    /// are never touched. Returns the number reclaimed. Run opportunistically on
    /// create; also callable directly by a background reclaimer.
    pub fn prune_resolved_before(&self, cutoff_ms: i64) -> StoreResult<usize> {
        let affected = self.repo.execute(
            "DELETE FROM authoring_comments
             WHERE resolved = 1
               AND resolved_at_ms IS NOT NULL
               AND resolved_at_ms < ?1",
            [cutoff_ms],
        )?;
        Ok(affected)
    }

    fn require(&self, comment_id: &CommentId) -> StoreResult<CommentRecord> {
        self.get(comment_id)?.ok_or_else(|| {
            StoreError::Comment(format!("comment `{}` not found", comment_id.as_str()))
        })
    }

    fn insert_record(&self, record: &CommentRecord) -> StoreResult<()> {
        validate_record(record)?;
        let record_json =
            serde_json::to_string(record).map_err(|err| StoreError::Comment(err.to_string()))?;
        let delegated_by = record
            .author
            .delegated_by
            .as_ref()
            .map_or("", |id| id.as_str());
        self.repo.execute(
            "INSERT INTO authoring_comments
                (comment_id, document_node_id, author_actor_id,
                 author_actor_kind, author_delegated_by_actor_id, resolved, record_json,
                 created_at_ms, updated_at_ms, resolved_at_ms)
             VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(comment_id) DO UPDATE SET
                document_node_id = excluded.document_node_id,
                author_actor_id = excluded.author_actor_id,
                author_actor_kind = excluded.author_actor_kind,
                author_delegated_by_actor_id = excluded.author_delegated_by_actor_id,
                resolved = excluded.resolved,
                record_json = excluded.record_json,
                updated_at_ms = excluded.updated_at_ms,
                resolved_at_ms = excluded.resolved_at_ms",
            rusqlite::params![
                record.comment_id.as_str(),
                record.document.node_id.as_str(),
                record.author.id.as_str(),
                super::actors::actor_kind_name(record.author.kind),
                delegated_by,
                record.resolved as i64,
                record_json.as_str(),
                record.created_at_ms,
                record.updated_at_ms,
                record.resolved_at_ms,
            ],
        )?;
        Ok(())
    }
}

// --- command layer: repository mutation + SSE event in one unit of work --------
//
// Each command opens ONE unit of work that both persists the comment mutation and
// appends the lifecycle event to the transactional outbox — so a served event
// NEVER outruns (or lies about) the durable state. The HTTP handlers call these;
// the acting actor is the middleware-resolved principal, and the idempotency key
// makes the emitted event idempotent (the outbox dedupes a replay).

/// Create a comment and emit `comment.created`.
pub fn create_comment(
    store: &mut Store,
    input: CreateCommentInput,
    idempotency_key: IdempotencyKey,
) -> StoreResult<CommentRecord> {
    let now = input.created_at_ms;
    let author = input.author.clone();
    store.with_unit_of_work(CommandKind::CreateComment, |uow| {
        let record = uow.comments().create(input)?;
        emit_comment_event(
            uow,
            LifecycleEventKind::CommentCreated,
            &record,
            CommandKind::CreateComment,
            author.clone(),
            idempotency_key.clone(),
            now,
        )?;
        Ok(record)
    })
}

/// Edit a comment's body and emit `comment.updated`.
pub fn update_comment_body(
    store: &mut Store,
    comment_id: &CommentId,
    body: impl Into<String>,
    actor: ActorRef,
    idempotency_key: IdempotencyKey,
    now_ms: i64,
) -> StoreResult<CommentRecord> {
    let body = body.into();
    store.with_unit_of_work(CommandKind::UpdateComment, |uow| {
        uow.actors().ensure_active(&actor)?;
        let record = uow
            .comments()
            .update_body(comment_id, body.clone(), now_ms)?;
        emit_comment_event(
            uow,
            LifecycleEventKind::CommentUpdated,
            &record,
            CommandKind::UpdateComment,
            actor.clone(),
            idempotency_key.clone(),
            now_ms,
        )?;
        Ok(record)
    })
}

/// Set (or clear) a comment's resolved flag and emit `comment.updated`.
pub fn set_comment_resolved(
    store: &mut Store,
    comment_id: &CommentId,
    resolved: bool,
    actor: ActorRef,
    idempotency_key: IdempotencyKey,
    now_ms: i64,
) -> StoreResult<CommentRecord> {
    store.with_unit_of_work(CommandKind::UpdateComment, |uow| {
        uow.actors().ensure_active(&actor)?;
        let record = uow.comments().set_resolved(comment_id, resolved, now_ms)?;
        emit_comment_event(
            uow,
            LifecycleEventKind::CommentUpdated,
            &record,
            CommandKind::UpdateComment,
            actor.clone(),
            idempotency_key.clone(),
            now_ms,
        )?;
        Ok(record)
    })
}

/// Re-anchor a comment to the current section state and emit `comment.updated`.
pub fn reanchor_comment(
    store: &mut Store,
    comment_id: &CommentId,
    selector: SectionSelector,
    actor: ActorRef,
    idempotency_key: IdempotencyKey,
    now_ms: i64,
) -> StoreResult<CommentRecord> {
    store.with_unit_of_work(CommandKind::UpdateComment, |uow| {
        uow.actors().ensure_active(&actor)?;
        let record = uow
            .comments()
            .reanchor(comment_id, selector.clone(), now_ms)?;
        emit_comment_event(
            uow,
            LifecycleEventKind::CommentUpdated,
            &record,
            CommandKind::UpdateComment,
            actor.clone(),
            idempotency_key.clone(),
            now_ms,
        )?;
        Ok(record)
    })
}

/// Delete a comment; emit `comment.deleted` only when a row was actually removed
/// (an idempotent no-op delete of an absent id emits nothing). The document node id
/// for the event is read from the existing record, so the caller supplies no
/// redundant client data.
pub fn delete_comment(
    store: &mut Store,
    comment_id: &CommentId,
    actor: ActorRef,
    idempotency_key: IdempotencyKey,
    now_ms: i64,
) -> StoreResult<bool> {
    store.with_unit_of_work(CommandKind::DeleteComment, |uow| {
        uow.actors().ensure_active(&actor)?;
        let existing = uow.comments().get(comment_id)?;
        let removed = uow.comments().delete(comment_id)?;
        if let Some(record) = existing.filter(|_| removed) {
            let event = comment_event(
                LifecycleEventKind::CommentDeleted,
                comment_id.as_str(),
                &record.document.node_id,
                CommandKind::DeleteComment,
                actor.clone(),
                idempotency_key.clone(),
                now_ms,
            )?;
            append_comment_event(uow, event)?;
        }
        Ok(removed)
    })
}

fn emit_comment_event(
    uow: &UnitOfWork<'_>,
    event_kind: LifecycleEventKind,
    record: &CommentRecord,
    command: CommandKind,
    actor: ActorRef,
    idempotency_key: IdempotencyKey,
    now_ms: i64,
) -> StoreResult<()> {
    let event = comment_event(
        event_kind,
        record.comment_id.as_str(),
        &record.document.node_id,
        command,
        actor,
        idempotency_key,
        now_ms,
    )?;
    append_comment_event(uow, event)
}

fn append_comment_event(
    uow: &UnitOfWork<'_>,
    event: super::store::outbox::OutboxEventDraft,
) -> StoreResult<()> {
    match uow.outbox().append_event(event)? {
        AppendDecision::Inserted(_) | AppendDecision::Duplicate(_) => Ok(()),
    }
}

fn read_record(json: &str) -> StoreResult<CommentRecord> {
    let record: CommentRecord =
        serde_json::from_str(json).map_err(|err| StoreError::Comment(err.to_string()))?;
    validate_record(&record)?;
    Ok(record)
}

fn validate_record(record: &CommentRecord) -> StoreResult<()> {
    if record.schema_version != COMMENT_SCHEMA {
        return Err(StoreError::Comment(format!(
            "unsupported comment schema `{}`",
            record.schema_version
        )));
    }
    if record.document.node_id.trim().is_empty() {
        return Err(StoreError::Comment(
            "comment document node id cannot be empty".to_string(),
        ));
    }
    if record.updated_at_ms < record.created_at_ms {
        return Err(StoreError::Comment(
            "updated_at_ms cannot be before created_at_ms".to_string(),
        ));
    }
    if record.resolved != record.resolved_at_ms.is_some() {
        return Err(StoreError::Comment(
            "resolved flag and resolved_at_ms must agree".to_string(),
        ));
    }
    validate_body(&record.body)?;
    validate_selector(&record.selector)?;
    Ok(())
}

fn validate_body(body: &str) -> StoreResult<()> {
    if body.trim().is_empty() {
        return Err(StoreError::Comment(
            "comment body cannot be empty".to_string(),
        ));
    }
    if body.len() > MAX_COMMENT_BODY_BYTES {
        return Err(StoreError::Comment(format!(
            "comment body is {} bytes; the cap is {MAX_COMMENT_BODY_BYTES}",
            body.len()
        )));
    }
    Ok(())
}

fn validate_selector(selector: &SectionSelector) -> StoreResult<()> {
    if selector.heading_path.is_empty() {
        return Err(StoreError::Comment(
            "comment section selector heading path cannot be empty".to_string(),
        ));
    }
    if selector
        .heading_path
        .iter()
        .any(|seg| seg.trim().is_empty())
    {
        return Err(StoreError::Comment(
            "comment section selector heading path cannot contain an empty segment".to_string(),
        ));
    }
    if selector.expected_content_hash.trim().is_empty() {
        return Err(StoreError::Comment(
            "comment section selector expected content hash cannot be empty".to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use ingest_struct::reader::blob_oid;

    use super::*;
    use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput};
    use crate::authoring::model::{ActorId, ActorKind, CommandKind};
    use crate::authoring::store::Store;

    const DOC: &str = "# Title\n\nintro\n\n## Alpha\n\nalpha body\n\n## Beta\n\nbeta body\n";

    fn actor(id: &str, kind: ActorKind) -> ActorRef {
        ActorRef {
            id: ActorId::new(id).unwrap(),
            kind,
            delegated_by: None,
        }
    }

    fn editor() -> ActorRef {
        actor("human:editor", ActorKind::Human)
    }

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(&dir.path().join(".vault")).unwrap();
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.actors().put_record(ActorRecordInput::active(
                    editor(),
                    ActorDisplayMetadata::new("Editor", None),
                    1,
                ))
            })
            .unwrap();
        (dir, store)
    }

    fn selector_for(body: &str, heading_path: &[&str]) -> SectionSelector {
        // Compute the exact expected content hash for a section as it stands now — the
        // way the HTTP layer will build a selector from the live document.
        let resolver_selector = SectionSelector {
            heading_path: heading_path.iter().map(|s| s.to_string()).collect(),
            range_hint: None,
            expected_content_hash: String::from("placeholder"),
        };
        let section = resolve_section_content(body, &resolver_selector.heading_path);
        SectionSelector {
            heading_path: resolver_selector.heading_path,
            range_hint: None,
            expected_content_hash: blob_oid(section.as_bytes()),
        }
    }

    fn resolve_section_content(body: &str, heading_path: &[String]) -> String {
        // Trivial re-derivation for the fixtures: find the heading line, take through
        // the next same-or-shallower heading. The fixtures use single-segment paths.
        let target = heading_path.last().unwrap();
        let lines: Vec<&str> = body.split_inclusive('\n').collect();
        let mut out = String::new();
        let mut level = 0usize;
        let mut capturing = false;
        for line in lines {
            let trimmed = line.trim_end_matches(['\n', '\r']);
            let hashes = trimmed.chars().take_while(|c| *c == '#').count();
            let is_heading = hashes > 0
                && trimmed[hashes..]
                    .chars()
                    .next()
                    .map(|c| c == ' ')
                    .unwrap_or(false);
            if is_heading {
                let text = trimmed[hashes..].trim();
                if capturing && hashes <= level {
                    break;
                }
                if text == target {
                    capturing = true;
                    level = hashes;
                    out.push_str(line);
                    continue;
                }
            }
            if capturing {
                out.push_str(line);
            }
        }
        out
    }

    fn create(
        store: &mut Store,
        id: &str,
        node_id: &str,
        selector: SectionSelector,
        body: &str,
        now: i64,
    ) -> StoreResult<CommentRecord> {
        store.with_unit_of_work(CommandKind::CreateComment, |uow| {
            uow.comments().create(CreateCommentInput {
                comment_id: CommentId::new(id).unwrap(),
                document: CommentDocument {
                    node_id: node_id.to_string(),
                },
                selector,
                body: body.to_string(),
                author: editor(),
                created_at_ms: now,
            })
        })
    }

    #[test]
    fn comment_round_trips_and_lists_anchored_against_the_current_body() {
        let (dir, mut store) = temp_store();
        let selector = selector_for(DOC, &["Alpha"]);
        create(
            &mut store,
            "comment:1",
            "doc:plan",
            selector,
            "check this",
            100,
        )
        .unwrap();

        // Reopen to prove durability across a restart.
        drop(store);
        let mut reopened = Store::open(&dir.path().join(".vault")).unwrap();
        let records = reopened
            .with_read_unit_of_work(CommandKind::ReadContext, |uow| {
                uow.comments().list_for_document("doc:plan", 100)
            })
            .unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].body, "check this");
        assert_eq!(records[0].author, editor());
        assert!(!records[0].resolved);

        let resolved = resolve_comments(records, DOC);
        assert!(!resolved[0].is_orphaned());
        match &resolved[0].anchor {
            CommentAnchorState::Anchored { heading_path, .. } => {
                assert_eq!(
                    heading_path,
                    &vec!["Title".to_string(), "Alpha".to_string()]
                );
            }
            other => panic!("expected anchored, got {other:?}"),
        }
    }

    #[test]
    fn editing_the_commented_section_orphans_the_comment_with_hash_mismatch_evidence() {
        let (_dir, mut store) = temp_store();
        let selector = selector_for(DOC, &["Alpha"]);
        create(&mut store, "comment:2", "doc:plan", selector, "note", 100).unwrap();

        // The Alpha section's prose changed — the heading still exists, so this is a
        // content-hash mismatch, the ordinary "the section I commented on was edited"
        // orphaning path. Never a silent re-anchor.
        let edited =
            "# Title\n\nintro\n\n## Alpha\n\nALPHA BODY REWRITTEN\n\n## Beta\n\nbeta body\n";
        let records = store
            .with_read_unit_of_work(CommandKind::ReadContext, |uow| {
                uow.comments().list_for_document("doc:plan", 100)
            })
            .unwrap();
        let resolved = resolve_comments(records, edited);
        assert!(resolved[0].is_orphaned());
        match &resolved[0].anchor {
            CommentAnchorState::Orphaned {
                evidence: CommentOrphanEvidence::ContentHashMismatch { heading_path, .. },
            } => {
                // The evidence echoes the SELECTOR's stored path (what the anchor asked
                // for), not the resolved ancestor-inclusive path — a single-segment
                // selector reports the single segment it carried.
                assert_eq!(heading_path, &vec!["Alpha".to_string()]);
            }
            other => panic!("expected content-hash-mismatch orphan, got {other:?}"),
        }
    }

    #[test]
    fn removing_the_commented_heading_orphans_with_missing_anchor_evidence() {
        let (_dir, mut store) = temp_store();
        let selector = selector_for(DOC, &["Alpha"]);
        create(&mut store, "comment:3", "doc:plan", selector, "note", 100).unwrap();

        let without_alpha = "# Title\n\nintro\n\n## Beta\n\nbeta body\n";
        let records = store
            .with_read_unit_of_work(CommandKind::ReadContext, |uow| {
                uow.comments().list_for_document("doc:plan", 100)
            })
            .unwrap();
        let resolved = resolve_comments(records, without_alpha);
        assert!(matches!(
            resolved[0].anchor,
            CommentAnchorState::Orphaned {
                evidence: CommentOrphanEvidence::MissingAnchor { .. }
            }
        ));
    }

    #[test]
    fn reanchor_is_an_explicit_mutation_that_re_binds_to_the_current_section() {
        let (_dir, mut store) = temp_store();
        let selector = selector_for(DOC, &["Alpha"]);
        create(&mut store, "comment:4", "doc:plan", selector, "note", 100).unwrap();

        let edited = "# Title\n\nintro\n\n## Alpha\n\nALPHA REWRITTEN\n\n## Beta\n\nbeta body\n";
        // Before re-anchoring, the comment orphans against the edited body.
        let before = store
            .with_read_unit_of_work(CommandKind::ReadContext, |uow| {
                uow.comments().list_for_document("doc:plan", 100)
            })
            .unwrap();
        assert!(resolve_comments(before, edited)[0].is_orphaned());

        // Re-anchor to the CURRENT Alpha section: an explicit mutation supplying the
        // fresh selector computed from the edited body.
        let fresh = selector_for(edited, &["Alpha"]);
        let updated = store
            .with_unit_of_work(CommandKind::UpdateComment, |uow| {
                uow.comments()
                    .reanchor(&CommentId::new("comment:4").unwrap(), fresh, 200)
            })
            .unwrap();
        assert_eq!(updated.updated_at_ms, 200);

        // Now it anchors exactly against the edited body.
        let after = store
            .with_read_unit_of_work(CommandKind::ReadContext, |uow| {
                uow.comments().list_for_document("doc:plan", 100)
            })
            .unwrap();
        assert!(!resolve_comments(after, edited)[0].is_orphaned());
    }

    #[test]
    fn edit_resolve_reopen_and_delete_round_trip() {
        let (_dir, mut store) = temp_store();
        let selector = selector_for(DOC, &["Beta"]);
        create(&mut store, "comment:5", "doc:plan", selector, "first", 100).unwrap();
        let id = CommentId::new("comment:5").unwrap();

        let edited = store
            .with_unit_of_work(CommandKind::UpdateComment, |uow| {
                uow.comments().update_body(&id, "second", 110)
            })
            .unwrap();
        assert_eq!(edited.body, "second");
        assert_eq!(edited.updated_at_ms, 110);

        let resolved = store
            .with_unit_of_work(CommandKind::UpdateComment, |uow| {
                uow.comments().set_resolved(&id, true, 120)
            })
            .unwrap();
        assert!(resolved.resolved);
        assert_eq!(resolved.resolved_at_ms, Some(120));

        let reopened = store
            .with_unit_of_work(CommandKind::UpdateComment, |uow| {
                uow.comments().set_resolved(&id, false, 130)
            })
            .unwrap();
        assert!(!reopened.resolved);
        assert_eq!(reopened.resolved_at_ms, None);

        let removed = store
            .with_unit_of_work(CommandKind::DeleteComment, |uow| uow.comments().delete(&id))
            .unwrap();
        assert!(removed);
        let gone = store
            .with_read_unit_of_work(CommandKind::ReadContext, |uow| uow.comments().get(&id))
            .unwrap();
        assert!(gone.is_none());
    }

    #[test]
    fn per_document_cap_refuses_creation_past_the_bound() {
        let (_dir, mut store) = temp_store();
        let selector = selector_for(DOC, &["Alpha"]);
        // Seed exactly the per-document cap in ONE transaction (fast: a single unit of
        // work, no per-row commit), then assert the next create is refused as a value.
        store
            .with_unit_of_work(CommandKind::CreateComment, |uow| {
                for n in 0..MAX_COMMENTS_PER_DOCUMENT {
                    uow.comments().create(CreateCommentInput {
                        comment_id: CommentId::new(format!("comment:cap:{n}")).unwrap(),
                        document: CommentDocument {
                            node_id: "doc:capdoc".to_string(),
                        },
                        selector: selector.clone(),
                        body: "note".to_string(),
                        author: editor(),
                        created_at_ms: 100,
                    })?;
                }
                Ok(())
            })
            .unwrap();

        let count = store
            .with_read_unit_of_work(CommandKind::ReadContext, |uow| {
                uow.comments().count_for_document("doc:capdoc")
            })
            .unwrap();
        assert_eq!(count, MAX_COMMENTS_PER_DOCUMENT);

        // The cap+1 create is refused with a typed comment error naming the cap.
        let err = create(
            &mut store,
            "comment:cap:over",
            "doc:capdoc",
            selector,
            "one too many",
            200,
        )
        .unwrap_err();
        assert!(
            matches!(err, StoreError::Comment(ref d) if d.contains("comment cap")),
            "cap breach must be a typed refusal: {err:?}"
        );

        // A DIFFERENT document is unaffected — the cap is per-document.
        let other = selector_for(DOC, &["Beta"]);
        create(
            &mut store,
            "comment:other",
            "doc:otherdoc",
            other,
            "ok",
            300,
        )
        .unwrap();
    }

    #[test]
    fn an_idempotent_replay_at_the_cap_boundary_upserts_and_preserves_created_at() {
        let (_dir, mut store) = temp_store();
        let selector = selector_for(DOC, &["Alpha"]);
        // Fill the per-document cap exactly.
        store
            .with_unit_of_work(CommandKind::CreateComment, |uow| {
                for n in 0..MAX_COMMENTS_PER_DOCUMENT {
                    uow.comments().create(CreateCommentInput {
                        comment_id: CommentId::new(format!("comment:boundary:{n}")).unwrap(),
                        document: CommentDocument {
                            node_id: "doc:boundary".to_string(),
                        },
                        selector: selector.clone(),
                        body: "note".to_string(),
                        author: editor(),
                        created_at_ms: 100,
                    })?;
                }
                Ok(())
            })
            .unwrap();

        // A replay of an EXISTING id AT the cap boundary must NOT be a false refusal —
        // the row already counts, so the upsert bypasses the cap gate.
        let replay = create(
            &mut store,
            "comment:boundary:0",
            "doc:boundary",
            selector,
            "edited on replay",
            999,
        )
        .expect("an idempotent replay at the cap boundary must not be a false refusal");
        // The original creation time is preserved; only updated_at advances.
        assert_eq!(replay.created_at_ms, 100);
        assert_eq!(replay.updated_at_ms, 999);
        assert_eq!(replay.body, "edited on replay");

        // The column and JSON agree after reload, and the count did not grow past the cap.
        let reloaded = store
            .with_read_unit_of_work(CommandKind::ReadContext, |uow| {
                uow.comments()
                    .get(&CommentId::new("comment:boundary:0").unwrap())
            })
            .unwrap()
            .unwrap();
        assert_eq!(reloaded.created_at_ms, 100);
        let count = store
            .with_read_unit_of_work(CommandKind::ReadContext, |uow| {
                uow.comments().count_for_document("doc:boundary")
            })
            .unwrap();
        assert_eq!(count, MAX_COMMENTS_PER_DOCUMENT);
    }

    #[test]
    fn retention_prunes_long_resolved_comments_on_the_next_create() {
        let (_dir, mut store) = temp_store();
        let id = CommentId::new("comment:old").unwrap();
        let selector = selector_for(DOC, &["Alpha"]);
        create(
            &mut store,
            "comment:old",
            "doc:plan",
            selector,
            "stale note",
            1_000,
        )
        .unwrap();
        // Resolve it far in the past.
        store
            .with_unit_of_work(CommandKind::UpdateComment, |uow| {
                uow.comments().set_resolved(&id, true, 2_000)
            })
            .unwrap();

        // A create well past the retention window prunes the long-resolved comment.
        let now = 2_000 + RESOLVED_COMMENT_RETENTION_MS + 1;
        let selector2 = selector_for(DOC, &["Beta"]);
        create(
            &mut store,
            "comment:new",
            "doc:plan",
            selector2,
            "fresh note",
            now,
        )
        .unwrap();

        let records = store
            .with_read_unit_of_work(CommandKind::ReadContext, |uow| {
                uow.comments().list_for_document("doc:plan", 100)
            })
            .unwrap();
        assert_eq!(records.len(), 1, "the long-resolved comment was reclaimed");
        assert_eq!(
            records[0].comment_id,
            CommentId::new("comment:new").unwrap()
        );
    }

    #[test]
    fn an_unresolved_comment_is_never_pruned_by_retention() {
        let (_dir, mut store) = temp_store();
        let selector = selector_for(DOC, &["Alpha"]);
        create(
            &mut store,
            "comment:live",
            "doc:plan",
            selector,
            "open note",
            1_000,
        )
        .unwrap();

        // Directly invoke the prune with a cutoff far in the future: an UNRESOLVED
        // comment must survive because retention only ever reclaims resolved rows.
        let pruned = store
            .with_unit_of_work(CommandKind::CreateComment, |uow| {
                uow.comments().prune_resolved_before(i64::MAX)
            })
            .unwrap();
        assert_eq!(pruned, 0);
        let count = store
            .with_read_unit_of_work(CommandKind::ReadContext, |uow| {
                uow.comments().count_for_document("doc:plan")
            })
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn oversized_body_and_empty_selector_are_refused() {
        let (_dir, mut store) = temp_store();
        let selector = selector_for(DOC, &["Alpha"]);
        let huge = "x".repeat(MAX_COMMENT_BODY_BYTES + 1);
        let err = create(&mut store, "comment:big", "doc:plan", selector, &huge, 100).unwrap_err();
        assert!(matches!(err, StoreError::Comment(ref d) if d.contains("cap")));

        let bad_selector = SectionSelector {
            heading_path: vec![],
            range_hint: None,
            expected_content_hash: "abc".to_string(),
        };
        let err = create(
            &mut store,
            "comment:bad",
            "doc:plan",
            bad_selector,
            "ok",
            100,
        )
        .unwrap_err();
        assert!(matches!(err, StoreError::Comment(ref d) if d.contains("heading path")));
    }

    #[test]
    fn creating_under_an_unregistered_author_is_refused() {
        let (_dir, mut store) = temp_store();
        let selector = selector_for(DOC, &["Alpha"]);
        let err = store
            .with_unit_of_work(CommandKind::CreateComment, |uow| {
                uow.comments().create(CreateCommentInput {
                    comment_id: CommentId::new("comment:noauthor").unwrap(),
                    document: CommentDocument {
                        node_id: "doc:plan".to_string(),
                    },
                    selector,
                    body: "note".to_string(),
                    author: actor("human:ghost", ActorKind::Human),
                    created_at_ms: 100,
                })
            })
            .unwrap_err();
        assert!(matches!(err, StoreError::Actor(_)));
    }
}
