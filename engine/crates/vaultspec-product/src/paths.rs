//! Product-owned path authority (a2a-product-provisioning W01.P01.S07).
//!
//! Every install, generation, app-home, transaction, staging, snapshot, and
//! updater location derives from product state — the machine app home, never a
//! client-supplied path string. ADR D3: "Targets and install roots derive from
//! product state, never client path strings." The lifecycle plane accepts typed
//! intent, and a generation identifier is the *only* caller-influenced token; it
//! is validated to a strict `[A-Za-z0-9._-]` grammar with no separators and no
//! `..`, so it can never escape the product root.
//!
//! Layout under the product root (`<app home>/a2a`):
//!
//! ```text
//! <root>/
//!   generations/<gen-id>/   immutable release-set trees
//!   app-home/               mutable state: sqlite, discovery, credentials,
//!     credentials/          owner-restricted control + IPC credentials
//!     snapshots/<gen>/      consistency-group snapshots
//!     receipt.json          legacy receipt retained during migration
//!     active-receipts.v1    fixed active-receipt authority journal
//!   transaction/            copied-updater transaction directories
//!   staging/                staged candidate generation
//!   updater/                the copied external updater helper
//! ```

use std::path::{Path, PathBuf};

/// Why a product path could not be derived.
#[derive(Debug)]
pub enum PathError {
    /// No machine home variable was set, so the app home cannot be resolved.
    NoAppHome,
    /// A generation identifier failed the strict grammar and was refused before
    /// it could be interpolated into a path.
    InvalidGeneration(String),
}

impl std::fmt::Display for PathError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PathError::NoAppHome => write!(
                f,
                "cannot resolve the machine app home (no VAULTSPEC_APP_HOME, USERPROFILE, or HOME)"
            ),
            PathError::InvalidGeneration(g) => {
                write!(
                    f,
                    "invalid generation identifier {g:?}: expected at most 128 bytes of [A-Za-z0-9._-] with no separators or .."
                )
            }
        }
    }
}

impl std::error::Error for PathError {}

/// The product's derived path set, rooted at the machine app home. Constructed
/// with no caller path argument; the only external influence is a generation
/// identifier, validated before use.
#[derive(Debug, Clone)]
pub struct ProductPaths {
    root: PathBuf,
}

impl ProductPaths {
    /// Derive the product paths from the machine app home. `VAULTSPEC_APP_HOME`
    /// overrides for tests and harness isolation (the same override the seat and
    /// launcher state honour); otherwise `~/.vaultspec` from `USERPROFILE`/`HOME`.
    /// The product root is the `a2a` subtree of that app home.
    pub fn derive() -> std::result::Result<Self, PathError> {
        let app_home = if let Some(over) = std::env::var_os("VAULTSPEC_APP_HOME") {
            PathBuf::from(over)
        } else {
            std::env::var_os("USERPROFILE")
                .or_else(|| std::env::var_os("HOME"))
                .map(|h| PathBuf::from(h).join(".vaultspec"))
                .ok_or(PathError::NoAppHome)?
        };
        Ok(Self::under_app_home(&app_home))
    }

    /// Derive the product paths under an already-resolved machine app home. The
    /// seated process resolves the app home from product state exactly once at
    /// boot and hands it here; this is a product-state seam, not a client path
    /// operand — the lifecycle plane never routes a wire-supplied string to it.
    #[must_use]
    pub fn under_app_home(app_home: &Path) -> Self {
        Self {
            root: app_home.join("a2a"),
        }
    }

    /// The product root — the base of every product-owned tree.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// The immutable generations base directory.
    #[must_use]
    pub fn generations_dir(&self) -> PathBuf {
        self.root.join("generations")
    }

    /// The immutable tree for one generation. The identifier is validated so it
    /// can never traverse out of [`Self::generations_dir`].
    pub fn generation_dir(&self, generation: &str) -> std::result::Result<PathBuf, PathError> {
        Ok(self
            .generations_dir()
            .join(validate_generation(generation)?))
    }

    /// The mutable A2A app home — SQLite, discovery, credentials, snapshots,
    /// logs, and the receipt live here, separate from the immutable generations.
    #[must_use]
    pub fn app_home(&self) -> PathBuf {
        self.root.join("app-home")
    }

    /// The owner-restricted credentials directory (under the app home).
    #[must_use]
    pub fn credentials_dir(&self) -> PathBuf {
        self.app_home().join("credentials")
    }

    /// The active complete-receipt path (under the app home).
    #[must_use]
    pub fn receipt_path(&self) -> PathBuf {
        self.app_home().join("receipt.json")
    }

    /// The fixed-size active-receipt authority journal (under the app home).
    ///
    /// This path is distinct from the legacy `receipt.json`: readers of the
    /// fixed journal never interpret that retired JSON format as activation
    /// authority.
    #[must_use]
    pub fn active_receipts_journal_path(&self) -> PathBuf {
        self.app_home().join("active-receipts.v1")
    }

    /// The mutable user-data directory (SQLite stores, workspaces) under the app
    /// home. Preserved across removal unless an explicit typed data removal is
    /// requested (ADR D6).
    #[must_use]
    pub fn data_dir(&self) -> PathBuf {
        self.app_home().join("data")
    }

    /// The consistency-group snapshots base directory (under the app home).
    #[must_use]
    pub fn snapshots_dir(&self) -> PathBuf {
        self.app_home().join("snapshots")
    }

    /// The snapshot directory for one consistency generation. The identifier is
    /// validated so it can never traverse out of [`Self::snapshots_dir`].
    pub fn snapshot_dir(&self, generation: &str) -> std::result::Result<PathBuf, PathError> {
        Ok(self.snapshots_dir().join(validate_generation(generation)?))
    }

    /// The copied-updater transaction directory, outside the active release set.
    #[must_use]
    pub fn transaction_dir(&self) -> PathBuf {
        self.root.join("transaction")
    }

    /// The staged-candidate generation directory.
    #[must_use]
    pub fn staging_dir(&self) -> PathBuf {
        self.root.join("staging")
    }

    /// The copied external updater helper directory.
    #[must_use]
    pub fn updater_dir(&self) -> PathBuf {
        self.root.join("updater")
    }

    /// The installation transaction lock path (under the transaction directory).
    #[must_use]
    pub fn install_lock_path(&self) -> PathBuf {
        self.transaction_dir().join("install.lock")
    }

    /// Create the stable base directories (root, generations, app home,
    /// credentials, snapshots, transaction, staging, updater). Idempotent.
    pub fn ensure(&self) -> std::io::Result<()> {
        for dir in [
            self.root.clone(),
            self.generations_dir(),
            self.app_home(),
            self.credentials_dir(),
            self.data_dir(),
            self.snapshots_dir(),
            self.transaction_dir(),
            self.staging_dir(),
            self.updater_dir(),
        ] {
            std::fs::create_dir_all(dir)?;
        }
        Ok(())
    }
}

/// Validate a generation identifier before it is interpolated into a path. The
/// grammar is 1..=128 bytes of `[A-Za-z0-9._-]` with no path separator and no
/// `..` component, so a malicious or malformed id cannot escape the product
/// root. This is the one place a caller-influenced token reaches the filesystem.
pub(crate) fn validate_generation(generation: &str) -> std::result::Result<&str, PathError> {
    let ok = !generation.is_empty()
        && generation.len() <= 128
        && generation != ".."
        && generation != "."
        && generation
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
        && !generation.contains("..");
    if ok {
        Ok(generation)
    } else {
        Err(PathError::InvalidGeneration(generation.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generation_identifiers_cannot_escape_the_root() {
        let paths = ProductPaths {
            root: PathBuf::from("/opt/product"),
        };
        assert!(paths.generation_dir("2026-07-19-a1b2").is_ok());
        for bad in ["../escape", "..", ".", "a/b", "a\\b", "gen/../..", ""] {
            assert!(
                matches!(
                    paths.generation_dir(bad),
                    Err(PathError::InvalidGeneration(_))
                ),
                "{bad:?} must be refused"
            );
        }
        assert!(matches!(
            paths.generation_dir(&"g".repeat(129)),
            Err(PathError::InvalidGeneration(_))
        ));
    }

    #[test]
    fn paths_nest_under_the_resolved_app_home() {
        // Deriving under a resolved app home yields a product root nested inside
        // it, and every derived path stays under that root.
        let dir = tempfile::tempdir().unwrap();
        let paths = ProductPaths::under_app_home(dir.path());
        assert!(paths.root().starts_with(dir.path()));
        assert!(paths.root().ends_with("a2a"));
        paths.ensure().unwrap();
        for p in [
            paths.generations_dir(),
            paths.app_home(),
            paths.credentials_dir(),
            paths.snapshots_dir(),
            paths.transaction_dir(),
            paths.staging_dir(),
            paths.updater_dir(),
            paths.receipt_path(),
            paths.active_receipts_journal_path(),
            paths.install_lock_path(),
        ] {
            assert!(
                p.starts_with(paths.root()),
                "{p:?} escaped the product root"
            );
        }
    }
}
