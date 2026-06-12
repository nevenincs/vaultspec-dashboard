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
    // Core's sync vocabulary on a mutating verb (D6.2, audit G2): items
    // report unchanged/updated per document; created/removed are
    // inapplicable to a rebuild-from-truth pipeline (interpretation
    // recorded in the S47 step record).
    let items: Vec<Value> = stats
        .outcomes
        .iter()
        .map(|(path, outcome)| json!({"path": path, "status": outcome}))
        .collect();
    Ok(json!({
        "mode": if full { "full" } else { "incremental" },
        "status": if stats.extracted == 0 { "unchanged" } else { "mixed" },
        "counts": {
            "unchanged": stats.cache_hits,
            "updated": stats.extracted,
        },
        "items": items,
        "documents": stats.documents,
        "edges": stats.edges,
        "nodes": graph.node_count(),
    }))
}
