//! Revision snapshot and preimage capture primitives.
//!
//! W03.P11 captures document bytes, base revision checks, and rollback
//! preimages for later proposal, validation, apply, and rollback phases. It
//! does not implement proposal operations, apply jobs, rollback commands, or
//! route handlers.
#![allow(dead_code)]

use std::path::PathBuf;

use engine_model::ScopeRef;
use ingest_struct::reader::{DocumentBody, StructError, blob_oid};
use serde::{Deserialize, Serialize};

use super::model::{AuthoringModelError, DocumentRef, RevisionToken};
use super::store::retention::{
    LifecycleStatus, RetentionClass, RetentionRecord, RetentionRecordRef,
};
use super::store::unit_of_work::{Repository, SqliteRepository, UnitOfWork};
use super::store::{Result as StoreResult, StoreError};

#[derive(Debug, thiserror::Error)]
pub enum SnapshotError {
    #[error("document reference kind cannot be snapshotted for this operation")]
    UnsupportedDocumentRef,
    #[error("document `{path}` base revision is stale: expected {expected}, actual {actual}")]
    StaleBase {
        path: String,
        expected: RevisionToken,
        actual: RevisionToken,
    },
    #[error("snapshot integrity: {0}")]
    Integrity(String),
    #[error("document bytes: {0}")]
    Struct(#[from] StructError),
    #[error("authoring model: {0}")]
    Model(#[from] AuthoringModelError),
    #[error("authoring store: {0}")]
    Store(#[from] StoreError),
    #[error("snapshot json: {0}")]
    Json(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, SnapshotError>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RevisionSnapshot {
    pub document: DocumentRef,
    pub path: String,
    pub revision: RevisionToken,
    pub blob_hash: String,
    pub text: String,
    pub byte_len: usize,
    pub base_revision_matches: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RevisionMetadata {
    pub document: DocumentRef,
    pub path: String,
    pub revision: RevisionToken,
    pub blob_hash: String,
    pub byte_len: usize,
    pub revision_matches_ref: bool,
}

impl RevisionSnapshot {
    pub fn metadata(&self) -> RevisionMetadata {
        RevisionMetadata {
            document: self.document.clone(),
            path: self.path.clone(),
            revision: self.revision.clone(),
            blob_hash: self.blob_hash.clone(),
            byte_len: self.byte_len,
            revision_matches_ref: self.base_revision_matches,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TargetSnapshot {
    pub document: DocumentRef,
    pub base_revision: RevisionToken,
    pub payload_hash: String,
    pub payload_text: String,
    pub payload_bytes: i64,
}

impl TargetSnapshot {
    pub fn from_text(
        document: DocumentRef,
        base_revision: RevisionToken,
        payload_text: impl Into<String>,
    ) -> Result<Self> {
        let payload_text = payload_text.into();
        let snapshot = Self {
            document,
            base_revision,
            payload_hash: blob_oid(payload_text.as_bytes()),
            payload_bytes: payload_text.len() as i64,
            payload_text,
        };
        snapshot.verify()?;
        Ok(snapshot)
    }

    pub fn verify(&self) -> Result<()> {
        if self.payload_bytes < 0 {
            return Err(SnapshotError::Integrity(
                "target payload_bytes must be non-negative".to_string(),
            ));
        }
        if self.payload_bytes != self.payload_text.len() as i64 {
            return Err(SnapshotError::Integrity(
                "target payload_bytes does not match payload_text length".to_string(),
            ));
        }
        let computed = blob_oid(self.payload_text.as_bytes());
        if computed != self.payload_hash {
            return Err(SnapshotError::Integrity(
                "target payload hash mismatch".to_string(),
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SnapshotRecoveryPayload {
    pub preimage: PreimageRecord,
    pub rollback_target: TargetSnapshot,
}

impl SnapshotRecoveryPayload {
    fn from_preimage(preimage: PreimageRecord) -> StoreResult<Self> {
        preimage.verify_for_store()?;
        let rollback_target = TargetSnapshot::from_text(
            preimage.document.clone(),
            preimage.base_revision.clone(),
            preimage.payload_text.clone(),
        )
        .map_err(|err| StoreError::Snapshot(err.to_string()))?;
        if rollback_target.payload_hash != preimage.payload_hash {
            return Err(StoreError::Snapshot(format!(
                "preimage `{}` recovery target hash mismatch",
                preimage.preimage_id
            )));
        }
        Ok(Self {
            preimage,
            rollback_target,
        })
    }
}

#[derive(Debug, Clone)]
pub struct SnapshotReader {
    root: PathBuf,
    scope: ScopeRef,
}

impl SnapshotReader {
    pub fn for_worktree(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            scope: ScopeRef::Worktree {
                path: "worktree".to_string(),
            },
        }
    }

    pub fn for_ref(root: impl Into<PathBuf>, name: impl Into<String>) -> Self {
        Self {
            root: root.into(),
            scope: ScopeRef::Ref { name: name.into() },
        }
    }

    pub fn capture_existing(&self, document: &DocumentRef) -> Result<RevisionSnapshot> {
        let DocumentRef::Existing {
            path,
            base_revision,
            ..
        } = document
        else {
            return Err(SnapshotError::UnsupportedDocumentRef);
        };
        let body = self.read_document(path)?;
        let revision = revision_from_blob_hash(&body.blob_hash)?;
        Ok(RevisionSnapshot {
            document: document.clone(),
            path: body.path,
            revision: revision.clone(),
            blob_hash: body.blob_hash,
            byte_len: body.text.len(),
            text: body.text,
            base_revision_matches: revision == *base_revision,
        })
    }

    pub fn require_current_base(&self, document: &DocumentRef) -> Result<RevisionSnapshot> {
        let snapshot = self.capture_existing(document)?;
        if snapshot.base_revision_matches {
            return Ok(snapshot);
        }
        let DocumentRef::Existing { base_revision, .. } = document else {
            return Err(SnapshotError::UnsupportedDocumentRef);
        };
        Err(SnapshotError::StaleBase {
            path: snapshot.path,
            expected: base_revision.clone(),
            actual: snapshot.revision,
        })
    }

    pub fn capture_preimage(&self, request: PreimageCaptureRequest) -> Result<PreimageRecord> {
        let snapshot = self.require_current_base(&request.document)?;
        PreimageRecord::from_snapshot(request, snapshot)
    }

    fn read_document(&self, rel_path: &str) -> Result<DocumentBody> {
        Ok(match &self.scope {
            ScopeRef::Worktree { .. } => {
                ingest_struct::reader::read_from_worktree(&self.root, rel_path)?
            }
            ScopeRef::Ref { name } => {
                ingest_struct::reader::read_from_ref(&self.root, name, rel_path)?
            }
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreimageCaptureRequest {
    pub preimage_id: String,
    pub changeset_id: String,
    pub operation_id: String,
    pub document: DocumentRef,
    pub captured_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PreimageRecord {
    pub preimage_id: String,
    pub changeset_id: String,
    pub operation_id: String,
    pub document: DocumentRef,
    pub document_node_id: String,
    pub document_path: String,
    pub base_revision: RevisionToken,
    pub blob_hash: String,
    pub payload_hash: String,
    pub payload_text: String,
    pub payload_bytes: i64,
    pub captured_at_ms: i64,
    pub retention_record_kind: String,
    pub retention_record_id: String,
}

impl PreimageRecord {
    fn from_snapshot(request: PreimageCaptureRequest, snapshot: RevisionSnapshot) -> Result<Self> {
        validate_non_empty_snapshot("preimage_id", &request.preimage_id)?;
        validate_non_empty_snapshot("changeset_id", &request.changeset_id)?;
        validate_non_empty_snapshot("operation_id", &request.operation_id)?;
        if request.captured_at_ms < 0 {
            return Err(SnapshotError::Integrity(
                "captured_at_ms must be non-negative".to_string(),
            ));
        }
        let DocumentRef::Existing { node_id, path, .. } = &snapshot.document else {
            return Err(SnapshotError::UnsupportedDocumentRef);
        };
        // Clone the fields we need OUT of the borrow before `snapshot.document`
        // is moved into the struct below (E0505: the borrow of `snapshot.document`
        // must end before the move).
        let document_node_id = node_id.clone();
        let document_path = path.clone();
        let payload_hash = blob_oid(snapshot.text.as_bytes());
        if payload_hash != snapshot.blob_hash {
            return Err(SnapshotError::Integrity(
                "captured text hash does not match snapshot blob hash".to_string(),
            ));
        }
        Ok(Self {
            preimage_id: request.preimage_id.clone(),
            changeset_id: request.changeset_id,
            operation_id: request.operation_id,
            document: snapshot.document,
            document_node_id,
            document_path,
            base_revision: snapshot.revision,
            blob_hash: snapshot.blob_hash,
            payload_bytes: snapshot.byte_len as i64,
            payload_hash,
            payload_text: snapshot.text,
            captured_at_ms: request.captured_at_ms,
            retention_record_kind: "preimage".to_string(),
            retention_record_id: request.preimage_id,
        })
    }

    fn verify_for_store(&self) -> StoreResult<()> {
        validate_non_empty_store("preimage_id", &self.preimage_id)?;
        validate_non_empty_store("changeset_id", &self.changeset_id)?;
        validate_non_empty_store("operation_id", &self.operation_id)?;
        validate_non_empty_store("document_node_id", &self.document_node_id)?;
        validate_non_empty_store("document_path", &self.document_path)?;
        validate_non_empty_store("blob_hash", &self.blob_hash)?;
        validate_non_empty_store("payload_hash", &self.payload_hash)?;
        validate_non_empty_store("retention_record_kind", &self.retention_record_kind)?;
        validate_non_empty_store("retention_record_id", &self.retention_record_id)?;
        if self.payload_bytes < 0 {
            return Err(StoreError::Snapshot(
                "payload_bytes must be non-negative".to_string(),
            ));
        }
        if self.captured_at_ms < 0 {
            return Err(StoreError::Snapshot(
                "captured_at_ms must be non-negative".to_string(),
            ));
        }
        let DocumentRef::Existing {
            node_id,
            path,
            base_revision,
            ..
        } = &self.document
        else {
            return Err(StoreError::Snapshot(format!(
                "preimage `{}` document reference is not an existing document",
                self.preimage_id
            )));
        };
        if node_id != &self.document_node_id
            || path != &self.document_path
            || base_revision != &self.base_revision
        {
            return Err(StoreError::Snapshot(format!(
                "preimage `{}` document identity mismatch",
                self.preimage_id
            )));
        }
        if self.payload_bytes != self.payload_text.len() as i64 {
            return Err(StoreError::Snapshot(
                "payload_bytes does not match payload_text length".to_string(),
            ));
        }
        let computed = blob_oid(self.payload_text.as_bytes());
        if computed != self.payload_hash {
            return Err(StoreError::Snapshot(format!(
                "preimage `{}` payload hash mismatch",
                self.preimage_id
            )));
        }
        let expected_blob = self
            .base_revision
            .as_str()
            .strip_prefix("blob:")
            .ok_or_else(|| {
                StoreError::Snapshot(format!(
                    "preimage `{}` base revision is not a blob token",
                    self.preimage_id
                ))
            })?;
        if expected_blob != self.blob_hash || expected_blob != self.payload_hash {
            return Err(StoreError::Snapshot(format!(
                "preimage `{}` revision, blob hash, and payload hash diverge",
                self.preimage_id
            )));
        }
        Ok(())
    }

    fn retention_record(&self) -> StoreResult<RetentionRecord> {
        self.verify_for_store()?;
        let record_ref = RetentionRecordRef::new(
            self.retention_record_kind.clone(),
            self.retention_record_id.clone(),
        )?;
        let mut record = RetentionRecord::new(
            record_ref,
            "changeset",
            self.changeset_id.clone(),
            RetentionClass::RollbackMaterial,
            LifecycleStatus::Active,
            self.payload_hash.clone(),
            self.captured_at_ms,
        )?;
        record.payload_bytes = self.payload_bytes;
        Ok(record)
    }
}

pub struct SnapshotRepository<'repo, 'conn> {
    uow: &'repo UnitOfWork<'conn>,
    repo: SqliteRepository<'repo, 'conn>,
}

impl<'conn> UnitOfWork<'conn> {
    pub fn snapshots<'repo>(&'repo self) -> SnapshotRepository<'repo, 'conn> {
        SnapshotRepository {
            uow: self,
            repo: self.repository("authoring_document_preimages"),
        }
    }
}

impl SnapshotRepository<'_, '_> {
    pub fn store_preimage(&self, record: &PreimageRecord) -> StoreResult<()> {
        let retention_record = record.retention_record()?;
        self.uow.retention().upsert_record(&retention_record)?;
        let document_ref_json = serde_json::to_string(&record.document)
            .map_err(|err| StoreError::Snapshot(err.to_string()))?;
        self.repo.execute(
            "INSERT INTO authoring_document_preimages
                (preimage_id, changeset_id, operation_id, document_ref_json,
                 document_node_id, document_path, base_revision, blob_hash,
                 payload_hash, payload_text, payload_bytes, captured_at_ms,
                 retention_record_kind, retention_record_id)
             VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            rusqlite::params![
                record.preimage_id.as_str(),
                record.changeset_id.as_str(),
                record.operation_id.as_str(),
                document_ref_json.as_str(),
                record.document_node_id.as_str(),
                record.document_path.as_str(),
                record.base_revision.as_str(),
                record.blob_hash.as_str(),
                record.payload_hash.as_str(),
                record.payload_text.as_str(),
                record.payload_bytes,
                record.captured_at_ms,
                record.retention_record_kind.as_str(),
                record.retention_record_id.as_str(),
            ],
        )?;
        Ok(())
    }

    pub fn preimage(&self, preimage_id: &str) -> StoreResult<Option<PreimageRecord>> {
        validate_non_empty_store("preimage_id", preimage_id)?;
        let record = self.repo.query_optional(
            "SELECT preimage_id, changeset_id, operation_id, document_ref_json,
                    document_node_id, document_path, base_revision, blob_hash,
                    payload_hash, payload_text, payload_bytes, captured_at_ms,
                    retention_record_kind, retention_record_id
             FROM authoring_document_preimages
             WHERE preimage_id = ?1",
            [preimage_id],
            read_preimage,
        )?;
        if let Some(record) = &record {
            record.verify_for_store()?;
        }
        Ok(record)
    }

    pub fn require_preimage(&self, preimage_id: &str) -> StoreResult<PreimageRecord> {
        self.preimage(preimage_id)?
            .ok_or_else(|| StoreError::Snapshot(format!("missing preimage `{preimage_id}`")))
    }

    pub fn recovery_payload(&self, preimage_id: &str) -> StoreResult<SnapshotRecoveryPayload> {
        SnapshotRecoveryPayload::from_preimage(self.require_preimage(preimage_id)?)
    }
}

fn revision_from_blob_hash(blob_hash: &str) -> Result<RevisionToken> {
    Ok(RevisionToken::new(format!("blob:{blob_hash}"))?)
}

fn read_preimage(row: &rusqlite::Row<'_>) -> rusqlite::Result<PreimageRecord> {
    let document_ref_json: String = row.get(3)?;
    let document = serde_json::from_str(&document_ref_json).map_err(to_sql_error)?;
    let base_revision: String = row.get(6)?;
    Ok(PreimageRecord {
        preimage_id: row.get(0)?,
        changeset_id: row.get(1)?,
        operation_id: row.get(2)?,
        document,
        document_node_id: row.get(4)?,
        document_path: row.get(5)?,
        base_revision: RevisionToken::new(base_revision).map_err(to_sql_error)?,
        blob_hash: row.get(7)?,
        payload_hash: row.get(8)?,
        payload_text: row.get(9)?,
        payload_bytes: row.get(10)?,
        captured_at_ms: row.get(11)?,
        retention_record_kind: row.get(12)?,
        retention_record_id: row.get(13)?,
    })
}

fn validate_non_empty_snapshot(field: &str, value: &str) -> Result<()> {
    if value.trim().is_empty() {
        return Err(SnapshotError::Integrity(format!("{field} cannot be empty")));
    }
    Ok(())
}

fn validate_non_empty_store(field: &str, value: &str) -> StoreResult<()> {
    if value.trim().is_empty() {
        return Err(StoreError::Snapshot(format!("{field} cannot be empty")));
    }
    Ok(())
}

fn to_sql_error(error: impl std::error::Error + Send + Sync + 'static) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::process::Command;

    use rusqlite::Connection;

    use super::*;
    use crate::authoring::documents::{DocumentResolver, ExistingDocumentLookup};
    use crate::authoring::model::CommandKind;
    use crate::authoring::store::Store;

    fn write_doc(root: &Path, rel: &str, body: &str) {
        let path = root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    fn git(root: &Path, args: &[&str]) {
        let output = Command::new("git")
            .current_dir(root)
            .args(args)
            .env("GIT_AUTHOR_NAME", "authoring")
            .env("GIT_AUTHOR_EMAIL", "authoring@example.com")
            .env("GIT_COMMITTER_NAME", "authoring")
            .env("GIT_COMMITTER_EMAIL", "authoring@example.com")
            .output()
            .expect("git runs");
        assert!(
            output.status.success(),
            "git {:?}: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let vault_root = dir.path().join(".vault");
        let store = Store::open(&vault_root).unwrap();
        (dir, store)
    }

    fn resolved_doc(root: &Path) -> DocumentRef {
        DocumentResolver::for_worktree(root)
            .resolve_existing(ExistingDocumentLookup::Stem("snapshot-plan".to_string()))
            .unwrap()
    }

    fn preimage_record(root: &Path) -> PreimageRecord {
        SnapshotReader::for_worktree(root)
            .capture_preimage(PreimageCaptureRequest {
                preimage_id: "preimage_1".to_string(),
                changeset_id: "changeset_1".to_string(),
                operation_id: "operation_1".to_string(),
                document: resolved_doc(root),
                captured_at_ms: 100,
            })
            .unwrap()
    }

    fn base_revision(document: &DocumentRef) -> RevisionToken {
        let DocumentRef::Existing { base_revision, .. } = document else {
            panic!("test document must be existing");
        };
        base_revision.clone()
    }

    #[test]
    fn unchanged_revision_snapshot_matches_base_revision() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/snapshot-plan.md", "body\n");
        let document = resolved_doc(root);
        let reader = SnapshotReader::for_worktree(root);

        let snapshot = reader.require_current_base(&document).unwrap();

        assert_eq!(snapshot.path, ".vault/plan/snapshot-plan.md");
        assert_eq!(snapshot.text, "body\n");
        assert!(snapshot.base_revision_matches);
        assert_eq!(
            snapshot.revision.as_str(),
            format!("blob:{}", snapshot.blob_hash)
        );
    }

    #[test]
    fn revision_metadata_preserves_identity_without_payload_text() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/snapshot-plan.md", "body\n");
        let document = resolved_doc(root);
        let snapshot = SnapshotReader::for_worktree(root)
            .require_current_base(&document)
            .unwrap();

        let metadata = snapshot.metadata();
        let json = serde_json::to_value(&metadata).unwrap();

        assert_eq!(metadata.document, document);
        assert_eq!(metadata.path, ".vault/plan/snapshot-plan.md");
        assert_eq!(metadata.byte_len, "body\n".len());
        assert!(metadata.revision_matches_ref);
        assert!(json.get("payload_text").is_none());
        assert!(json.get("text").is_none());
    }

    #[test]
    fn target_snapshot_hashes_whole_document_payload() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/snapshot-plan.md", "before\n");
        let document = resolved_doc(root);

        let target =
            TargetSnapshot::from_text(document.clone(), base_revision(&document), "after\n")
                .unwrap();

        assert_eq!(target.document, document);
        assert_eq!(target.payload_text, "after\n");
        assert_eq!(target.payload_bytes, "after\n".len() as i64);
        assert_eq!(target.payload_hash, blob_oid(b"after\n"));
        target.verify().unwrap();
    }

    #[test]
    fn stale_base_revision_is_detected_before_preimage_capture() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/snapshot-plan.md", "base\n");
        let document = resolved_doc(root);
        write_doc(root, ".vault/plan/snapshot-plan.md", "changed\n");
        let reader = SnapshotReader::for_worktree(root);

        let snapshot = reader.capture_existing(&document).unwrap();
        assert!(!snapshot.base_revision_matches);
        match reader.require_current_base(&document).unwrap_err() {
            SnapshotError::StaleBase {
                path,
                expected,
                actual,
            } => {
                assert_eq!(path, ".vault/plan/snapshot-plan.md");
                assert_ne!(expected, actual);
            }
            other => panic!("expected stale base, got {other:?}"),
        }
    }

    #[test]
    fn ref_snapshot_uses_committed_revision_not_dirty_worktree() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        git(root, &["init", "-b", "main", "."]);
        write_doc(root, ".vault/plan/snapshot-plan.md", "committed\n");
        git(root, &["add", "."]);
        git(root, &["commit", "-m", "init"]);
        let document = DocumentResolver::for_ref(root, "HEAD")
            .resolve_existing(ExistingDocumentLookup::Stem("snapshot-plan".to_string()))
            .unwrap();
        write_doc(root, ".vault/plan/snapshot-plan.md", "dirty\n");

        let snapshot = SnapshotReader::for_ref(root, "HEAD")
            .require_current_base(&document)
            .unwrap();

        assert_eq!(snapshot.text, "committed\n");
        assert!(snapshot.base_revision_matches);
    }

    #[test]
    fn missing_preimage_fails_loudly() {
        let (_dir, mut store) = temp_store();

        let err = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.snapshots().require_preimage("missing_preimage")
            })
            .unwrap_err();

        assert!(matches!(err, StoreError::Snapshot(detail) if detail.contains("missing preimage")));
    }

    #[test]
    fn recovery_payload_rebuilds_target_from_exact_preimage() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/snapshot-plan.md", "before\n");
        let record = preimage_record(root);
        let vault_root = root.join(".vault");
        let mut store = Store::open(&vault_root).unwrap();
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.snapshots().store_preimage(&record)
            })
            .unwrap();

        let payload = store
            .with_unit_of_work(CommandKind::CreateRollback, |uow| {
                uow.snapshots().recovery_payload("preimage_1")
            })
            .unwrap();

        assert_eq!(payload.preimage, record);
        assert_eq!(payload.rollback_target.payload_text, "before\n");
        assert_eq!(payload.rollback_target.payload_hash, blob_oid(b"before\n"));
        assert_eq!(
            payload.rollback_target.base_revision,
            payload.preimage.base_revision
        );
    }

    #[test]
    fn sqlite_snapshot_rows_preserve_exact_preimage_and_retention_metadata() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/snapshot-plan.md", "before\n");
        let record = preimage_record(root);
        let vault_root = root.join(".vault");
        let mut store = Store::open(&vault_root).unwrap();
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.snapshots().store_preimage(&record)
            })
            .unwrap();
        let path = store.path().to_path_buf();
        drop(store);

        let conn = Connection::open(&path).unwrap();
        let preimage_row: (
            String,
            String,
            String,
            String,
            String,
            String,
            i64,
            String,
            String,
        ) = conn
            .query_row(
                "SELECT document_node_id, document_path, base_revision,
                        blob_hash, payload_hash, payload_text, payload_bytes,
                        retention_record_kind, retention_record_id
                 FROM authoring_document_preimages
                 WHERE preimage_id = 'preimage_1'",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                        row.get(7)?,
                        row.get(8)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(preimage_row.0, record.document_node_id);
        assert_eq!(preimage_row.1, ".vault/plan/snapshot-plan.md");
        assert_eq!(preimage_row.2, record.base_revision.as_str());
        assert_eq!(preimage_row.3, record.blob_hash);
        assert_eq!(preimage_row.4, record.payload_hash);
        assert_eq!(preimage_row.5, "before\n");
        assert_eq!(preimage_row.6, "before\n".len() as i64);
        assert_eq!(preimage_row.7, "preimage");
        assert_eq!(preimage_row.8, "preimage_1");

        let retention_row: (String, String, i64, i64) = conn
            .query_row(
                "SELECT retention_class, content_hash, payload_bytes,
                        rollback_available
                 FROM authoring_retention_records
                 WHERE record_kind = 'preimage'
                   AND record_id = 'preimage_1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(retention_row.0, "rollback_material");
        assert_eq!(retention_row.1, record.payload_hash);
        assert_eq!(retention_row.2, "before\n".len() as i64);
        assert_eq!(retention_row.3, 1);
    }

    #[test]
    fn preimage_document_ref_mismatch_is_rejected_on_recovery() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/snapshot-plan.md", "before\n");
        let record = preimage_record(root);
        let vault_root = root.join(".vault");
        let mut store = Store::open(&vault_root).unwrap();
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.snapshots().store_preimage(&record)
            })
            .unwrap();
        let path = store.path().to_path_buf();
        drop(store);

        let tampered_document = DocumentRef::Existing {
            scope: "tampered".to_string(),
            node_id: "doc:other-plan".to_string(),
            stem: "other-plan".to_string(),
            path: ".vault/plan/other-plan.md".to_string(),
            doc_type: "plan".to_string(),
            base_revision: record.base_revision.clone(),
        };
        let conn = Connection::open(&path).unwrap();
        conn.execute(
            "UPDATE authoring_document_preimages
             SET document_ref_json = ?1
             WHERE preimage_id = 'preimage_1'",
            [serde_json::to_string(&tampered_document).unwrap()],
        )
        .unwrap();
        drop(conn);

        let mut reopened = Store::open_at(&path).unwrap();
        let err = reopened
            .with_unit_of_work(CommandKind::CreateRollback, |uow| {
                uow.snapshots().recovery_payload("preimage_1")
            })
            .unwrap_err();
        assert!(
            matches!(err, StoreError::Snapshot(detail) if detail.contains("document identity mismatch"))
        );
    }

    #[test]
    fn preimage_payload_hash_mismatch_is_rejected_on_recovery() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/snapshot-plan.md", "before\n");
        let record = preimage_record(root);
        let vault_root = root.join(".vault");
        let mut store = Store::open(&vault_root).unwrap();
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.snapshots().store_preimage(&record)
            })
            .unwrap();
        let path = store.path().to_path_buf();
        drop(store);

        let conn = Connection::open(&path).unwrap();
        conn.execute(
            "UPDATE authoring_document_preimages
             SET payload_text = 'after!\n'
             WHERE preimage_id = 'preimage_1'",
            [],
        )
        .unwrap();
        drop(conn);

        let mut reopened = Store::open_at(&path).unwrap();
        let err = reopened
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.snapshots().require_preimage("preimage_1")
            })
            .unwrap_err();
        assert!(matches!(err, StoreError::Snapshot(detail) if detail.contains("hash mismatch")));
    }

    #[test]
    fn preimage_survives_restart_with_retention_metadata() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/snapshot-plan.md", "before\n");
        let record = preimage_record(root);
        let vault_root = root.join(".vault");
        let mut store = Store::open(&vault_root).unwrap();
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.snapshots().store_preimage(&record)
            })
            .unwrap();
        let path = store.path().to_path_buf();
        drop(store);

        let mut reopened = Store::open_at(&path).unwrap();
        let (recovered, retention) = reopened
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                let recovered = uow.snapshots().require_preimage("preimage_1")?;
                let retention = uow
                    .retention()
                    .record(&RetentionRecordRef::new("preimage", "preimage_1")?)?
                    .expect("preimage retention metadata exists");
                Ok((recovered, retention))
            })
            .unwrap();

        assert_eq!(recovered.payload_text, "before\n");
        assert_eq!(recovered.payload_hash, record.payload_hash);
        assert_eq!(recovered.base_revision, record.base_revision);
        assert_eq!(retention.retention_class, RetentionClass::RollbackMaterial);
        assert!(retention.rollback_available);
        assert_eq!(retention.payload_bytes, "before\n".len() as i64);
    }
}
