//! Working-tree resolver (engine-spec §3, D3.3): assigns resolved, stale,
//! or broken state to every structural mention. Resolution state is signal:
//! broken edges are retained and surfaced, never dropped — "this plan
//! references a file that no longer exists" is exactly what an operator
//! wants to see.
//!
//! v1 state semantics (deterministic, working-tree-verifiable):
//! - **Resolved** — the target resolves exactly in the scope's tree.
//! - **Stale** — the exact target is gone but a same-named candidate exists
//!   elsewhere (a moved file, a stem in a different folder): the mention
//!   decayed but still points at something recoverable.
//! - **Broken** — nothing in the scope resolves the mention.

use std::path::Path;

use engine_model::ResolutionState;

use crate::extract::{ExtractedMention, MentionKind};

/// A mention with its assigned resolution state and, when found, the
/// resolved repo-relative target.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedMention {
    pub mention: ExtractedMention,
    pub state: ResolutionState,
    pub target: Option<String>,
}

/// Resolve mentions against a worktree checkout.
pub fn resolve(root: &Path, mentions: Vec<ExtractedMention>) -> Vec<ResolvedMention> {
    // One walk of the tree serves all fallback lookups.
    let inventory = walk(root);
    mentions
        .into_iter()
        .map(|mention| resolve_one(root, &inventory, mention))
        .collect()
}

fn resolve_one(root: &Path, inventory: &[String], mention: ExtractedMention) -> ResolvedMention {
    let (state, target) = match &mention.kind {
        MentionKind::Path(path) => {
            if root.join(path).is_file() {
                (ResolutionState::Resolved, Some(path.clone()))
            } else {
                let basename = path.rsplit('/').next().unwrap_or(path);
                match find_by_basename(inventory, basename) {
                    Some(found) => (ResolutionState::Stale, Some(found)),
                    None => (ResolutionState::Broken, None),
                }
            }
        }
        MentionKind::WikiLink(stem) => {
            let filename = format!("{stem}.md");
            match find_by_basename(inventory, &filename) {
                Some(found) if found.starts_with(".vault/") => {
                    (ResolutionState::Resolved, Some(found))
                }
                Some(found) => (ResolutionState::Stale, Some(found)),
                None => (ResolutionState::Broken, None),
            }
        }
        MentionKind::StepId(step_id) => resolve_step_id(root, inventory, step_id),
        MentionKind::Symbol(symbol) => resolve_symbol(root, inventory, symbol),
    };
    ResolvedMention {
        mention,
        state,
        target,
    }
}

/// A step id resolves when some plan document in the scope contains its
/// canonical backtick form.
fn resolve_step_id(
    root: &Path,
    inventory: &[String],
    step_id: &str,
) -> (ResolutionState, Option<String>) {
    let needle = format!("`{step_id}`");
    let plans: Vec<&String> = inventory
        .iter()
        .filter(|p| p.starts_with(".vault/plan/") && p.ends_with(".md"))
        .collect();
    for plan in &plans {
        if let Ok(text) = std::fs::read_to_string(root.join(plan))
            && text.contains(&needle)
        {
            return (ResolutionState::Resolved, Some((*plan).clone()));
        }
    }
    if plans.is_empty() {
        // No plan corpus in scope at all: the mention has decayed rather
        // than being provably wrong.
        (ResolutionState::Stale, None)
    } else {
        (ResolutionState::Broken, None)
    }
}

/// v1 symbol resolution: qualified-name text match over code files in the
/// scope (tree-sitter-grade resolution is v2, per the ADR). Qualified match
/// → resolved; last-segment-only match → stale; nothing → broken.
fn resolve_symbol(
    root: &Path,
    inventory: &[String],
    symbol: &str,
) -> (ResolutionState, Option<String>) {
    let last = symbol
        .rsplit("::")
        .next()
        .and_then(|s| s.rsplit('.').next())
        .unwrap_or(symbol);
    let mut stale_hit: Option<String> = None;
    for path in inventory.iter().filter(|p| is_code_file(p)) {
        let Ok(text) = std::fs::read_to_string(root.join(path)) else {
            continue;
        };
        if text.contains(symbol) {
            return (ResolutionState::Resolved, Some(path.clone()));
        }
        if stale_hit.is_none() && text.contains(last) {
            stale_hit = Some(path.clone());
        }
    }
    match stale_hit {
        Some(path) => (ResolutionState::Stale, Some(path)),
        None => (ResolutionState::Broken, None),
    }
}

fn find_by_basename(inventory: &[String], basename: &str) -> Option<String> {
    inventory
        .iter()
        .find(|p| p.rsplit('/').next() == Some(basename))
        .cloned()
}

const CODE_EXTENSIONS: &[&str] = &[
    "rs", "py", "ts", "tsx", "js", "jsx", "go", "java", "c", "h", "cpp", "hpp", "cs", "rb",
];

fn is_code_file(path: &str) -> bool {
    path.rsplit('.')
        .next()
        .is_some_and(|ext| CODE_EXTENSIONS.contains(&ext))
}

/// Walk the scope's tree, returning repo-relative POSIX paths. Skips `.git`
/// and other dot-directories except `.vault` (the corpus), plus common
/// dependency/build trees.
fn walk(root: &Path) -> Vec<String> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            if path.is_dir() {
                let skip = (name.starts_with('.') && name != ".vault")
                    || matches!(
                        name.as_str(),
                        "node_modules" | "target" | "dist" | "__pycache__"
                    );
                if !skip {
                    stack.push(path);
                }
            } else if let Ok(rel) = path.strip_prefix(root) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    out.sort();
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::extract::extract;

    fn fixture() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("src/nested")).unwrap();
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
        std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
        std::fs::write(
            root.join("src/lib.rs"),
            "pub mod graph;\npub fn insert() {}\n",
        )
        .unwrap();
        std::fs::write(root.join("src/nested/moved.rs"), "// moved here\n").unwrap();
        std::fs::write(
            root.join(".vault/plan/2026-06-12-demo-plan.md"),
            "- [ ] `W01.P02.S03` - do the thing\n",
        )
        .unwrap();
        std::fs::write(root.join(".vault/adr/2026-06-12-demo-adr.md"), "# adr\n").unwrap();
        dir
    }

    #[test]
    fn all_three_states_assigned_across_all_four_extractors() {
        let dir = fixture();
        let body = "Touches `src/lib.rs` and `old/moved.rs` and `gone/nothing.rs`. \
                    Step `W01.P02.S03` and step `W09.P09.S99`. \
                    See [[2026-06-12-demo-adr]] and [[2026-06-12-missing-adr]]. \
                    Calls `insert()` and `vanished_function()`.";
        let resolved = resolve(dir.path(), extract(body));

        let state_of = |needle: &str| {
            resolved
                .iter()
                .find(|r| format!("{:?}", r.mention.kind).contains(needle))
                .unwrap_or_else(|| panic!("mention {needle} extracted"))
        };

        // Paths: exact → resolved; moved basename → stale; gone → broken.
        assert_eq!(state_of("src/lib.rs").state, ResolutionState::Resolved);
        let moved = state_of("old/moved.rs");
        assert_eq!(moved.state, ResolutionState::Stale);
        assert_eq!(moved.target.as_deref(), Some("src/nested/moved.rs"));
        assert_eq!(state_of("gone/nothing.rs").state, ResolutionState::Broken);

        // Step ids: present in a plan → resolved; absent → broken.
        assert_eq!(state_of("W01.P02.S03").state, ResolutionState::Resolved);
        assert_eq!(state_of("W09.P09.S99").state, ResolutionState::Broken);

        // Wiki links: stem in .vault → resolved; missing → broken.
        assert_eq!(state_of("demo-adr").state, ResolutionState::Resolved);
        assert_eq!(state_of("missing-adr").state, ResolutionState::Broken);

        // Symbols: qualified text match → resolved; nothing → broken.
        assert_eq!(state_of("insert").state, ResolutionState::Resolved);
        assert_eq!(state_of("vanished_function").state, ResolutionState::Broken);

        // Broken mentions are retained, not dropped (D3.3).
        assert_eq!(resolved.len(), 9);
    }
}
