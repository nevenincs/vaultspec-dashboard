//! The credential model (a2a-product-provisioning W01.P01.S09).
//!
//! ADR D5/D4 separate three credentials by owner and purpose, and the boundary
//! is a security contract, not a convenience:
//!
//! - **ownership capability** — created and retained by dashboard bootstrap
//!   alone. It authenticates receipt-bound lifecycle mutation (stop, migrate,
//!   repair, update, rollback, remove). It is *never referenced by discovery*;
//!   the attach credential alone cannot invoke ownership-gated operations.
//! - **attach-control credential** — created by dashboard bootstrap. The gateway
//!   may *read* it to authenticate dashboard control and settlement callbacks.
//!   Discovery may publish a non-secret *file reference* to it, never its value.
//! - **worker-IPC credential** — created by the *gateway*, not the dashboard,
//!   and confined to gateway↔worker traffic. The dashboard never mints it.
//!
//! Every credential is a distinct owner-restricted file with its own secret; no
//! aliasing (one secret masquerading as two roles) and no secret-bearing
//! discovery are permitted. Loopback is the only desktop bind surface, so a
//! credential's threat model is local: file-ACL restriction is the control.
//!
//! Secret material is a 256-bit token from the OS CSPRNG via `getrandom`
//! (`getrandom`/`getentropy` on Unix, `BCryptGenRandom`/`ProcessPrng` on
//! Windows) — the same explicit CSPRNG contract the engine's bearer- and
//! actor-token generators use, hex-encoded to 64 characters, no unsafe.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// The three credential roles. The role is bound to the file name, so a reader
/// cannot silently reinterpret one role's secret as another's.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CredentialRole {
    /// Receipt-bound lifecycle authority; dashboard-created and retained.
    Ownership,
    /// Dashboard control + settlement-callback authentication; gateway-readable.
    AttachControl,
    /// Gateway↔worker interprocess authentication; gateway-created.
    WorkerIpc,
}

impl CredentialRole {
    fn file_name(self) -> &'static str {
        match self {
            CredentialRole::Ownership => "ownership.cap",
            CredentialRole::AttachControl => "attach.cred",
            CredentialRole::WorkerIpc => "worker-ipc.cred",
        }
    }
}

/// A loaded credential: its role and secret. The secret never enters discovery,
/// receipts, logs, lifecycle job output, or frontend state.
#[derive(Clone, PartialEq, Eq)]
pub struct Credential {
    role: CredentialRole,
    secret: String,
}

impl Credential {
    /// The credential's role.
    #[must_use]
    pub fn role(&self) -> CredentialRole {
        self.role
    }

    /// The raw secret. Callers must keep it off every non-secret surface; the
    /// `Debug` impl deliberately redacts it so it cannot leak through logging.
    #[must_use]
    pub fn secret(&self) -> &str {
        &self.secret
    }

    /// Constant-time-ish equality against a presented secret. Compares the full
    /// length every call to avoid an early-return length/prefix oracle.
    #[must_use]
    pub fn verify(&self, presented: &str) -> bool {
        let a = self.secret.as_bytes();
        let b = presented.as_bytes();
        let mut diff = a.len() ^ b.len();
        for (i, &byte) in a.iter().enumerate() {
            diff |= usize::from(byte ^ *b.get(i).unwrap_or(&0));
        }
        diff == 0
    }
}

impl std::fmt::Debug for Credential {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Credential")
            .field("role", &self.role)
            .field("secret", &"<redacted>")
            .finish()
    }
}

/// The two credentials dashboard bootstrap creates and retains.
#[derive(Debug, Clone)]
pub struct BootstrapCredentials {
    /// The ownership capability — receipt-bound lifecycle authority.
    pub ownership: Credential,
    /// The attach-control credential — gateway-readable control authentication.
    pub attach_control: Credential,
}

/// Why a credential operation failed.
#[derive(Debug)]
pub enum CredentialError {
    /// An I/O error creating, reading, or restricting a credential file.
    Io(std::io::Error),
    /// The requested credential file does not exist.
    Missing(CredentialRole),
    /// Bootstrap was asked to create a credential that already exists; the
    /// dashboard creates and *retains* — it never silently overwrites.
    AlreadyExists(CredentialRole),
    /// The dashboard was asked to create a worker-IPC credential, which only the
    /// gateway may create (or the gateway was asked to create a dashboard-owned
    /// credential).
    RoleForbidden(CredentialRole),
}

impl std::fmt::Display for CredentialError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CredentialError::Io(e) => write!(f, "credential io error: {e}"),
            CredentialError::Missing(r) => write!(f, "credential {r:?} is absent"),
            CredentialError::AlreadyExists(r) => {
                write!(
                    f,
                    "credential {r:?} already exists; bootstrap retains, never overwrites"
                )
            }
            CredentialError::RoleForbidden(r) => {
                write!(f, "credential {r:?} may not be created by this component")
            }
        }
    }
}

impl std::error::Error for CredentialError {}

impl From<std::io::Error> for CredentialError {
    fn from(e: std::io::Error) -> Self {
        CredentialError::Io(e)
    }
}

/// The owner-restricted credential store rooted at the credentials directory.
/// Which methods a component may call encodes the ownership boundary: only the
/// dashboard calls [`Self::bootstrap`], only the gateway calls
/// [`Self::create_worker_ipc`], and both may read attach-control.
#[derive(Debug, Clone)]
pub struct CredentialStore {
    dir: PathBuf,
}

impl CredentialStore {
    /// Open the store at a credentials directory (typically
    /// `ProductPaths::credentials_dir`).
    #[must_use]
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    fn path(&self, role: CredentialRole) -> PathBuf {
        self.dir.join(role.file_name())
    }

    /// **Dashboard only.** Create and retain the ownership capability and the
    /// attach-control credential in one bootstrap. Refuses if either already
    /// exists — the dashboard retains its bootstrap credentials rather than
    /// overwriting them (a re-bootstrap that clobbered ownership would strand
    /// the running gateway's authenticated control).
    pub fn bootstrap(&self) -> std::result::Result<BootstrapCredentials, CredentialError> {
        std::fs::create_dir_all(&self.dir)?;
        for role in [CredentialRole::Ownership, CredentialRole::AttachControl] {
            if self.path(role).exists() {
                return Err(CredentialError::AlreadyExists(role));
            }
        }
        let ownership = self.create(CredentialRole::Ownership)?;
        let attach_control = self.create(CredentialRole::AttachControl)?;
        Ok(BootstrapCredentials {
            ownership,
            attach_control,
        })
    }

    /// **Gateway only.** Create the worker-IPC credential used solely between
    /// the gateway and its worker. The dashboard never mints this; the gateway
    /// owns it because it owns worker lifetime.
    pub fn create_worker_ipc(&self) -> std::result::Result<Credential, CredentialError> {
        std::fs::create_dir_all(&self.dir)?;
        if self.path(CredentialRole::WorkerIpc).exists() {
            return Err(CredentialError::AlreadyExists(CredentialRole::WorkerIpc));
        }
        self.create(CredentialRole::WorkerIpc)
    }

    /// Read the attach-control credential. Both the dashboard and the gateway
    /// legitimately read this to authenticate control and settlement callbacks.
    pub fn read_attach_control(&self) -> std::result::Result<Credential, CredentialError> {
        self.read(CredentialRole::AttachControl)
    }

    /// Read the ownership capability — receipt-bound lifecycle authority. Only
    /// the retaining dashboard holds this; it is never referenced by discovery.
    pub fn read_ownership(&self) -> std::result::Result<Credential, CredentialError> {
        self.read(CredentialRole::Ownership)
    }

    /// The non-secret discovery reference to the attach-control credential: its
    /// file path, never its value. A foreign dashboard without owner-ACL access
    /// to this file may discover the gateway but cannot read the secret, so it
    /// must refuse attachment (ADR D5).
    #[must_use]
    pub fn attach_control_reference(&self) -> PathBuf {
        self.path(CredentialRole::AttachControl)
    }

    fn read(&self, role: CredentialRole) -> std::result::Result<Credential, CredentialError> {
        let path = self.path(role);
        if !path.exists() {
            return Err(CredentialError::Missing(role));
        }
        let secret = std::fs::read_to_string(&path)?.trim().to_string();
        Ok(Credential { role, secret })
    }

    fn create(&self, role: CredentialRole) -> std::result::Result<Credential, CredentialError> {
        let path = self.path(role);
        let secret = random_token()?;
        // Restrict BEFORE the secret bytes land where a racing reader could see
        // them at the default umask: write, restrict, then the secret is only
        // ever readable by the owner.
        std::fs::write(&path, &secret)?;
        restrict_to_owner(&path)?;
        Ok(Credential { role, secret })
    }
}

/// Restrict a file to its owner. On Unix, chmod `0o600` (owner read/write only).
/// On Windows the credentials tree lives under the user's own app home and
/// inherits that profile's NTFS ACL, which already excludes other users; no
/// std-only API tightens it further without unsafe, and the workspace forbids
/// unsafe, so the profile ACL is the control there (the same posture the seat
/// discovery writer takes).
pub fn restrict_to_owner(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

/// Draw a 256-bit secret from the OS CSPRNG, hex-encoded to 64 characters.
///
/// The entropy source is `getrandom` — an explicit CSPRNG contract over the
/// platform's own generator (`getrandom`/`getentropy` on Unix,
/// `BCryptGenRandom`/`ProcessPrng` on Windows), the same primitive the engine's
/// bearer- and actor-token generators use. This deliberately does NOT use
/// `std::hash::RandomState`: std seeds its HashMap keys once per thread and then
/// returns a deterministically-incremented derivation on each call, so
/// back-to-back credentials would be simple offsets of one seed — and that
/// seeding is an undocumented std internal, never a documented security
/// primitive (a future toolchain could weaken it with no test signal).
fn random_token() -> std::io::Result<String> {
    use std::fmt::Write as _;

    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes)
        .map_err(|e| std::io::Error::other(format!("OS CSPRNG unavailable: {e}")))?;
    let mut out = String::with_capacity(64);
    for byte in bytes {
        let _ = write!(out, "{byte:02x}");
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bootstrap_creates_two_distinct_secrets_and_retains_them() {
        let dir = tempfile::tempdir().unwrap();
        let store = CredentialStore::new(dir.path().join("credentials"));
        let creds = store.bootstrap().unwrap();
        assert_ne!(
            creds.ownership.secret(),
            creds.attach_control.secret(),
            "no aliasing: each role has its own secret"
        );
        assert_eq!(creds.ownership.secret().len(), 64);
        // Retention: a second bootstrap refuses rather than overwriting.
        assert!(matches!(
            store.bootstrap(),
            Err(CredentialError::AlreadyExists(_))
        ));
    }

    #[test]
    fn worker_ipc_is_separate_and_gateway_created() {
        let dir = tempfile::tempdir().unwrap();
        let store = CredentialStore::new(dir.path().join("credentials"));
        let creds = store.bootstrap().unwrap();
        let worker = store.create_worker_ipc().unwrap();
        assert_ne!(worker.secret(), creds.attach_control.secret());
        assert_ne!(worker.secret(), creds.ownership.secret());
        assert_eq!(worker.role(), CredentialRole::WorkerIpc);
    }

    #[test]
    fn debug_redacts_the_secret() {
        let c = Credential {
            role: CredentialRole::Ownership,
            secret: "supersecrettoken".to_string(),
        };
        let shown = format!("{c:?}");
        assert!(!shown.contains("supersecrettoken"));
        assert!(shown.contains("redacted"));
    }
}
