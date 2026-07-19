//! The owned gateway process tree (a2a-product-provisioning W01.P02.S15).
//!
//! The dashboard owns exactly the gateway process (ADR D4). It spawns ONLY the
//! manifest-declared gateway entrypoint — the launch program is resolved from
//! the capsule manifest's declared `relative_command` under the capsule root,
//! never a free-form path — and it contains the owned tree through bounded
//! graceful-then-forced cleanup, so a stop or failure path terminates the whole
//! tree within a bound rather than orphaning descendants.
//!
//! Process-tree containment is platform-specific:
//!
//! - On Unix the child is spawned as its own process-group leader
//!   (`process_group(0)`, safe — no `pre_exec`), so `killpg` signals the gateway
//!   AND any worker/provider descendants it spawned. Graceful is `SIGTERM`;
//!   forced is `SIGKILL`.
//! - On Windows the child is spawned into a job object (`command-group`), so
//!   terminating the group kills the whole tree. There is no POSIX graceful
//!   signal, so the graceful window lets the tree exit on its own (after an
//!   already-issued control-plane drain/shutdown) before the job is terminated.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

use crate::manifest::{CapsuleManifest, Result as ManifestResult};

/// A validated gateway launch specification: the resolved program path plus its
/// arguments and environment. The production path constructs this only from the
/// manifest ([`GatewaySpec::from_manifest`]); no free-form command reaches the
/// spawner.
#[derive(Debug, Clone)]
pub struct GatewaySpec {
    program: PathBuf,
    args: Vec<std::ffi::OsString>,
    envs: Vec<(std::ffi::OsString, std::ffi::OsString)>,
}

impl GatewaySpec {
    /// Build the gateway spec from the capsule manifest's declared gateway
    /// entrypoint under a capsule root. The `relative_command` segments are
    /// validated (no traversal, no separators) before they join the root, so a
    /// malformed manifest cannot point the launch outside the capsule. This is
    /// the ONLY production constructor — the dashboard never launches an
    /// arbitrary command.
    pub fn from_manifest(capsule_root: &Path, manifest: &CapsuleManifest) -> ManifestResult<Self> {
        let program = manifest.entrypoints.gateway.resolve_program(capsule_root)?;
        Ok(Self {
            program,
            args: Vec::new(),
            envs: Vec::new(),
        })
    }

    /// Construct a spec directly from a resolved program and arguments. Used by
    /// the update path (which resolves the staged generation's gateway program)
    /// and by tests that spawn a real controllable process.
    #[must_use]
    pub fn new(program: impl Into<PathBuf>, args: Vec<std::ffi::OsString>) -> Self {
        Self {
            program: program.into(),
            args,
            envs: Vec::new(),
        }
    }

    /// Attach an environment variable the gateway launch needs (e.g. the app
    /// home or credential-file references).
    #[must_use]
    pub fn with_env(
        mut self,
        key: impl Into<std::ffi::OsString>,
        value: impl Into<std::ffi::OsString>,
    ) -> Self {
        self.envs.push((key.into(), value.into()));
        self
    }

    /// The resolved launch program.
    #[must_use]
    pub fn program(&self) -> &Path {
        &self.program
    }
}

/// The outcome of a bounded termination.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Termination {
    /// Whether the tree had to be force-killed after the graceful window
    /// elapsed (vs. exiting gracefully on its own).
    pub forced: bool,
}

/// A spawned, owned gateway process. Holding it keeps the platform child handle
/// (and, on Windows, the job object) alive; dropping it does NOT kill the tree —
/// use [`GatewayProcess::terminate_tree`] for the bounded cleanup contract.
#[derive(Debug)]
pub struct GatewayProcess {
    pid: u32,
    #[cfg(unix)]
    child: std::process::Child,
    #[cfg(windows)]
    child: command_group::GroupChild,
}

impl GatewayProcess {
    /// The gateway process id (the process-group leader on Unix).
    #[must_use]
    pub fn pid(&self) -> u32 {
        self.pid
    }

    /// Whether the gateway process is still alive, via a scoped process probe.
    #[must_use]
    pub fn is_alive(&self) -> bool {
        crate::locking::process_is_alive(self.pid)
    }

    /// Non-blocking reap check.
    pub fn try_wait(&mut self) -> std::io::Result<Option<std::process::ExitStatus>> {
        self.child.try_wait()
    }

    /// Block until the gateway exits and reap it.
    pub fn wait(&mut self) -> std::io::Result<std::process::ExitStatus> {
        self.child.wait()
    }

    /// Terminate the whole owned tree within a bound: give it `graceful` to exit
    /// (on Unix after a `SIGTERM`; on Windows after any already-issued drain), and
    /// if it is still alive at the deadline, force-kill the tree and reap it.
    pub fn terminate_tree(&mut self, graceful: Duration) -> std::io::Result<Termination> {
        #[cfg(unix)]
        {
            use nix::sys::signal::{Signal, killpg};
            use nix::unistd::Pid;
            // The child leads its own group, so its pid is the pgid; SIGTERM the
            // group asks the gateway and its descendants to exit.
            let pgid = Pid::from_raw(self.pid as i32);
            let _ = killpg(pgid, Signal::SIGTERM);
            if self.wait_for_exit(graceful)? {
                return Ok(Termination { forced: false });
            }
            // Still alive at the deadline: force the whole group down.
            let _ = killpg(pgid, Signal::SIGKILL);
            let _ = self.child.wait();
            Ok(Termination { forced: true })
        }
        #[cfg(windows)]
        {
            // No POSIX graceful signal on Windows: the graceful window lets the
            // tree exit on its own after a control-plane drain/shutdown, then the
            // job object is terminated (which cleans up every descendant).
            if self.wait_for_exit(graceful)? {
                return Ok(Termination { forced: false });
            }
            self.child.kill()?;
            let _ = self.child.wait();
            Ok(Termination { forced: true })
        }
    }

    /// Poll for the child to exit within `budget`. Returns `true` if it exited.
    fn wait_for_exit(&mut self, budget: Duration) -> std::io::Result<bool> {
        let deadline = Instant::now() + budget;
        loop {
            if self.child.try_wait()?.is_some() {
                return Ok(true);
            }
            if Instant::now() >= deadline {
                return Ok(false);
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    }
}

/// Spawn the gateway from a validated spec, contained for tree cleanup. Stdio is
/// nulled — the gateway logs to its own app-home files, not to the dashboard's
/// pipes (an inherited pipe would tie the dashboard's lifetime to the child).
pub fn spawn_gateway(spec: &GatewaySpec) -> std::io::Result<GatewayProcess> {
    let mut cmd = Command::new(&spec.program);
    cmd.args(&spec.args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    for (k, v) in &spec.envs {
        cmd.env(k, v);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt as _;
        cmd.process_group(0);
        let child = cmd.spawn()?;
        Ok(GatewayProcess {
            pid: child.id(),
            child,
        })
    }
    #[cfg(windows)]
    {
        use command_group::CommandGroup as _;
        let child = cmd.group_spawn()?;
        Ok(GatewayProcess {
            pid: child.id(),
            child,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manifest::{ComponentEntrypoints, LaunchEntrypoint};

    /// A hidden helper the process tests re-invoke as a real child: it optionally
    /// spawns a grandchild sleeper, records pids to files, and sleeps until
    /// released or a 30s cap. In a normal `cargo test` run (no env) it is a
    /// no-op. This makes the process-tree proofs use REAL processes.
    #[test]
    fn gateway_sleeper_process() {
        let Ok(pidfile) = std::env::var("SLEEPER_PIDFILE") else {
            return;
        };
        std::fs::write(&pidfile, std::process::id().to_string()).unwrap();
        // Optionally spawn a grandchild sleeper to prove descendant cleanup.
        let mut _grandchild = None;
        if let Ok(gc_pidfile) = std::env::var("SLEEPER_GRANDCHILD_PIDFILE") {
            let exe = std::env::current_exe().unwrap();
            let child = Command::new(exe)
                .args(["gateway_sleeper_process", "--nocapture", "--test-threads=1"])
                .env("SLEEPER_PIDFILE", &gc_pidfile)
                .env_remove("SLEEPER_GRANDCHILD_PIDFILE")
                .spawn()
                .unwrap();
            _grandchild = Some(child);
        }
        let release = std::env::var("SLEEPER_RELEASE").ok();
        let deadline = Instant::now() + Duration::from_secs(30);
        while Instant::now() < deadline {
            if let Some(r) = &release
                && Path::new(r).exists()
            {
                break;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
    }

    fn sleeper_spec(pidfile: &Path, grandchild_pidfile: Option<&Path>) -> GatewaySpec {
        let exe = std::env::current_exe().unwrap();
        let mut spec = GatewaySpec::new(
            exe,
            ["gateway_sleeper_process", "--nocapture", "--test-threads=1"]
                .iter()
                .map(std::ffi::OsString::from)
                .collect(),
        )
        .with_env("SLEEPER_PIDFILE", pidfile);
        if let Some(gc) = grandchild_pidfile {
            spec = spec.with_env("SLEEPER_GRANDCHILD_PIDFILE", gc);
        }
        spec
    }

    fn wait_for_file(path: &Path, budget: Duration) -> bool {
        let deadline = Instant::now() + budget;
        while Instant::now() < deadline {
            if path.exists() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        false
    }

    #[test]
    fn from_manifest_builds_the_declared_path_and_rejects_traversal() {
        let root = Path::new("/opt/capsule");
        let entry = |segments: &[&str]| LaunchEntrypoint {
            kind: "gateway".to_string(),
            console_script: "g".to_string(),
            reference: "m:main".to_string(),
            relative_command: segments.iter().map(|s| s.to_string()).collect(),
        };
        let mut manifest = sample_manifest();
        manifest.entrypoints.gateway = entry(&["bin", "gateway"]);
        let spec = GatewaySpec::from_manifest(root, &manifest).unwrap();
        assert!(
            spec.program().ends_with("bin/gateway") || spec.program().ends_with("bin\\gateway")
        );
        // A traversal segment is refused before it can escape the capsule.
        manifest.entrypoints.gateway = entry(&["..", "escape"]);
        assert!(GatewaySpec::from_manifest(root, &manifest).is_err());
    }

    #[test]
    fn terminate_tree_kills_the_owned_process_and_descendants() {
        let dir = tempfile::tempdir().unwrap();
        let child_pidfile = dir.path().join("child.pid");
        let gc_pidfile = dir.path().join("grandchild.pid");
        let spec = sleeper_spec(&child_pidfile, Some(&gc_pidfile));
        let mut proc = spawn_gateway(&spec).expect("spawn real gateway process");

        // Both the child and its grandchild come up as real processes.
        assert!(
            wait_for_file(&child_pidfile, Duration::from_secs(10)),
            "child never started"
        );
        assert!(
            wait_for_file(&gc_pidfile, Duration::from_secs(10)),
            "grandchild never started"
        );
        let gc_pid: u32 = std::fs::read_to_string(&gc_pidfile)
            .unwrap()
            .trim()
            .parse()
            .unwrap();
        assert!(proc.is_alive(), "owned gateway is alive");
        assert!(
            crate::locking::process_is_alive(gc_pid),
            "grandchild is a live descendant"
        );

        // Bounded termination brings the whole tree down.
        proc.terminate_tree(Duration::from_millis(200)).unwrap();

        // Give the OS a beat to reap, then both the gateway and its descendant
        // must be gone — no orphaned grandchild.
        let deadline = Instant::now() + Duration::from_secs(5);
        while (proc.is_alive() || crate::locking::process_is_alive(gc_pid))
            && Instant::now() < deadline
        {
            std::thread::sleep(Duration::from_millis(25));
        }
        assert!(!proc.is_alive(), "owned gateway terminated");
        assert!(
            !crate::locking::process_is_alive(gc_pid),
            "descendant terminated with the tree (no orphan)"
        );
    }

    fn sample_manifest() -> CapsuleManifest {
        // A structurally-minimal manifest whose entrypoints we overwrite; only
        // the entrypoint path resolution is under test here.
        CapsuleManifest {
            contract_version: "1.0".to_string(),
            identity: crate::manifest::ComponentIdentity {
                name: "vaultspec-a2a".to_string(),
                version: "0.1.0".to_string(),
            },
            target: crate::manifest::Target::X86_64PcWindowsMsvc,
            compatibility: crate::manifest::ComponentCompatibility {
                api_versions: crate::manifest::RangeBounds {
                    minimum: "v1".to_string(),
                    maximum: "v1".to_string(),
                },
                migration_range: crate::manifest::MigrationRange {
                    base: "0001".to_string(),
                    head: "0009".to_string(),
                },
            },
            entrypoints: ComponentEntrypoints {
                gateway: LaunchEntrypoint {
                    kind: "gateway".to_string(),
                    console_script: "g".to_string(),
                    reference: "m:main".to_string(),
                    relative_command: vec!["bin".to_string(), "gateway".to_string()],
                },
                standalone_mcp: LaunchEntrypoint {
                    kind: "standalone-mcp".to_string(),
                    console_script: "m".to_string(),
                    reference: "m:mcp".to_string(),
                    relative_command: vec!["bin".to_string(), "mcp".to_string()],
                },
            },
            digest_algorithm: "sha256".to_string(),
            assets: Vec::new(),
            dependency_lock: crate::manifest::DependencyLockIdentity {
                uv_lock_digest: "0".repeat(64),
                package_lock_digest: "0".repeat(64),
            },
        }
    }
}
