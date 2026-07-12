//! One-shot CLI provisioning verbs (single-app-runtime D6): the terminal gets
//! the same provisioning mouth the GUI has.
//!
//! Every verb drives the engine's own provisioning plane IN-PROCESS through
//! the `routes::provision` CLI facade — the same DTO validation, the same
//! typed capability construction, the same bounded single-flight job broker
//! the wire uses — so the terminal, the boot log, and the GUI cannot
//! disagree about component floors, install state, or remediation.
//!
//! Target discipline: a MANAGED workspace (`.vault` present) hosts its own
//! state, exactly like every other one-shot verb. A NOT-YET-managed root —
//! the provision plane's whole point — must never be scaffolded by the
//! engine (`build_state` would create `.vault/data`), so it is targeted the
//! same way the GUI targets it: registered as a root in an engine-owned
//! state (the bootstrap corpus under the app home) and resolved through the
//! registry, never a free-form path.

use serde_json::{Value, json};
use vaultspec_session::app_home;

/// The parsed `vaultspec provision ...` invocation, mapped 1:1 onto the wire
/// DTO grammar (the facade re-validates through the same serde types).
pub struct ProvisionInvocation {
    pub action: &'static str,
    pub provider: Option<String>,
    pub tool: Option<String>,
    pub upgrade: bool,
    pub force: bool,
    pub confirm: Option<String>,
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Run a provisioning verb over the launch workspace, one-shot. `None`
/// invocation = the status projection.
pub fn run(invocation: Option<ProvisionInvocation>) -> Result<Value, String> {
    let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
    let root = super::launch::resolve_containing_root(&cwd).ok_or_else(|| {
        format!(
            "`{}` is not inside a git workspace; run provision from the \
             project you want provisioned",
            cwd.display()
        )
    })?;

    // Managed root: host state in the project itself (the one-shot default).
    // Unmanaged root: host state in the engine-owned bootstrap corpus and
    // target the project THROUGH the registry, so the engine never scaffolds
    // `.vault/` into a repository it does not manage.
    let (state, workspace_target) = if root.join(".vault").is_dir() {
        (vaultspec_api::app::build_state(root), None)
    } else {
        let home = app_home::app_home_dir()
            .ok_or("no home directory resolvable for the provisioning host state")?;
        let bootstrap = vaultspec_api::bootstrap_root(&home).map_err(|e| e.to_string())?;
        let state = vaultspec_api::app::build_state(bootstrap);
        let id = ingest_git::workspace::Workspace::discover(&root)
            .map(|ws| engine_model::scope_token(&ws.common_dir))
            .map_err(|e| format!("workspace discovery failed: {e}"))?;
        let label = root
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        {
            let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
            us.auto_register_launch(&id, &label, &root.to_string_lossy(), now_ms())
                .map_err(|e| format!("target registration failed: {e}"))?;
        }
        (state, Some(id))
    };

    let runtime = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
    let result = runtime.block_on(async {
        match invocation {
            None => vaultspec_api::routes::provision::cli_status(state, workspace_target).await,
            Some(inv) => {
                let request = json!({
                    "action": inv.action,
                    "provider": inv.provider,
                    "tool": inv.tool,
                    "upgrade": inv.upgrade,
                    "force": inv.force,
                    "confirm": inv.confirm,
                    "workspace": workspace_target,
                });
                vaultspec_api::routes::provision::cli_run(state, request).await
            }
        }
    });
    result.map_err(|refusal| {
        refusal
            .get("error")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| refusal.to_string())
    })
}
