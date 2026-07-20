//! Authenticated drain-and-stop of the DISCOVERED owned gateway
//! (a2a-product-provisioning W03.P07 S62 — the copied updater's drive).
//!
//! The copied external updater does not own the gateway process: the exiting
//! dashboard spawned it, so the updater holds no child handle and must reach
//! the runtime through the same authenticated planes the dashboard uses —
//! secret-free discovery classification, then the bounded loopback control
//! broker. This module assembles that authority as one sealed capability:
//!
//! - the discovery record is read only from the product-derived app home
//!   (bounded, no-follow), parsed secret-free, and classified against the
//!   product-root owner identity; ONLY [`Verdict::OwnedLive`] yields a lease.
//!   A foreign gateway is never drained or stopped — ADR D4 immutability
//!   binds the updater exactly as it binds the dashboard.
//! - credentials come only from the product-derived store: the attach token
//!   authenticates transport, and the receipt-bound ownership capability —
//!   verified under the exact installation guard — authorizes the stop
//!   (ADR D5). The attach credential alone cannot stop a gateway.
//! - the stop is proven, never assumed: the recorded pid must exit within the
//!   bounded deadline AND the endpoint must stop answering. There is
//!   deliberately NO force-kill path — killing a non-child pid by number is a
//!   pid-reuse hazard — so a gateway that outlives its deadline is a typed
//!   [`GatewayDrainError::StopTimeout`] and the update transaction rolls back
//!   with the prior release intact and still running.
//!
//! [`crate::transaction::UpdateTransaction::drain_and_stop_discovered`]
//! consumes the lease, which is how the copied updater receives its
//! [`crate::migration::Quiescence`] witness without that witness ever being
//! mintable outside the transaction that performed the drain.

use std::io::Read as _;
use std::path::Path;
use std::time::{Duration, Instant};

use crate::control::{ControlClient, ControlError};
use crate::credentials::{
    Credential, CredentialError, DashboardCredentialStore, VerifiedOwnershipCredential,
};
use crate::discovery::{DiscoveryContext, DiscoveryError, GatewayDiscovery, Verdict};
use crate::locking::{InstallLockGuard, LockAuthorityError, process_is_alive};
use crate::manifest::RangeBounds;
use crate::paths::ProductPaths;

/// The secret-free discovery record the desktop gateway publishes in the
/// product app home (ADR D5).
pub const DISCOVERY_FILE: &str = "gateway-discovery.json";
/// Discovery records are small JSON documents; a larger file is malformed.
const MAX_DISCOVERY_BYTES: u64 = 64 * 1024;
/// Connect budget for each bounded control call.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
/// Hard ceiling on any caller-supplied drain or stop deadline.
const MAX_DEADLINE: Duration = Duration::from_secs(10 * 60);

/// The classification instant and the installed release's supported ranges.
/// The owner identity is NOT here — it derives from the product root, never
/// from a caller.
#[derive(Debug, Clone)]
pub struct DrainContext {
    /// The current wall-clock time, epoch milliseconds.
    pub now_ms: i64,
    /// How recent the discovery heartbeat must be to count as fresh.
    pub freshness_ms: i64,
    /// The gateway API range the installed release supports.
    pub supported_protocol: RangeBounds,
    /// The state-schema range the installed release supports.
    pub supported_state_schema: RangeBounds,
}

/// Validated bounds on the drain-and-stop drive. Every phase is deadline- and
/// interval-bounded; construction refuses zero, oversized, or inconsistent
/// values (resource-bounds law).
#[derive(Debug, Clone, Copy)]
pub struct DrainDeadlines {
    drain_call: Duration,
    stop: Duration,
    poll: Duration,
}

impl DrainDeadlines {
    /// Bound the drive: `drain_call` is the I/O budget of the drain call
    /// itself, `stop` the wall clock allowed for process exit after the
    /// authorized shutdown, `poll` the liveness poll interval.
    pub fn new(
        drain_call: Duration,
        stop: Duration,
        poll: Duration,
    ) -> Result<Self, GatewayDrainError> {
        if drain_call.is_zero() || stop.is_zero() || poll.is_zero() {
            return Err(GatewayDrainError::InvalidDeadlines(
                "every drain deadline must be positive",
            ));
        }
        if drain_call > MAX_DEADLINE || stop > MAX_DEADLINE {
            return Err(GatewayDrainError::InvalidDeadlines(
                "drain deadlines exceed the fixed ceiling",
            ));
        }
        if poll > stop {
            return Err(GatewayDrainError::InvalidDeadlines(
                "the poll interval cannot exceed the stop deadline",
            ));
        }
        Ok(Self {
            drain_call,
            stop,
            poll,
        })
    }
}

/// Bounded, non-secret evidence of one proven stop.
#[derive(Debug, Clone, Copy)]
pub struct StopEvidence {
    /// The recorded gateway pid that exited.
    pub pid: u32,
    /// How long the exit took after the authorized shutdown was accepted.
    pub stop_wait: Duration,
}

/// One-shot authority to drain and stop the exact discovered OWNED gateway.
///
/// Constructed only by [`OwnedGatewayLease::acquire`], which requires the
/// verified installation guard, an `OwnedLive` classification against the
/// product-root owner identity, and the product-derived credentials. It is
/// intentionally non-cloneable and consumed by the transaction drive.
pub struct OwnedGatewayLease<'guard> {
    client: ControlClient,
    ownership: VerifiedOwnershipCredential<'guard>,
    endpoint: String,
    pid: u32,
}

impl std::fmt::Debug for OwnedGatewayLease<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OwnedGatewayLease")
            .field("endpoint", &self.endpoint)
            .field("pid", &self.pid)
            .finish_non_exhaustive()
    }
}

impl<'guard> OwnedGatewayLease<'guard> {
    /// Assemble drain authority over the discovered owned gateway.
    ///
    /// Order matters: the guard is verified first, classification decides
    /// before any credential is read, and only `OwnedLive` proceeds. The
    /// owner identity is the product root (the same derivation the dashboard
    /// lifecycle routes use), never a caller string.
    pub fn acquire(
        paths: &ProductPaths,
        guard: &'guard InstallLockGuard,
        context: &DrainContext,
    ) -> Result<Self, GatewayDrainError> {
        guard.verify_for_product(paths)?;
        let raw = read_bounded_discovery(&paths.app_home().join(DISCOVERY_FILE))?;
        let discovery = GatewayDiscovery::parse(&raw).map_err(GatewayDrainError::Discovery)?;
        let our_owner = paths.root().to_string_lossy().to_string();
        let ours = discovery.owner == our_owner;
        let ctx = DiscoveryContext {
            our_owner,
            now_ms: context.now_ms,
            freshness_ms: context.freshness_ms,
            supported_protocol: context.supported_protocol.clone(),
            supported_state_schema: context.supported_state_schema.clone(),
        };
        match discovery.classify(&ctx) {
            Verdict::OwnedLive => {}
            Verdict::OwnedStale => return Err(GatewayDrainError::NotLive),
            Verdict::ForeignImmutable { .. } if ours => {
                return Err(GatewayDrainError::Incompatible);
            }
            Verdict::ForeignAttachable | Verdict::ForeignImmutable { .. } => {
                return Err(GatewayDrainError::ForeignGateway);
            }
        }
        let store = DashboardCredentialStore::for_product(paths);
        let attach = store
            .read_attach_control()
            .map_err(GatewayDrainError::Credential)?;
        let ownership = store
            .verify_ownership(guard)
            .map_err(GatewayDrainError::Credential)?;
        let client = ControlClient::new(discovery.endpoint.clone(), attach.secret().to_owned());
        Ok(Self {
            client,
            ownership,
            endpoint: discovery.endpoint,
            pid: discovery.pid,
        })
    }

    /// Drive the authenticated drain, the ownership-authorized stop, and the
    /// proven exit. Consumed by the update transaction; not directly public
    /// so the `Draining` phase advance and the drive can never diverge.
    pub(crate) fn drain_and_stop(
        self,
        deadlines: DrainDeadlines,
    ) -> Result<StopEvidence, GatewayDrainError> {
        drive_drain_stop(
            &self.client,
            self.ownership.credential(),
            self.pid,
            deadlines,
        )
    }
}

/// The credential-free control drive: drain, authorized shutdown, proven exit.
/// Split out so the wire behavior is testable on every platform while the
/// authority assembly above stays sealed.
fn drive_drain_stop(
    client: &ControlClient,
    ownership: &Credential,
    pid: u32,
    deadlines: DrainDeadlines,
) -> Result<StopEvidence, GatewayDrainError> {
    // Close admission and resolve in-flight runs. The drain call carries the
    // caller's I/O budget; the gateway resolves runs/checkpoints before it
    // acknowledges (gateway-side contract).
    client
        .clone()
        .with_timeouts(CONNECT_TIMEOUT, deadlines.drain_call)
        .drain()
        .map_err(GatewayDrainError::Drain)?;
    // The receipt-bound stop: attach transport plus the ownership capability.
    client
        .shutdown(ownership)
        .map_err(GatewayDrainError::Shutdown)?;
    // Prove the exit. No force-kill: a pid is not a handle, and killing a
    // recycled pid would be worse than a rolled-back update.
    let started = Instant::now();
    while process_is_alive(pid) {
        if started.elapsed() >= deadlines.stop {
            return Err(GatewayDrainError::StopTimeout { pid });
        }
        std::thread::sleep(deadlines.poll);
    }
    // Double evidence: the endpoint must no longer answer. `liveness` maps
    // connect/transport failure to `Ok(false)`, so `Ok(true)` here means
    // SOMETHING still serves the recorded endpoint after the recorded pid
    // died — fail closed rather than assert quiescence over it.
    match client.liveness() {
        Ok(false) => {}
        Ok(true) => return Err(GatewayDrainError::EndpointStillAnswering),
        Err(error) => return Err(GatewayDrainError::Liveness(error)),
    }
    Ok(StopEvidence {
        pid,
        stop_wait: started.elapsed(),
    })
}

/// Bounded no-follow read of the product discovery record.
fn read_bounded_discovery(path: &Path) -> Result<String, GatewayDrainError> {
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(nix::libc::O_NOFOLLOW | nix::libc::O_CLOEXEC);
    }
    let mut file = match options.open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(GatewayDrainError::DiscoveryAbsent);
        }
        Err(error) => return Err(GatewayDrainError::DiscoveryUnreadable(error.to_string())),
    };
    let metadata = file
        .metadata()
        .map_err(|error| GatewayDrainError::DiscoveryUnreadable(error.to_string()))?;
    if !metadata.is_file() {
        return Err(GatewayDrainError::DiscoveryUnreadable(
            "discovery record is not a regular file".to_string(),
        ));
    }
    let mut bytes = Vec::new();
    std::io::Read::by_ref(&mut file)
        .take(MAX_DISCOVERY_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| GatewayDrainError::DiscoveryUnreadable(error.to_string()))?;
    if bytes.len() as u64 > MAX_DISCOVERY_BYTES {
        return Err(GatewayDrainError::DiscoveryUnreadable(
            "discovery record exceeds its byte bound".to_string(),
        ));
    }
    String::from_utf8(bytes).map_err(|_| {
        GatewayDrainError::DiscoveryUnreadable("discovery record is not UTF-8".to_string())
    })
}

/// Why the discovered gateway could not be drained and stopped. Bounded and
/// secret-free.
#[derive(Debug)]
pub enum GatewayDrainError {
    /// The held guard is not the canonical product installation authority.
    LockAuthority(LockAuthorityError),
    /// No discovery record exists; there is no provable gateway to drain, and
    /// quiescence is never asserted from absence.
    DiscoveryAbsent,
    /// The discovery record could not be read within bounds.
    DiscoveryUnreadable(String),
    /// The discovery record was malformed or secret-bearing.
    Discovery(DiscoveryError),
    /// The discovered gateway belongs to another owner and stays immutable.
    ForeignGateway,
    /// The discovered gateway is ours but dead or heartbeat-stale; the stale
    /// path is the quarantine flow, not a drain.
    NotLive,
    /// The discovered gateway is ours but declares incompatible ranges.
    Incompatible,
    /// A product credential could not be read or verified.
    Credential(CredentialError),
    /// The authenticated drain call failed.
    Drain(ControlError),
    /// The ownership-authorized shutdown call failed.
    Shutdown(ControlError),
    /// The gateway did not exit within the bounded stop deadline. There is no
    /// force-kill; the transaction rolls back with the prior release intact.
    StopTimeout {
        /// The recorded pid that outlived the deadline.
        pid: u32,
    },
    /// The recorded pid died but the endpoint still answers; quiescence is
    /// refused over an unexplained resident.
    EndpointStillAnswering,
    /// The post-stop liveness probe failed in a non-transport way.
    Liveness(ControlError),
    /// The caller-supplied deadlines were rejected.
    InvalidDeadlines(&'static str),
}

impl std::fmt::Display for GatewayDrainError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::LockAuthority(error) => write!(f, "installation authority rejected: {error}"),
            Self::DiscoveryAbsent => write!(f, "no gateway discovery record exists"),
            Self::DiscoveryUnreadable(detail) => {
                write!(f, "gateway discovery is unreadable: {detail}")
            }
            Self::Discovery(error) => write!(f, "gateway discovery rejected: {error}"),
            Self::ForeignGateway => {
                write!(f, "a foreign gateway holds the runtime and stays immutable")
            }
            Self::NotLive => write!(f, "the owned gateway is dead or heartbeat-stale"),
            Self::Incompatible => {
                write!(f, "the owned gateway declares incompatible ranges")
            }
            Self::Credential(error) => write!(f, "product credential authority failed: {error}"),
            Self::Drain(error) => write!(f, "authenticated drain failed: {error}"),
            Self::Shutdown(error) => write!(f, "ownership-authorized shutdown failed: {error}"),
            Self::StopTimeout { pid } => {
                write!(f, "gateway pid {pid} outlived the bounded stop deadline")
            }
            Self::EndpointStillAnswering => {
                write!(f, "the control endpoint still answers after the pid exited")
            }
            Self::Liveness(error) => write!(f, "post-stop liveness probe failed: {error}"),
            Self::InvalidDeadlines(reason) => write!(f, "invalid drain deadlines: {reason}"),
        }
    }
}

impl std::error::Error for GatewayDrainError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::LockAuthority(error) => Some(error),
            Self::Discovery(error) => Some(error),
            Self::Credential(error) => Some(error),
            Self::Drain(error) | Self::Shutdown(error) | Self::Liveness(error) => Some(error),
            _ => None,
        }
    }
}

impl From<LockAuthorityError> for GatewayDrainError {
    fn from(error: LockAuthorityError) -> Self {
        Self::LockAuthority(error)
    }
}

#[cfg(test)]
#[path = "gateway_drain/tests.rs"]
mod tests;
