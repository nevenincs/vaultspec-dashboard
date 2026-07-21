//! The machine-global app home (`~/.vaultspec/`) — the single-app-runtime
//! ADR's D3 launcher state and D1 seat discovery location.
//!
//! This module owns paths and one small, BOUNDED launcher-state file; it holds
//! no SQLite and no per-workspace user state (that stays in each workspace's
//! `.vault/data/engine-data/`, deliberately un-hoisted — ADR option O5
//! rejected). Everything here is best-effort and tolerant on read: a missing
//! or corrupt file loads as the empty default, mirroring the store posture.
//!
//! Two files live under the app home:
//!
//! - `service.json` — the SEAT discovery file (port, bearer, pid, heartbeat),
//!   written by the seated serve through the same atomic publish the
//!   workspace-local file uses.
//! - `workspaces.json` — the launcher state: known workspace roots plus the
//!   last-active root, capped at [`MAX_WORKSPACE_ROWS`] (resource-bounds: the
//!   accumulator is bounded at creation).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Hard cap on remembered workspace roots (resource-bounds law). Eviction is
/// oldest-`last_opened_ms` first; 32 comfortably exceeds any real multi-project
/// use while keeping the file trivially small.
pub const MAX_WORKSPACE_ROWS: usize = 32;

/// Resolve the machine-global app home. `VAULTSPEC_APP_HOME` overrides for
/// tests and harness isolation (mirroring how the dev harness isolates ports);
/// otherwise `~/.vaultspec` from `USERPROFILE`/`HOME` (the same resolution the
/// rag discovery client uses). `None` only when no home variable is set at all.
///
/// DUPLICATED, deliberately, by `vaultspec_product::paths::ProductPaths::derive`
/// — the two crates are siblings and neither may depend on the other. Change
/// this precedence only together with that one; the
/// `the_two_app_home_resolvers_agree` test in `vaultspec-cli` fails if they
/// drift, and records when to revisit extracting a shared crate.
pub fn app_home_dir() -> Option<PathBuf> {
    if let Some(over) = std::env::var_os("VAULTSPEC_APP_HOME") {
        return Some(PathBuf::from(over));
    }
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(|home| PathBuf::from(home).join(".vaultspec"))
}

/// The seat discovery file under an app home.
pub fn seat_discovery_path(home: &Path) -> PathBuf {
    home.join("service.json")
}

/// The launcher-state file under an app home.
pub fn launcher_state_path(home: &Path) -> PathBuf {
    home.join("workspaces.json")
}

/// One remembered workspace root.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkspaceEntry {
    /// Stable workspace id (the canonical git common-dir token, the same
    /// identity the registry uses).
    pub id: String,
    /// Display label (the root's final path component at registration).
    pub label: String,
    /// Absolute root path.
    pub path: String,
    /// Last time this root was opened through the launcher or serve boot.
    pub last_opened_ms: i64,
}

/// The launcher state: bounded known-roots list + last-active id.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct LauncherState {
    #[serde(default)]
    pub workspaces: Vec<WorkspaceEntry>,
    #[serde(default)]
    pub last_active: Option<String>,
}

impl LauncherState {
    /// Load the launcher state from an app home. Best-effort: a missing,
    /// unreadable, or corrupt file is the empty default — there is nothing
    /// precious here (the same posture as the user-state store heal).
    pub fn load(home: &Path) -> Self {
        std::fs::read_to_string(launcher_state_path(home))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    /// Atomically persist the launcher state (temp + rename, 0600 on unix —
    /// the file names local paths, not secrets, but the app home's discovery
    /// sibling carries a token, so the whole home stays owner-restricted).
    pub fn save(&self, home: &Path) -> std::io::Result<()> {
        std::fs::create_dir_all(home)?;
        let path = launcher_state_path(home);
        let tmp = home.join(format!("workspaces.json.tmp-{}", std::process::id()));
        std::fs::write(&tmp, serde_json::to_string_pretty(self)?)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600))?;
        }
        std::fs::rename(&tmp, &path)?;
        Ok(())
    }

    /// Upsert a workspace root, stamp it opened now, make it last-active, and
    /// enforce the row cap (evicting the stalest `last_opened_ms` rows).
    pub fn touch(&mut self, id: &str, label: &str, path: &str, now_ms: i64) {
        if let Some(row) = self.workspaces.iter_mut().find(|w| w.id == id) {
            row.label = label.to_string();
            row.path = path.to_string();
            row.last_opened_ms = now_ms;
        } else {
            self.workspaces.push(WorkspaceEntry {
                id: id.to_string(),
                label: label.to_string(),
                path: path.to_string(),
                last_opened_ms: now_ms,
            });
        }
        self.last_active = Some(id.to_string());
        if self.workspaces.len() > MAX_WORKSPACE_ROWS {
            self.workspaces
                .sort_by_key(|w| std::cmp::Reverse(w.last_opened_ms));
            self.workspaces.truncate(MAX_WORKSPACE_ROWS);
        }
    }

    /// The last-active entry, if it is still remembered.
    pub fn last_active_entry(&self) -> Option<&WorkspaceEntry> {
        let id = self.last_active.as_deref()?;
        self.workspaces.iter().find(|w| w.id == id)
    }

    /// Drop rows whose path no longer exists on disk (reachability prune —
    /// the bound's second half). Clears `last_active` if its row went away.
    pub fn prune_unreachable(&mut self) {
        self.workspaces.retain(|w| Path::new(&w.path).is_dir());
        if let Some(id) = self.last_active.as_deref()
            && !self.workspaces.iter().any(|w| w.id == id)
        {
            self.last_active = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launcher_state_roundtrips_and_tolerates_corruption() {
        let dir = tempfile::tempdir().unwrap();
        // Missing file loads as the empty default.
        assert_eq!(LauncherState::load(dir.path()), LauncherState::default());
        let mut st = LauncherState::default();
        st.touch("ws-a", "alpha", dir.path().to_str().unwrap(), 100);
        st.save(dir.path()).unwrap();
        assert_eq!(LauncherState::load(dir.path()), st);
        // Corrupt content loads as the empty default, never errors.
        std::fs::write(launcher_state_path(dir.path()), "{not json").unwrap();
        assert_eq!(LauncherState::load(dir.path()), LauncherState::default());
    }

    #[test]
    fn touch_upserts_sets_last_active_and_caps_rows() {
        let dir = tempfile::tempdir().unwrap();
        let real = dir.path().to_str().unwrap().to_string();
        let mut st = LauncherState::default();
        for i in 0..(MAX_WORKSPACE_ROWS + 8) {
            st.touch(&format!("ws-{i}"), "w", &real, i as i64);
        }
        assert_eq!(st.workspaces.len(), MAX_WORKSPACE_ROWS, "row cap holds");
        assert!(
            !st.workspaces.iter().any(|w| w.id == "ws-0"),
            "stalest rows are the evicted ones"
        );
        // Re-touching an existing row updates in place, no growth.
        let latest = format!("ws-{}", MAX_WORKSPACE_ROWS + 7);
        st.touch(&latest, "renamed", &real, 9_999);
        assert_eq!(st.workspaces.len(), MAX_WORKSPACE_ROWS);
        assert_eq!(st.last_active.as_deref(), Some(latest.as_str()));
        assert_eq!(st.last_active_entry().unwrap().label, "renamed");
    }

    #[test]
    fn prune_drops_missing_paths_and_orphaned_last_active() {
        let dir = tempfile::tempdir().unwrap();
        let real = dir.path().to_str().unwrap().to_string();
        let mut st = LauncherState::default();
        st.touch("ws-real", "r", &real, 1);
        st.touch("ws-gone", "g", &format!("{real}-does-not-exist"), 2);
        assert_eq!(st.last_active.as_deref(), Some("ws-gone"));
        st.prune_unreachable();
        assert_eq!(st.workspaces.len(), 1);
        assert_eq!(st.workspaces[0].id, "ws-real");
        assert_eq!(st.last_active, None, "orphaned last-active cleared");
    }
}
