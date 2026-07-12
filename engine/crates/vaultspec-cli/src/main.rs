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

    #[command(subcommand)]
    command: Command,
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
        /// Port to bind on loopback; fails loud on conflict.
        #[arg(long, default_value_t = vaultspec_api::DEFAULT_PORT)]
        port: u16,
        /// Skip the machine seat lock and machine discovery (dev/test escape
        /// hatch; `--port 0` implies it). The workspace-local discovery file
        /// is still written, byte-compatible with the pre-seat contract.
        #[arg(long)]
        no_seat: bool,
    },
    /// Index state, backend health rollup, watcher state, seat state.
    Status,
    /// Gracefully stop the running vaultspec app (idempotent).
    Stop,
    /// Stop the running app (if any) and relaunch it detached.
    Restart,
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

fn main() -> std::process::ExitCode {
    let cli = Cli::parse();

    // Serve mode short-circuits: it owns its own lifecycle. The global
    // `--scope` selects the served worktree (else the launch directory).
    if let Command::Serve { port, no_seat } = cli.command {
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
    if matches!(cli.command, Command::Stop | Command::Restart) {
        let (name, result) = match cli.command {
            Command::Stop => ("stop", cmd::lifecycle::stop()),
            Command::Restart => ("restart", cmd::lifecycle::restart()),
            _ => unreachable!(),
        };
        let tiers = envelope::tiers_json(
            Some("machine-lifecycle verb: no corpus consulted"),
            Some("machine-lifecycle verb: no corpus consulted"),
        );
        return match result {
            Ok(data) => {
                if cli.json {
                    envelope::emit_json(&envelope::ok(name, data, tiers));
                } else {
                    envelope::emit_json(&data);
                }
                std::process::ExitCode::SUCCESS
            }
            Err(message) => {
                if cli.json {
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
    let command_name = match &cli.command {
        Command::Map => "map",
        Command::Index { .. } => "index",
        Command::Graph { .. } => "graph",
        Command::Node { .. } => "node",
        Command::Events { .. } => "events",
        Command::Status => "status",
        Command::Serve { .. } => "serve",
        Command::Stop | Command::Restart => unreachable!("handled above"),
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

    let code = match &cli.command {
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
        Command::Serve { .. } | Command::Stop | Command::Restart => {
            unreachable!("handled above")
        }
    };
    std::process::ExitCode::from(code)
}
