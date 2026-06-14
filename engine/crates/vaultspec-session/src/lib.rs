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
pub mod store;

pub use session::{MAX_RECENTS, ScopeContext};
pub use settings::Setting;
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
