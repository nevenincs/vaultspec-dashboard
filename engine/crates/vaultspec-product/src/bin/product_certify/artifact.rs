//! Opening and staging one published product artifact.
//!
//! A published archive is proven against the sibling digest it ships, staged
//! with the same extraction its product-owned installer performs, and exposed
//! as an installed tree whose components can be resolved and whose own member
//! manifest can be verified through the shipped product authority.

use std::ffi::OsString;
use std::io::Read;
use std::path::{Path, PathBuf};

use vaultspec_product::manifest::ComponentLock;
use vaultspec_product::paths::ProductPaths;
use vaultspec_product::product_build::verify_installed_tree;

#[cfg(windows)]
use crate::RESTRICT_WALL;
use crate::command::{CommandFailure, CommandLimits, run_bounded};
use crate::{
    CaseError, DIGEST_CHUNK_BYTES, EMBEDDED_COMPONENT_LOCK, EXTRACT_OUTPUT_CAP, EXTRACT_WALL,
    EvidenceGap, Invocation, MAX_ARCHIVE_BYTES, MAX_MEMBER_MANIFEST_BYTES, RELEASE_MANIFEST,
    describe_code, display, exe_suffix,
};

// The staged artifact
// ---------------------------------------------------------------------------

/// A published archive, opened and staged into the workspace exactly as the
/// product-owned installers stage it: digest-checked, extracted, and available
/// as an installed tree whose commands can be executed.
pub(crate) struct Artifact {
    /// The scratch root every case works under.
    pub(crate) workspace: PathBuf,
    /// The installed product tree extracted from the published archive.
    pub(crate) tree_root: PathBuf,
    /// The trusted component lock every verification is proven against.
    pub(crate) lock: ComponentLock,
    /// The sha256 of the published archive, proven against its sibling digest.
    pub(crate) archive_digest: String,
}

impl Artifact {
    pub(crate) fn open(invocation: &Invocation) -> Result<Self, CaseError> {
        let lock = ComponentLock::parse(EMBEDDED_COMPONENT_LOCK).map_err(|error| {
            CaseError::Unavailable(EvidenceGap::TrustAuthorityInvalid {
                detail: error.to_string(),
            })
        })?;

        let artifact = &invocation.artifact;
        if !artifact.is_file() {
            return Err(EvidenceGap::ArtifactAbsent {
                path: display(artifact),
            }
            .into());
        }
        let shape =
            ArchiveShape::of(artifact).ok_or_else(|| EvidenceGap::ArtifactNotAnArchive {
                path: display(artifact),
            })?;

        let archive_digest = prove_archive_digest(artifact)?;

        let workspace = &invocation.workspace;
        std::fs::create_dir_all(workspace)
            .map_err(|error| CaseError::failed(format!("cannot create the workspace: {error}")))?;
        let tree_root = workspace.join("installed");
        if tree_root.exists() {
            std::fs::remove_dir_all(&tree_root).map_err(|error| {
                CaseError::failed(format!("cannot clear the staging root: {error}"))
            })?;
        }
        std::fs::create_dir_all(&tree_root).map_err(|error| {
            CaseError::failed(format!("cannot create the staging root: {error}"))
        })?;

        shape.extract(artifact, &tree_root)?;

        Ok(Self {
            workspace: workspace.clone(),
            tree_root,
            lock,
            archive_digest,
        })
    }

    /// The installed dashboard executable, or a typed gap naming its absence.
    pub(crate) fn dashboard(&self) -> Result<PathBuf, EvidenceGap> {
        self.installed(
            "dashboard executable",
            &format!("bin/vaultspec{}", exe_suffix()),
        )
    }

    /// The installed frozen A2A runtime executable, or a typed gap.
    pub(crate) fn a2a_runtime(&self) -> Result<PathBuf, EvidenceGap> {
        self.installed(
            "frozen A2A runtime",
            &format!("a2a/vaultspec-a2a{}", exe_suffix()),
        )
    }

    pub(crate) fn installed(
        &self,
        component: &'static str,
        relative: &str,
    ) -> Result<PathBuf, EvidenceGap> {
        let path = self.tree_root.join(relative);
        if path.is_file() {
            Ok(path)
        } else {
            Err(EvidenceGap::ComponentAbsent {
                component,
                relative: relative.to_string(),
            })
        }
    }

    /// Whether this artifact's own member manifest declares a bundled a2a
    /// runtime at all.
    ///
    /// Read from the installed manifest rather than inferred from a missing
    /// file, because the two conditions mean opposite things: a manifest that
    /// OMITS `a2a_component` describes a product built without the runtime, and
    /// a manifest that DECLARES one over a tree that does not carry it describes
    /// a broken install. Only the first is a reason to skip a runtime case.
    pub(crate) fn declares_a2a_component(&self) -> Result<bool, CaseError> {
        let manifest = self.tree_root.join(RELEASE_MANIFEST);
        let size = std::fs::metadata(&manifest)
            .map_err(|error| {
                CaseError::failed(format!(
                    "cannot read {RELEASE_MANIFEST} at {}: {error}",
                    display(&manifest)
                ))
            })?
            .len();
        if size > MAX_MEMBER_MANIFEST_BYTES {
            return Err(CaseError::failed(format!(
                "{RELEASE_MANIFEST} is {size} bytes, above the {MAX_MEMBER_MANIFEST_BYTES}-byte bound"
            )));
        }
        let raw = std::fs::read_to_string(&manifest).map_err(|error| {
            CaseError::failed(format!("cannot read {RELEASE_MANIFEST}: {error}"))
        })?;
        let value: serde_json::Value = serde_json::from_str(&raw).map_err(|error| {
            CaseError::failed(format!("{RELEASE_MANIFEST} is invalid: {error}"))
        })?;
        Ok(value.get("a2a_component").is_some())
    }

    /// The installed frozen A2A runtime a runtime case must drive, or the reason
    /// there is nothing to drive.
    ///
    /// A product built WITHOUT the bundled runtime has no subject for such a
    /// case, and says so in its own manifest: the case reports NOT APPLICABLE
    /// and the run is not held back. A product that declares the runtime and
    /// does not carry it is a real gap and still reports one.
    pub(crate) fn required_a2a_runtime(&self) -> Result<PathBuf, CaseError> {
        match self.a2a_runtime() {
            Ok(path) => Ok(path),
            Err(gap) => {
                if self.declares_a2a_component()? {
                    Err(gap.into())
                } else {
                    Err(CaseError::not_applicable(format!(
                        "not applicable: no bundled runtime - {RELEASE_MANIFEST} declares no a2a_component, so this product carries no frozen A2A runtime to drive ({gap})"
                    )))
                }
            }
        }
    }

    /// Bind a case to the real published artifact before it drives anything.
    ///
    /// A runtime case reasons about the installation the artifact establishes,
    /// so it must not certify a property against product state alone: without
    /// the real installed components there is no installation to certify, and
    /// the case reports its evidence unavailable instead.
    ///
    /// The bundled A2A runtime is deliberately NOT bound here. It is optional in
    /// a composed product tree, so requiring it would turn every case that
    /// merely needs a real installation into a case that needs a runtime; the
    /// cases that genuinely drive one resolve it through
    /// [`Self::required_a2a_runtime`], which distinguishes a product that never
    /// carried one from an install that lost it.
    pub(crate) fn bind_to_real_components(&self) -> Result<(), CaseError> {
        self.dashboard()?;
        Ok(())
    }

    /// The product state authority for this installation, rooted at a machine
    /// app home that is deliberately OUTSIDE the installed tree. Every runtime
    /// case drives the installation's own authority here.
    pub(crate) fn product_paths(&self) -> Result<ProductPaths, CaseError> {
        establish_product_state(&self.workspace.join("app-home"), "product")
    }

    /// A product state authority under its OWN machine app home, so a case that
    /// lays down real generations, journals, and snapshots cannot contaminate
    /// the state another case reasons about. Every path still derives from the
    /// product's own authority — only the app home differs.
    pub(crate) fn product_paths_named(&self, label: &str) -> Result<ProductPaths, CaseError> {
        establish_product_state(&self.workspace.join(format!("app-home-{label}")), label)
    }

    /// Prove the tree at `root` matches its own member manifest through the
    /// shipped product authority under the embedded trusted lock.
    pub(crate) fn prove_tree(&self, root: &Path) -> Result<(), CaseError> {
        verify_installed_tree(root, RELEASE_MANIFEST, &self.lock).map_err(|error| {
            CaseError::failed(format!(
                "installed tree at {} does not match its own {RELEASE_MANIFEST}: {error}",
                display(root)
            ))
        })
    }
}

/// The published archive shapes and the extraction each product-owned installer
/// performs for them.
#[derive(Debug, Clone, Copy)]
pub(crate) enum ArchiveShape {
    Zip,
    TarGz,
}

impl ArchiveShape {
    pub(crate) fn of(path: &Path) -> Option<Self> {
        let name = path.file_name()?.to_str()?.to_ascii_lowercase();
        if name.ends_with(".zip") {
            Some(Self::Zip)
        } else if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
            Some(Self::TarGz)
        } else {
            None
        }
    }

    /// Extract into `dest` with the same tool the product-owned installer for
    /// this shape uses, under an output cap and a wall clock.
    pub(crate) fn extract(self, archive: &Path, dest: &Path) -> Result<(), CaseError> {
        let (tool, args) = match self {
            Self::Zip if cfg!(windows) => (
                "powershell.exe".to_string(),
                vec![
                    OsString::from("-NoProfile"),
                    OsString::from("-NonInteractive"),
                    OsString::from("-Command"),
                    OsString::from(format!(
                        "Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
                        display(archive),
                        display(dest)
                    )),
                ],
            ),
            Self::Zip => (
                "unzip".to_string(),
                vec![
                    OsString::from("-q"),
                    archive.as_os_str().to_owned(),
                    OsString::from("-d"),
                    dest.as_os_str().to_owned(),
                ],
            ),
            Self::TarGz => (
                "tar".to_string(),
                vec![
                    OsString::from("-xzf"),
                    archive.as_os_str().to_owned(),
                    OsString::from("-C"),
                    dest.as_os_str().to_owned(),
                ],
            ),
        };
        let limits = CommandLimits {
            output_cap: EXTRACT_OUTPUT_CAP,
            wall: EXTRACT_WALL,
        };
        match run_bounded(Path::new(&tool), &args, &[], None, limits) {
            Ok(outcome) if outcome.code == Some(0) => Ok(()),
            Ok(outcome) => Err(CaseError::failed(format!(
                "extracting the published archive exited {}: {}",
                describe_code(outcome.code),
                outcome.text()
            ))),
            Err(CommandFailure::Spawn(error)) => Err(EvidenceGap::ExtractionToolUnavailable {
                tool,
                detail: error.to_string(),
            }
            .into()),
            Err(other) => Err(CaseError::failed(format!(
                "extracting the published archive {other}"
            ))),
        }
    }
}

/// Establish one product state root the way a product-owned installer does.
///
/// The product's own path authority creates the layout, and the directories its
/// retained-generation authority requires to be owner-private are then made
/// owner-private. That authority REFUSES a product tree an ordinary peer account
/// could write, so a certifier that skipped this would be driving cases against a
/// tree the product itself would never accept.
pub(crate) fn establish_product_state(
    app_home: &Path,
    label: &str,
) -> Result<ProductPaths, CaseError> {
    let paths = ProductPaths::under_app_home(app_home);
    paths.ensure().map_err(|error| {
        CaseError::failed(format!(
            "cannot establish the {label} product app home: {error}"
        ))
    })?;
    for directory in [
        paths.root().to_path_buf(),
        paths.generations_dir(),
        paths.app_home(),
    ] {
        restrict_to_owner(&directory)?;
    }
    Ok(paths)
}

/// Make one product directory owner-private, as a product-owned installer does.
///
/// On Unix that is the owner-only mode; on Windows it is the access control the
/// product's directory authority demands — inheritance broken, the ordinary-users
/// group removed, and full control left to this account, the system account, and
/// the built-in administrators. The Windows path goes through a real process, so
/// it carries both an output cap and a wall clock like every other process this
/// tool spawns.
#[cfg(unix)]
fn restrict_to_owner(directory: &Path) -> Result<(), CaseError> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(directory, std::fs::Permissions::from_mode(0o700)).map_err(|error| {
        CaseError::failed(format!(
            "cannot restrict {} to its owner: {error}",
            display(directory)
        ))
    })
}

#[cfg(windows)]
fn restrict_to_owner(directory: &Path) -> Result<(), CaseError> {
    {
        let account = current_account()?;
        let grant = format!("{account}:(OI)(CI)F");
        let limits = CommandLimits {
            output_cap: EXTRACT_OUTPUT_CAP,
            wall: RESTRICT_WALL,
        };
        for args in [
            vec![
                directory.as_os_str().to_owned(),
                OsString::from("/remove:g"),
                OsString::from("*S-1-5-32-545"),
            ],
            vec![
                directory.as_os_str().to_owned(),
                OsString::from("/inheritance:r"),
                OsString::from("/grant:r"),
                OsString::from(grant.clone()),
                OsString::from("/grant"),
                OsString::from("*S-1-5-18:(OI)(CI)F"),
                OsString::from("/grant"),
                OsString::from("*S-1-5-32-544:(OI)(CI)F"),
            ],
        ] {
            let outcome = run_bounded(Path::new("icacls.exe"), &args, &[], None, limits).map_err(
                |failure| CaseError::failed(format!("the directory restriction {failure}")),
            )?;
            if outcome.code != Some(0) {
                return Err(CaseError::failed(format!(
                    "restricting {} exited {}: {}",
                    display(directory),
                    describe_code(outcome.code),
                    outcome.text()
                )));
            }
        }
        Ok(())
    }
}

/// The account this process runs as, read from the host rather than assumed.
#[cfg(windows)]
fn current_account() -> Result<String, CaseError> {
    let limits = CommandLimits {
        output_cap: EXTRACT_OUTPUT_CAP,
        wall: RESTRICT_WALL,
    };
    let outcome = run_bounded(Path::new("whoami.exe"), &[], &[], None, limits)
        .map_err(|failure| CaseError::failed(format!("the account probe {failure}")))?;
    if outcome.code != Some(0) {
        return Err(CaseError::failed(format!(
            "the account probe exited {}",
            describe_code(outcome.code)
        )));
    }
    let account = String::from_utf8_lossy(&outcome.stdout).trim().to_string();
    if account.is_empty() {
        return Err(CaseError::failed(
            "the host reported no account for this process".to_string(),
        ));
    }
    Ok(account)
}

/// Digest the published archive with a bounded streaming read and prove it
/// against the sibling `.sha256` every published archive ships.
pub(crate) fn prove_archive_digest(archive: &Path) -> Result<String, CaseError> {
    let sibling = sibling_digest_path(archive);
    if !sibling.is_file() {
        return Err(EvidenceGap::ArchiveDigestUnavailable {
            sibling: display(&sibling),
        }
        .into());
    }
    let declared_raw = std::fs::read_to_string(&sibling)
        .map_err(|error| CaseError::failed(format!("cannot read the sibling digest: {error}")))?;
    let declared = declared_raw
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();

    let observed = digest_file(archive)?;
    if declared != observed {
        return Err(CaseError::failed(format!(
            "published archive digest {observed} does not match its sibling digest {declared}"
        )));
    }
    Ok(observed)
}

pub(crate) fn sibling_digest_path(archive: &Path) -> PathBuf {
    let mut name = archive.file_name().unwrap_or_default().to_os_string();
    name.push(".sha256");
    archive.with_file_name(name)
}

/// Stream a file through SHA-256 in bounded chunks, refusing anything past the
/// fixed archive ceiling rather than reading it into memory.
pub(crate) fn digest_file(path: &Path) -> Result<String, CaseError> {
    use sha2::{Digest as _, Sha256};

    let mut file = std::fs::File::open(path).map_err(|error| {
        CaseError::failed(format!("cannot open the published archive: {error}"))
    })?;
    let mut hasher = Sha256::new();
    let mut chunk = vec![0_u8; DIGEST_CHUNK_BYTES];
    let mut total: u64 = 0;
    loop {
        let read = file.read(&mut chunk).map_err(|error| {
            CaseError::failed(format!("reading the published archive: {error}"))
        })?;
        if read == 0 {
            break;
        }
        total = total.saturating_add(read as u64);
        if total > MAX_ARCHIVE_BYTES {
            return Err(CaseError::failed(
                "the published archive exceeds the certifier's fixed archive ceiling".to_string(),
            ));
        }
        hasher.update(&chunk[..read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// The streaming digest agrees with the one-shot digest of the same bytes.
    #[test]
    fn the_streaming_digest_matches_the_whole_file_digest() {
        use sha2::{Digest as _, Sha256};

        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("payload.bin");
        let bytes: Vec<u8> = (0..DIGEST_CHUNK_BYTES * 3 + 17)
            .map(|index| (index % 251) as u8)
            .collect();
        std::fs::write(&path, &bytes).unwrap();
        let expected: String = Sha256::digest(&bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        assert_eq!(digest_file(&path).unwrap(), expected);
    }
}
