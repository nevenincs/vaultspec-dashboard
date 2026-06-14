//! The session domain: active workspace scope, per-scope folder and
//! feature-tag contexts, and a bounded recents list.
//!
//! The session is the "where am I and what am I looking at" state the
//! dashboard restores on load instead of recomputing a default
//! (user-state-persistence ADR). It persists ONLY its own rows in the
//! best-effort store; it never writes `.vault/` documents or mutates git.

use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::schema::GLOBAL_SCOPE;
use crate::store::{Result, Store};

/// How many recent selections are retained per workspace; older entries past
/// this bound are dropped on write.
pub const MAX_RECENTS: usize = 50;

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

        self.conn().execute(
            "DELETE FROM recents WHERE workspace = ?1",
            params![workspace],
        )?;
        for (position, v) in current.iter().enumerate() {
            self.conn().execute(
                "INSERT INTO recents (workspace, position, value) VALUES (?1, ?2, ?3)",
                params![workspace, position as i64, v],
            )?;
        }
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
        };
        store.set_scope_context("wsA", "main", &ctx, 1).unwrap();
        // A different scope keeps its own context.
        let other = ScopeContext {
            active_folder: Some("adr".to_string()),
            feature_tags: vec!["other".into()],
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
}
