//! The framework acquisition and provisioning plane (project-provisioning ADR).
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
//!   servable in-session (ADR D6 reconciliation).
//!
//! v1 excludes `uninstall` (destructive) and project-venv `uv add` dependency
//! flows (wheel-purity: `uv-tool-acquisition-is-machine-level-only`).

use std::collections::{HashMap, VecDeque};
use std::path::{Path as FsPath, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant};

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::io::AsyncReadExt;

use crate::app::AppState;
use crate::handshake::{CORE_FLOOR, RAG_FLOOR};

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
    All,
    Core,
    Claude,
    Gemini,
    Antigravity,
    Codex,
}

impl Provider {
    fn as_arg(self) -> &'static str {
        match self {
            Provider::All => "all",
            Provider::Core => "core",
            Provider::Claude => "claude",
            Provider::Gemini => "gemini",
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
            Capability::InstallFramework { .. }
                | Capability::UpgradeFramework { .. }
                | Capability::RunMigrations
        )
    }

    /// A short, stable machine label for the job envelope and single-flight key.
    fn label(&self) -> String {
        match self {
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
}

// --- wire request DTO (bounded, serde-validated) ------------------------------

/// The bounded action the wire may request. serde rejects any variant outside
/// this closed set, so an unknown/misspelled action 400s at extraction — the wire
/// selects a SEMANTIC operation, and Rust chooses the installer argv.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum Action {
    Install,
    Upgrade,
    Migrate,
    Acquire,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ProviderArg {
    All,
    Core,
    Claude,
    Gemini,
    Antigravity,
    Codex,
}

impl From<ProviderArg> for Provider {
    fn from(p: ProviderArg) -> Self {
        match p {
            ProviderArg::All => Provider::All,
            ProviderArg::Core => Provider::Core,
            ProviderArg::Claude => Provider::Claude,
            ProviderArg::Gemini => Provider::Gemini,
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
/// never reaches argv (ADR D5).
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
    let mut child = tokio::process::Command::new(program)
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .ok()?;
    let stdout = child.stdout.take()?;
    let stderr = child.stderr.take()?;
    let collect = async {
        let mut obuf = Vec::new();
        let mut ebuf = Vec::new();
        let mut otake = stdout.take(PROBE_CAP);
        let mut etake = stderr.take(PROBE_CAP);
        let (_o, _e) = tokio::join!(otake.read_to_end(&mut obuf), etake.read_to_end(&mut ebuf),);
        (obuf, ebuf)
    };
    let (obuf, ebuf) = match tokio::time::timeout(PROBE_TIMEOUT, collect).await {
        Ok(bufs) => bufs,
        Err(_) => {
            let _ = child.kill().await;
            return None;
        }
    };
    let status = child.wait().await.ok()?;
    if !status.success() {
        return None;
    }
    // Some tools print the version to stdout, some to stderr.
    let text = if obuf.is_empty() { ebuf } else { obuf };
    String::from_utf8_lossy(&text)
        .lines()
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
        (".gemini", "gemini"),
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
    let mut child = tokio::process::Command::new(program)
        .args(&args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .ok()?;
    let stdout = child.stdout.take()?;
    let collect = async {
        let mut buf = Vec::new();
        let mut take = stdout.take(JOB_OUTPUT_CAP);
        let _ = take.read_to_end(&mut buf).await;
        buf
    };
    let buf = match tokio::time::timeout(MIGRATIONS_PROBE_TIMEOUT, collect).await {
        Ok(buf) => buf,
        Err(_) => {
            let _ = child.kill().await;
            return None;
        }
    };
    let status = child.wait().await.ok()?;
    if !status.success() {
        return None;
    }
    serde_json::from_slice::<Value>(&buf).ok()
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

    /// The id of a RUNNING job already covering `key`, if any (single-flight).
    fn running_for(&self, key: &str) -> Option<String> {
        self.jobs
            .values()
            .find(|j| j.state == JobState::Running && j.key == key)
            .map(|j| j.id.clone())
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

static REGISTRY: LazyLock<Mutex<Registry>> = LazyLock::new(|| Mutex::new(Registry::new()));
static JOB_SEQ: AtomicU64 = AtomicU64::new(1);

fn next_job_id() -> String {
    format!("prov-{}", JOB_SEQ.fetch_add(1, Ordering::Relaxed))
}

fn registry_lock() -> std::sync::MutexGuard<'static, Registry> {
    REGISTRY.lock().unwrap_or_else(|e| e.into_inner())
}

// --- the bounded job runner ---------------------------------------------------

/// Spawn a capability's argv bounded (output cap + wall-clock), capturing the
/// combined streams. Returns `(exit_code, combined_output, breached)`. On a
/// breach the child is killed with the same `tokio` `child.kill().await` the
/// sibling runner uses (`run_sibling_bounded`); `breached` marks the outcome
/// INDETERMINATE — a `uv run`/console-script grandchild can outlive a direct
/// kill on either platform, so the caller must re-probe `GET /provision/status`
/// rather than trust the exit code (ADR D4, mirroring `core_adapter`).
async fn run_capability(argv: &[String]) -> (Option<i32>, String, bool) {
    let mut child = match tokio::process::Command::new(&argv[0])
        .args(&argv[1..])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return (None, format!("spawning {}: {e}", argv[0]), false),
    };
    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");
    let collect = async {
        let mut obuf = Vec::new();
        let mut ebuf = Vec::new();
        let mut otake = stdout.take(JOB_OUTPUT_CAP);
        let mut etake = stderr.take(JOB_OUTPUT_CAP);
        let (_o, _e) = tokio::join!(otake.read_to_end(&mut obuf), etake.read_to_end(&mut ebuf),);
        (obuf, ebuf)
    };
    let (obuf, ebuf) = match tokio::time::timeout(JOB_TIMEOUT, collect).await {
        Ok(bufs) => bufs,
        Err(_) => {
            let _ = child.kill().await;
            return (
                None,
                format!("{} timed out after {}s", argv[0], JOB_TIMEOUT.as_secs()),
                true,
            );
        }
    };
    let over_cap = obuf.len() as u64 >= JOB_OUTPUT_CAP || ebuf.len() as u64 >= JOB_OUTPUT_CAP;
    if over_cap {
        let _ = child.kill().await;
        return (
            None,
            format!(
                "{} produced over {} bytes of output (capped)",
                argv[0], JOB_OUTPUT_CAP
            ),
            true,
        );
    }
    let code = child.wait().await.ok().and_then(|s| s.code());
    let combined = match (obuf.is_empty(), ebuf.is_empty()) {
        (false, false) => format!(
            "{}\n{}",
            String::from_utf8_lossy(&obuf).trim(),
            String::from_utf8_lossy(&ebuf).trim()
        ),
        (false, true) => String::from_utf8_lossy(&obuf).trim().to_string(),
        (true, false) => String::from_utf8_lossy(&ebuf).trim().to_string(),
        (true, true) => String::new(),
    };
    (code, combined, false)
}

/// Interpret a completed run into the job outcome value + final state. A core
/// verb emits a `vaultspec.sync.v1` envelope on stdout (parsed through verbatim);
/// `uv` emits human text (surfaced raw). A zero exit is success; a non-zero exit
/// or a breach is failure, with `outcome_indeterminate` set when the caller must
/// re-probe to learn the true post-state.
fn outcome_value(code: Option<i32>, combined: &str, breached: bool) -> (JobState, Value) {
    let parsed = serde_json::from_str::<Value>(combined).ok();
    let succeeded = code == Some(0) && !breached;
    let state = if succeeded {
        JobState::Succeeded
    } else {
        JobState::Failed
    };
    let mut out = json!({
        "exit_code": code,
        "outcome_indeterminate": breached,
    });
    match parsed {
        Some(env) => out["envelope"] = env,
        None => out["output"] = json!(combined),
    }
    (state, out)
}

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
    // install without the exact typed token is refused (ADR D5, mirroring the rag
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

    // Attach to an already-running job for the same key rather than spawn a
    // duplicate.
    {
        let reg = registry_lock();
        if let Some(existing) = reg.running_for(&key) {
            let job = reg
                .jobs
                .get(&existing)
                .map(Job::to_wire)
                .unwrap_or(Value::Null);
            drop(reg);
            return Ok(super::envelope(
                json!({ "job": job, "attached": true }),
                super::query_tiers(&state.active_cell()),
                None,
            ));
        }
    }

    let id = next_job_id();
    let argv = capability.argv(target.as_deref().unwrap_or(FsPath::new(".")));
    let job = Job {
        id: id.clone(),
        label: capability.label(),
        target: target_label,
        key,
        state: JobState::Running,
        created: Instant::now(),
        outcome: None,
    };
    let wire = job.to_wire();
    registry_lock().insert(job);

    // Run the job in the background so the request returns immediately with the
    // job id (job-shaped execution; a torch pull is minutes). The task owns its
    // argv + a clone of state for the post-provision reconciliation.
    let bg_state = state.clone();
    let bg_id = id.clone();
    let mutates_project = capability.mutates_project();
    let bg_target = target.clone();
    tokio::spawn(async move {
        let (code, combined, breached) = run_capability(&argv).await;
        let (job_state, outcome) = outcome_value(code, &combined, breached);
        registry_lock().set_outcome(&bg_id, job_state, outcome);
        // Reconciliation (ADR D6): on a real success, refresh the memoized core
        // probe (a new/updated core version) and evict the target scope cell so a
        // formerly-empty root becomes servable in-session. A breach is NOT a
        // success, so it never reconciles on a possibly-incomplete write.
        if job_state == JobState::Succeeded {
            let _ = crate::handshake::refresh_core_probe();
            if mutates_project && let Some(t) = bg_target {
                reconcile_scope(&bg_state, &t);
            }
        }
    });

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

// --- one-shot CLI facade (single-app-runtime D6) ------------------------------
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
mod tests {
    use super::*;

    #[test]
    fn capability_carries_no_wire_deserialize_path() {
        // A capability is only ever CONSTRUCTED from a validated request; the
        // wire cannot name one. This is enforced by the type system (no
        // Deserialize/FromStr on Capability) — the test documents the intent and
        // exercises the one construction path.
        let req = RunRequest {
            action: Action::Install,
            provider: Some(ProviderArg::All),
            tool: None,
            upgrade: false,
            force: false,
            confirm: None,
            target: TargetParams::default(),
        };
        assert_eq!(
            req.to_capability().unwrap(),
            Capability::InstallFramework {
                provider: Provider::All,
                force: false
            }
        );
    }

    #[test]
    fn install_argv_is_fixed_tokens_plus_target() {
        let cap = Capability::InstallFramework {
            provider: Provider::Core,
            force: true,
        };
        let argv = cap.argv(FsPath::new("/tmp/proj"));
        // The core invocation prefix varies by machine; assert the fixed tail.
        let tail: Vec<&str> = argv
            .iter()
            .rev()
            .take(6)
            .rev()
            .map(|s| s.as_str())
            .collect();
        assert_eq!(
            tail,
            ["install", "core", "-t", "/tmp/proj", "--force", "--json"]
        );
    }

    #[test]
    fn upgrade_argv_omits_force_carries_upgrade() {
        let cap = Capability::UpgradeFramework {
            provider: Provider::All,
        };
        let argv = cap.argv(FsPath::new("/p"));
        assert!(argv.contains(&"--upgrade".to_string()));
        assert!(!argv.contains(&"--force".to_string()));
        assert!(argv.contains(&"--json".to_string()));
    }

    #[test]
    fn acquire_argv_never_carries_json_and_targets_only_companions() {
        let core = Capability::AcquireTool {
            tool: Tool::Core,
            upgrade: false,
        }
        .argv(FsPath::new("."));
        assert_eq!(core, ["uv", "tool", "install", "vaultspec-core"]);
        let rag = Capability::AcquireTool {
            tool: Tool::Rag,
            upgrade: true,
        }
        .argv(FsPath::new("."));
        assert_eq!(rag, ["uv", "tool", "install", "--upgrade", "vaultspec-rag"]);
        assert!(!core.contains(&"--json".to_string()));
    }

    #[test]
    fn migrate_requires_no_operands() {
        let req = RunRequest {
            action: Action::Migrate,
            provider: None,
            tool: None,
            upgrade: false,
            force: false,
            confirm: None,
            target: TargetParams::default(),
        };
        assert_eq!(req.to_capability().unwrap(), Capability::RunMigrations);
    }

    #[test]
    fn install_without_provider_is_typed_error() {
        let req = RunRequest {
            action: Action::Install,
            provider: None,
            tool: None,
            upgrade: false,
            force: false,
            confirm: None,
            target: TargetParams::default(),
        };
        let (status, kind, _) = req.to_capability().unwrap_err();
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(kind, "provider_required");
    }

    #[test]
    fn acquire_is_machine_wide_project_verbs_are_not() {
        assert!(
            Capability::AcquireTool {
                tool: Tool::Rag,
                upgrade: false
            }
            .is_machine_acquisition()
        );
        assert!(!Capability::RunMigrations.is_machine_acquisition());
        assert!(Capability::RunMigrations.mutates_project());
        assert!(
            !Capability::AcquireTool {
                tool: Tool::Core,
                upgrade: false
            }
            .mutates_project()
        );
    }

    #[test]
    fn outcome_parses_sync_envelope_on_success() {
        let (state, out) = outcome_value(Some(0), r#"{"status":"created"}"#, false);
        assert_eq!(state, JobState::Succeeded);
        assert_eq!(out["envelope"]["status"], "created");
        assert_eq!(out["outcome_indeterminate"], false);
    }

    #[test]
    fn outcome_failure_on_nonzero_and_breach_is_indeterminate() {
        let (state, _) = outcome_value(Some(1), "boom", false);
        assert_eq!(state, JobState::Failed);
        let (state, out) = outcome_value(None, "killed", true);
        assert_eq!(state, JobState::Failed);
        assert_eq!(out["outcome_indeterminate"], true);
    }

    #[test]
    fn registry_bounds_and_single_flight() {
        let mut reg = Registry::new();
        for i in 0..(MAX_JOBS + 10) {
            reg.insert(Job {
                id: format!("j{i}"),
                label: "install:all".into(),
                target: "/p".into(),
                key: format!("k{i}"),
                state: JobState::Succeeded,
                created: Instant::now(),
                outcome: None,
            });
        }
        assert!(reg.jobs.len() <= MAX_JOBS, "registry stays capped");

        let mut reg = Registry::new();
        reg.insert(Job {
            id: "run1".into(),
            label: "acquire:vaultspec-rag".into(),
            target: "machine".into(),
            key: "machine:acquire:vaultspec-rag".into(),
            state: JobState::Running,
            created: Instant::now(),
            outcome: None,
        });
        assert_eq!(
            reg.running_for("machine:acquire:vaultspec-rag").as_deref(),
            Some("run1")
        );
        assert_eq!(reg.running_for("machine:acquire:vaultspec-core"), None);
    }

    #[test]
    fn running_jobs_are_never_evicted_by_cap() {
        let mut reg = Registry::new();
        for i in 0..(MAX_JOBS + 5) {
            reg.insert(Job {
                id: format!("r{i}"),
                label: "install:all".into(),
                target: "/p".into(),
                key: format!("k{i}"),
                state: JobState::Running,
                created: Instant::now(),
                outcome: None,
            });
        }
        // All running: the cap cannot shed them, so every one survives.
        assert_eq!(reg.jobs.len(), MAX_JOBS + 5);
    }
}
