//! The framework acquisition and provisioning plane.
//!
//! Selecting or registering an active project can land the operator in a
//! genuinely empty, non-vaultspec-managed repository. The dashboard already
//! DETECTS that honestly (`has_vault`, `validate_scope` 400, the startup
//! remediation prose) but could not ACT on it. This module is the dedicated
//! fenced plane that closes the gap:
//!
//! - `GET /provision/status` serves ONE backend projection of a registry-resolved
//!   target — git-ness, `uv` presence/version, `vaultspec-core`/`vaultspec-rag`
//!   tool versions vs their floors, framework install state (`.vaultspec/` +
//!   provider set), vault presence, pending migrations, and rag enrollment — over
//!   the shared `tiers` envelope. "Is this project managed / installable /
//!   migratable / enrollable" is SERVED truth, never client inference over `/map`
//!   (`displayed-state-is-backend-served`).
//! - `POST /provision/run` starts a typed capability as a bounded, single-flight
//!   JOB and returns its id; `GET /provision/jobs/{id}` polls it. Every mutation
//!   BROKERS the sibling that OWNS it — `vaultspec-core install`/`migrations run`
//!   for the project, `uv tool install` for machine-level tool acquisition — and
//!   the engine writes nothing itself (`engine-read-and-infer`; the same reasoning
//!   that lets the ops write-broker forward editor saves).
//!
//! Boundary discipline, mirroring the authoring `core_adapter`:
//! - The wire deserializes into a BOUNDED request DTO (serde-validated enums); the
//!   internal [`Capability`] carries NO `Deserialize`/`FromStr`, so no wire string
//!   ever selects an installer verb — the argv is chosen in Rust from a typed
//!   operation. The disjointness is proven in the tests below.
//! - Targets resolve ONLY through the workspace registry / `/map` enumeration
//!   ([`resolve_target`]); a raw path off the wire is never composed into argv.
//! - Every spawn carries BOTH an output byte cap AND a wall-clock deadline
//!   (`resource-bounds`); the job registry is size-capped and TTL-pruned.
//! - Force/overwrite verbs require a typed confirm token before ANY spawn
//!   (mirroring the rag storage dry-run/apply gate).
//! - After a successful provision the plane REFRESHES the memoized handshake core
//!   probe and EVICTS the target scope cell so a formerly-empty root becomes
//!   servable in-session (reconciliation).
//!
//! v1 excludes `uninstall` (destructive) and project-venv `uv add` dependency
//! flows (wheel-purity: `uv-tool-acquisition-is-machine-level-only`).

use std::collections::{HashMap, HashSet, VecDeque};
use std::path::Component;
use std::path::{Path as FsPath, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant};

use crate::app::AppState;
use crate::bounded_child::{BoundedFault, BoundedLimits, CapPolicy, run_bounded};
use crate::handshake::{CORE_FLOOR, RAG_FLOOR};
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

// --- bounds (resource-bounds: every cap explicit at creation) -----------------

/// A version probe (`--version`) is tiny; the cap only guards a pathological
/// child, and the deadline is generous enough for a cold `uv run` resolve.
const PROBE_CAP: u64 = 64 * 1024;
const PROBE_TIMEOUT: Duration = Duration::from_secs(30);

/// Output ceiling for a provisioning job's combined streams. An `install`/
/// `migrations` `--json` envelope is small and `uv tool install` prints progress
/// lines; 8 MiB is generous headroom before a runaway child is killed.
const JOB_OUTPUT_CAP: u64 = 8 * 1024 * 1024;

/// Wall-clock ceiling for a single provisioning job. Materially larger than the
/// 120 s core/editor budget and the 300 s rag-storage budget: a first-run
/// `uv tool install vaultspec-rag` pulls torch (multi-minute, multi-GB) on a cold
/// cache. Still bounded so a wedged job cannot pin a worker forever; a breach
/// kills the child and marks the job failed (outcome-indeterminate on Windows).
const JOB_TIMEOUT: Duration = Duration::from_secs(30 * 60);

/// The migrations-status probe folded into the status projection is a fast core
/// read; bound it well below the job ceiling so a slow core degrades that ONE
/// field rather than stalling the whole status response.
const MIGRATIONS_PROBE_TIMEOUT: Duration = Duration::from_secs(60);

/// The rag `/projects` enrollment read is best-effort and loopback-local; keep it
/// short so an unresponsive rag degrades the enrollment field, never the response.
const RAG_ENROLL_TIMEOUT: Duration = Duration::from_millis(1500);

/// Job registry bounds: at most this many jobs retained, older completed jobs
/// pruned first, and any job past the TTL is reclaimable (`bounded-by-default`).
const MAX_JOBS: usize = 64;
const JOB_TTL: Duration = Duration::from_secs(2 * 60 * 60);

/// The typed acknowledgement a force/overwrite verb must carry. A `force` without
/// this exact token is refused before any subprocess spawns.
const FORCE_CONFIRM_TOKEN: &str = "confirm-force";

// --- typed capability (NO Deserialize / NO FromStr) ---------------------------

/// The provider surface `vaultspec-core install` accepts. Chosen in Rust from the
/// bounded wire enum; never a free-form string reaching argv.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Provider {
    Core,
    Claude,
    Antigravity,
    Codex,
}

/// The complete provider set owned by Dashboard's current-project setup intent.
/// This is deliberately not delegated to Core's broader `all` selector, whose
/// provider membership is outside Dashboard's release contract.
const CURRENT_SETUP_PROVIDERS: [Provider; 4] = [
    Provider::Core,
    Provider::Claude,
    Provider::Antigravity,
    Provider::Codex,
];

impl Provider {
    fn as_arg(self) -> &'static str {
        match self {
            Provider::Core => "core",
            Provider::Claude => "claude",
            Provider::Antigravity => "antigravity",
            Provider::Codex => "codex",
        }
    }
}

/// The machine-level tool the `uv tool install` acquisition class may target.
/// Deliberately closed to the two vaultspec companions — never an arbitrary
/// package (`uv-tool-acquisition-is-machine-level-only`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Tool {
    Core,
    Rag,
}

impl Tool {
    fn package(self) -> &'static str {
        match self {
            Tool::Core => "vaultspec-core",
            Tool::Rag => "vaultspec-rag",
        }
    }
}

/// The internal capability set. Carries NO `Deserialize` and NO `FromStr`: a
/// capability is only ever CONSTRUCTED in Rust from a validated request, so no
/// collaborator payload can name, address, or invoke an installer verb directly
/// (the `core_adapter` discipline). Each variant maps to a FIXED argv shape.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Capability {
    /// Install every provider projection supported by this Dashboard release.
    /// The broker expands this into [`CURRENT_SETUP_PROVIDERS`] itself.
    SetupCurrent { force: bool },
    /// `vaultspec-core install <provider> -t <target> [--force]` — scaffold the
    /// framework into the target project.
    InstallFramework { provider: Provider, force: bool },
    /// `vaultspec-core install <provider> -t <target> --upgrade` — re-sync
    /// builtins without re-scaffolding.
    UpgradeFramework { provider: Provider },
    /// `vaultspec-core migrations run -t <target>` — apply pending schema
    /// migrations to an already-managed project.
    RunMigrations,
    /// `uv tool install [--upgrade] <package>` — machine-level tool acquisition.
    AcquireTool { tool: Tool, upgrade: bool },
}

impl Capability {
    /// Whether this capability MUTATES the target project's `.vault/`/`.vaultspec/`
    /// (an install/upgrade/migration), so the reconciler must refresh the core
    /// probe and evict the target scope cell after it succeeds. A tool
    /// acquisition mutates only the machine tool environment, so it refreshes the
    /// core probe (a new core version) but touches no scope.
    fn mutates_project(&self) -> bool {
        matches!(
            self,
            Capability::SetupCurrent { .. }
                | Capability::InstallFramework { .. }
                | Capability::UpgradeFramework { .. }
                | Capability::RunMigrations
        )
    }

    /// A short, stable machine label for the job envelope and single-flight key.
    fn label(&self) -> String {
        match self {
            Capability::SetupCurrent { .. } => "setup:current".to_string(),
            Capability::InstallFramework { provider, force } => {
                format!(
                    "install:{}{}",
                    provider.as_arg(),
                    if *force { ":force" } else { "" }
                )
            }
            Capability::UpgradeFramework { provider } => format!("upgrade:{}", provider.as_arg()),
            Capability::RunMigrations => "migrate".to_string(),
            Capability::AcquireTool { tool, upgrade } => {
                format!(
                    "acquire:{}{}",
                    tool.package(),
                    if *upgrade { ":upgrade" } else { "" }
                )
            }
        }
    }

    /// Resolve the program + argv for this capability against `target`. Project
    /// verbs prepend the resolved `vaultspec-core` invocation
    /// ([`CoreRunner::detect`], PATH/uv-managed); the machine acquisition prepends
    /// `uv`. `-t <target>` makes the core verbs directory-explicit, so the child
    /// cwd is irrelevant. NO wire string is interpolated — only the typed
    /// capability's own fixed tokens and the registry-resolved `target` path.
    fn argv(&self, target: &FsPath) -> Vec<String> {
        let target = target.to_string_lossy().to_string();
        match self {
            Capability::SetupCurrent { .. } => {
                unreachable!("aggregate setup expands through setup_commands")
            }
            Capability::InstallFramework { provider, force } => {
                let mut v = ingest_core::runner::CoreRunner::detect().invocation;
                v.push("install".into());
                v.push(provider.as_arg().into());
                v.push("-t".into());
                v.push(target);
                if *force {
                    v.push("--force".into());
                }
                v.push("--json".into());
                v
            }
            Capability::UpgradeFramework { provider } => {
                let mut v = ingest_core::runner::CoreRunner::detect().invocation;
                v.push("install".into());
                v.push(provider.as_arg().into());
                v.push("-t".into());
                v.push(target);
                v.push("--upgrade".into());
                v.push("--json".into());
                v
            }
            Capability::RunMigrations => {
                let mut v = ingest_core::runner::CoreRunner::detect().invocation;
                v.push("migrations".into());
                v.push("run".into());
                v.push("-t".into());
                v.push(target);
                v.push("--json".into());
                v
            }
            Capability::AcquireTool { tool, upgrade } => {
                // uv tool install NEVER takes --json (uv rejects it); its outcome
                // is read from the exit code + captured human output.
                let mut v = vec!["uv".to_string(), "tool".to_string(), "install".to_string()];
                if *upgrade {
                    v.push("--upgrade".into());
                }
                v.push(tool.package().into());
                v
            }
        }
    }

    /// Whether the capability is a `uv tool` acquisition — single-flighted
    /// MACHINE-WIDE (one machine, one tool install), independent of target.
    fn is_machine_acquisition(&self) -> bool {
        matches!(self, Capability::AcquireTool { .. })
    }

    fn posture(&self) -> &'static str {
        match self {
            Capability::SetupCurrent { force: true } => "force",
            Capability::SetupCurrent { force: false } => "safe",
            _ => "standard",
        }
    }

    /// Expand the current setup intent into its exact deterministic command set.
    fn setup_commands(&self, target: &FsPath) -> Option<Vec<(Provider, Vec<String>)>> {
        let Capability::SetupCurrent { force } = self else {
            return None;
        };
        Some(
            CURRENT_SETUP_PROVIDERS
                .iter()
                .copied()
                .enumerate()
                .map(|(index, provider)| {
                    let mut argv = Capability::InstallFramework {
                        provider,
                        force: *force,
                    }
                    .argv(target);
                    if index > 0 {
                        let json = argv.pop().expect("install argv ends in --json");
                        argv.extend(["--skip".into(), "core".into(), json]);
                    }
                    (provider, argv)
                })
                .collect(),
        )
    }
}

// --- wire request DTO (bounded, serde-validated) ------------------------------

/// The bounded action the wire may request. serde rejects any variant outside
/// this closed set, so an unknown/misspelled action 400s at extraction — the wire
/// selects a SEMANTIC operation, and Rust chooses the installer argv.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum Action {
    Setup,
    Install,
    Upgrade,
    Migrate,
    Acquire,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ProviderArg {
    Core,
    Claude,
    Antigravity,
    Codex,
}

impl From<ProviderArg> for Provider {
    fn from(p: ProviderArg) -> Self {
        match p {
            ProviderArg::Core => Provider::Core,
            ProviderArg::Claude => Provider::Claude,
            ProviderArg::Antigravity => Provider::Antigravity,
            ProviderArg::Codex => Provider::Codex,
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ToolArg {
    Core,
    Rag,
}

impl From<ToolArg> for Tool {
    fn from(t: ToolArg) -> Self {
        match t {
            ToolArg::Core => Tool::Core,
            ToolArg::Rag => Tool::Rag,
        }
    }
}

/// The target selector shared by the status read and the run request. A target
/// resolves through the registry ONLY: `workspace` names a registered root
/// (defaulting to the active workspace), and an optional `worktree` scope token
/// must be one the chosen workspace actually enumerates. No free-form path.
#[derive(Debug, Clone, Default, Deserialize)]
pub(crate) struct TargetParams {
    #[serde(default)]
    workspace: Option<String>,
    #[serde(default)]
    worktree: Option<String>,
}

/// The `POST /provision/run` body: a bounded action plus its typed operands and
/// the confirm token a force requires.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct RunRequest {
    action: Action,
    #[serde(default)]
    provider: Option<ProviderArg>,
    #[serde(default)]
    tool: Option<ToolArg>,
    #[serde(default)]
    upgrade: bool,
    #[serde(default)]
    force: bool,
    #[serde(default)]
    confirm: Option<String>,
    #[serde(flatten)]
    target: TargetParams,
}

impl RunRequest {
    /// Build the typed [`Capability`] from this validated request, or a typed
    /// wire error (`error_kind`) naming exactly what is missing/inconsistent.
    /// This is the ONLY construction path from wire to capability, and it never
    /// forwards a wire string into argv — it maps bounded enums to fixed tokens.
    fn to_capability(&self) -> Result<Capability, (StatusCode, &'static str, String)> {
        match self.action {
            Action::Setup => {
                if self.provider.is_some() || self.tool.is_some() || self.upgrade {
                    return Err((
                        StatusCode::BAD_REQUEST,
                        "unexpected_operand",
                        "setup selects the current provider set and accepts no provider, tool, or upgrade operand"
                            .to_string(),
                    ));
                }
                Ok(Capability::SetupCurrent { force: self.force })
            }
            Action::Install => {
                let provider = self.provider.ok_or((
                    StatusCode::BAD_REQUEST,
                    "provider_required",
                    "install requires a `provider`".to_string(),
                ))?;
                Ok(Capability::InstallFramework {
                    provider: provider.into(),
                    force: self.force,
                })
            }
            Action::Upgrade => {
                let provider = self.provider.ok_or((
                    StatusCode::BAD_REQUEST,
                    "provider_required",
                    "upgrade requires a `provider`".to_string(),
                ))?;
                Ok(Capability::UpgradeFramework {
                    provider: provider.into(),
                })
            }
            Action::Migrate => Ok(Capability::RunMigrations),
            Action::Acquire => {
                let tool = self.tool.ok_or((
                    StatusCode::BAD_REQUEST,
                    "tool_required",
                    "acquire requires a `tool`".to_string(),
                ))?;
                Ok(Capability::AcquireTool {
                    tool: tool.into(),
                    upgrade: self.upgrade,
                })
            }
        }
    }
}

// --- target resolution (registry-only; never a free-form wire path) -----------

/// Resolve a provisioning target to an absolute path THROUGH the registry. The
/// workspace root comes from the registry (`resolve_map_workspace_root`); an
/// optional `worktree` scope token is honored ONLY when it is one the workspace
/// actually enumerates. Anything else is an honest 400 — a raw path off the wire
/// never reaches argv.
fn resolve_target(
    state: &AppState,
    params: &TargetParams,
) -> Result<PathBuf, (StatusCode, Json<Value>)> {
    let root =
        crate::routes::registry::resolve_map_workspace_root(state, params.workspace.as_deref())?;
    let Some(worktree) = params.worktree.as_deref().filter(|s| !s.is_empty()) else {
        return Ok(root);
    };
    // A worktree target must be an enumerable worktree of the chosen workspace —
    // resolved read-only, never trusted from the wire verbatim.
    let workspace = ingest_git::workspace::Workspace::discover(&root)
        .map_err(|e| super::api_error(state, StatusCode::BAD_REQUEST, e.to_string()))?;
    let want = super::scope_token(FsPath::new(worktree));
    let found = ingest_git::worktrees::enumerate_lenient(&workspace)
        .map_err(|e| super::api_error(state, StatusCode::BAD_REQUEST, e.to_string()))?
        .into_iter()
        .any(|wt| super::scope_token(&wt.path) == want);
    if !found {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!("`{worktree}` is not a worktree of the selected workspace"),
        ));
    }
    Ok(PathBuf::from(worktree))
}

// --- bounded async probes -----------------------------------------------------

/// Spawn `<program> [args] --version`-style probe bounded (cap + deadline) and
/// return its first non-empty output line on a zero exit. `None` when the program
/// is absent, errors, or breaches a bound. Reads BOTH streams so a chatty child
/// cannot block on a full stderr pipe.
async fn probe_version(program: &str, args: &[&str]) -> Option<String> {
    let mut command = tokio::process::Command::new(program);
    command.args(args);
    let outcome = run_bounded(
        command,
        None,
        BoundedLimits {
            cap: PROBE_CAP,
            timeout: PROBE_TIMEOUT,
        },
        CapPolicy::Refuse,
    )
    .await
    .ok()?;
    if !outcome.success {
        return None;
    }
    // Some tools print the version to stdout, some to stderr.
    let text = if outcome.stdout.is_empty() {
        outcome.stderr_lossy()
    } else {
        outcome.stdout_lossy()
    };
    text.lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty())
        .map(|l| l.to_string())
}

/// Detect the provider install-state markers present in `target`. Cheap `is_dir`
/// checks; reports which known provider outputs the framework has scaffolded.
fn detect_providers(target: &FsPath) -> Vec<&'static str> {
    let mut present = Vec::new();
    for (dir, name) in [
        (".vaultspec", "core"),
        (".claude", "claude"),
        (".antigravity", "antigravity"),
        (".codex", "codex"),
    ] {
        if target.join(dir).is_dir() {
            present.push(name);
        }
    }
    present
}

/// Broker `vaultspec-core migrations status --json -t <target>` bounded, returning
/// the parsed envelope's pending-migration view or `None` when core is absent /
/// the read fails / the target is unmanaged (no migrations to speak of).
async fn probe_pending_migrations(target: &FsPath) -> Option<Value> {
    let invocation = ingest_core::runner::CoreRunner::detect().invocation;
    let (program, leading) = invocation.split_first()?;
    let target_s = target.to_string_lossy().to_string();
    let mut args: Vec<&str> = leading.iter().map(|s| s.as_str()).collect();
    args.extend_from_slice(&["migrations", "status", "-t", &target_s, "--json"]);
    let mut command = tokio::process::Command::new(program);
    command.args(&args);
    let outcome = run_bounded(
        command,
        None,
        BoundedLimits {
            cap: JOB_OUTPUT_CAP,
            timeout: MIGRATIONS_PROBE_TIMEOUT,
        },
        CapPolicy::Refuse,
    )
    .await
    .ok()?;
    if !outcome.success {
        return None;
    }
    serde_json::from_slice::<Value>(&outcome.stdout).ok()
}

/// Best-effort rag enrollment read: if a rag service is discoverable for the
/// target, ask its `/projects` registry whether the target root is a resident
/// tenant. Any failure yields `None` (unknown) — never an error; enrollment is
/// informational and the rag console owns the full view.
fn probe_rag_enrollment(target: &FsPath) -> Option<bool> {
    let (avail, info) = rag_client::client::discover(&target.join(".vault"));
    let info = match (avail, info) {
        (rag_client::RagAvailability::Available, Some(info)) => info,
        _ => return None,
    };
    let transport = rag_client::client::LoopbackTransport {
        port: info.port,
        bearer: info.service_token,
        timeout: RAG_ENROLL_TIMEOUT,
    };
    let projects = rag_client::control::projects(&transport).ok()?;
    let want = target.to_string_lossy();
    // rag reports tenants under `projects` (an array of objects carrying a
    // `root`); membership is a substring-free exact path compare. Tolerant of
    // either a bare array or an object wrapping one.
    let arr = projects
        .get("projects")
        .and_then(|v| v.as_array())
        .or_else(|| projects.as_array())?;
    Some(arr.iter().any(|p| {
        p.get("root").and_then(|r| r.as_str()) == Some(want.as_ref())
            || p.get("project_root").and_then(|r| r.as_str()) == Some(want.as_ref())
    }))
}

// --- GET /provision/status ----------------------------------------------------

/// Serve the provisioning projection for a registry-resolved target. Every field
/// is backend-computed truth the frontend renders without inventing semantics;
/// the response rides the shared `tiers` envelope.
pub(crate) async fn provision_status(
    State(state): State<Arc<AppState>>,
    Query(params): Query<TargetParams>,
) -> ApiResult {
    let target = resolve_target(&state, &params)?;

    // Cheap filesystem truth (inline; `is_dir`/`exists` are not blocking work).
    let git_present = target.join(".git").exists();
    let vaultspec_present = target.join(".vaultspec").is_dir();
    let vault_present = target.join(".vault").is_dir();
    let providers = detect_providers(&target);

    // Subprocess + discovery probes. Core version is the sync fresh probe on the
    // blocking pool; the rest are async-bounded. rag enrollment is sync loopback
    // I/O, also offloaded.
    let core_version = tokio::task::spawn_blocking(ingest_core::runner::core_version_fresh)
        .await
        .ok()
        .flatten();
    let uv_version = probe_version("uv", &["--version"]).await;
    let rag_tool_version = probe_version("vaultspec-rag", &["--version"]).await;
    let pending_migrations = if vault_present {
        probe_pending_migrations(&target).await
    } else {
        None
    };
    let target_for_enroll = target.clone();
    let rag_enrolled =
        tokio::task::spawn_blocking(move || probe_rag_enrollment(&target_for_enroll))
            .await
            .ok()
            .flatten();

    let core_meets_floor = core_version.map(|v| v >= CORE_FLOOR);
    let uv_present = uv_version.is_some();

    // The one served decision: what, if anything, this target needs. Ordered by
    // dependency so the frontend can render a single primary affordance.
    let recommended = if !git_present {
        "not-a-git-project"
    } else if !uv_present {
        "acquire-uv" // honest dead-end: we never install uv (detect-and-instruct)
    } else if core_version.is_none() {
        "acquire-core"
    } else if !vaultspec_present {
        "install-framework"
    } else if pending_migrations
        .as_ref()
        .and_then(|m| m.get("data"))
        .and_then(|d| d.get("pending"))
        .and_then(|p| p.as_array())
        .is_some_and(|a| !a.is_empty())
    {
        "run-migrations"
    } else if core_meets_floor == Some(false) {
        "upgrade-core"
    } else {
        "managed"
    };

    let managed = git_present && vaultspec_present && vault_present;

    Ok(super::envelope(
        json!({
            "target": target.to_string_lossy(),
            "managed": managed,
            "recommended": recommended,
            "git": { "present": git_present },
            "uv": { "present": uv_present, "version": uv_version },
            "core": {
                "version": core_version.map(|(a, b, c)| format!("{a}.{b}.{c}")),
                "floor": format!("{}.{}.{}", CORE_FLOOR.0, CORE_FLOOR.1, CORE_FLOOR.2),
                "meets_floor": core_meets_floor,
            },
            "rag": {
                "tool_version": rag_tool_version,
                "floor": RAG_FLOOR,
                "enrolled": rag_enrolled,
            },
            "framework": {
                "vaultspec_present": vaultspec_present,
                "vault_present": vault_present,
                "providers": providers,
            },
            "pending_migrations": pending_migrations,
        }),
        super::query_tiers(&state.active_cell()),
        None,
    ))
}

// --- job registry (bounded, single-flight) ------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum JobState {
    Running,
    Succeeded,
    Failed,
}

impl JobState {
    fn as_str(self) -> &'static str {
        match self {
            JobState::Running => "running",
            JobState::Succeeded => "succeeded",
            JobState::Failed => "failed",
        }
    }
}

/// One tracked provisioning job. `outcome` holds the parsed sibling envelope (for
/// core verbs) or the raw captured output (for `uv`), plus an
/// `outcome_indeterminate` flag when a Windows breach means the exit code cannot
/// be trusted and the caller must re-read `GET /provision/status`.
#[derive(Debug, Clone)]
struct Job {
    id: String,
    label: String,
    target: String,
    /// Single-flight key: for a machine acquisition, target-independent.
    key: String,
    /// Internal request posture used to distinguish safe and force setup while
    /// retaining one semantic setup single-flight identity.
    posture: &'static str,
    state: JobState,
    created: Instant,
    outcome: Option<Value>,
}

impl Job {
    fn to_wire(&self) -> Value {
        json!({
            "id": self.id,
            "label": self.label,
            "target": self.target,
            "state": self.state.as_str(),
            "outcome": self.outcome.clone().unwrap_or(Value::Null),
        })
    }
}

/// The process-global provisioning job registry. Process-global is the correct
/// scope: `uv` acquisitions are machine-wide single-flight (one machine, one tool
/// install), and the plane serves one operator. Bounded by [`MAX_JOBS`] with
/// TTL prune, and by a single-flight key set so a duplicate in-flight request
/// attaches to the running job rather than spawning a second.
struct Registry {
    jobs: HashMap<String, Job>,
    order: VecDeque<String>,
}

impl Registry {
    fn new() -> Self {
        Registry {
            jobs: HashMap::new(),
            order: VecDeque::new(),
        }
    }

    /// Drop TTL-expired jobs, then evict oldest COMPLETED jobs until at/under the
    /// cap. A running job is never evicted (its background task still writes it).
    fn prune(&mut self) {
        let expired: Vec<String> = self
            .jobs
            .iter()
            .filter(|(_, j)| j.state != JobState::Running && j.created.elapsed() > JOB_TTL)
            .map(|(id, _)| id.clone())
            .collect();
        for id in expired {
            self.jobs.remove(&id);
            self.order.retain(|q| q != &id);
        }
        while self.jobs.len() > MAX_JOBS {
            // Oldest-first: find the first queued id that is a completed job.
            let victim = self
                .order
                .iter()
                .find(|id| {
                    self.jobs
                        .get(*id)
                        .is_some_and(|j| j.state != JobState::Running)
                })
                .cloned();
            match victim {
                Some(id) => {
                    self.jobs.remove(&id);
                    self.order.retain(|q| q != &id);
                }
                None => break, // all remaining are running; cannot shed further
            }
        }
    }

    /// An identical running request attaches. A different posture under the
    /// same semantic identity conflicts instead of starting a competing job.
    fn match_or_reserve(&mut self, job: Job) -> Reservation {
        self.prune();
        match self
            .jobs
            .values()
            .find(|j| j.state == JobState::Running && j.key == job.key)
        {
            Some(existing) if existing.posture == job.posture => {
                Reservation::Attach(existing.to_wire())
            }
            Some(existing) => Reservation::Conflict(existing.id.clone()),
            None => {
                if self.jobs.len() >= MAX_JOBS {
                    let victim = self
                        .order
                        .iter()
                        .find(|id| {
                            self.jobs
                                .get(*id)
                                .is_some_and(|candidate| candidate.state != JobState::Running)
                        })
                        .cloned();
                    let Some(victim) = victim else {
                        return Reservation::AtCapacity;
                    };
                    self.jobs.remove(&victim);
                    self.order.retain(|id| id != &victim);
                }
                let wire = job.to_wire();
                self.insert(job);
                Reservation::Reserved(wire)
            }
        }
    }

    fn insert(&mut self, job: Job) {
        self.order.push_back(job.id.clone());
        self.jobs.insert(job.id.clone(), job);
        self.prune();
    }

    fn set_outcome(&mut self, id: &str, state: JobState, outcome: Value) {
        if let Some(job) = self.jobs.get_mut(id) {
            job.state = state;
            job.outcome = Some(outcome);
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
enum Reservation {
    Reserved(Value),
    Attach(Value),
    Conflict(String),
    AtCapacity,
}

static REGISTRY: LazyLock<Mutex<Registry>> = LazyLock::new(|| Mutex::new(Registry::new()));
static TASKS: LazyLock<Mutex<HashMap<String, tokio::task::JoinHandle<()>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static JOB_SEQ: AtomicU64 = AtomicU64::new(1);

fn next_job_id() -> String {
    format!("prov-{}", JOB_SEQ.fetch_add(1, Ordering::Relaxed))
}

fn registry_lock() -> std::sync::MutexGuard<'static, Registry> {
    REGISTRY.lock().unwrap_or_else(|e| e.into_inner())
}

fn task_lock() -> std::sync::MutexGuard<'static, HashMap<String, tokio::task::JoinHandle<()>>> {
    TASKS.lock().unwrap_or_else(|e| e.into_inner())
}

#[cfg(test)]
pub(crate) fn test_job_and_task_counts(id: &str) -> (usize, usize) {
    (
        registry_lock()
            .jobs
            .values()
            .filter(|job| job.id == id)
            .count(),
        usize::from(task_lock().contains_key(id)),
    )
}

#[cfg(test)]
pub(crate) fn test_register_owned_task(id: &str, task: tokio::task::JoinHandle<()>) {
    task_lock().insert(id.to_string(), task);
}

/// Join every aggregate task still owned by the provisioning plane. The shared
/// shutdown latch makes each task drop its active bounded process-tree future
/// first; retaining and joining the handles keeps serve shutdown from orphaning
/// work whose single-flight registry disappears with the process.
pub(crate) async fn shutdown_jobs() {
    let tasks: Vec<_> = task_lock().drain().map(|(_, task)| task).collect();
    for task in tasks {
        // Service exit no longer needs a wire outcome. Abort is the explicit
        // cancellation edge: it drops the active runner, whose group guard
        // sends the whole-tree kill and retains a group-empty waiter.
        task.abort();
        let _ = task.await;
    }
}

// --- the bounded job runner ---------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RunTermination {
    Completed,
    TimeoutCancelled,
    OutputCapped,
    AtCapacity,
    Indeterminate,
}

#[derive(Debug)]
struct RunCapture {
    code: Option<i32>,
    stdout: String,
    stderr: String,
    captured_bytes: u64,
    termination: RunTermination,
}

impl RunCapture {
    fn combined(&self) -> String {
        match (self.stdout.is_empty(), self.stderr.is_empty()) {
            (false, false) => format!("{}\n{}", self.stdout, self.stderr),
            (false, true) => self.stdout.clone(),
            (true, false) => self.stderr.clone(),
            (true, true) => String::new(),
        }
    }

    fn bytes(&self) -> u64 {
        self.captured_bytes
    }
}

/// Spawn a capability's argv bounded (output cap + wall-clock), capturing the
/// combined streams. The canonical runner owns a process group, so a timeout or
/// cap breach kills and reaps the complete tree. A read/wait failure remains
/// indeterminate because the runner could not prove that lifecycle completed.
async fn run_capability_with_limits(argv: &[String], limits: BoundedLimits) -> RunCapture {
    let mut command = tokio::process::Command::new(&argv[0]);
    command.args(&argv[1..]);
    let outcome = match run_bounded(command, None, limits, CapPolicy::Refuse).await {
        Ok(outcome) => outcome,
        Err(BoundedFault::Spawn(error)) => {
            return RunCapture {
                code: None,
                stdout: String::new(),
                stderr: format!("spawning {}: {error}", argv[0]),
                captured_bytes: 0,
                termination: RunTermination::Completed,
            };
        }
        Err(BoundedFault::Timeout) => {
            return RunCapture {
                code: None,
                stdout: String::new(),
                stderr: format!("{} timed out after {}s", argv[0], limits.timeout.as_secs()),
                captured_bytes: 0,
                termination: RunTermination::TimeoutCancelled,
            };
        }
        Err(BoundedFault::OverCap) => {
            return RunCapture {
                code: None,
                stdout: String::new(),
                stderr: format!(
                    "{} produced over {} bytes of output (capped)",
                    argv[0], limits.cap
                ),
                captured_bytes: limits.cap,
                termination: RunTermination::OutputCapped,
            };
        }
        Err(BoundedFault::Read(error) | BoundedFault::Wait(error)) => {
            return RunCapture {
                code: None,
                stdout: String::new(),
                stderr: format!("running {}: {error}", argv[0]),
                captured_bytes: 0,
                termination: RunTermination::AtCapacity,
            };
        }
        Err(BoundedFault::AtCapacity) => {
            return RunCapture {
                code: None,
                stdout: String::new(),
                stderr: "bounded process-group capacity exhausted".into(),
                captured_bytes: 0,
                termination: RunTermination::Indeterminate,
            };
        }
    };
    let captured_bytes = (outcome.stdout.len() + outcome.stderr.len()) as u64;
    RunCapture {
        code: outcome.code,
        stdout: outcome.stdout_lossy().into_owned(),
        stderr: outcome.stderr_lossy().into_owned(),
        captured_bytes,
        termination: RunTermination::Completed,
    }
}

async fn run_capability(argv: &[String]) -> RunCapture {
    run_capability_with_limits(
        argv,
        BoundedLimits {
            cap: JOB_OUTPUT_CAP,
            timeout: JOB_TIMEOUT,
        },
    )
    .await
}

/// Interpret a completed non-setup run into its job outcome and final state.
/// Core JSON is parsed when present; `uv` human text is surfaced raw. A zero exit
/// is success; a non-zero exit
/// or a breach is failure, with `outcome_indeterminate` set when the caller must
/// re-probe to learn the true post-state.
fn outcome_value(
    code: Option<i32>,
    combined: &str,
    termination: RunTermination,
) -> (JobState, Value) {
    let parsed = serde_json::from_str::<Value>(combined).ok();
    let succeeded = code == Some(0) && termination == RunTermination::Completed;
    let state = if succeeded {
        JobState::Succeeded
    } else {
        JobState::Failed
    };
    let mut out = json!({
        "exit_code": code,
        "outcome_indeterminate": termination != RunTermination::Completed,
    });
    match parsed {
        Some(env) => out["envelope"] = env,
        None => out["output"] = json!(combined),
    }
    (state, out)
}

mod setup;

#[cfg(test)]
use setup::{
    ManifestState, current_setup_outcome, digest, manifest_has_unsupported, manifest_is_exact,
    setup_receipt, validate_install_output,
};

// --- POST /provision/run ------------------------------------------------------

/// Start a capability as a bounded, single-flight job and return its id. Force
/// verbs are gated on the confirm token BEFORE any resolution or spawn. A
/// duplicate in-flight request (same single-flight key) attaches to the running
/// job rather than spawning a second.
pub(crate) async fn provision_run(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RunRequest>,
) -> ApiResult {
    // Confirm gate FIRST (before target resolution / spawn): a force/overwrite
    // install without the exact typed token is refused (mirroring the rag
    // storage dry-run/apply gate).
    if req.force && req.confirm.as_deref() != Some(FORCE_CONFIRM_TOKEN) {
        return Err(super::api_error_kind(
            &state,
            StatusCode::BAD_REQUEST,
            "confirm_required",
            format!("a force install requires `confirm: \"{FORCE_CONFIRM_TOKEN}\"`"),
        ));
    }

    let capability = req
        .to_capability()
        .map_err(|(status, kind, msg)| super::api_error_kind(&state, status, kind, msg))?;

    // A tool acquisition targets the MACHINE, not a project; a project verb
    // resolves its target through the registry.
    let (target, target_label): (Option<PathBuf>, String) = if capability.is_machine_acquisition() {
        (None, "machine".to_string())
    } else {
        let t = resolve_target(&state, &req.target)?;
        let label = t.to_string_lossy().to_string();
        (Some(t), label)
    };

    // Guard the acquisition class on a uv presence probe — we never install uv
    // (detect-and-instruct stands).
    if capability.is_machine_acquisition() && probe_version("uv", &["--version"]).await.is_none() {
        return Err(super::api_error_kind(
            &state,
            StatusCode::FAILED_DEPENDENCY,
            "uv_absent",
            "uv was not found on PATH; install it from https://docs.astral.sh/uv/ and retry"
                .to_string(),
        ));
    }

    // Single-flight key: machine-wide for acquisitions, per-(target,label) for
    // project verbs.
    let key = if capability.is_machine_acquisition() {
        format!("machine:{}", capability.label())
    } else {
        format!("{}:{}", target_label, capability.label())
    };

    let id = next_job_id();
    let setup_commands = capability.setup_commands(target.as_deref().unwrap_or(FsPath::new(".")));
    let argv = setup_commands
        .is_none()
        .then(|| capability.argv(target.as_deref().unwrap_or(FsPath::new("."))));
    let job = Job {
        id: id.clone(),
        label: capability.label(),
        target: target_label,
        key,
        posture: capability.posture(),
        state: JobState::Running,
        created: Instant::now(),
        outcome: None,
    };
    // Match and reserve atomically. No request can observe "none" and then
    // race a second insertion for the same semantic operation.
    let wire = match registry_lock().match_or_reserve(job) {
        Reservation::Reserved(wire) => wire,
        Reservation::Attach(wire) => {
            return Ok(super::envelope(
                json!({ "job": wire, "attached": true }),
                super::query_tiers(&state.active_cell()),
                None,
            ));
        }
        Reservation::Conflict(existing) => {
            return Err(super::api_error_kind(
                &state,
                StatusCode::CONFLICT,
                "setup_posture_conflict",
                format!(
                    "setup aggregate {existing} is already running with a different force posture"
                ),
            ));
        }
        Reservation::AtCapacity => {
            return Err(super::api_error_kind(
                &state,
                StatusCode::CONFLICT,
                "at_capacity",
                format!("provisioning registry is at its hard {MAX_JOBS}-job capacity"),
            ));
        }
    };

    // Run the job in the background so the request returns immediately with the
    // job id (job-shaped execution; a torch pull is minutes). The task owns its
    // argv + a clone of state for the post-provision reconciliation.
    let bg_state = state.clone();
    let bg_id = id.clone();
    let mutates_project = capability.mutates_project();
    let bg_target = target.clone();
    let task_id = bg_id.clone();
    let (start_tx, start_rx) = tokio::sync::oneshot::channel();
    let task = tokio::spawn(async move {
        let _ = start_rx.await;
        let operation = async {
            match setup_commands {
                Some(commands) => {
                    setup::run_current_setup(
                        &bg_id,
                        matches!(capability, Capability::SetupCurrent { force: true }),
                        commands,
                        bg_target.as_deref().expect("setup target"),
                    )
                    .await
                }
                None => {
                    let argv = argv.expect("single capability argv");
                    let capture = run_capability(&argv).await;
                    outcome_value(capture.code, &capture.combined(), capture.termination)
                }
            }
        };
        let (job_state, outcome) = tokio::select! {
            result = operation => result,
            _ = bg_state.shutdown.wait() => {
                if matches!(capability, Capability::SetupCurrent { .. }) {
                    setup::current_setup_outcome(setup::terminal_receipts(
                        &bg_id,
                        "indeterminate",
                        json!({"error_kind":"shutdown_cancelled"}),
                        "full_tree_drop_pending",
                    ))
                } else {
                    (JobState::Failed, json!({
                        "outcome_indeterminate": true,
                        "error_kind": "shutdown_cancelled",
                    }))
                }
            }
        };
        // Reconcile before publishing the terminal job state, so a client that
        // observes completion and re-reads status cannot race a stale scope.
        // Aggregate setup reconciles after every terminal shape because an
        // earlier provider may have succeeded before a later failure or breach.
        if job_state == JobState::Succeeded || matches!(capability, Capability::SetupCurrent { .. })
        {
            let _ = crate::handshake::refresh_core_probe();
            if mutates_project && let Some(t) = bg_target {
                reconcile_scope(&bg_state, &t);
            }
        }
        registry_lock().set_outcome(&bg_id, job_state, outcome);
        task_lock().remove(&bg_id);
    });
    task_lock().insert(task_id, task);
    let _ = start_tx.send(());

    Ok(super::envelope(
        json!({ "job": wire, "attached": false }),
        super::query_tiers(&state.active_cell()),
        None,
    ))
}

/// Post-provision scope reconciliation: evict any warm cell whose token matches
/// the just-provisioned target so the next request rebuilds it fresh against the
/// now-present `.vault/`. The active scope is pinned and never evicted; a
/// formerly-empty NON-active target simply had no cell and will build on first
/// access — this eviction covers the case where a stale non-vault cell was warm.
fn reconcile_scope(state: &AppState, target: &FsPath) {
    let token = super::scope_token(target);
    let active = state
        .active_scope
        .read()
        .map(|s| s.clone())
        .unwrap_or_else(|e| e.into_inner().clone());
    let mut reg = state.registry.write().unwrap_or_else(|e| e.into_inner());
    reg.evict_where(&active, |t| t == token);
}

// --- GET /provision/jobs/{id} -------------------------------------------------

/// Poll one job by id. Prunes TTL-expired jobs on read so the registry stays
/// bounded even without new submissions.
pub(crate) async fn provision_job(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> ApiResult {
    let job = {
        let mut reg = registry_lock();
        reg.prune();
        reg.jobs.get(&id).map(Job::to_wire)
    };
    match job {
        Some(job) => Ok(super::envelope(
            json!({ "job": job }),
            super::query_tiers(&state.active_cell()),
            None,
        )),
        None => Err(super::api_error(
            &state,
            StatusCode::NOT_FOUND,
            format!("no provisioning job `{id}` (unknown or reclaimed)"),
        )),
    }
}

// --- one-shot CLI facade ------------------------------------------------------
//
// The terminal gets the SAME provisioning mouth the GUI has: these wrappers
// drive the exact route handlers above in-process (same DTO validation — the
// request is deserialized through the same serde grammar the wire uses, so no
// CLI string can select an argv the wire could not), and the run wrapper polls
// the same job registry to completion so a one-shot invocation returns the
// finished outcome. One module, three consumers (startup gate via handshake,
// the served projection, and the CLI): they cannot disagree.

/// One-shot `provision status` over the launch workspace (the CLI's implicit
/// target, exactly like every other one-shot verb).
pub async fn cli_status(state: Arc<AppState>, workspace: Option<String>) -> Result<Value, Value> {
    let target = TargetParams {
        workspace,
        worktree: None,
    };
    match provision_status(State(state), Query(target)).await {
        Ok(Json(v)) => Ok(v),
        Err((_, Json(v))) => Err(v),
    }
}

/// One-shot `provision <action>`: validate through the wire DTO grammar, start
/// the job through the same single-flight registry, and poll it to a terminal
/// state (bounded by the job's own wall-clock ceiling plus slack).
pub async fn cli_run(state: Arc<AppState>, request: Value) -> Result<Value, Value> {
    let req: RunRequest = serde_json::from_value(request)
        .map_err(|e| json!({"error": format!("invalid provision request: {e}")}))?;
    let started = match provision_run(State(state.clone()), Json(req)).await {
        Ok(Json(v)) => v,
        Err((_, Json(v))) => return Err(v),
    };
    let Some(job_id) = started["data"]["job"]["id"].as_str().map(str::to_string) else {
        // No job id means the run was refused with a typed payload.
        return Err(started);
    };
    let deadline = Instant::now() + JOB_TIMEOUT + Duration::from_secs(60);
    loop {
        let polled = match provision_job(State(state.clone()), Path(job_id.clone())).await {
            Ok(Json(v)) => v,
            Err((_, Json(v))) => return Err(v),
        };
        match polled["data"]["job"]["state"].as_str() {
            Some("running") if Instant::now() < deadline => {
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
            Some("running") => {
                return Err(json!({
                    "error": "provisioning job still running past its ceiling",
                    "job": polled["data"]["job"].clone(),
                }));
            }
            _ => return Ok(polled),
        }
    }
}

#[cfg(test)]
#[path = "provision/tests.rs"]
mod tests;
