//! Read-only GitHub work-item routes for the right-rail status panel:
//! `GET /prs` and `GET /issues` broker the `gh` CLI to surface the served
//! worktree's open pull requests, recently-merged pull requests, and open
//! issues.
//!
//! Read-and-infer (`engine-read-and-infer`): these routes only READ git-forge
//! metadata through `gh` (the documented, authenticated GitHub control surface a
//! browser SPA cannot reach), exactly as `/history` reads the git object DB and
//! `/ops/git/*` reads porcelain. They never open a PR, never comment, never
//! mutate a ref — the `gh` invocations are list-only and the args are built from
//! a fixed allowlist, never from free-form client input.
//!
//! Bounded by default (`subprocess-calls-carry-cap-and-timeout`,
//! `bounded-by-default-for-every-accumulator`): every `gh` spawn carries BOTH a
//! stdout byte cap AND a wall-clock timeout and is killed on either breach; the
//! item count is clamped to a hard ceiling.
//!
//! Honest degradation: `gh` being absent, unauthenticated, offline, rate-limited,
//! or pointed at a repo with no remote is a DESIGNED unavailable state, not a
//! 500. The route returns `200` with `{ items: [], available: false, reason }`
//! so the rail renders a designed "GitHub unavailable" state. The canonical
//! four-tier `tiers` block is unaffected (PR/issue availability is a
//! capability-local fact carried in the data, not one of the declared/structural/
//! temporal/semantic tiers), so the wire contract stays intact.

use std::path::Path as FsPath;
use std::sync::Arc;
use std::time::Duration;

use axum::Json;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::io::AsyncReadExt;

use crate::app::AppState;

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

/// `gh` stdout ceiling: a list of work items is small; 4 MiB is generous
/// headroom while bounding a pathological response.
const GH_STDOUT_CAP: u64 = 4 * 1024 * 1024;

/// `gh` wall-clock ceiling: a GitHub API round-trip is a few seconds; 15s bounds
/// a hang (no network, throttle) without pinning the worker. On timeout the
/// child is killed and the route degrades honestly.
const GH_TIMEOUT: Duration = Duration::from_secs(15);

/// Hard ceiling on work items served in one response.
const MAX_ITEMS: usize = 50;
/// Default item count when the client omits `limit`.
const DEFAULT_ITEMS: usize = 20;

#[derive(Deserialize, Default)]
pub struct PrParams {
    /// The worktree scope (required): validated through the shared path so a bad
    /// scope 400s honestly with the tiers block attached.
    pub scope: String,
    /// `open` (default) or `merged` (recent merged PRs). Any other value is
    /// rejected before building argv (no free-form `gh` flag injection).
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub limit: Option<usize>,
}

#[derive(Deserialize, Default)]
pub struct IssueParams {
    pub scope: String,
    /// `open` (default) or `closed`. Validated against the allowlist.
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub limit: Option<usize>,
}

/// `GET /prs?scope=&state=open|merged&limit=N` — open or recently-merged pull
/// requests for the served worktree, through the shared envelope.
pub async fn prs(State(state): State<Arc<AppState>>, Query(params): Query<PrParams>) -> ApiResult {
    let cell = super::query::validate_scope(&state, &params.scope)?;
    let pr_state = match params.state.as_deref().unwrap_or("open") {
        "open" => "open",
        "merged" => "merged",
        other => {
            return Err(super::api_error(
                &state,
                StatusCode::BAD_REQUEST,
                format!("invalid pr state `{other}`: expected `open` or `merged`"),
            ));
        }
    };
    let limit = params.limit.unwrap_or(DEFAULT_ITEMS).min(MAX_ITEMS);

    let fields = "number,title,author,state,isDraft,url,createdAt,updatedAt,mergedAt,\
                  statusCheckRollup,reviewDecision";
    let limit_s = limit.to_string();
    let args = [
        "pr", "list", "--state", pr_state, "--limit", &limit_s, "--json", fields,
    ];

    let data = match run_gh(&cell.root, &args).await {
        Ok(Value::Array(items)) => {
            let prs: Vec<Value> = items.iter().map(reshape_pr).collect();
            json!({ "prs": prs, "available": true, "reason": Value::Null })
        }
        Ok(_) => json!({ "prs": [], "available": false, "reason": "unexpected gh output shape" }),
        Err(reason) => json!({ "prs": [], "available": false, "reason": reason }),
    };

    Ok(super::envelope(data, super::query_tiers(&cell), None))
}

/// `GET /issues?scope=&state=open|closed&limit=N` — open (or closed) issues for
/// the served worktree, through the shared envelope.
pub async fn issues(
    State(state): State<Arc<AppState>>,
    Query(params): Query<IssueParams>,
) -> ApiResult {
    let cell = super::query::validate_scope(&state, &params.scope)?;
    let issue_state = match params.state.as_deref().unwrap_or("open") {
        "open" => "open",
        "closed" => "closed",
        other => {
            return Err(super::api_error(
                &state,
                StatusCode::BAD_REQUEST,
                format!("invalid issue state `{other}`: expected `open` or `closed`"),
            ));
        }
    };
    let limit = params.limit.unwrap_or(DEFAULT_ITEMS).min(MAX_ITEMS);

    let fields = "number,title,author,state,url,createdAt,updatedAt,labels";
    let limit_s = limit.to_string();
    let args = [
        "issue",
        "list",
        "--state",
        issue_state,
        "--limit",
        &limit_s,
        "--json",
        fields,
    ];

    let data = match run_gh(&cell.root, &args).await {
        Ok(Value::Array(items)) => {
            let issues: Vec<Value> = items.iter().map(reshape_issue).collect();
            json!({ "issues": issues, "available": true, "reason": Value::Null })
        }
        Ok(_) => {
            json!({ "issues": [], "available": false, "reason": "unexpected gh output shape" })
        }
        Err(reason) => json!({ "issues": [], "available": false, "reason": reason }),
    };

    Ok(super::envelope(data, super::query_tiers(&cell), None))
}

/// Run `gh <args>` in `dir`, bounded by [`GH_STDOUT_CAP`] and [`GH_TIMEOUT`],
/// killing the child on either breach. Returns the parsed JSON value on success,
/// or a SHORT, client-safe reason string on any failure (spawn, non-zero exit,
/// timeout, unparseable output) — never the raw stderr (which can carry tokens or
/// machine paths). The full error is logged for operator diagnostics.
async fn run_gh(dir: &FsPath, args: &[&str]) -> Result<Value, String> {
    let mut child = tokio::process::Command::new("gh")
        .args(args)
        .current_dir(dir)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            eprintln!("vaultspec serve: spawning gh failed: {e}");
            "the gh CLI is not available".to_string()
        })?;

    let stdout = child.stdout.take().expect("piped stdout");
    let collect = async {
        let mut buf = Vec::new();
        let read = stdout.take(GH_STDOUT_CAP).read_to_end(&mut buf).await;
        (read, buf)
    };

    let (read_result, buf) = match tokio::time::timeout(GH_TIMEOUT, collect).await {
        Ok(result) => result,
        Err(_) => {
            let _ = child.kill().await;
            return Err(format!("gh timed out after {}s", GH_TIMEOUT.as_secs()));
        }
    };
    read_result.map_err(|e| {
        eprintln!("vaultspec serve: reading gh output failed: {e}");
        "reading gh output failed".to_string()
    })?;

    let status = child.wait().await.map_err(|e| {
        eprintln!("vaultspec serve: awaiting gh exit failed: {e}");
        "gh did not exit cleanly".to_string()
    })?;
    if !status.success() {
        // Non-zero gh exit: no remote, not authenticated, rate-limited, offline.
        // Log the detail; return a generic, leak-free reason for the rail.
        eprintln!(
            "vaultspec serve: gh exited with {status}; args={args:?} (likely no remote, \
             not authenticated, or offline)"
        );
        return Err("GitHub is unavailable (no remote, not signed in, or offline)".to_string());
    }

    serde_json::from_slice(&buf).map_err(|e| {
        eprintln!("vaultspec serve: parsing gh json failed: {e}");
        "could not parse gh output".to_string()
    })
}

/// Reshape one `gh pr` JSON object into the rail's bounded PR wire shape. Unknown
/// or missing fields degrade to null/empty rather than failing the whole list.
fn reshape_pr(item: &Value) -> Value {
    let checks = summarize_checks(item.get("statusCheckRollup"));
    json!({
        "number": item.get("number").cloned().unwrap_or(Value::Null),
        "title": item.get("title").and_then(Value::as_str).unwrap_or_default(),
        "author": author_login(item.get("author")),
        "state": item.get("state").and_then(Value::as_str).unwrap_or_default().to_lowercase(),
        "is_draft": item.get("isDraft").and_then(Value::as_bool).unwrap_or(false),
        "url": item.get("url").and_then(Value::as_str).unwrap_or_default(),
        "created_at": item.get("createdAt").cloned().unwrap_or(Value::Null),
        "updated_at": item.get("updatedAt").cloned().unwrap_or(Value::Null),
        "merged_at": item.get("mergedAt").cloned().unwrap_or(Value::Null),
        "review_decision": item.get("reviewDecision")
            .and_then(Value::as_str).unwrap_or_default().to_lowercase(),
        "checks": checks,
    })
}

/// Reshape one `gh issue` JSON object into the rail's bounded issue wire shape.
fn reshape_issue(item: &Value) -> Value {
    let labels: Vec<String> = item
        .get("labels")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|l| l.get("name").and_then(Value::as_str).map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    json!({
        "number": item.get("number").cloned().unwrap_or(Value::Null),
        "title": item.get("title").and_then(Value::as_str).unwrap_or_default(),
        "author": author_login(item.get("author")),
        "state": item.get("state").and_then(Value::as_str).unwrap_or_default().to_lowercase(),
        "url": item.get("url").and_then(Value::as_str).unwrap_or_default(),
        "created_at": item.get("createdAt").cloned().unwrap_or(Value::Null),
        "updated_at": item.get("updatedAt").cloned().unwrap_or(Value::Null),
        "labels": labels,
    })
}

/// The author login from a `gh` `author` object (`{login, name, ...}`), or empty.
fn author_login(author: Option<&Value>) -> String {
    author
        .and_then(|a| a.get("login"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

/// Collapse `gh`'s `statusCheckRollup` array into a bounded `{total, passed,
/// failing, pending}` summary so the rail can show a check status without
/// serializing every individual check. A check is "passed" when its conclusion
/// is SUCCESS/NEUTRAL/SKIPPED, "failing" on FAILURE/ERROR/CANCELLED/TIMED_OUT,
/// else "pending" (queued/in-progress or a status context with state PENDING).
fn summarize_checks(rollup: Option<&Value>) -> Value {
    let arr = match rollup.and_then(Value::as_array) {
        Some(a) if !a.is_empty() => a,
        _ => return Value::Null,
    };
    let (mut passed, mut failing, mut pending) = (0u32, 0u32, 0u32);
    for c in arr {
        // CheckRun carries `conclusion` (+ `status`); StatusContext carries `state`.
        let verdict = c
            .get("conclusion")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .or_else(|| c.get("state").and_then(Value::as_str))
            .unwrap_or("")
            .to_uppercase();
        match verdict.as_str() {
            "SUCCESS" | "NEUTRAL" | "SKIPPED" => passed += 1,
            "FAILURE" | "ERROR" | "CANCELLED" | "TIMED_OUT" | "ACTION_REQUIRED" => failing += 1,
            _ => pending += 1,
        }
    }
    json!({ "total": arr.len(), "passed": passed, "failing": failing, "pending": pending })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reshape_pr_maps_core_fields_and_author_login() {
        let raw = json!({
            "number": 128, "title": "Broker rag control plane",
            "author": {"login": "octocat", "name": "Octo Cat"},
            "state": "OPEN", "isDraft": false, "url": "https://x/pr/128",
            "reviewDecision": "APPROVED",
            "statusCheckRollup": [{"conclusion":"SUCCESS"},{"conclusion":"SUCCESS"}]
        });
        let out = reshape_pr(&raw);
        assert_eq!(out["number"], 128);
        assert_eq!(out["author"], "octocat");
        assert_eq!(out["state"], "open");
        assert_eq!(out["is_draft"], false);
        assert_eq!(out["review_decision"], "approved");
        assert_eq!(out["checks"]["total"], 2);
        assert_eq!(out["checks"]["passed"], 2);
        assert_eq!(out["checks"]["failing"], 0);
    }

    #[test]
    fn summarize_checks_partitions_verdicts() {
        let rollup = json!([
            {"conclusion":"SUCCESS"},
            {"conclusion":"FAILURE"},
            {"status":"IN_PROGRESS","conclusion":""},
            {"state":"PENDING"}
        ]);
        let out = summarize_checks(Some(&rollup));
        assert_eq!(out["total"], 4);
        assert_eq!(out["passed"], 1);
        assert_eq!(out["failing"], 1);
        assert_eq!(out["pending"], 2);
    }

    #[test]
    fn summarize_checks_empty_is_null() {
        assert_eq!(summarize_checks(Some(&json!([]))), Value::Null);
        assert_eq!(summarize_checks(None), Value::Null);
    }

    #[test]
    fn reshape_issue_collects_label_names() {
        let raw = json!({
            "number": 94, "title": "Graph clumps",
            "author": {"login": "octocat"}, "state": "OPEN", "url": "https://x/i/94",
            "labels": [{"name":"bug"},{"name":"perf"}]
        });
        let out = reshape_issue(&raw);
        assert_eq!(out["number"], 94);
        assert_eq!(out["labels"][0], "bug");
        assert_eq!(out["labels"][1], "perf");
    }
}
