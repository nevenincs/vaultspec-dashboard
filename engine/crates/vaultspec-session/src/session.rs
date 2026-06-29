//! The session domain: active workspace scope, per-scope folder and
//! feature-tag contexts, and a bounded recents list.
//!
//! The session is the "where am I and what am I looking at" state the
//! dashboard restores on load instead of recomputing a default
//! (user-state-persistence ADR). It persists ONLY its own rows in the
//! best-effort store; it never writes `.vault/` documents or mutates git.

use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::schema::{ACTIVE_WORKSPACE_KEY, GLOBAL_SCOPE, WorkspaceRoot};
use crate::store::{Result, Store};

/// How many recent selections are retained per workspace; older entries past
/// this bound are dropped on write.
pub const MAX_RECENTS: usize = 50;

/// The error a read-only registry mutation returns when the operator's action
/// is refused (the launch workspace cannot be forgotten while it is the only
/// root). This is a CONFIG-level refusal, never a disk operation — `forget`
/// removes a registry row and never touches the repository on disk.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum RegistryError {
    #[error("the launch workspace cannot be forgotten while it is the only registered root")]
    LastLaunchRoot,
}

/// A scope's "current folder and its contexts": the active vault folder plus
/// the feature-tag contexts scoped to it. Built on the existing `feature_tags`
/// grouping primitive, not a new node schema.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScopeContext {
    /// The active vault folder for this scope (a `/vault-tree` subtree path),
    /// or `None` when nothing is selected.
    #[serde(default)]
    pub active_folder: Option<String>,
    /// The feature-tag contexts associated with the active folder.
    #[serde(default)]
    pub feature_tags: Vec<String>,
    /// The serialized dock workspace layout (editor-dock-workspace): an opaque
    /// JSON string carrying the open-document tab set + active tab for this scope.
    /// Persisted here (the durable per-scope session blob, SQLite-backed) so the
    /// workspace restores across reloads AND engine restarts, unlike the in-memory
    /// dashboard-state. The engine treats it as an opaque blob (read-and-infer; it
    /// owns no GUI semantics); the stores layer serializes/parses it. `None` until
    /// the workspace first persists a layout.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_layout: Option<String>,
}

impl Store {
    /// Get the active scope of a workspace, if one has been set. Stored under
    /// the `GLOBAL_SCOPE` sentinel row's blob.
    pub fn active_scope(&self, workspace: &str) -> Result<Option<String>> {
        let raw: Option<String> = self
            .conn()
            .query_row(
                "SELECT blob FROM session WHERE workspace = ?1 AND scope = ?2",
                params![workspace, GLOBAL_SCOPE],
                |r| r.get(0),
            )
            .optional()?;
        match raw {
            Some(s) if !s.is_empty() => Ok(Some(s)),
            _ => Ok(None),
        }
    }

    /// Set (or clear, with an empty string) the active scope of a workspace.
    pub fn set_active_scope(&self, workspace: &str, scope: &str, now: i64) -> Result<()> {
        self.conn().execute(
            "INSERT INTO session (workspace, scope, blob, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(workspace, scope) DO UPDATE SET blob = ?3, updated_at = ?4",
            params![workspace, GLOBAL_SCOPE, scope, now],
        )?;
        Ok(())
    }

    /// Get a scope's folder + feature-tag context. A missing row is the
    /// default (no folder, no tags), matching the corrupt-reads-as-default
    /// tolerance the localStorage surfaces already use.
    pub fn scope_context(&self, workspace: &str, scope: &str) -> Result<ScopeContext> {
        let raw: Option<String> = self
            .conn()
            .query_row(
                "SELECT blob FROM session WHERE workspace = ?1 AND scope = ?2",
                params![workspace, scope],
                |r| r.get(0),
            )
            .optional()?;
        match raw {
            Some(s) => Ok(serde_json::from_str(&s).unwrap_or_default()),
            None => Ok(ScopeContext::default()),
        }
    }

    /// Set a scope's folder + feature-tag context.
    pub fn set_scope_context(
        &self,
        workspace: &str,
        scope: &str,
        context: &ScopeContext,
        now: i64,
    ) -> Result<()> {
        let blob = serde_json::to_string(context)?;
        self.conn().execute(
            "INSERT INTO session (workspace, scope, blob, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(workspace, scope) DO UPDATE SET blob = ?3, updated_at = ?4",
            params![workspace, scope, blob, now],
        )?;
        Ok(())
    }

    /// Push a value to the front of the workspace recents: most-recent-first,
    /// deduped (an existing copy is moved to the front), bounded to
    /// `MAX_RECENTS`. The list is renumbered from 0 on each push so the
    /// `position` order is dense and monotonic.
    pub fn push_recent(&self, workspace: &str, value: &str) -> Result<()> {
        let mut current = self.recents(workspace)?;
        current.retain(|v| v != value);
        current.insert(0, value.to_string());
        current.truncate(MAX_RECENTS);

        // Delete + renumber as one atomic unit so a mid-rewrite failure cannot
        // leave a partially-renumbered list (idiomatic rusqlite).
        let tx = self.conn().unchecked_transaction()?;
        tx.execute(
            "DELETE FROM recents WHERE workspace = ?1",
            params![workspace],
        )?;
        for (position, v) in current.iter().enumerate() {
            tx.execute(
                "INSERT INTO recents (workspace, position, value) VALUES (?1, ?2, ?3)",
                params![workspace, position as i64, v],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    /// List the workspace recents, most-recent-first.
    pub fn recents(&self, workspace: &str) -> Result<Vec<String>> {
        let mut stmt = self
            .conn()
            .prepare("SELECT value FROM recents WHERE workspace = ?1 ORDER BY position ASC")?;
        let rows = stmt.query_map(params![workspace], |r| r.get::<_, String>(0))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// Push a (workspace, scope) pair to the front of the machine-global recents:
    /// most-recent-first, deduped (an existing copy is moved to the front),
    /// bounded to `MAX_RECENTS`. This is the cross-project recents list — it spans
    /// EVERY registered project, so the dashboard can render one unified "Recent"
    /// list attributed per project. Renumbered from 0 on each push as one atomic
    /// transaction (mirrors `push_recent`).
    pub fn push_global_recent(&self, workspace: &str, scope: &str) -> Result<()> {
        let mut current = self.global_recents()?;
        current.retain(|(w, s)| !(w == workspace && s == scope));
        current.insert(0, (workspace.to_string(), scope.to_string()));
        current.truncate(MAX_RECENTS);

        let tx = self.conn().unchecked_transaction()?;
        tx.execute("DELETE FROM global_recents", [])?;
        for (position, (w, s)) in current.iter().enumerate() {
            tx.execute(
                "INSERT INTO global_recents (position, workspace, scope) VALUES (?1, ?2, ?3)",
                params![position as i64, w, s],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    /// List the machine-global recents as `(workspace, scope)` pairs,
    /// most-recent-first.
    pub fn global_recents(&self) -> Result<Vec<(String, String)>> {
        let mut stmt = self
            .conn()
            .prepare("SELECT workspace, scope FROM global_recents ORDER BY position ASC")?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// Remove ONE (workspace, scope) entry from the machine-global recents and
    /// renumber the survivors. A no-op when the pair is absent. The CRUD remove
    /// side of the cross-project history, so the operator can prune a single
    /// recent rather than only clearing the whole list.
    pub fn remove_global_recent(&self, workspace: &str, scope: &str) -> Result<()> {
        let current: Vec<(String, String)> = self
            .global_recents()?
            .into_iter()
            .filter(|(w, s)| !(w == workspace && s == scope))
            .collect();
        let tx = self.conn().unchecked_transaction()?;
        tx.execute("DELETE FROM global_recents", [])?;
        for (position, (w, s)) in current.iter().enumerate() {
            tx.execute(
                "INSERT INTO global_recents (position, workspace, scope) VALUES (?1, ?2, ?3)",
                params![position as i64, w, s],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    /// Clear the entire machine-global recents list (the CRUD clear side).
    pub fn clear_global_recents(&self) -> Result<()> {
        self.conn().execute("DELETE FROM global_recents", [])?;
        Ok(())
    }

    // --- workspace registry (dashboard-workspace-registry ADR) --------------
    //
    // The ordered set of registered project roots. Registering, selecting, and
    // forgetting are all USER-STATE CONFIG: they write only registry/settings
    // rows in this best-effort store and NEVER clone, init, create, delete, or
    // otherwise mutate a repository, a worktree, a branch, or any file on disk.
    // Each registered root is READ exactly as the launch workspace is.

    /// List the registered project roots in their stable registry order
    /// (position ascending, the order they were added). A fresh or
    /// best-effort-recreated store returns an empty list; the launch workspace
    /// is re-auto-registered on the next boot (S03).
    pub fn list_roots(&self) -> Result<Vec<WorkspaceRoot>> {
        let mut stmt = self.conn().prepare(
            "SELECT id, label, path, is_launch, reachable, unreachable_reason
             FROM workspace_registry
             ORDER BY position ASC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(WorkspaceRoot {
                id: r.get(0)?,
                label: r.get(1)?,
                path: r.get(2)?,
                is_launch: r.get::<_, i64>(3)? != 0,
                reachable: r.get::<_, i64>(4)? != 0,
                unreachable_reason: r.get(5)?,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// One registered root by its stable id, if present.
    pub fn root(&self, id: &str) -> Result<Option<WorkspaceRoot>> {
        Ok(self.list_roots()?.into_iter().find(|r| r.id == id))
    }

    /// Register (upsert) a project root, appending it at the end of the registry
    /// order on first registration and refreshing its label / path /
    /// reachability on a repeat. This is a CONFIG write only: the caller has
    /// already validated (read-only) that the path is a discoverable git
    /// workspace and derived the stable id from its git common dir; this method
    /// just RECORDS the entry. It never touches the repository on disk.
    ///
    /// `is_launch` marks the auto-registered launch workspace (advisory). A
    /// repeat registration preserves the existing row's position so the order is
    /// stable across reboots.
    pub fn add_root(&self, root: &WorkspaceRoot, now: i64) -> Result<()> {
        // Preserve an existing row's position; a new root appends after the max.
        let existing_position: Option<i64> = self
            .conn()
            .query_row(
                "SELECT position FROM workspace_registry WHERE id = ?1",
                params![root.id],
                |r| r.get(0),
            )
            .optional()?;
        let position = match existing_position {
            Some(p) => p,
            None => {
                let max: Option<i64> = self
                    .conn()
                    .query_row("SELECT max(position) FROM workspace_registry", [], |r| {
                        r.get(0)
                    })
                    .optional()?
                    .flatten();
                max.map(|m| m + 1).unwrap_or(0)
            }
        };
        self.conn().execute(
            "INSERT INTO workspace_registry
                 (id, label, path, is_launch, position, reachable, unreachable_reason, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
                 label = ?2,
                 path = ?3,
                 is_launch = ?4,
                 reachable = ?6,
                 unreachable_reason = ?7,
                 updated_at = ?8",
            params![
                root.id,
                root.label,
                root.path,
                root.is_launch as i64,
                position,
                root.reachable as i64,
                root.unreachable_reason,
                now,
            ],
        )?;
        Ok(())
    }

    /// Update one registered root's reachability state (and its degradation
    /// reason). A no-op when the id is unknown. Pure config write — used by the
    /// registry-enumeration path to record a root that has moved or disappeared
    /// on disk as degraded rather than dropping it.
    pub fn set_root_reachability(
        &self,
        id: &str,
        reachable: bool,
        reason: Option<&str>,
        now: i64,
    ) -> Result<()> {
        self.conn().execute(
            "UPDATE workspace_registry
             SET reachable = ?2, unreachable_reason = ?3, updated_at = ?4
             WHERE id = ?1",
            params![id, reachable as i64, reason, now],
        )?;
        Ok(())
    }

    /// Forget (remove) a registered root by its stable id. A CONFIG DELETE only:
    /// it removes the registry row and NEVER touches the repository on disk. The
    /// launch workspace cannot be forgotten while it is the only registered root
    /// (a refusal, not a disk operation); forgetting any other root, or the
    /// launch root once siblings exist, is permitted. The caller is responsible
    /// for evicting any warm scope cells the forgotten root owned.
    pub fn forget_root(&self, id: &str) -> Result<std::result::Result<(), RegistryError>> {
        let roots = self.list_roots()?;
        let Some(target) = roots.iter().find(|r| r.id == id) else {
            // Forgetting an unknown id is a harmless no-op (already gone).
            return Ok(Ok(()));
        };
        if target.is_launch && roots.len() == 1 {
            return Ok(Err(RegistryError::LastLaunchRoot));
        }
        self.conn()
            .execute("DELETE FROM workspace_registry WHERE id = ?1", params![id])?;
        Ok(Ok(()))
    }

    /// The active workspace id, if one has been selected. Persisted on the
    /// existing global-settings kv surface under [`ACTIVE_WORKSPACE_KEY`].
    pub fn active_workspace(&self) -> Result<Option<String>> {
        self.global_setting(ACTIVE_WORKSPACE_KEY)
    }

    /// Select the active workspace (a config write to the global-settings
    /// surface). Selecting a workspace never mutates a repository; it records
    /// which registered root the dashboard is currently pointed at.
    pub fn set_active_workspace(&self, id: &str, now: i64) -> Result<()> {
        self.set_global_setting(ACTIVE_WORKSPACE_KEY, id, now)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(crate::store::DB_FILENAME);
        let store = Store::open_at(&path).unwrap();
        (dir, store)
    }

    #[test]
    fn active_scope_round_trips_and_defaults_to_none() {
        let (_dir, store) = temp_store();
        assert_eq!(store.active_scope("wsA").unwrap(), None);
        store.set_active_scope("wsA", "main", 1).unwrap();
        assert_eq!(store.active_scope("wsA").unwrap().as_deref(), Some("main"));
        store.set_active_scope("wsA", "feature-x", 2).unwrap();
        assert_eq!(
            store.active_scope("wsA").unwrap().as_deref(),
            Some("feature-x")
        );
    }

    #[test]
    fn scope_context_round_trips_per_scope() {
        let (_dir, store) = temp_store();
        assert_eq!(
            store.scope_context("wsA", "main").unwrap(),
            ScopeContext::default()
        );
        let ctx = ScopeContext {
            active_folder: Some("plan".to_string()),
            feature_tags: vec!["editor-demo".into(), "grid-layout".into()],
            workspace_layout: Some("{\"v\":1,\"tabs\":[]}".to_string()),
        };
        store.set_scope_context("wsA", "main", &ctx, 1).unwrap();
        // A different scope keeps its own context.
        let other = ScopeContext {
            active_folder: Some("adr".to_string()),
            feature_tags: vec!["other".into()],
            workspace_layout: None,
        };
        store
            .set_scope_context("wsA", "feature-x", &other, 2)
            .unwrap();
        assert_eq!(store.scope_context("wsA", "main").unwrap(), ctx);
        assert_eq!(store.scope_context("wsA", "feature-x").unwrap(), other);
    }

    #[test]
    fn recents_are_most_recent_first_deduped_and_bounded() {
        let (_dir, store) = temp_store();
        store.push_recent("wsA", "a").unwrap();
        store.push_recent("wsA", "b").unwrap();
        store.push_recent("wsA", "c").unwrap();
        assert_eq!(store.recents("wsA").unwrap(), vec!["c", "b", "a"]);
        // Re-pushing an existing value moves it to the front without dupe.
        store.push_recent("wsA", "a").unwrap();
        assert_eq!(store.recents("wsA").unwrap(), vec!["a", "c", "b"]);

        // Bounded to MAX_RECENTS.
        for i in 0..(MAX_RECENTS + 10) {
            store.push_recent("wsA", &format!("v{i}")).unwrap();
        }
        let recents = store.recents("wsA").unwrap();
        assert_eq!(recents.len(), MAX_RECENTS);
        // The most recent push is at the front.
        assert_eq!(recents[0], format!("v{}", MAX_RECENTS + 9));
    }

    #[test]
    fn global_recents_span_workspaces_deduped_and_bounded() {
        let (_dir, store) = temp_store();
        store.push_global_recent("wsA", "main").unwrap();
        store.push_global_recent("wsB", "feature").unwrap();
        store.push_global_recent("wsA", "other").unwrap();
        assert_eq!(
            store.global_recents().unwrap(),
            vec![
                ("wsA".to_string(), "other".to_string()),
                ("wsB".to_string(), "feature".to_string()),
                ("wsA".to_string(), "main".to_string()),
            ],
            "cross-project recents are most-recent-first and span workspaces"
        );
        // Dedupe is on the (workspace, scope) PAIR: the same scope in a different
        // workspace is a distinct entry, but re-navigating the same pair moves it
        // to the front without a duplicate.
        store.push_global_recent("wsB", "main").unwrap();
        store.push_global_recent("wsA", "main").unwrap();
        let recents = store.global_recents().unwrap();
        assert_eq!(recents[0], ("wsA".to_string(), "main".to_string()));
        assert_eq!(recents[1], ("wsB".to_string(), "main".to_string()));
        assert_eq!(
            recents
                .iter()
                .filter(|(w, s)| w == "wsA" && s == "main")
                .count(),
            1,
            "the (wsA, main) pair is deduped to one entry"
        );

        // Bounded to MAX_RECENTS.
        for i in 0..(MAX_RECENTS + 10) {
            store.push_global_recent("wsA", &format!("v{i}")).unwrap();
        }
        let recents = store.global_recents().unwrap();
        assert_eq!(recents.len(), MAX_RECENTS);
        assert_eq!(
            recents[0],
            ("wsA".to_string(), format!("v{}", MAX_RECENTS + 9))
        );
    }

    #[test]
    fn global_recents_support_remove_and_clear() {
        let (_dir, store) = temp_store();
        store.push_global_recent("wsA", "main").unwrap();
        store.push_global_recent("wsB", "feature").unwrap();
        store.push_global_recent("wsA", "other").unwrap();

        // Remove ONE pair; the survivors renumber and keep MRU order.
        store.remove_global_recent("wsB", "feature").unwrap();
        assert_eq!(
            store.global_recents().unwrap(),
            vec![
                ("wsA".to_string(), "other".to_string()),
                ("wsA".to_string(), "main".to_string()),
            ],
        );
        // Removing an absent pair is a no-op.
        store.remove_global_recent("wsZ", "nope").unwrap();
        assert_eq!(store.global_recents().unwrap().len(), 2);

        // Clear empties the whole list.
        store.clear_global_recents().unwrap();
        assert!(store.global_recents().unwrap().is_empty());
    }

    fn root(id: &str, label: &str, path: &str, is_launch: bool) -> WorkspaceRoot {
        WorkspaceRoot {
            id: id.to_string(),
            label: label.to_string(),
            path: path.to_string(),
            is_launch,
            reachable: true,
            unreachable_reason: None,
        }
    }

    #[test]
    fn registry_roots_preserve_insertion_order_and_upsert_in_place() {
        let (_dir, store) = temp_store();
        assert!(
            store.list_roots().unwrap().is_empty(),
            "fresh registry empty"
        );

        store
            .add_root(&root("id-a", "alpha", "/ws/a", true), 1)
            .unwrap();
        store
            .add_root(&root("id-b", "beta", "/ws/b", false), 2)
            .unwrap();
        store
            .add_root(&root("id-c", "gamma", "/ws/c", false), 3)
            .unwrap();
        let ids: Vec<String> = store
            .list_roots()
            .unwrap()
            .into_iter()
            .map(|r| r.id)
            .collect();
        assert_eq!(
            ids,
            vec!["id-a", "id-b", "id-c"],
            "insertion order is stable"
        );

        // Re-adding an existing root updates its label IN PLACE, keeping its
        // position — the order does not reshuffle on a repeat registration.
        store
            .add_root(&root("id-a", "alpha-renamed", "/ws/a", true), 4)
            .unwrap();
        let roots = store.list_roots().unwrap();
        assert_eq!(
            roots.iter().map(|r| r.id.clone()).collect::<Vec<_>>(),
            vec!["id-a", "id-b", "id-c"],
            "upsert keeps position"
        );
        assert_eq!(roots[0].label, "alpha-renamed", "label updated in place");
    }

    #[test]
    fn registry_reachability_round_trips() {
        let (_dir, store) = temp_store();
        store
            .add_root(&root("id-a", "alpha", "/ws/a", true), 1)
            .unwrap();
        store
            .set_root_reachability("id-a", false, Some("path unreachable"), 2)
            .unwrap();
        let r = store.root("id-a").unwrap().expect("present");
        assert!(!r.reachable);
        assert_eq!(r.unreachable_reason.as_deref(), Some("path unreachable"));
        // Recovering clears the reason.
        store.set_root_reachability("id-a", true, None, 3).unwrap();
        let r = store.root("id-a").unwrap().expect("present");
        assert!(r.reachable);
        assert_eq!(r.unreachable_reason, None);
    }

    #[test]
    fn forget_removes_a_sibling_but_refuses_the_last_launch_root() {
        let (_dir, store) = temp_store();
        store
            .add_root(&root("launch", "launch", "/ws/launch", true), 1)
            .unwrap();

        // The launch workspace cannot be forgotten while it is the ONLY root —
        // a config refusal, never a disk operation.
        assert_eq!(
            store.forget_root("launch").unwrap(),
            Err(RegistryError::LastLaunchRoot)
        );
        assert_eq!(store.list_roots().unwrap().len(), 1, "still registered");

        // Once a sibling exists, forgetting a sibling — or the launch root — is
        // permitted; it removes only the registry row.
        store
            .add_root(&root("other", "other", "/ws/other", false), 2)
            .unwrap();
        assert_eq!(store.forget_root("other").unwrap(), Ok(()));
        assert_eq!(
            store
                .list_roots()
                .unwrap()
                .into_iter()
                .map(|r| r.id)
                .collect::<Vec<_>>(),
            vec!["launch"],
            "sibling forgotten, launch remains"
        );
        // Forgetting an unknown id is a harmless no-op.
        assert_eq!(store.forget_root("nope").unwrap(), Ok(()));
    }

    #[test]
    fn active_workspace_round_trips_and_defaults_to_none() {
        let (_dir, store) = temp_store();
        assert_eq!(store.active_workspace().unwrap(), None);
        store.set_active_workspace("id-a", 1).unwrap();
        assert_eq!(store.active_workspace().unwrap().as_deref(), Some("id-a"));
        store.set_active_workspace("id-b", 2).unwrap();
        assert_eq!(store.active_workspace().unwrap().as_deref(), Some("id-b"));
    }
}
