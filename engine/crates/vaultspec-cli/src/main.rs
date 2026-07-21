//! The `vaultspec` binary — the unsuffixed umbrella layer of the ecosystem
//! (engine-spec §1).
//!
//! One Rust binary, two front doors: one-shot CLI verbs and a resident
//! `serve` mode (D1.1). Every verb is a thin shell over the shared query
//! core (D6.1); `--json` envelopes follow core's result vocabulary (D6.2).
//! Strictly read-and-infer: no `.vault/` writes, ever (D1.2).

mod cmd;
mod envelope;

use clap::{Parser, Subcommand};
use serde_json::Value;

use cmd::Ctx;

#[derive(Parser)]
#[command(
    name = "vaultspec",
    version,
    about = "Relationship / context aggregation engine for the vaultspec ecosystem",
    long_about = "Headless, read-and-infer engine: ingests core's vault graph, the git \
                  object database, working trees, and rag's semantic indexes, and produces \
                  a unified, tiered, provenance-carrying linkage graph plus context assemblies."
)]
struct Cli {
    /// Emit a machine-readable JSON envelope (core's result vocabulary).
    #[arg(long, global = true)]
    json: bool,

    /// Scope the query to a worktree path (default: launch worktree).
    #[arg(long, global = true, value_name = "WORKTREE")]
    scope: Option<String>,

    /// Omitted entirely = the app front door (`vaultspec open`).
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand)]
enum Command {
    /// Map the landscape: repository, branches, worktrees, corpus views.
    Map,
    /// Run or refresh the index pipeline (incremental by default).
    Index {
        /// Force full re-extraction instead of the content-hash skip.
        #[arg(long)]
        full: bool,
    },
    /// Export the linkage graph (node-link JSON, tier-labelled edges).
    Graph {
        /// Filter object (engine-owned vocabulary), as JSON.
        #[arg(long)]
        filter: Option<String>,
        /// Render the graph as it stood at a ref or commit (blob-true).
        #[arg(long, value_name = "REF|SHA")]
        as_of: Option<String>,
        /// `document` (doc-level edges) or `feature` (engine-aggregated
        /// meta-edges — the constellation surface, contract §4).
        #[arg(long, default_value = "document")]
        granularity: String,
    },
    /// Node detail / full context assembly.
    Node {
        /// Node id (kind:key, e.g. `doc:2026-06-12-x-plan`).
        id: String,
        /// Assemble the node's full tier-labelled context bundle.
        #[arg(long)]
        context: bool,
        /// Restrict to specific provenance tiers (comma-separated).
        #[arg(long, value_delimiter = ',')]
        tiers: Vec<String>,
    },
    /// The temporal event stream (commits, doc events, lifecycle events).
    Events {
        /// Range start, ms since epoch.
        #[arg(long)]
        from: Option<i64>,
        /// Range end, ms since epoch.
        #[arg(long)]
        to: Option<i64>,
        /// Event kinds to include (comma-separated).
        #[arg(long, value_delimiter = ',')]
        kinds: Vec<String>,
        /// Bucketing: raw|auto|30s|15m|1h|1d (default raw).
        #[arg(long)]
        bucket: Option<String>,
    },
    /// Resident mode: single-origin loopback HTTP + JSON + SSE.
    Serve {
        /// Port to bind on loopback; an EXPLICIT port fails loud on
        /// conflict. Omitted, the app prefers the well-known port and falls
        /// back to an ephemeral one (discovery advertises the real port).
        #[arg(long)]
        port: Option<u16>,
        /// Skip the machine seat lock and machine discovery (dev/test escape
        /// hatch; `--port 0` implies it). The workspace-local discovery file
        /// is still written, byte-compatible with the pre-seat contract.
        #[arg(long)]
        no_seat: bool,
    },
    /// Index state, backend health rollup, watcher state, seat state.
    Status,
    /// Open the vaultspec app: attach to the running instance (or start it
    /// detached) and open the dashboard in your browser. Bare `vaultspec`
    /// does the same.
    Open,
    /// Provision the framework and companion tools for the current project.
    Provision {
        #[command(subcommand)]
        action: Option<ProvisionCommand>,
    },
    /// Gracefully stop the running vaultspec app (idempotent).
    Stop,
    /// Stop the running app (if any) and relaunch it detached.
    Restart,
    /// Self-update a receipt-marked install (stop, update, relaunch).
    /// Package-manager installs are refused with their own remediation.
    Update,
    /// The dashboard-owned A2A companion lifecycle: bounded status and
    /// mutation subcommands over the typed product authority — no free-form
    /// executable or path operands (a2a-product-provisioning W02.P04.S47).
    A2a {
        #[command(subcommand)]
        action: A2aAction,
    },
    /// Verify an installed product tree matches its own `release.json` under the
    /// embedded trusted component lock — the product-owned installers' placement
    /// integrity check (a2a-product-provisioning W04.P09). No corpus is consulted.
    VerifyRelease {
        /// The installed product-tree root (the generation directory).
        root: std::path::PathBuf,
    },
}

/// The bounded A2A lifecycle actions. A closed enum — clap rejects any token
/// outside this set, so the verb selects semantic intent, never a free-form
/// path or executable.
#[derive(Subcommand)]
enum A2aAction {
    /// The A2A product status + ownership projection (read-only).
    Status,
    /// Read-only readiness and ownership diagnosis.
    Doctor,
    /// Authenticate and stop the running owned gateway.
    Stop,
    /// Remove owned generations and receipts, preserving user data.
    Remove,
}

impl From<&A2aAction> for cmd::a2a_lifecycle::Action {
    fn from(a: &A2aAction) -> Self {
        match a {
            A2aAction::Status => cmd::a2a_lifecycle::Action::Status,
            A2aAction::Doctor => cmd::a2a_lifecycle::Action::Doctor,
            A2aAction::Stop => cmd::a2a_lifecycle::Action::Stop,
            A2aAction::Remove => cmd::a2a_lifecycle::Action::Remove,
        }
    }
}

#[derive(Subcommand)]
enum ProvisionCommand {
    /// The provisioning projection: managed / installable / migratable state.
    Status,
    /// Install the framework into the project.
    Install {
        /// Provider scaffolding to install: all|core|claude|gemini|antigravity|codex.
        #[arg(long)]
        provider: String,
        /// Overwrite existing provider output (requires --confirm).
        #[arg(long)]
        force: bool,
        /// Typed confirm token a --force requires.
        #[arg(long)]
        confirm: Option<String>,
    },
    /// Upgrade the framework's provider scaffolding.
    Upgrade {
        /// Provider scaffolding to upgrade: all|core|claude|gemini|antigravity|codex.
        #[arg(long)]
        provider: String,
    },
    /// Run the project's pending schema migrations.
    Migrate,
    /// Acquire (or upgrade) a machine-level companion tool.
    Acquire {
        /// Tool to acquire: core|rag.
        #[arg(long)]
        tool: String,
        /// Upgrade an already-installed tool.
        #[arg(long)]
        upgrade: bool,
    },
}

fn render(ctx: &Ctx, command_name: &str, result: Result<Value, cmd::CliError>) -> u8 {
    // Declared reflects the precise ingestion outcome for indexing verbs, or
    // a core-reachability fallback for verbs that build no graph.
    let tiers = envelope::tiers_json(
        ctx.rag_reason().as_deref(),
        ctx.declared_reason().as_deref(),
    );
    match result {
        Ok(data) => {
            if ctx.json {
                envelope::emit_json(&envelope::ok(command_name, data, tiers));
            } else {
                // Human rendering: the same payload, pretty-printed —
                // verbs are agent-facing first (engine-spec §6).
                envelope::emit_json(&data);
            }
            0
        }
        Err(error) => {
            // Tier block on EVERY response, failures included (audit G1);
            // typed exit codes — scope/corpus errors are usage-class 2.
            if ctx.json {
                envelope::emit_json(&envelope::fail(
                    command_name,
                    error.kind(),
                    &error.to_string(),
                    tiers,
                ));
            } else {
                eprintln!("vaultspec {command_name}: {error}");
            }
            error.exit_code()
        }
    }
}

/// Split a machine-verb payload into (data, tiers). A payload that already
/// rides the served envelope keeps its OWN tiers truth (the provisioning
/// plane's); anything else gets the honest not-applicable block.
fn split_envelope(payload: Value) -> (Value, Value) {
    match (payload.get("data"), payload.get("tiers")) {
        (Some(data), Some(tiers)) => (data.clone(), tiers.clone()),
        _ => (
            payload,
            envelope::tiers_json(
                Some("machine-lifecycle verb: no corpus consulted"),
                Some("machine-lifecycle verb: no corpus consulted"),
            ),
        ),
    }
}

fn run_provision(action: Option<ProvisionCommand>) -> Result<Value, String> {
    let invocation = match action {
        None | Some(ProvisionCommand::Status) => None,
        Some(ProvisionCommand::Install {
            provider,
            force,
            confirm,
        }) => Some(cmd::provision::ProvisionInvocation {
            action: "install",
            provider: Some(provider),
            tool: None,
            upgrade: false,
            force,
            confirm,
        }),
        Some(ProvisionCommand::Upgrade { provider }) => Some(cmd::provision::ProvisionInvocation {
            action: "upgrade",
            provider: Some(provider),
            tool: None,
            upgrade: false,
            force: false,
            confirm: None,
        }),
        Some(ProvisionCommand::Migrate) => Some(cmd::provision::ProvisionInvocation {
            action: "migrate",
            provider: None,
            tool: None,
            upgrade: false,
            force: false,
            confirm: None,
        }),
        Some(ProvisionCommand::Acquire { tool, upgrade }) => {
            Some(cmd::provision::ProvisionInvocation {
                action: "acquire",
                provider: None,
                tool: Some(tool),
                upgrade,
                force: false,
                confirm: None,
            })
        }
    };
    cmd::provision::run(invocation)
}

fn main() -> std::process::ExitCode {
    let cli = Cli::parse();
    // Bare invocation (a double-click, or plain `vaultspec`) IS the app
    // front door (single-app-runtime D2): identical to the explicit `open`.
    let command = cli.command.unwrap_or(Command::Open);

    // Serve mode short-circuits: it owns its own lifecycle. The global
    // `--scope` selects the served worktree (else the launch directory).
    if let Command::Serve { port, no_seat } = command {
        let runtime = tokio::runtime::Runtime::new().expect("tokio runtime");
        return match runtime.block_on(vaultspec_api::serve(port, cli.scope, no_seat)) {
            Ok(()) => std::process::ExitCode::SUCCESS,
            Err(err) => {
                eprintln!("vaultspec serve: {err}");
                std::process::ExitCode::FAILURE
            }
        };
    }

    // Machine-lifecycle verbs (single-app-runtime D5) are workspace-free:
    // they read the seat's machine discovery, never a scope, so they run
    // BEFORE scope resolution. Their tiers block honestly marks the backend
    // tiers not-applicable — no corpus is consulted.
    if matches!(
        command,
        Command::Open
            | Command::Stop
            | Command::Restart
            | Command::Update
            | Command::Provision { .. }
            | Command::A2a { .. }
            | Command::VerifyRelease { .. }
    ) {
        let (name, result) = match command {
            Command::Open => ("open", cmd::launch::open_app()),
            Command::Stop => ("stop", cmd::lifecycle::stop()),
            Command::Restart => ("restart", cmd::lifecycle::restart()),
            Command::Update => ("update", cmd::lifecycle::update()),
            Command::Provision { action } => ("provision", run_provision(action)),
            Command::A2a { action } => ("a2a", cmd::a2a_lifecycle::run((&action).into())),
            Command::VerifyRelease { root } => ("verify-release", cmd::verify_release::run(&root)),
            _ => unreachable!(),
        };
        // Provision results carry the plane's own served tiers; lifecycle
        // verbs honestly mark the backend tiers not-applicable.
        return match result {
            Ok(payload) => {
                let (data, tiers) = split_envelope(payload);
                if cli.json {
                    envelope::emit_json(&envelope::ok(name, data, tiers));
                } else {
                    envelope::emit_json(&data);
                }
                std::process::ExitCode::SUCCESS
            }
            Err(message) => {
                if cli.json {
                    let tiers = envelope::tiers_json(
                        Some("machine verb refused before any corpus read"),
                        Some("machine verb refused before any corpus read"),
                    );
                    envelope::emit_json(&envelope::fail(name, "lifecycle", &message, tiers));
                } else {
                    eprintln!("vaultspec {name}: {message}");
                }
                std::process::ExitCode::FAILURE
            }
        };
    }

    // The envelope names the INVOKED verb even on resolve failure (audit
    // rider): scope errors belong to the command the user ran.
    let command_name = match &command {
        Command::Map => "map",
        Command::Index { .. } => "index",
        Command::Graph { .. } => "graph",
        Command::Node { .. } => "node",
        Command::Events { .. } => "events",
        Command::Status => "status",
        Command::Serve { .. } => "serve",
        Command::Open
        | Command::Stop
        | Command::Restart
        | Command::Update
        | Command::Provision { .. }
        | Command::A2a { .. }
        | Command::VerifyRelease { .. } => {
            unreachable!("handled above")
        }
    };
    let ctx = match Ctx::resolve(cli.scope.as_deref(), cli.json) {
        Ok(ctx) => ctx,
        Err(error) => {
            if cli.json {
                envelope::emit_json(&envelope::fail(
                    command_name,
                    error.kind(),
                    &error.to_string(),
                    // No resolved scope yet: tier availability is unknown,
                    // stated as degraded with the reason on both backend
                    // tiers (semantic + declared).
                    envelope::tiers_json(Some("scope unresolved"), Some("scope unresolved")),
                ));
            } else {
                eprintln!("vaultspec {command_name}: {error}");
            }
            return std::process::ExitCode::from(error.exit_code());
        }
    };

    let code = match &command {
        Command::Map => render(&ctx, "map", cmd::map::run(&ctx)),
        Command::Index { full } => render(&ctx, "index", cmd::index::run(&ctx, *full)),
        Command::Graph {
            filter,
            as_of,
            granularity,
        } => render(
            &ctx,
            "graph",
            cmd::graph::run(&ctx, filter.as_deref(), as_of.as_deref(), granularity),
        ),
        Command::Node { id, context, tiers } => {
            render(&ctx, "node", cmd::node::run(&ctx, id, *context, tiers))
        }
        Command::Events {
            from,
            to,
            kinds,
            bucket,
        } => render(
            &ctx,
            "events",
            cmd::events::run(&ctx, *from, *to, kinds, bucket.as_deref()),
        ),
        Command::Status => render(&ctx, "status", cmd::status::run(&ctx)),
        Command::Serve { .. }
        | Command::Open
        | Command::Stop
        | Command::Restart
        | Command::Update
        | Command::Provision { .. }
        | Command::A2a { .. }
        | Command::VerifyRelease { .. } => {
            unreachable!("handled above")
        }
    };
    std::process::ExitCode::from(code)
}
