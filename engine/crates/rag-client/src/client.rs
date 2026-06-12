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
pub fn service_json_path(vault_root: &Path) -> PathBuf {
    vault_root
        .join("data")
        .join("search-data")
        .join("service.json")
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServiceInfo {
    pub port: u16,
    #[serde(default)]
    pub service_token: Option<String>,
    #[serde(default)]
    pub pid: Option<u32>,
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
        let mut raw = String::new();
        stream.read_to_string(&mut raw)?;

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
    let path = service_json_path(vault_root);
    let raw = match std::fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(_) => {
            return (
                RagAvailability::Unavailable {
                    reason: "rag service not installed or not started (no service.json)"
                        .to_string(),
                },
                None,
            );
        }
    };
    match serde_json::from_str::<ServiceInfo>(&raw) {
        Ok(info) => (RagAvailability::Available, Some(info)),
        Err(e) => (
            RagAvailability::Unavailable {
                reason: format!("rag service.json unreadable: {e}"),
            },
            None,
        ),
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
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_service_json_is_truthful_absence_not_an_error() {
        let dir = tempfile::tempdir().unwrap();
        let (availability, info) = discover(dir.path());
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
        let (availability, info) = discover(dir.path());
        assert_eq!(availability, RagAvailability::Available);
        let info = info.unwrap();
        assert_eq!(info.port, 8766);
        assert_eq!(info.service_token.as_deref(), Some("tok-1"));
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
}
