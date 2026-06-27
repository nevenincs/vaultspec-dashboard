//! Rag service discovery and the loopback HTTP client (engine-spec §5.2,
//! D5.2): consumed via the resident HTTP service only — never via Python
//! import, never bundled; the published wheel's torch-free guarantee is
//! untouchable. Absence or death of rag is a truthful, designed state.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Deserialize;

use crate::RagAvailability;

#[derive(Debug, thiserror::Error)]
pub enum RagError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("malformed service.json: {0}")]
    ServiceJson(#[from] serde_json::Error),
    #[error("rag responded {status}: {body}")]
    Http { status: u16, body: String },
    #[error("malformed HTTP response")]
    Protocol,
}

pub type Result<T> = std::result::Result<T, RagError>;

/// Rag's resident-service discovery file (the pattern the engine mirrors).
/// Project-relative candidate; see [`service_json_candidates`].
pub fn service_json_path(vault_root: &Path) -> PathBuf {
    vault_root
        .join("data")
        .join("search-data")
        .join("service.json")
}

/// Discovery candidates in precedence order — machine-global FIRST
/// (rag-service-management discovery invariant). rag is ONE resident service per
/// machine, writing `~/.vaultspec-rag/service.json`; that machine-global candidate
/// is consulted FIRST so a stale or forward-compatible per-scope file can never
/// shadow the live machine service. The dashboard NEVER overrides
/// `VAULTSPEC_RAG_STATUS_DIR` (which would fragment discovery off this path while
/// the machine lock still allows only one service); if per-scope isolation is ever
/// required, switch to a STATUS_DIR-independent machine pointer (the lock-holder
/// pid), coordinated with rag first.
pub fn service_json_candidates(vault_root: &Path) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"));
    if let Some(home) = home {
        candidates.push(
            PathBuf::from(home)
                .join(".vaultspec-rag")
                .join("service.json"),
        );
    }
    // Forward-compatible per-scope fallback: consulted ONLY when the machine-global
    // file is absent, never preferred over it.
    candidates.push(service_json_path(vault_root));
    candidates
}

/// Heartbeat staleness threshold: rag refreshes every 15s with a 60s stale
/// bound; we allow 120s before declaring the service dead.
pub const HEARTBEAT_STALE_MS: i64 = 120_000;

/// Rag response body ceiling (robustness H3, 2026-06-13): the read has a
/// timeout but no total-byte bound, so a runaway rag service could stream an
/// unbounded body and OOM the engine. Search envelopes are small;
/// 16 MiB is generous headroom while bounding the pathological case. A body
/// past the cap is a typed `Protocol` error (the semantic tier degrades),
/// never a buffer grown to exhaustion.
pub const MAX_RAG_BODY: u64 = 16 * 1024 * 1024;

#[derive(Debug, Clone, Deserialize)]
pub struct ServiceInfo {
    pub port: u16,
    #[serde(default)]
    pub service_token: Option<String>,
    #[serde(default)]
    pub pid: Option<u32>,
    /// The live rag service writes ISO-8601 strings; ms-since-epoch is
    /// also accepted. Absent in older files.
    #[serde(default)]
    pub last_heartbeat: Option<Heartbeat>,
    /// The resident Qdrant store's HTTP port (graph-semantic-embeddings ADR D1):
    /// embeddings are scrolled DIRECTLY from Qdrant, not through rag's own
    /// service. rag writes this into `service.json` (the `storage_path` port);
    /// absent in files that predate the embedding read, where the documented
    /// default port is used. Accepts the `storage_port` field name (and the
    /// alias `qdrant_port`) so a future rag-side rename of the key still binds.
    #[serde(default, alias = "qdrant_port")]
    pub storage_port: Option<u16>,
}

impl ServiceInfo {
    /// The Qdrant HTTP port to scroll embeddings from: the discovered
    /// `storage_port`, or the documented default ([`crate::vectors::DEFAULT_QDRANT_PORT`])
    /// when `service.json` does not carry one.
    pub fn qdrant_port(&self) -> u16 {
        self.storage_port
            .unwrap_or(crate::vectors::DEFAULT_QDRANT_PORT)
    }
}

/// The ungated `GET /health` body (rag single-machine model). `/health` is the
/// authoritative liveness signal: a fresh `service.json` heartbeat says "a
/// service wrote this recently", but only `/health` `status == "ready"` with a
/// live `pid` confirms the resident service is actually serving. The nested
/// `qdrant` block is also the capability source for the version-gated
/// Qdrant-native reads and the embedding-scroll gate.
#[derive(Debug, Clone, Deserialize)]
pub struct HealthInfo {
    pub status: String,
    #[serde(default)]
    pub pid: Option<u32>,
    #[serde(default)]
    pub qdrant: Option<QdrantHealth>,
    #[serde(default)]
    pub project_count: Option<u32>,
    #[serde(default)]
    pub service_token: Option<String>,
    /// rag's bare storage-schema version: the cheapest pre-read gate for the
    /// direct-Qdrant embedding scroll (the full descriptor is on `/readiness`).
    /// Absent in older rag builds that predate the storage-schema contract, where
    /// it is `None` and the version gate treats the shape as the engine's baseline.
    #[serde(default)]
    pub schema_version: Option<u64>,
}

/// The `qdrant` sub-object of `/health`: the resident Qdrant's version, HTTP
/// port, and liveness. `version`/`port` gate the Tier-2 Qdrant-native reads and
/// the direct embedding scroll; they are absent in local-only / older builds.
#[derive(Debug, Clone, Deserialize)]
pub struct QdrantHealth {
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub alive: Option<bool>,
    /// `"local"` (embedded on-disk, no HTTP endpoint) | `"server"` | `"remote"`.
    /// In local mode there is no Qdrant HTTP port, so the direct Tier-2 reads
    /// degrade honestly rather than dialing a port nothing listens on.
    #[serde(default)]
    pub mode: Option<String>,
}

impl QdrantHealth {
    /// Whether Qdrant exposes a reachable HTTP endpoint (server/remote mode with a
    /// live supervisor). False in local-only mode — the direct-Qdrant Tier-2 reads
    /// are unavailable and must degrade honestly.
    pub fn http_reachable(&self) -> bool {
        self.alive == Some(true) && self.mode.as_deref() != Some("local")
    }
}

impl HealthInfo {
    /// `/health` reports the service ready to serve (case-insensitive match on
    /// rag's `"ready"` state, distinct from `"degraded"`/`"error"`).
    pub fn is_ready(&self) -> bool {
        self.status.eq_ignore_ascii_case("ready")
    }
}

/// The machine-global rag state for the lifecycle/ops surface, derived from
/// discovery + heartbeat + an ungated `GET /health` liveness confirm. This is
/// the authoritative "is a rag running on this machine" signal (the dashboard
/// attaches to a `Running` service regardless of who started it, and starts its
/// own only when genuinely `Absent`). It is deliberately NOT computed on the
/// per-response hot path — that path stays filesystem-only via [`discover`] —
/// because the `/health` round-trip belongs only to lifecycle/ops callers.
#[derive(Debug, Clone)]
pub enum RagMachineState {
    /// `service.json` fresh AND `/health` ready with a live pid: a service the
    /// dashboard manages (whether or not it started it).
    Running {
        info: ServiceInfo,
        health: HealthInfo,
    },
    /// A service was discovered but is not serving: stale heartbeat, a
    /// malformed `service.json`, or `/health` unreachable / not-ready. Surfaced
    /// distinctly in the UI, but treated as absent for start purposes.
    Crashed {
        reason: String,
        info: Option<ServiceInfo>,
    },
    /// No discoverable service on the machine: the only state in which the
    /// dashboard may start its own service.
    Absent { reason: String },
}

impl RagMachineState {
    /// True only in [`RagMachineState::Running`].
    pub fn is_running(&self) -> bool {
        matches!(self, RagMachineState::Running { .. })
    }

    /// The discovered service info when a service was found (`Running` or a
    /// `Crashed` that still had a readable `service.json`).
    pub fn service_info(&self) -> Option<&ServiceInfo> {
        match self {
            RagMachineState::Running { info, .. } => Some(info),
            RagMachineState::Crashed { info, .. } => info.as_ref(),
            RagMachineState::Absent { .. } => None,
        }
    }
}

/// Heartbeat in either wire format.
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum Heartbeat {
    Millis(i64),
    Iso(String),
}

impl Heartbeat {
    /// Ms since epoch; `None` when an ISO string cannot be parsed (treated
    /// as fresh — availability must not break on a format we half-know).
    pub fn as_millis(&self) -> Option<i64> {
        match self {
            Heartbeat::Millis(ms) => Some(*ms),
            Heartbeat::Iso(s) => parse_iso8601_ms(s),
        }
    }
}

/// Parse `YYYY-MM-DDTHH:MM:SS[(+|-)HH:MM|Z]` to ms since epoch,
/// dependency-free (days-from-civil, Hinnant's algorithm).
fn parse_iso8601_ms(s: &str) -> Option<i64> {
    let bytes = s.as_bytes();
    if bytes.len() < 19 {
        return None;
    }
    let num = |range: std::ops::Range<usize>| s.get(range)?.parse::<i64>().ok();
    let (year, month, day) = (num(0..4)?, num(5..7)?, num(8..10)?);
    let (hour, minute, second) = (num(11..13)?, num(14..16)?, num(17..19)?);
    // Offset suffix: Z, +HH:MM, or -HH:MM (seconds fraction not emitted by rag).
    let rest = &s[19..];
    let offset_minutes = if rest.is_empty() || rest == "Z" {
        0
    } else if rest.len() == 6 && (rest.starts_with('+') || rest.starts_with('-')) {
        let sign = if rest.starts_with('-') { -1 } else { 1 };
        let h = rest.get(1..3)?.parse::<i64>().ok()?;
        let m = rest.get(4..6)?.parse::<i64>().ok()?;
        sign * (h * 60 + m)
    } else {
        return None;
    };
    // days_from_civil (Hinnant): days since 1970-01-01.
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    let seconds = days * 86_400 + hour * 3_600 + minute * 60 + second - offset_minutes * 60;
    Some(seconds * 1000)
}

/// Pluggable transport so discovery/search/control logic tests without a live
/// service; the default is the minimal loopback HTTP/1.1 transport below. The
/// control client (`control.rs`) reaches rag's GET read routes (jobs, watcher,
/// projects, service-state, ...) through `get`, while search/embeddings POST
/// through `post_json` — one transport, two verbs, the same bounded read.
pub trait RagTransport {
    fn post_json(&self, path: &str, body: &str) -> Result<String>;
    /// GET a path with no request body. The bounded read + status + de-chunk
    /// handling is identical to `post_json`; only the request line differs.
    fn get(&self, path: &str) -> Result<String>;
}

/// Minimal HTTP/1.1 over loopback TCP. Deliberately dependency-free: the
/// service is loopback-only by design (not an auth boundary), JSON in/out,
/// Content-Length framing — a full HTTP client is not warranted for the
/// engine's only optional dependency. Both GET and POST share one bounded,
/// timed request path so a runaway or stalled rag service can neither OOM nor
/// hang the engine on either verb.
pub struct LoopbackTransport {
    pub port: u16,
    pub bearer: Option<String>,
    pub timeout: Duration,
}

impl LoopbackTransport {
    /// Issue one bounded, timed HTTP/1.1 request. `body` is `Some` for POST
    /// (Content-Type + Content-Length framing) and `None` for GET (no body,
    /// no content headers). The read carries BOTH the `self.timeout` socket
    /// inactivity bound and the `MAX_RAG_BODY` byte ceiling.
    fn request(&self, method: &str, path: &str, body: Option<&str>) -> Result<String> {
        let mut stream = TcpStream::connect(("127.0.0.1", self.port))?;
        stream.set_read_timeout(Some(self.timeout))?;
        stream.set_write_timeout(Some(self.timeout))?;
        let auth = self
            .bearer
            .as_deref()
            .map(|t| format!("Authorization: Bearer {t}\r\n"))
            .unwrap_or_default();
        let request = match body {
            Some(body) => format!(
                "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\
                 Content-Type: application/json\r\n{auth}Content-Length: {}\r\n\r\n{body}",
                body.len()
            ),
            None => format!(
                "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n{auth}\r\n"
            ),
        };
        stream.write_all(request.as_bytes())?;
        // Bounded read (robustness H3): read at most MAX_RAG_BODY + 1 bytes. The
        // read timeout above bounds latency; this bounds memory so a runaway rag
        // service cannot OOM the engine. One byte over the cap is a typed
        // Protocol error rather than an exhausted buffer.
        let mut bytes = Vec::new();
        (&mut stream)
            .take(MAX_RAG_BODY + 1)
            .read_to_end(&mut bytes)?;
        if bytes.len() as u64 > MAX_RAG_BODY {
            return Err(RagError::Protocol);
        }
        let raw = String::from_utf8(bytes).map_err(|_| RagError::Protocol)?;

        let (head, response_body) = raw.split_once("\r\n\r\n").ok_or(RagError::Protocol)?;
        let status: u16 = head
            .lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .and_then(|code| code.parse().ok())
            .ok_or(RagError::Protocol)?;
        // Chunked framing must never reach the JSON parser as a confusing
        // parse error (audit redline W02P09-502): de-chunk when the server
        // says so, fail typed when the chunk grammar is malformed.
        let body = if head
            .lines()
            .any(|l| l.to_ascii_lowercase().trim() == "transfer-encoding: chunked")
        {
            dechunk(response_body)?
        } else {
            response_body.to_string()
        };
        if !(200..300).contains(&status) {
            return Err(RagError::Http { status, body });
        }
        Ok(body)
    }
}

impl RagTransport for LoopbackTransport {
    fn post_json(&self, path: &str, body: &str) -> Result<String> {
        self.request("POST", path, Some(body))
    }

    fn get(&self, path: &str) -> Result<String> {
        self.request("GET", path, None)
    }
}

/// Decode an HTTP/1.1 chunked body (size lines in hex, terminated by a
/// zero-length chunk). Malformed grammar is a typed protocol error.
fn dechunk(raw: &str) -> Result<String> {
    let mut out = String::new();
    let mut rest = raw;
    loop {
        let (size_line, after) = rest.split_once("\r\n").ok_or(RagError::Protocol)?;
        let size = usize::from_str_radix(size_line.split(';').next().unwrap_or("").trim(), 16)
            .map_err(|_| RagError::Protocol)?;
        if size == 0 {
            return Ok(out);
        }
        if after.len() < size {
            return Err(RagError::Protocol);
        }
        out.push_str(&after[..size]);
        rest = after[size..]
            .strip_prefix("\r\n")
            .ok_or(RagError::Protocol)?;
    }
}

/// Discover the rag service for a vault root. A missing or unreadable
/// discovery file is the truthful "absent" state, never an error: all
/// other tiers, and the whole engine, function fully without rag.
pub fn discover(vault_root: &Path) -> (RagAvailability, Option<ServiceInfo>) {
    discover_at(&service_json_candidates(vault_root))
}

/// The typed result of scanning the discovery candidates — the crashed-vs-absent
/// distinction the running-predicate keys on, carried as data rather than inferred
/// from a reason string. `Fresh` is a service.json with a fresh heartbeat; `Stale`
/// is one whose heartbeat has lapsed (a crash); `Malformed` is an unreadable
/// service.json (a corrupt/partial file — also a crash); `Absent` is no file.
#[derive(Debug, Clone)]
pub enum DiscoveryOutcome {
    Fresh(ServiceInfo),
    Stale { reason: String, info: ServiceInfo },
    Malformed { reason: String },
    Absent { reason: String },
}

/// Scan the discovery candidates into a typed [`DiscoveryOutcome`]. Both
/// [`discover_at`] (the tiers-block view) and [`probe_machine_state_at`] (the
/// running-predicate) derive from this single classification, so the crashed-vs-
/// absent split is data, not a fragile substring match on a reason string.
pub fn discover_kind(candidates: &[PathBuf]) -> DiscoveryOutcome {
    let mut malformed: Option<String> = None;
    for path in candidates {
        let Ok(raw) = std::fs::read_to_string(path) else {
            continue;
        };
        match serde_json::from_str::<ServiceInfo>(&raw) {
            Ok(info) => {
                // A present file with a stale heartbeat is a dead or crashed
                // service — truthfully degraded, not available.
                if let Some(heartbeat) = info.last_heartbeat.as_ref().and_then(Heartbeat::as_millis)
                {
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_millis() as i64)
                        .unwrap_or(0);
                    if now.saturating_sub(heartbeat) > HEARTBEAT_STALE_MS {
                        return DiscoveryOutcome::Stale {
                            reason: "rag service heartbeat stale (service crashed or stopped)"
                                .to_string(),
                            info,
                        };
                    }
                }
                return DiscoveryOutcome::Fresh(info);
            }
            Err(e) => malformed = Some(format!("rag service.json unreadable: {e}")),
        }
    }
    match malformed {
        Some(reason) => DiscoveryOutcome::Malformed { reason },
        None => DiscoveryOutcome::Absent {
            reason: "rag service not installed or not started (no service.json)".to_string(),
        },
    }
}

/// Discovery over an explicit candidate list (hermetic for tests). The
/// tiers-block view: a fresh service is `Available`; everything else (stale,
/// malformed, absent) is `Unavailable` with its reason.
pub fn discover_at(candidates: &[PathBuf]) -> (RagAvailability, Option<ServiceInfo>) {
    match discover_kind(candidates) {
        DiscoveryOutcome::Fresh(info) => (RagAvailability::Available, Some(info)),
        DiscoveryOutcome::Stale { reason, .. }
        | DiscoveryOutcome::Malformed { reason }
        | DiscoveryOutcome::Absent { reason } => (RagAvailability::Unavailable { reason }, None),
    }
}

/// Probe the machine-global rag state: discovery + heartbeat (via [`discover`])
/// plus an ungated `GET /health` liveness confirm on the discovered port. This is
/// the authoritative running-predicate for the lifecycle/ops surface; it pays a
/// `/health` round-trip and so must never be called on the per-response hot path
/// (which uses the filesystem-only [`discover`]).
pub fn probe_machine_state(vault_root: &Path, health_timeout: Duration) -> RagMachineState {
    probe_machine_state_at(&service_json_candidates(vault_root), |port| {
        LoopbackTransport {
            port,
            bearer: None,
            timeout: health_timeout,
        }
        .get("/health")
    })
}

/// Running-predicate over an explicit candidate list and an injectable
/// `/health` probe (hermetic for tests). Maps discovery + the `/health` body to
/// [`RagMachineState`]: a fresh `service.json` plus a `ready` `/health` is
/// `Running`; a discovered-but-not-serving service is `Crashed`; no service is
/// `Absent`.
pub fn probe_machine_state_at(
    candidates: &[PathBuf],
    health_probe: impl Fn(u16) -> Result<String>,
) -> RagMachineState {
    match discover_kind(candidates) {
        DiscoveryOutcome::Fresh(info) => match health_probe(info.port) {
            Ok(raw) => match serde_json::from_str::<HealthInfo>(&raw) {
                Ok(health) if health.is_ready() => RagMachineState::Running { info, health },
                Ok(health) => RagMachineState::Crashed {
                    reason: format!("rag /health reports '{}', not ready", health.status),
                    info: Some(info),
                },
                Err(e) => RagMachineState::Crashed {
                    reason: format!("rag /health response unparseable: {e}"),
                    info: Some(info),
                },
            },
            Err(e) => RagMachineState::Crashed {
                reason: format!("rag discovered but /health unreachable: {e}"),
                info: Some(info),
            },
        },
        // A present-but-not-serving service.json (stale heartbeat or malformed
        // file) is a crash, not absence — carried as a typed outcome, not inferred
        // from the reason string. Only `Absent` licenses the dashboard to start.
        DiscoveryOutcome::Stale { reason, info } => RagMachineState::Crashed {
            reason,
            info: Some(info),
        },
        DiscoveryOutcome::Malformed { reason } => RagMachineState::Crashed { reason, info: None },
        DiscoveryOutcome::Absent { reason } => RagMachineState::Absent { reason },
    }
}

#[cfg(test)]
pub(crate) mod test_support {
    use super::*;
    use std::cell::RefCell;

    /// Canned transport for unit tests.
    pub struct FakeTransport {
        pub responses: RefCell<Vec<Result<String>>>,
        pub calls: RefCell<Vec<(String, String)>>,
    }

    impl FakeTransport {
        pub fn returning(payloads: Vec<&str>) -> Self {
            FakeTransport {
                responses: RefCell::new(
                    payloads
                        .into_iter()
                        .rev()
                        .map(|p| Ok(p.to_string()))
                        .collect(),
                ),
                calls: RefCell::new(Vec::new()),
            }
        }
    }

    impl RagTransport for FakeTransport {
        fn post_json(&self, path: &str, body: &str) -> Result<String> {
            self.calls.borrow_mut().push((path.into(), body.into()));
            self.responses
                .borrow_mut()
                .pop()
                .unwrap_or(Err(RagError::Protocol))
        }

        fn get(&self, path: &str) -> Result<String> {
            // GET carries no body; record an empty body so call-order tests can
            // assert the path while sharing the one canned-response queue.
            self.calls.borrow_mut().push((path.into(), String::new()));
            self.responses
                .borrow_mut()
                .pop()
                .unwrap_or(Err(RagError::Protocol))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_service_json_is_truthful_absence_not_an_error() {
        let dir = tempfile::tempdir().unwrap();
        // Hermetic candidate list: the project-relative path only.
        let (availability, info) = discover_at(&[service_json_path(dir.path())]);
        assert!(matches!(
            availability,
            RagAvailability::Unavailable { ref reason } if reason.contains("service.json")
        ));
        assert!(info.is_none());
    }

    #[test]
    fn valid_service_json_discovers_port_and_token() {
        let dir = tempfile::tempdir().unwrap();
        let p = service_json_path(dir.path());
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(
            &p,
            r#"{"port": 8766, "service_token": "tok-1", "pid": 1234}"#,
        )
        .unwrap();
        let (availability, info) = discover_at(&[p]);
        assert_eq!(availability, RagAvailability::Available);
        let info = info.unwrap();
        assert_eq!(info.port, 8766);
        assert_eq!(info.service_token.as_deref(), Some("tok-1"));
        // No storage_port in the file: the documented Qdrant default is used.
        assert_eq!(info.qdrant_port(), crate::vectors::DEFAULT_QDRANT_PORT);
    }

    #[test]
    fn storage_port_is_discovered_for_the_qdrant_embedding_read() {
        let dir = tempfile::tempdir().unwrap();
        let p = service_json_path(dir.path());
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        // rag writes the resident Qdrant port into service.json; the embedding
        // read scrolls THAT port directly, not rag's own service port.
        std::fs::write(&p, r#"{"port": 8766, "storage_port": 8765}"#).unwrap();
        let (_availability, info) = discover_at(&[p]);
        assert_eq!(info.unwrap().qdrant_port(), 8765);
    }

    #[test]
    fn home_dir_candidate_is_searched_and_stale_heartbeats_degrade() {
        let dir = tempfile::tempdir().unwrap();
        // The user-home convention (the path the LIVE rag service uses).
        let home_style = dir.path().join(".vaultspec-rag").join("service.json");
        std::fs::create_dir_all(home_style.parent().unwrap()).unwrap();
        std::fs::write(&home_style, r#"{"port": 8766, "last_heartbeat": 1000}"#).unwrap();
        let missing_project = dir.path().join("nope").join("service.json");
        let (availability, _) = discover_at(&[missing_project, home_style.clone()]);
        // Heartbeat from 1970: stale → truthfully degraded, not available.
        assert!(matches!(
            availability,
            RagAvailability::Unavailable { ref reason } if reason.contains("stale")
        ));
        // Fresh heartbeat: available via the home candidate.
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        std::fs::write(
            &home_style,
            format!(r#"{{"port": 8766, "last_heartbeat": {now}}}"#),
        )
        .unwrap();
        let (availability, info) = discover_at(&[home_style]);
        assert_eq!(availability, RagAvailability::Available);
        assert_eq!(info.unwrap().port, 8766);
    }

    #[test]
    fn chunked_bodies_are_dechunked_and_malformed_chunks_fail_typed() {
        // Audit redline W02P09-502.
        assert_eq!(
            dechunk("5\r\n{\"ok\"\r\n7\r\n: true}\r\n0\r\n\r\n").unwrap(),
            "{\"ok\": true}"
        );
        assert!(matches!(dechunk("zz\r\nbody"), Err(RagError::Protocol)));
        assert!(matches!(
            dechunk("ff\r\nshort\r\n"),
            Err(RagError::Protocol)
        ));
    }

    #[test]
    fn chunked_transport_response_reaches_the_caller_decoded() {
        use std::io::Write;
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            // Drain the request enough to respond.
            let mut buf = [0u8; 1024];
            let _ = std::io::Read::read(&mut stream, &mut buf);
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n\
                 b\r\n{{\"ok\": true\r\n1\r\n}}\r\n0\r\n\r\n"
            )
            .unwrap();
        });
        let transport = LoopbackTransport {
            port,
            bearer: None,
            timeout: Duration::from_secs(5),
        };
        let body = transport.post_json("/search", "{}").unwrap();
        assert_eq!(body, "{\"ok\": true}");
        server.join().unwrap();
    }

    #[test]
    fn loopback_transport_speaks_http1_with_bearer() {
        use std::io::{BufRead, BufReader, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut saw_bearer = false;
            let mut content_length = 0usize;
            loop {
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                if line.starts_with("Authorization: Bearer tok") {
                    saw_bearer = true;
                }
                if let Some(rest) = line.strip_prefix("Content-Length: ") {
                    content_length = rest.trim().parse().unwrap();
                }
                if line == "\r\n" {
                    break;
                }
            }
            let mut body = vec![0u8; content_length];
            std::io::Read::read_exact(&mut reader, &mut body).unwrap();
            let response_body = format!(r#"{{"ok": true, "bearer": {saw_bearer}}}"#);
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response_body.len(),
                response_body
            )
            .unwrap();
        });

        let transport = LoopbackTransport {
            port,
            bearer: Some("tok".into()),
            timeout: Duration::from_secs(5),
        };
        let body = transport.post_json("/search", r#"{"query": "x"}"#).unwrap();
        assert!(body.contains("\"bearer\": true"));
        server.join().unwrap();
    }

    #[test]
    fn a_runaway_rag_body_is_bounded_not_buffered_to_oom() {
        // Robustness H3: the read has a timeout but historically no byte
        // ceiling — a runaway rag service streaming an unbounded body would OOM
        // the engine. A response past MAX_RAG_BODY must be a typed Protocol
        // error, never an exhausted buffer.
        use std::io::Write;
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            // Drain the request enough to respond.
            let mut buf = [0u8; 1024];
            let _ = std::io::Read::read(&mut stream, &mut buf);
            // Headers, then a body that overshoots the cap. Connection: close
            // means the body runs until EOF; we just keep writing past the cap.
            let _ = write!(stream, "HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n");
            // Write the head of a JSON body, then flood past the ceiling. A
            // 1 MiB chunk repeated until we clear MAX_RAG_BODY + headroom.
            let chunk = vec![b'x'; 1024 * 1024];
            let mut written: u64 = 0;
            let target = MAX_RAG_BODY + 2 * 1024 * 1024;
            while written < target {
                // A broken pipe is expected once the client gives up at the cap.
                if stream.write_all(&chunk).is_err() {
                    break;
                }
                written += chunk.len() as u64;
            }
        });
        let transport = LoopbackTransport {
            port,
            bearer: None,
            timeout: Duration::from_secs(10),
        };
        let result = transport.post_json("/search", "{}");
        assert!(
            matches!(result, Err(RagError::Protocol)),
            "a body past the cap is a typed Protocol error, got {result:?}"
        );
        let _ = server.join();
    }

    /// Write a `service.json` with a fresh heartbeat at `path`.
    fn write_fresh_service_json(path: &Path, port: u16) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        std::fs::write(
            path,
            format!(r#"{{"port": {port}, "last_heartbeat": {now}, "pid": 4242}}"#),
        )
        .unwrap();
    }

    #[test]
    fn machine_state_running_requires_fresh_discovery_and_ready_health() {
        let dir = tempfile::tempdir().unwrap();
        let p = service_json_path(dir.path());
        write_fresh_service_json(&p, 8766);
        let state = probe_machine_state_at(std::slice::from_ref(&p), |port| {
            assert_eq!(port, 8766, "/health probes the discovered port");
            Ok(r#"{"status": "ready", "pid": 4242, "qdrant": {"version": "1.18.2", "port": 8765}}"#
                .to_string())
        });
        match state {
            RagMachineState::Running { info, health } => {
                assert_eq!(info.port, 8766);
                assert!(health.is_ready());
                assert_eq!(health.qdrant.unwrap().version.as_deref(), Some("1.18.2"));
            }
            other => panic!("expected Running, got {other:?}"),
        }
    }

    #[test]
    fn machine_state_crashed_when_health_not_ready() {
        let dir = tempfile::tempdir().unwrap();
        let p = service_json_path(dir.path());
        write_fresh_service_json(&p, 8766);
        let state = probe_machine_state_at(std::slice::from_ref(&p), |_| {
            Ok(r#"{"status": "degraded"}"#.into())
        });
        assert!(
            matches!(state, RagMachineState::Crashed { ref reason, info: Some(_) } if reason.contains("degraded")),
            "a discovered service whose /health is not ready is Crashed, got {state:?}"
        );
    }

    #[test]
    fn machine_state_crashed_when_health_unreachable() {
        let dir = tempfile::tempdir().unwrap();
        let p = service_json_path(dir.path());
        write_fresh_service_json(&p, 8766);
        let state = probe_machine_state_at(std::slice::from_ref(&p), |_| Err(RagError::Protocol));
        assert!(
            matches!(state, RagMachineState::Crashed { ref reason, .. } if reason.contains("unreachable")),
            "a fresh service.json with an unreachable /health is Crashed, got {state:?}"
        );
    }

    #[test]
    fn machine_state_crashed_on_stale_heartbeat_without_probing_health() {
        let dir = tempfile::tempdir().unwrap();
        let p = service_json_path(dir.path());
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        // Heartbeat from 1970: stale → Crashed, and /health must NOT be probed.
        std::fs::write(&p, r#"{"port": 8766, "last_heartbeat": 1000}"#).unwrap();
        let state = probe_machine_state_at(std::slice::from_ref(&p), |_| {
            panic!("/health must not be probed when discovery is already stale")
        });
        // Stale carries the discovered info now (typed DiscoveryOutcome::Stale).
        assert!(
            matches!(state, RagMachineState::Crashed { ref reason, info: Some(_) } if reason.contains("stale"))
        );
    }

    #[test]
    fn qdrant_http_reachable_is_false_in_local_mode() {
        let parse = |s: &str| {
            serde_json::from_str::<HealthInfo>(s)
                .unwrap()
                .qdrant
                .unwrap()
        };
        // server mode, supervised + alive → reachable.
        assert!(
            parse(r#"{"status":"ready","qdrant":{"mode":"server","alive":true,"port":8765}}"#)
                .http_reachable()
        );
        // local mode (embedded, no HTTP) → NOT reachable even if version is present.
        assert!(
            !parse(r#"{"status":"ready","qdrant":{"mode":"local","version":"1.18.2"}}"#)
                .http_reachable()
        );
        // alive false → not reachable.
        assert!(
            !parse(r#"{"status":"ready","qdrant":{"mode":"server","alive":false}}"#)
                .http_reachable()
        );
    }

    #[test]
    fn machine_state_absent_when_no_service_json() {
        let dir = tempfile::tempdir().unwrap();
        let missing = service_json_path(dir.path());
        let state = probe_machine_state_at(std::slice::from_ref(&missing), |_| {
            panic!("/health must not be probed when nothing is discovered")
        });
        assert!(matches!(state, RagMachineState::Absent { .. }));
    }

    #[test]
    fn discovery_lists_the_machine_global_home_candidate_first() {
        // The discovery invariant: rag is one service per machine, so the
        // machine-global ~/.vaultspec-rag/service.json must be the FIRST (winning)
        // candidate and the per-scope path only a fallback behind it.
        let vault = Path::new("Z:/some/scope/.vault");
        let candidates = service_json_candidates(vault);
        let home_idx = candidates.iter().position(|p| {
            p.to_string_lossy().contains(".vaultspec-rag") && p.ends_with("service.json")
        });
        let scope_idx = candidates
            .iter()
            .position(|p| p.to_string_lossy().contains("search-data"));
        // USERPROFILE/HOME is always set in CI/dev, so the home candidate exists.
        let home_idx = home_idx.expect("machine-global home candidate must be present");
        let scope_idx = scope_idx.expect("per-scope candidate must be present");
        assert!(
            home_idx < scope_idx,
            "machine-global home candidate must precede the per-scope candidate"
        );
    }

    #[test]
    fn machine_global_service_json_wins_over_a_per_scope_one() {
        // With BOTH a fresh machine-global file and a fresh per-scope file, the
        // machine-global one (listed first) is the service discovered.
        let dir = tempfile::tempdir().unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        let home_style = dir.path().join(".vaultspec-rag").join("service.json");
        std::fs::create_dir_all(home_style.parent().unwrap()).unwrap();
        std::fs::write(
            &home_style,
            format!(r#"{{"port": 8766, "last_heartbeat": {now}}}"#),
        )
        .unwrap();
        let per_scope = service_json_path(dir.path());
        std::fs::create_dir_all(per_scope.parent().unwrap()).unwrap();
        std::fs::write(
            &per_scope,
            format!(r#"{{"port": 9999, "last_heartbeat": {now}}}"#),
        )
        .unwrap();
        // Candidate order mirrors service_json_candidates: machine-global first.
        let (availability, info) = discover_at(&[home_style, per_scope]);
        assert_eq!(availability, RagAvailability::Available);
        assert_eq!(
            info.unwrap().port,
            8766,
            "the machine-global service (port 8766) must win over the per-scope one (9999)"
        );
    }
}
