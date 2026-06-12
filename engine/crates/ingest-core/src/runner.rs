//! The core subprocess runner (engine-spec §5.1, D5.1).
//!
//! vaultspec-core is Python, the engine is Rust; the process boundary is
//! the only sane seam. Every consumed verb runs as `vaultspec-core …
//! --json` inside the scope's checkout, and every payload passes schema
//! pinning before parsing: unknown schema versions fail loud, never guess.

use std::path::Path;
use std::process::Command;

use serde::Deserialize;

#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("spawning vaultspec-core: {0}")]
    Spawn(#[from] std::io::Error),
    #[error("vaultspec-core exited {code:?}: {stderr}")]
    Failed { code: Option<i32>, stderr: String },
    #[error("malformed JSON envelope: {0}")]
    Json(#[from] serde_json::Error),
    #[error("unknown schema `{found}` (engine supports: {supported})")]
    UnknownSchema { found: String, supported: String },
    #[error("envelope payload missing `data`")]
    MissingData,
}

pub type Result<T> = std::result::Result<T, CoreError>;

/// The versioned `--json` envelope every core verb emits.
#[derive(Debug, Deserialize)]
pub struct Envelope {
    pub schema: String,
    pub status: String,
    pub data: Option<serde_json::Value>,
}

impl Envelope {
    /// Parse raw stdout and enforce schema pinning (D5.1: loud failure).
    pub fn parse_pinned(raw: &str, supported: &[&str]) -> Result<Self> {
        let envelope: Envelope = serde_json::from_str(raw)?;
        if !supported.contains(&envelope.schema.as_str()) {
            return Err(CoreError::UnknownSchema {
                found: envelope.schema,
                supported: supported.join(", "),
            });
        }
        Ok(envelope)
    }

    /// The payload, required.
    pub fn data(self) -> Result<serde_json::Value> {
        self.data.ok_or(CoreError::MissingData)
    }
}

/// Invocation recipe for the core CLI. `detect()` prefers the bare binary
/// on PATH and falls back to the uv-managed environment, mirroring the
/// project's own runtime guidance.
#[derive(Debug, Clone)]
pub struct CoreRunner {
    /// Program plus leading arguments, e.g. `["vaultspec-core"]` or
    /// `["uv", "run", "--no-sync", "vaultspec-core"]`.
    pub invocation: Vec<String>,
}

impl CoreRunner {
    pub fn new(invocation: Vec<String>) -> Self {
        CoreRunner { invocation }
    }

    pub fn detect() -> Self {
        if which("vaultspec-core") {
            CoreRunner::new(vec!["vaultspec-core".into()])
        } else {
            CoreRunner::new(
                ["uv", "run", "--no-sync", "vaultspec-core"]
                    .map(String::from)
                    .to_vec(),
            )
        }
    }

    /// Run a core verb with `--json` inside `cwd` (the scope's checkout —
    /// scope is per-request, engine-spec §2.3) and return the pinned,
    /// parsed envelope.
    pub fn run_json(&self, cwd: &Path, args: &[&str], supported: &[&str]) -> Result<Envelope> {
        let mut cmd = Command::new(&self.invocation[0]);
        cmd.args(&self.invocation[1..])
            .args(args)
            .arg("--json")
            .current_dir(cwd);
        let output = cmd.output()?;
        if !output.status.success() {
            return Err(CoreError::Failed {
                code: output.status.code(),
                stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
            });
        }
        Envelope::parse_pinned(&String::from_utf8_lossy(&output.stdout), supported)
    }
}

fn which(program: &str) -> bool {
    let Some(paths) = std::env::var_os("PATH") else {
        return false;
    };
    for dir in std::env::split_paths(&paths) {
        for ext in ["", ".exe", ".cmd", ".bat"] {
            if dir.join(format!("{program}{ext}")).is_file() {
                return true;
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pinned_parse_accepts_supported_schema() {
        let raw =
            r#"{"schema":"vaultspec.vault.stats.v1","status":"unchanged","data":{"total_docs":1}}"#;
        let envelope = Envelope::parse_pinned(raw, &["vaultspec.vault.stats.v1"]).unwrap();
        assert_eq!(envelope.status, "unchanged");
        assert_eq!(envelope.data().unwrap()["total_docs"], 1);
    }

    #[test]
    fn unknown_schema_fails_loud_with_both_sides_named() {
        let raw = r#"{"schema":"vaultspec.vault.graph.v999","status":"ok","data":{}}"#;
        let err = Envelope::parse_pinned(raw, &["vaultspec.vault.graph.v2"]).unwrap_err();
        let message = err.to_string();
        assert!(message.contains("v999"), "names the found schema");
        assert!(message.contains("graph.v2"), "names what is supported");
    }

    #[test]
    fn malformed_json_is_a_typed_error() {
        assert!(matches!(
            Envelope::parse_pinned("not json", &[]),
            Err(CoreError::Json(_))
        ));
    }
}
