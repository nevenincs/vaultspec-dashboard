//! `vaultspec map` — the §2 landscape: repository, branches, worktrees,
//! corpus views, advisory classification.

use ingest_git::branches::{BranchClass, ClassifyConfig, local_branches, remote_refs};
use ingest_git::workspace::Workspace;
use ingest_git::worktrees::enumerate;
use serde_json::{Value, json};

use super::{CliError, Ctx, clean_path};

fn class_name(class: BranchClass) -> &'static str {
    match class {
        BranchClass::Default => "default",
        BranchClass::Feature => "feature",
        BranchClass::Other => "other",
    }
}

pub fn run(ctx: &Ctx) -> Result<Value, CliError> {
    let workspace = Workspace::discover(&ctx.root)?;
    let config = ClassifyConfig::default();

    let worktrees: Vec<Value> = enumerate(&workspace)?
        .into_iter()
        .map(|wt| {
            let has_vault = wt.path.join(".vault").is_dir();
            json!({
                "path": clean_path(&wt.path),
                "head_ref": wt.head_ref,
                "dirty": wt.dirty,
                "is_main": wt.is_main,
                "has_vault": has_vault,
                // The launch scope is advisory only (contract §3).
                "is_launch_default": clean_path(&wt.path) == clean_path(&ctx.root),
            })
        })
        .collect();

    let branches: Vec<Value> = local_branches(&workspace, &config)?
        .into_iter()
        .map(|b| json!({"name": b.name, "class": class_name(b.class), "remote": false}))
        .collect();
    let remotes: Vec<Value> = remote_refs(&workspace, &config)?
        .into_iter()
        .map(|b| {
            json!({
                "name": b.name,
                "class": class_name(b.class),
                "remote": true,
                // Degraded scope, D2.2: no working tree to resolve against.
                "degraded": b.degraded_tiers,
            })
        })
        .collect();

    // Corpus views (engine-spec §2.3, audit G3): each (workspace,
    // worktree) pair under which a vault corpus exists.
    let corpus_views: Vec<Value> = worktrees
        .iter()
        .filter(|wt| wt["has_vault"].as_bool().unwrap_or(false))
        .map(|wt| {
            json!({
                "worktree": wt["path"],
                "vault_root": format!("{}/.vault", wt["path"].as_str().unwrap_or_default()),
                "head_ref": wt["head_ref"],
            })
        })
        .collect();

    Ok(json!({
        "workspace": clean_path(&workspace.common_dir),
        "worktrees": worktrees,
        "branches": branches,
        "remote_refs": remotes,
        "corpus_views": corpus_views,
    }))
}
