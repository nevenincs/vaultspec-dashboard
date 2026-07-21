//! The dashboard-side handoff (a2a-product-provisioning W03.P07.S60): copy the
//! target-specific updater OUT of the active release, and write the one-time
//! owner-restricted descriptor the copied updater consumes.
//!
//! This is the WRITE side of the descriptor `super` defines; the updater is the
//! READ side. Both live in one crate so the format cannot drift between them.
//!
//! The owner-restricted WRITE is the security keystone: the descriptor is a
//! one-time handoff, so a descriptor that is not actually owner-restricted would
//! let any local account substitute a hostile update intent. Unix establishes the
//! restriction race-free at create time (mode 0600, `O_EXCL`). Windows requires
//! the exact three-principal protected DACL, which is the windows-private-file
//! authority (ADR D6): until its real-NTFS D7 evidence retires the gate, the
//! Windows write is a TYPED refusal — never a silent non-restricted write. This
//! module imports NO DACL primitive; it mirrors the product's
//! `windows_authority_unavailable` fail-closed shape.

use std::path::{Path, PathBuf};

#[cfg(unix)]
use vaultspec_product::discovery::handoff_is_owner_restricted;

use crate::UpdaterDescriptor;

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
    HandoffError::Io(crate::redact(&error.to_string()))
}

/// Copy the target-specific updater binary OUT of the active release into a
/// staging directory, so it can replace the release — including the installed
/// updater itself — while the seated processes are exited. Returns the copied
/// path. The copy is made under the same file name so the copied updater keeps
/// its identity.
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
        .map_err(|error| HandoffError::Serialize(crate::redact(&error.to_string())))?;
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
            app_home: std::path::PathBuf::from("C:\\vaultspec\\home"),
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
    // round-trip through `read_descriptor`) is the primary functional path, but it
    // cannot be verified on this Windows host. Per the no-unverified-#[cfg(unix)]-
    // test rule, its live proof is a TRACKED GAP (with the OwnedLive success drive,
    // task #61), never an unverified test asserted from here.
}
