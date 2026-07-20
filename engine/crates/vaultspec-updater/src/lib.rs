//! The copied external updater (a2a-product-provisioning W03.P07).
//!
//! The updater is a separate, target-specific executable copied OUT of the active
//! release so it can replace the release — including the dashboard binary and the
//! installed updater — while the seated processes are exited. It parses one
//! owner-restricted descriptor, acquires the installation lock as the
//! `CopiedUpdater` (never delegating lock ownership to the gateway), and executes
//! or recovers the ordered update transaction, delegating every authority check to
//! `vaultspec-product`.
//!
//! The materialize -> generation -> receipt-commit SWAP (activation) is the sealed
//! seam that lands with the archive materializer (W04); this crate owns the real
//! process, installation-lock, descriptor, transaction, and relaunch orchestration
//! up to that boundary. The testable runner lands in S58 and the executable
//! entrypoint in S59.

use vaultspec_product::recovery::RecoveryError;
use vaultspec_product::transaction::TransactionError;

/// Why the external updater could not complete its run. Diagnostics are bounded
/// and carry no secret.
#[derive(Debug)]
pub enum UpdaterError {
    /// The ordered update transaction failed.
    Transaction(TransactionError),
    /// Interruption recovery failed.
    Recovery(RecoveryError),
    /// A bounded descriptor or I/O error, redacted of any secret value.
    Io(String),
}

impl std::fmt::Display for UpdaterError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Transaction(error) => write!(f, "update transaction failed: {error}"),
            Self::Recovery(error) => write!(f, "interruption recovery failed: {error}"),
            Self::Io(detail) => write!(f, "updater io error: {detail}"),
        }
    }
}

impl std::error::Error for UpdaterError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Transaction(error) => Some(error),
            Self::Recovery(error) => Some(error),
            Self::Io(_) => None,
        }
    }
}

impl From<TransactionError> for UpdaterError {
    fn from(error: TransactionError) -> Self {
        Self::Transaction(error)
    }
}

impl From<RecoveryError> for UpdaterError {
    fn from(error: RecoveryError) -> Self {
        Self::Recovery(error)
    }
}
