//! The agent-tier projection: the ONE machine-global read pass that answers
//! "can the orchestration plane be reached?" and renders the component
//! handshake beside that answer.
//!
//! Split out of the lifecycle plane because the two answer different questions
//! from the same reads. The plane governs INSTALL authority — what may be
//! installed, updated, repaired, or removed, gated by the fixed receipt. This
//! module governs REACHABILITY, and reports it: the `agent` tier every response
//! envelope carries, plus the handshake that discloses install truth next to it.
//!
//! The receipt read, the discovery read, and the release/readiness vocabulary
//! stay in the parent because BOTH halves consume them; this module holds the
//! composition built on top of them.

// The receipt/discovery reads, the release and readiness vocabulary, and the
// product types this composition is built on all live in the parent.
use super::*;

/// The protocol/state-schema ranges the dashboard's installed release set
/// supports. v1 gateway API today; the state-schema window is deliberately wide
/// (the packaged migration head advances independently). Kept in one place so
/// the discovery context, resolution, and handshake all agree.
pub(super) fn supported_protocol() -> RangeBounds {
    RangeBounds {
        minimum: "v1".to_string(),
        maximum: "v1".to_string(),
    }
}

pub(super) fn supported_state_schema() -> RangeBounds {
    RangeBounds {
        minimum: "0001".to_string(),
        maximum: "9999".to_string(),
    }
}

/// Whether a resident, non-product a2a gateway is attachable, as the `/ops/a2a`
/// pass-through's own filesystem predicate sees it. Read once per snapshot and
/// passed in, so the classifier below stays pure.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ResidentSibling {
    Attachable,
    Absent,
}

/// Derive the honest agent availability from ALREADY-READ product state — a pure
/// classifier so the read pass happens exactly once (review MEDIUM). A usable
/// gateway (owned-live or foreign-attachable-live) is available; every other
/// state degrades with a truthful, non-secret reason. No credential secret is
/// read here.
///
/// The `agent` tier describes ONE question: can the orchestration plane be
/// reached? So a resident sibling the pass-through can attach to makes the tier
/// available even when the product lane cannot vouch for an installed release —
/// a procs-booted dev sibling under the attach-never-own lane is exactly that
/// case. This does NOT weaken the fixed-receipt authority: that authority gates
/// install, update, repair, and rollback on the dedicated lifecycle plane, which
/// is untouched here, and it keeps reporting through `install_state` on the
/// component handshake. The distinction is the a2a-distribution-trust ADR's own:
/// a receipt authenticates the INSTALLED RELEASE, never the reachability of a
/// process already serving.
///
/// The fallback speaks only where the product lane has no classification of a
/// running gateway to offer. When the product lane HAS classified one and found
/// it unusable — stale, protocol-incompatible, or foreign-immutable — that
/// specific knowledge is strictly better than a heartbeat and wins; a bare
/// freshness read must never claim availability for a gateway we know we cannot
/// speak to.
pub(super) fn availability_from(
    release: &ReleaseObservation,
    verdict: Option<&Verdict>,
    resident: ResidentSibling,
) -> (bool, Option<String>) {
    compose_availability(
        availability_from_product(release, verdict),
        matches!(release, ReleaseObservation::Settled(_)) && verdict.is_some(),
        resident,
    )
}

/// The precedence rule, pure and total over its three inputs so every
/// combination is directly testable (a `Settled` observation cannot be
/// constructed outside the product crate).
pub(super) fn compose_availability(
    product: (bool, Option<String>),
    product_classified_a_live_gateway: bool,
    resident: ResidentSibling,
) -> (bool, Option<String>) {
    if product.0 {
        return product;
    }
    match resident {
        ResidentSibling::Attachable if !product_classified_a_live_gateway => (true, None),
        _ => product,
    }
}

/// Read the pass-through's resident-sibling predicate once. Filesystem-only, so
/// it costs a stat and a small read behind the snapshot memo.
fn observe_resident_sibling() -> ResidentSibling {
    match crate::routes::ops::resident_sibling_is_attachable() {
        Ok(()) => ResidentSibling::Attachable,
        Err(_) => ResidentSibling::Absent,
    }
}

/// The product lane's own verdict, unchanged: what the fixed receipt and the
/// product gateway-discovery record alone can say.
fn availability_from_product(
    release: &ReleaseObservation,
    verdict: Option<&Verdict>,
) -> (bool, Option<String>) {
    match release {
        ReleaseObservation::Absent => (
            false,
            Some("a2a orchestration is not installed".to_string()),
        ),
        ReleaseObservation::RecoveryRequired => (
            false,
            Some("a2a fixed receipt requires recovery".to_string()),
        ),
        ReleaseObservation::Busy => (
            false,
            Some("a2a installation authority is busy".to_string()),
        ),
        ReleaseObservation::Unverifiable => (
            false,
            Some("a2a fixed receipt authority is unverifiable".to_string()),
        ),
        ReleaseObservation::Settled(_) => match verdict {
            None => (
                false,
                Some("a2a gateway installed but stopped (no live discovery)".to_string()),
            ),
            Some(Verdict::OwnedLive | Verdict::ForeignAttachable) => (true, None),
            Some(Verdict::OwnedStale) => (
                false,
                Some("owned a2a gateway is stale (recorded process not alive)".to_string()),
            ),
            Some(Verdict::OwnedIncompatible) => (
                false,
                Some(
                    "owned a2a gateway is incompatible with this release (stop or update to recover)"
                        .to_string(),
                ),
            ),
            Some(Verdict::ForeignImmutable { reason }) => (
                false,
                Some(format!(
                    "a foreign a2a gateway holds the runtime and stays immutable: {}",
                    immutable_reason(reason)
                )),
            ),
        },
    }
}

/// Build the component-handshake projection from ALREADY-READ state: the
/// installed release set, owned-or-foreign gateway identity, protocol and
/// state-schema ranges, and the one readiness model. No secret is ever projected.
pub(super) fn handshake_value(
    release: &ReleaseObservation,
    discovery: Option<&GatewayDiscovery>,
    verdict: Option<&Verdict>,
    readiness: Option<Readiness>,
    available: bool,
    reason: Option<String>,
) -> Value {
    let gateway = discovery.map(|d| {
        json!({
            "endpoint": d.endpoint,
            "pid": d.pid,
            "generation": d.generation,
            "protocol": { "minimum": d.protocol.minimum, "maximum": d.protocol.maximum },
            "state_schema": {
                "minimum": d.state_schema.minimum,
                "maximum": d.state_schema.maximum,
            },
            "ownership": match verdict {
                Some(Verdict::OwnedLive) => "owned",
                Some(Verdict::OwnedStale) => "owned-stale",
                Some(Verdict::OwnedIncompatible) => "owned-incompatible",
                Some(Verdict::ForeignAttachable) => "foreign-attachable",
                Some(Verdict::ForeignImmutable { .. }) => "foreign-immutable",
                None => "unknown",
            },
        })
    });
    let settled = release.settled();
    json!({
        "installed": release.installed(),
        "installed_known": matches!(release, ReleaseObservation::Absent | ReleaseObservation::Settled(_)),
        "install_state": release.label(),
        "recovery_required": matches!(release, ReleaseObservation::RecoveryRequired),
        "degraded": matches!(release, ReleaseObservation::RecoveryRequired | ReleaseObservation::Busy | ReleaseObservation::Unverifiable),
        "release_set": settled.map(|r| json!({
            "name": r.a2a_identity().name,
            "version": r.a2a_identity().version,
            "target": r.target().triple(),
            "active_generation": r.active_generation(),
        })),
        "readiness": readiness,
        "supported": {
            "protocol": {
                "minimum": supported_protocol().minimum,
                "maximum": supported_protocol().maximum,
            },
            "state_schema": {
                "minimum": supported_state_schema().minimum,
                "maximum": supported_state_schema().maximum,
            },
        },
        "gateway": gateway,
        "available": available,
        "reason": reason,
    })
}

/// The honest agent-orchestration availability derived from product state under
/// an app home, WITHOUT reading any credential secret. One receipt + one
/// discovery read, then the pure classifier. Scope-independent (a2a is one
/// machine-global resident). Used by the seated plane's own reads.
pub(crate) fn agent_availability_at(
    paths: &ProductPaths,
    owner_id: &str,
) -> (bool, Option<String>) {
    let release = observe_product_release(paths, owner_id);
    let discovery = read_gateway_discovery(paths);
    let verdict = discovery
        .as_ref()
        .map(|d| d.classify(&discovery_ctx(owner_id)));
    availability_from(&release, verdict.as_ref(), observe_resident_sibling())
}

/// The component-handshake projection for a product state under an app home,
/// reading the receipt and discovery ONCE. Used by the seated plane's own
/// reads (`/status` facts); the per-response hot path goes through the memoized
/// [`resolve_agent_snapshot`] instead.
pub(crate) fn agent_handshake_at(paths: &ProductPaths, owner_id: &str) -> Value {
    let release = observe_product_release(paths, owner_id);
    let discovery = read_gateway_discovery(paths);
    let verdict = discovery
        .as_ref()
        .map(|d| d.classify(&discovery_ctx(owner_id)));
    let (available, reason) =
        availability_from(&release, verdict.as_ref(), observe_resident_sibling());
    let readiness = readiness_from(&release, verdict.as_ref());
    handshake_value(
        &release,
        discovery.as_ref(),
        verdict.as_ref(),
        readiness,
        available,
        reason,
    )
}

/// One machine-global read pass of A2A product state (review MEDIUM): the agent
/// tier AND the component handshake are BOTH derived from a single receipt +
/// discovery read. Memoized on a short TTL so the per-response `tiers_value` hot
/// path — which needs both — does not re-`derive` paths and re-read+parse the
/// discovery/receipt files on every envelope.
struct AgentSnapshot {
    available: bool,
    reason: Option<String>,
    handshake: Value,
}

/// The memo lifetime. Deliberately far shorter than the discovery freshness
/// window (`DISCOVERY_FRESHNESS`, 30s) so the memo caches the READS, never a
/// stale verdict: a gateway going down still degrades the tier within this
/// window on the next resolve.
const AGENT_SNAPSHOT_TTL: Duration = Duration::from_millis(1000);

/// The memoized snapshot with the instant it was computed. Aliased so the cache
/// type stays legible (clippy `type_complexity`).
type CachedSnapshot = (Instant, Arc<AgentSnapshot>);

fn agent_snapshot_cache() -> &'static RwLock<Option<CachedSnapshot>> {
    static CACHE: OnceLock<RwLock<Option<CachedSnapshot>>> = OnceLock::new();
    CACHE.get_or_init(|| RwLock::new(None))
}

/// Resolve the machine-global A2A snapshot, memoized for [`AGENT_SNAPSHOT_TTL`].
/// A fresh cached snapshot is returned without touching the filesystem; a stale
/// or absent one triggers exactly one read pass. Honesty is preserved: the memo
/// holds the real classification for at most the TTL, never an optimistic verdict.
fn resolve_agent_snapshot() -> Arc<AgentSnapshot> {
    if let Some((at, snap)) = agent_snapshot_cache()
        .read()
        .unwrap_or_else(|e| e.into_inner())
        .as_ref()
        && at.elapsed() < AGENT_SNAPSHOT_TTL
    {
        return snap.clone();
    }
    let snap = Arc::new(compute_agent_snapshot());
    *agent_snapshot_cache()
        .write()
        .unwrap_or_else(|e| e.into_inner()) = Some((Instant::now(), snap.clone()));
    snap
}

/// The single read pass behind the memo: derive the product paths once, read the
/// receipt once and the discovery once, then build BOTH the agent availability
/// and the component handshake from them. A path-resolution failure degrades
/// honestly, never optimism.
fn compute_agent_snapshot() -> AgentSnapshot {
    let paths = match ProductPaths::derive() {
        Ok(paths) => paths,
        Err(e) => {
            let reason = format!("a2a product paths unresolved: {e}");
            return AgentSnapshot {
                available: false,
                reason: Some(reason.clone()),
                handshake: json!({
                    "installed": null,
                    "installed_known": false,
                    "install_state": "unverifiable",
                    "readiness": null,
                    "degraded": true,
                    "available": false,
                    "reason": reason,
                }),
            };
        }
    };
    let owner_id = paths.root().to_string_lossy().to_string();
    let release = observe_product_release(&paths, &owner_id);
    let discovery = read_gateway_discovery(&paths);
    let verdict = discovery
        .as_ref()
        .map(|d| d.classify(&discovery_ctx(&owner_id)));
    let (available, reason) =
        availability_from(&release, verdict.as_ref(), observe_resident_sibling());
    let readiness = readiness_from(&release, verdict.as_ref());
    let handshake = handshake_value(
        &release,
        discovery.as_ref(),
        verdict.as_ref(),
        readiness,
        available,
        reason.clone(),
    );
    AgentSnapshot {
        available,
        reason,
        handshake,
    }
}

/// Resolve the agent-orchestration tier MACHINE-GLOBALLY for the shared tiers
/// builder: every served response overlays this honest classification onto
/// the degraded-by-default seed, so absence can never masquerade as availability.
/// Reads through the memoized snapshot so it shares one filesystem pass with the
/// handshake decoration on the same response.
pub(crate) fn resolve_agent_tier() -> (bool, Option<String>) {
    let snap = resolve_agent_snapshot();
    (snap.available, snap.reason.clone())
}

/// Resolve the A2A component handshake MACHINE-GLOBALLY for the tiers decoration,
/// sharing the memoized read pass with [`resolve_agent_tier`].
pub(crate) fn resolve_agent_handshake() -> Value {
    resolve_agent_snapshot().handshake.clone()
}
