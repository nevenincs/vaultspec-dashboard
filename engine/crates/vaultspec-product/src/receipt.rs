//! The complete release-set receipt (a2a-product-provisioning W01.P01.S08).
//!
//! A receipt is the atomic activation record for one installed release set. ADR
//! D3/D6: first install atomically creates the initial receipt and ownership
//! capability; every later mutation requires the matching *active* receipt;
//! update commits a complete release-set receipt atomically, and no
//! capsule-only active receipt exists. The receipt carries exactly the facts a
//! restart, an update, or an interruption recovery needs:
//!
//! - **channel provenance** — which installer wrote this generation, so the
//!   right file-activation authority (self-install helper vs. a package
//!   manager) is used on update and rollback;
//! - **bootstrap-created ownership retention** — whether this install created
//!   and retains the ownership capability (a foreign-adopted install would not);
//! - **active generation** — the generation id whose immutable tree is live;
//! - **prior seat identity** — the descriptor the updater relaunches on rollback;
//! - **consistency generation** — the snapshot/consistency-group counter that
//!   ties the receipt to a restorable snapshot group;
//! - **interruption marker** — the durable transaction-phase marker recovery
//!   reads to resolve a crashed update deterministically.
//!
//! Activation is atomic: the receipt is written to a pid-suffixed temp file and
//! renamed over the active path, so a reader never observes a torn receipt.

use serde::{Deserialize, Serialize};

use crate::manifest::{ReleaseIdentity, Target};

/// The current receipt grammar version. A consumer requires the same major and
/// a declared minor no newer than it supports.
pub const RECEIPT_SCHEMA_VERSION: &str = "1.0";

/// Which installer authority wrote a generation. Recorded so update and rollback
/// route file activation to the correct authority (ADR D2: "Every installer
/// writes channel provenance into the release receipt").
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Channel {
    /// The product-owned shell/PowerShell installer; the copied external updater
    /// owns file activation and rollback.
    SelfInstall,
    /// Installed through Scoop; the manager stages, activates, and rolls back.
    Scoop,
    /// Installed through WinGet; the manager owns file activation.
    WinGet,
    /// Installed through the Windows Installer MSI; the manager owns activation.
    Msi,
}

/// The activation state of a receipt on disk.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ReceiptState {
    /// The live, authoritative receipt: its generation is the running release set.
    Active,
    /// A candidate written during an in-flight update, not yet activated.
    Staged,
    /// A receipt captured while a rollback restores the prior generation.
    RollingBack,
}

/// The durable transaction-phase marker an interrupted update leaves behind.
/// Recovery reads it to resume or roll back deterministically from the exact
/// boundary (ADR D6: "Interruption recovery resolves staged and active receipts
/// deterministically").
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum InterruptionMarker {
    /// Candidate staged; no mutation of the live set yet.
    Staged,
    /// Admission closed and active runs draining.
    Draining,
    /// The consistency group has been snapshotted and verified.
    Snapshotted,
    /// Files activated but the receipt not yet committed.
    Activated,
    /// Staged migrations running.
    Migrating,
    /// Candidate probed and accepted.
    Accepted,
    /// A failure was hit and the transaction is rolling back.
    RollingBack,
}

/// The prior seat descriptor retained for rollback relaunch. Non-secret: it
/// names the generation and dashboard build the updater restores, plus the last
/// observed seat pid (advisory only — liveness is proven at recovery time).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PriorSeatIdentity {
    /// The generation id the prior seat ran.
    pub generation: String,
    /// The dashboard version the prior seat ran.
    pub dashboard_version: String,
    /// The last observed seat process id, if one was recorded.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
}

/// A complete release-set receipt.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Receipt {
    /// Receipt grammar version.
    pub schema_version: String,
    /// Activation state.
    pub state: ReceiptState,
    /// Which installer authority wrote this generation.
    pub channel: Channel,
    /// Whether this install created and retains the ownership capability.
    pub bootstrap_created_ownership: bool,
    /// The generation id whose immutable tree is live.
    pub active_generation: String,
    /// The consistency-group generation counter bound to this receipt.
    pub consistency_generation: u64,
    /// The target triple this release set is for.
    pub target: Target,
    /// The A2A component identity bound into this release set.
    pub a2a_identity: ReleaseIdentity,
    /// Wall-clock creation time (epoch milliseconds).
    pub created_ms: i64,
    /// The prior seat descriptor for rollback relaunch, when one exists.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prior_seat: Option<PriorSeatIdentity>,
    /// The durable interruption marker, present only while a transaction is
    /// in flight; `None` on a settled active receipt.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interruption: Option<InterruptionMarker>,
}

/// Why a receipt could not be read or written.
#[derive(Debug)]
pub enum ReceiptError {
    /// The receipt file could not be parsed.
    Parse(String),
    /// An I/O error reading or writing the receipt.
    Io(std::io::Error),
}

impl std::fmt::Display for ReceiptError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ReceiptError::Parse(m) => write!(f, "receipt parse failed: {m}"),
            ReceiptError::Io(e) => write!(f, "receipt io error: {e}"),
        }
    }
}

impl std::error::Error for ReceiptError {}

impl From<std::io::Error> for ReceiptError {
    fn from(e: std::io::Error) -> Self {
        ReceiptError::Io(e)
    }
}

impl Receipt {
    /// A fresh bootstrap receipt: the first install atomically records the
    /// initial active generation and that it created and retains ownership.
    #[must_use]
    pub fn bootstrap(
        channel: Channel,
        target: Target,
        a2a_identity: ReleaseIdentity,
        active_generation: impl Into<String>,
        created_ms: i64,
    ) -> Self {
        Self {
            schema_version: RECEIPT_SCHEMA_VERSION.to_string(),
            state: ReceiptState::Active,
            channel,
            bootstrap_created_ownership: true,
            active_generation: active_generation.into(),
            consistency_generation: 0,
            target,
            a2a_identity,
            created_ms,
            prior_seat: None,
            interruption: None,
        }
    }

    /// Load a receipt from disk. Unlike best-effort launcher state, a malformed
    /// *active* receipt is a hard error — activation authority cannot silently
    /// default to empty.
    pub fn load(path: &std::path::Path) -> std::result::Result<Self, ReceiptError> {
        let raw = std::fs::read_to_string(path)?;
        serde_json::from_str(&raw).map_err(|e| ReceiptError::Parse(e.to_string()))
    }

    /// Atomically persist this receipt to `path`: write a pid-suffixed temp file,
    /// restrict it to the owner on Unix, then rename over the destination. A
    /// concurrent reader observes either the previous complete receipt or this
    /// one — never a torn write.
    pub fn persist(&self, path: &std::path::Path) -> std::result::Result<(), ReceiptError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let file_name = path
            .file_name()
            .map(std::ffi::OsStr::to_owned)
            .unwrap_or_else(|| std::ffi::OsString::from("receipt.json"));
        let mut tmp_name = file_name;
        tmp_name.push(format!(".tmp-{}", std::process::id()));
        let tmp = path.with_file_name(tmp_name);
        let body =
            serde_json::to_string_pretty(self).map_err(|e| ReceiptError::Parse(e.to_string()))?;
        std::fs::write(&tmp, body)?;
        crate::credentials::restrict_to_owner(&tmp)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }

    /// Commit this receipt as the live, settled active receipt: clear any
    /// interruption marker, mark it active, and persist atomically. This is the
    /// "atomic complete receipt activation" the update transaction ends with.
    pub fn activate(&mut self, path: &std::path::Path) -> std::result::Result<(), ReceiptError> {
        self.state = ReceiptState::Active;
        self.interruption = None;
        self.persist(path)
    }

    /// Record a durable interruption marker mid-transaction and persist it. The
    /// state moves to `Staged` (an in-flight candidate) unless already rolling
    /// back, so a crash after this point recovers from the exact boundary.
    pub fn mark(
        &mut self,
        marker: InterruptionMarker,
        path: &std::path::Path,
    ) -> std::result::Result<(), ReceiptError> {
        self.interruption = Some(marker);
        self.state = if marker == InterruptionMarker::RollingBack {
            ReceiptState::RollingBack
        } else {
            ReceiptState::Staged
        };
        self.persist(path)
    }
}

/// Sweep orphaned receipt temp files (`receipt.json.tmp-<pid>`) left by a crash
/// between the atomic write and the rename. Best-effort and bounded to the
/// receipt directory: a stranded temp is dead weight, and the resource-bounds
/// law requires the accumulator be reclaimed rather than allowed to grow. The
/// active `receipt.json` itself is never a temp and is left untouched. Returns
/// the number of orphaned temp files removed.
pub fn sweep_orphan_tmp(receipt_path: &std::path::Path) -> std::io::Result<usize> {
    let Some(dir) = receipt_path.parent() else {
        return Ok(0);
    };
    let Some(base) = receipt_path.file_name().and_then(|n| n.to_str()) else {
        return Ok(0);
    };
    let tmp_prefix = format!("{base}.tmp-");
    let mut removed = 0;
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        // A not-yet-created receipt directory has nothing to sweep.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(e) => return Err(e),
    };
    for entry in entries.flatten() {
        let file_name = entry.file_name();
        let Some(name) = file_name.to_str() else {
            continue;
        };
        let Some(pid_str) = name.strip_prefix(&tmp_prefix) else {
            continue;
        };
        // Reclaim a stranded temp ONLY when its writer pid is provably DEAD — the
        // same proof-of-death discipline as `locking::quarantine_owner_matched_stale`
        // and `discovery::classify`. A live writer (e.g. the external updater
        // mid-transaction during the activation handoff window) must keep its
        // in-flight temp; deleting it would corrupt its pending atomic rename. A
        // suffix that is not a plain pid is a foreign/unrecognized name — left
        // untouched rather than guessed at.
        let Ok(pid) = pid_str.parse::<u32>() else {
            continue;
        };
        if crate::locking::process_is_alive(pid) {
            continue;
        }
        if std::fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn identity() -> ReleaseIdentity {
        ReleaseIdentity {
            name: "vaultspec-a2a".to_string(),
            version: "0.1.0".to_string(),
        }
    }

    #[test]
    fn bootstrap_receipt_roundtrips_and_retains_ownership() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("receipt.json");
        let r = Receipt::bootstrap(
            Channel::SelfInstall,
            Target::X86_64PcWindowsMsvc,
            identity(),
            "2026-07-19-a1b2",
            1_700_000_000_000,
        );
        r.persist(&path).unwrap();
        let loaded = Receipt::load(&path).unwrap();
        assert_eq!(loaded, r);
        assert!(loaded.bootstrap_created_ownership);
        assert_eq!(loaded.state, ReceiptState::Active);
        assert!(loaded.interruption.is_none());
    }

    #[test]
    fn activation_clears_the_interruption_marker() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("receipt.json");
        let mut r = Receipt::bootstrap(
            Channel::Scoop,
            Target::X86_64PcWindowsMsvc,
            identity(),
            "gen-a",
            1,
        );
        r.mark(InterruptionMarker::Migrating, &path).unwrap();
        assert_eq!(Receipt::load(&path).unwrap().state, ReceiptState::Staged);
        r.activate(&path).unwrap();
        let live = Receipt::load(&path).unwrap();
        assert_eq!(live.state, ReceiptState::Active);
        assert!(live.interruption.is_none());
    }

    #[test]
    fn sweep_removes_orphan_temps_but_never_the_active_receipt() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("receipt.json");
        Receipt::bootstrap(
            Channel::Msi,
            Target::X86_64PcWindowsMsvc,
            identity(),
            "g",
            1,
        )
        .persist(&path)
        .unwrap();
        // A temp from a provably-DEAD writer (a pid that is never a live process)
        // is reclaimed; a temp from a LIVE writer (this very process) is PRESERVED
        // so an in-flight atomic write is never corrupted out from under it.
        let dead_pid = u32::MAX - 7;
        let live_pid = std::process::id();
        let dead_tmp = dir.path().join(format!("receipt.json.tmp-{dead_pid}"));
        let live_tmp = dir.path().join(format!("receipt.json.tmp-{live_pid}"));
        std::fs::write(&dead_tmp, "x").unwrap();
        std::fs::write(&live_tmp, "x").unwrap();
        // Only the dead-pid temp is swept.
        assert_eq!(sweep_orphan_tmp(&path).unwrap(), 1);
        assert!(!dead_tmp.exists(), "the dead-writer temp is reclaimed");
        assert!(live_tmp.exists(), "the live-writer temp is preserved");
        // The active receipt survives and still loads.
        assert!(path.exists());
        assert!(Receipt::load(&path).is_ok());
        // A second sweep still preserves the live temp (nothing left to reclaim).
        assert_eq!(sweep_orphan_tmp(&path).unwrap(), 0);
        assert!(live_tmp.exists());
    }
}
