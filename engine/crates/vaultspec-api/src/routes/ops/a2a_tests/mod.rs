use super::clarification::{
    MAX_A2A_ANSWER_CHARS, MAX_A2A_CLARIFICATION_ANSWERS, MAX_A2A_QUESTION_ID_CHARS,
    MAX_A2A_REQUEST_ID_CHARS,
};
use super::*;
use vaultspec_product::a2a_contract::{
    A2A_MAX_CLARIFICATION_ANSWER_CHARS, A2A_MAX_CLARIFICATION_IDENTIFIER_CHARS,
    A2A_MAX_CLARIFICATION_QUESTIONS, A2A_MAX_CLARIFICATION_REQUEST_ID_CHARS,
    HANDOFF_CREDENTIAL_FILE,
};

const TEST_REQUIRED_ROLES: &[&str] = &[
    "vaultspec-researcher",
    "vaultspec-synthesist",
    "vaultspec-adr-author",
    "vaultspec-doc-reviewer",
];

const TEST_PREPARE_RESPONSE: &str = r#"{"api_version":"v1","stage":"prepared","reservation_id":"resv-test-1","lease_id":"lease-gateway-test","required_roles":["vaultspec-researcher","vaultspec-synthesist","vaultspec-adr-author","vaultspec-doc-reviewer"],"expires_at":"2026-07-20T12:00:00Z","worker_state":"ready","provider_eligibility":"eligible","run_admission":"ready","reasons":[]}"#;

fn restrict_test_handoff(path: &std::path::Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)).unwrap();
    }
    #[cfg(windows)]
    {
        let whoami = std::process::Command::new("whoami.exe").output().unwrap();
        let user = String::from_utf8(whoami.stdout).unwrap();
        let grant = format!("{}:F", user.trim());
        let status = std::process::Command::new("icacls.exe")
            .arg(path)
            .args([
                "/inheritance:r",
                "/grant:r",
                &grant,
                "*S-1-5-18:F",
                "*S-1-5-32-544:F",
            ])
            .status()
            .unwrap();
        assert!(status.success());
    }
}

struct ObservedRequest {
    body: String,
}

fn read_request(stream: &std::net::TcpStream) -> ObservedRequest {
    use std::io::{BufRead, BufReader, Read};

    let mut reader = BufReader::new(stream.try_clone().unwrap());
    let mut request_line = String::new();
    reader.read_line(&mut request_line).unwrap();
    let mut content_length = 0usize;
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).unwrap();
        if line == "\r\n" || line.is_empty() {
            break;
        }
        if let Some(value) = line
            .split_once(':')
            .filter(|(name, _)| name.eq_ignore_ascii_case("content-length"))
            .map(|(_, value)| value.trim())
        {
            content_length = value.parse().unwrap();
        }
    }
    let mut body = vec![0u8; content_length];
    reader.read_exact(&mut body).unwrap();
    ObservedRequest {
        body: String::from_utf8(body).unwrap(),
    }
}

fn write_response(stream: &mut std::net::TcpStream, status: u16, body: &str) {
    use std::io::{Read, Write};

    let reason = match status {
        200 => "OK",
        201 => "Created",
        404 => "Not Found",
        422 => "Unprocessable Entity",
        _ => "Response",
    };
    write!(
        stream,
        "HTTP/1.1 {status} {reason}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
    .unwrap();
    stream.flush().unwrap();
    // Close gracefully rather than by dropping the socket. We announce
    // `Connection: close`, so the client reads until EOF — and on Windows a
    // socket closed while ANY unread inbound bytes remain is reset rather than
    // finished, which discards the response the client has not read yet. The
    // client then reports a transport failure instead of the refusal under
    // test, so a harness shortcut here would read as a product defect.
    // Half-close to send FIN, then drain whatever the peer already sent so the
    // final drop has nothing left to turn into an RST.
    let _ = stream.shutdown(std::net::Shutdown::Write);
    let mut discard = [0u8; 1024];
    while let Ok(read) = stream.read(&mut discard) {
        if read == 0 {
            break;
        }
    }
}

fn write_service_record(path: &std::path::Path, port: u16) {
    let handoff = path.with_file_name(HANDOFF_CREDENTIAL_FILE);
    std::fs::write(&handoff, "tok").unwrap();
    restrict_test_handoff(&handoff);
    std::fs::write(
        path,
        format!(
            r#"{{"port": {port}, "last_heartbeat": {}, "pid": 4242, "handoff_reference": {}}}"#,
            now_ms(),
            serde_json::to_string(&handoff.to_string_lossy()).unwrap()
        ),
    )
    .unwrap();
}

fn run_start_call(state: &AppState, run_id: &str) -> ForwardedCall {
    let cell = state.active_cell();
    build_forwarded_call(
        state,
        "run-start",
        &cell,
        &A2aVerbBody {
            expected_scope: Some(crate::routes::scope_token(&cell.root)),
            run_id: Some(run_id.to_string()),
            team_preset: Some("vaultspec-adr-research".to_string()),
            message: Some("Research the bounded broker".to_string()),
            feature_tag: Some("a2a-orchestration-edge".to_string()),
            selection: Some(served_catalog_selection()),
            ..Default::default()
        },
    )
    .unwrap()
}

/// An opaque reference that stands in for an entry actually served by A2A. The
/// engine has no provider/model knowledge: these values prove only that it
/// preserves provider-issued strings and provider-native controls unchanged.
fn served_catalog_selection() -> CatalogSelectionReference {
    CatalogSelectionReference {
        schema_version: 1,
        provider_id: "provider-issued-id".to_string(),
        execution_mode: "execution-lane-issued-id".to_string(),
        catalog_revision: "catalog-revision-issued-id".to_string(),
        entry_id: "catalog-entry-issued-id".to_string(),
        controls: BTreeMap::from([(
            "provider-native-control-id".to_string(),
            "provider-native-control-value".to_string(),
        )]),
    }
}

fn unresolved_lease_count(state: &AppState) -> usize {
    state.a2a_run_leases.unresolved_leases().unwrap().len()
}

fn test_state() -> (tempfile::TempDir, Arc<AppState>) {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
    let state = crate::app::build_state(dir.path().to_path_buf());
    (dir, state)
}

mod broker;
mod clarification_flow;
mod lifecycle;
