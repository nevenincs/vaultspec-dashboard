//! The read-only `/ops/git` pass-through and the changed-files SUMMARY projection
//! (extracted from `routes/ops.rs` 2026-07-12; dashboard-pipeline-wire W04 +
//! changes-summary-projection).
//!
//! Every whitelisted git verb is a pure read of the working tree — NO mutating
//! verb (add/commit/checkout/reset/stash) is reachable, by construction
//! (`engine-read-and-infer`). The `status`/`numstat`/`diff`/`histdiff` verbs
//! forward git's stdout VERBATIM for the client to parse. The `changes-summary`
//! verb runs the SAME two reads (`status` porcelain + `numstat`) but reduces them
//! SERVER-SIDE into the collapsed-fold rollup (`{files, documents, additions,
//! deletions, clean}`), so a cold load rendering only the fold header need not
//! ship the full 200 KB+ of raw git text (wire-contract: displayed counts are
//! engine-computed over the parsed set, not re-derived from a client narrow).

use std::sync::Arc;
use std::time::Duration;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde_json::{Value, json};

use super::ops::{SIBLING_STDOUT_CAP, SIBLING_TIMEOUT};
use crate::app::{AppState, ScopeCell};
use crate::bounded_child::{BoundedLimits, CapPolicy, run_bounded};

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

/// The READ-ONLY git whitelist (dashboard-pipeline-wire W04.P09.S48), mirroring
/// `CORE_WHITELIST` / `RAG_WHITELIST`: porcelain status (per-file `XY`), numstat
/// (`+adds`/`-dels` per file), and unified diff for a path. Every verb is a pure
/// read of the working tree — NO mutating git verb (add, commit, checkout,
/// reset, stash) is reachable, by construction (`engine-read-and-infer`). The
/// `diff` verb takes a validated path argument appended by `git_args_for`; the
/// others take none.
///
/// `--no-color` keeps the output machine-parseable; `--porcelain=v1` /
/// `-z`-free porcelain is the stable per-file `XY` format the diff browser
/// consumes. No working-tree mutation flag is ever present.
const GIT_WHITELIST: &[(&str, &[&str])] = &[
    ("status", &["status", "--porcelain=v1", "--branch"]),
    // numstat is HEAD-relative (`git diff HEAD`), so the per-file line tallies
    // cover BOTH staged (index-vs-HEAD) and unstaged (worktree-vs-index) changes
    // in one read — matching the full working-tree picture `status --porcelain`
    // reports. A bare `git diff --numstat` saw only unstaged changes, so every
    // staged file reconciled to null tallies (dashboard git-backend audit HIGH-1).
    // Untracked files are still absent (not in HEAD); they carry no diff tally by
    // construction and the client renders them without one.
    ("numstat", &["diff", "HEAD", "--numstat", "--no-color"]),
    // The per-file working-tree diff is HEAD-relative too, so a STAGED change still
    // renders its diff (a bare `git diff -- <path>` showed nothing once a change was
    // staged). Combined staged+unstaged vs HEAD is the "what changed in this file
    // since the last commit" the browser wants; `git_args_for` appends `-- <path>`.
    ("diff", &["diff", "HEAD", "--no-color"]),
    // The bounded read-only HISTORICAL text diff (figma-parity-reconciliation
    // S14): a two-rev `git diff <from> <to> -- <path>` over the git object DB.
    // Pure read-and-infer — the engine implements no diff algorithm and exposes
    // no mutating git verb. Both revs and the path are validated before they are
    // appended (`git_args_for`); the fixed args carry no write flag.
    ("histdiff", &["diff", "--no-color"]),
];

/// The composite READ-ONLY summary verb: it is NOT a single git subcommand (so it
/// is deliberately absent from [`GIT_WHITELIST`] and its read-only invariant test),
/// but a server-side reduction of the `status` + `numstat` reads whose fixed args
/// ARE whitelisted above. Intercepted before the whitelist lookup in [`ops_git`].
const GIT_CHANGES_SUMMARY_VERB: &str = "changes-summary";

/// Verbs in [`GIT_WHITELIST`] that accept a single trailing path argument:
/// `diff` (working-tree) and `histdiff` (two-rev historical). The others are
/// argument-free. A verb not in this set forwards its fixed args verbatim and
/// rejects any supplied path.
const GIT_PATH_VERBS: &[&str] = &["diff", "histdiff"];

/// Verbs in [`GIT_WHITELIST`] that take a two-rev range (`<from> <to>`) before
/// the `-- <path>` separator. Only `histdiff` does; the others take no rev.
const GIT_REV_VERBS: &[&str] = &["histdiff"];

/// The client's changed-files row cap (mirrors the frontend
/// `GIT_CHANGED_FILES_MAX_ROWS`): the summary reduces the SAME bounded window the
/// client's `parseGitStatus`/`parseGitNumstat` do, so the engine rollup reproduces
/// today's header numbers exactly AND stays a bounded accumulator (resource-bounds:
/// every accumulator bounded at creation; the 8 MiB subprocess cap bounds the input
/// upstream, this bounds the parsed set).
const GIT_CHANGED_FILES_MAX_ROWS: usize = 512;

/// The client's per-path ceiling (mirrors the frontend `GIT_PATH_MAX_CHARS`): an
/// over-long path is dropped from the tally exactly as the client parser drops it.
const GIT_PATH_MAX_CHARS: usize = 4096;

/// Locate the git binary: the PATH `git` (every dev/CI host has it). Mirrors
/// `rag_invocation`'s PATH-first shape. NO working-tree mutation flag is ever
/// appended anywhere — the whitelist args are the only args, plus a validated
/// path for the `diff` verb.
fn git_invocation() -> Vec<String> {
    vec!["git".into()]
}

/// Validate the optional `path` argument for the `diff` verb (W04.P09.S50): only
/// a bounded, in-tree relative path may be forwarded, never an arbitrary git
/// argument channel. Rejects absolute paths, parent-dir traversal (`..`),
/// and any token that begins with `-` (which git would read as a flag/option,
/// the injection vector this guard closes). Returns the validated path, or an
/// error envelope.
fn validate_diff_path(state: &AppState, path: &str) -> Result<String, (StatusCode, Json<Value>)> {
    let bad = path.is_empty()
        || path.starts_with('-')
        || path.starts_with('/')
        || path.starts_with('\\')
        // A Windows drive-absolute path (`C:\...`).
        || path.chars().nth(1) == Some(':')
        || path.split(['/', '\\']).any(|seg| seg == "..");
    if bad {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!(
                "diff path `{path}` must be a bounded, in-tree relative path \
                 (no leading `-`, no absolute path, no `..` traversal)"
            ),
        ));
    }
    Ok(path.to_string())
}

/// Validate a single git revision token for the historical-diff verb
/// (figma-parity-reconciliation S14): a rev names a commit/ref/tag the two-rev
/// `git diff` reads, never a flag or an argument channel. Rejects an empty
/// token, anything beginning with `-` (which git would read as a flag — the
/// injection vector), and a `..`/`...` range expression (the route forms the
/// range from two SEPARATE validated revs, so a smuggled range is rejected).
/// The token is otherwise a bounded ref-grammar string; an unresolvable rev is
/// caught by git itself and degraded as a sibling fault, never a 500.
fn validate_rev(state: &AppState, rev: &str) -> Result<String, (StatusCode, Json<Value>)> {
    let bad = rev.is_empty()
        || rev.starts_with('-')
        || rev.contains("..")
        || rev.contains(char::is_whitespace);
    if bad {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!(
                "git rev `{rev}` must be a single bounded revision \
                 (no leading `-`, no `..` range, no whitespace)"
            ),
        ));
    }
    Ok(rev.to_string())
}

/// Build the full git argument vector for a whitelisted verb: its fixed
/// whitelist args, plus — for a rev verb — the two validated revs, plus — for a
/// path verb — the `--` separator and the validated path so the path can never
/// be read as a flag. A path or revs supplied to a verb that does not take them
/// is rejected (no silent ignore).
fn git_args_for(
    state: &AppState,
    verb: &str,
    fixed: &[&str],
    path: Option<&str>,
    revs: Option<(&str, &str)>,
) -> Result<Vec<String>, (StatusCode, Json<Value>)> {
    let mut args: Vec<String> = fixed.iter().map(|s| s.to_string()).collect();
    // A two-rev historical diff appends `<from> <to>` BEFORE the `-- <path>`
    // separator. Each rev is validated; a rev verb without revs is rejected, and
    // a non-rev verb that is handed revs is rejected.
    match (GIT_REV_VERBS.contains(&verb), revs) {
        (true, Some((from, to))) => {
            args.push(validate_rev(state, from)?);
            args.push(validate_rev(state, to)?);
        }
        (true, None) => {
            return Err(super::api_error(
                state,
                StatusCode::BAD_REQUEST,
                format!("git `{verb}` requires `from` and `to` revisions"),
            ));
        }
        (false, Some(_)) => {
            return Err(super::api_error(
                state,
                StatusCode::BAD_REQUEST,
                format!("git `{verb}` takes no revisions"),
            ));
        }
        (false, None) => {}
    }
    match (GIT_PATH_VERBS.contains(&verb), path) {
        (true, Some(p)) => {
            let validated = validate_diff_path(state, p)?;
            args.push("--".into());
            args.push(validated);
        }
        (true, None) => {
            return Err(super::api_error(
                state,
                StatusCode::BAD_REQUEST,
                format!("git `{verb}` requires a `path` argument"),
            ));
        }
        (false, Some(_)) => {
            return Err(super::api_error(
                state,
                StatusCode::BAD_REQUEST,
                format!("git `{verb}` takes no path argument"),
            ));
        }
        (false, None) => {}
    }
    Ok(args)
}

/// Run a whitelisted, read-only git invocation under the same bounds as the
/// sibling runner (timeout + stdout cap) but WITHOUT appending `--json` (git
/// has no such flag): git output is text, returned verbatim as a string for the
/// client to parse. Mirrors `run_sibling_bounded`'s lifecycle exactly — spawn,
/// bounded+timed read, kill-on-bound, exit-status check — so a hung or runaway
/// git degrades the same way a sibling does.
async fn run_git_bounded(
    state: &AppState,
    cell: &ScopeCell,
    program: &[String],
    args: &[String],
    timeout: Duration,
    cap: u64,
) -> Result<(String, bool), (StatusCode, Json<Value>)> {
    let cwd = cell.root.clone();
    let mut command = tokio::process::Command::new(&program[0]);
    command.args(&program[1..]).args(args).current_dir(&cwd);
    let limits = BoundedLimits { cap, timeout };
    // Cap reached: the shared runner stops the child and hands back the BOUNDED
    // PARTIAL rather than failing the whole read with a 502. The caller marks the
    // response truncated so the client degrades honestly (shows what it got + a
    // truncation notice) instead of rendering a healthy-looking transport error.
    // Both streams are drained, so a git that is chatty on stderr (progress,
    // advice, warnings) can never wedge on a full pipe.
    let run = run_bounded(command, None, limits, CapPolicy::KeepPartial)
        .await
        .map_err(|fault| super::bounded_fault_error(state, &program[0], limits, fault))?;
    // A read that stayed under the cap still has its exit status checked — a
    // genuine git fault is a degraded error, not a silent empty result.
    if !run.truncated && !run.success {
        return Err(super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!("{} exited {:?}", program[0], run.code),
        ));
    }
    Ok((run.stdout_lossy().to_string(), run.truncated))
}

/// The optional request body for `/ops/git/{verb}`: the `diff`/`histdiff`
/// verb's path, plus the two revs the `histdiff` (historical) verb diffs
/// between. Absent for argument-free verbs (status, numstat, changes-summary).
/// The body is optional so a GET-shaped status call need not carry one.
#[derive(serde::Deserialize, Default)]
pub struct GitOpBody {
    /// Optional explicit worktree scope. Absent preserves the active-scope fallback
    /// for legacy callers; frontend scoped caches always send it.
    #[serde(default)]
    pub scope: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
    /// The `from` revision for the two-rev historical diff (`histdiff`).
    #[serde(default)]
    pub from: Option<String>,
    /// The `to` revision for the two-rev historical diff (`histdiff`).
    #[serde(default)]
    pub to: Option<String>,
}

/// POST `/ops/git/{verb}` — the read-only git pass-through (dashboard-pipeline-
/// wire W04.P10.S52; historical diff figma-parity-reconciliation S14; summary
/// changes-summary-projection): forward a whitelisted, read-only git verb through
/// the bounded runner and the shared envelope helper, returning git's output
/// VERBATIM inside `{data: {output, verb}}` with the tiers block. The `histdiff`
/// verb runs a two-rev `git diff <from> <to> -- <path>` over the object DB (both
/// revs and the path validated). The `changes-summary` verb (intercepted first)
/// reduces the status + numstat reads SERVER-SIDE into the fold-header rollup. A
/// non-whitelisted verb 403s before any subprocess; a git fault degrades to a
/// tiers-carrying error envelope. The engine implements no diff algorithm and
/// exposes no mutating git verb — `engine-read-and-infer`.
pub async fn ops_git(
    State(state): State<Arc<AppState>>,
    Path(verb): Path<String>,
    body: Option<Json<GitOpBody>>,
) -> ApiResult {
    let GitOpBody {
        scope,
        path,
        from,
        to,
    } = body.map(|Json(b)| b).unwrap_or_default();
    let cell = match scope.as_deref() {
        Some(scope) => crate::registry::get_or_build(&state, scope)
            .map_err(|reason| super::api_error(&state, StatusCode::BAD_REQUEST, reason))?,
        None => state.active_cell(),
    };
    // The composite summary verb reduces the SAME two reads server-side; it is not
    // a single subcommand, so it is dispatched before the single-verb whitelist.
    if verb == GIT_CHANGES_SUMMARY_VERB {
        return changes_summary(&state, &cell).await;
    }
    let Some((name, fixed)) = GIT_WHITELIST.iter().find(|(name, _)| *name == verb) else {
        return Err(super::api_error(
            &state,
            StatusCode::FORBIDDEN,
            format!("git verb `{verb}` is not whitelisted (read-only ops/git)"),
        ));
    };
    // A two-rev historical diff carries both revs; either alone is a 400 before
    // any subprocess. `git_args_for` rejects revs handed to a non-rev verb.
    let revs = match (from.as_deref(), to.as_deref()) {
        (Some(f), Some(t)) => Some((f, t)),
        (None, None) => None,
        _ => {
            return Err(super::api_error(
                &state,
                StatusCode::BAD_REQUEST,
                "a historical diff requires BOTH `from` and `to` revisions".to_string(),
            ));
        }
    };
    let args = git_args_for(&state, name, fixed, path.as_deref(), revs)?;
    let (output, truncated) = run_git_bounded(
        &state,
        &cell,
        &git_invocation(),
        &args,
        SIBLING_TIMEOUT,
        SIBLING_STDOUT_CAP,
    )
    .await?;
    // Honest bounded-output block when git exceeded the stdout cap: the client
    // renders the partial it got plus a truncation notice rather than a transport
    // error (graph-queries-are-bounded-by-default applied to the git pass-through).
    let truncated_block = truncated.then(|| {
        json!({
            "returned_chars": output.len(),
            "reason": format!(
                "git output exceeded {SIBLING_STDOUT_CAP} bytes; bounded to the cap — narrow the request"
            ),
        })
    });
    // S15: the success envelope carries the per-tier degradation block through
    // the shared `envelope` helper, and every error path above degrades through
    // `api_error` (which always attaches the tiers block) — so the historical
    // diff route, like every other front door, carries tiers on success AND
    // error (every-wire-response-carries-the-tiers-block). No body is ever
    // hand-built; the histdiff verb shares this single envelope construction.
    let mut data = json!({"verb": name, "output": output});
    if let Some(block) = truncated_block {
        data["truncated"] = block;
    }
    Ok(super::envelope(data, super::query_tiers(&cell), None))
}

// --- changed-files summary reduction (changes-summary-projection) ----------------
//
// The collapsed "Changes" fold header shows exactly `N files · M documents` and
// `+A −D`. It USED to be derived on the client from the full porcelain `status`
// (112 KB) + `numstat` (115 KB) text, parsed and tallied on every cold load. This
// reduction runs the SAME two reads server-side and returns only the five rollup
// numbers, so the header costs a few bytes instead of a quarter-megabyte. The
// reducer reproduces the client's `parseGitStatus`/`parseGitNumstat`/`mergeNumstat`
// split EXACTLY (`documents` = changed paths under `.vault/`, `files` = the rest;
// additions/deletions summed over the status entries with numstat reconciled by
// path, renames tracked to the new path, binary entries carrying no tally), within
// the same 512-row window the client parser bounds itself to.

/// The five-number fold-header rollup (wire data for `changes-summary`).
struct ChangesSummary {
    /// Non-vault changed paths (source/config/etc.).
    files: u64,
    /// Changed paths under `.vault/` (the corpus documents).
    documents: u64,
    /// Summed numstat additions across the changed set (binary/untracked → 0).
    additions: u64,
    /// Summed numstat deletions across the changed set (binary/untracked → 0).
    deletions: u64,
    /// True when the working tree carries no reportable change.
    clean: bool,
}

/// True when a repo-relative path is under the `.vault/` corpus — the exact split
/// the client's `isVaultEntry` (`/(^|\/)\.vault\//`) applies.
fn is_vault_path(path: &str) -> bool {
    path.starts_with(".vault/") || path.contains("/.vault/")
}

/// A valid porcelain code is two chars, each one of the porcelain status letters
/// (mirrors the client's `PORCELAIN_CODES` set).
fn is_porcelain_code(code: &[char]) -> bool {
    const CODES: &[char] = &[' ', 'M', 'A', 'D', 'R', 'C', '?', 'U'];
    code.len() == 2 && CODES.contains(&code[0]) && CODES.contains(&code[1])
}

/// Trim + bound a git path the way the client's `normalizeGitPath` does; `None`
/// drops the entry from the tally.
fn normalize_git_path(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty() && trimmed.chars().count() <= GIT_PATH_MAX_CHARS)
        .then(|| trimmed.to_string())
}

/// Parse `git status --porcelain=v1 --branch` into `(path, is_vault)` entries,
/// mirroring the client's `parseGitStatus`: skip the `## branch` header and blank
/// lines, require the `XY ` prefix + a valid code, track a rename's `old -> new`
/// to the NEW path, and bound the set to the client's row cap.
fn parse_status_entries(output: &str) -> Vec<(String, bool)> {
    let mut entries = Vec::new();
    for raw in output.split('\n') {
        if raw.trim().is_empty() || raw.starts_with("## ") {
            continue;
        }
        let chars: Vec<char> = raw.chars().collect();
        // Porcelain v1: two status chars, a separator space, then the path.
        if chars.len() < 4 || chars[2] != ' ' {
            continue;
        }
        if !is_porcelain_code(&chars[0..2]) {
            continue;
        }
        let mut path: String = chars[3..].iter().collect();
        // Rename/copy: `old -> new` — track the new path.
        if let Some(idx) = path.find(" -> ") {
            path = path[idx + 4..].to_string();
        }
        let Some(normalized) = normalize_git_path(&path) else {
            continue;
        };
        let vault = is_vault_path(&normalized);
        entries.push((normalized, vault));
        if entries.len() >= GIT_CHANGED_FILES_MAX_ROWS {
            break;
        }
    }
    entries
}

/// Parse a decimal numstat count; `-` (binary) and any non-digit token yield
/// `None`, mirroring the client's `normalizeGitNumstatCount` + binary handling.
fn parse_numstat_count(value: &str) -> Option<u64> {
    if value == "-" {
        return None;
    }
    value.parse::<u64>().ok()
}

/// Parse `git diff HEAD --numstat` into a path → `(adds, dels)` map, mirroring the
/// client's `parseGitNumstat`: `adds\tdels\tpath` per line, a rename's `old => new`
/// (braced or bare) reduced to the new path, a `-\t-` binary row keeping null
/// tallies, and a row whose non-`-` count fails to parse dropped entirely.
fn parse_numstat(output: &str) -> std::collections::HashMap<String, (Option<u64>, Option<u64>)> {
    let mut tallies = std::collections::HashMap::new();
    for raw in output.split('\n') {
        if raw.is_empty() {
            continue;
        }
        let parts: Vec<&str> = raw.split('\t').collect();
        if parts.len() < 3 {
            continue;
        }
        let adds_str = parts[0];
        let dels_str = parts[1];
        let mut path = parts[2..].join("\t");
        // numstat renames render as `old => new` or `pre{old => new}post`; key on
        // the new path the status list also tracks.
        if path.contains('{') && path.contains(" => ") {
            path = reduce_braced_rename(&path);
        } else if path.contains(" => ") {
            path = path.rsplit(" => ").next().unwrap_or(&path).to_string();
        }
        let Some(normalized) = normalize_git_path(&path) else {
            continue;
        };
        let adds = parse_numstat_count(adds_str);
        let dels = parse_numstat_count(dels_str);
        // A non-`-` token that failed to parse is a malformed row: drop it whole,
        // exactly as the client parser does (never a half-read tally).
        if (adds_str != "-" && adds.is_none()) || (dels_str != "-" && dels.is_none()) {
            continue;
        }
        tallies.insert(normalized, (adds, dels));
        if tallies.len() >= GIT_CHANGED_FILES_MAX_ROWS {
            break;
        }
    }
    tallies
}

/// Reduce a braced numstat rename (`pre{old => new}post` → `prenewpost`), matching
/// the client's `path.replace(/\{[^}]* => ([^}]*)\}/, "$1").replace(/ => /, "")`.
fn reduce_braced_rename(path: &str) -> String {
    let Some(open) = path.find('{') else {
        return path.replace(" => ", "");
    };
    let Some(close_rel) = path[open..].find('}') else {
        return path.replace(" => ", "");
    };
    let close = open + close_rel;
    let inner = &path[open + 1..close];
    let new = inner.rsplit(" => ").next().unwrap_or(inner);
    let reduced = format!("{}{}{}", &path[..open], new, &path[close + 1..]);
    reduced.replace(" => ", "")
}

/// Reduce parsed status + numstat text into the fold-header rollup, reconciling
/// numstat tallies onto the status entries by path (the client's `mergeNumstat`),
/// then summing additions/deletions across the changed set and splitting
/// vault-vs-file counts.
fn git_changes_summary(status_output: &str, numstat_output: &str) -> ChangesSummary {
    let entries = parse_status_entries(status_output);
    let tallies = parse_numstat(numstat_output);
    let mut files = 0u64;
    let mut documents = 0u64;
    let mut additions = 0u64;
    let mut deletions = 0u64;
    for (path, vault) in &entries {
        if *vault {
            documents += 1;
        } else {
            files += 1;
        }
        // A status entry with no numstat row (untracked) or a binary row (`-\t-`,
        // null tallies) contributes 0 — the client's `file.adds ?? 0` reduction.
        if let Some((adds, dels)) = tallies.get(path) {
            additions += adds.unwrap_or(0);
            deletions += dels.unwrap_or(0);
        }
    }
    ChangesSummary {
        files,
        documents,
        additions,
        deletions,
        clean: entries.is_empty(),
    }
}

/// Run the `status` + `numstat` reads (both bounded — output cap + wall-clock
/// timeout — the same plumbing the verbatim pass-through uses) and return the
/// reduced fold-header rollup inside the shared envelope with the tiers block.
async fn changes_summary(state: &AppState, cell: &ScopeCell) -> ApiResult {
    let status_args = git_args_for(state, "status", whitelisted_fixed("status"), None, None)?;
    let (status_output, _) = run_git_bounded(
        state,
        cell,
        &git_invocation(),
        &status_args,
        SIBLING_TIMEOUT,
        SIBLING_STDOUT_CAP,
    )
    .await?;
    let numstat_args = git_args_for(state, "numstat", whitelisted_fixed("numstat"), None, None)?;
    let (numstat_output, _) = run_git_bounded(
        state,
        cell,
        &git_invocation(),
        &numstat_args,
        SIBLING_TIMEOUT,
        SIBLING_STDOUT_CAP,
    )
    .await?;
    let summary = git_changes_summary(&status_output, &numstat_output);
    let data = json!({
        "files": summary.files,
        "documents": summary.documents,
        "additions": summary.additions,
        "deletions": summary.deletions,
        "clean": summary.clean,
    });
    Ok(super::envelope(data, super::query_tiers(cell), None))
}

/// The fixed base args for a whitelisted verb (the composite summary reuses the
/// `status`/`numstat` entries verbatim). Both names are compile-time whitelist
/// members, so the lookup never fails.
fn whitelisted_fixed(name: &str) -> &'static [&'static str] {
    GIT_WHITELIST
        .iter()
        .find(|(n, _)| *n == name)
        .map(|(_, args)| *args)
        .expect("whitelist member")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app::AppState;
    use axum::extract::{Path, State};

    // --- W04: read-only /ops/git pass-through -------------------------------

    /// A minimal warmed state over a NON-git temp dir (mirrors the ops.rs
    /// `sibling_state`): the pure-argv/validation unit tests and the 403/fault
    /// integration tests only need a scope cell, never a real repo.
    fn no_git_state() -> (tempfile::TempDir, Arc<AppState>) {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
        let state = crate::app::build_state(dir.path().to_path_buf());
        (dir, state)
    }

    #[test]
    fn every_whitelisted_git_verb_is_read_only_and_no_mutating_verb_is_reachable() {
        // W04.P09.S51: every whitelisted git verb is a pure read; no mutating
        // git verb (add/commit/checkout/reset/stash) is reachable, and no
        // working-tree mutation flag is present in any whitelist entry.
        const MUTATING: &[&str] = &[
            "add",
            "commit",
            "checkout",
            "reset",
            "stash",
            "rm",
            "mv",
            "merge",
            "rebase",
            "push",
            "pull",
            "fetch",
            "clean",
            "apply",
            "restore",
            "switch",
            "tag",
            "branch",
            "cherry-pick",
            "revert",
            "gc",
            "prune",
            "init",
            "clone",
            "config",
        ];
        const READ_ONLY_FIRST_ARGS: &[&str] = &["status", "diff"];
        for (verb, args) in GIT_WHITELIST {
            // The leading git subcommand is read-only.
            let first = args[0];
            assert!(
                READ_ONLY_FIRST_ARGS.contains(&first),
                "whitelist verb `{verb}` leads with a non-read subcommand `{first}`"
            );
            assert!(
                !MUTATING.contains(&first),
                "whitelist verb `{verb}` is a mutating git subcommand"
            );
            // No argument is a mutating subcommand or a write flag.
            for arg in *args {
                assert!(
                    !MUTATING.contains(arg),
                    "whitelist verb `{verb}` carries the mutating token `{arg}`"
                );
            }
        }
        // A mutating verb name is simply not in the whitelist (so it 403s).
        for m in MUTATING {
            assert!(
                !GIT_WHITELIST.iter().any(|(name, _)| name == m),
                "mutating verb `{m}` must not be whitelisted"
            );
        }
    }

    #[test]
    fn diff_path_validation_rejects_flags_absolute_and_traversal() {
        // W04.P09.S50: the diff path argument is bounded — no leading `-`
        // (flag injection), no absolute path, no `..` traversal.
        let (_dir, state) = no_git_state();
        for bad in [
            "",
            "--output=/etc/passwd",
            "-x",
            "/etc/passwd",
            "C:\\Windows\\System32",
            "../../secret",
            "a/../../b",
        ] {
            assert!(
                validate_diff_path(&state, bad).is_err(),
                "`{bad}` must be rejected"
            );
        }
        // A bounded in-tree relative path is accepted.
        assert_eq!(
            validate_diff_path(&state, "src/lib.rs").unwrap(),
            "src/lib.rs"
        );
        assert_eq!(
            validate_diff_path(&state, ".vault/plan/x.md").unwrap(),
            ".vault/plan/x.md"
        );
    }

    #[test]
    fn git_args_for_appends_a_dash_dash_path_only_for_the_diff_verb() {
        // W04.P09: the diff verb gets `-- <path>` so a path can never be read as
        // a flag; non-path verbs reject a supplied path; diff requires one.
        let (_dir, state) = no_git_state();
        let diff_args = git_args_for(
            &state,
            "diff",
            &["diff", "--no-color"],
            Some("src/a.rs"),
            None,
        )
        .unwrap();
        assert_eq!(diff_args, vec!["diff", "--no-color", "--", "src/a.rs"]);
        // status takes no path.
        let status_args =
            git_args_for(&state, "status", &["status", "--porcelain=v1"], None, None).unwrap();
        assert_eq!(status_args, vec!["status", "--porcelain=v1"]);
        // status with a path is rejected, diff with no path is rejected.
        assert!(git_args_for(&state, "status", &["status"], Some("x"), None).is_err());
        assert!(git_args_for(&state, "diff", &["diff"], None, None).is_err());
    }

    #[test]
    fn histdiff_builds_a_two_rev_diff_with_a_dash_dash_path() {
        // S14: histdiff forms `diff --no-color <from> <to> -- <path>` from two
        // SEPARATE validated revs; the path still follows `--` so it can never be
        // read as a flag, and the revs precede the separator.
        let (_dir, state) = no_git_state();
        let args = git_args_for(
            &state,
            "histdiff",
            &["diff", "--no-color"],
            Some(".vault/plan/x.md"),
            Some(("HEAD~1", "HEAD")),
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "diff",
                "--no-color",
                "HEAD~1",
                "HEAD",
                "--",
                ".vault/plan/x.md"
            ]
        );
        // histdiff requires BOTH revs and a path.
        assert!(
            git_args_for(&state, "histdiff", &["diff"], Some("x"), None).is_err(),
            "histdiff without revs is rejected"
        );
        assert!(
            git_args_for(&state, "histdiff", &["diff"], None, Some(("a", "b"))).is_err(),
            "histdiff without a path is rejected"
        );
        // A non-rev verb handed revs is rejected (no silent ignore).
        assert!(
            git_args_for(&state, "diff", &["diff"], Some("x"), Some(("a", "b"))).is_err(),
            "the working-tree diff verb takes no revs"
        );
    }

    #[test]
    fn validate_rev_rejects_flags_ranges_and_whitespace() {
        // S14: a rev is a single bounded revision token — never a flag, a `..`
        // range expression, or a whitespace-bearing argument channel.
        let (_dir, state) = no_git_state();
        for bad in [
            "",
            "-x",
            "--output=/etc/passwd",
            "HEAD~1..HEAD",
            "a b",
            "x...y",
        ] {
            assert!(
                validate_rev(&state, bad).is_err(),
                "`{bad}` must be rejected"
            );
        }
        // Bounded ref-grammar tokens are accepted.
        assert_eq!(validate_rev(&state, "HEAD").unwrap(), "HEAD");
        assert_eq!(validate_rev(&state, "HEAD~3").unwrap(), "HEAD~3");
        assert_eq!(
            validate_rev(&state, "0123456789abcdef0123456789abcdef01234567").unwrap(),
            "0123456789abcdef0123456789abcdef01234567"
        );
        assert_eq!(
            validate_rev(&state, "refs/heads/main").unwrap(),
            "refs/heads/main"
        );
    }

    fn git_repo_state() -> (tempfile::TempDir, Arc<AppState>) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let run = |args: &[&str]| {
            let out = std::process::Command::new("git")
                .current_dir(root)
                .args(args)
                .env("GIT_AUTHOR_NAME", "f")
                .env("GIT_AUTHOR_EMAIL", "f@t")
                .env("GIT_COMMITTER_NAME", "f")
                .env("GIT_COMMITTER_EMAIL", "f@t")
                .output()
                .expect("git runs");
            assert!(out.status.success(), "git {args:?}");
        };
        run(&["init", "-b", "main", "."]);
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
        std::fs::write(
            root.join(".vault/plan/2026-06-14-g-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#g'\n---\n\nbody\n",
        )
        .unwrap();
        run(&["add", "."]);
        run(&["commit", "-m", "fixture"]);
        // Leave a dirty change so status/diff have something to report.
        std::fs::write(
            root.join(".vault/plan/2026-06-14-g-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#g'\n---\n\nbody changed\n",
        )
        .unwrap();
        let state = crate::app::build_state(root.to_path_buf());
        (dir, state)
    }

    #[tokio::test]
    async fn a_whitelisted_status_verb_forwards_git_output_verbatim_in_the_envelope() {
        // W04.P10.S55: a whitelisted status verb forwards git output verbatim
        // inside the envelope with the tiers block.
        let (_dir, state) = git_repo_state();
        let scope = state
            .active_scope
            .read()
            .map(|s| s.clone())
            .unwrap_or_else(|e| e.into_inner().clone());
        let result = ops_git(State(state.clone()), Path("status".to_string()), None)
            .await
            .expect("status forwards");
        let Json(body) = result;
        // The verbatim git porcelain output names the dirty plan file.
        let output = body["data"]["output"].as_str().unwrap();
        assert!(
            output.contains("2026-06-14-g-plan.md"),
            "git status output forwarded verbatim: {output}"
        );
        assert_eq!(body["data"]["verb"], "status");
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "tiers block on success"
        );

        // The diff verb forwards a path-scoped unified diff verbatim.
        let result = ops_git(
            State(state),
            Path("diff".to_string()),
            Some(Json(GitOpBody {
                scope: Some(scope),
                path: Some(".vault/plan/2026-06-14-g-plan.md".into()),
                ..Default::default()
            })),
        )
        .await
        .expect("diff forwards");
        let Json(body) = result;
        let diff = body["data"]["output"].as_str().unwrap();
        assert!(
            diff.contains("body changed"),
            "unified diff forwarded: {diff}"
        );
    }

    #[tokio::test]
    async fn changes_summary_reduces_status_and_numstat_server_side() {
        // changes-summary-projection: the composite verb runs status + numstat and
        // returns ONLY the five-number fold-header rollup (no verbatim git text)
        // over a real dirty tree. The dirty entry is the `.vault/` plan doc whose
        // `body` → `body changed` edit is +1 −1; the EXACT split/tally arithmetic is
        // pinned deterministically by the pure reducer tests below (build_state
        // materializes the engine's re-derivable `.vault/data` cache, so the live
        // fixture's absolute counts carry those untracked entries too — here we
        // assert the reduction is real and wired, not a brittle absolute count).
        let (_dir, state) = git_repo_state();
        let result = ops_git(State(state), Path("changes-summary".to_string()), None)
            .await
            .expect("summary reduces");
        let Json(body) = result;
        // The tracked plan edit is a `.vault/` document change with a real +/− tally,
        // so the tree is NOT clean and the reduced counts are non-zero.
        assert!(
            body["data"]["documents"].as_u64().unwrap() >= 1,
            "the dirty plan doc is counted as a changed document"
        );
        assert!(
            body["data"]["additions"].as_u64().unwrap() >= 1,
            "the body edit contributes at least one addition"
        );
        assert!(
            body["data"]["deletions"].as_u64().unwrap() >= 1,
            "the body edit contributes at least one deletion"
        );
        assert_eq!(body["data"]["clean"], false, "a dirty tree is not clean");
        // No verbatim git text ships on the summary path — that is the whole point.
        assert!(
            body["data"]["output"].is_null(),
            "the summary carries no raw git output"
        );
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "tiers block on the summary success envelope"
        );
    }

    #[tokio::test]
    async fn a_non_whitelisted_git_verb_403s_before_the_subprocess() {
        // W04.P10.S54: a non-whitelisted git verb 403s with the tiers block,
        // never reaching the subprocess.
        let (_dir, state) = no_git_state();
        for mutating in ["commit", "add", "checkout", "reset", "stash", "push"] {
            let err = ops_git(State(state.clone()), Path(mutating.to_string()), None)
                .await
                .unwrap_err();
            assert_eq!(err.0, StatusCode::FORBIDDEN, "`{mutating}` must be denied");
            assert!(
                err.1.0["tiers"]["semantic"]["available"].is_boolean(),
                "the 403 carries the tiers block"
            );
            assert!(err.1.0["error"].as_str().unwrap().contains(mutating));
        }
    }

    #[tokio::test]
    async fn a_git_fault_degrades_to_a_tiers_carrying_error_envelope() {
        // W04.P10.S56: a sibling (git) fault degrades to a tiers-carrying error
        // envelope, never a hand-built body. Running git in a NON-git directory
        // makes `git status` exit non-zero — the bounded runner surfaces it as a
        // 502 error envelope through the shared api_error helper (which always
        // attaches the tiers block).
        let (_dir, state) = no_git_state(); // no `git init` here
        let err = ops_git(State(state), Path("status".to_string()), None)
            .await
            .unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_GATEWAY, "git fault → 502");
        assert!(
            err.1.0["tiers"]["semantic"]["available"].is_boolean(),
            "the error envelope carries the tiers block"
        );
        assert!(err.1.0["error"].is_string(), "honest error message");
    }

    // --- changes-summary reducer (pure, over fixture porcelain/numstat) ------

    #[test]
    fn summary_reducer_over_a_clean_tree() {
        // No status entries → every count zero and clean=true. A `## branch`
        // header with no file lines is a clean tree.
        let summary = git_changes_summary("## main...origin/main\n", "");
        assert_eq!(summary.files, 0);
        assert_eq!(summary.documents, 0);
        assert_eq!(summary.additions, 0);
        assert_eq!(summary.deletions, 0);
        assert!(summary.clean);
    }

    #[test]
    fn summary_reducer_splits_vault_documents_from_files_and_sums_tallies() {
        // A modified source file, an added vault doc, and an untracked file (no
        // numstat row → 0 tally). files counts the non-vault entries, documents
        // the `.vault/` ones, and additions/deletions sum the reconciled tallies.
        let status = "## main\n M src/app.ts\nA  .vault/plan/2026-06-18-p-plan.md\n?? notes.txt\n";
        let numstat = "4\t1\tsrc/app.ts\n8\t0\t.vault/plan/2026-06-18-p-plan.md\n";
        let summary = git_changes_summary(status, numstat);
        assert_eq!(summary.files, 2, "src/app.ts + notes.txt are non-vault");
        assert_eq!(summary.documents, 1, "the plan is under .vault/");
        assert_eq!(summary.additions, 12, "4 + 8, untracked contributes 0");
        assert_eq!(summary.deletions, 1);
        assert!(!summary.clean);
    }

    #[test]
    fn summary_reducer_tracks_renames_to_the_new_path_on_both_reads() {
        // A rename reports `old -> new` in status and a braced `pre{old => new}`
        // in numstat; both reduce to the SAME new path so the tally reconciles.
        let status = "## main\nR  src/old.ts -> src/new.ts\n";
        let numstat = "3\t2\tsrc/{old.ts => new.ts}\n";
        let summary = git_changes_summary(status, numstat);
        assert_eq!(summary.files, 1);
        assert_eq!(summary.documents, 0);
        assert_eq!(
            summary.additions, 3,
            "the rename's tally reconciles by new path"
        );
        assert_eq!(summary.deletions, 2);
        assert!(!summary.clean);

        // A bare `old => new` (no brace) reduces to the new path too.
        let bare = git_changes_summary("## main\nR  a.txt -> b.txt\n", "5\t6\ta.txt => b.txt\n");
        assert_eq!(bare.additions, 5);
        assert_eq!(bare.deletions, 6);
    }

    #[test]
    fn summary_reducer_counts_binary_entries_with_no_tally() {
        // A binary file's numstat row is `-\t-`: it is a real change (counted) but
        // contributes no additions/deletions, exactly as the client renders it.
        let status = "## main\n M assets/logo.png\n M src/app.ts\n";
        let numstat = "-\t-\tassets/logo.png\n10\t2\tsrc/app.ts\n";
        let summary = git_changes_summary(status, numstat);
        assert_eq!(summary.files, 2, "both are changed files");
        assert_eq!(summary.additions, 10, "the binary contributes no additions");
        assert_eq!(summary.deletions, 2);
        assert!(!summary.clean);
    }
}
