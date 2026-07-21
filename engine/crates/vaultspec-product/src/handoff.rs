//! The one-time dashboard→updater handoff CONTRACT (a2a-product-provisioning
//! W03.P07): the descriptor schema plus the owner-restricted WRITE and the
//! copy-out.
//!
//! Placement is by dependency direction: the DASHBOARD (the running seat, the
//! product and api crates) WRITES this descriptor and spawns the copied updater;
//! the UPDATER READS it. Both already depend on `vaultspec-product`, so the shared
//! contract lives here — the dashboard writes it product-side and the updater
//! reads it via its existing `vaultspec-updater` to `vaultspec-product` edge, with
//! no backwards dependency onto the leaf updater binary. The runtime-input
//! assembly and the read/drive orchestration live in the updater crate over these
//! types.
//!
//! The descriptor is SECRET-FREE (paths + ids + declarative update facts, never a
//! credential). The owner-restricted WRITE is the keystone: a one-time descriptor
//! that is not actually owner-restricted would let any local account substitute a
//! hostile update intent. Unix establishes the restriction race-free at create
//! time (mode 0600, `O_EXCL`). Windows requires the exact three-principal
//! protected DACL, established through the reviewed windows-private-file authority
//! (windows-private-file-authority D1/D5, D6 un-gated): the descriptor file is
//! created EMPTY via [`PrivateFileCreation`] (which carries `WRITE_DAC`), hardened
//! to the exact three-principal protected list through its retained handle BEFORE
//! any descriptor byte is written, and only then written, synchronized,
//! same-handle reread, and re-proven. The owner-restriction PROOF on both
//! platforms routes through one shared authority — Unix `handoff_is_owner_restricted`,
//! Windows `private_policy::validate_private_file` over one DACL snapshot — so a
//! harden that produced any non-conforming DACL fails closed and the residue is
//! removed; a non-owner-restricted one-time descriptor is never left behind.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[cfg(unix)]
use crate::discovery::handoff_is_owner_restricted;
use crate::manifest::RangeBounds;
use crate::receipt::{Channel, PriorSeatIdentity};

/// The one-time, owner-restricted handoff descriptor the dashboard writes for the
/// copied updater. It carries no secret: the machine app home the updater derives
/// its product paths from, the installation-lock owner id, the optional prior-seat
/// relaunch instruction, and — when the handoff drives a fresh update — the
/// declarative [`ExecuteIntent`].
///
/// A descriptor WITHOUT an execute-intent is a pure recovery handoff (acquire the
/// lock, retire the descriptor, recover any interrupted transaction). One WITH an
/// intent additionally drives a fresh update. The intent CONTENT joins the
/// descriptor now; WRITING the descriptor under the owner-restricted protected
/// DACL is the S60 cutover, gated on the windows-private-file authority.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdaterDescriptor {
    /// Descriptor grammar version.
    pub version: u8,
    /// The machine app home the updater derives its product paths from.
    pub app_home: PathBuf,
    /// The installation-lock owner id the updater acquires under.
    pub owner: String,
    /// How to relaunch the prior seat after the run, when one should be relaunched.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relaunch: Option<RelaunchSpec>,
    /// The fresh-update execute-intent, when this handoff drives an update. Absent
    /// for a pure recovery handoff.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub execute: Option<ExecuteIntent>,
}

/// How the updater relaunches the prior seat after completing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RelaunchSpec {
    /// The workspace directory to relaunch the seat in.
    pub workspace: PathBuf,
}

/// One schema-bearing store, as a declarative descriptor fact.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StoreIntent {
    /// The stable store id.
    pub id: String,
    /// The store's app-home-relative path segments.
    pub segments: Vec<String>,
    /// The store's declared schema authority.
    pub schema_authority: String,
    /// The store's declared schema version.
    pub schema_version: String,
}

/// The declarative fresh-update execute-intent the dashboard writes into the
/// one-time descriptor. Every field is a serde-safe fact the dashboard observes
/// on the CURRENT install at descriptor-write time; the updater assembles the
/// runtime inputs from it, resolving the two runtime bits (the updater's current
/// time as the drain freshness clock, and the staged-bundle path as the migration
/// capsule root). The staged-bundle path carries ZERO trust weight — a wrong path
/// just fails TUF or capsule resolution, both typed refusals.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExecuteIntent {
    /// The staged release bundle directory (`metadata/` + `targets/`): the verify
    /// target AND the migration capsule root.
    pub staged_bundle: PathBuf,
    /// The consistency-group generation to snapshot and restore.
    pub consistency_generation: u64,
    /// The final-name candidate generation to activate.
    pub candidate_generation: String,
    /// The retained prior generation a rollback re-selects, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prior_generation: Option<String>,
    /// The install/update channel whose activation authority applies.
    pub channel: Channel,
    /// The target release-set head this update lands.
    pub target_head: String,
    /// How recent a discovered heartbeat must be to count as fresh.
    pub freshness_ms: i64,
    /// The gateway API version range the installed release set supports.
    pub supported_protocol: RangeBounds,
    /// The packaged state-schema range the installed release set supports.
    pub supported_state_schema: RangeBounds,
    /// Drain-call I/O budget (milliseconds).
    pub drain_call_ms: u64,
    /// Post-shutdown process-exit budget (milliseconds).
    pub stop_ms: u64,
    /// Liveness poll interval (milliseconds).
    pub poll_ms: u64,
    /// The schema-bearing stores captured as one consistency group.
    pub stores: Vec<StoreIntent>,
    /// The prior-seat descriptor to include in the group, if one exists.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prior_seat: Option<PriorSeatIdentity>,
    /// The capsule-relative segments of the staged migration program.
    pub migration_program: Vec<String>,
    /// The staged migration arguments.
    #[serde(default)]
    pub migration_args: Vec<String>,
    /// The captured-output byte cap for the migration invocation.
    pub migration_output_cap: u64,
    /// The wall-clock timeout for the migration invocation (milliseconds).
    pub migration_wall_ms: u64,
    /// The currently-installed schema head the dashboard observed. `None` means a
    /// fresh install; a stale value fails closed as a typed incompatible range.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub installed_schema_head: Option<String>,
    /// The candidate migration range base.
    pub migration_base: String,
    /// The candidate migration range head.
    pub migration_head: String,
}

/// Why the dashboard-side handoff could not complete. Bounded and secret-free.
#[derive(Debug)]
pub enum HandoffError {
    /// The descriptor could not be serialized.
    Serialize(String),
    /// A bounded, secret-redacted I/O error.
    Io(String),
    /// The updater binary path had no file name to copy under.
    UnnamedUpdater,
    /// The descriptor was written but is not owner-restricted; it has been
    /// removed rather than left as an unrestricted one-time handoff.
    NotOwnerRestricted,
}

impl std::fmt::Display for HandoffError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Serialize(detail) => {
                write!(f, "handoff descriptor serialization failed: {detail}")
            }
            Self::Io(detail) => write!(f, "handoff io error: {detail}"),
            Self::UnnamedUpdater => write!(f, "the release updater path has no file name"),
            Self::NotOwnerRestricted => {
                write!(
                    f,
                    "the written descriptor was not owner-restricted and was removed"
                )
            }
        }
    }
}

impl std::error::Error for HandoffError {}

fn io(error: &std::io::Error) -> HandoffError {
    HandoffError::Io(redact(&error.to_string()))
}

/// Redact a diagnostic to a bounded, secret-free form.
fn redact(detail: &str) -> String {
    const MAX: usize = 200;
    let mut out: String = detail
        .chars()
        .filter(|c| !c.is_control())
        .take(MAX)
        .collect();
    if detail.chars().count() > MAX {
        out.push('…');
    }
    out
}

/// Copy the target-specific updater binary OUT of the active release into a
/// staging directory, so it can replace the release — including the installed
/// updater itself — while the seated processes are exited. Returns the copied
/// path, under the same file name so the copied updater keeps its identity.
pub fn copy_updater_out(release_updater: &Path, dest_dir: &Path) -> Result<PathBuf, HandoffError> {
    std::fs::create_dir_all(dest_dir).map_err(|error| io(&error))?;
    let name = release_updater
        .file_name()
        .ok_or(HandoffError::UnnamedUpdater)?;
    let dest = dest_dir.join(name);
    std::fs::copy(release_updater, &dest).map_err(|error| io(&error))?;
    Ok(dest)
}

/// Write the one-time OWNER-RESTRICTED handoff descriptor.
///
/// Unix: create-new (`O_EXCL`) at mode `0600` so the restriction holds from the
/// first byte, write, synchronize, then VERIFY the result is owner-restricted
/// before returning — a descriptor that somehow is not restricted is removed and
/// refused. Windows: TYPED-GATED per ADR D6 (see the module docs).
pub fn write_handoff_descriptor(
    path: &Path,
    descriptor: &UpdaterDescriptor,
) -> Result<(), HandoffError> {
    let bytes = serde_json::to_vec(descriptor)
        .map_err(|error| HandoffError::Serialize(redact(&error.to_string())))?;
    write_owner_restricted(path, &bytes)
}

#[cfg(unix)]
fn write_owner_restricted(path: &Path, bytes: &[u8]) -> Result<(), HandoffError> {
    use std::io::Write as _;
    use std::os::unix::fs::OpenOptionsExt as _;

    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)
        .map_err(|error| io(&error))?;
    file.write_all(bytes).map_err(|error| io(&error))?;
    file.sync_all().map_err(|error| io(&error))?;
    // The restriction is established at create time; verify it held before the
    // descriptor is handed off.
    if !handoff_is_owner_restricted(path) {
        let _ = std::fs::remove_file(path);
        return Err(HandoffError::NotOwnerRestricted);
    }
    Ok(())
}

#[cfg(windows)]
fn write_owner_restricted(path: &Path, bytes: &[u8]) -> Result<(), HandoffError> {
    windows_owner_restricted::create_hardened_descriptor(path, bytes)
}

/// The Windows owner-restricted descriptor write, composing the reviewed
/// windows-private-file authority (windows-private-file-authority D1/D5) with the
/// safe `windows-acl` handle-mutation layer — the same create → harden → write →
/// re-prove shape the credential store uses (`credentials::windows`), but for the
/// secret-free handoff descriptor. It adds no unsafe and no native call; the
/// owner-restriction PROOF is the shared `private_policy` validator over one DACL
/// snapshot, so a harden that produced any non-conforming DACL fails closed here.
///
/// NOTE (dedup follow-on): the three-principal harden below mirrors
/// `credentials::windows::create_hardened_file`. The ideal end-state is one shared
/// owner-restricted private-file writer (a safe helper in `vaultspec-windows-authority`,
/// or a `pub(crate)` reuse of the credential helper) so the protected-DACL
/// INSTALLATION has a single source. That refactor touches the other lane's
/// credential/authority files and is deferred until the windows-private-file
/// surface settles; the shared `private_policy` validator already gives both
/// copies one PROOF, so a divergence fails closed rather than passing silently.
#[cfg(windows)]
mod windows_owner_restricted {
    use std::os::windows::io::AsRawHandle as _;
    use std::path::Path;

    use vaultspec_windows_authority::{DaclAceKind, PrivateFileCreation, private_policy};
    use windows_acl::acl::{ACL, AceType};

    use super::{HandoffError, io, redact};

    const SYSTEM_SID: &str = "S-1-5-18";
    const ADMINISTRATORS_SID: &str = "S-1-5-32-544";
    const FILE_ALL_ACCESS: u32 = 0x001f_01ff;
    // A regular file carries no inheritance flags (a directory would be 0x03).
    const FILE_ACE_FLAGS: u8 = 0x00;

    pub(super) fn create_hardened_descriptor(
        path: &Path,
        bytes: &[u8],
    ) -> Result<(), HandoffError> {
        // Create-new: if the name already exists this fails BEFORE we own any
        // residue, so an existing descriptor is never touched. Only a file we
        // exclusively created reaches the cleanup arm below.
        let mut created = PrivateFileCreation::create(path).map_err(|error| io(&error))?;
        match harden_and_write(&mut created, bytes) {
            Ok(()) => Ok(()),
            Err(error) => {
                // Delete the EXACT file we created through its retained handle —
                // no pathname lookup, so this can never remove a different file
                // that raced onto the name. Dropping `created` closes the handle
                // and applies the deletion.
                let _ = created.mark_delete_on_close();
                drop(created);
                Err(error)
            }
        }
    }

    fn harden_and_write(
        created: &mut PrivateFileCreation,
        bytes: &[u8],
    ) -> Result<(), HandoffError> {
        let current = current_user_sid().map_err(|error| io(&error))?;

        // Harden the EMPTY file to the exact three-principal protected DACL
        // through its retained WRITE_DAC handle, BEFORE any descriptor byte is
        // written — closing the pre-permission window.
        harden(created, &current).map_err(|error| io(&error))?;

        // The owner-restriction PROOF: one snapshot, protected + exact
        // three-principal list. A non-conforming DACL fails closed here.
        prove_owner_restricted(created, &current)?;

        // Only now, with the restriction proven, write + synchronize + same-handle
        // reread the descriptor bytes, then re-prove the protected list.
        write_sync_reread(created.file_mut(), bytes)?;
        if created.link_count().map_err(|error| io(&error))? != 1 {
            return Err(HandoffError::NotOwnerRestricted);
        }
        created.revalidate().map_err(|error| io(&error))?;
        prove_owner_restricted(created, &current)
    }

    fn prove_owner_restricted(
        created: &PrivateFileCreation,
        current: &str,
    ) -> Result<(), HandoffError> {
        let snapshot = created.dacl_snapshot().map_err(|error| io(&error))?;
        private_policy::validate_private_file(&snapshot, current)
            .map_err(|_| HandoffError::NotOwnerRestricted)
    }

    /// Install exactly the three conforming allow entries and remove every other
    /// entry, driven by the single DACL snapshot (safe `windows-acl` mutation).
    fn harden(created: &PrivateFileCreation, current: &str) -> std::io::Result<()> {
        let mut acl = ACL::from_file_handle(
            created.file().as_raw_handle() as *mut winapi::ctypes::c_void,
            false,
        )
        .map_err(win_error)?;
        for sid_text in [current, SYSTEM_SID, ADMINISTRATORS_SID] {
            let sid = windows_acl::helper::string_to_sid(sid_text).map_err(win_error)?;
            acl.add_entry(
                sid.as_ptr().cast_mut().cast(),
                AceType::AccessAllow,
                FILE_ACE_FLAGS,
                FILE_ALL_ACCESS,
            )
            .map_err(win_error)?;
        }
        for entry in created.dacl_snapshot()?.entries() {
            let sid = entry.sid();
            let known = sid == current || sid == SYSTEM_SID || sid == ADMINISTRATORS_SID;
            let conforming = entry.entry_type() == DaclAceKind::AccessAllowed
                && known
                && entry.flags() == FILE_ACE_FLAGS
                && entry.mask() == FILE_ALL_ACCESS
                && !entry.inherited();
            if !conforming {
                let sid = windows_acl::helper::string_to_sid(entry.sid()).map_err(win_error)?;
                let ace_type = match entry.entry_type() {
                    DaclAceKind::AccessAllowed => AceType::AccessAllow,
                    DaclAceKind::AccessDenied => AceType::AccessDeny,
                };
                acl.remove_entry(
                    sid.as_ptr().cast_mut().cast(),
                    Some(ace_type),
                    Some(entry.flags()),
                )
                .map_err(win_error)?;
            }
        }
        Ok(())
    }

    fn write_sync_reread(file: &mut std::fs::File, bytes: &[u8]) -> Result<(), HandoffError> {
        use std::io::{Read as _, Seek as _, Write as _};
        file.rewind().map_err(|error| io(&error))?;
        file.set_len(0).map_err(|error| io(&error))?;
        file.write_all(bytes).map_err(|error| io(&error))?;
        file.sync_all().map_err(|error| io(&error))?;
        file.rewind().map_err(|error| io(&error))?;
        let mut back = vec![0_u8; bytes.len().saturating_add(1)];
        let mut used = 0;
        while used < back.len() {
            let read = file.read(&mut back[used..]).map_err(|error| io(&error))?;
            if read == 0 {
                break;
            }
            used += read;
        }
        if &back[..used] != bytes {
            return Err(HandoffError::Io(redact(
                "handoff descriptor same-handle reread differs",
            )));
        }
        Ok(())
    }

    // Exposed to the parent module for the owner-restriction proof in tests, which
    // validates the reopened DACL against this exact principal.
    pub(super) fn current_user_sid() -> std::io::Result<String> {
        let name = windows_acl::helper::current_user()
            .ok_or_else(|| std::io::Error::other("current Windows user is unavailable"))?;
        let sid = windows_acl::helper::name_to_sid(&name, None).map_err(win_error)?;
        windows_acl::helper::sid_to_string(sid.as_ptr().cast_mut().cast()).map_err(win_error)
    }

    fn win_error(code: u32) -> std::io::Error {
        std::io::Error::from_raw_os_error(code as i32)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copy_updater_out_copies_under_the_same_name() {
        let temp = tempfile::tempdir().unwrap();
        let release = temp.path().join("release");
        std::fs::create_dir_all(&release).unwrap();
        let updater = release.join(if cfg!(windows) {
            "vaultspec-updater.exe"
        } else {
            "vaultspec-updater"
        });
        std::fs::write(&updater, b"updater-bytes").unwrap();

        let staging = temp.path().join("staging");
        let copied = copy_updater_out(&updater, &staging).expect("copy out");

        assert_eq!(copied.file_name(), updater.file_name());
        assert_eq!(std::fs::read(&copied).unwrap(), b"updater-bytes");
    }

    #[test]
    fn copy_updater_out_refuses_a_pathless_source() {
        let temp = tempfile::tempdir().unwrap();
        // A root/prefix path has no file name to copy under.
        let refused = copy_updater_out(Path::new("/"), temp.path());
        assert!(matches!(
            refused,
            Err(HandoffError::UnnamedUpdater | HandoffError::Io(_))
        ));
    }

    #[cfg(windows)]
    fn descriptor() -> UpdaterDescriptor {
        UpdaterDescriptor {
            version: 1,
            app_home: PathBuf::from("C:\\vaultspec\\home"),
            owner: "owner-1".to_string(),
            relaunch: None,
            execute: None,
        }
    }

    /// On Windows the owner-restricted write now establishes the exact
    /// three-principal protected DACL through the reviewed windows-private-file
    /// authority (D6 un-gated). This runs on a real NTFS temp directory: it
    /// writes, then PROVES the descriptor is owner-restricted with the same
    /// `private_policy` validator the production read path uses, and round-trips
    /// the descriptor bytes.
    #[cfg(windows)]
    #[test]
    fn the_windows_write_establishes_an_owner_restricted_descriptor() {
        use vaultspec_windows_authority::{ReadOnlyAuthorityFile, private_policy};

        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("handoff.json");
        let descriptor = descriptor();

        write_handoff_descriptor(&path, &descriptor).expect("owner-restricted write");
        assert!(path.exists(), "the descriptor must be written");

        // Prove owner-restriction from a fresh read-only reopen: one DACL
        // snapshot, validated by the shared authority against the current user.
        let sid = windows_owner_restricted::current_user_sid().expect("current user sid");
        let reader = ReadOnlyAuthorityFile::open_private_readonly(&path).expect("reopen readonly");
        let snapshot = reader.dacl_snapshot().expect("dacl snapshot");
        assert!(
            snapshot.protected(),
            "the descriptor DACL must be protected"
        );
        private_policy::validate_private_file(&snapshot, &sid)
            .expect("the descriptor must carry the exact three-principal protected DACL");

        // The descriptor round-trips through the owner-restricted file.
        let bytes = reader.read_bounded(4096).expect("read back");
        let parsed: UpdaterDescriptor = serde_json::from_slice(&bytes).expect("parse");
        assert_eq!(parsed, descriptor);
    }

    /// A create-new write refuses to clobber an existing descriptor and —
    /// critically — does NOT delete the pre-existing file when it fails. The
    /// residue cleanup is scoped through the retained handle to a file THIS call
    /// created, so a name that already exists is refused and left untouched.
    #[cfg(windows)]
    #[test]
    fn the_windows_write_refuses_and_preserves_an_existing_descriptor() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("handoff.json");

        write_handoff_descriptor(&path, &descriptor()).expect("first write");
        let before = std::fs::read(&path).expect("read first");

        let second = write_handoff_descriptor(&path, &descriptor());
        assert!(
            matches!(second, Err(HandoffError::Io(_))),
            "create-new must refuse an existing name"
        );
        assert!(
            path.exists(),
            "a refused re-write must not delete the existing descriptor"
        );
        assert_eq!(
            std::fs::read(&path).expect("read after"),
            before,
            "the existing descriptor is left untouched"
        );
    }

    // NOTE: the Unix owner-restricted write (create-new mode 0600 + verify +
    // round-trip) is the primary functional path there, but it cannot be verified
    // on the Windows host this lands from. Per the no-unverified-#[cfg(unix)]-test
    // rule, its live proof is a TRACKED GAP (with the OwnedLive success drive,
    // task #61), never an unverified test asserted from Windows.
}
