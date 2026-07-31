//! Bounded, authenticated gateway control.
//!
//! The dashboard brokers liveness, readiness, drain, shutdown, and lifecycle
//! calls to the owned gateway over its loopback endpoint. Every call
//! here obeys the resource-bounds law: a connect timeout, a per-read timeout, a
//! TOTAL wall-clock deadline for the whole call, and a hard response byte cap.
//! The total deadline is the load-bearing bound: a per-read timeout alone RESETS
//! on every byte, so a peer trickling one byte per interval keeps a call alive
//! for as many reads as the byte cap allows. Connect, write, and every read are
//! therefore clamped to the remaining budget, so a hung, trickling, or flooding
//! gateway fails typed inside the caller's budget, never hangs or exhausts
//! memory. Transport authentication uses the dashboard control
//! (attach-control) token; a receipt-bound operation such as shutdown ALSO
//! carries the ownership capability, which the attach credential alone cannot
//! stand in for.
//!
//! The transport is a minimal HTTP/1.1 client built on `std::net` — the same
//! dependency-free posture the core subprocess runner takes — so the crate gains
//! no HTTP framework. Loopback is the only permitted destination — the
//! only desktop bind surface; a non-loopback endpoint is refused before a
//! socket is opened.

use std::io::{Read as _, Write as _};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};

use crate::a2a_contract::GATEWAY_SHUTDOWN_PATH;
use crate::credentials::Credential;
use crate::protocol::{LifecycleOp, Readiness};

/// Default connect timeout for a control call.
const DEFAULT_CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
/// Default read/write timeout for a control call.
const DEFAULT_IO_TIMEOUT: Duration = Duration::from_secs(15);
/// Default TOTAL wall-clock budget for one control call, connect included. A
/// call that has not completed by here fails [`ControlError::Timeout`] however
/// steadily the peer dribbles bytes.
const DEFAULT_TOTAL_DEADLINE: Duration = Duration::from_secs(60);
/// Floor for any socket timeout we set. A sub-millisecond `SO_RCVTIMEO` rounds
/// to zero on Windows, and zero means "block forever" — the exact hang this
/// module refuses — so every socket timeout is clamped up to this floor and a
/// remaining budget below it is treated as already expired.
const MIN_SOCKET_TIMEOUT: Duration = Duration::from_millis(1);
/// Default response byte ceiling (control responses are small JSON documents).
const DEFAULT_MAX_RESPONSE_BYTES: usize = 256 * 1024;

/// Why a control call failed.
#[derive(Debug)]
pub enum ControlError {
    /// The endpoint was not a loopback address; control is loopback-only.
    NotLoopback(String),
    /// The endpoint could not be resolved to a socket address.
    BadEndpoint(String),
    /// The call exceeded its connect or read timeout.
    Timeout,
    /// The response exceeded the byte ceiling.
    TooLarge,
    /// The gateway rejected the credential (HTTP 401/403).
    Unauthorized,
    /// The gateway returned an unexpected status code.
    BadStatus(u16),
    /// The response body could not be parsed into the expected shape.
    BadResponse(String),
    /// A transport-level I/O error.
    Transport(std::io::Error),
}

impl std::fmt::Display for ControlError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ControlError::NotLoopback(e) => write!(f, "control endpoint {e:?} is not loopback"),
            ControlError::BadEndpoint(e) => write!(f, "control endpoint {e:?} did not resolve"),
            ControlError::Timeout => write!(f, "control call timed out"),
            ControlError::TooLarge => write!(f, "control response exceeded the byte ceiling"),
            ControlError::Unauthorized => write!(f, "gateway rejected the control credential"),
            ControlError::BadStatus(c) => write!(f, "gateway returned unexpected status {c}"),
            ControlError::BadResponse(m) => write!(f, "malformed control response: {m}"),
            ControlError::Transport(e) => write!(f, "control transport error: {e}"),
        }
    }
}

impl std::error::Error for ControlError {}

/// A bounded HTTP response: the status code and the (capped) body bytes.
#[derive(Debug)]
struct ControlResponse {
    status: u16,
    body: Vec<u8>,
}

/// The authenticated, bounded control client for one owned gateway endpoint.
#[derive(Clone)]
pub struct ControlClient {
    endpoint: String,
    attach_token: String,
    connect_timeout: Duration,
    io_timeout: Duration,
    total_deadline: Duration,
    max_response_bytes: usize,
}

// Hand-written so the live attach-control bearer never reaches a `{:?}` surface
// (a panic message, an error log, a tracing span) — mirrors `Credential`'s
// redacting Debug. A derived Debug would print `attach_token` in plaintext,
// contradicting the crate's no-secret-in-any-Debug law.
impl std::fmt::Debug for ControlClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ControlClient")
            .field("endpoint", &self.endpoint)
            .field("attach_token", &"<redacted>")
            .field("connect_timeout", &self.connect_timeout)
            .field("io_timeout", &self.io_timeout)
            .field("total_deadline", &self.total_deadline)
            .field("max_response_bytes", &self.max_response_bytes)
            .finish()
    }
}

impl ControlClient {
    /// Bind a control client to a loopback `host:port` endpoint, authenticating
    /// with the attach-control token.
    #[must_use]
    pub fn new(endpoint: impl Into<String>, attach_token: impl Into<String>) -> Self {
        Self {
            endpoint: endpoint.into(),
            attach_token: attach_token.into(),
            connect_timeout: DEFAULT_CONNECT_TIMEOUT,
            io_timeout: DEFAULT_IO_TIMEOUT,
            total_deadline: DEFAULT_TOTAL_DEADLINE,
            max_response_bytes: DEFAULT_MAX_RESPONSE_BYTES,
        }
    }

    /// Override the per-phase timeouts (used by tests to trip the deadline
    /// deterministically and by callers with a tighter budget). These bound one
    /// connect and one read; the whole-call bound is
    /// [`Self::with_total_deadline`].
    #[must_use]
    pub fn with_timeouts(mut self, connect: Duration, io: Duration) -> Self {
        self.connect_timeout = connect;
        self.io_timeout = io;
        self
    }

    /// Override the TOTAL wall-clock budget for one call — connect, write, and
    /// every read together. This is the bound a caller with a real deadline
    /// (an update transaction draining a gateway, a shutdown path) must set: the
    /// per-read timeout restarts on each successful read, so it alone cannot
    /// bound a call against a peer that keeps trickling.
    #[must_use]
    pub fn with_total_deadline(mut self, total: Duration) -> Self {
        self.total_deadline = total;
        self
    }

    /// Override the response byte ceiling (used by tests to trip the cap without
    /// a huge payload).
    #[must_use]
    pub fn with_max_response_bytes(mut self, cap: usize) -> Self {
        self.max_response_bytes = cap;
        self
    }

    /// Authenticated liveness probe: the gateway answers `GET /health` 200 when
    /// live. A non-200 or transport failure is not "live".
    pub fn liveness(&self) -> std::result::Result<bool, ControlError> {
        match self.request("GET", "/health", None) {
            Ok(resp) => Ok(resp.status == 200),
            Err(ControlError::Timeout | ControlError::Transport(_)) => Ok(false),
            Err(e) => Err(e),
        }
    }

    /// Authenticated readiness probe: parse the gateway's one readiness model.
    pub fn readiness(&self) -> std::result::Result<Readiness, ControlError> {
        let resp = self.request("GET", "/readiness", None)?;
        Self::expect_ok(&resp)?;
        serde_json::from_slice(&resp.body).map_err(|e| ControlError::BadResponse(e.to_string()))
    }

    /// Close admission and drain active runs (attach-authenticated).
    pub fn drain(&self) -> std::result::Result<(), ControlError> {
        let resp = self.request("POST", "/drain", None)?;
        Self::expect_ok(&resp).map(|_| ())
    }

    /// Shut the gateway down. This receipt-bound operation carries the ownership
    /// capability in addition to the attach token; the attach credential alone
    /// cannot invoke it.
    ///
    /// Administrative shutdown is served at [`GATEWAY_SHUTDOWN_PATH`] — the
    /// gateway's own root-level admin namespace, not the retired `/api` mount.
    pub fn shutdown(&self, ownership: &Credential) -> std::result::Result<(), ControlError> {
        let resp = self.request("POST", GATEWAY_SHUTDOWN_PATH, Some(ownership.secret()))?;
        Self::expect_ok(&resp).map(|_| ())
    }

    /// Invoke a lifecycle entrypoint on the gateway. A receipt-bound op carries
    /// the ownership capability; a non-ownership op (a bare readiness-class call)
    /// carries only the attach token.
    pub fn lifecycle_entrypoint(
        &self,
        op: LifecycleOp,
        ownership: Option<&Credential>,
    ) -> std::result::Result<(), ControlError> {
        let path = format!("/lifecycle/{}", op_path(op));
        let resp = self.request("POST", &path, ownership.map(Credential::secret))?;
        Self::expect_ok(&resp).map(|_| ())
    }

    fn expect_ok(resp: &ControlResponse) -> std::result::Result<&ControlResponse, ControlError> {
        match resp.status {
            200 | 202 | 204 => Ok(resp),
            401 | 403 => Err(ControlError::Unauthorized),
            other => Err(ControlError::BadStatus(other)),
        }
    }

    /// What is left of this call's total budget, or [`ControlError::Timeout`]
    /// when the deadline has passed (or is too close to set a usable socket
    /// timeout against).
    fn remaining(&self, started: Instant) -> std::result::Result<Duration, ControlError> {
        match self.total_deadline.checked_sub(started.elapsed()) {
            Some(left) if left >= MIN_SOCKET_TIMEOUT => Ok(left),
            _ => Err(ControlError::Timeout),
        }
    }

    /// Perform one bounded, authenticated HTTP/1.1 request over loopback. Uses
    /// `Connection: close` so the response is read to EOF under the byte cap,
    /// with no chunked-encoding handling required.
    ///
    /// The clock starts before the connect and every socket timeout is clamped
    /// to the remaining total budget, so the call returns typed within
    /// `total_deadline` no matter how the peer paces its bytes.
    fn request(
        &self,
        method: &str,
        path: &str,
        ownership: Option<&str>,
    ) -> std::result::Result<ControlResponse, ControlError> {
        let started = Instant::now();
        let addr = self
            .endpoint
            .to_socket_addrs()
            .map_err(|e| ControlError::BadEndpoint(e.to_string()))?
            .next()
            .ok_or_else(|| ControlError::BadEndpoint(self.endpoint.clone()))?;
        if !addr.ip().is_loopback() {
            return Err(ControlError::NotLoopback(self.endpoint.clone()));
        }

        let budget = self.remaining(started)?;
        let mut stream =
            TcpStream::connect_timeout(&addr, socket_timeout(self.connect_timeout, budget))
                .map_err(map_timeout_io)?;
        let budget = self.remaining(started)?;
        stream
            .set_read_timeout(Some(socket_timeout(self.io_timeout, budget)))
            .map_err(ControlError::Transport)?;
        stream
            .set_write_timeout(Some(socket_timeout(self.io_timeout, budget)))
            .map_err(ControlError::Transport)?;

        let mut req = format!(
            "{method} {path} HTTP/1.1\r\nHost: {host}\r\nAuthorization: Bearer {attach}\r\n",
            host = self.endpoint,
            attach = self.attach_token,
        );
        if let Some(cap) = ownership {
            req.push_str(&format!("X-Ownership-Capability: {cap}\r\n"));
        }
        req.push_str("Connection: close\r\nContent-Length: 0\r\n\r\n");
        stream.write_all(req.as_bytes()).map_err(map_timeout_io)?;
        stream.flush().map_err(map_timeout_io)?;

        let mut raw = Vec::new();
        let mut chunk = [0u8; 4096];
        loop {
            // Re-clamp before EVERY read: a successful read resets the per-read
            // timeout, so only the shrinking total budget bounds a peer that
            // keeps dribbling bytes just inside the io timeout.
            let budget = self.remaining(started)?;
            stream
                .set_read_timeout(Some(socket_timeout(self.io_timeout, budget)))
                .map_err(ControlError::Transport)?;
            match stream.read(&mut chunk) {
                Ok(0) => break,
                Ok(n) => {
                    raw.extend_from_slice(&chunk[..n]);
                    if raw.len() > self.max_response_bytes {
                        return Err(ControlError::TooLarge);
                    }
                }
                Err(e) if is_timeout(&e) => return Err(ControlError::Timeout),
                Err(e) => return Err(ControlError::Transport(e)),
            }
        }
        parse_http_response(&raw)
    }
}

/// Map the lifecycle op to its URL path segment.
fn op_path(op: LifecycleOp) -> &'static str {
    match op {
        LifecycleOp::Install => "install",
        LifecycleOp::Ensure => "ensure",
        LifecycleOp::Start => "start",
        LifecycleOp::Stop => "stop",
        LifecycleOp::Restart => "restart",
        LifecycleOp::Repair => "repair",
        LifecycleOp::Update => "update",
        LifecycleOp::Rollback => "rollback",
        LifecycleOp::Remove => "remove",
        LifecycleOp::Doctor => "doctor",
    }
}

/// Clamp one phase timeout into the remaining total budget, never below the
/// platform-safe floor (a zero socket timeout means "no timeout").
fn socket_timeout(phase: Duration, budget: Duration) -> Duration {
    phase.min(budget).max(MIN_SOCKET_TIMEOUT)
}

fn is_timeout(e: &std::io::Error) -> bool {
    matches!(
        e.kind(),
        std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
    )
}

fn map_timeout_io(e: std::io::Error) -> ControlError {
    if is_timeout(&e) {
        ControlError::Timeout
    } else {
        ControlError::Transport(e)
    }
}

/// Parse a minimal HTTP/1.1 response: the status code from the status line and
/// the body after the header terminator. Header semantics beyond the status are
/// not interpreted — `Connection: close` bounds the body by EOF and the caller's
/// byte cap.
fn parse_http_response(raw: &[u8]) -> std::result::Result<ControlResponse, ControlError> {
    let split = raw
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .ok_or_else(|| ControlError::BadResponse("no header terminator".to_string()))?;
    let head = &raw[..split];
    let body = raw[split + 4..].to_vec();
    let status_line = head
        .split(|&b| b == b'\n')
        .next()
        .ok_or_else(|| ControlError::BadResponse("empty response".to_string()))?;
    let status_text = String::from_utf8_lossy(status_line);
    let mut parts = status_text.split_whitespace();
    let _version = parts.next();
    let status = parts
        .next()
        .and_then(|c| c.parse::<u16>().ok())
        .ok_or_else(|| ControlError::BadResponse(format!("no status code in {status_text:?}")))?;
    Ok(ControlResponse { status, body })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc;

    /// A real loopback HTTP server for one connection. `handler` receives the
    /// raw request bytes and returns the raw response bytes; returning `None`
    /// closes the socket without replying (to trip the client's read timeout).
    /// Returns the bound `host:port` and a join handle. This is a REAL socket
    /// server, not a mock of the wire.
    fn serve_once(
        handler: impl FnOnce(&[u8]) -> Option<Vec<u8>> + Send + 'static,
    ) -> (String, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = std::thread::spawn(move || {
            if let Ok((mut sock, _)) = listener.accept() {
                let _ = sock.set_read_timeout(Some(Duration::from_secs(5)));
                let mut buf = [0u8; 2048];
                let n = sock.read(&mut buf).unwrap_or(0);
                if let Some(resp) = handler(&buf[..n]) {
                    let _ = sock.write_all(&resp);
                }
                // Drop closes the socket (Connection: close semantics).
            }
        });
        (format!("127.0.0.1:{}", addr.port()), handle)
    }

    #[test]
    fn liveness_attaches_the_bearer_and_reads_200() {
        let (captured_tx, captured_rx) = mpsc::channel();
        let (endpoint, handle) = serve_once(move |req| {
            captured_tx
                .send(String::from_utf8_lossy(req).into_owned())
                .ok();
            Some(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok".to_vec())
        });
        let client = ControlClient::new(endpoint, "secret-attach-token");
        assert!(client.liveness().unwrap());
        handle.join().unwrap();
        let req = captured_rx.recv().unwrap();
        assert!(
            req.contains("Authorization: Bearer secret-attach-token"),
            "the attach bearer must be sent: {req}"
        );
        assert!(req.starts_with("GET /health "));
    }

    #[test]
    fn readiness_parses_the_one_readiness_model() {
        let (endpoint, handle) = serve_once(|_| {
            let body = r#"{"state":"gateway-ready","worker":"cold"}"#;
            Some(format!("HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n{body}").into_bytes())
        });
        let client = ControlClient::new(endpoint, "t");
        let readiness = client.readiness().unwrap();
        assert!(readiness.service_ready());
        handle.join().unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn shutdown_carries_the_ownership_capability() {
        let (captured_tx, captured_rx) = mpsc::channel();
        let (endpoint, handle) = serve_once(move |req| {
            captured_tx
                .send(String::from_utf8_lossy(req).into_owned())
                .ok();
            Some(b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n".to_vec())
        });
        // A bootstrap ownership credential to present.
        let dir = tempfile::tempdir().unwrap();
        let paths = crate::paths::ProductPaths::under_app_home(dir.path());
        paths.ensure().unwrap();
        let lock = crate::locking::InstallLock::new(paths.install_lock_path());
        let guard = lock
            .acquire(crate::locking::Actor::Installer, "control-test")
            .unwrap()
            .unwrap();
        let store = crate::credentials::DashboardCredentialStore::for_product(&paths);
        let creds = store.begin_bootstrap(&guard).unwrap();
        let client = ControlClient::new(endpoint, "attach");
        client.shutdown(creds.ownership()).unwrap();
        handle.join().unwrap();
        let req = captured_rx.recv().unwrap();
        assert!(
            req.starts_with(&format!("POST {GATEWAY_SHUTDOWN_PATH} ")),
            "shutdown must target the gateway's root admin route, not the retired \
             `/api` mount; got: {req}"
        );
        assert!(
            req.contains(&format!(
                "X-Ownership-Capability: {}",
                creds.ownership().secret()
            )),
            "shutdown must present the ownership capability, not just attach"
        );
    }

    #[test]
    fn ownership_bootstrap_creates_the_protected_credential_files() {
        // Post windows-private-file D6 un-gating, credential bootstrap succeeds
        // cross-platform: the descriptor and both credential files exist, each
        // created empty then hardened before bytes (Unix mode 0600, Windows the
        // protected three-principal DACL).
        let dir = tempfile::tempdir().unwrap();
        let paths = crate::paths::ProductPaths::under_app_home(dir.path());
        paths.ensure().unwrap();
        let guard = crate::locking::InstallLock::new(paths.install_lock_path())
            .acquire(crate::locking::Actor::Installer, "control-bootstrap-test")
            .unwrap()
            .unwrap();
        crate::credentials::DashboardCredentialStore::for_product(&paths)
            .begin_bootstrap(&guard)
            .expect("credential bootstrap must succeed after the D6 un-gating");

        for name in ["bootstrap-credentials.v1", "ownership.cap", "attach.cred"] {
            assert!(
                paths.credentials_dir().join(name).exists(),
                "bootstrap must create the protected credential authority: {name}"
            );
        }
        drop(guard);
    }

    #[test]
    fn unauthorized_status_is_typed() {
        let (endpoint, handle) = serve_once(|_| {
            Some(b"HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n".to_vec())
        });
        let client = ControlClient::new(endpoint, "wrong");
        assert!(matches!(client.drain(), Err(ControlError::Unauthorized)));
        handle.join().unwrap();
    }

    #[test]
    fn a_silent_gateway_trips_the_read_timeout() {
        // The server accepts but never replies; the client must time out rather
        // than hang, and liveness degrades to false.
        let (endpoint, handle) = serve_once(|_| {
            std::thread::sleep(Duration::from_millis(600));
            None
        });
        let client = ControlClient::new(endpoint, "t")
            .with_timeouts(Duration::from_secs(2), Duration::from_millis(200));
        let start = std::time::Instant::now();
        assert!(!client.liveness().unwrap(), "silent gateway is not live");
        assert!(
            start.elapsed() < Duration::from_secs(2),
            "returned at the deadline"
        );
        handle.join().unwrap();
    }

    /// A REAL loopback server that answers with a valid header and then dribbles
    /// one body byte per `interval` without ever closing — the trickling-peer
    /// shape a per-read timeout cannot bound, because every read succeeds and
    /// restarts it. Returns the endpoint, a stop flag, and the join handle.
    fn serve_trickling(
        interval: Duration,
    ) -> (String, Arc<AtomicBool>, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let flag = stop.clone();
        let handle = std::thread::spawn(move || {
            if let Ok((mut sock, _)) = listener.accept() {
                let _ = sock.set_read_timeout(Some(Duration::from_secs(5)));
                let mut buf = [0u8; 2048];
                let _ = sock.read(&mut buf);
                if sock
                    .write_all(b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n")
                    .is_err()
                {
                    return;
                }
                // Bounded even in the failure case: the trickle never outlives
                // this cap, so a broken assertion cannot leave a live thread.
                let cap = Instant::now() + Duration::from_secs(30);
                while !flag.load(Ordering::Relaxed) && Instant::now() < cap {
                    if sock.write_all(b"x").is_err() || sock.flush().is_err() {
                        return;
                    }
                    std::thread::sleep(interval);
                }
            }
        });
        (format!("127.0.0.1:{}", addr.port()), stop, handle)
    }

    #[test]
    fn a_trickling_gateway_trips_the_total_deadline() {
        // The per-read timeout is set far ABOVE the trickle interval, so it can
        // never fire: only the total wall-clock deadline bounds this call. Before
        // the deadline existed, this ran until the byte cap — hours at defaults.
        let (endpoint, stop, handle) = serve_trickling(Duration::from_millis(20));
        let client = ControlClient::new(endpoint, "t")
            .with_timeouts(Duration::from_secs(2), Duration::from_secs(30))
            .with_total_deadline(Duration::from_millis(400));
        let start = Instant::now();
        let outcome = client.readiness();
        let elapsed = start.elapsed();
        stop.store(true, Ordering::Relaxed);
        handle.join().unwrap();
        assert!(
            matches!(outcome, Err(ControlError::Timeout)),
            "a trickling peer must fail typed Timeout, got {outcome:?}"
        );
        assert!(
            elapsed < Duration::from_secs(5),
            "the total deadline must bound the call; it took {elapsed:?}"
        );
    }

    #[test]
    fn the_total_deadline_bounds_the_connect_phase_too() {
        // An already-expired budget refuses before a socket is opened, so the
        // connect timeout can never push a call past its total deadline.
        let (endpoint, handle) =
            serve_once(|_| Some(b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n".to_vec()));
        let client = ControlClient::new(endpoint.clone(), "t")
            .with_timeouts(Duration::from_secs(30), Duration::from_secs(30))
            .with_total_deadline(Duration::from_nanos(1));
        let start = Instant::now();
        assert!(matches!(client.readiness(), Err(ControlError::Timeout)));
        assert!(
            start.elapsed() < Duration::from_secs(1),
            "an exhausted budget must refuse immediately"
        );
        // Nobody connected; release the waiting acceptor with a real connection.
        let _ = TcpStream::connect(&endpoint);
        handle.join().unwrap();
    }

    #[test]
    fn a_flooding_gateway_trips_the_byte_cap() {
        let (endpoint, handle) = serve_once(|_| {
            let mut resp = b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n".to_vec();
            resp.extend(std::iter::repeat_n(b'x', 512 * 1024));
            Some(resp)
        });
        let client = ControlClient::new(endpoint, "t").with_max_response_bytes(64 * 1024);
        assert!(matches!(client.readiness(), Err(ControlError::TooLarge)));
        handle.join().unwrap();
    }

    #[test]
    fn a_non_loopback_endpoint_is_refused_before_connecting() {
        let client = ControlClient::new("93.184.216.34:80", "t");
        assert!(matches!(
            client.liveness(),
            Err(ControlError::NotLoopback(_))
        ));
    }
}
