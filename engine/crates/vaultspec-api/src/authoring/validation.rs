//! Proposal validation digests and stale-input checks.
//!
//! W03.P14 records backend-owned validation material for whole-document proposal
//! previews. It does not create approval records, apply jobs, routes, streams,
//! section selectors, or a public core-shaped API.
#![allow(dead_code)]

use std::collections::{BTreeMap, BTreeSet};

use ingest_struct::reader::blob_oid;
use serde::{Deserialize, Serialize};

use super::api::ChangesetOperationKind;
use super::model::{ActionEligibility, ChangesetId, CommandKind, DocumentRef, RevisionToken};
use super::operations::{
    MaterializedProposalOperation, OperationPreimageRef, ReviewDiffProjection,
};
use super::snapshots::{RevisionSnapshot, SnapshotError};
use super::store::unit_of_work::{Repository, SqliteRepository, UnitOfWork};
use super::store::{Result as StoreResult, StoreError};

const VALIDATION_SCHEMA: &str = "authoring.validation.v1";

#[derive(Debug, thiserror::Error)]
pub enum ValidationError {
    #[error("validation requires at least one materialized proposal operation")]
    EmptyOperations,
    #[error("validation operations span multiple changesets")]
    MixedChangesets,
    #[error("validation captured_at_ms must be non-negative")]
    NegativeCapturedAt,
    #[error("duplicate current revision observation for operation `{child_key}`")]
    DuplicateCurrentRevision { child_key: String },
    #[error("chunk evidence references unknown operation `{child_key}`")]
    UnknownChunkEvidenceChild { child_key: String },
    #[error("validation json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("snapshot: {0}")]
    Snapshot(#[from] SnapshotError),
}

pub type Result<T> = std::result::Result<T, ValidationError>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ValidationStatus {
    Valid,
    ValidWithWarnings,
    Invalid,
    Stale,
}

impl ValidationStatus {
    pub fn approval_ready(self) -> bool {
        matches!(self, Self::Valid | Self::ValidWithWarnings)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ValidationSeverity {
    Info,
    Warning,
    Blocking,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ValidationFindingCode {
    MissingCurrentRevision,
    CurrentDocumentMismatch,
    StaleBaseRevision,
    MissingChunkEvidence,
    ChunkEvidenceUnavailable,
    StaleChunkEvidence,
    MissingFrontmatter,
    InvalidFrontmatter,
    MaterialIntegrity,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ValidationFinding {
    pub child_key: String,
    pub code: ValidationFindingCode,
    pub severity: ValidationSeverity,
    pub message: String,
    pub document: DocumentRef,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected_revision: Option<RevisionToken>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual_revision: Option<RevisionToken>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub evidence_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CurrentRevisionObservation {
    pub child_key: String,
    pub document: DocumentRef,
    pub revision: RevisionToken,
    pub blob_hash: String,
}

impl CurrentRevisionObservation {
    pub fn from_snapshot(child_key: impl Into<String>, snapshot: &RevisionSnapshot) -> Self {
        Self {
            child_key: child_key.into(),
            document: snapshot.document.clone(),
            revision: snapshot.revision.clone(),
            blob_hash: snapshot.blob_hash.clone(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChunkEvidenceStatus {
    Current,
    Stale,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChunkValidationEvidence {
    pub child_key: String,
    pub evidence_id: String,
    pub document: DocumentRef,
    pub base_revision: RevisionToken,
    pub chunker_version: String,
    pub range: String,
    pub content_hash: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub observed_revision: Option<RevisionToken>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub observed_content_hash: Option<String>,
    pub status: ChunkEvidenceStatus,
}

impl ChunkValidationEvidence {
    fn is_stale(&self) -> bool {
        self.status == ChunkEvidenceStatus::Stale
            || self
                .observed_revision
                .as_ref()
                .is_some_and(|revision| revision != &self.base_revision)
            || self
                .observed_content_hash
                .as_ref()
                .is_some_and(|hash| hash != &self.content_hash)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ValidationTargetRevision {
    pub child_key: String,
    pub operation: ChangesetOperationKind,
    pub document: DocumentRef,
    pub base_revision: RevisionToken,
    pub current_revision: Option<RevisionToken>,
    pub target_payload_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ValidationStatusRecord {
    pub schema_version: String,
    pub changeset_id: ChangesetId,
    pub validation_digest: String,
    pub material_digest: String,
    pub status: ValidationStatus,
    pub approval_ready: bool,
    pub operation_count: usize,
    pub blocking_error_count: usize,
    pub warning_count: usize,
    pub target_revisions: Vec<ValidationTargetRevision>,
    pub chunk_evidence: Vec<ChunkValidationEvidence>,
    pub findings: Vec<ValidationFinding>,
    pub captured_at_ms: i64,
}

impl ValidationStatusRecord {
    pub fn is_fresh_for_review(&self, reviewed_validation_digest: &str) -> bool {
        self.approval_ready && self.validation_digest == reviewed_validation_digest
    }
}

pub fn submit_for_review_eligibility(
    record: Option<&ValidationStatusRecord>,
    reviewed_validation_digest: Option<&str>,
) -> ActionEligibility {
    let Some(record) = record else {
        return ActionEligibility::denied(
            CommandKind::SubmitForReview,
            "proposal has no validation digest",
        );
    };
    let Some(reviewed_validation_digest) = reviewed_validation_digest else {
        return ActionEligibility::denied(
            CommandKind::SubmitForReview,
            "review request must name the validation digest it was prepared from",
        );
    };
    if record.validation_digest != reviewed_validation_digest {
        return ActionEligibility::denied(
            CommandKind::SubmitForReview,
            "validation digest is stale for the reviewed proposal material",
        );
    }
    if !record.status.approval_ready() {
        return ActionEligibility::denied(
            CommandKind::SubmitForReview,
            format!(
                "validation status `{}` is not reviewable",
                status_as_str(record.status)
            ),
        );
    }
    ActionEligibility::allowed(CommandKind::SubmitForReview)
}

pub fn validate_changeset_material(
    operations: &[MaterializedProposalOperation],
    current_revisions: &[CurrentRevisionObservation],
    chunk_evidence: &[ChunkValidationEvidence],
    captured_at_ms: i64,
) -> Result<ValidationStatusRecord> {
    if operations.is_empty() {
        return Err(ValidationError::EmptyOperations);
    }
    if captured_at_ms < 0 {
        return Err(ValidationError::NegativeCapturedAt);
    }

    let changeset_id = operations[0].changeset_id.clone();
    if operations
        .iter()
        .any(|operation| operation.changeset_id != changeset_id)
    {
        return Err(ValidationError::MixedChangesets);
    }

    let current_by_child = current_revision_map(current_revisions)?;
    let chunk_by_child = chunk_evidence_map(chunk_evidence);
    validate_chunk_children(operations, chunk_evidence)?;
    let mut findings = Vec::new();
    let mut target_revisions = Vec::with_capacity(operations.len());
    let normalized_chunk_evidence = normalized_chunk_evidence(chunk_evidence);

    for operation in sorted_operations(operations) {
        validate_operation_integrity(operation, &mut findings);
        let current = current_by_child.get(operation.child_key.as_str()).copied();
        validate_current_revision(operation, current, &mut findings);
        validate_frontmatter(operation, &mut findings);
        validate_chunk_evidence(
            operation,
            chunk_by_child.get(operation.child_key.as_str()),
            &mut findings,
        );
        target_revisions.push(ValidationTargetRevision {
            child_key: operation.child_key.clone(),
            operation: operation.operation,
            document: operation.target_snapshot.document.clone(),
            base_revision: operation.target_snapshot.base_revision.clone(),
            current_revision: current.map(|observation| observation.revision.clone()),
            target_payload_hash: operation.target_snapshot.payload_hash.clone(),
        });
    }

    let status = validation_status(&findings);
    let blocking_error_count = findings
        .iter()
        .filter(|finding| finding.severity == ValidationSeverity::Blocking)
        .count();
    let warning_count = findings
        .iter()
        .filter(|finding| finding.severity == ValidationSeverity::Warning)
        .count();
    let material_digest = material_digest(&changeset_id, operations)?;
    let validation_digest = validation_digest(
        &changeset_id,
        &material_digest,
        status,
        &target_revisions,
        &normalized_chunk_evidence,
        &findings,
    )?;

    Ok(ValidationStatusRecord {
        schema_version: VALIDATION_SCHEMA.to_string(),
        changeset_id,
        validation_digest,
        material_digest,
        status,
        approval_ready: status.approval_ready(),
        operation_count: operations.len(),
        blocking_error_count,
        warning_count,
        target_revisions,
        chunk_evidence: normalized_chunk_evidence,
        findings,
        captured_at_ms,
    })
}

fn current_revision_map(
    current_revisions: &[CurrentRevisionObservation],
) -> Result<BTreeMap<&str, &CurrentRevisionObservation>> {
    let mut by_child = BTreeMap::new();
    for observation in current_revisions {
        if by_child
            .insert(observation.child_key.as_str(), observation)
            .is_some()
        {
            return Err(ValidationError::DuplicateCurrentRevision {
                child_key: observation.child_key.clone(),
            });
        }
    }
    Ok(by_child)
}

fn chunk_evidence_map(
    chunk_evidence: &[ChunkValidationEvidence],
) -> BTreeMap<&str, Vec<&ChunkValidationEvidence>> {
    let mut by_child: BTreeMap<&str, Vec<&ChunkValidationEvidence>> = BTreeMap::new();
    for evidence in chunk_evidence {
        by_child
            .entry(evidence.child_key.as_str())
            .or_default()
            .push(evidence);
    }
    for entries in by_child.values_mut() {
        entries.sort_by(|left, right| left.evidence_id.cmp(&right.evidence_id));
    }
    by_child
}

fn validate_chunk_children(
    operations: &[MaterializedProposalOperation],
    chunk_evidence: &[ChunkValidationEvidence],
) -> Result<()> {
    let operation_children = operations
        .iter()
        .map(|operation| operation.child_key.as_str())
        .collect::<BTreeSet<_>>();
    for evidence in chunk_evidence {
        if !operation_children.contains(evidence.child_key.as_str()) {
            return Err(ValidationError::UnknownChunkEvidenceChild {
                child_key: evidence.child_key.clone(),
            });
        }
    }
    Ok(())
}

fn normalized_chunk_evidence(
    chunk_evidence: &[ChunkValidationEvidence],
) -> Vec<ChunkValidationEvidence> {
    let mut normalized = chunk_evidence.to_vec();
    normalized.sort_by(|left, right| {
        left.child_key
            .cmp(&right.child_key)
            .then_with(|| left.evidence_id.cmp(&right.evidence_id))
            .then_with(|| left.range.cmp(&right.range))
    });
    normalized
}

fn sorted_operations(
    operations: &[MaterializedProposalOperation],
) -> Vec<&MaterializedProposalOperation> {
    let mut sorted = operations.iter().collect::<Vec<_>>();
    sorted.sort_by(|left, right| left.child_key.cmp(&right.child_key));
    sorted
}

fn validate_operation_integrity(
    operation: &MaterializedProposalOperation,
    findings: &mut Vec<ValidationFinding>,
) {
    if let Err(err) = operation.target_snapshot.verify() {
        findings.push(finding(
            operation,
            ValidationFindingCode::MaterialIntegrity,
            ValidationSeverity::Blocking,
            format!("target snapshot integrity failed: {err}"),
            None,
            None,
            None,
        ));
    }
    if operation.target_snapshot.document != operation.base.document
        || operation.target_snapshot.base_revision != operation.base.revision
        || operation.review_diff.document != operation.target_snapshot.document
        || operation.review_diff.target_payload_hash != operation.target_snapshot.payload_hash
        || operation.review_diff.base_revision != operation.base.revision
        || operation.review_diff.base_blob_hash != operation.base.blob_hash
        || operation.review_diff.base_bytes != operation.base.byte_len
        || operation.review_diff.target_bytes != operation.target_snapshot.payload_bytes
        || operation.review_diff.changed
            != (operation.review_diff.base_blob_hash != operation.target_snapshot.payload_hash)
    {
        findings.push(finding(
            operation,
            ValidationFindingCode::MaterialIntegrity,
            ValidationSeverity::Blocking,
            "review material does not match the operation target snapshot".to_string(),
            Some(operation.base.revision.clone()),
            Some(operation.target_snapshot.base_revision.clone()),
            None,
        ));
    }
    if operation.preimage.changeset_id != operation.changeset_id.as_str()
        || operation.preimage.base_revision != operation.base.revision
        || operation.preimage.payload_hash != operation.base.blob_hash
        || operation.preimage.payload_hash != operation.review_diff.base_blob_hash
        || operation.preimage.payload_bytes != operation.base.byte_len as i64
    {
        findings.push(finding(
            operation,
            ValidationFindingCode::MaterialIntegrity,
            ValidationSeverity::Blocking,
            "preimage metadata does not match the reviewed base material".to_string(),
            Some(operation.base.revision.clone()),
            Some(operation.preimage.base_revision.clone()),
            Some(operation.preimage.preimage_id.clone()),
        ));
    }
}

fn validate_current_revision(
    operation: &MaterializedProposalOperation,
    current: Option<&CurrentRevisionObservation>,
    findings: &mut Vec<ValidationFinding>,
) {
    let Some(current) = current else {
        findings.push(finding(
            operation,
            ValidationFindingCode::MissingCurrentRevision,
            ValidationSeverity::Blocking,
            "validation requires a fresh current revision observation".to_string(),
            Some(operation.target_snapshot.base_revision.clone()),
            None,
            None,
        ));
        return;
    };

    if current.document != operation.target_snapshot.document {
        findings.push(finding(
            operation,
            ValidationFindingCode::CurrentDocumentMismatch,
            ValidationSeverity::Blocking,
            "current revision observation targets a different document".to_string(),
            Some(operation.target_snapshot.base_revision.clone()),
            Some(current.revision.clone()),
            None,
        ));
        return;
    }

    if current.revision != operation.target_snapshot.base_revision {
        findings.push(finding(
            operation,
            ValidationFindingCode::StaleBaseRevision,
            ValidationSeverity::Blocking,
            "target base revision changed after proposal materialization".to_string(),
            Some(operation.target_snapshot.base_revision.clone()),
            Some(current.revision.clone()),
            None,
        ));
    }
}

fn validate_frontmatter(
    operation: &MaterializedProposalOperation,
    findings: &mut Vec<ValidationFinding>,
) {
    match frontmatter_block(&operation.target_snapshot.payload_text) {
        FrontmatterCheck::Missing => findings.push(finding(
            operation,
            ValidationFindingCode::MissingFrontmatter,
            ValidationSeverity::Warning,
            "target document has no frontmatter block; core conformance must validate metadata before apply".to_string(),
            None,
            None,
            None,
        )),
        FrontmatterCheck::Invalid(reason) => findings.push(finding(
            operation,
            ValidationFindingCode::InvalidFrontmatter,
            ValidationSeverity::Blocking,
            reason,
            None,
            None,
            None,
        )),
        FrontmatterCheck::Present(lines) => validate_frontmatter_lines(operation, &lines, findings),
    }
}

fn validate_chunk_evidence(
    operation: &MaterializedProposalOperation,
    evidence: Option<&Vec<&ChunkValidationEvidence>>,
    findings: &mut Vec<ValidationFinding>,
) {
    let Some(entries) = evidence else {
        findings.push(finding(
            operation,
            ValidationFindingCode::MissingChunkEvidence,
            ValidationSeverity::Warning,
            "chunk evidence is unavailable in the whole-document walking skeleton".to_string(),
            None,
            None,
            None,
        ));
        return;
    };

    for entry in entries {
        if entry.document != operation.target_snapshot.document
            || entry.base_revision != operation.target_snapshot.base_revision
        {
            findings.push(finding(
                operation,
                ValidationFindingCode::StaleChunkEvidence,
                ValidationSeverity::Blocking,
                "chunk evidence does not match the operation document and base revision"
                    .to_string(),
                Some(operation.target_snapshot.base_revision.clone()),
                Some(entry.base_revision.clone()),
                Some(entry.evidence_id.clone()),
            ));
        } else if entry.status == ChunkEvidenceStatus::Unavailable {
            findings.push(finding(
                operation,
                ValidationFindingCode::ChunkEvidenceUnavailable,
                ValidationSeverity::Warning,
                "chunk evidence was explicitly marked unavailable".to_string(),
                Some(entry.base_revision.clone()),
                entry.observed_revision.clone(),
                Some(entry.evidence_id.clone()),
            ));
        } else if entry.is_stale() {
            findings.push(finding(
                operation,
                ValidationFindingCode::StaleChunkEvidence,
                ValidationSeverity::Blocking,
                "chunk evidence changed since the proposal base revision".to_string(),
                Some(entry.base_revision.clone()),
                entry.observed_revision.clone(),
                Some(entry.evidence_id.clone()),
            ));
        }
    }
}

enum FrontmatterCheck {
    Missing,
    Invalid(String),
    Present(Vec<String>),
}

fn frontmatter_block(text: &str) -> FrontmatterCheck {
    let Some(first_line) = text.lines().next() else {
        return FrontmatterCheck::Missing;
    };
    let first = first_line.trim_end_matches('\r');
    if first != "---" {
        if first.starts_with("---") {
            return FrontmatterCheck::Invalid(
                "frontmatter opening fence must be exactly `---`".to_string(),
            );
        }
        return FrontmatterCheck::Missing;
    }

    let mut lines = Vec::new();
    for line in text.lines().skip(1) {
        let line = line.trim_end_matches('\r');
        if line == "---" {
            return FrontmatterCheck::Present(lines);
        }
        lines.push(line.to_string());
    }
    FrontmatterCheck::Invalid("frontmatter opening fence has no closing `---` fence".to_string())
}

fn validate_frontmatter_lines(
    operation: &MaterializedProposalOperation,
    lines: &[String],
    findings: &mut Vec<ValidationFinding>,
) {
    let mut saw_field = false;
    let mut list_parents = BTreeSet::new();
    for line in lines {
        if line.contains('\t') {
            findings.push(finding(
                operation,
                ValidationFindingCode::InvalidFrontmatter,
                ValidationSeverity::Blocking,
                "frontmatter must not contain tab indentation".to_string(),
                None,
                None,
                None,
            ));
            return;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some(item) = trimmed.strip_prefix("- ") {
            if list_parents.is_empty() || item.trim().is_empty() || item.trim().starts_with('-') {
                findings.push(finding(
                    operation,
                    ValidationFindingCode::InvalidFrontmatter,
                    ValidationSeverity::Blocking,
                    "frontmatter list entries must belong to a key and be non-empty".to_string(),
                    None,
                    None,
                    None,
                ));
                return;
            }
            continue;
        }
        let Some((key, value)) = trimmed.split_once(':') else {
            findings.push(finding(
                operation,
                ValidationFindingCode::InvalidFrontmatter,
                ValidationSeverity::Blocking,
                "frontmatter field must contain a `:` separator".to_string(),
                None,
                None,
                None,
            ));
            return;
        };
        if key.trim().is_empty() || key.contains(' ') {
            findings.push(finding(
                operation,
                ValidationFindingCode::InvalidFrontmatter,
                ValidationSeverity::Blocking,
                "frontmatter keys must be non-empty single tokens".to_string(),
                None,
                None,
                None,
            ));
            return;
        }
        saw_field = true;
        if value.trim().is_empty() {
            list_parents.insert(key.to_string());
        }
    }
    if !saw_field {
        findings.push(finding(
            operation,
            ValidationFindingCode::MissingFrontmatter,
            ValidationSeverity::Warning,
            "frontmatter block is empty; core conformance must validate metadata before apply"
                .to_string(),
            None,
            None,
            None,
        ));
        return;
    }
    let yaml = lines.join("\n");
    if let Err(err) = serde_yaml::from_str::<serde_yaml::Value>(&yaml) {
        findings.push(finding(
            operation,
            ValidationFindingCode::InvalidFrontmatter,
            ValidationSeverity::Blocking,
            format!("frontmatter is not valid YAML: {err}"),
            None,
            None,
            None,
        ));
    }
}

fn validation_status(findings: &[ValidationFinding]) -> ValidationStatus {
    if findings.iter().any(|finding| {
        finding.severity == ValidationSeverity::Blocking
            && matches!(
                finding.code,
                ValidationFindingCode::StaleBaseRevision
                    | ValidationFindingCode::StaleChunkEvidence
            )
    }) {
        return ValidationStatus::Stale;
    }
    if findings
        .iter()
        .any(|finding| finding.severity == ValidationSeverity::Blocking)
    {
        return ValidationStatus::Invalid;
    }
    if findings
        .iter()
        .any(|finding| finding.severity == ValidationSeverity::Warning)
    {
        return ValidationStatus::ValidWithWarnings;
    }
    ValidationStatus::Valid
}

fn finding(
    operation: &MaterializedProposalOperation,
    code: ValidationFindingCode,
    severity: ValidationSeverity,
    message: String,
    expected_revision: Option<RevisionToken>,
    actual_revision: Option<RevisionToken>,
    evidence_id: Option<String>,
) -> ValidationFinding {
    ValidationFinding {
        child_key: operation.child_key.clone(),
        code,
        severity,
        message,
        document: operation.target_snapshot.document.clone(),
        expected_revision,
        actual_revision,
        evidence_id,
    }
}

#[derive(Serialize)]
struct MaterialDigestInput<'a> {
    schema_version: &'static str,
    changeset_id: &'a ChangesetId,
    operations: Vec<OperationDigestInput<'a>>,
}

#[derive(Serialize)]
struct OperationDigestInput<'a> {
    child_key: &'a str,
    operation: ChangesetOperationKind,
    document: &'a DocumentRef,
    base_revision: &'a RevisionToken,
    base_blob_hash: &'a str,
    base_bytes: usize,
    target_payload_hash: &'a str,
    target_payload_bytes: i64,
    preimage: &'a OperationPreimageRef,
    review_diff: &'a ReviewDiffProjection,
}

#[derive(Serialize)]
struct ValidationDigestInput<'a> {
    schema_version: &'static str,
    changeset_id: &'a ChangesetId,
    material_digest: &'a str,
    status: ValidationStatus,
    target_revisions: &'a [ValidationTargetRevision],
    chunk_evidence: &'a [ChunkValidationEvidence],
    findings: &'a [ValidationFinding],
}

fn material_digest(
    changeset_id: &ChangesetId,
    operations: &[MaterializedProposalOperation],
) -> Result<String> {
    let operations = sorted_operations(operations)
        .into_iter()
        .map(|operation| OperationDigestInput {
            child_key: operation.child_key.as_str(),
            operation: operation.operation,
            document: &operation.target_snapshot.document,
            base_revision: &operation.target_snapshot.base_revision,
            base_blob_hash: operation.review_diff.base_blob_hash.as_str(),
            base_bytes: operation.base.byte_len,
            target_payload_hash: operation.target_snapshot.payload_hash.as_str(),
            target_payload_bytes: operation.target_snapshot.payload_bytes,
            preimage: &operation.preimage,
            review_diff: &operation.review_diff,
        })
        .collect();
    digest_json(
        "material",
        &MaterialDigestInput {
            schema_version: VALIDATION_SCHEMA,
            changeset_id,
            operations,
        },
    )
}

fn validation_digest(
    changeset_id: &ChangesetId,
    material_digest: &str,
    status: ValidationStatus,
    target_revisions: &[ValidationTargetRevision],
    chunk_evidence: &[ChunkValidationEvidence],
    findings: &[ValidationFinding],
) -> Result<String> {
    digest_json(
        "validation",
        &ValidationDigestInput {
            schema_version: VALIDATION_SCHEMA,
            changeset_id,
            material_digest,
            status,
            target_revisions,
            chunk_evidence,
            findings,
        },
    )
}

fn digest_json<T: Serialize>(prefix: &str, value: &T) -> Result<String> {
    let bytes = serde_json::to_vec(value)?;
    Ok(format!("{prefix}:{}", blob_oid(&bytes)))
}

pub struct ValidationRepository<'repo, 'conn> {
    repo: SqliteRepository<'repo, 'conn>,
}

impl<'conn> UnitOfWork<'conn> {
    pub fn validations<'repo>(&'repo self) -> ValidationRepository<'repo, 'conn> {
        ValidationRepository {
            repo: self.repository("authoring_validation_records"),
        }
    }
}

impl ValidationRepository<'_, '_> {
    pub fn store_record(&self, record: &ValidationStatusRecord) -> StoreResult<()> {
        validate_record_for_store(record)?;
        let target_revisions_json = serde_json::to_string(&record.target_revisions)
            .map_err(|err| StoreError::Validation(err.to_string()))?;
        let findings_json = serde_json::to_string(&record.findings)
            .map_err(|err| StoreError::Validation(err.to_string()))?;
        let record_json =
            serde_json::to_string(record).map_err(|err| StoreError::Validation(err.to_string()))?;
        self.repo.execute(
            "INSERT INTO authoring_validation_records
                (validation_digest, changeset_id, status, approval_ready,
                 material_digest, operation_count, blocking_error_count, warning_count,
                 target_revisions_json, findings_json, record_json, captured_at_ms)
             VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT(validation_digest) DO UPDATE SET
                changeset_id = excluded.changeset_id,
                status = excluded.status,
                approval_ready = excluded.approval_ready,
                material_digest = excluded.material_digest,
                operation_count = excluded.operation_count,
                blocking_error_count = excluded.blocking_error_count,
                warning_count = excluded.warning_count,
                target_revisions_json = excluded.target_revisions_json,
                findings_json = excluded.findings_json,
                record_json = excluded.record_json,
                captured_at_ms = excluded.captured_at_ms",
            rusqlite::params![
                record.validation_digest.as_str(),
                record.changeset_id.as_str(),
                status_as_str(record.status),
                bool_int(record.approval_ready),
                record.material_digest.as_str(),
                record.operation_count as i64,
                record.blocking_error_count as i64,
                record.warning_count as i64,
                target_revisions_json.as_str(),
                findings_json.as_str(),
                record_json.as_str(),
                record.captured_at_ms,
            ],
        )?;
        Ok(())
    }

    pub fn record_by_digest(
        &self,
        validation_digest: &str,
    ) -> StoreResult<Option<ValidationStatusRecord>> {
        validate_non_empty_store("validation_digest", validation_digest)?;
        self.repo
            .query_optional(
                "SELECT record_json
                 FROM authoring_validation_records
                 WHERE validation_digest = ?1",
                [validation_digest],
                read_validation_record,
            )?
            .map(validate_loaded_record)
            .transpose()
    }

    pub fn latest_for_changeset(
        &self,
        changeset_id: &ChangesetId,
    ) -> StoreResult<Option<ValidationStatusRecord>> {
        self.repo
            .query_optional(
                "SELECT record_json
                 FROM authoring_validation_records
                 WHERE changeset_id = ?1
                 ORDER BY seq DESC
                 LIMIT 1",
                [changeset_id.as_str()],
                read_validation_record,
            )?
            .map(validate_loaded_record)
            .transpose()
    }
}

fn read_validation_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<ValidationStatusRecord> {
    let record_json: String = row.get(0)?;
    serde_json::from_str(&record_json).map_err(to_sql_error)
}

fn validate_loaded_record(record: ValidationStatusRecord) -> StoreResult<ValidationStatusRecord> {
    validate_record_for_store(&record)?;
    Ok(record)
}

fn validate_record_for_store(record: &ValidationStatusRecord) -> StoreResult<()> {
    validate_non_empty_store("validation_digest", &record.validation_digest)?;
    validate_non_empty_store("material_digest", &record.material_digest)?;
    if record.schema_version != VALIDATION_SCHEMA {
        return Err(StoreError::Validation(format!(
            "unsupported validation schema `{}`",
            record.schema_version
        )));
    }
    if record.captured_at_ms < 0 {
        return Err(StoreError::Validation(
            "captured_at_ms must be non-negative".to_string(),
        ));
    }
    if record.operation_count != record.target_revisions.len() {
        return Err(StoreError::Validation(
            "operation_count must match target_revisions length".to_string(),
        ));
    }
    let blocking = record
        .findings
        .iter()
        .filter(|finding| finding.severity == ValidationSeverity::Blocking)
        .count();
    let warnings = record
        .findings
        .iter()
        .filter(|finding| finding.severity == ValidationSeverity::Warning)
        .count();
    if blocking != record.blocking_error_count || warnings != record.warning_count {
        return Err(StoreError::Validation(
            "finding counts do not match severities".to_string(),
        ));
    }
    if record.approval_ready != record.status.approval_ready() {
        return Err(StoreError::Validation(
            "approval_ready does not match validation status".to_string(),
        ));
    }
    let recomputed = validation_digest(
        &record.changeset_id,
        &record.material_digest,
        record.status,
        &record.target_revisions,
        &record.chunk_evidence,
        &record.findings,
    )
    .map_err(|err| StoreError::Validation(err.to_string()))?;
    if recomputed != record.validation_digest {
        return Err(StoreError::Validation(
            "validation_digest does not match record body".to_string(),
        ));
    }
    Ok(())
}

fn validate_non_empty_store(field: &str, value: &str) -> StoreResult<()> {
    if value.trim().is_empty() {
        return Err(StoreError::Validation(format!("{field} cannot be empty")));
    }
    Ok(())
}

fn bool_int(value: bool) -> i64 {
    if value { 1 } else { 0 }
}

fn status_as_str(status: ValidationStatus) -> &'static str {
    match status {
        ValidationStatus::Valid => "valid",
        ValidationStatus::ValidWithWarnings => "valid_with_warnings",
        ValidationStatus::Invalid => "invalid",
        ValidationStatus::Stale => "stale",
    }
}

fn to_sql_error(error: impl std::error::Error + Send + Sync + 'static) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;
    use crate::authoring::api::{
        ChangesetChildOperationDraft, DraftMode, DraftMutation, TargetRevisionFence,
    };
    use crate::authoring::documents::{DocumentResolver, ExistingDocumentLookup};
    use crate::authoring::operations::MaterializedProposalOperation;
    use crate::authoring::snapshots::{PreimageCaptureRequest, PreimageRecord, SnapshotReader};
    use crate::authoring::store::Store;

    fn write_doc(root: &Path, rel: &str, body: &str) {
        let path = root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    fn resolved_doc(root: &Path) -> DocumentRef {
        DocumentResolver::for_worktree(root)
            .resolve_existing(ExistingDocumentLookup::Stem("validation-plan".to_string()))
            .unwrap()
    }

    fn base_snapshot(root: &Path) -> RevisionSnapshot {
        SnapshotReader::for_worktree(root)
            .require_current_base(&resolved_doc(root))
            .unwrap()
    }

    fn base_revision(document: &DocumentRef) -> RevisionToken {
        let DocumentRef::Existing { base_revision, .. } = document else {
            panic!("test document must be existing");
        };
        base_revision.clone()
    }

    fn draft_for(document: DocumentRef, body: &str) -> ChangesetChildOperationDraft {
        let revision = base_revision(&document);
        ChangesetChildOperationDraft {
            child_key: "child_1".to_string(),
            operation: ChangesetOperationKind::ReplaceBody,
            target: TargetRevisionFence {
                document,
                base_revision: Some(revision.clone()),
                current_revision: Some(revision),
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: body.to_string(),
                frontmatter: None,
                new_stem: None,
                section_selector: None,
                plan_step: None,
            },
        }
    }

    fn preimage_record(root: &Path) -> PreimageRecord {
        SnapshotReader::for_worktree(root)
            .capture_preimage(PreimageCaptureRequest {
                preimage_id: "preimage_1".to_string(),
                changeset_id: "changeset_1".to_string(),
                operation_id: "child_1".to_string(),
                document: resolved_doc(root),
                captured_at_ms: 100,
            })
            .unwrap()
    }

    fn changeset_id() -> ChangesetId {
        ChangesetId::new("changeset_1").unwrap()
    }

    fn materialized(root: &Path, target_body: &str) -> MaterializedProposalOperation {
        let snapshot = base_snapshot(root);
        let draft = draft_for(snapshot.document.clone(), target_body);
        let preimage = preimage_record(root);
        MaterializedProposalOperation::materialize_replace_body(
            &changeset_id(),
            draft,
            &snapshot,
            &preimage,
        )
        .unwrap()
    }

    fn current_observation(
        child_key: &str,
        snapshot: &RevisionSnapshot,
    ) -> CurrentRevisionObservation {
        CurrentRevisionObservation::from_snapshot(child_key, snapshot)
    }

    fn current_chunk(operation: &MaterializedProposalOperation) -> ChunkValidationEvidence {
        ChunkValidationEvidence {
            child_key: operation.child_key.clone(),
            evidence_id: "chunk_evidence_1".to_string(),
            document: operation.target_snapshot.document.clone(),
            base_revision: operation.target_snapshot.base_revision.clone(),
            chunker_version: "whole_document_v1".to_string(),
            range: "bytes:0..all".to_string(),
            content_hash: operation.review_diff.base_blob_hash.clone(),
            observed_revision: Some(operation.target_snapshot.base_revision.clone()),
            observed_content_hash: Some(operation.review_diff.base_blob_hash.clone()),
            status: ChunkEvidenceStatus::Current,
        }
    }

    fn valid_target_body() -> &'static str {
        "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\n---\n\n# Plan\n\nnew body\n"
    }

    #[test]
    fn valid_proposal_records_stable_validation_digest() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(
            root,
            ".vault/plan/validation-plan.md",
            "---\ntags:\n  - '#plan'\n---\n\nold body\n",
        );
        let snapshot = base_snapshot(root);
        let operation = materialized(root, valid_target_body());
        let current = current_observation("child_1", &snapshot);
        let chunk = current_chunk(&operation);

        let first = validate_changeset_material(
            std::slice::from_ref(&operation),
            std::slice::from_ref(&current),
            std::slice::from_ref(&chunk),
            200,
        )
        .unwrap();
        let second = validate_changeset_material(&[operation], &[current], &[chunk], 300).unwrap();

        assert_eq!(first.status, ValidationStatus::Valid);
        assert!(first.approval_ready);
        assert!(first.findings.is_empty());
        assert_eq!(first.validation_digest, second.validation_digest);
        assert_eq!(first.material_digest, second.material_digest);
        assert_eq!(first.operation_count, 1);
        assert_eq!(first.target_revisions[0].child_key, "child_1");
    }

    #[test]
    fn changed_target_payload_changes_material_and_validation_digest() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(
            root,
            ".vault/plan/validation-plan.md",
            "---\ntags:\n  - '#plan'\n---\n\nold body\n",
        );
        let snapshot = base_snapshot(root);
        let first_operation = materialized(root, valid_target_body());
        let second_operation = materialized(
            root,
            "---\ntags:\n  - '#plan'\n---\n\n# Plan\n\nanother body\n",
        );
        let first_chunk = current_chunk(&first_operation);
        let second_chunk = current_chunk(&second_operation);
        let current = current_observation("child_1", &snapshot);

        let first = validate_changeset_material(
            &[first_operation],
            std::slice::from_ref(&current),
            &[first_chunk],
            200,
        )
        .unwrap();
        let second =
            validate_changeset_material(&[second_operation], &[current], &[second_chunk], 200)
                .unwrap();

        assert_ne!(first.material_digest, second.material_digest);
        assert_ne!(first.validation_digest, second.validation_digest);
    }

    #[test]
    fn reviewed_diff_material_is_bound_to_the_material_digest() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(
            root,
            ".vault/plan/validation-plan.md",
            "---\ntags:\n  - '#plan'\n---\n\nold body\n",
        );
        let snapshot = base_snapshot(root);
        let operation = materialized(root, valid_target_body());
        let current = current_observation("child_1", &snapshot);
        let chunk = current_chunk(&operation);
        let mut misleading_operation = operation.clone();
        misleading_operation.review_diff.hunks.clear();

        let reviewed = validate_changeset_material(
            &[operation],
            std::slice::from_ref(&current),
            std::slice::from_ref(&chunk),
            200,
        )
        .unwrap();
        let misleading =
            validate_changeset_material(&[misleading_operation], &[current], &[chunk], 200)
                .unwrap();

        assert_ne!(reviewed.material_digest, misleading.material_digest);
        assert_ne!(reviewed.validation_digest, misleading.validation_digest);
    }

    #[test]
    fn preimage_metadata_mismatch_is_a_blocking_material_failure() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/validation-plan.md", "base\n");
        let snapshot = base_snapshot(root);
        let mut operation = materialized(root, valid_target_body());
        operation.preimage.payload_bytes = 1;
        let current = current_observation("child_1", &snapshot);
        let chunk = current_chunk(&operation);

        let record = validate_changeset_material(&[operation], &[current], &[chunk], 200).unwrap();

        assert_eq!(record.status, ValidationStatus::Invalid);
        assert!(!record.approval_ready);
        assert!(record.findings.iter().any(|finding| {
            finding.code == ValidationFindingCode::MaterialIntegrity
                && finding.severity == ValidationSeverity::Blocking
                && finding.message.contains("preimage metadata")
        }));
    }

    #[test]
    fn invalid_frontmatter_is_a_blocking_validation_failure() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/validation-plan.md", "base\n");
        let snapshot = base_snapshot(root);
        let operation = materialized(root, "---\ntags: [unterminated\n---\n\nbody\n");
        let current = current_observation("child_1", &snapshot);
        let chunk = current_chunk(&operation);

        let record = validate_changeset_material(&[operation], &[current], &[chunk], 200).unwrap();

        assert_eq!(record.status, ValidationStatus::Invalid);
        assert!(!record.approval_ready);
        assert_eq!(record.blocking_error_count, 1);
        assert!(record.findings.iter().any(|finding| {
            finding.code == ValidationFindingCode::InvalidFrontmatter
                && finding.severity == ValidationSeverity::Blocking
        }));
    }

    #[test]
    fn current_chunk_evidence_is_digest_bound_and_identity_checked() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/validation-plan.md", "base\n");
        let snapshot = base_snapshot(root);
        let operation = materialized(root, valid_target_body());
        let current = current_observation("child_1", &snapshot);
        let chunk = current_chunk(&operation);
        let mut changed_chunk = chunk.clone();
        changed_chunk.range = "bytes:0..4".to_string();
        let mut wrong_document_chunk = chunk.clone();
        wrong_document_chunk.document = DocumentRef::Existing {
            scope: "worktree".to_string(),
            node_id: "doc:other".to_string(),
            stem: "other".to_string(),
            path: ".vault/plan/other.md".to_string(),
            doc_type: "plan".to_string(),
            base_revision: operation.target_snapshot.base_revision.clone(),
        };

        let first = validate_changeset_material(
            std::slice::from_ref(&operation),
            std::slice::from_ref(&current),
            &[chunk],
            200,
        )
        .unwrap();
        let changed = validate_changeset_material(
            std::slice::from_ref(&operation),
            std::slice::from_ref(&current),
            &[changed_chunk],
            200,
        )
        .unwrap();
        let wrong =
            validate_changeset_material(&[operation], &[current], &[wrong_document_chunk], 200)
                .unwrap();

        assert_ne!(first.validation_digest, changed.validation_digest);
        assert_eq!(wrong.status, ValidationStatus::Stale);
        assert!(!wrong.approval_ready);
        assert!(wrong.findings.iter().any(|finding| {
            finding.code == ValidationFindingCode::StaleChunkEvidence
                && finding.severity == ValidationSeverity::Blocking
        }));
    }

    #[test]
    fn missing_chunk_evidence_is_warning_only_for_whole_document_skeleton() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/validation-plan.md", "base\n");
        let snapshot = base_snapshot(root);
        let operation = materialized(root, valid_target_body());
        let current = current_observation("child_1", &snapshot);

        let record = validate_changeset_material(&[operation], &[current], &[], 200).unwrap();

        assert_eq!(record.status, ValidationStatus::ValidWithWarnings);
        assert!(record.approval_ready);
        assert_eq!(record.warning_count, 1);
        assert!(record.findings.iter().any(|finding| {
            finding.code == ValidationFindingCode::MissingChunkEvidence
                && finding.severity == ValidationSeverity::Warning
        }));
    }

    #[test]
    fn stale_chunk_evidence_blocks_review_readiness() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/validation-plan.md", "base\n");
        let snapshot = base_snapshot(root);
        let operation = materialized(root, valid_target_body());
        let current = current_observation("child_1", &snapshot);
        let mut chunk = current_chunk(&operation);
        chunk.status = ChunkEvidenceStatus::Stale;
        chunk.observed_content_hash = Some("different".to_string());

        let record = validate_changeset_material(&[operation], &[current], &[chunk], 200).unwrap();

        assert_eq!(record.status, ValidationStatus::Stale);
        assert!(!record.approval_ready);
        assert!(record.findings.iter().any(|finding| {
            finding.code == ValidationFindingCode::StaleChunkEvidence
                && finding.severity == ValidationSeverity::Blocking
        }));
    }

    #[test]
    fn changed_base_revision_blocks_review_readiness_as_stale() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/validation-plan.md", "base\n");
        let operation = materialized(root, valid_target_body());
        write_doc(
            root,
            ".vault/plan/validation-plan.md",
            "changed outside proposal\n",
        );
        let changed_snapshot = SnapshotReader::for_worktree(root)
            .capture_existing(&operation.target_snapshot.document)
            .unwrap();
        let current = current_observation("child_1", &changed_snapshot);
        let chunk = current_chunk(&operation);

        let record = validate_changeset_material(&[operation], &[current], &[chunk], 200).unwrap();

        assert_eq!(record.status, ValidationStatus::Stale);
        assert!(!record.approval_ready);
        let finding = record
            .findings
            .iter()
            .find(|finding| finding.code == ValidationFindingCode::StaleBaseRevision)
            .expect("stale base revision finding is recorded");
        assert_eq!(
            finding.expected_revision.as_ref(),
            Some(&operation_base_revision(finding))
        );
        assert_ne!(finding.expected_revision, finding.actual_revision);
    }

    #[test]
    fn missing_current_revision_is_a_blocking_failure() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/validation-plan.md", "base\n");
        let operation = materialized(root, valid_target_body());
        let chunk = current_chunk(&operation);

        let record = validate_changeset_material(&[operation], &[], &[chunk], 200).unwrap();

        assert_eq!(record.status, ValidationStatus::Invalid);
        assert!(!record.approval_ready);
        assert_eq!(record.blocking_error_count, 1);
        assert!(record.findings.iter().any(|finding| {
            finding.code == ValidationFindingCode::MissingCurrentRevision
                && finding.severity == ValidationSeverity::Blocking
        }));
    }

    #[test]
    fn review_eligibility_requires_matching_fresh_digest() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/validation-plan.md", "base\n");
        let snapshot = base_snapshot(root);
        let operation = materialized(root, valid_target_body());
        let current = current_observation("child_1", &snapshot);
        let record = validate_changeset_material(&[operation], &[current], &[], 200).unwrap();

        let allowed = submit_for_review_eligibility(Some(&record), Some(&record.validation_digest));
        assert!(allowed.allowed);

        let stale_digest = submit_for_review_eligibility(Some(&record), Some("validation:old"));
        assert!(!stale_digest.allowed);

        let missing = submit_for_review_eligibility(None, Some("validation:old"));
        assert!(!missing.allowed);
    }

    #[test]
    fn review_eligibility_denies_invalid_or_stale_records_even_with_matching_digest() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/validation-plan.md", "base\n");
        let snapshot = base_snapshot(root);
        let invalid_operation = materialized(root, "---\ninvalid\n---\n");
        let current = current_observation("child_1", &snapshot);
        let chunk = current_chunk(&invalid_operation);
        let invalid =
            validate_changeset_material(&[invalid_operation], &[current], &[chunk], 200).unwrap();

        let denied =
            submit_for_review_eligibility(Some(&invalid), Some(&invalid.validation_digest));

        assert!(!denied.allowed);
        assert_eq!(denied.command, CommandKind::SubmitForReview);
    }

    #[test]
    fn stale_records_and_old_digests_are_not_approval_ready_after_revalidation() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/validation-plan.md", "base\n");
        let snapshot = base_snapshot(root);
        let operation = materialized(root, valid_target_body());
        let current = current_observation("child_1", &snapshot);
        let chunk = current_chunk(&operation);
        let valid = validate_changeset_material(
            std::slice::from_ref(&operation),
            std::slice::from_ref(&current),
            std::slice::from_ref(&chunk),
            200,
        )
        .unwrap();
        write_doc(
            root,
            ".vault/plan/validation-plan.md",
            "changed outside proposal\n",
        );
        let changed_snapshot = SnapshotReader::for_worktree(root)
            .capture_existing(&operation.target_snapshot.document)
            .unwrap();
        let stale_current = current_observation("child_1", &changed_snapshot);
        let stale =
            validate_changeset_material(&[operation], &[stale_current], &[chunk], 201).unwrap();

        assert!(valid.approval_ready);
        assert!(valid.is_fresh_for_review(&valid.validation_digest));
        assert_eq!(stale.status, ValidationStatus::Stale);
        assert!(!stale.approval_ready);
        assert!(!stale.is_fresh_for_review(&stale.validation_digest));

        let stale_with_matching_digest =
            submit_for_review_eligibility(Some(&stale), Some(&stale.validation_digest));
        let old_record_with_new_digest =
            submit_for_review_eligibility(Some(&valid), Some(&stale.validation_digest));

        assert!(!stale_with_matching_digest.allowed);
        assert!(!old_record_with_new_digest.allowed);
    }

    #[test]
    fn validation_records_persist_and_reload_by_digest_and_changeset() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/validation-plan.md", "base\n");
        let snapshot = base_snapshot(root);
        let operation = materialized(root, valid_target_body());
        let current = current_observation("child_1", &snapshot);
        let record = validate_changeset_material(&[operation], &[current], &[], 200).unwrap();
        let mut store = Store::open(&root.join(".vault")).unwrap();

        store
            .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
                uow.validations().store_record(&record)
            })
            .unwrap();

        let by_digest = store
            .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
                uow.validations()
                    .record_by_digest(&record.validation_digest)
            })
            .unwrap()
            .expect("validation record is stored by digest");
        let latest = store
            .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
                uow.validations().latest_for_changeset(&record.changeset_id)
            })
            .unwrap()
            .expect("latest validation record is stored");

        assert_eq!(by_digest, record);
        assert_eq!(latest, record);
    }

    #[test]
    fn latest_validation_record_uses_insert_sequence_when_timestamps_tie() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/validation-plan.md", "base\n");
        let snapshot = base_snapshot(root);
        let operation = materialized(root, valid_target_body());
        let current = current_observation("child_1", &snapshot);
        let chunk = current_chunk(&operation);
        let valid = validate_changeset_material(
            std::slice::from_ref(&operation),
            std::slice::from_ref(&current),
            std::slice::from_ref(&chunk),
            200,
        )
        .unwrap();
        write_doc(
            root,
            ".vault/plan/validation-plan.md",
            "changed outside proposal\n",
        );
        let changed_snapshot = SnapshotReader::for_worktree(root)
            .capture_existing(&operation.target_snapshot.document)
            .unwrap();
        let changed_current = current_observation("child_1", &changed_snapshot);
        let stale =
            validate_changeset_material(&[operation], &[changed_current], &[chunk], 200).unwrap();
        let mut store = Store::open(&root.join(".vault")).unwrap();

        store
            .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
                uow.validations().store_record(&valid)?;
                uow.validations().store_record(&stale)?;
                Ok(())
            })
            .unwrap();

        let latest = store
            .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
                uow.validations().latest_for_changeset(&valid.changeset_id)
            })
            .unwrap()
            .expect("latest validation record exists");

        assert_eq!(latest.validation_digest, stale.validation_digest);
        assert_eq!(latest.status, ValidationStatus::Stale);
        assert!(!latest.approval_ready);
    }

    #[test]
    fn validation_record_digest_mismatch_is_rejected_on_reload() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/validation-plan.md", "base\n");
        let snapshot = base_snapshot(root);
        let operation = materialized(root, valid_target_body());
        let current = current_observation("child_1", &snapshot);
        let record = validate_changeset_material(&[operation], &[current], &[], 200).unwrap();
        let mut store = Store::open(&root.join(".vault")).unwrap();

        store
            .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
                uow.validations().store_record(&record)
            })
            .unwrap();

        let mut tampered = record.clone();
        tampered.material_digest = "material:tampered".to_string();
        let conn = rusqlite::Connection::open(store.path()).unwrap();
        conn.execute(
            "UPDATE authoring_validation_records
             SET record_json = ?1
             WHERE validation_digest = ?2",
            (
                serde_json::to_string(&tampered).unwrap(),
                record.validation_digest.as_str(),
            ),
        )
        .unwrap();
        drop(conn);

        let err = store
            .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
                uow.validations()
                    .record_by_digest(&record.validation_digest)
            })
            .unwrap_err();

        assert!(
            matches!(err, StoreError::Validation(detail) if detail.contains("validation_digest"))
        );
    }

    fn operation_base_revision(finding: &ValidationFinding) -> RevisionToken {
        let DocumentRef::Existing { base_revision, .. } = &finding.document else {
            panic!("finding should reference an existing document");
        };
        base_revision.clone()
    }
}
