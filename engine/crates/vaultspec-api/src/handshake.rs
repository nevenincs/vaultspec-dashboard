//! Startup provisioning probe and component compatibility handshake
//! (dashboard-packaging ADR, D3/D6).
//!
//! `vaultspec serve` depends on two externally-provisioned siblings — `git`
//! on `PATH` and the `vaultspec-core` CLI — and optionally attaches to the
//! machine-singleton `vaultspec-rag` service. Detect-and-instruct (D3): the
//! startup gate probes both hard requirements before any heavy work and fails
//! closed with the exact remediation command when one is absent. The
//! compatibility handshake (D6) declares each component's floor and probed
//! version and rides the served `tiers` envelope, so clients degrade honestly
//! per component (authoring blocks on a below-floor core, semantic panels grey
//! on absent rag) — never hard version lockstep, never inference from a
//! transport error.
//!
//! Probes are memoized: each spawns at most one bounded subprocess per
//! process lifetime, so decorating the per-response tiers block stays a
//! cheap clone.

use std::io::Read as _;
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use std::sync::mpsc;
use std::time::Duration;

use serde_json::{Value, json};

/// The minimum `vaultspec-core` the dashboard is developed and verified
/// against (`pyproject.toml` runtime pin). A below-floor core still serves —
/// the handshake reports `meets_floor: false` and write-capability gating
/// (the authoring seam's own probe) blocks what the old core cannot do.
pub const CORE_FLOOR: (u64, u64, u64) = (0, 1, 36);

/// The minimum `vaultspec-rag` the dashboard is verified against (dev-group
/// pin). rag is optional and attach-never-own; its `service.json` carries no
/// version, so the handshake declares the floor with the probed version
/// honestly `null` rather than inventing one.
pub const RAG_FLOOR: &str = "0.2.28";

/// Bound on any `--version` probe: output cap (the line is tiny; the cap
/// guards a pathological child) and wall-clock deadline (generous enough for
/// a cold `uv run` resolve), per the resource-bounds rule — every subprocess
/// carries BOTH.
const PROBE_STDOUT_CAP: u64 = 64 * 1024;
const PROBE_TIMEOUT: Duration = Duration::from_secs(30);

/// One probed component, as the handshake reports it.
#[derive(Debug, Clone)]
pub struct GitProbe {
    /// `git --version` spawned and exited 0 within bounds.
    pub available: bool,
    /// The reported version line, when available.
    pub version: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CoreProbe {
    /// The resolved core's version triple; `None` when core is absent or its
    /// version is unparseable (conservatively unknown).
    pub version: Option<(u64, u64, u64)>,
}

impl CoreProbe {
    /// Floor verdict: `None` when the version is unknown (absent core), else
    /// whether it meets [`CORE_FLOOR`].
    pub fn meets_floor(&self) -> Option<bool> {
        self.version.map(|v| v >= CORE_FLOOR)
    }
}

/// Spawn `<program> --version` bounded (cap + deadline) and return its first
/// stdout line on a zero exit. The worker-thread + `recv_timeout` shape
/// mirrors the ingest-core capability probe: the parent enforces the deadline
/// and kills a hung child rather than blocking forever.
fn probe_version_line(program: &str) -> Option<String> {
    let mut child = Command::new(program)
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let stdout_pipe = child.stdout.take().expect("piped stdout");
    let (tx, rx) = mpsc::channel();
    let reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let res = stdout_pipe
            .take(PROBE_STDOUT_CAP)
            .read_to_end(&mut buf)
            .map(|_| buf);
        let _ = tx.send(res);
    });
    let drained = rx.recv_timeout(PROBE_TIMEOUT);
    if drained.is_err() {
        let _ = child.kill();
    }
    let status = child.wait();
    let _ = reader.join();
    let bytes = drained.ok()?.ok()?;
    if !status.map(|s| s.success()).unwrap_or(false) {
        return None;
    }
    String::from_utf8_lossy(&bytes)
        .lines()
        .next()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
}

/// Probe `git` on `PATH`, memoized for the process lifetime.
pub fn probe_git() -> &'static GitProbe {
    static PROBE: OnceLock<GitProbe> = OnceLock::new();
    PROBE.get_or_init(|| {
        let version = probe_version_line("git");
        GitProbe {
            available: version.is_some(),
            version,
        }
    })
}

/// Probe the resolved `vaultspec-core` version, memoized. Rides the same
/// resolution [`ingest_core::runner::CoreRunner::detect`] memoizes, so the
/// handshake reports the core the engine actually brokers.
pub fn probe_core() -> &'static CoreProbe {
    static PROBE: OnceLock<CoreProbe> = OnceLock::new();
    PROBE.get_or_init(|| CoreProbe {
        version: ingest_core::runner::core_version(),
    })
}

/// The startup gate (D3, detect-and-instruct): fail closed BEFORE any heavy
/// work when a hard requirement is absent, with the exact remediation the
/// operator should run. A below-floor core passes the gate — presence is the
/// hard requirement; the floor verdict degrades through the handshake.
pub fn startup_gate() -> Result<(), String> {
    gate(probe_git(), probe_core())
}

/// The pure gate decision, parameterized for tests.
fn gate(git: &GitProbe, core: &CoreProbe) -> Result<(), String> {
    if !git.available {
        return Err("git was not found on PATH (the dashboard's history and \
             worktree views read through it).\n\nInstall git from \
             https://git-scm.com, confirm `git --version` succeeds in a new \
             shell, then rerun `vaultspec serve`."
            .to_string());
    }
    if core.version.is_none() {
        return Err("vaultspec-core was not found (the dashboard brokers every \
             vault read and write through it).\n\nInstall it with:\n\n    uv \
             tool install vaultspec-core\n\nconfirm `vaultspec-core --version` \
             succeeds in a new shell, then rerun `vaultspec serve`."
            .to_string());
    }
    Ok(())
}

fn triple(v: (u64, u64, u64)) -> String {
    format!("{}.{}.{}", v.0, v.1, v.2)
}

/// Decorate a served `tiers` block with the component handshake (D6):
/// `declared` carries the `vaultspec-core` floor/version/verdict, `semantic`
/// carries the `vaultspec-rag` floor (version honestly unknown — rag's
/// discovery file does not report one). Additive fields on the existing
/// envelope; availability and reasons stay exactly what the tier computation
/// said.
pub fn decorate_tiers(tiers: &mut Value) {
    let core = probe_core();
    if let Some(declared) = tiers.get_mut("declared") {
        declared["component"] = json!({
            "name": "vaultspec-core",
            "floor": triple(CORE_FLOOR),
            "version": core.version.map(triple),
            "meets_floor": core.meets_floor(),
        });
    }
    if let Some(semantic) = tiers.get_mut("semantic") {
        semantic["component"] = json!({
            "name": "vaultspec-rag",
            "floor": RAG_FLOOR,
            "version": Value::Null,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_binary_probes_unavailable() {
        // Parameterized probe against a name that cannot exist on PATH: the
        // spawn fails, the probe reports absence — the same path a clean
        // machine without git hits.
        assert!(probe_version_line("vaultspec-definitely-not-installed-xyz").is_none());
    }

    #[test]
    fn the_gate_fails_closed_with_remediation_for_missing_git() {
        let git = GitProbe {
            available: false,
            version: None,
        };
        let core = CoreProbe {
            version: Some((0, 1, 36)),
        };
        let err = gate(&git, &core).unwrap_err();
        assert!(err.contains("git was not found on PATH"));
        assert!(
            err.contains("https://git-scm.com"),
            "remediation named: {err}"
        );
    }

    #[test]
    fn the_gate_fails_closed_with_the_exact_install_command_for_missing_core() {
        let git = GitProbe {
            available: true,
            version: Some("git version 2.49.0".into()),
        };
        let core = CoreProbe { version: None };
        let err = gate(&git, &core).unwrap_err();
        assert!(
            err.contains("uv tool install vaultspec-core"),
            "the exact remediation command is stated: {err}"
        );
    }

    #[test]
    fn a_below_floor_core_passes_the_gate_and_fails_the_floor() {
        // Stale core (D6): presence passes the startup gate; the handshake
        // carries the floor verdict so authoring degrades instead of the
        // whole dashboard refusing to start.
        let git = GitProbe {
            available: true,
            version: Some("git version 2.49.0".into()),
        };
        let core = CoreProbe {
            version: Some((0, 1, 34)),
        };
        assert!(gate(&git, &core).is_ok());
        assert_eq!(core.meets_floor(), Some(false));
        let at_floor = CoreProbe {
            version: Some(CORE_FLOOR),
        };
        assert_eq!(at_floor.meets_floor(), Some(true));
    }

    #[test]
    fn tiers_decoration_declares_floors_and_verdicts() {
        let mut tiers = json!({
            "declared": {"available": false, "reason": "core exited unsuccessfully"},
            "semantic": {"available": false, "reason": "rag service not installed"},
            "structural": {"available": true},
            "temporal": {"available": true},
        });
        decorate_tiers(&mut tiers);
        let core = &tiers["declared"]["component"];
        assert_eq!(core["name"], "vaultspec-core");
        assert_eq!(core["floor"], triple(CORE_FLOOR));
        // version/meets_floor reflect THIS machine's probed core: both are
        // either honestly null (absent) or a version string + boolean.
        assert!(core["meets_floor"].is_boolean() || core["meets_floor"].is_null());
        let rag = &tiers["semantic"]["component"];
        assert_eq!(rag["name"], "vaultspec-rag");
        assert_eq!(rag["floor"], RAG_FLOOR);
        assert!(rag["version"].is_null(), "rag version is honestly unknown");
        // Availability and reasons are untouched by decoration.
        assert_eq!(tiers["declared"]["available"], false);
        assert_eq!(tiers["semantic"]["reason"], "rag service not installed");
    }
}
