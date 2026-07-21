//! Bounded, authenticated gateway control (a2a-product-provisioning W01.P02.S14).
//!
//! The dashboard brokers liveness, readiness, drain, shutdown, and lifecycle
//! calls to the owned gateway over its loopback endpoint (ADR D4/D5). Every call
//! here obeys the resource-bounds law: a connect timeout, a read timeout, and a
//! hard response byte cap — a hung or flooding gateway fails typed, never hangs
//! or exhausts memory. Transport authentication uses the dashboard control
//! (attach-control) token; a receipt-bound operation such as shutdown ALSO
//! carries the ownership capability, which the attach credential alone cannot
//! stand in for (ADR D5).
//!
//! The transport is a minimal HTTP/1.1 client built on `std::net` — the same
//! dependency-free posture the core subprocess runner takes — so the crate gains
//! no HTTP framework. Loopback is the only permitted destination (ADR D5: "the
//! only desktop bind surface"); a non-loopback endpoint is refused before a
//! socket is opened.

use std::io::{Read as _, Write as _};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

use crate::credentials::Credential;
use crate::protocol::{LifecycleOp, Readiness};

/// Default connect timeout for a control call.
const DEFAULT_CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
/// Default read/write timeout for a control call.
const DEFAULT_IO_TIMEOUT: Duration = Duration::from_secs(15);
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
            max_response_bytes: DEFAULT_MAX_RESPONSE_BYTES,
        }
    }

    /// Override the timeouts (used by tests to trip the deadline deterministically
    /// and by callers with a tighter budget).
    #[must_use]
    pub fn with_timeouts(mut self, connect: Duration, io: Duration) -> Self {
        self.connect_timeout = connect;
        self.io_timeout = io;
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
    /// cannot invoke it (ADR D5).
    pub fn shutdown(&self, ownership: &Credential) -> std::result::Result<(), ControlError> {
        let resp = self.request("POST", "/shutdown", Some(ownership.secret()))?;
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

    /// Perform one bounded, authenticated HTTP/1.1 request over loopback. Uses
    /// `Connection: close` so the response is read to EOF under the byte cap,
    /// with no chunked-encoding handling required.
    fn request(
        &self,
        method: &str,
        path: &str,
        ownership: Option<&str>,
    ) -> std::result::Result<ControlResponse, ControlError> {
        let addr = self
            .endpoint
            .to_socket_addrs()
            .map_err(|e| ControlError::BadEndpoint(e.to_string()))?
            .next()
            .ok_or_else(|| ControlError::BadEndpoint(self.endpoint.clone()))?;
        if !addr.ip().is_loopback() {
            return Err(ControlError::NotLoopback(self.endpoint.clone()));
        }

        let mut stream =
            TcpStream::connect_timeout(&addr, self.connect_timeout).map_err(map_timeout_io)?;
        stream
            .set_read_timeout(Some(self.io_timeout))
            .map_err(ControlError::Transport)?;
        stream
            .set_write_timeout(Some(self.io_timeout))
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
        assert!(req.starts_with("POST /shutdown "));
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
