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

/// Discovery candidates in precedence order. The LIVE rag service writes
/// its discovery file under the user home (`~/.vaultspec-rag/service.json`
/// — confirmed by lead dogfooding against the running service); the
/// project-relative path is kept as a forward-compatible candidate.
pub fn service_json_candidates(vault_root: &Path) -> Vec<PathBuf> {
    let mut candidates = vec![service_json_path(vault_root)];
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"));
    if let Some(home) = home {
        candidates.push(
            PathBuf::from(home)
                .join(".vaultspec-rag")
                .join("service.json"),
        );
    }
    candidates
}

/// Heartbeat staleness threshold: rag refreshes every 15s with a 60s stale
/// bound; we allow 120s before declaring the service dead.
pub const HEARTBEAT_STALE_MS: i64 = 120_000;

/// Rag response body ceiling (robustness H3, 2026-06-13): the read has a
/// timeout but no total-byte bound, so a runaway rag service could stream an
/// unbounded body and OOM the engine. Search/discover envelopes are small;
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

/// Pluggable transport so discovery/search logic tests without a live
/// service; the default is the minimal loopback HTTP/1.1 transport below.
pub trait RagTransport {
    fn post_json(&self, path: &str, body: &str) -> Result<String>;
}

/// Minimal HTTP/1.1 POST over loopback TCP. Deliberately dependency-free:
/// the service is loopback-only by design (not an auth boundary), JSON
/// in/out, Content-Length framing — a full HTTP client is not warranted
/// for the engine's only optional dependency.
pub struct LoopbackTransport {
    pub port: u16,
    pub bearer: Option<String>,
    pub timeout: Duration,
}

impl RagTransport for LoopbackTransport {
    fn post_json(&self, path: &str, body: &str) -> Result<String> {
        let mut stream = TcpStream::connect(("127.0.0.1", self.port))?;
        stream.set_read_timeout(Some(self.timeout))?;
        stream.set_write_timeout(Some(self.timeout))?;
        let auth = self
            .bearer
            .as_deref()
            .map(|t| format!("Authorization: Bearer {t}\r\n"))
            .unwrap_or_default();
        let request = format!(
            "POST {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\
             Content-Type: application/json\r\n{auth}Content-Length: {}\r\n\r\n{body}",
            body.len()
        );
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

/// Discovery over an explicit candidate list (hermetic for tests).
pub fn discover_at(candidates: &[PathBuf]) -> (RagAvailability, Option<ServiceInfo>) {
    let mut parse_error: Option<String> = None;
    for path in candidates {
        let Ok(raw) = std::fs::read_to_string(path) else {
            continue;
        };
        match serde_json::from_str::<ServiceInfo>(&raw) {
            Ok(info) => {
                // A present file with a stale heartbeat is a dead or
                // crashed service — truthfully degraded, not available.
                if let Some(heartbeat) = info.last_heartbeat.as_ref().and_then(Heartbeat::as_millis)
                {
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_millis() as i64)
                        .unwrap_or(0);
                    if now.saturating_sub(heartbeat) > HEARTBEAT_STALE_MS {
                        return (
                            RagAvailability::Unavailable {
                                reason: "rag service heartbeat stale (service crashed or stopped)"
                                    .to_string(),
                            },
                            None,
                        );
                    }
                }
                return (RagAvailability::Available, Some(info));
            }
            Err(e) => parse_error = Some(format!("rag service.json unreadable: {e}")),
        }
    }
    (
        RagAvailability::Unavailable {
            reason: parse_error.unwrap_or_else(|| {
                "rag service not installed or not started (no service.json)".to_string()
            }),
        },
        None,
    )
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
}
