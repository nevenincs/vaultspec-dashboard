//! Real-file proofs for the post-commit relaunch health probe (W03.P07.S60).
//!
//! The probe is the inverse of the drain's require-absent: the relaunched seat is
//! healthy only when it RE-PUBLISHES a fresh, owned, live, compatible discovery
//! record (`Verdict::OwnedLive`). These exercise the real product discovery
//! classifier over real files with a real live pid — no doubles.

use std::path::Path;
use std::time::Duration;

use vaultspec_product::manifest::RangeBounds;
use vaultspec_updater::{ProbeConfig, probe_seat_republished, relaunch_and_probe};

fn range(min: &str, max: &str) -> RangeBounds {
    RangeBounds {
        minimum: min.to_string(),
        maximum: max.to_string(),
    }
}

fn config(owner: &str, deadline: Duration) -> ProbeConfig {
    ProbeConfig {
        our_owner: owner.to_string(),
        freshness_ms: 60_000,
        supported_protocol: range("v1", "v1"),
        supported_state_schema: range("0001", "9999"),
        deadline,
        poll: Duration::from_millis(20),
    }
}

/// A discovery record owned by `owner`, naming `pid`, with `heartbeat_ms`.
fn discovery_json(owner: &str, pid: u32, heartbeat_ms: i64) -> String {
    format!(
        "{{\"endpoint\":\"127.0.0.1:1\",\"pid\":{pid},\"owner\":{owner:?},\
         \"install_identity\":\"install-1\",\"generation\":\"gen-1\",\
         \"release_set\":{{\"name\":\"vaultspec\",\"version\":\"0.1.4\",\
         \"target\":\"x86_64-unknown-linux-gnu\"}},\
         \"protocol\":{{\"minimum\":\"v1\",\"maximum\":\"v1\"}},\
         \"state_schema\":{{\"minimum\":\"0001\",\"maximum\":\"9999\"}},\
         \"handoff_reference\":\"/nonexistent/attach.cred\",\"heartbeat_ms\":{heartbeat_ms}}}"
    )
}

fn now_ms() -> i64 {
    i64::try_from(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis(),
    )
    .unwrap()
}

fn write(path: &Path, json: &str) {
    std::fs::write(path, json).unwrap();
}

#[test]
fn probe_succeeds_when_the_seat_republishes_owned_live() {
    let temp = tempfile::tempdir().unwrap();
    let discovery = temp.path().join("gateway-discovery.json");
    let owner = "probe-owner";
    // Ours, our own LIVE pid, fresh heartbeat: the classifier returns OwnedLive.
    write(
        &discovery,
        &discovery_json(owner, std::process::id(), now_ms()),
    );

    probe_seat_republished(&discovery, &config(owner, Duration::from_secs(2)))
        .expect("a fresh owned-live re-publish must satisfy the probe");
}

#[test]
fn probe_times_out_when_no_record_appears() {
    let temp = tempfile::tempdir().unwrap();
    let discovery = temp.path().join("gateway-discovery.json");
    // No discovery file is ever written: the seat did not come back.
    let refused = probe_seat_republished(
        &discovery,
        &config("probe-owner", Duration::from_millis(150)),
    );
    assert!(
        refused.is_err(),
        "an absent re-publish must fail the probe within the deadline"
    );
}

#[test]
fn probe_rejects_a_stale_leftover_record() {
    let temp = tempfile::tempdir().unwrap();
    let discovery = temp.path().join("gateway-discovery.json");
    let owner = "probe-owner";
    // A record with a heartbeat far outside the freshness window — the leftover
    // of a seat that stopped before the update. It must NOT satisfy the probe.
    write(&discovery, &discovery_json(owner, std::process::id(), 1));

    let refused = probe_seat_republished(&discovery, &config(owner, Duration::from_millis(150)));
    assert!(
        refused.is_err(),
        "a stale leftover discovery record must never count as a healthy re-publish"
    );
}

#[test]
fn probe_rejects_a_foreign_owner() {
    let temp = tempfile::tempdir().unwrap();
    let discovery = temp.path().join("gateway-discovery.json");
    // Fresh + live, but published by a DIFFERENT owner: not our relaunched seat.
    write(
        &discovery,
        &discovery_json("someone-else", std::process::id(), now_ms()),
    );

    let refused = probe_seat_republished(
        &discovery,
        &config("probe-owner", Duration::from_millis(150)),
    );
    assert!(
        refused.is_err(),
        "a foreign-owned discovery record must never count as our healthy re-publish"
    );
}

#[test]
fn relaunch_and_probe_spawns_the_launcher_then_probes() {
    let temp = tempfile::tempdir().unwrap();
    let workspace = temp.path();
    let discovery = temp.path().join("gateway-discovery.json");
    let owner = "probe-owner";
    // Pre-publish an owned-live record so the probe half resolves immediately once
    // the (harmless) launcher spawn succeeds. This proves spawn + probe compose
    // and the detached spawn does not error; the live serve republish is the S60
    // integration concern.
    write(
        &discovery,
        &discovery_json(owner, std::process::id(), now_ms()),
    );
    let launcher = harmless_launcher();

    relaunch_and_probe(
        &launcher,
        workspace,
        &discovery,
        &config(owner, Duration::from_secs(2)),
    )
    .expect("spawn of a resolvable launcher plus a fresh owned-live record satisfies the flow");
}

/// A launcher that exists and spawns cleanly (it ignores the `serve` operand and
/// exits): enough to prove the detached spawn path without a real seat.
fn harmless_launcher() -> std::path::PathBuf {
    #[cfg(windows)]
    {
        std::path::PathBuf::from("cmd.exe")
    }
    #[cfg(not(windows))]
    {
        std::path::PathBuf::from("/bin/true")
    }
}
