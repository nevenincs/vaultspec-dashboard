//! The settings domain: user settings as a kv surface with both global keys
//! and per-scope keys.
//!
//! Settings are durable, non-re-derivable user preferences (theme, defaults,
//! and the like). A global key applies workspace-wide; a scope-scoped key
//! overrides it for one worktree. Like the rest of this crate, settings
//! persist only their own rows and never touch `.vault/` or git.

use rusqlite::{OptionalExtension, params};

use crate::schema::GLOBAL_SCOPE;
use crate::store::{Result, Store};

/// One settings entry: its key and value, within an implied scope.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Setting {
    pub key: String,
    pub value: String,
}

impl Store {
    /// Get a global setting value, if set.
    pub fn global_setting(&self, key: &str) -> Result<Option<String>> {
        self.setting_in_scope(GLOBAL_SCOPE, key)
    }

    /// Set a global setting value.
    pub fn set_global_setting(&self, key: &str, value: &str, now: i64) -> Result<()> {
        self.set_setting_in_scope(GLOBAL_SCOPE, key, value, now)
    }

    /// Get a scope-scoped setting value, if set. Does NOT fall back to the
    /// global value; the caller composes the precedence it wants.
    pub fn scoped_setting(&self, scope: &str, key: &str) -> Result<Option<String>> {
        self.setting_in_scope(scope, key)
    }

    /// Set a scope-scoped setting value.
    pub fn set_scoped_setting(&self, scope: &str, key: &str, value: &str, now: i64) -> Result<()> {
        self.set_setting_in_scope(scope, key, value, now)
    }

    /// List all settings under a scope (use `GLOBAL_SCOPE` for the global
    /// set), ordered by key.
    pub fn list_settings(&self, scope: &str) -> Result<Vec<Setting>> {
        let mut stmt = self
            .conn()
            .prepare("SELECT key, value FROM settings WHERE scope = ?1 ORDER BY key ASC")?;
        let rows = stmt.query_map(params![scope], |r| {
            Ok(Setting {
                key: r.get(0)?,
                value: r.get(1)?,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    fn setting_in_scope(&self, scope: &str, key: &str) -> Result<Option<String>> {
        Ok(self
            .conn()
            .query_row(
                "SELECT value FROM settings WHERE scope = ?1 AND key = ?2",
                params![scope, key],
                |r| r.get(0),
            )
            .optional()?)
    }

    fn set_setting_in_scope(&self, scope: &str, key: &str, value: &str, now: i64) -> Result<()> {
        self.conn().execute(
            "INSERT INTO settings (scope, key, value, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(scope, key) DO UPDATE SET value = ?3, updated_at = ?4",
            params![scope, key, value, now],
        )?;
        Ok(())
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
    fn global_settings_round_trip_and_update() {
        let (_dir, store) = temp_store();
        assert_eq!(store.global_setting("theme").unwrap(), None);
        store.set_global_setting("theme", "dark", 1).unwrap();
        assert_eq!(
            store.global_setting("theme").unwrap().as_deref(),
            Some("dark")
        );
        store.set_global_setting("theme", "light", 2).unwrap();
        assert_eq!(
            store.global_setting("theme").unwrap().as_deref(),
            Some("light")
        );
    }

    #[test]
    fn scoped_settings_are_independent_of_global() {
        let (_dir, store) = temp_store();
        store.set_global_setting("theme", "dark", 1).unwrap();
        store
            .set_scoped_setting("main", "theme", "light", 2)
            .unwrap();
        // Each key resolves to its own scope's value; no implicit fallback.
        assert_eq!(
            store.global_setting("theme").unwrap().as_deref(),
            Some("dark")
        );
        assert_eq!(
            store.scoped_setting("main", "theme").unwrap().as_deref(),
            Some("light")
        );
        // An unset scoped key is None, not the global value.
        assert_eq!(store.scoped_setting("feature-x", "theme").unwrap(), None);
    }

    #[test]
    fn list_settings_is_scoped_and_ordered() {
        let (_dir, store) = temp_store();
        store.set_global_setting("z", "1", 1).unwrap();
        store.set_global_setting("a", "2", 1).unwrap();
        store.set_scoped_setting("main", "m", "3", 1).unwrap();
        let global = store.list_settings(GLOBAL_SCOPE).unwrap();
        assert_eq!(
            global,
            vec![
                Setting {
                    key: "a".into(),
                    value: "2".into()
                },
                Setting {
                    key: "z".into(),
                    value: "1".into()
                },
            ]
        );
        let scoped = store.list_settings("main").unwrap();
        assert_eq!(
            scoped,
            vec![Setting {
                key: "m".into(),
                value: "3".into()
            }]
        );
    }
}
