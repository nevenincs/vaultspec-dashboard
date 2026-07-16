//! Document reference resolver for authoring targets.
//!
//! W03.P10 resolves existing and provisional vault document identities without
//! exposing `vaultspec-core` or materializing changes. Later phases attach
//! snapshots, chunks, proposal operations, and routes to these primitives.
#![allow(dead_code)]

use std::collections::VecDeque;
use std::path::{Component, Path, PathBuf};

use engine_model::{ScopeRef, scope_token};
use ingest_struct::reader::{DocumentBody, StructError};

use super::model::{AuthoringModelError, DocumentRef, ProvisionalCollisionStatus, RevisionToken};

pub const DEFAULT_DOCUMENT_LIST_LIMIT: usize = 256;
pub const MAX_DOCUMENT_LIST_LIMIT: usize = 2000;
const MAX_DOCUMENT_DISCOVERY: usize = 4096;
const MAX_STEM_LOOKUP_RETAINED: usize = 2;

#[derive(Debug, thiserror::Error)]
pub enum DocumentResolveError {
    #[error("document lookup `{0}` is invalid")]
    InvalidLookup(String),
    #[error("document path `{0}` is invalid")]
    InvalidPath(String),
    #[error("document `{0}` was not found")]
    MissingDocument(String),
    #[error("document stem `{stem}` is ambiguous across {count} candidates")]
    DuplicateStem { stem: String, count: usize },
    #[error("document reference kind cannot be resolved for this operation")]
    UnsupportedDocumentRef,
    #[error("document bytes: {0}")]
    Struct(#[from] StructError),
    #[error("authoring model: {0}")]
    Model(#[from] AuthoringModelError),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

pub type Result<T> = std::result::Result<T, DocumentResolveError>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExistingDocumentLookup {
    NodeId(String),
    Stem(String),
    Path(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProvisionalCreateRequest {
    pub provisional_doc_id: String,
    pub doc_type: String,
    pub feature: String,
    pub title: String,
    pub proposed_stem: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentCatalogEntry {
    pub node_id: String,
    pub stem: String,
    pub path: String,
    pub doc_type: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ListingTruncated {
    pub total: usize,
    pub returned: usize,
    pub limit: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentListing {
    pub documents: Vec<DocumentCatalogEntry>,
    pub next_cursor: Option<String>,
    pub truncated: Option<ListingTruncated>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentSnapshotRef {
    pub document: DocumentRef,
    pub revision: RevisionToken,
    pub byte_len: usize,
    pub revision_matches_ref: bool,
}

#[derive(Debug, Clone)]
pub struct DocumentResolver {
    root: PathBuf,
    scope: ScopeRef,
    scope_key: String,
}

impl DocumentResolver {
    pub fn for_worktree(root: impl Into<PathBuf>) -> Self {
        let root = root.into();
        let scope_key = scope_token(&root);
        Self {
            root,
            scope: ScopeRef::Worktree {
                path: scope_key.clone(),
            },
            scope_key,
        }
    }

    pub fn for_ref(root: impl Into<PathBuf>, name: impl Into<String>) -> Self {
        let name = name.into();
        Self {
            root: root.into(),
            scope: ScopeRef::Ref { name: name.clone() },
            scope_key: format!("ref:{name}"),
        }
    }

    pub fn scope_key(&self) -> &str {
        &self.scope_key
    }

    pub fn list_documents(
        &self,
        cursor: Option<&str>,
        page_size: Option<usize>,
    ) -> Result<DocumentListing> {
        let catalog = self.catalog()?;
        let mut candidates = catalog.candidates;
        candidates.sort_by(|a, b| a.path.cmp(&b.path));
        let page_size = page_size
            .unwrap_or(DEFAULT_DOCUMENT_LIST_LIMIT)
            .clamp(1, MAX_DOCUMENT_LIST_LIMIT);
        let start = match cursor {
            None => 0,
            Some(cursor) => candidates
                .iter()
                .position(|candidate| candidate.path.as_str() > cursor)
                .unwrap_or(candidates.len()),
        };
        let page: Vec<_> = candidates
            .iter()
            .skip(start)
            .take(page_size)
            .cloned()
            .collect();
        let next_cursor = if start + page.len() < candidates.len() {
            page.last().map(|candidate| candidate.path.clone())
        } else {
            None
        };
        let documents: Vec<_> = page
            .into_iter()
            .map(|candidate| candidate.catalog_entry())
            .collect();
        let truncated = (catalog.total > candidates.len()).then_some(ListingTruncated {
            total: catalog.total,
            returned: candidates.len(),
            limit: MAX_DOCUMENT_DISCOVERY,
        });
        Ok(DocumentListing {
            documents,
            next_cursor,
            truncated,
        })
    }

    pub fn resolve_existing(&self, lookup: ExistingDocumentLookup) -> Result<DocumentRef> {
        let candidate = match lookup {
            ExistingDocumentLookup::NodeId(node_id) => {
                let stem = node_id
                    .strip_prefix("doc:")
                    .filter(|stem| !stem.is_empty())
                    .ok_or_else(|| DocumentResolveError::InvalidLookup(node_id.clone()))?;
                self.single_stem_candidate(stem)?
            }
            ExistingDocumentLookup::Stem(stem) => {
                validate_non_empty("stem", &stem)?;
                self.single_stem_candidate(&stem)?
            }
            ExistingDocumentLookup::Path(path) => self.candidate_for_path(&path)?,
        };
        self.document_ref_for_candidate(&candidate)
    }

    pub fn provisional_create(&self, request: ProvisionalCreateRequest) -> Result<DocumentRef> {
        let ProvisionalCreateRequest {
            provisional_doc_id,
            doc_type,
            feature,
            title,
            proposed_stem,
        } = request;
        validate_non_empty("provisional_doc_id", &provisional_doc_id)?;
        validate_non_empty("doc_type", &doc_type)?;
        validate_non_empty("feature", &feature)?;
        validate_non_empty("title", &title)?;
        let proposed_stem = proposed_stem
            .map(|stem| normalize_doc_stem("proposed_stem", stem))
            .transpose()?;
        let collision_status = match proposed_stem.as_deref() {
            Some(stem) => {
                if self.stem_collides(stem, &doc_type)? {
                    ProvisionalCollisionStatus::Conflicting
                } else {
                    ProvisionalCollisionStatus::Available
                }
            }
            None => ProvisionalCollisionStatus::Unknown,
        };

        Ok(DocumentRef::ProvisionalCreate {
            provisional_doc_id,
            doc_type,
            feature,
            title,
            collision_status,
            proposed_stem,
            related: Vec::new(),
        })
    }

    pub fn rename_target(
        &self,
        source: DocumentRef,
        proposed_stem: impl Into<String>,
    ) -> Result<DocumentRef> {
        let proposed_stem = normalize_doc_stem("proposed_stem", proposed_stem.into())?;
        let source_path = match &source {
            DocumentRef::Existing { path, .. } => path.as_str(),
            _ => return Err(DocumentResolveError::UnsupportedDocumentRef),
        };
        let collisions = self.scan_stem(&proposed_stem)?;
        if collisions.has_candidate_other_than(source_path) {
            return Err(DocumentResolveError::DuplicateStem {
                stem: proposed_stem,
                count: collisions.total,
            });
        }

        Ok(DocumentRef::RenameTarget {
            source: Box::new(source),
            proposed_node_id: format!("doc:{proposed_stem}"),
            proposed_stem,
        })
    }

    pub fn materialized_result(
        &self,
        reviewed: DocumentRef,
        result_path: impl Into<String>,
    ) -> Result<DocumentRef> {
        let result_path = normalize_doc_path(&result_path.into())?;
        let candidate = DocumentCandidate::from_rel_path(result_path.clone())?;
        let body = self.read_document(&result_path)?;
        Ok(DocumentRef::MaterializedResult {
            reviewed: Box::new(reviewed),
            result_node_id: candidate.node_id(),
            result_path,
            result_revision: revision_from_blob_hash(&body.blob_hash)?,
        })
    }

    pub fn snapshot_ref(&self, document: &DocumentRef) -> Result<DocumentSnapshotRef> {
        let DocumentRef::Existing {
            path,
            base_revision,
            ..
        } = document
        else {
            return Err(DocumentResolveError::UnsupportedDocumentRef);
        };
        let path = normalize_doc_path(path)?;
        let body = self.read_document(&path)?;
        let revision = revision_from_blob_hash(&body.blob_hash)?;
        Ok(DocumentSnapshotRef {
            document: document.clone(),
            revision: revision.clone(),
            byte_len: body.text.len(),
            revision_matches_ref: revision == *base_revision,
        })
    }

    fn document_ref_for_candidate(&self, candidate: &DocumentCandidate) -> Result<DocumentRef> {
        let body = self.read_document(&candidate.path)?;
        Ok(DocumentRef::Existing {
            scope: self.scope_key.clone(),
            node_id: candidate.node_id(),
            stem: candidate.stem.clone(),
            path: candidate.path.clone(),
            doc_type: candidate.doc_type.clone(),
            base_revision: revision_from_blob_hash(&body.blob_hash)?,
        })
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

    fn single_stem_candidate(&self, stem: &str) -> Result<DocumentCandidate> {
        let candidates = self.scan_stem(stem)?;
        match candidates.total {
            0 => Err(DocumentResolveError::MissingDocument(format!("doc:{stem}"))),
            1 => Ok(candidates
                .retained
                .into_iter()
                .next()
                .expect("single stem scan retains its only match")),
            count => Err(DocumentResolveError::DuplicateStem {
                stem: stem.to_string(),
                count,
            }),
        }
    }

    fn scan_stem(&self, stem: &str) -> Result<StemScan> {
        let filename = format!("{stem}.md");
        match &self.scope {
            ScopeRef::Worktree { .. } => scan_worktree_stem(&self.root, &filename),
            ScopeRef::Ref { name } => scan_ref_stem(&self.root, name, &filename),
        }
    }

    fn stem_collides(&self, stem: &str, _doc_type: &str) -> Result<bool> {
        Ok(self.scan_stem(stem)?.total > 0)
    }

    fn candidate_for_path(&self, path: &str) -> Result<DocumentCandidate> {
        let rel_path = normalize_doc_path(path)?;
        let candidate = DocumentCandidate::from_rel_path(rel_path.clone())?;
        match self.read_document(&rel_path) {
            Ok(_) => Ok(candidate),
            Err(DocumentResolveError::Struct(StructError::NotAtRef { .. })) => {
                Err(DocumentResolveError::MissingDocument(rel_path))
            }
            Err(DocumentResolveError::Struct(StructError::Io(err)))
                if err.kind() == std::io::ErrorKind::NotFound =>
            {
                Err(DocumentResolveError::MissingDocument(rel_path))
            }
            Err(DocumentResolveError::Io(err)) if err.kind() == std::io::ErrorKind::NotFound => {
                Err(DocumentResolveError::MissingDocument(rel_path))
            }
            Err(err) => Err(err),
        }
    }

    fn catalog(&self) -> Result<DocumentCatalog> {
        match &self.scope {
            ScopeRef::Worktree { .. } => discover_worktree_documents(&self.root),
            ScopeRef::Ref { name } => discover_ref_documents(&self.root, name),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DocumentCatalog {
    candidates: Vec<DocumentCandidate>,
    total: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct StemScan {
    retained: Vec<DocumentCandidate>,
    total: usize,
}

impl StemScan {
    fn new() -> Self {
        Self {
            retained: Vec::with_capacity(MAX_STEM_LOOKUP_RETAINED),
            total: 0,
        }
    }

    fn record(&mut self, candidate: DocumentCandidate) {
        self.total += 1;
        if self.retained.len() < MAX_STEM_LOOKUP_RETAINED {
            self.retained.push(candidate);
        }
    }

    fn has_candidate_other_than(&self, path: &str) -> bool {
        self.retained.iter().any(|candidate| candidate.path != path)
            || self.total > self.retained.len()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DocumentCandidate {
    filename: String,
    stem: String,
    path: String,
    doc_type: String,
}

impl DocumentCandidate {
    fn from_rel_path(path: String) -> Result<Self> {
        let path = normalize_doc_path(&path)?;
        let filename = path
            .rsplit('/')
            .next()
            .filter(|name| name.ends_with(".md"))
            .ok_or_else(|| DocumentResolveError::InvalidPath(path.clone()))?
            .to_string();
        let stem = filename.trim_end_matches(".md").to_string();
        let doc_type = doc_type_from_path(&path)?;
        Ok(Self {
            filename,
            stem,
            path,
            doc_type,
        })
    }

    fn node_id(&self) -> String {
        format!("doc:{}", self.stem)
    }

    fn catalog_entry(&self) -> DocumentCatalogEntry {
        DocumentCatalogEntry {
            node_id: self.node_id(),
            stem: self.stem.clone(),
            path: self.path.clone(),
            doc_type: self.doc_type.clone(),
        }
    }
}

fn discover_worktree_documents(root: &Path) -> Result<DocumentCatalog> {
    let vault = root.join(".vault");
    let mut documents = Vec::new();
    let mut total = 0;
    if !vault.is_dir() {
        return Ok(DocumentCatalog {
            candidates: documents,
            total,
        });
    }

    let mut stack = VecDeque::from([vault]);
    while let Some(dir) = stack.pop_front() {
        let mut entries = std::fs::read_dir(&dir)?.collect::<std::io::Result<Vec<_>>>()?;
        entries.sort_by_key(|entry| entry.path());
        for entry in entries {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            if path.is_dir() {
                if !name.starts_with('.') && name != "data" && name != "logs" {
                    stack.push_back(path);
                }
                continue;
            }

            if !name.ends_with(".md") {
                continue;
            }
            total += 1;
            if documents.len() >= MAX_DOCUMENT_DISCOVERY {
                continue;
            }
            let rel = path
                .strip_prefix(root)
                .map_err(|_| DocumentResolveError::InvalidPath(path.display().to_string()))?
                .to_string_lossy()
                .replace('\\', "/");
            documents.push(DocumentCandidate::from_rel_path(rel)?);
        }
    }
    Ok(DocumentCatalog {
        candidates: documents,
        total,
    })
}

fn scan_worktree_stem(root: &Path, filename: &str) -> Result<StemScan> {
    let vault = root.join(".vault");
    let mut scan = StemScan::new();
    if !vault.is_dir() {
        return Ok(scan);
    }

    let mut stack = VecDeque::from([vault]);
    while let Some(dir) = stack.pop_front() {
        let mut entries = std::fs::read_dir(&dir)?.collect::<std::io::Result<Vec<_>>>()?;
        entries.sort_by_key(|entry| entry.path());
        for entry in entries {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            if path.is_dir() {
                if !name.starts_with('.') && name != "data" && name != "logs" {
                    stack.push_back(path);
                }
                continue;
            }

            if name != filename {
                continue;
            }
            let rel = path
                .strip_prefix(root)
                .map_err(|_| DocumentResolveError::InvalidPath(path.display().to_string()))?
                .to_string_lossy()
                .replace('\\', "/");
            scan.record(DocumentCandidate::from_rel_path(rel)?);
        }
    }
    Ok(scan)
}

fn discover_ref_documents(root: &Path, reference: &str) -> Result<DocumentCatalog> {
    let repo = gix::open(root)
        .map_err(|err| DocumentResolveError::Struct(StructError::Git(format!("open: {err}"))))?;
    let commit_id = repo.rev_parse_single(reference).map_err(|err| {
        DocumentResolveError::Struct(StructError::Git(format!("rev-parse {reference}: {err}")))
    })?;
    let commit = repo
        .find_commit(commit_id.detach())
        .map_err(|err| DocumentResolveError::Struct(StructError::Git(err.to_string())))?;
    let tree = commit
        .tree()
        .map_err(|err| DocumentResolveError::Struct(StructError::Git(err.to_string())))?;
    let mut documents = Vec::new();
    let mut total = 0;
    for entry in tree
        .traverse()
        .breadthfirst
        .files()
        .map_err(|err| DocumentResolveError::Struct(StructError::Git(err.to_string())))?
    {
        let path = entry.filepath.to_string();
        if !path.starts_with(".vault/") || !path.ends_with(".md") {
            continue;
        }
        total += 1;
        if documents.len() >= MAX_DOCUMENT_DISCOVERY {
            continue;
        }
        documents.push(DocumentCandidate::from_rel_path(path)?);
    }
    Ok(DocumentCatalog {
        candidates: documents,
        total,
    })
}

fn scan_ref_stem(root: &Path, reference: &str, filename: &str) -> Result<StemScan> {
    let repo = gix::open(root)
        .map_err(|err| DocumentResolveError::Struct(StructError::Git(format!("open: {err}"))))?;
    let commit_id = repo.rev_parse_single(reference).map_err(|err| {
        DocumentResolveError::Struct(StructError::Git(format!("rev-parse {reference}: {err}")))
    })?;
    let commit = repo
        .find_commit(commit_id.detach())
        .map_err(|err| DocumentResolveError::Struct(StructError::Git(err.to_string())))?;
    let tree = commit
        .tree()
        .map_err(|err| DocumentResolveError::Struct(StructError::Git(err.to_string())))?;
    let mut scan = StemScan::new();
    for entry in tree
        .traverse()
        .breadthfirst
        .files()
        .map_err(|err| DocumentResolveError::Struct(StructError::Git(err.to_string())))?
    {
        let path = entry.filepath.to_string();
        if !path.starts_with(".vault/") || !path.ends_with(filename) {
            continue;
        }
        let Some(entry_filename) = path.rsplit('/').next() else {
            continue;
        };
        if entry_filename == filename {
            scan.record(DocumentCandidate::from_rel_path(path)?);
        }
    }
    Ok(scan)
}

fn normalize_doc_path(path: &str) -> Result<String> {
    validate_non_empty("path", path)?;
    if path.trim() != path
        || path.contains('\\')
        || path.contains("//")
        || path.starts_with("./")
        || path.starts_with("../")
        || path.contains("/./")
        || path.contains("/../")
        || path.ends_with("/.")
        || path.ends_with("/..")
        || path.starts_with('/')
        || path.ends_with('/')
    {
        return Err(DocumentResolveError::InvalidPath(path.to_string()));
    }
    let rel = PathBuf::from(path);
    for component in rel.components() {
        match component {
            Component::Normal(_) => {}
            _ => return Err(DocumentResolveError::InvalidPath(path.to_string())),
        }
    }
    let path = rel.to_string_lossy().replace('\\', "/");
    if !path.starts_with(".vault/") || !path.ends_with(".md") {
        return Err(DocumentResolveError::InvalidPath(path));
    }
    Ok(path)
}

fn normalize_doc_stem(field: &str, value: String) -> Result<String> {
    validate_non_empty(field, &value)?;
    if value.trim() != value
        || value == "."
        || value == ".."
        || value.starts_with('.')
        || value.ends_with('.')
        || value.ends_with(".md")
        || value.contains('/')
        || value.contains('\\')
        || value.len() > 160
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.'))
    {
        return Err(DocumentResolveError::InvalidLookup(format!(
            "{field} `{value}` is not a canonical document stem"
        )));
    }
    Ok(value)
}

fn doc_type_from_path(path: &str) -> Result<String> {
    let mut parts = path.split('/');
    if parts.next() != Some(".vault") {
        return Err(DocumentResolveError::InvalidPath(path.to_string()));
    }
    let Some(doc_type) = parts.next() else {
        return Err(DocumentResolveError::InvalidPath(path.to_string()));
    };
    if doc_type.is_empty() || doc_type.ends_with(".md") {
        return Err(DocumentResolveError::InvalidPath(path.to_string()));
    }
    Ok(doc_type.to_string())
}

fn revision_from_blob_hash(blob_hash: &str) -> Result<RevisionToken> {
    Ok(RevisionToken::new(format!("blob:{blob_hash}"))?)
}

fn non_empty(field: &str, value: String) -> Result<String> {
    validate_non_empty(field, &value)?;
    Ok(value)
}

fn validate_non_empty(field: &str, value: &str) -> Result<()> {
    if value.trim().is_empty() {
        return Err(DocumentResolveError::InvalidLookup(format!(
            "{field} cannot be empty"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::process::Command;

    use super::*;

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

    #[test]
    fn existing_document_ref_resolves_path_stem_type_and_revision() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/adr/alpha-adr.md", "alpha\n");

        let resolver = DocumentResolver::for_worktree(root);
        let doc = resolver
            .resolve_existing(ExistingDocumentLookup::NodeId("doc:alpha-adr".to_string()))
            .unwrap();

        match doc {
            DocumentRef::Existing {
                scope,
                node_id,
                stem,
                path,
                doc_type,
                base_revision,
            } => {
                assert_eq!(scope, scope_token(root));
                assert_eq!(node_id, "doc:alpha-adr");
                assert_eq!(stem, "alpha-adr");
                assert_eq!(path, ".vault/adr/alpha-adr.md");
                assert_eq!(doc_type, "adr");
                assert!(base_revision.as_str().starts_with("blob:"));
            }
            other => panic!("expected existing ref, got {other:?}"),
        }
    }

    #[test]
    fn duplicate_stems_are_ambiguous_not_sorted_first() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/adr/shared.md", "adr\n");
        write_doc(root, ".vault/plan/shared.md", "plan\n");

        let resolver = DocumentResolver::for_worktree(root);
        let err = resolver
            .resolve_existing(ExistingDocumentLookup::Stem("shared".to_string()))
            .unwrap_err();

        match err {
            DocumentResolveError::DuplicateStem { stem, count } => {
                assert_eq!(stem, "shared");
                assert_eq!(count, 2);
            }
            other => panic!("expected duplicate stem, got {other:?}"),
        }

        let exact = resolver
            .resolve_existing(ExistingDocumentLookup::Path(
                ".vault/plan/shared.md".to_string(),
            ))
            .unwrap();
        assert!(matches!(
            exact,
            DocumentRef::Existing { doc_type, path, .. }
                if doc_type == "plan" && path == ".vault/plan/shared.md"
        ));
    }

    #[test]
    fn missing_documents_fail_loudly() {
        let dir = tempfile::tempdir().unwrap();
        let resolver = DocumentResolver::for_worktree(dir.path());

        let err = resolver
            .resolve_existing(ExistingDocumentLookup::NodeId("doc:missing".to_string()))
            .unwrap_err();
        assert!(matches!(err, DocumentResolveError::MissingDocument(_)));
    }

    #[test]
    fn provisional_create_reports_collision_status_without_creating_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/plan/existing-plan.md", "body\n");
        write_doc(root, ".vault/adr/shared-stem.md", "body\n");
        let resolver = DocumentResolver::for_worktree(root);

        let conflicting = resolver
            .provisional_create(ProvisionalCreateRequest {
                provisional_doc_id: "prov:1".to_string(),
                doc_type: "plan".to_string(),
                feature: "feature:alpha".to_string(),
                title: "Existing Plan".to_string(),
                proposed_stem: Some("existing-plan".to_string()),
            })
            .unwrap();
        assert!(matches!(
            conflicting,
            DocumentRef::ProvisionalCreate {
                collision_status: ProvisionalCollisionStatus::Conflicting,
                ..
            }
        ));

        let cross_type_conflict = resolver
            .provisional_create(ProvisionalCreateRequest {
                provisional_doc_id: "prov:cross-type".to_string(),
                doc_type: "plan".to_string(),
                feature: "feature:alpha".to_string(),
                title: "Shared Stem Plan".to_string(),
                proposed_stem: Some("shared-stem".to_string()),
            })
            .unwrap();
        assert!(matches!(
            cross_type_conflict,
            DocumentRef::ProvisionalCreate {
                collision_status: ProvisionalCollisionStatus::Conflicting,
                ..
            }
        ));

        let available = resolver
            .provisional_create(ProvisionalCreateRequest {
                provisional_doc_id: "prov:2".to_string(),
                doc_type: "plan".to_string(),
                feature: "feature:alpha".to_string(),
                title: "New Plan".to_string(),
                proposed_stem: Some("new-plan".to_string()),
            })
            .unwrap();
        assert!(matches!(
            available,
            DocumentRef::ProvisionalCreate {
                collision_status: ProvisionalCollisionStatus::Available,
                ..
            }
        ));
        assert!(!root.join(".vault/plan/new-plan.md").exists());

        let unknown = resolver
            .provisional_create(ProvisionalCreateRequest {
                provisional_doc_id: "prov:3".to_string(),
                doc_type: "plan".to_string(),
                feature: "feature:alpha".to_string(),
                title: "Untitled Plan".to_string(),
                proposed_stem: None,
            })
            .unwrap();
        assert!(matches!(
            unknown,
            DocumentRef::ProvisionalCreate {
                collision_status: ProvisionalCollisionStatus::Unknown,
                proposed_stem: None,
                ..
            }
        ));
    }

    #[test]
    fn proposed_stems_must_be_canonical_filename_stems() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/adr/source-adr.md", "source\n");
        let resolver = DocumentResolver::for_worktree(root);
        let source = resolver
            .resolve_existing(ExistingDocumentLookup::Stem("source-adr".to_string()))
            .unwrap();

        for (index, stem) in ["taken-adr.md", "adr/taken-adr", "./taken-adr", "taken stem"]
            .into_iter()
            .enumerate()
        {
            let create_err = resolver
                .provisional_create(ProvisionalCreateRequest {
                    provisional_doc_id: format!("prov:invalid:{index}"),
                    doc_type: "plan".to_string(),
                    feature: "feature:alpha".to_string(),
                    title: "Invalid Stem".to_string(),
                    proposed_stem: Some(stem.to_string()),
                })
                .unwrap_err();
            assert!(matches!(create_err, DocumentResolveError::InvalidLookup(_)));

            let rename_err = resolver
                .rename_target(source.clone(), stem.to_string())
                .unwrap_err();
            assert!(matches!(rename_err, DocumentResolveError::InvalidLookup(_)));
        }
    }

    #[test]
    fn exact_paths_must_be_canonical_vault_markdown_paths() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/adr/path-adr.md", "path\n");
        let resolver = DocumentResolver::for_worktree(root);

        for path in [
            "/.vault/adr/path-adr.md",
            ".vault/adr/path-adr.md/",
            ".vault/adr/./path-adr.md",
            ".vault\\adr\\path-adr.md",
        ] {
            let err = resolver
                .resolve_existing(ExistingDocumentLookup::Path(path.to_string()))
                .unwrap_err();
            assert!(matches!(err, DocumentResolveError::InvalidPath(_)));
        }
    }

    #[test]
    fn rename_and_materialized_result_preserve_reviewed_and_result_refs() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/adr/old-adr.md", "old\n");
        let resolver = DocumentResolver::for_worktree(root);
        let source = resolver
            .resolve_existing(ExistingDocumentLookup::Stem("old-adr".to_string()))
            .unwrap();
        let rename = resolver.rename_target(source.clone(), "new-adr").unwrap();

        write_doc(root, ".vault/adr/new-adr.md", "new\n");
        let result = resolver
            .materialized_result(rename.clone(), ".vault/adr/new-adr.md")
            .unwrap();

        match result {
            DocumentRef::MaterializedResult {
                reviewed,
                result_node_id,
                result_path,
                result_revision,
            } => {
                assert_eq!(*reviewed, rename);
                assert_eq!(result_node_id, "doc:new-adr");
                assert_eq!(result_path, ".vault/adr/new-adr.md");
                assert!(result_revision.as_str().starts_with("blob:"));
            }
            other => panic!("expected materialized result, got {other:?}"),
        }
        assert!(matches!(
            source,
            DocumentRef::Existing { path, .. } if path == ".vault/adr/old-adr.md"
        ));
    }

    #[test]
    fn rename_target_rejects_existing_target_stem_collision() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/adr/source-adr.md", "source\n");
        write_doc(root, ".vault/adr/taken-adr.md", "taken\n");
        let resolver = DocumentResolver::for_worktree(root);
        let source = resolver
            .resolve_existing(ExistingDocumentLookup::Stem("source-adr".to_string()))
            .unwrap();

        let err = resolver.rename_target(source, "taken-adr").unwrap_err();
        assert!(matches!(
            err,
            DocumentResolveError::DuplicateStem {
                stem,
                count: 1
            } if stem == "taken-adr"
        ));
    }

    #[test]
    fn ref_scope_snapshot_reads_committed_revision_not_worktree_bytes() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        git(root, &["init", "-b", "main", "."]);
        write_doc(root, ".vault/plan/ref-plan.md", "committed\n");
        git(root, &["add", "."]);
        git(root, &["commit", "-m", "init"]);
        write_doc(root, ".vault/plan/ref-plan.md", "working tree\n");

        let ref_resolver = DocumentResolver::for_ref(root, "HEAD");
        let worktree_resolver = DocumentResolver::for_worktree(root);
        let from_ref = ref_resolver
            .resolve_existing(ExistingDocumentLookup::Stem("ref-plan".to_string()))
            .unwrap();
        let from_worktree = worktree_resolver
            .resolve_existing(ExistingDocumentLookup::Path(
                ".vault/plan/ref-plan.md".to_string(),
            ))
            .unwrap();

        let ref_snapshot = ref_resolver.snapshot_ref(&from_ref).unwrap();
        let worktree_snapshot = worktree_resolver.snapshot_ref(&from_worktree).unwrap();
        assert_ne!(ref_snapshot.revision, worktree_snapshot.revision);
        assert!(ref_snapshot.revision_matches_ref);
        assert_eq!(ref_snapshot.byte_len, "committed\n".len());
    }

    #[test]
    fn bounded_listing_uses_stable_path_cursor_without_overlap() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/adr/a.md", "a\n");
        write_doc(root, ".vault/plan/b.md", "b\n");
        write_doc(root, ".vault/research/c.md", "c\n");
        let resolver = DocumentResolver::for_worktree(root);

        let first = resolver.list_documents(None, Some(2)).unwrap();
        assert_eq!(first.documents.len(), 2);
        assert_eq!(first.truncated, None);
        assert_eq!(first.next_cursor.as_deref(), Some(".vault/plan/b.md"));
        assert_eq!(first.documents[0].path, ".vault/adr/a.md");
        assert_eq!(first.documents[1].path, ".vault/plan/b.md");

        let second = resolver
            .list_documents(first.next_cursor.as_deref(), Some(2))
            .unwrap();
        assert_eq!(second.documents.len(), 1);
        assert_eq!(second.documents[0].path, ".vault/research/c.md");
        assert_eq!(second.next_cursor, None);
    }

    #[test]
    fn stem_lookup_resolves_documents_beyond_the_listing_cap() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let plan_dir = root.join(".vault/plan");
        std::fs::create_dir_all(&plan_dir).unwrap();
        for index in 0..MAX_DOCUMENT_DISCOVERY {
            std::fs::write(plan_dir.join(format!("doc-{index:04}.md")), "body\n").unwrap();
        }
        write_doc(root, ".vault/plan/zz-over-cap.md", "target\n");
        let resolver = DocumentResolver::for_worktree(root);

        let listing = resolver
            .list_documents(None, Some(MAX_DOCUMENT_LIST_LIMIT))
            .unwrap();
        assert_eq!(
            listing.truncated,
            Some(ListingTruncated {
                total: MAX_DOCUMENT_DISCOVERY + 1,
                returned: MAX_DOCUMENT_DISCOVERY,
                limit: MAX_DOCUMENT_DISCOVERY,
            })
        );

        let resolved = resolver
            .resolve_existing(ExistingDocumentLookup::Stem("zz-over-cap".to_string()))
            .unwrap();
        assert!(matches!(
            resolved,
            DocumentRef::Existing { path, .. } if path == ".vault/plan/zz-over-cap.md"
        ));

        let conflicting = resolver
            .provisional_create(ProvisionalCreateRequest {
                provisional_doc_id: "prov:over-cap".to_string(),
                doc_type: "plan".to_string(),
                feature: "feature:alpha".to_string(),
                title: "Over Cap".to_string(),
                proposed_stem: Some("zz-over-cap".to_string()),
            })
            .unwrap();
        assert!(matches!(
            conflicting,
            DocumentRef::ProvisionalCreate {
                collision_status: ProvisionalCollisionStatus::Conflicting,
                ..
            }
        ));
    }

    #[test]
    fn duplicate_stem_beyond_the_listing_cap_is_still_ambiguous() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_doc(root, ".vault/adr/shared.md", "adr\n");
        let plan_dir = root.join(".vault/plan");
        std::fs::create_dir_all(&plan_dir).unwrap();
        for index in 0..MAX_DOCUMENT_DISCOVERY {
            std::fs::write(plan_dir.join(format!("doc-{index:04}.md")), "body\n").unwrap();
        }
        write_doc(root, ".vault/research/shared.md", "research\n");
        let resolver = DocumentResolver::for_worktree(root);

        let err = resolver
            .resolve_existing(ExistingDocumentLookup::Stem("shared".to_string()))
            .unwrap_err();

        assert!(matches!(
            err,
            DocumentResolveError::DuplicateStem {
                stem,
                count: 2
            } if stem == "shared"
        ));
    }

    #[test]
    fn bounded_listing_reports_hard_cap_truncation() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let plan_dir = root.join(".vault/plan");
        std::fs::create_dir_all(&plan_dir).unwrap();
        for index in 0..MAX_DOCUMENT_DISCOVERY + 3 {
            std::fs::write(plan_dir.join(format!("doc-{index:04}.md")), "body\n").unwrap();
        }
        let resolver = DocumentResolver::for_worktree(root);

        let listing = resolver
            .list_documents(None, Some(MAX_DOCUMENT_LIST_LIMIT))
            .unwrap();

        assert_eq!(listing.documents.len(), MAX_DOCUMENT_LIST_LIMIT);
        assert_eq!(
            listing.truncated,
            Some(ListingTruncated {
                total: MAX_DOCUMENT_DISCOVERY + 3,
                returned: MAX_DOCUMENT_DISCOVERY,
                limit: MAX_DOCUMENT_DISCOVERY,
            })
        );
        assert_eq!(
            listing.next_cursor.as_deref(),
            Some(".vault/plan/doc-1999.md")
        );
    }
}
