//! The resident-serve boot path (single-app-runtime W01/W02): workspace
//! resolution with the workspace-less bootstrap fallback, seat acquisition,
//! discovery publication + heartbeat, launcher-state recording, and the one
//! shared graceful-shutdown drain. Split from `lib.rs` (module-size gate);
//! `lib.rs` re-exports `serve` and `bootstrap_root` so the public surface is
//! unchanged.

use std::time::Duration;

use crate::{DEFAULT_PORT, app, build_router, handshake, registry, routes, seat};

/// Run the resident service on loopback: initial index, watcher-driven
/// rebuild-and-swap (302/303), heartbeat on the discovery file.
///
/// `no_seat` (with `--port 0` implying it) is the sanctioned multi-instance
/// exemption (single-app-runtime D1): an exempt serve skips the machine seat
/// lock and keeps publishing the workspace-local discovery file, so the test
/// harness and parallel dev worktrees are untouched by the seat law.
pub async fn serve(port: Option<u16>, scope: Option<String>, no_seat: bool) -> std::io::Result<()> {
    // An EXPLICIT port keeps the fail-loud conflict contract (R2). The
    // DEFAULT (no --port) is app-shaped: prefer the well-known port, fall
    // back to an OS-ephemeral one on conflict — discovery advertises the
    // real bound port, so a double-click works even when a dev engine
    // already squats 8767.
    let explicit_port = port;
    let port = port.unwrap_or(DEFAULT_PORT);
    // Crash visibility (dogfood DF-4): a panic anywhere must leave a
    // trace, never a silent death. The hook writes a crash log under the
    // engine data dir and stderr before unwinding.
    //
    // `--scope` selects the served worktree explicitly; without it the
    // launch directory is the implicit scope (both resolve to their
    // containing worktree below, exactly like every one-shot verb).
    let cwd = match scope {
        Some(path) => {
            let p = std::path::PathBuf::from(&path);
            if !p.is_dir() {
                return Err(std::io::Error::other(format!(
                    "--scope `{path}` is not a usable worktree (must be an existing \
                     directory inside a git workspace)"
                )));
            }
            p
        }
        None => std::env::current_dir()?,
    };
    // Resolve like every other verb (dogfood DF-2, D2.1): any launch
    // directory inside the workspace resolves to its containing worktree.
    // WORKSPACE-LESS BOOT (single-app-runtime D4): a SEATED serve with no
    // resolvable vault-bearing workspace (the first-ever double-click) does
    // not fail — it boots over the engine-owned bootstrap root (an empty,
    // deletable, re-derivable scratch corpus under the app home) so the SPA
    // can serve the first-run onboarding and register the first real
    // workspace through the registry write seam. Exempt serves (--no-seat,
    // --port 0) keep the historical fail-loud contract the test harness
    // asserts.
    // The ONE exemption predicate (review M3: it must exist exactly once).
    let seat_eligible = !(no_seat || explicit_port == Some(0));

    // Machine seat (single-app-runtime D1): one resident app process per
    // machine, enforced by an OS file lock the kernel releases on ANY death
    // (dead-pid takeover is therefore automatic). Acquired FIRST — before
    // workspace resolution and any heavy work — so a conflict fails fast AND
    // the bootstrap-root creation below is serialized by the lock (review
    // finding: two concurrent workspace-less boots raced the check-then-init
    // when it ran pre-seat). `--port 0` implies exemption (the OS-ephemeral
    // test port, the dev-workflow rule's sanctioned exception); `--no-seat`
    // is the explicit dev escape hatch.
    let seat_guard = if !seat_eligible {
        None
    } else {
        match vaultspec_session::app_home::app_home_dir() {
            None => {
                eprintln!(
                    "vaultspec serve: WARNING - no home directory resolvable; \
                     serving unseated (machine discovery disabled)."
                );
                None
            }
            Some(home) => match seat::acquire_seat(&home)? {
                Ok(guard) => Some(guard),
                Err(seat::SeatBusy::Held { pid, port }) => {
                    let who = match (pid, port) {
                        (Some(pid), Some(port)) => {
                            format!("pid {pid} on http://127.0.0.1:{port}")
                        }
                        (Some(pid), None) => format!("pid {pid}"),
                        _ => "another process".to_string(),
                    };
                    return Err(std::io::Error::other(format!(
                        "the vaultspec app is already running ({who}) - run \
                         `vaultspec` to open it, or `vaultspec stop` first \
                         (dev/test escape hatches: --no-seat, --port 0)"
                    )));
                }
            },
        }
    };

    let resolved_root: Result<std::path::PathBuf, String> = (|| {
        let workspace = ingest_git::workspace::Workspace::discover(&cwd)
            .map_err(|e| format!("not inside a git workspace: {e}"))?;
        // Path-only resolution (worktree-enumeration sweep): the launch root
        // is matched by path, so list roots cheaply rather than inspecting
        // every worktree at serve boot.
        let roots = ingest_git::worktrees::list_roots(&workspace).map_err(|e| e.to_string())?;
        let cwd_clean = cwd.to_string_lossy().replace('\\', "/");
        let root = roots
            .into_iter()
            .find(|p| {
                let wp = p.to_string_lossy().replace('\\', "/");
                let wp = wp.strip_prefix("//?/").unwrap_or(&wp).to_string();
                let cw = cwd_clean.strip_prefix("//?/").unwrap_or(&cwd_clean);
                cw == wp || cw.starts_with(&format!("{wp}/"))
            })
            .unwrap_or(cwd.clone());
        // Strip Windows extended-length prefixes so the served root compares
        // cleanly with client-supplied scope strings.
        let cleaned = root.to_string_lossy().replace('\\', "/");
        let root = std::path::PathBuf::from(cleaned.strip_prefix("//?/").unwrap_or(&cleaned));
        if !root.join(".vault").is_dir() {
            return Err(format!(
                "no .vault corpus under {} - vaultspec serve runs inside a \
                 vaultspec-managed worktree",
                root.display()
            ));
        }
        Ok(root)
    })();
    let (root, bootstrap) = match resolved_root {
        Ok(root) => (root, false),
        // Bootstrap only for a SEATED boot: the held guard proves this is the
        // one process allowed to create/inspect the scratch corpus, so the
        // check-then-init below cannot race a sibling boot.
        Err(reason) if seat_guard.is_some() => {
            let home = seat_guard
                .as_ref()
                .map(|g| g.home.clone())
                .expect("guarded by is_some");
            eprintln!(
                "vaultspec serve: no workspace at the launch directory \
                 ({reason}); booting the first-run onboarding surface."
            );
            (bootstrap_root(&home)?, true)
        }
        Err(reason) => return Err(std::io::Error::other(reason)),
    };

    // Detect-and-instruct (dashboard-packaging D3, amended by review): probe
    // the two external requirements BEFORE any heavy work and WARN with the
    // exact remediation — never exit. Serving degraded with honest tiers is
    // the binding doctrine (the adversarial degradation suite and the
    // conformance harness both run serve without core by design), and the
    // affected tiers carry the same remediation truth to the GUI.
    if let Err(remediation) = handshake::startup_gate() {
        eprintln!(
            "vaultspec serve: WARNING - a companion tool is missing; the \
             affected data tiers will report unavailable.\n\n{remediation}\n"
        );
    }

    let crash_log = engine_store::engine_data_dir(&root.join(".vault")).join("crash.log");
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let line = format!(
            "[{}] vaultspec serve panic: {info}\n",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0)
        );
        if let Some(parent) = crash_log.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&crash_log)
            .and_then(|mut f| std::io::Write::write_all(&mut f, line.as_bytes()));
        eprintln!("{line}");
        default_hook(info);
    }));

    // Loopback-only bind FIRST (R2: a port conflict fails loud here) so an
    // OS-assigned ephemeral port (`--port 0`) is resolved to the ACTUAL bound
    // port before discovery is written — and BEFORE the heavy initial index
    // (single-app-runtime S23), so discovery can publish a `starting` record
    // the moment the port exists and a launcher, `status`, or `stop` can
    // distinguish an INDEXING seat from a dead one.
    let listener = match tokio::net::TcpListener::bind(std::net::SocketAddr::from((
        [127, 0, 0, 1],
        port,
    )))
    .await
    {
        Ok(listener) => listener,
        Err(e) if e.kind() == std::io::ErrorKind::AddrInUse && explicit_port.is_none() => {
            // Default-port conflict on an app launch: fall back to ephemeral
            // (the seat's discovery carries the real port). An EXPLICIT
            // --port keeps failing loud per the contract.
            eprintln!(
                "vaultspec serve: port {port} is in use; binding an ephemeral port instead (discovery advertises the real one)"
            );
            tokio::net::TcpListener::bind(std::net::SocketAddr::from(([127, 0, 0, 1], 0))).await?
        }
        Err(e) => return Err(e),
    };
    let port = listener.local_addr()?.port();

    // Discovery + heartbeat (contract §1), advertising the real bound port.
    // SEATED serves publish at the machine app home (single-app-runtime D1
    // cutover); exempt serves keep the workspace-local file byte-compatible.
    // The identity (bearer + boot instant) is minted BEFORE the index so the
    // `starting` record already carries the real token.
    let discovery_dir = match &seat_guard {
        Some(guard) => guard.home.clone(),
        None => engine_store::engine_data_dir(&root.join(".vault")),
    };
    let identity = app::DiscoveryIdentity {
        bearer: app::mint_bearer(),
        started_ms: app::now_ms(),
    };
    app::write_service_json(&identity, &discovery_dir, port, "starting")?;

    // Abort-on-drop guard for the heartbeat task (B9, resource-hardening):
    // without an abort handle it was a detached task that survives
    // cancellation of this `serve` future. Spawned BEFORE the index so the
    // heartbeat stays fresh through a long cold index (a stale-heartbeat
    // reader must never mistake an indexing seat for a dead one).
    struct AbortOnDrop(tokio::task::JoinHandle<()>);
    impl Drop for AbortOnDrop {
        fn drop(&mut self) {
            self.0.abort();
        }
    }
    let ready = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let _heartbeat = {
        let identity = identity.clone();
        let dir = discovery_dir.clone();
        let ready = ready.clone();
        AbortOnDrop(tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(15)).await;
                let state = if ready.load(std::sync::atomic::Ordering::Relaxed) {
                    "ready"
                } else {
                    "starting"
                };
                // Owner-checked: never clobbers a foreign serve's discovery
                // (single-app-runtime S01).
                let _ = app::heartbeat_service_json(&identity, &dir, port, state);
            }
        }))
    };

    // TEST-HARNESS knob (single-app-runtime review M2): hold the boot in the
    // `starting` state for a bounded moment so the state machine (status,
    // stop, launcher waits) is testable deterministically — a fixture corpus
    // indexes too fast to observe the window reliably. Never set outside the
    // test suites; capped so a stray value cannot wedge a real boot.
    if let Ok(raw) = std::env::var("VAULTSPEC_TEST_BOOT_DELAY_MS")
        && let Ok(ms) = raw.parse::<u64>()
    {
        tokio::time::sleep(Duration::from_millis(ms.min(60_000))).await;
    }

    // Build the workspace-level state. This opens the SHARED user-state handle
    // once, eagerly builds the launch scope's cell into the registry (cold
    // initial index, the same pipeline the one-shot CLI runs, D2.4), spawns
    // that cell's watcher on its own clock (W02.P04.S13), and pins it as the
    // active scope. We run inside the tokio runtime, so the watcher's rebuild
    // task spawns here.
    let state = app::build_state_with_bearer(root.clone(), identity.bearer.clone());

    // Restore the persisted active scope through the shared user-state handle
    // (W02.P03.S11): the workspace key is the launch root's token, the stored
    // active scope is a worktree token. Restore it only if it still names a
    // selectable vault-bearing worktree; otherwise fall back to the launch
    // worktree. Persist the resolved active scope back so a first run seeds it.
    let workspace_key = routes::scope_token(&state.workspace_root);
    let launch_token = workspace_key.clone();
    let restored = {
        let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
        us.active_scope(&workspace_key).ok().flatten()
    }
    .filter(|token| registry::validate_scope_token(&state, token).is_ok());
    let active_token = match restored {
        Some(token) if token != launch_token => {
            // A different, still-valid persisted scope: warm it and make it
            // active so reload restores "where I was".
            if registry::get_or_build(&state, &token).is_ok() {
                *state
                    .active_scope
                    .write()
                    .unwrap_or_else(|e| e.into_inner()) = token.clone();
                token
            } else {
                launch_token.clone()
            }
        }
        _ => launch_token.clone(),
    };
    {
        let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
        let _ = us.set_active_scope(&workspace_key, &active_token, app::now_ms());
    }

    // Auto-register the launch workspace as the first registry root
    // (dashboard-workspace-registry ADR, P01.S03), so the single-project
    // experience is unchanged. The BOOTSTRAP root is deliberately NOT
    // registered (single-app-runtime D4): it is engine-owned scratch, not a
    // user workspace — an empty registry is the SPA's first-run signal.
    // The stable workspace id is the canonical git
    // common dir (the same identity-bearing derivation the rest of the contract
    // uses), discovered READ-ONLY from the launch root; the label defaults to the
    // launch root's final path component, the path is the launch token. This
    // RECORDS the launch root only; it never mutates the repository. Best-effort:
    // a discovery or store failure degrades to "no registry seeded" and the rail
    // renders the launch workspace as the header fallback. The active workspace
    // is seeded to the launch root when none is selected yet.
    if !bootstrap {
        let workspace_id = ingest_git::workspace::Workspace::discover(&state.workspace_root)
            .ok()
            .map(|ws| routes::scope_token(&ws.common_dir));
        if let Some(workspace_id) = workspace_id {
            let label = state
                .workspace_root
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| launch_token.clone());
            let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
            let _ = us.auto_register_launch(&workspace_id, &label, &launch_token, app::now_ms());
            if us.active_workspace().ok().flatten().is_none() {
                let _ = us.set_active_workspace(&workspace_id, app::now_ms());
            }
        }
    }

    // Launcher state (single-app-runtime D3): a seated boot records its
    // workspace in the machine-global known-roots file so a cwd-less launch
    // (double-click) can resolve "where did I work last". Best-effort. The
    // bootstrap root is scratch, never recorded.
    if let Some(guard) = &seat_guard
        && !bootstrap
    {
        let id = ingest_git::workspace::Workspace::discover(&state.workspace_root)
            .ok()
            .map(|ws| routes::scope_token(&ws.common_dir))
            .unwrap_or_else(|| routes::scope_token(&state.workspace_root));
        let label = state
            .workspace_root
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let mut launcher = vaultspec_session::LauncherState::load(&guard.home);
        launcher.touch(
            &id,
            &label,
            &state.workspace_root.to_string_lossy(),
            app::now_ms(),
        );
        let _ = launcher.save(&guard.home);
    }

    // Reconcile the receipt-owned A2A gateway (a2a-product-provisioning
    // W02.P04.S27). A SEATED dashboard starts or authenticates ONLY a gateway its
    // receipt owns and leaves every compatible foreign resident immutable
    // (ADR D4); an exempt (--no-seat / --port 0) or bootstrap boot never touches
    // product state. Best-effort: a not-installed product is a no-op, a start
    // failure degrades the agent tier honestly rather than aborting the seat.
    if seat_guard.is_some() && !bootstrap {
        let plane = state.a2a_lifecycle.clone();
        // Publish THIS seated dashboard's terminal-settlement callback URL to any
        // gateway this boot starts, so a run's terminal state settles back here
        // (a2a-product-provisioning W02.P05.S41/S153). Loopback + the bound seat
        // port; fail-soft on the gateway side if it is somehow unusable.
        let settlement_url = format!("http://127.0.0.1:{port}/internal/a2a/run-terminal");
        let outcome =
            tokio::task::spawn_blocking(move || plane.reconcile_seated_boot(Some(&settlement_url)))
                .await
                .unwrap_or(serde_json::Value::Null);
        if !matches!(
            outcome.get("action").and_then(|a| a.as_str()),
            Some("none") | None
        ) {
            eprintln!("vaultspec serve: a2a gateway reconcile: {outcome}");
        }
    }

    // The index is done and the wire is about to serve: flip discovery to
    // `ready` (single-app-runtime S23). The heartbeat keeps republishing it.
    ready.store(true, std::sync::atomic::Ordering::Relaxed);
    let _ = app::write_service_json(&identity, &discovery_dir, port, "ready");

    println!(
        "vaultspec serve: listening on http://127.0.0.1:{port} (bearer token in service.json)"
    );
    // Graceful shutdown (single-app-runtime D5): ONE shared exit path for
    // ctrl-c, SIGTERM (unix), and the bearer-gated `/shutdown` route. axum
    // stops accepting, in-flight requests and SSE streams drain (bounded by
    // the clients' own disconnects), then discovery is retracted and the
    // seat lock released by drop.
    let shutdown_signal = {
        let state = state.clone();
        async move {
            let ctrl_c = async {
                let _ = tokio::signal::ctrl_c().await;
            };
            #[cfg(unix)]
            let terminate = async {
                match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
                    Ok(mut sig) => {
                        sig.recv().await;
                    }
                    Err(_) => std::future::pending::<()>().await,
                }
            };
            #[cfg(not(unix))]
            let terminate = std::future::pending::<()>();
            tokio::select! {
                _ = ctrl_c => {},
                _ = terminate => {},
                _ = state.shutdown.notified() => {},
            }
            eprintln!("vaultspec serve: shutting down gracefully");
        }
    };
    // P04a: the ONE bounded background janitor — abandoned-run reap plus the undriven
    // expiry seams, on a fixed cadence. Serve-time only; aborts with the serve future
    // via the same abort-on-drop discipline as the heartbeat.
    let _janitor = AbortOnDrop(crate::authoring::session::spawn_janitor(
        state.clone(),
        crate::authoring::session::JanitorConfig::default_bounds(),
    ));
    let result = axum::serve(listener, build_router(state.clone()))
        .with_graceful_shutdown(shutdown_signal)
        .await
        .map_err(std::io::Error::other);
    // Terminate the owned A2A gateway tree within a bound (a2a-product-
    // provisioning W02.P04.S27, ADR D4) BEFORE releasing the seat, so a clean
    // exit never orphans a gateway this dashboard started. A no-op when nothing
    // was started here (cold install, or attached to a foreign-owned gateway).
    if let Some(forced) = state
        .a2a_lifecycle
        .terminate_owned_gateway(Duration::from_secs(10))
    {
        eprintln!(
            "vaultspec serve: owned a2a gateway terminated ({})",
            if forced { "forced" } else { "graceful" }
        );
    }
    // Retract discovery (owner-checked) so no stale port/token survives a
    // clean exit; the seat lock releases when the guard drops right after.
    app::remove_service_json_if_owned(&discovery_dir);
    drop(seat_guard);
    result
}

/// The engine-owned bootstrap root for workspace-less boots (single-app-
/// runtime D4): an empty scratch corpus under the app home — a bare-bones
/// git repository (initialized once, engine-owned, deletable, re-derivable;
/// this touches NO user repository and is exempt from the never-mutate-git
/// rule the same way the engine-data cache is exempt from never-write-vault)
/// plus an empty `.vault/`. The whole existing pipeline runs over it and
/// serves honest empty projections until the first real workspace is
/// registered through the SPA onboarding.
pub fn bootstrap_root(home: &std::path::Path) -> std::io::Result<std::path::PathBuf> {
    let root = home.join("bootstrap");
    std::fs::create_dir_all(root.join(".vault"))?;
    if !root.join(".git").exists() {
        gix::init(&root)
            .map_err(|e| std::io::Error::other(format!("bootstrap repository init failed: {e}")))?;
    }
    Ok(root)
}
