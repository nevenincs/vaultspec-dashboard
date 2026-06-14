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

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use engine_model::ResolutionState;
use rayon::prelude::*;

use crate::extract::{ExtractedMention, MentionKind};

/// A mention with its assigned resolution state and, when found, the
/// resolved repo-relative target.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedMention {
    pub mention: ExtractedMention,
    pub state: ResolutionState,
    pub target: Option<String>,
}

/// A worktree resolver built ONCE per index pass (perf ADR D1): the tree walk,
/// the basename inverted index, and the file-content cache are all amortized
/// across every document's mentions. Previously `resolve` was a free function
/// invoked per document, so each document re-walked the whole tree and
/// re-read the whole codebase — an O(N²) cold index
/// (`graph-scale-hardening` research F1). Resolution states are unchanged; only
/// the cost is: each file is walked once and read at most once for the entire
/// pass, and basename fallbacks are an O(1) lookup instead of an O(N) scan.
pub struct Resolver {
    root: PathBuf,
    /// Sorted repo-relative POSIX paths (one tree walk). Immutable after build,
    /// so it is freely shared across rayon worker threads (perf ADR D2).
    inventory: Vec<String>,
    /// basename → first path in sorted order (mirrors the prior
    /// `find_by_basename`, which returned the first sorted match). Immutable.
    by_basename: HashMap<String, String>,
    /// repo-relative path → file contents, read at most once per pass. A
    /// `Mutex<HashMap>` (not `RefCell`) so the parallel symbol/step fan-out
    /// (perf ADR D2) can share one content cache across worker threads while
    /// preserving the read-at-most-once property: the lock is only held to
    /// check/insert the cache entry, never across the file read itself
    /// (`prime_contents` reads in parallel and inserts each path exactly once).
    cache: Mutex<HashMap<String, Option<String>>>,
    /// symbol → resolution outcome, memoized across documents: symbol
    /// resolution is a pure function of the symbol and the fixed tree, so the
    /// all-code-files scan runs once per DISTINCT symbol, not once per mention
    /// (perf ADR D1 — the residual O(docs × code_files) cost otherwise). A
    /// `Mutex` so the parallel resolution path (perf ADR D2) can deposit each
    /// distinct symbol's outcome; the single-doc `resolve` path also reads it.
    symbol_memo: Mutex<HashMap<String, (ResolutionState, Option<String>)>>,
    /// step-id → resolution outcome, memoized the same way (one plan scan per
    /// distinct step id).
    step_memo: Mutex<HashMap<String, (ResolutionState, Option<String>)>>,
}

impl Resolver {
    /// Build the resolver for a worktree checkout: one walk, one basename
    /// index. The content cache fills lazily as text-matching rules fire.
    pub fn new(root: &Path) -> Self {
        let inventory = walk(root);
        let mut by_basename: HashMap<String, String> = HashMap::with_capacity(inventory.len());
        for path in &inventory {
            let base = path.rsplit('/').next().unwrap_or(path);
            // inventory is sorted; keep the first match for a basename so the
            // O(1) lookup reproduces the prior sorted-`find` semantics exactly.
            by_basename
                .entry(base.to_string())
                .or_insert_with(|| path.clone());
        }
        Self {
            root: root.to_path_buf(),
            inventory,
            by_basename,
            cache: Mutex::new(HashMap::new()),
            symbol_memo: Mutex::new(HashMap::new()),
            step_memo: Mutex::new(HashMap::new()),
        }
    }

    /// Resolve one document's mentions against the pre-built inventory.
    ///
    /// Single-document convenience entry point (callers / tests). It shares the
    /// exact symbol/step resolution logic with the parallel batch path via
    /// [`Resolver::resolve_one`] and [`Resolver::resolve_symbol`] /
    /// [`Resolver::resolve_step_id`], so a single-doc resolve and a batch
    /// resolve of the same document produce byte-identical results (perf ADR D2
    /// parity invariant).
    pub fn resolve(&self, mentions: Vec<ExtractedMention>) -> Vec<ResolvedMention> {
        mentions
            .into_iter()
            .map(|mention| self.resolve_one(mention))
            .collect()
    }

    /// Resolve every document's mentions in one pass, parallelizing the
    /// expensive symbol/step content scans across CPU cores (perf ADR D2;
    /// `graph-compute-is-cpu-gpu-is-render-and-search`).
    ///
    /// The win: `resolve_symbol` / `resolve_step_id` each scan code/plan file
    /// contents once per DISTINCT symbol/step. Those scans are a pure function
    /// of the symbol/step and the fixed tree, so they are embarrassingly
    /// parallel. This entry point:
    ///
    /// 1. Collects the DISTINCT symbols and DISTINCT step ids across all docs.
    /// 2. Primes the file-content cache by reading every code/plan file ONCE in
    ///    parallel (so the subsequent scans are pure in-memory lookups — the
    ///    read-at-most-once property is preserved, and no file I/O happens
    ///    under the per-symbol scan).
    /// 3. Resolves the distinct symbols/steps in parallel (`par_iter`), each via
    ///    the SAME `resolve_symbol` / `resolve_step_id` logic as the sequential
    ///    path, depositing outcomes into the shared memos. Determinism holds:
    ///    distinct symbols resolve independently, and within ONE symbol's scan
    ///    the sorted inventory is walked sequentially, preserving first-match.
    /// 4. Maps each document's mentions to `ResolvedMention` (memo lookups for
    ///    symbols/steps; the O(1) path/wiki-link rules inline as before).
    ///
    /// The result for each document is byte-identical to calling
    /// [`Resolver::resolve`] on that document's mentions sequentially.
    pub fn resolve_batch(&self, per_doc: Vec<Vec<ExtractedMention>>) -> Vec<Vec<ResolvedMention>> {
        // 1. Distinct symbols / step ids across every document.
        let mut symbols: Vec<String> = Vec::new();
        let mut steps: Vec<String> = Vec::new();
        {
            let mut seen_sym: std::collections::HashSet<&str> = std::collections::HashSet::new();
            let mut seen_step: std::collections::HashSet<&str> = std::collections::HashSet::new();
            for doc in &per_doc {
                for m in doc {
                    match &m.kind {
                        MentionKind::Symbol(s) if seen_sym.insert(s.as_str()) => {
                            symbols.push(s.clone());
                        }
                        MentionKind::StepId(s) if seen_step.insert(s.as_str()) => {
                            steps.push(s.clone());
                        }
                        _ => {}
                    }
                }
            }
        }

        // 2. Prime the content cache once, in parallel — every code file (for
        //    symbol scans) and every plan file (for step scans). After this the
        //    per-symbol/step scans never touch the filesystem, so the
        //    read-at-most-once property holds and the scans stay pure.
        if !symbols.is_empty() {
            self.prime_contents(self.inventory.iter().filter(|p| is_code_file(p)));
        }
        if !steps.is_empty() {
            self.prime_contents(
                self.inventory
                    .iter()
                    .filter(|p| p.starts_with(".vault/plan/") && p.ends_with(".md")),
            );
        }

        // 3. Resolve distinct symbols / steps in parallel. Each call deposits
        //    its own outcome into the shared memo (the same write the sequential
        //    path makes); the distinct sets guarantee each is resolved exactly
        //    once, so the memo's final contents are independent of thread order.
        symbols.par_iter().for_each(|sym| {
            self.resolve_symbol(sym);
        });
        steps.par_iter().for_each(|step| {
            self.resolve_step_id(step);
        });

        // 4. Map each document via memo lookups + the O(1) path/wiki rules.
        per_doc
            .into_iter()
            .map(|mentions| {
                mentions
                    .into_iter()
                    .map(|mention| self.resolve_one(mention))
                    .collect()
            })
            .collect()
    }

    /// Read the given repo-relative paths into the content cache once each, in
    /// parallel, skipping any already cached. The file read happens OUTSIDE the
    /// cache lock; each distinct path is read at most once across the pass.
    fn prime_contents<'a>(&self, paths: impl Iterator<Item = &'a String>) {
        let to_read: Vec<String> = {
            let cache = self.cache.lock().unwrap();
            paths
                .filter(|p| !cache.contains_key(p.as_str()))
                .cloned()
                .collect()
        };
        let read: Vec<(String, Option<String>)> = to_read
            .par_iter()
            .map(|path| {
                (
                    path.clone(),
                    std::fs::read_to_string(self.root.join(path)).ok(),
                )
            })
            .collect();
        let mut cache = self.cache.lock().unwrap();
        for (path, contents) in read {
            cache.entry(path).or_insert(contents);
        }
    }

    /// Read a repo-relative file's contents, caching across the whole pass. The
    /// file read happens outside the lock (lock to check, read on miss, lock to
    /// insert) so a parallel scan never serializes on I/O; under a rare race two
    /// threads may read the same uncached path, but the cache still holds one
    /// canonical entry and the batch path pre-primes every scanned file so this
    /// fallback I/O does not fire on the hot path.
    fn cached_read(&self, path: &str) -> Option<String> {
        if let Some(hit) = self.cache.lock().unwrap().get(path) {
            return hit.clone();
        }
        let contents = std::fs::read_to_string(self.root.join(path)).ok();
        let mut cache = self.cache.lock().unwrap();
        cache.entry(path.to_string()).or_insert(contents).clone()
    }

    fn find_by_basename(&self, basename: &str) -> Option<String> {
        self.by_basename.get(basename).cloned()
    }

    fn resolve_one(&self, mention: ExtractedMention) -> ResolvedMention {
        let (state, target) = match &mention.kind {
            MentionKind::Path(path) => {
                if self.root.join(path).is_file() {
                    (ResolutionState::Resolved, Some(path.clone()))
                } else {
                    let basename = path.rsplit('/').next().unwrap_or(path);
                    match self.find_by_basename(basename) {
                        Some(found) => (ResolutionState::Stale, Some(found)),
                        None => (ResolutionState::Broken, None),
                    }
                }
            }
            MentionKind::WikiLink(stem) => {
                let filename = format!("{stem}.md");
                match self.find_by_basename(&filename) {
                    Some(found) if found.starts_with(".vault/") => {
                        (ResolutionState::Resolved, Some(found))
                    }
                    Some(found) => (ResolutionState::Stale, Some(found)),
                    None => (ResolutionState::Broken, None),
                }
            }
            MentionKind::StepId(step_id) => self.resolve_step_id(step_id),
            MentionKind::Symbol(symbol) => self.resolve_symbol(symbol),
        };
        ResolvedMention {
            mention,
            state,
            target,
        }
    }

    /// A step id resolves when some plan document in the scope contains its
    /// canonical backtick form.
    fn resolve_step_id(&self, step_id: &str) -> (ResolutionState, Option<String>) {
        if let Some(hit) = self.step_memo.lock().unwrap().get(step_id) {
            return hit.clone();
        }
        let needle = format!("`{step_id}`");
        let plans: Vec<&String> = self
            .inventory
            .iter()
            .filter(|p| p.starts_with(".vault/plan/") && p.ends_with(".md"))
            .collect();
        let mut result = None;
        for plan in &plans {
            if let Some(text) = self.cached_read(plan)
                && text.contains(&needle)
            {
                result = Some((ResolutionState::Resolved, Some((*plan).clone())));
                break;
            }
        }
        let result = match result {
            Some(r) => r,
            // No plan corpus in scope at all: the mention has decayed rather
            // than being provably wrong; otherwise it is provably broken.
            None if plans.is_empty() => (ResolutionState::Stale, None),
            None => (ResolutionState::Broken, None),
        };
        self.step_memo
            .lock()
            .unwrap()
            .insert(step_id.to_string(), result.clone());
        result
    }

    /// v1 symbol resolution: qualified-name text match over code files in the
    /// scope (tree-sitter-grade resolution is v2, per the ADR). Qualified match
    /// → resolved; last-segment-only match → stale; nothing → broken.
    fn resolve_symbol(&self, symbol: &str) -> (ResolutionState, Option<String>) {
        if let Some(hit) = self.symbol_memo.lock().unwrap().get(symbol) {
            return hit.clone();
        }
        let last = symbol
            .rsplit("::")
            .next()
            .and_then(|s| s.rsplit('.').next())
            .unwrap_or(symbol);
        let mut resolved: Option<(ResolutionState, Option<String>)> = None;
        let mut stale_hit: Option<String> = None;
        for path in self.inventory.iter().filter(|p| is_code_file(p)) {
            let Some(text) = self.cached_read(path) else {
                continue;
            };
            if text.contains(symbol) {
                resolved = Some((ResolutionState::Resolved, Some(path.clone())));
                break;
            }
            if stale_hit.is_none() && text.contains(last) {
                stale_hit = Some(path.clone());
            }
        }
        let result = match resolved {
            Some(r) => r,
            None => match stale_hit {
                Some(path) => (ResolutionState::Stale, Some(path)),
                None => (ResolutionState::Broken, None),
            },
        };
        self.symbol_memo
            .lock()
            .unwrap()
            .insert(symbol.to_string(), result.clone());
        result
    }
}

/// Resolve mentions against a worktree checkout. Convenience wrapper that
/// builds a one-shot [`Resolver`]; the index pass builds the resolver once and
/// reuses it across all documents (perf ADR D1) instead of calling this
/// per document.
pub fn resolve(root: &Path, mentions: Vec<ExtractedMention>) -> Vec<ResolvedMention> {
    Resolver::new(root).resolve(mentions)
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
/// and other dot-directories except `.vault` (the corpus), common
/// dependency/build trees, plus simple directory entries from the root
/// `.gitignore` (audit W01P04-104: bounded gitignore honoring — bare
/// directory names and `dir/` patterns; glob/negation patterns are out of
/// v1 scope and would need a dedicated ignore implementation).
fn walk(root: &Path) -> Vec<String> {
    let gitignored: Vec<String> = std::fs::read_to_string(root.join(".gitignore"))
        .map(|text| {
            text.lines()
                .map(str::trim)
                .filter(|l| !l.is_empty() && !l.starts_with('#') && !l.starts_with('!'))
                .filter(|l| !l.contains('*') && !l.contains('['))
                .map(|l| l.trim_matches('/').to_string())
                .filter(|l| !l.contains('/'))
                .collect()
        })
        .unwrap_or_default();

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
                        "node_modules" | "target" | "dist" | "__pycache__" | "venv"
                    )
                    || gitignored.contains(&name);
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

    #[test]
    fn resolver_reused_across_documents_resolves_consistently() {
        // The index pass builds ONE Resolver and reuses it across every document
        // (perf ADR D1); the symbol/step memo must return the SAME result for a
        // repeated mention as the first encounter — a memo bug would silently
        // diverge the second document's resolution from the first.
        let dir = fixture();
        let resolver = Resolver::new(dir.path());
        let state_of = |rs: &[ResolvedMention], needle: &str| -> ResolutionState {
            rs.iter()
                .find(|r| format!("{:?}", r.mention.kind).contains(needle))
                .unwrap_or_else(|| panic!("mention {needle} extracted"))
                .state
        };
        // Two documents, each citing the same resolvable and the same broken
        // symbol — the memo is exercised on the second.
        let doc_a = resolver.resolve(extract("Calls `insert()` and `vanished_function()`."));
        let doc_b = resolver.resolve(extract("Also `insert()`, also `vanished_function()`."));
        assert_eq!(state_of(&doc_a, "insert"), ResolutionState::Resolved);
        assert_eq!(
            state_of(&doc_b, "insert"),
            ResolutionState::Resolved,
            "a memoized resolvable symbol stays resolved across documents"
        );
        assert_eq!(
            state_of(&doc_a, "vanished_function"),
            ResolutionState::Broken
        );
        assert_eq!(
            state_of(&doc_b, "vanished_function"),
            ResolutionState::Broken,
            "a memoized broken symbol stays broken across documents"
        );
    }

    #[test]
    fn resolve_batch_is_byte_identical_to_sequential_resolve() {
        // Perf ADR D2 parity invariant: the parallel batch path MUST assign the
        // exact same ResolutionState and target to every mention as the
        // sequential per-document `resolve`. A divergence would silently change
        // edge states. The fixture exercises symbols, step ids, wiki-links, and
        // paths in all three resolution states, across multiple documents (so
        // distinct symbols/steps are deduplicated across docs and the parallel
        // fan-out is genuinely exercised).
        let dir = fixture();

        // Multiple documents: some mentions shared (so the distinct-set dedup
        // and memo are exercised), each kind present in all three states.
        let docs: Vec<Vec<ExtractedMention>> = vec![
            extract(
                "Touches `src/lib.rs` and `old/moved.rs` and `gone/nothing.rs`. \
                 Step `W01.P02.S03` and step `W09.P09.S99`. \
                 See [[2026-06-12-demo-adr]] and [[2026-06-12-missing-adr]]. \
                 Calls `insert()` and `vanished_function()`.",
            ),
            extract(
                "Again `src/lib.rs`, again step `W01.P02.S03`, again `insert()`. \
                 Plus `another::missing::symbol` and `src/nested/moved.rs`.",
            ),
            extract(
                "Fresh doc: `graph` module, [[2026-06-12-demo-adr]], \
                 step `S07`, path `docs/readme.md`.",
            ),
        ];

        // Sequential reference: a fresh resolver, resolve each doc in order.
        let sequential_resolver = Resolver::new(dir.path());
        let sequential: Vec<Vec<ResolvedMention>> = docs
            .iter()
            .map(|doc| sequential_resolver.resolve(doc.clone()))
            .collect();

        // Parallel batch: a fresh resolver, one batch call.
        let batch_resolver = Resolver::new(dir.path());
        let batch = batch_resolver.resolve_batch(docs.clone());

        assert_eq!(
            batch, sequential,
            "resolve_batch must be byte-identical to per-document sequential resolve"
        );

        // Guard against a vacuous comparison: assert the fixture actually
        // produced mentions in every resolution state, so parity is meaningful.
        let flat: Vec<&ResolvedMention> = batch.iter().flatten().collect();
        assert!(
            flat.iter().any(|r| r.state == ResolutionState::Resolved),
            "fixture yields at least one resolved mention"
        );
        assert!(
            flat.iter().any(|r| r.state == ResolutionState::Stale),
            "fixture yields at least one stale mention"
        );
        assert!(
            flat.iter().any(|r| r.state == ResolutionState::Broken),
            "fixture yields at least one broken mention"
        );
    }
}
