//! `vaultspec status` — index state, backend health rollup, watcher state
//! (the recovery snapshot family, contract §6).

use serde_json::{Value, json};

use super::{CliError, Ctx};

pub fn run(ctx: &Ctx) -> Result<Value, CliError> {
    // Index state: graph counts from a (cache-warm) pass; store presence.
    let vault_present = ctx.vault_root().is_dir();
    let (nodes, edges, cache_hits, documents) = if vault_present {
        let (graph, stats) = ctx.indexed_graph()?;
        (
            graph.node_count(),
            graph.edge_count(),
            stats.cache_hits,
            stats.documents,
        )
    } else {
        (0, 0, 0, 0)
    };

    // Core reachability (D5.1: loud, never guessed).
    let core = ingest_core::runner::CoreRunner::detect();
    let core_invocation = core.invocation.join(" ");

    // Rag availability (truthful absent/down states, D5.2).
    let rag_reason = ctx.rag_reason();

    // Git status of the active worktree (contract §6, audit G5). Inspect only
    // the active worktree (status-worktree-latency), not every worktree.
    let git = ingest_git::workspace::Workspace::discover(&ctx.root)
        .ok()
        .and_then(|ws| {
            ingest_git::worktrees::inspect_one(&ws, &ctx.root)
                .ok()
                .flatten()
        })
        .map(|wt| json!({"head_ref": wt.head_ref, "dirty": wt.dirty}))
        .unwrap_or(json!(null));

    Ok(json!({
        "scope": super::clean_path(&ctx.root),
        "index": {
            "vault_present": vault_present,
            "documents": documents,
            "nodes": nodes,
            "edges": edges,
            "cache_hits": cache_hits,
            "store": super::clean_path(&engine_store::db_path(&ctx.vault_root())),
        },
        "backends": {
            "core": {"invocation": core_invocation},
            "rag": match &rag_reason {
                None => json!({"available": true}),
                Some(reason) => json!({"available": false, "reason": reason}),
            },
        },
        "git": git,
        // The machine seat (single-app-runtime D5): running state, identity,
        // and the launcher-known workspaces, read from the app home.
        "seat": super::lifecycle::seat_block(),
        // One-shot CLI: no resident watcher by definition (D2.4 — the
        // resident mode is an optimization, not a requirement).
        "watcher": {"running": false, "mode": "one-shot"},
    }))
}
