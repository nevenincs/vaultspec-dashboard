//! `vaultspec-session` — the co-resident orchestration crate that owns durable
//! session and settings user-state.
//!
//! # The read-and-infer fence (load-bearing)
//!
//! This crate is the sanctioned "builds beside" layer the foundation contract
//! reserved (§9) and the `user-state-persistence` ADR realized. It is the ONLY
//! crate in the `engine/` workspace permitted to hold durable session/settings
//! state and persist its OWN SQLite file. It inherits — and never relaxes — the
//! same hard prohibitions the inference crates carry:
//!
//! - it **never writes `.vault/` documents**;
//! - it **never mutates git refs, trees, or config**;
//! - it **never grows sibling vault-CRUD or search semantics** — those stay in
//!   `vaultspec-core` / `vaultspec-rag`, reached over the existing bounded
//!   `--json` subprocess seam elsewhere.
//!
//! All this crate persists is its own user-state in
//! `.vault/data/engine-data/user-state.sqlite3` — a SEPARATE file from the
//! engine's re-derivable cache (`engine.sqlite3`), so the cache's self-heal can
//! never wipe user state as a side effect. The inference crates
//! (`engine-graph`, `engine-query`, `engine-store`, the `ingest-*` crates) and
//! the serve read path remain strictly read-and-infer and are untouched by this
//! crate.
//!
//! # Posture
//!
//! Persistence is **best-effort** per the prototype direction: a corrupt or
//! shape-mismatched store is recreated empty (see [`store::Store::open_or_heal`]),
//! exactly like the re-derivable cache. There is nothing precious here, so there
//! is no fail-loud migration ceremony and no back-up-aside.
//!
//! # Handle
//!
//! [`UserState`] is the public handle: open it from a vault root with
//! [`UserState::open`], then read and write the session ([`session`]) and
//! settings ([`settings`]) domains through it.

use std::path::Path;

pub mod schema;
pub mod session;
pub mod settings;
pub mod settings_schema;
pub mod store;

pub use schema::WorkspaceRoot;
pub use session::{MAX_RECENTS, RegistryError, ScopeContext};
pub use settings::Setting;
pub use settings_schema::{ControlKind, SettingDef, SettingType, ValidationError};
pub use store::{Result, Store, StoreError};

/// The public user-state handle, tying the best-effort store together with the
/// session and settings domains. Open one per process per workspace.
///
/// The session/settings read and write methods live on the wrapped [`Store`]
/// (one `impl` block per domain module); access them via [`UserState::store`]
/// or the convenience delegators below.
#[derive(Debug)]
pub struct UserState {
    store: Store,
}

impl UserState {
    /// Open (and best-effort heal) the user-state store for a workspace's vault
    /// root, located beside `service.json` in `.vault/data/engine-data/`.
    pub fn open(vault_root: &Path) -> Result<Self> {
        Ok(Self {
            store: Store::open_or_heal(vault_root)?,
        })
    }

    /// Borrow the wrapped store to reach the full session and settings domain
    /// surface defined in the [`session`] and [`settings`] modules.
    pub fn store(&self) -> &Store {
        &self.store
    }

    // --- session convenience delegators -------------------------------------

    /// The active scope of a workspace, if set.
    pub fn active_scope(&self, workspace: &str) -> Result<Option<String>> {
        self.store.active_scope(workspace)
    }

    /// Set the active scope of a workspace.
    pub fn set_active_scope(&self, workspace: &str, scope: &str, now: i64) -> Result<()> {
        self.store.set_active_scope(workspace, scope, now)
    }

    /// A scope's active folder and its feature-tag contexts.
    pub fn scope_context(&self, workspace: &str, scope: &str) -> Result<ScopeContext> {
        self.store.scope_context(workspace, scope)
    }

    /// Set a scope's active folder and feature-tag contexts.
    pub fn set_scope_context(
        &self,
        workspace: &str,
        scope: &str,
        context: &ScopeContext,
        now: i64,
    ) -> Result<()> {
        self.store.set_scope_context(workspace, scope, context, now)
    }

    /// Push a value onto the workspace recents (most-recent-first, deduped,
    /// bounded).
    pub fn push_recent(&self, workspace: &str, value: &str) -> Result<()> {
        self.store.push_recent(workspace, value)
    }

    /// The workspace recents, most-recent-first.
    pub fn recents(&self, workspace: &str) -> Result<Vec<String>> {
        self.store.recents(workspace)
    }

    /// Push a (workspace, scope) pair onto the machine-global cross-project
    /// recents (most-recent-first, deduped, bounded).
    pub fn push_global_recent(&self, workspace: &str, scope: &str) -> Result<()> {
        self.store.push_global_recent(workspace, scope)
    }

    /// The machine-global cross-project recents as `(workspace, scope)` pairs,
    /// most-recent-first.
    pub fn global_recents(&self) -> Result<Vec<(String, String)>> {
        self.store.global_recents()
    }

    /// Remove one (workspace, scope) entry from the machine-global recents.
    pub fn remove_global_recent(&self, workspace: &str, scope: &str) -> Result<()> {
        self.store.remove_global_recent(workspace, scope)
    }

    /// Clear the entire machine-global recents list.
    pub fn clear_global_recents(&self) -> Result<()> {
        self.store.clear_global_recents()
    }

    // --- workspace-registry convenience delegators --------------------------
    //
    // The registry of WHICH project roots exist (dashboard-workspace-registry
    // ADR). All read-only over repository content: registering, selecting, and
    // forgetting write only config rows in this best-effort store.

    /// List the registered project roots in their stable registry order.
    pub fn list_roots(&self) -> Result<Vec<WorkspaceRoot>> {
        self.store.list_roots()
    }

    /// One registered root by its stable id, if present.
    pub fn root(&self, id: &str) -> Result<Option<WorkspaceRoot>> {
        self.store.root(id)
    }

    /// Register (upsert) a project root. CONFIG write only — never mutates a
    /// repository.
    pub fn add_root(&self, root: &WorkspaceRoot, now: i64) -> Result<()> {
        self.store.add_root(root, now)
    }

    /// Auto-register the launch workspace as the FIRST root on first run
    /// (dashboard-workspace-registry ADR, S03), so the single-project experience
    /// is unchanged: a fresh (or best-effort-recreated) registry seeds the
    /// launch workspace as the launch-default root, and a registry that already
    /// holds the launch id is left untouched (idempotent — a reboot does not
    /// re-seed or reorder).
    ///
    /// The caller derives the stable `id` from the discovered git common dir and
    /// the canonical `path`/`label` (the session crate stays git-free under the
    /// read-and-infer fence). This RECORDS the launch root only; it never mutates
    /// the repository. Returns the launch root (whether freshly seeded or
    /// already present).
    pub fn auto_register_launch(
        &self,
        id: &str,
        label: &str,
        path: &str,
        now: i64,
    ) -> Result<WorkspaceRoot> {
        if let Some(existing) = self.store.root(id)? {
            return Ok(existing);
        }
        let launch = WorkspaceRoot {
            id: id.to_string(),
            label: label.to_string(),
            path: path.to_string(),
            is_launch: true,
            reachable: true,
            unreachable_reason: None,
        };
        self.store.add_root(&launch, now)?;
        Ok(launch)
    }

    /// Update a root's last-seen reachability state and degradation reason.
    pub fn set_root_reachability(
        &self,
        id: &str,
        reachable: bool,
        reason: Option<&str>,
        now: i64,
    ) -> Result<()> {
        self.store.set_root_reachability(id, reachable, reason, now)
    }

    /// Forget a registered root. CONFIG delete only — never touches disk; the
    /// last launch root is refused.
    pub fn forget_root(&self, id: &str) -> Result<std::result::Result<(), RegistryError>> {
        self.store.forget_root(id)
    }

    /// The active workspace id, if one has been selected.
    pub fn active_workspace(&self) -> Result<Option<String>> {
        self.store.active_workspace()
    }

    /// Select the active workspace (config write).
    pub fn set_active_workspace(&self, id: &str, now: i64) -> Result<()> {
        self.store.set_active_workspace(id, now)
    }

    // --- settings convenience delegators ------------------------------------

    /// A global setting value, if set.
    pub fn global_setting(&self, key: &str) -> Result<Option<String>> {
        self.store.global_setting(key)
    }

    /// Set a global setting value.
    pub fn set_global_setting(&self, key: &str, value: &str, now: i64) -> Result<()> {
        self.store.set_global_setting(key, value, now)
    }

    /// A scope-scoped setting value, if set (no implicit global fallback).
    pub fn scoped_setting(&self, scope: &str, key: &str) -> Result<Option<String>> {
        self.store.scoped_setting(scope, key)
    }

    /// Set a scope-scoped setting value.
    pub fn set_scoped_setting(&self, scope: &str, key: &str, value: &str, now: i64) -> Result<()> {
        self.store.set_scoped_setting(scope, key, value, now)
    }

    /// List a scope's settings, ordered by key.
    pub fn list_settings(&self, scope: &str) -> Result<Vec<Setting>> {
        self.store.list_settings(scope)
    }
}
