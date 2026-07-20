//! Verified consistency-group snapshot (a2a-product-provisioning W03.P06.S49).
//!
//! A transactional update snapshots every mutable schema-bearing store as ONE
//! consistency group before it stages migrations or activates a candidate
//! generation, so a failed candidate can restore the whole group together (ADR
//! "make mutable state transactional"). The group is:
//!
//! - every manifest-declared schema-bearing store (the capsule consistency group
//!   declares the primary and checkpoint databases), captured with any SQLite
//!   `-wal`/`-shm` sidecars present,
//! - the complete fixed active-receipt journal (the receipt generation), and
//! - the prior seat descriptor retained for rollback relaunch.
//!
//! The snapshot is taken only AFTER the owned runtime is drained and stopped
//! (the S52 transaction order), so the store files are quiescent and a byte-level
//! capture is a consistent snapshot — no live-database backup API and no SQLite
//! dependency are required. The store SET is supplied by the caller from the
//! verified capsule manifest; this module owns the grouping, verification, and
//! all-or-nothing restore invariants, never a gateway-internal file name.
//!
//! Capture writes each member into a fresh `snapshots/<consistency-generation>/`
//! tree and commits a `snapshot.json` manifest LAST via an atomic rename, so the
//! manifest's presence witnesses a complete capture. Every read reproves each
//! recorded member's size and digest, and an absent, torn, or drifted group is
//! rejected rather than restored. Members are opened no-follow and byte-bounded;
//! the owner-private snapshot tree and the held installation guard are the
//! cooperative same-user boundary the rest of the crate already relies on.

use std::ffi::OsStr;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::locking::{InstallLockGuard, LockAuthorityError};
use crate::paths::{PathError, ProductPaths};
use crate::receipt::PriorSeatIdentity;

const SNAPSHOT_SCHEMA_VERSION: &str = "1.0";
const SNAPSHOT_MANIFEST_NAME: &str = "snapshot.json";
const SNAPSHOT_MANIFEST_TMP: &str = "snapshot.json.tmp";
const STORES_SUBDIR: &str = "stores";
const STORE_PRIMARY_NAME: &str = "primary";
const RECEIPT_JOURNAL_MEMBER: &str = "active-receipts.v1";

/// The SQLite sidecars captured with a store's primary file. Order is fixed so
/// the captured set is deterministic.
const SIDECAR_SUFFIXES: [&str; 2] = ["-wal", "-shm"];

/// Hard bound on schema-bearing stores in one consistency group. The capsule
/// contract declares two; the bound leaves headroom without becoming unbounded.
pub const MAX_STORES: usize = 32;

/// Hard bound on the byte length of any single captured member file.
pub const MAX_MEMBER_BYTES: u64 = 2 * 1024 * 1024 * 1024;

const MAX_MANIFEST_BYTES: u64 = 1024 * 1024;
const MAX_STORE_ID_BYTES: usize = 128;
const MAX_STORE_SEGMENTS: usize = 16;
const MAX_SEGMENT_BYTES: usize = 255;
const MAX_SCHEMA_TEXT_BYTES: usize = 128;

/// One mutable schema-bearing store to snapshot, resolved relative to the product
/// app home. The identifier and path segments are validated so a store can never
/// escape the app home, and the schema authority/version are recorded so a
/// restore is only ever applied to a matching group.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SchemaBearingStore {
    id: String,
    segments: Vec<String>,
    schema_authority: String,
    schema_version: String,
}

impl SchemaBearingStore {
    /// Describe a store by its stable id, its app-home-relative path segments,
    /// and its declared schema authority and version. Every field is bounded and
    /// the segments are validated as portable non-escaping path components.
    pub fn new(
        id: impl Into<String>,
        segments: impl IntoIterator<Item = impl Into<String>>,
        schema_authority: impl Into<String>,
        schema_version: impl Into<String>,
    ) -> Result<Self, SnapshotError> {
        let id = id.into();
        validate_store_id(&id)?;
        let segments: Vec<String> = segments.into_iter().map(Into::into).collect();
        if segments.is_empty() || segments.len() > MAX_STORE_SEGMENTS {
            return Err(SnapshotError::InvalidStore {
                id: id.clone(),
                detail: "a store must have 1..=16 app-home-relative path segments",
            });
        }
        for segment in &segments {
            validate_segment(&id, segment)?;
        }
        let schema_authority = schema_authority.into();
        let schema_version = schema_version.into();
        validate_schema_text(&id, "schema_authority", &schema_authority)?;
        validate_schema_text(&id, "schema_version", &schema_version)?;
        Ok(Self {
            id,
            segments,
            schema_authority,
            schema_version,
        })
    }

    /// The stable store id.
    #[must_use]
    pub fn id(&self) -> &str {
        &self.id
    }

    /// The declared schema authority.
    #[must_use]
    pub fn schema_authority(&self) -> &str {
        &self.schema_authority
    }

    /// The declared schema version.
    #[must_use]
    pub fn schema_version(&self) -> &str {
        &self.schema_version
    }

    fn primary_path(&self, paths: &ProductPaths) -> PathBuf {
        let mut path = paths.app_home();
        for segment in &self.segments {
            path.push(segment);
        }
        path
    }
}

/// The set of stores plus the prior-seat descriptor to snapshot as one group.
#[derive(Debug, Clone)]
pub struct ConsistencyGroupSpec {
    stores: Vec<SchemaBearingStore>,
    prior_seat: Option<PriorSeatIdentity>,
}

impl ConsistencyGroupSpec {
    /// Assemble a group spec, rejecting an empty set, a set beyond [`MAX_STORES`],
    /// or a duplicate store id.
    pub fn new(
        stores: impl IntoIterator<Item = SchemaBearingStore>,
        prior_seat: Option<PriorSeatIdentity>,
    ) -> Result<Self, SnapshotError> {
        let stores: Vec<SchemaBearingStore> = stores.into_iter().collect();
        if stores.is_empty() || stores.len() > MAX_STORES {
            return Err(SnapshotError::InvalidGroup {
                detail: "a consistency group must contain 1..=32 stores",
            });
        }
        let mut seen = std::collections::BTreeSet::new();
        for store in &stores {
            if !seen.insert(store.id.as_str()) {
                return Err(SnapshotError::InvalidGroup {
                    detail: "consistency group store ids must be unique",
                });
            }
        }
        Ok(Self { stores, prior_seat })
    }
}

/// Whether a captured member was present at capture time and, if so, its bound
/// byte length and lowercase SHA-256 digest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "kebab-case")]
enum MemberState {
    Absent,
    Present { size: u64, sha256: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct SidecarRecord {
    suffix: String,
    size: u64,
    sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct StoreRecord {
    id: String,
    segments: Vec<String>,
    schema_authority: String,
    schema_version: String,
    primary: MemberState,
    sidecars: Vec<SidecarRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct SnapshotManifest {
    schema_version: String,
    consistency_generation: u64,
    stores: Vec<StoreRecord>,
    receipt_journal: MemberState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    prior_seat: Option<PriorSeatIdentity>,
}

/// A verified consistency-group snapshot bound to one consistency generation.
///
/// Construction is only through [`capture_consistency_snapshot`] or
/// [`open_consistency_snapshot`], both of which fully verify the group. A held
/// value therefore witnesses a complete, digest-consistent snapshot on disk.
#[derive(Debug, Clone)]
pub struct ConsistencySnapshot {
    consistency_generation: u64,
    manifest: SnapshotManifest,
}

impl ConsistencySnapshot {
    /// The consistency generation this snapshot restores.
    #[must_use]
    pub fn consistency_generation(&self) -> u64 {
        self.consistency_generation
    }

    /// The prior seat descriptor captured with the group, if one existed.
    #[must_use]
    pub fn prior_seat(&self) -> Option<&PriorSeatIdentity> {
        self.manifest.prior_seat.as_ref()
    }

    /// The stable ids of every store captured in the group.
    #[must_use]
    pub fn store_ids(&self) -> Vec<&str> {
        self.manifest
            .stores
            .iter()
            .map(|store| store.id.as_str())
            .collect()
    }

    /// Whether the fixed receipt journal was present at capture time.
    #[must_use]
    pub fn captured_receipt_journal(&self) -> bool {
        matches!(self.manifest.receipt_journal, MemberState::Present { .. })
    }

    /// Restore the whole consistency group to its captured bytes.
    ///
    /// The group is fully reverified first, so a drifted or incomplete snapshot
    /// never partially restores. Each store's primary and captured sidecars are
    /// then written back atomically, any live sidecar absent from the snapshot is
    /// removed (so a post-snapshot WAL cannot corrupt the restored database), an
    /// absent store's live files are removed, and the receipt journal is restored
    /// last. Restore is idempotent, so an interrupted restore (S53) resumes by
    /// re-running from the same durable snapshot.
    pub fn restore(
        &self,
        paths: &ProductPaths,
        guard: &InstallLockGuard,
    ) -> Result<(), SnapshotError> {
        guard.verify_for_product(paths)?;
        let generation_dir = self.generation_dir(paths)?;
        self.verify_against(paths, &generation_dir)?;

        for store in &self.manifest.stores {
            let spec = store.to_store()?;
            let destination = spec.primary_path(paths);
            let store_dir = self.store_dir(&generation_dir, &store.id);
            match &store.primary {
                MemberState::Present { .. } => {
                    ensure_parent_dir(&destination)?;
                    restore_member_file(&store_dir.join(STORE_PRIMARY_NAME), &destination)?;
                    let captured: std::collections::BTreeSet<&str> =
                        store.sidecars.iter().map(|s| s.suffix.as_str()).collect();
                    for sidecar in &store.sidecars {
                        restore_member_file(
                            &store_dir.join(sidecar_member_name(&sidecar.suffix)),
                            &sidecar_destination(&destination, &sidecar.suffix),
                        )?;
                    }
                    for suffix in SIDECAR_SUFFIXES {
                        if !captured.contains(suffix) {
                            remove_if_present(&sidecar_destination(&destination, suffix))?;
                        }
                    }
                }
                MemberState::Absent => {
                    remove_if_present(&destination)?;
                    for suffix in SIDECAR_SUFFIXES {
                        remove_if_present(&sidecar_destination(&destination, suffix))?;
                    }
                }
            }
        }

        if matches!(self.manifest.receipt_journal, MemberState::Present { .. }) {
            let journal_source = generation_dir.join(RECEIPT_JOURNAL_MEMBER);
            restore_member_file(&journal_source, &paths.active_receipts_journal_path())?;
        }
        Ok(())
    }

    fn generation_dir(&self, paths: &ProductPaths) -> Result<PathBuf, SnapshotError> {
        Ok(paths.snapshot_dir(&self.consistency_generation.to_string())?)
    }

    fn store_dir(&self, generation_dir: &Path, id: &str) -> PathBuf {
        generation_dir.join(STORES_SUBDIR).join(id)
    }

    /// Reprove every recorded member against its captured size and digest.
    fn verify_against(
        &self,
        _paths: &ProductPaths,
        generation_dir: &Path,
    ) -> Result<(), SnapshotError> {
        for store in &self.manifest.stores {
            let store_dir = self.store_dir(generation_dir, &store.id);
            verify_member(&store_dir.join(STORE_PRIMARY_NAME), &store.primary)?;
            for sidecar in &store.sidecars {
                verify_member(
                    &store_dir.join(sidecar_member_name(&sidecar.suffix)),
                    &MemberState::Present {
                        size: sidecar.size,
                        sha256: sidecar.sha256.clone(),
                    },
                )?;
            }
        }
        verify_member(
            &generation_dir.join(RECEIPT_JOURNAL_MEMBER),
            &self.manifest.receipt_journal,
        )?;
        Ok(())
    }
}

/// Capture the consistency group at `consistency_generation` under the held
/// installation guard.
///
/// The stores must already be quiescent (drained and stopped) so the byte-level
/// capture is consistent. The snapshot directory for this generation must not
/// already exist — a group is never silently overwritten. The manifest is
/// committed last via an atomic rename, so a crash before that leaves an
/// incomplete tree that [`open_consistency_snapshot`] rejects.
pub fn capture_consistency_snapshot(
    paths: &ProductPaths,
    guard: &InstallLockGuard,
    consistency_generation: u64,
    spec: &ConsistencyGroupSpec,
) -> Result<ConsistencySnapshot, SnapshotError> {
    guard.verify_for_product(paths)?;
    let generation_dir = paths.snapshot_dir(&consistency_generation.to_string())?;
    create_new_private_dir(&generation_dir)?;
    let stores_dir = generation_dir.join(STORES_SUBDIR);
    create_new_private_dir(&stores_dir)?;

    let mut store_records = Vec::with_capacity(spec.stores.len());
    for store in &spec.stores {
        let store_dir = stores_dir.join(&store.id);
        create_new_private_dir(&store_dir)?;
        let primary_source = store.primary_path(paths);
        let primary = capture_member(&primary_source, &store_dir.join(STORE_PRIMARY_NAME))?;
        let mut sidecars = Vec::new();
        if matches!(primary, MemberState::Present { .. }) {
            for suffix in SIDECAR_SUFFIXES {
                let sidecar_source = sidecar_destination(&primary_source, suffix);
                let captured = capture_member(
                    &sidecar_source,
                    &store_dir.join(sidecar_member_name(suffix)),
                )?;
                if let MemberState::Present { size, sha256 } = captured {
                    sidecars.push(SidecarRecord {
                        suffix: suffix.to_string(),
                        size,
                        sha256,
                    });
                }
            }
        }
        store_records.push(StoreRecord {
            id: store.id.clone(),
            segments: store.segments.clone(),
            schema_authority: store.schema_authority.clone(),
            schema_version: store.schema_version.clone(),
            primary,
            sidecars,
        });
    }

    let receipt_journal = capture_member(
        &paths.active_receipts_journal_path(),
        &generation_dir.join(RECEIPT_JOURNAL_MEMBER),
    )?;

    let manifest = SnapshotManifest {
        schema_version: SNAPSHOT_SCHEMA_VERSION.to_string(),
        consistency_generation,
        stores: store_records,
        receipt_journal,
        prior_seat: spec.prior_seat.clone(),
    };
    commit_manifest(&generation_dir, &manifest)?;
    Ok(ConsistencySnapshot {
        consistency_generation,
        manifest,
    })
}

/// Reopen and fully verify the snapshot captured at `consistency_generation`.
///
/// Fails closed when the manifest is absent (an incomplete capture), unparseable,
/// or any recorded member has drifted from its captured size or digest.
pub fn open_consistency_snapshot(
    paths: &ProductPaths,
    guard: &InstallLockGuard,
    consistency_generation: u64,
) -> Result<ConsistencySnapshot, SnapshotError> {
    guard.verify_for_product(paths)?;
    let generation_dir = paths.snapshot_dir(&consistency_generation.to_string())?;
    let manifest = read_manifest(&generation_dir)?;
    if manifest.schema_version != SNAPSHOT_SCHEMA_VERSION
        || manifest.consistency_generation != consistency_generation
    {
        return Err(SnapshotError::Unverified {
            detail: "snapshot manifest schema or generation mismatch",
        });
    }
    if manifest.stores.len() > MAX_STORES {
        return Err(SnapshotError::Unverified {
            detail: "snapshot manifest exceeds the store bound",
        });
    }
    let snapshot = ConsistencySnapshot {
        consistency_generation,
        manifest,
    };
    snapshot.verify_against(paths, &generation_dir)?;
    Ok(snapshot)
}

impl StoreRecord {
    fn to_store(&self) -> Result<SchemaBearingStore, SnapshotError> {
        SchemaBearingStore::new(
            self.id.clone(),
            self.segments.clone(),
            self.schema_authority.clone(),
            self.schema_version.clone(),
        )
    }
}

fn sidecar_member_name(suffix: &str) -> String {
    format!("{STORE_PRIMARY_NAME}{suffix}")
}

fn sidecar_destination(primary: &Path, suffix: &str) -> PathBuf {
    let mut name = primary.file_name().unwrap_or_default().to_os_string();
    name.push(suffix);
    primary.with_file_name(name)
}

fn capture_member(source: &Path, destination: &Path) -> Result<MemberState, SnapshotError> {
    match read_regular_nofollow(source, MAX_MEMBER_BYTES)? {
        None => Ok(MemberState::Absent),
        Some(bytes) => {
            let sha256 = sha256_hex(&bytes);
            write_new_nofollow(destination, &bytes)?;
            Ok(MemberState::Present {
                size: bytes.len() as u64,
                sha256,
            })
        }
    }
}

fn verify_member(path: &Path, expected: &MemberState) -> Result<(), SnapshotError> {
    match expected {
        MemberState::Absent => {
            if read_regular_nofollow(path, MAX_MEMBER_BYTES)?.is_some() {
                return Err(SnapshotError::Unverified {
                    detail: "snapshot member recorded absent but present on disk",
                });
            }
            Ok(())
        }
        MemberState::Present { size, sha256 } => {
            let bytes = read_regular_nofollow(path, MAX_MEMBER_BYTES)?.ok_or(
                SnapshotError::Unverified {
                    detail: "snapshot member recorded present but missing on disk",
                },
            )?;
            if bytes.len() as u64 != *size || &sha256_hex(&bytes) != sha256 {
                return Err(SnapshotError::Unverified {
                    detail: "snapshot member size or digest drifted",
                });
            }
            Ok(())
        }
    }
}

fn restore_member_file(source: &Path, destination: &Path) -> Result<(), SnapshotError> {
    let bytes =
        read_regular_nofollow(source, MAX_MEMBER_BYTES)?.ok_or(SnapshotError::Unverified {
            detail: "snapshot member disappeared before restore",
        })?;
    atomic_replace(destination, &bytes)
}

fn commit_manifest(
    generation_dir: &Path,
    manifest: &SnapshotManifest,
) -> Result<(), SnapshotError> {
    let bytes = serde_json::to_vec(manifest)
        .map_err(|error| SnapshotError::io("snapshot manifest encode", error.into()))?;
    if bytes.len() as u64 > MAX_MANIFEST_BYTES {
        return Err(SnapshotError::io(
            "snapshot manifest encode",
            std::io::Error::other("snapshot manifest exceeds byte bound"),
        ));
    }
    let tmp = generation_dir.join(SNAPSHOT_MANIFEST_TMP);
    write_new_nofollow(&tmp, &bytes)?;
    std::fs::rename(&tmp, generation_dir.join(SNAPSHOT_MANIFEST_NAME))
        .map_err(|error| SnapshotError::io("snapshot manifest commit rename", error))?;
    sync_dir(generation_dir)?;
    Ok(())
}

fn read_manifest(generation_dir: &Path) -> Result<SnapshotManifest, SnapshotError> {
    let bytes = read_regular_nofollow(
        &generation_dir.join(SNAPSHOT_MANIFEST_NAME),
        MAX_MANIFEST_BYTES,
    )?
    .ok_or(SnapshotError::Incomplete)?;
    serde_json::from_slice(&bytes).map_err(|_| SnapshotError::Unverified {
        detail: "snapshot manifest grammar is invalid",
    })
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(64);
    for byte in digest {
        use std::fmt::Write as _;
        let _ = write!(out, "{byte:02x}");
    }
    out
}

// ---------------------------------------------------------------------------
// Bounded no-follow file authority
// ---------------------------------------------------------------------------

fn read_regular_nofollow(path: &Path, cap: u64) -> Result<Option<Vec<u8>>, SnapshotError> {
    let mut file = match open_regular_nofollow(path)? {
        Some(file) => file,
        None => return Ok(None),
    };
    let len = file
        .metadata()
        .map_err(|error| SnapshotError::io("member stat", error))?
        .len();
    if len > cap {
        return Err(SnapshotError::io(
            "member read",
            std::io::Error::other("snapshot member exceeds byte bound"),
        ));
    }
    let mut bytes = Vec::with_capacity(usize::try_from(len).unwrap_or(0));
    Read::by_ref(&mut file)
        .take(cap + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| SnapshotError::io("member read", error))?;
    if bytes.len() as u64 > cap {
        return Err(SnapshotError::io(
            "member read",
            std::io::Error::other("snapshot member exceeds byte bound"),
        ));
    }
    Ok(Some(bytes))
}

fn open_regular_nofollow(path: &Path) -> Result<Option<std::fs::File>, SnapshotError> {
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(nix::libc::O_NOFOLLOW | nix::libc::O_CLOEXEC);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
        options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    }
    match options.open(path) {
        Ok(file) => {
            let metadata = file
                .metadata()
                .map_err(|error| SnapshotError::io("member stat", error))?;
            if !metadata.is_file() || is_reparse(&metadata) {
                return Err(SnapshotError::UnsafeMember {
                    path: path.to_path_buf(),
                });
            }
            Ok(Some(file))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) if is_symlink_loop(&error) => Err(SnapshotError::UnsafeMember {
            path: path.to_path_buf(),
        }),
        Err(error) => Err(SnapshotError::io("member open", error)),
    }
}

fn write_new_nofollow(path: &Path, bytes: &[u8]) -> Result<(), SnapshotError> {
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(nix::libc::O_NOFOLLOW | nix::libc::O_CLOEXEC);
        options.mode(0o600);
    }
    let mut file = options
        .open(path)
        .map_err(|error| SnapshotError::io("member create", error))?;
    file.write_all(bytes)
        .map_err(|error| SnapshotError::io("member write", error))?;
    file.sync_all()
        .map_err(|error| SnapshotError::io("member sync", error))?;
    Ok(())
}

/// Atomically replace `destination` with `bytes` via a sibling temp and rename.
fn atomic_replace(destination: &Path, bytes: &[u8]) -> Result<(), SnapshotError> {
    let parent = destination
        .parent()
        .ok_or_else(|| SnapshotError::io("restore parent", std::io::Error::other("no parent")))?;
    let file_name = destination
        .file_name()
        .and_then(OsStr::to_str)
        .ok_or_else(|| SnapshotError::io("restore name", std::io::Error::other("no file name")))?;
    let tmp = parent.join(format!(".{file_name}.vsrestore.tmp"));
    remove_if_present(&tmp)?;
    write_new_nofollow(&tmp, bytes)?;
    std::fs::rename(&tmp, destination)
        .map_err(|error| SnapshotError::io("restore rename", error))?;
    sync_dir(parent)?;
    Ok(())
}

fn remove_if_present(path: &Path) -> Result<(), SnapshotError> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(SnapshotError::io("member remove", error)),
    }
}

fn ensure_parent_dir(path: &Path) -> Result<(), SnapshotError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| SnapshotError::io("restore parent create", error))?;
    }
    Ok(())
}

fn create_new_private_dir(path: &Path) -> Result<(), SnapshotError> {
    match std::fs::create_dir(path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            return Err(SnapshotError::AlreadyExists {
                path: path.to_path_buf(),
            });
        }
        Err(error) => return Err(SnapshotError::io("snapshot directory create", error)),
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
            .map_err(|error| SnapshotError::io("snapshot directory restrict", error))?;
    }
    Ok(())
}

fn sync_dir(path: &Path) -> Result<(), SnapshotError> {
    // Directory fsync is a POSIX durability guarantee; on Windows opening a
    // directory handle for sync is not supported, so the rename is relied upon.
    #[cfg(unix)]
    {
        let dir = std::fs::File::open(path)
            .map_err(|error| SnapshotError::io("snapshot directory open", error))?;
        dir.sync_all()
            .map_err(|error| SnapshotError::io("snapshot directory sync", error))?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

fn is_reparse(metadata: &std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    {
        let _ = metadata;
        false
    }
}

fn is_symlink_loop(error: &std::io::Error) -> bool {
    #[cfg(unix)]
    {
        error.raw_os_error() == Some(nix::libc::ELOOP)
    }
    #[cfg(not(unix))]
    {
        let _ = error;
        false
    }
}

// ---------------------------------------------------------------------------
// Grammar validation
// ---------------------------------------------------------------------------

fn validate_store_id(id: &str) -> Result<(), SnapshotError> {
    let ok = !id.is_empty()
        && id.len() <= MAX_STORE_ID_BYTES
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
        && !id.contains("..");
    if ok {
        Ok(())
    } else {
        Err(SnapshotError::InvalidStore {
            id: id.to_string(),
            detail: "store id must be non-empty bounded [A-Za-z0-9._-] with no ..",
        })
    }
}

fn validate_segment(id: &str, segment: &str) -> Result<(), SnapshotError> {
    let ok = !segment.is_empty()
        && segment.len() <= MAX_SEGMENT_BYTES
        && segment != "."
        && segment != ".."
        && !segment.contains('/')
        && !segment.contains('\\')
        && !segment.bytes().any(|b| b == 0 || b.is_ascii_control());
    if ok {
        Ok(())
    } else {
        Err(SnapshotError::InvalidStore {
            id: id.to_string(),
            detail: "store path segment must be a portable non-escaping component",
        })
    }
}

fn validate_schema_text(id: &str, field: &'static str, value: &str) -> Result<(), SnapshotError> {
    let _ = field;
    if !value.is_empty() && value.len() <= MAX_SCHEMA_TEXT_BYTES {
        Ok(())
    } else {
        Err(SnapshotError::InvalidStore {
            id: id.to_string(),
            detail: "store schema authority and version must be non-empty bounded text",
        })
    }
}

/// Why a consistency-group snapshot could not be captured, opened, or restored.
#[derive(Debug)]
pub enum SnapshotError {
    /// A store descriptor violated the id, segment, or schema grammar.
    InvalidStore {
        /// The offending store id.
        id: String,
        /// The specific grammar violation.
        detail: &'static str,
    },
    /// The consistency group set was empty, oversized, or had duplicate ids.
    InvalidGroup {
        /// The specific group violation.
        detail: &'static str,
    },
    /// A snapshot already exists for this consistency generation; groups are
    /// never silently overwritten.
    AlreadyExists {
        /// The snapshot generation directory that already exists.
        path: PathBuf,
    },
    /// The snapshot manifest is absent — an incomplete or never-committed capture.
    Incomplete,
    /// A recorded member drifted from its captured size or digest, or the
    /// manifest is malformed.
    Unverified {
        /// What failed verification.
        detail: &'static str,
    },
    /// A member location was occupied by a link, reparse point, or non-regular
    /// object.
    UnsafeMember {
        /// The unsafe member path.
        path: PathBuf,
    },
    /// The held guard is not the canonical product installation authority.
    LockAuthority(LockAuthorityError),
    /// A product path could not be derived.
    Path(PathError),
    /// A filesystem operation failed at a named stage.
    Io {
        /// The bounded operation stage.
        stage: &'static str,
        /// The underlying operating-system error.
        source: std::io::Error,
    },
}

impl SnapshotError {
    fn io(stage: &'static str, source: std::io::Error) -> Self {
        Self::Io { stage, source }
    }
}

impl From<LockAuthorityError> for SnapshotError {
    fn from(error: LockAuthorityError) -> Self {
        Self::LockAuthority(error)
    }
}

impl From<PathError> for SnapshotError {
    fn from(error: PathError) -> Self {
        Self::Path(error)
    }
}

impl std::fmt::Display for SnapshotError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidStore { id, detail } => {
                write!(f, "invalid schema-bearing store {id:?}: {detail}")
            }
            Self::InvalidGroup { detail } => write!(f, "invalid consistency group: {detail}"),
            Self::AlreadyExists { path } => {
                write!(f, "consistency snapshot already exists at {path:?}")
            }
            Self::Incomplete => write!(f, "consistency snapshot is incomplete (no manifest)"),
            Self::Unverified { detail } => write!(f, "consistency snapshot unverified: {detail}"),
            Self::UnsafeMember { path } => {
                write!(f, "snapshot member location is unsafe: {path:?}")
            }
            Self::LockAuthority(error) => write!(f, "installation authority rejected: {error}"),
            Self::Path(error) => write!(f, "product path error: {error}"),
            Self::Io { stage, source } => write!(f, "consistency snapshot {stage}: {source}"),
        }
    }
}

impl std::error::Error for SnapshotError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::LockAuthority(error) => Some(error),
            Self::Path(error) => Some(error),
            Self::Io { source, .. } => Some(source),
            _ => None,
        }
    }
}

#[cfg(test)]
#[path = "snapshot/tests.rs"]
mod tests;
