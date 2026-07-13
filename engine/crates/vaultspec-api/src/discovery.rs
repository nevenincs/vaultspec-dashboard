//! Discovery-file publication (single-app-runtime S01/S04): the atomic
//! temp-and-rename `service.json` writer, the owner-checked heartbeat, and
//! the owner-checked clean-exit retraction. Split from `app.rs` (module-size
//! gate); `app.rs` re-exports everything so call sites are unchanged.

use std::path::PathBuf;

use serde_json::Value;

use crate::app::{AppState, now_ms};

/// The serve identity a discovery record advertises. Owned by the BOOT path
/// (single-app-runtime S23): the bearer is minted before the heavy initial
/// index so discovery can publish a `starting` record the moment the port is
/// bound, and the heartbeat keeps it fresh through the whole index.
#[derive(Debug, Clone)]
pub struct DiscoveryIdentity {
    pub bearer: String,
    pub started_ms: i64,
}

/// The workspace-local discovery directory — where EXEMPT (no-seat) serves
/// publish, byte-compatible with the pre-seat contract so the vitest
/// live-engine harness and the dev plugin read exactly what they always did.
pub fn workspace_discovery_dir(state: &AppState) -> PathBuf {
    engine_store::engine_data_dir(&state.workspace_root.join(".vault"))
}

/// Write the discovery file (rag's pattern, contract §1). One process, one
/// port/token. `dir` is the publication target: the machine app home for a
/// SEATED serve (single-app-runtime D1 cutover), the workspace-local
/// engine-data dir for exempt serves. This is the BOOT-TIME claim: it always
/// writes (atomically), because boot owns the decision to serve here; the
/// periodic heartbeat goes through [`heartbeat_service_json`], which refuses
/// to overwrite a foreign process's file (single-app-runtime S01).
pub fn write_service_json(
    identity: &DiscoveryIdentity,
    dir: &std::path::Path,
    port: u16,
    state: &str,
) -> std::io::Result<PathBuf> {
    write_discovery_atomic(dir, &discovery_payload(identity, port, state))
}

/// Periodic heartbeat rewrite, OWNER-CHECKED: refuses when the file on disk
/// carries a different live pid, so two serves in one workspace can no longer
/// clobber each other's discovery on every heartbeat tick (single-app-runtime
/// S01). A missing or unparseable file is reclaimed (it is ours to heal).
pub fn heartbeat_service_json(
    identity: &DiscoveryIdentity,
    dir: &std::path::Path,
    port: u16,
    state: &str,
) -> std::io::Result<PathBuf> {
    let path = dir.join("service.json");
    if let Ok(existing) = std::fs::read_to_string(&path)
        && let Ok(v) = serde_json::from_str::<Value>(&existing)
        && let Some(pid) = v.get("pid").and_then(Value::as_u64)
        && pid != u64::from(std::process::id())
    {
        return Err(std::io::Error::other(format!(
            "discovery file is owned by pid {pid}; refusing to overwrite"
        )));
    }
    write_discovery_atomic(dir, &discovery_payload(identity, port, state))
}

/// The discovery payload, serialized. `state` is the lifecycle phase
/// (single-app-runtime S23): `starting` from bind until the initial index
/// completes, `ready` once the wire serves — so a launcher, `status`, or
/// `stop` can distinguish an INDEXING seat from a dead one.
fn discovery_payload(identity: &DiscoveryIdentity, port: u16, state: &str) -> String {
    serde_json::to_string_pretty(&serde_json::json!({
        "port": port,
        "service_token": identity.bearer,
        "pid": std::process::id(),
        "last_heartbeat": now_ms(),
        "started_ms": identity.started_ms,
        "state": state,
    }))
    .expect("discovery payload serializes")
}

/// Remove the discovery file on clean shutdown, OWNER-CHECKED: only a file
/// carrying our own pid is ours to retract (single-app-runtime D5). Missing
/// or foreign files are left alone; all failures are best-effort.
pub fn remove_service_json_if_owned(dir: &std::path::Path) {
    let path = dir.join("service.json");
    let ours = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| v.get("pid").and_then(Value::as_u64))
        .is_some_and(|pid| pid == u64::from(std::process::id()));
    if ours {
        let _ = std::fs::remove_file(&path);
    }
}

/// Atomically publish `contents` as `<dir>/service.json`: write a
/// pid-suffixed temp file, restrict it, then rename over the destination.
/// A reader can never observe a torn or interleaved file — it sees either
/// the previous complete payload or the new one (single-app-runtime S01).
pub(crate) fn write_discovery_atomic(
    dir: &std::path::Path,
    contents: &str,
) -> std::io::Result<PathBuf> {
    std::fs::create_dir_all(dir)?;
    let path = dir.join("service.json");
    let tmp = dir.join(format!("service.json.tmp-{}", std::process::id()));
    std::fs::write(&tmp, contents)?;
    // Restrict the discovery file to its owner: it carries the bearer token, so
    // the default world-readable 0644 is a local-auth-bypass vector on a shared
    // host (#41 security hardening). On Unix, chmod 0600 BEFORE the rename so
    // the token is never world-readable, even transiently. On Windows the
    // engine-data dir lives under the user's own workspace and inherits that
    // profile's NTFS ACL, so no extra restriction is applied here.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600))?;
    }
    // On both unix and Windows (MoveFileExW + MOVEFILE_REPLACE_EXISTING),
    // rename replaces the destination atomically.
    std::fs::rename(&tmp, &path)?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app::build_state;

    #[test]
    fn discovery_writes_are_atomic_under_concurrent_writers() {
        // Two writers hammer the same discovery path with distinct complete
        // payloads while a reader polls: every observed file parses as valid
        // JSON equal to ONE writer's payload in full — never a torn interleave
        // (single-app-runtime S01). The rename-based publish is what this
        // proves; the plain fs::write it replaced fails this test.
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().to_path_buf();
        let b = dir.path().to_path_buf();
        let payload = |tag: &str| format!("{{\"port\": 1, \"tag\": \"{}\"}}", tag.repeat(2048));
        let pa = payload("a");
        let pb = payload("b");
        let wa = {
            let p = pa.clone();
            std::thread::spawn(move || {
                for _ in 0..200 {
                    write_discovery_atomic(&a, &p).unwrap();
                }
            })
        };
        let wb = {
            let p = pb.clone();
            std::thread::spawn(move || {
                for _ in 0..200 {
                    // Distinct temp name per writer: pid is shared in-process,
                    // so disambiguate the way two real serves' pids would.
                    let tmp = b.join("service.json.tmp-writer-b");
                    std::fs::write(&tmp, &p).unwrap();
                    std::fs::rename(&tmp, b.join("service.json")).unwrap();
                }
            })
        };
        let path = dir.path().join("service.json");
        let mut observed = 0;
        while !(wa.is_finished() && wb.is_finished()) {
            if let Ok(s) = std::fs::read_to_string(&path) {
                if s.is_empty() {
                    continue; // reader raced the very first publish
                }
                assert!(
                    s == pa || s == pb,
                    "torn discovery read: {} bytes, neither writer's payload",
                    s.len()
                );
                observed += 1;
            }
        }
        wa.join().unwrap();
        wb.join().unwrap();
        assert!(observed > 0, "reader never observed a published file");
    }

    #[test]
    fn heartbeat_refuses_to_overwrite_a_foreign_pid() {
        // A discovery file carrying another process's pid is NOT ours to
        // heartbeat over (single-app-runtime S01): the owner check must refuse
        // and leave the foreign file byte-identical.
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
        let state = build_state(dir.path().to_path_buf());
        let identity = DiscoveryIdentity {
            bearer: state.bearer.clone(),
            started_ms: 1,
        };
        let data_dir = workspace_discovery_dir(&state);
        std::fs::create_dir_all(&data_dir).unwrap();
        let foreign = serde_json::json!({
            "port": 9999,
            "service_token": "feedfeedfeedfeedfeedfeedfeedfeed",
            "pid": u64::from(std::process::id()) + 1,
            "last_heartbeat": 0,
        })
        .to_string();
        let path = data_dir.join("service.json");
        std::fs::write(&path, &foreign).unwrap();
        let err = heartbeat_service_json(&identity, &data_dir, 8767, "ready").unwrap_err();
        assert!(
            err.to_string().contains("refusing to overwrite"),
            "owner check must be the refusal reason: {err}"
        );
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            foreign,
            "foreign discovery file must be untouched"
        );
        // Our own file (or a missing one) IS ours: the boot claim followed by
        // a heartbeat both succeed and the pid is ours.
        write_service_json(&identity, &data_dir, 8767, "starting").unwrap();
        heartbeat_service_json(&identity, &data_dir, 8767, "ready").unwrap();
        let v: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(v["pid"], u64::from(std::process::id()));
        assert_eq!(v["state"], "ready", "the lifecycle state rides discovery");
    }
}
