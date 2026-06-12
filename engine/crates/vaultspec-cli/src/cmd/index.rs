//! `vaultspec index [--full]` — run the index pipeline; incremental and
//! content-hash skip-heavy by default (D2.4), `--full` forces
//! re-extraction (and converges to the incremental graph, D8.2).

use serde_json::{Value, json};

use super::{CliError, Ctx, now_ms};

pub fn run(ctx: &Ctx, full: bool) -> Result<Value, CliError> {
    ctx.require_vault()?;
    let store = ctx.open_store()?;
    let (graph, stats) = if full {
        engine_graph::index::index_worktree_full(&ctx.root, &ctx.scope, &store, now_ms())?
    } else {
        engine_graph::index::index_worktree(&ctx.root, &ctx.scope, &store, now_ms())?
    };
    Ok(json!({
        "mode": if full { "full" } else { "incremental" },
        "documents": stats.documents,
        "cache_hits": stats.cache_hits,
        "extracted": stats.extracted,
        "edges": stats.edges,
        "nodes": graph.node_count(),
    }))
}
