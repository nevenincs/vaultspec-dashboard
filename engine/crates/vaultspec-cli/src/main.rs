//! The `vaultspec` binary — the unsuffixed umbrella layer of the ecosystem
//! (engine-spec §1).
//!
//! One Rust binary, two front doors: one-shot CLI verbs and a resident
//! `serve` mode (D1.1). Every verb is a thin shell over `engine-query`
//! (D6.1); `--json` envelopes follow core's result vocabulary (D6.2).
//! Strictly read-and-infer: no `.vault/` writes, ever (D1.2).

use clap::{Parser, Subcommand};

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

    /// Scope the query to a worktree path or ref (default: launch worktree).
    #[arg(long, global = true, value_name = "WORKTREE|REF")]
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
        /// Full re-index instead of the incremental, content-hash-keyed pass.
        #[arg(long)]
        full: bool,
    },
    /// Export the linkage graph (node-link JSON, tier-labelled edges).
    Graph {
        /// Filter expression (engine-owned vocabulary).
        #[arg(long)]
        filter: Option<String>,
        /// Render the graph as it stood at a timestamp or commit.
        #[arg(long, value_name = "TS|SHA")]
        as_of: Option<String>,
    },
    /// Node detail / full context assembly.
    Node {
        /// Node id (kind + canonical key).
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
        #[arg(long, value_name = "TS")]
        from: Option<String>,
        #[arg(long, value_name = "TS")]
        to: Option<String>,
        /// Event kinds to include (comma-separated).
        #[arg(long, value_delimiter = ',')]
        kinds: Vec<String>,
        /// Bucketing: auto|raw|1h|1d|…
        #[arg(long)]
        bucket: Option<String>,
    },
    /// Resident mode: single-origin loopback HTTP + JSON + SSE.
    Serve {
        /// Port to bind on loopback; fails loud on conflict.
        #[arg(long, default_value_t = vaultspec_api::DEFAULT_PORT)]
        port: u16,
    },
    /// Index state, backend health rollup, watcher state.
    Status,
}

/// Exit code for not-yet-implemented verbs: distinct from success and from
/// argument errors so scripts can detect the scaffold honestly.
const EXIT_UNIMPLEMENTED: u8 = 3;

fn unimplemented_verb(verb: &str, json: bool) -> u8 {
    if json {
        println!(
            "{}",
            serde_json::json!({
                "ok": false,
                "command": verb,
                "status": "failed",
                "error": "unimplemented",
                "message": format!(
                    "`vaultspec {verb}` is a foundation scaffold; the engine is not yet implemented"
                ),
            })
        );
    } else {
        eprintln!("vaultspec {verb}: not yet implemented (foundation scaffold)");
    }
    EXIT_UNIMPLEMENTED
}

fn main() -> std::process::ExitCode {
    let cli = Cli::parse();
    let code = match cli.command {
        Command::Map => unimplemented_verb("map", cli.json),
        Command::Index { .. } => unimplemented_verb("index", cli.json),
        Command::Graph { .. } => unimplemented_verb("graph", cli.json),
        Command::Node { .. } => unimplemented_verb("node", cli.json),
        Command::Events { .. } => unimplemented_verb("events", cli.json),
        Command::Status => {
            let report = engine_query::QueryCore::new().status();
            if cli.json {
                println!(
                    "{}",
                    serde_json::json!({
                        "ok": true,
                        "command": "status",
                        "status": "success",
                        "data": {
                            "nodes": report.node_count,
                            "edges": report.edge_count,
                            "degradations": report.degradations,
                        },
                    })
                );
            } else {
                println!("vaultspec status (foundation scaffold)");
                println!("  nodes: {}", report.node_count);
                println!("  edges: {}", report.edge_count);
                for d in &report.degradations {
                    println!("  degraded: {d}");
                }
            }
            0
        }
        Command::Serve { port } => {
            let runtime = tokio::runtime::Runtime::new().expect("tokio runtime");
            match runtime.block_on(vaultspec_api::serve(port)) {
                Ok(()) => 0,
                Err(err) => {
                    eprintln!("vaultspec serve: {err}");
                    1
                }
            }
        }
    };
    std::process::ExitCode::from(code)
}
