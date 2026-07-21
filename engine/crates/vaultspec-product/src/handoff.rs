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
//! protected DACL, which is the windows-private-file authority (ADR D6): until its
//! real-NTFS D7 evidence retires the gate, the Windows write is a TYPED refusal —
//! never a silent non-restricted write. This module imports NO DACL primitive; it
//! mirrors the credential store's `windows_authority_unavailable` fail-closed
//! shape.

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
    /// The owner-restricted protected-DACL descriptor write requires the
    /// windows-private-file authority (ADR D6), which is not yet provisioned.
    /// The whole Windows update path stays typed-gated until its NTFS D7 evidence
    /// retires the gate — the same fail-closed posture as the credential store.
    WindowsAuthorityUnavailable,
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
            Self::WindowsAuthorityUnavailable => write!(
                f,
                "the owner-restricted descriptor write is unavailable until the \
                 windows-private-file authority is provisioned"
            ),
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
fn write_owner_restricted(_path: &Path, _bytes: &[u8]) -> Result<(), HandoffError> {
    // Fail closed: writing a NON-owner-restricted one-time descriptor would let
    // any local account substitute a hostile update intent. The exact
    // three-principal protected DACL is the windows-private-file authority (D6),
    // provisioned by the other lane; this stub imports none of it.
    Err(HandoffError::WindowsAuthorityUnavailable)
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

    /// On Windows the owner-restricted write is TYPED-GATED (ADR D6) until the
    /// windows-private-file authority lands: it must refuse, never write an
    /// unrestricted one-time descriptor, and must leave no file behind.
    #[cfg(windows)]
    #[test]
    fn the_windows_write_is_typed_gated_and_writes_nothing() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("handoff.json");

        let refused = write_handoff_descriptor(&path, &descriptor());
        assert!(matches!(
            refused,
            Err(HandoffError::WindowsAuthorityUnavailable)
        ));
        assert!(
            !path.exists(),
            "a gated Windows write must not leave a non-owner-restricted descriptor"
        );
    }

    // NOTE: the Unix owner-restricted write (create-new mode 0600 + verify +
    // round-trip) is the primary functional path, but it cannot be verified on
    // the Windows host this lands from. Per the no-unverified-#[cfg(unix)]-test
    // rule, its live proof is a TRACKED GAP (with the OwnedLive success drive,
    // task #61), never an unverified test asserted from Windows.
}
