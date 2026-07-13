//! Verb implementations — thin shells over the shared query core (D6.1).
//! No domain logic lives here: each verb resolves its scope, drives the
//! engine crates, and renders an envelope.

pub mod events;
pub mod graph;
pub mod index;
pub mod launch;
pub mod lifecycle;
pub mod map;
pub mod node;
pub mod provision;
pub mod status;

use std::path::PathBuf;

use engine_model::ScopeRef;

/// The per-invocation context: scope resolution per request (stateless
/// scope, engine-spec §2.3 — the launch directory is only the implicit
/// `--scope` fallback).
pub struct Ctx {
    /// The worktree root the verb operates on.
    pub root: PathBuf,
    pub scope: ScopeRef,
    pub json: bool,
    /// Precise declared-tier status recorded by `indexed_graph()` when an
    /// indexing verb ran: `Some(None)` = core's graph was ingested,
    /// `Some(Some(reason))` = it degraded. `None` = no index ran this
    /// invocation (e.g. `map`), so the envelope falls back to the
    /// `core_reason()` reachability probe. Interior-mutable: the CLI is
    /// single-threaded and the verb runs before the envelope is rendered.
    declared_status: std::cell::RefCell<Option<Option<String>>>,
}

#[derive(Debug, thiserror::Error)]
pub enum CliError {
    #[error(
        "scope `{0}` is not a usable worktree (must be an existing directory inside a git workspace)"
    )]
    BadScope(String),
    #[error("no .vault corpus under `{0}`")]
    NoVault(String),
    #[error("{0}")]
    Git(#[from] ingest_git::workspace::GitError),
    #[error("{0}")]
    Index(#[from] engine_graph::index::IndexError),
    #[error("{0}")]
    Store(#[from] engine_store::StoreError),
    #[error("{0}")]
    Filter(#[from] engine_query::filter::FilterError),
    #[error("{0}")]
    Other(String),
}

impl CliError {
    /// Exit code: scope/corpus errors are usage-class (2); everything else
    /// is a command failure (1).
    pub fn exit_code(&self) -> u8 {
        match self {
            CliError::BadScope(_) | CliError::NoVault(_) => 2,
            _ => 1,
        }
    }

    /// Stable machine-readable error kind for the envelope.
    pub fn kind(&self) -> &'static str {
        match self {
            CliError::BadScope(_) => "bad-scope",
            CliError::NoVault(_) => "no-vault",
            _ => "command-failed",
        }
    }
}

impl Ctx {
    /// Resolve the per-request scope: an explicit `--scope` worktree path,
    /// or the launch directory as the advertised fallback. The scope is
    /// validated against the discovered workspace's worktree set
    /// (contract §3) — an arbitrary directory is not a scope.
    pub fn resolve(scope_arg: Option<&str>, json: bool) -> Result<Ctx, CliError> {
        let root = match scope_arg {
            Some(path) => {
                let p = PathBuf::from(path);
                if !p.is_dir() {
                    return Err(CliError::BadScope(path.to_string()));
                }
                std::fs::canonicalize(&p).map_err(|_| CliError::BadScope(path.to_string()))?
            }
            None => std::env::current_dir().map_err(|e| CliError::Other(e.to_string()))?,
        };
        // Validate against discover + enumerate: the scope must resolve to
        // a git workspace AND name (or sit inside) one of its worktrees.
        let workspace = ingest_git::workspace::Workspace::discover(&root)
            .map_err(|_| CliError::BadScope(clean_path(&root)))?;
        // Path-only resolution (worktree-enumeration sweep): we only match the
        // launch dir against a worktree root, so list the roots cheaply rather
        // than inspecting (status diff + ahead/behind walk) every worktree.
        let roots = ingest_git::worktrees::list_roots(&workspace)?;
        // On Windows the launch dir (from `current_dir()`, which preserves the 8.3
        // short form) and git's worktree roots can disagree on short vs long form
        // when the user name is long (`C:\Users\RUNNER~1\...`), so resolve both
        // through `canonicalize` before matching. Non-Windows keeps the prior
        // string normalization exactly.
        let canon = |p: &std::path::Path| -> String {
            #[cfg(windows)]
            if let Ok(c) = std::fs::canonicalize(p) {
                return clean_path(&c);
            }
            clean_path(p)
        };
        let cleaned = canon(&root);
        // The scope is the WORKTREE root, even when launched from deep inside it.
        let root = roots
            .into_iter()
            .find(|wt_path| {
                let wt_path = canon(wt_path);
                cleaned == wt_path || cleaned.starts_with(&format!("{wt_path}/"))
            })
            .ok_or_else(|| CliError::BadScope(cleaned.clone()))?;
        let scope = ScopeRef::Worktree {
            path: clean_path(&root),
        };
        Ok(Ctx {
            root,
            scope,
            json,
            declared_status: std::cell::RefCell::new(None),
        })
    }

    /// The declared-tier reason for the envelope: the PRECISE result when an
    /// indexing verb ran this invocation (recorded by `indexed_graph()`), or
    /// the `core_reason()` reachability probe as a fallback for verbs that
    /// build no graph. Precise beats proxy, and the precise path also avoids
    /// a redundant core subprocess on indexing verbs.
    pub fn declared_reason(&self) -> Option<String> {
        match &*self.declared_status.borrow() {
            Some(precise) => precise.clone(),
            None => self.core_reason(),
        }
    }

    pub fn vault_root(&self) -> PathBuf {
        self.root.join(".vault")
    }

    pub fn require_vault(&self) -> Result<(), CliError> {
        if self.vault_root().is_dir() {
            Ok(())
        } else {
            Err(CliError::NoVault(clean_path(&self.root)))
        }
    }

    /// Open (creating as needed) the engine store for this scope.
    pub fn open_store(&self) -> Result<engine_store::Store, CliError> {
        Ok(engine_store::Store::open(&self.vault_root())?)
    }

    /// The truthful rag degradation reason for this scope, if degraded.
    pub fn rag_reason(&self) -> Option<String> {
        match rag_client::client::discover(&self.vault_root()).0 {
            rag_client::RagAvailability::Available => None,
            rag_client::RagAvailability::Unavailable { reason } => Some(reason),
        }
    }

    /// Core REACHABILITY proxy — the declared tier's fallback availability
    /// signal for verbs that build no graph (e.g. `map`). It probes the
    /// light `vault stats`, which is weaker than the declared tier's true
    /// source (`vault graph`): `stats` succeeding does NOT guarantee a
    /// `graph` ingestion would, so this can over-report availability. Verbs
    /// that index use the precise [`Ctx::declared_reason`] path instead.
    /// `None` = reachable; `Some(reason)` = degrade.
    pub fn core_reason(&self) -> Option<String> {
        let runner = ingest_core::runner::CoreRunner::detect();
        match runner.run_json(
            &self.root,
            &["vault", "stats"],
            &["vaultspec.vault.stats.v1"],
        ) {
            Ok(_) => None,
            // The full error embeds core's stderr — absolute paths and a
            // sibling-workspace hint — which must not reach the wire `tiers`
            // block (sweep MEDIUM, 2026-06-13). Log the detail; surface only the
            // leak-free category.
            Err(e) => {
                eprintln!("vaultspec: declared tier unavailable — core stats probe failed: {e}");
                Some(e.wire_reason())
            }
        }
    }

    /// Build and index the scope's graph (the cold one-shot pipeline —
    /// usable without any resident service, D2.4).
    pub fn indexed_graph(
        &self,
    ) -> Result<(engine_graph::LinkageGraph, engine_graph::index::IndexStats), CliError> {
        self.require_vault()?;
        let store = self.open_store()?;
        let (graph, stats) =
            engine_graph::index::index_worktree(&self.root, &self.scope, &store, now_ms())?;
        // Record the PRECISE declared-tier outcome so the envelope reports it
        // exactly (not the weaker `core_reason` proxy) — and so we don't shell
        // core a second time just to fill the tiers block.
        *self.declared_status.borrow_mut() = Some(stats.declared_unavailable.clone());
        Ok((graph, stats))
    }
}

/// Render a path for the wire: the canonical scope-token form (POSIX
/// separators, no Windows extended-length prefix). Delegates to the single
/// shared canonicaliser in `engine_model` (audit E3) so the CLI and serve
/// doors mint identity-bearing scope tokens identically.
pub use engine_model::scope_token as clean_path;

/// Wall-clock ms since the epoch (`engine_model::Timestamp` unit).
pub use engine_model::now_ms;
