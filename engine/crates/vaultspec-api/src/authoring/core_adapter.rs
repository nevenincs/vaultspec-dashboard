//! The internal `vaultspec-core` adapter (W03.P35).
//!
//! This is the ONLY layer in the authoring domain that knows which
//! `vaultspec-core` verb implements a semantic authoring operation. The apply
//! materializer (W03.P36) calls it; nothing else does. It exists to satisfy the
//! `agentic-authoring-boundary` / `agentic-apply-materialization` ADRs:
//!
//! - `vaultspec-core` stays HIDDEN behind an internal validation/materialization
//!   adapter. The collaborator-facing wire vocabulary is the SEMANTIC
//!   [`super::model::CommandKind`] set (`request_apply`, `approve`, …), never a
//!   core verb. A capability here is chosen in Rust from a typed operation kind;
//!   there is deliberately NO wire-string → capability path (no `Deserialize`, no
//!   `FromStr`), so a collaborator payload can never name, address, or invoke a
//!   core-shaped write. The disjointness is proven in the S175 tests below.
//! - The invocation resolves to the PROJECT-PINNED capability set: it reuses
//!   [`ingest_core::runner::CoreRunner::detect`], which prefers the uv-managed
//!   core and capability-probes the write verbs before binding an invocation.
//! - Every subprocess call carries BOTH an output byte cap AND a wall-clock
//!   timeout at the call site, killing the child on either breach and returning a
//!   typed [`CoreAdapterError::OutputTooLarge`] / [`CoreAdapterError::Timeout`]
//!   (resource-bounds: a cap alone or a timeout alone is a defect). The bounded
//!   loop mirrors `CoreRunner::run_json`; the stdin write + "branch on the
//!   envelope, not the exit code" behaviour mirrors the existing `/ops/core`
//!   write broker. On a breach the child is killed by PROCESS GROUP on Unix (it
//!   is spawned as its group leader), so the Python core GRANDCHILD under the
//!   `uv run` launcher dies too — a bare child-kill would reap only the launcher
//!   and leave the core to finish the write. On Windows a subtree kill needs a
//!   Job Object (a dep we avoid), so the grandchild can survive; that is why
//!   `Timeout`/`OutputTooLarge` are OUTCOME-INDETERMINATE
//!   ([`CoreAdapterError::is_outcome_indeterminate`]) and the apply caller must
//!   re-verify document post-state before recording a result.
//! - Errors REDACT on the wire: [`CoreAdapterError::wire_reason`] surfaces only a
//!   failure CATEGORY, never the child's stderr (which embeds absolute paths and
//!   the sibling-workspace hint), the drafted body, a prompt, or a raw argument
//!   value. The sensitive detail is preserved for operator logs by
//!   [`CoreAdapterError::log_detail`].
//!
//! Consumed by the apply command (W03.P36) and the authoring routes (W03.P39).
//!
//! `dead_code` allow retained through W03.P39 (matching every sibling authoring
//! module): apply consumes only the `SetBody` write path, while the rest of the
//! P35 deliverable — the full 5-verb capability registry, `detect()`, and the
//! forensics API (`is_failed`/`log_detail`) — is exercised by the tests and
//! awaits the P39 route wiring. It is dead in the LIB target until then (the
//! `-D warnings` gate builds the lib target without the test modules), so the
//! allow drops with P39, not P36. See coder-4's note to team-lead (2026-07-04).
#![allow(dead_code)]

use std::io::{Read, Write};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

use ingest_core::runner::CoreRunner;
use serde_json::Value;

/// Output ceiling for a single apply-time core verb. A write verb's `--json`
/// envelope is small; a runaway that streams past this is stopped and fails typed
/// (never grown to exhaustion). Mirrors the `/ops/core` write broker's 8 MiB cap.
const DEFAULT_STDOUT_CAP: u64 = 8 * 1024 * 1024;

/// Wall-clock ceiling for a single apply-time core verb. A hung core (locked
/// venv, stalled import) must not pin the calling blocking-pool thread forever.
/// Mirrors the `/ops/core` write broker's 120 s deadline.
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(120);

/// The project-pinned set of `vaultspec-core` verbs the adapter may invoke. Each
/// variant is chosen in Rust from a typed authoring operation; the enum carries
/// no `Deserialize`/`FromStr`, so no collaborator string can ever select one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CoreCapability {
    /// `vault add` — scaffold a new document from typed create params.
    CreateDocument,
    /// `vault set-body` — replace a document's body (body carried on stdin).
    SetBody,
    /// `vault set-frontmatter` — rewrite frontmatter fields.
    SetFrontmatter,
    /// `vault edit` — combined body/frontmatter edit.
    Edit,
    /// `vault rename` — rename a document to a new stem.
    Rename,
    /// `vault plan step check` — mark a plan Step closed (idempotent).
    CheckPlanStep,
    /// `vault plan step uncheck` — mark a plan Step open (idempotent).
    UncheckPlanStep,
}

impl CoreCapability {
    /// The FIXED, hard-coded `vaultspec-core` verb args this capability resolves
    /// to. Every element is a literal — no collaborator string ever reaches this
    /// list — so a capability can only ever address the whitelisted verb it
    /// names. This is the ONLY place core verb strings live in the domain.
    fn fixed_args(self) -> &'static [&'static str] {
        match self {
            Self::CreateDocument => &["vault", "add"],
            Self::SetBody => &["vault", "set-body"],
            Self::SetFrontmatter => &["vault", "set-frontmatter"],
            Self::Edit => &["vault", "edit"],
            Self::Rename => &["vault", "rename"],
            Self::CheckPlanStep => &["vault", "plan", "step", "check"],
            Self::UncheckPlanStep => &["vault", "plan", "step", "uncheck"],
        }
    }

    /// A SEMANTIC label for audit/log lines. Deliberately not the raw verb, so an
    /// audit record never re-exposes the core-shaped operation on any surface.
    fn label(self) -> &'static str {
        match self {
            Self::CreateDocument => "create-document",
            Self::SetBody => "replace-body",
            Self::SetFrontmatter => "rewrite-frontmatter",
            Self::Edit => "edit-document",
            Self::Rename => "rename-document",
            Self::CheckPlanStep => "close-plan-step",
            Self::UncheckPlanStep => "open-plan-step",
        }
    }

    /// Whether this capability writes an existing document via a document `ref`
    /// (as opposed to `CreateDocument`, which scaffolds from typed params).
    fn is_write(self) -> bool {
        matches!(
            self,
            Self::SetBody | Self::SetFrontmatter | Self::Edit | Self::Rename
        )
    }
}

/// Optional flags for a write-family capability. Every field is validated by the
/// builder before it can reach the argv; a `None`/empty field contributes no
/// token. `body`, when present, is streamed to the child's stdin (and adds the
/// `--body-stdin` flag), never placed on the argv.
#[derive(Debug, Default, Clone)]
pub(crate) struct WriteArgs {
    pub expected_blob_hash: Option<String>,
    pub new_stem: Option<String>,
    pub date: Option<String>,
    pub tags: Vec<String>,
    pub related: Vec<String>,
    pub body: Option<String>,
}

/// A validated, ready-to-run core invocation: the resolved capability, a
/// value-only argv (fixed verb args + validated flags; `--json` is appended by
/// [`CoreAdapter::invoke`], never here), and an optional stdin body. Constructed
/// ONLY through the validating builders, so no unvalidated token can reach argv.
#[derive(Debug, Clone)]
pub(crate) struct CoreInvocation {
    capability: CoreCapability,
    argv: Vec<String>,
    body: Option<String>,
}

impl CoreInvocation {
    pub(crate) fn capability(&self) -> CoreCapability {
        self.capability
    }

    pub(crate) fn argv(&self) -> &[String] {
        &self.argv
    }

    pub(crate) fn has_body(&self) -> bool {
        self.body.is_some()
    }

    /// Build a `vault add <doc_type> --feature <feature> [--title <t>] [--date
    /// <d>] [--related <r>]*` invocation. Every field is validated BEFORE it can
    /// reach the argv (the injection-guard surface): no token is ever read as a
    /// flag.
    ///
    /// `date` is ALWAYS passed explicitly (never left to core's own wall clock):
    /// core's own scaffold naming convention is `{date}-{feature}-{doc_type}.md`
    /// (documented, not this adapter's to serialize), so pinning the date the
    /// materialized operation already fixed is what makes the apply-time
    /// invocation and the identity-bearing post-verify agree on the SAME
    /// predicted path — never a wall-clock race between "the date `build_write_
    /// invocation` computed" and "the date `post_verify_expectation` computed".
    pub(crate) fn create_document(
        doc_type: &str,
        feature: &str,
        title: Option<&str>,
        date: &str,
        related: &[String],
    ) -> Result<Self, CoreAdapterError> {
        let capability = CoreCapability::CreateDocument;
        let mut argv = fixed(capability);
        argv.push(validate_token("doc_type", doc_type)?);
        argv.push("--feature".into());
        argv.push(validate_token("feature", feature)?);
        if let Some(t) = title {
            argv.push("--title".into());
            argv.push(validate_flag_safe("title", t)?);
        }
        argv.push("--date".into());
        argv.push(validate_flag_safe("date", date)?);
        for r in related {
            argv.push("--related".into());
            argv.push(validate_flag_safe("related", r)?);
        }
        Ok(Self {
            capability,
            argv,
            body: None,
        })
    }

    /// Build a write invocation (`set-body` / `set-frontmatter` / `edit` /
    /// `rename`) over an existing document `ref`, mirroring the `/ops/core` write
    /// channel's argv assembly. Every flag is validated and value-only; a body,
    /// when present, is carried on stdin (adding `--body-stdin`). A non-write
    /// capability is a typed error, not a silently-mis-shaped argv.
    pub(crate) fn write(
        capability: CoreCapability,
        doc_ref: &str,
        opts: WriteArgs,
    ) -> Result<Self, CoreAdapterError> {
        if !capability.is_write() {
            return Err(CoreAdapterError::UnsupportedCapability { capability });
        }
        let mut argv = fixed(capability);
        argv.push(validate_doc_ref("ref", doc_ref)?);
        if let Some(s) = &opts.new_stem {
            argv.push("--to".into());
            argv.push(validate_stem("to", s)?);
        }
        if let Some(h) = &opts.expected_blob_hash {
            argv.push("--expected-blob-hash".into());
            argv.push(validate_blob_hash("expected_blob_hash", h)?);
        }
        if let Some(d) = &opts.date {
            argv.push("--date".into());
            argv.push(validate_flag_safe("date", d)?);
        }
        for t in &opts.tags {
            argv.push("--tags".into());
            argv.push(validate_flag_safe("tags", t)?);
        }
        for r in &opts.related {
            argv.push("--related".into());
            argv.push(validate_flag_safe("related", r)?);
        }
        if opts.body.is_some() {
            argv.push("--body-stdin".into());
        }
        Ok(Self {
            capability,
            argv,
            body: opts.body,
        })
    }

    /// Build a `vault plan step check|uncheck <plan_ref> <S##>` invocation
    /// (authoring-surface ADR D1). `check` selects the verb (`true` closes the
    /// Step, `false` re-opens it); both are idempotent at core. The plan ref and
    /// canonical step id are validated value-only tokens, so neither can inject a
    /// flag or escape the tree.
    ///
    /// UNLIKE every other write, the plan CLI verb carries NO
    /// `--expected-blob-hash` fence (ADR D1 constraint): apply-time optimistic
    /// concurrency for a plan tick is enforced ENGINE-SIDE — a stale-base
    /// pre-check compares the held base against a fresh worktree read BEFORE this
    /// invocation runs — never by core. Because the verb is core-authoritative
    /// over the resulting bytes (it also refreshes the `modified` stamp and may
    /// recompute display paths), the caller verifies landing by re-reading the
    /// resulting Step state, never an exact-blob-hash compare.
    pub(crate) fn set_plan_step_state(
        check: bool,
        plan_ref: &str,
        step_id: &str,
    ) -> Result<Self, CoreAdapterError> {
        let capability = if check {
            CoreCapability::CheckPlanStep
        } else {
            CoreCapability::UncheckPlanStep
        };
        let mut argv = fixed(capability);
        argv.push(validate_doc_ref("plan_ref", plan_ref)?);
        argv.push(validate_step_id("step_id", step_id)?);
        Ok(Self {
            capability,
            argv,
            body: None,
        })
    }
}

fn fixed(capability: CoreCapability) -> Vec<String> {
    capability
        .fixed_args()
        .iter()
        .map(|s| s.to_string())
        .collect()
}

/// The parsed core `--json` envelope. A `status`-bearing envelope is a VALID
/// business response — a success OR a business refusal (`status:"failed"` with a
/// conflict/checks payload) — regardless of the child's exit code. The caller
/// branches on [`CoreEnvelope::status`], never the exit code, exactly like the
/// `/ops/core` write broker.
#[derive(Debug, Clone)]
pub(crate) struct CoreEnvelope {
    pub raw: Value,
    pub status: String,
}

impl CoreEnvelope {
    /// A materialization success (`created` / `updated` / `unchanged`).
    pub(crate) fn is_success(&self) -> bool {
        matches!(self.status.as_str(), "created" | "updated" | "unchanged")
    }

    /// A business refusal/conflict the core reported inside the envelope.
    pub(crate) fn is_failed(&self) -> bool {
        self.status == "failed"
    }
}

/// Typed adapter failures. Every variant's `Display` and [`Self::wire_reason`]
/// are REDACTED — they carry only a failure category, never the child's stderr,
/// the drafted body, a prompt, or a raw argument value. The sensitive detail is
/// held in the variant's private fields for [`Self::log_detail`] (operator logs).
///
/// WARNING: the derived `Debug` DOES render those sensitive fields (stderr,
/// stdout, raw value). Never `{:?}`-format a `CoreAdapterError` onto the wire or
/// into a `tiers` block — route it through [`Self::wire_reason`]. `Debug` is for
/// tests and local diagnostics only.
#[derive(Debug, thiserror::Error)]
pub(crate) enum CoreAdapterError {
    /// A request argument failed validation before any subprocess spawned. The
    /// raw `value` is kept internal (it may echo a path or draft fragment); the
    /// `Display` names only the field and a static reason.
    #[error("argument `{field}` is invalid: {reason}")]
    InvalidArgument {
        field: &'static str,
        value: String,
        reason: &'static str,
    },
    /// A write builder was handed a non-write capability.
    #[error("capability `{}` cannot address an existing document", .capability.label())]
    UnsupportedCapability { capability: CoreCapability },
    /// The core process could not be launched (missing binary, spawn failure).
    #[error("vaultspec-core could not be launched")]
    Unavailable(#[source] std::io::Error),
    /// The core exited non-zero with no parseable envelope — a genuine crash, not
    /// a business refusal. The raw `stderr` is kept internal (absolute paths,
    /// sibling-workspace hint) and never rendered on the wire.
    #[error("vaultspec-core exited unsuccessfully (code {code:?})")]
    CoreFailed { code: Option<i32>, stderr: String },
    /// The core exited but emitted nothing parseable as a `status` envelope.
    #[error("vaultspec-core produced no parseable envelope")]
    MalformedEnvelope { stdout: String },
    /// Output exceeded the byte cap and the child was killed mid-flight.
    ///
    /// OUTCOME-INDETERMINATE: the core may have already completed (or partially
    /// completed) the vault write before the kill landed — and on Windows the
    /// killed launcher's Python grandchild can SURVIVE to finish it (no Job
    /// Object, by design). This is NEVER "not applied." The apply caller (W03.P36)
    /// MUST re-verify each target document's post-state (blob hash) before
    /// recording an apply result — see [`Self::is_outcome_indeterminate`].
    #[error("vaultspec-core produced over {cap_mib} MiB of output (capped)")]
    OutputTooLarge { cap_mib: u64 },
    /// The core outran its wall-clock deadline and was killed mid-flight.
    ///
    /// OUTCOME-INDETERMINATE: identical caveat to [`Self::OutputTooLarge`] — the
    /// write may have landed before (or, on Windows, despite) the kill. NEVER
    /// treat this as "not applied"; the apply caller MUST re-verify document
    /// post-state — see [`Self::is_outcome_indeterminate`].
    #[error("vaultspec-core timed out after {secs}s (killed)")]
    Timeout { secs: u64 },
}

impl CoreAdapterError {
    /// A LEAK-FREE category reason safe to surface in a wire `tiers` block. It
    /// NEVER contains the child's stderr, the drafted body, a prompt, or a raw
    /// argument value — only the failure category. Mirrors
    /// `ingest_core::runner::CoreError::wire_reason`.
    pub(crate) fn wire_reason(&self) -> String {
        match self {
            Self::InvalidArgument { field, reason, .. } => {
                format!("argument `{field}` is invalid: {reason}")
            }
            Self::UnsupportedCapability { capability } => {
                format!(
                    "operation `{}` cannot address an existing document",
                    capability.label()
                )
            }
            Self::Unavailable(_) => "vaultspec-core could not be launched".into(),
            Self::CoreFailed { code, .. } => format!(
                "vaultspec-core exited unsuccessfully (code {code:?}); the change \
                 could not be materialized"
            ),
            Self::MalformedEnvelope { .. } => {
                "vaultspec-core emitted no parseable result envelope".into()
            }
            Self::OutputTooLarge { cap_mib } => {
                format!("vaultspec-core produced over {cap_mib} MiB of output")
            }
            Self::Timeout { secs } => {
                format!("vaultspec-core did not respond within {secs}s and was stopped")
            }
        }
    }

    /// Whether this failure leaves the vault write OUTCOME UNKNOWN — the core was
    /// killed mid-flight (Timeout / OutputTooLarge), and on Windows its Python
    /// grandchild may even have survived the kill, so the target document may or
    /// may not have changed. The apply caller (W03.P36) MUST re-verify document
    /// post-state (blob hash) before recording a result and MUST NEVER record such
    /// a failure as "not applied." A pre-spawn validation error, a failed spawn,
    /// or a core that self-terminated with no envelope did not have THIS adapter
    /// kill a write in progress, so those are determinate.
    pub(crate) fn is_outcome_indeterminate(&self) -> bool {
        matches!(self, Self::Timeout { .. } | Self::OutputTooLarge { .. })
    }

    /// The sensitive detail, for the SERVER LOG only (never the wire): the raw
    /// argument value, the child's stderr, or its unparseable stdout. `None` for
    /// variants that carry nothing sensitive.
    pub(crate) fn log_detail(&self) -> Option<String> {
        match self {
            Self::InvalidArgument { field, value, .. } => Some(format!("{field}={value}")),
            Self::CoreFailed { stderr, .. } if !stderr.is_empty() => Some(stderr.clone()),
            Self::MalformedEnvelope { stdout } if !stdout.is_empty() => Some(stdout.clone()),
            _ => None,
        }
    }
}

/// The internal core adapter. Holds the project-pinned invocation plus the
/// call-site output cap and wall-clock timeout that bound every invocation.
#[derive(Debug, Clone)]
pub(crate) struct CoreAdapter {
    invocation: Vec<String>,
    stdout_cap: u64,
    timeout: Duration,
}

impl CoreAdapter {
    /// Resolve the PROJECT-PINNED core (prefers the uv-managed env, capability-
    /// probes the write verbs) and bind the default cap + timeout.
    pub(crate) fn detect() -> Self {
        Self::from_invocation(CoreRunner::detect().invocation)
    }

    /// Bind a specific invocation (the resolved program + leading args) with the
    /// default bounds. Shared by [`Self::detect`] and the tests.
    pub(crate) fn from_invocation(invocation: Vec<String>) -> Self {
        Self {
            invocation,
            stdout_cap: DEFAULT_STDOUT_CAP,
            timeout: DEFAULT_TIMEOUT,
        }
    }

    /// Override the output cap (bytes). Used to trip the cap deterministically in
    /// tests without emitting megabytes.
    pub(crate) fn with_stdout_cap(mut self, cap: u64) -> Self {
        self.stdout_cap = cap;
        self
    }

    /// Override the wall-clock timeout. Used to trip the deadline deterministically
    /// in tests without waiting the production default.
    pub(crate) fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// Run a validated invocation in `cwd` (the changeset's worktree) under BOTH
    /// the output cap AND the wall-clock timeout, killing the child on either
    /// breach. Returns the parsed core envelope for a `status`-bearing response
    /// (success OR business refusal — the caller branches on `status`), or a
    /// typed, redacted error for a genuine fault.
    pub(crate) fn invoke(
        &self,
        cwd: &Path,
        invocation: &CoreInvocation,
    ) -> Result<CoreEnvelope, CoreAdapterError> {
        let mut cmd = Command::new(&self.invocation[0]);
        cmd.args(&self.invocation[1..])
            .args(&invocation.argv)
            .arg("--json")
            .current_dir(cwd)
            // Force the core's Python into UTF-8 so it reads the streamed body and
            // writes its envelope as UTF-8, not the host locale (cp1252 on
            // Windows) — otherwise non-ASCII body bytes mojibake on write.
            .env("PYTHONUTF8", "1")
            .env("PYTHONIOENCODING", "utf-8")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        // Put the child in its OWN process group (Unix) so a Timeout / cap breach
        // can kill the WHOLE tree — critically the Python core GRANDCHILD under
        // the `uv run … vaultspec-core` launcher that `CoreRunner::detect()`
        // resolves to (see `terminate`). Without this the group-kill has no group
        // to target and a killed launcher would leave the core free to finish the
        // vault write after we have already returned failure.
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt as _;
            cmd.process_group(0);
        }
        let mut child = cmd.spawn().map_err(CoreAdapterError::Unavailable)?;

        // Write the body to stdin and CLOSE it (EOF) on a worker thread, so a
        // large body can never deadlock against a full stdout pipe. A `None` body
        // writes nothing and still closes stdin (the `--body-stdin` read hits EOF
        // immediately). A broken pipe (the child exited early) is not fatal on its
        // own — the envelope/exit inspection below decides the outcome.
        let stdin = child.stdin.take().expect("piped stdin");
        let body = invocation.body.clone();
        let writer = std::thread::spawn(move || {
            let mut stdin = stdin;
            if let Some(text) = body {
                let _ = stdin.write_all(text.as_bytes());
            }
            let _ = stdin.flush();
            // Drop closes the pipe → EOF for the child.
        });

        // Read stdout under the byte cap on a worker thread, so the parent can
        // enforce a wall-clock deadline AND kill a hung child. A blocking
        // `read_to_end` here would pin this thread forever on a stalled child; on
        // the serve path that thread is a Tokio blocking-pool worker. std `thread`
        // + `mpsc::recv_timeout` gives a portable deadline with no new dependency.
        let cap = self.stdout_cap;
        let stdout_pipe = child.stdout.take().expect("piped stdout");
        let (tx, rx) = mpsc::channel();
        let reader = std::thread::spawn(move || {
            let mut buf = Vec::new();
            let res = stdout_pipe.take(cap).read_to_end(&mut buf).map(|_| buf);
            let _ = tx.send(res);
        });

        let stdout = match rx.recv_timeout(self.timeout) {
            Ok(Ok(buf)) => buf,
            Ok(Err(io_err)) => {
                terminate(&mut child);
                let _ = child.wait();
                let _ = writer.join();
                let _ = reader.join();
                return Err(CoreAdapterError::Unavailable(io_err));
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                // The child outran its deadline: kill it — its whole process group
                // on Unix, so the core GRANDCHILD dies too — and fail typed rather
                // than hang. We do NOT join the reader: on Unix the group-kill
                // closes the pipe so it ends promptly, but on Windows the core
                // grandchild can survive (no Job Object) and hold the pipe, so a
                // join could block; detaching bounds our return to the deadline.
                // Timeout is OUTCOME-INDETERMINATE (see the variant docs): the
                // write may have landed before — or, on Windows, despite — the kill.
                terminate(&mut child);
                let _ = child.wait();
                let _ = writer.join();
                return Err(CoreAdapterError::Timeout {
                    secs: self.timeout.as_secs(),
                });
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                terminate(&mut child);
                let _ = child.wait();
                let _ = writer.join();
                return Err(CoreAdapterError::CoreFailed {
                    code: None,
                    stderr: "vaultspec-core stdout reader terminated unexpectedly".into(),
                });
            }
        };
        let _ = reader.join();
        let _ = writer.join();

        // Output hit the cap: kill the child and fail typed rather than parse a
        // truncated envelope.
        if stdout.len() as u64 >= cap {
            terminate(&mut child);
            let _ = child.wait();
            return Err(CoreAdapterError::OutputTooLarge {
                cap_mib: cap.div_ceil(1024 * 1024),
            });
        }

        let status = child.wait().map_err(CoreAdapterError::Unavailable)?;
        let raw = String::from_utf8_lossy(&stdout);

        // A `status`-bearing envelope is a VALID business response regardless of
        // the exit code — success (`created`/`updated`/`unchanged`, exit 0) OR a
        // refusal/conflict (`status:"failed"`, which the core exits non-zero for).
        // Branch on the ENVELOPE, not the exit code, so a refusal is never
        // mistaken for an engine fault (mirrors the `/ops/core` write broker).
        if let Ok(parsed) = serde_json::from_str::<Value>(&raw)
            && let Some(status_str) = parsed.get("status").and_then(Value::as_str)
        {
            let status = status_str.to_string();
            return Ok(CoreEnvelope {
                raw: parsed,
                status,
            });
        }

        // No parseable `status` envelope: a genuine fault, never a forged success.
        if !status.success() {
            let stderr = read_capped_stderr(&mut child, cap);
            return Err(CoreAdapterError::CoreFailed {
                code: status.code(),
                stderr,
            });
        }
        Err(CoreAdapterError::MalformedEnvelope {
            stdout: raw.into_owned(),
        })
    }
}

/// Kill the core child AND, on Unix, its whole process group. The invocation
/// `CoreRunner::detect()` binds is `["uv","run","--no-sync","vaultspec-core"]`
/// (its PREFERRED resolution), so the DIRECT child is the `uv` launcher and the
/// Python core is a GRANDCHILD — likewise the bare-PATH console-script shim →
/// python, and on Windows always. A bare `Child::kill` (`TerminateProcess` on
/// Windows) reaps only the launcher and leaves the core grandchild running, free
/// to finish the vault write AFTER we have already returned failure (ledger says
/// failed, document changed, preimage/rollback rot). On Unix we therefore kill
/// the whole PROCESS GROUP (the child is spawned as its group leader via
/// `process_group(0)`), reaping the grandchild too — reusing `ingest-core`'s
/// group-kill so the semantics stay identical to the read runner. On Windows a
/// true subtree kill needs a Job Object (a new dependency we deliberately avoid),
/// so the grandchild CAN survive; that is exactly why [`CoreAdapterError::Timeout`]
/// and [`CoreAdapterError::OutputTooLarge`] are OUTCOME-INDETERMINATE and the
/// apply caller MUST re-verify document post-state.
fn terminate(child: &mut Child) {
    ingest_core::runner::terminate(child);
}

/// Drain the child's stderr under a byte cap for the redacted [`CoreFailed`]
/// detail. Read after the child has exited, so the pipe cannot block it.
fn read_capped_stderr(child: &mut Child, cap: u64) -> String {
    child
        .stderr
        .take()
        .map(|e| {
            let mut buf = Vec::new();
            let _ = e.take(cap).read_to_end(&mut buf);
            String::from_utf8_lossy(&buf).into_owned()
        })
        .unwrap_or_default()
}

// --- validation (the injection-guard surface, mirroring the `/ops/core` grammar) ---

fn invalid(field: &'static str, value: &str, reason: &'static str) -> CoreAdapterError {
    CoreAdapterError::InvalidArgument {
        field,
        value: value.to_string(),
        reason,
    }
}

/// A bounded kebab/word token (`doc_type`, `feature`): non-empty, not flag-shaped
/// (no leading `-`), and restricted to `[A-Za-z0-9_-]+` so it can never carry a
/// path separator, whitespace, or shell-meaningful character into the argv.
fn validate_token(field: &'static str, value: &str) -> Result<String, CoreAdapterError> {
    let ok = !value.is_empty()
        && !value.starts_with('-')
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    if !ok {
        return Err(invalid(
            field,
            value,
            "must be a non-empty kebab/word token (letters, digits, `-`, `_`; no leading `-`)",
        ));
    }
    Ok(value.to_string())
}

/// A free-prose flag value (`title`, `date`, `tags`/`related` entry): non-empty
/// and not flag-shaped, so it can never be read by the core CLI as an option. The
/// value is otherwise stored verbatim by the core.
fn validate_flag_safe(field: &'static str, value: &str) -> Result<String, CoreAdapterError> {
    if value.is_empty() || value.starts_with('-') {
        return Err(invalid(
            field,
            value,
            "must be non-empty and not flag-shaped (no leading `-`)",
        ));
    }
    Ok(value.to_string())
}

/// A document `ref`: a doc stem or a bounded, in-tree relative path — no leading
/// `-`, no absolute path, no `..` traversal, no drive-letter prefix.
fn validate_doc_ref(field: &'static str, value: &str) -> Result<String, CoreAdapterError> {
    let bad = value.is_empty()
        || value.starts_with('-')
        || value.starts_with('/')
        || value.starts_with('\\')
        || value.chars().nth(1) == Some(':')
        || value.split(['/', '\\']).any(|seg| seg == "..");
    if bad {
        return Err(invalid(
            field,
            value,
            "must be a doc stem or a bounded, in-tree relative path (no leading `-`, no absolute \
             path, no `..` traversal)",
        ));
    }
    Ok(value.to_string())
}

/// A rename target stem (`--to`): a bare, identity-bearing stem that can never
/// escape the doc's directory or inject a flag.
fn validate_stem(field: &'static str, value: &str) -> Result<String, CoreAdapterError> {
    let bad = value.is_empty()
        || value.starts_with('-')
        || value.contains('/')
        || value.contains('\\')
        || value.contains("..")
        || value.ends_with(".md");
    if bad {
        return Err(invalid(
            field,
            value,
            "must be a bare stem (no path separator, no leading `-`, no `..`, no `.md`)",
        ));
    }
    Ok(value.to_string())
}

/// A canonical plan step id (`S##`): `S` followed by one or more ASCII digits —
/// no leading `-`, no path separator, nothing shell-meaningful. This is exactly
/// the `STEP_ID` argument the `vault plan step check/uncheck` verb accepts, so a
/// malformed id fails at the argv boundary rather than reaching core.
fn validate_step_id(field: &'static str, value: &str) -> Result<String, CoreAdapterError> {
    let ok = value.len() >= 2
        && value.starts_with('S')
        && value[1..].bytes().all(|b| b.is_ascii_digit());
    if !ok {
        return Err(invalid(
            field,
            value,
            "must be a canonical step id (`S` followed by digits, e.g. `S01`)",
        ));
    }
    Ok(value.to_string())
}

/// An optional `expected_blob_hash`: a 40-char lowercase hex git blob OID.
fn validate_blob_hash(field: &'static str, value: &str) -> Result<String, CoreAdapterError> {
    let ok = value.len() == 40
        && value
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase());
    if !ok {
        return Err(invalid(
            field,
            value,
            "must be a 40-char lowercase hex git blob OID",
        ));
    }
    Ok(value.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::authoring::model::CommandKind;

    /// A `CoreAdapter` that invokes the OS shell so the subprocess plumbing
    /// (stdin, stdout cap, timeout, exit-status) can be exercised without a real
    /// vaultspec-core. The trailing `--json` `invoke` appends is harmless: under
    /// `sh -c` it becomes `$0` (ignored); the PowerShell snippets wrap in
    /// `& { ... }` so it lands in `$args` (ignored).
    fn shell_adapter(unix: &str, windows: &str) -> CoreAdapter {
        let invocation = if cfg!(windows) {
            vec![
                "powershell".to_string(),
                "-NoProfile".into(),
                "-Command".into(),
                format!("& {{ {windows} }}"),
            ]
        } else {
            vec!["sh".to_string(), "-c".into(), unix.to_string()]
        };
        CoreAdapter::from_invocation(invocation)
    }

    /// A raw invocation with an EMPTY argv, so the shell snippet — not a real
    /// `vault …` verb — defines the child's behaviour. Body is streamed to stdin.
    fn shell_invocation(body: Option<&str>) -> CoreInvocation {
        CoreInvocation {
            capability: CoreCapability::SetBody,
            argv: Vec::new(),
            body: body.map(str::to_string),
        }
    }

    // --- S172/S173: argument builders + validation -------------------------

    #[test]
    fn create_document_builds_value_only_argv() {
        let inv = CoreInvocation::create_document(
            "adr",
            "agentic-spec-authoring-backend",
            Some("A decision"),
            "2026-07-09",
            &["[[some-research]]".to_string()],
        )
        .unwrap();
        assert_eq!(inv.capability(), CoreCapability::CreateDocument);
        assert_eq!(
            inv.argv(),
            &[
                "vault",
                "add",
                "adr",
                "--feature",
                "agentic-spec-authoring-backend",
                "--title",
                "A decision",
                "--date",
                "2026-07-09",
                "--related",
                "[[some-research]]",
            ]
        );
        assert!(!inv.has_body(), "create carries no stdin body");
    }

    #[test]
    fn write_assembles_flags_in_order_with_body_on_stdin() {
        let inv = CoreInvocation::write(
            CoreCapability::SetBody,
            "adr/2026-06-29-x",
            WriteArgs {
                expected_blob_hash: Some("a".repeat(40)),
                date: Some("2026-07-04".into()),
                tags: vec!["#adr".into()],
                related: vec!["[[y]]".into()],
                body: Some("new body".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            inv.argv(),
            &[
                "vault",
                "set-body",
                "adr/2026-06-29-x",
                "--expected-blob-hash",
                &"a".repeat(40),
                "--date",
                "2026-07-04",
                "--tags",
                "#adr",
                "--related",
                "[[y]]",
                "--body-stdin",
            ]
        );
        assert!(inv.has_body(), "the body rides stdin, never the argv");
        assert!(
            !inv.argv().iter().any(|a| a == "new body"),
            "the body text is never placed on the argv"
        );
    }

    #[test]
    fn rename_uses_validated_to_stem() {
        let inv = CoreInvocation::write(
            CoreCapability::Rename,
            "adr/old-stem",
            WriteArgs {
                new_stem: Some("new-stem".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            inv.argv(),
            &["vault", "rename", "adr/old-stem", "--to", "new-stem"]
        );
    }

    #[test]
    fn set_plan_step_state_builds_positional_argv_without_a_blob_fence() {
        // check → `vault plan step check <plan> <S##>`, no `--expected-blob-hash`
        // (the plan CLI has no such flag — ADR D1), no stdin body.
        let checked =
            CoreInvocation::set_plan_step_state(true, ".vault/plan/demo-plan.md", "S01").unwrap();
        assert_eq!(checked.capability(), CoreCapability::CheckPlanStep);
        assert_eq!(
            checked.argv(),
            &[
                "vault",
                "plan",
                "step",
                "check",
                ".vault/plan/demo-plan.md",
                "S01"
            ]
        );
        assert!(!checked.has_body(), "a plan tick carries no stdin body");
        assert!(
            !checked.argv().iter().any(|a| a == "--expected-blob-hash"),
            "the plan CLI verb carries no blob fence"
        );

        // uncheck → the sibling verb, same positional shape.
        let unchecked = CoreInvocation::set_plan_step_state(false, "demo-plan", "S12").unwrap();
        assert_eq!(unchecked.capability(), CoreCapability::UncheckPlanStep);
        assert_eq!(
            unchecked.argv(),
            &["vault", "plan", "step", "uncheck", "demo-plan", "S12"]
        );
    }

    #[test]
    fn set_plan_step_state_rejects_malformed_step_id_and_traversal_ref() {
        // A non-`S##` step id, a flag-shaped id, and a `..`-traversal plan ref all
        // fail BEFORE any spawn.
        assert!(CoreInvocation::set_plan_step_state(true, "demo-plan", "P01").is_err());
        assert!(CoreInvocation::set_plan_step_state(true, "demo-plan", "S").is_err());
        assert!(CoreInvocation::set_plan_step_state(true, "demo-plan", "-S1").is_err());
        assert!(CoreInvocation::set_plan_step_state(true, "demo-plan", "S1x").is_err());
        assert!(CoreInvocation::set_plan_step_state(true, "../escape", "S01").is_err());
    }

    /// The plan CLI verb's `--json` status vocabulary maps onto the adapter's
    /// EXISTING success set with no widening: a real state flip emits
    /// `"updated"`, an idempotent no-op emits `"unchanged"` (both success), and a
    /// business refusal — e.g. an unknown step id — emits `"failed"`. Confirmed
    /// by running `vaultspec-core vault plan step check/uncheck --json` against a
    /// scratch fixture plan during S01 execution.
    #[test]
    fn plan_step_status_vocabulary_maps_onto_the_existing_success_set() {
        for status in ["updated", "unchanged"] {
            let envelope = CoreEnvelope {
                raw: serde_json::json!({ "schema": "x.v1", "status": status }),
                status: status.to_string(),
            };
            assert!(
                envelope.is_success(),
                "plan-tick success status `{status}` is already in the adapter success set"
            );
        }
        let refusal = CoreEnvelope {
            raw: serde_json::json!({ "schema": "x.v1", "status": "failed" }),
            status: "failed".to_string(),
        };
        assert!(
            refusal.is_failed(),
            "an unknown-step refusal is a business `failed`, handled as a recorded failure"
        );
    }

    #[test]
    fn validation_rejects_injection_shaped_inputs() {
        // Flag-shaped / out-of-grammar tokens, path traversal, drive prefixes,
        // bad blob hashes, and unsafe rename stems all fail BEFORE any spawn.
        assert!(CoreInvocation::create_document("--evil", "f", None, "2026-07-09", &[]).is_err());
        assert!(
            CoreInvocation::create_document("adr", "bad feature", None, "2026-07-09", &[]).is_err()
        );
        assert!(
            CoreInvocation::create_document("adr", "f", Some("-inject"), "2026-07-09", &[])
                .is_err(),
            "a flag-shaped title is rejected"
        );
        assert!(
            CoreInvocation::write(CoreCapability::SetBody, "../escape", WriteArgs::default())
                .is_err(),
            "a `..` traversal ref is rejected"
        );
        assert!(
            CoreInvocation::write(CoreCapability::SetBody, "/abs/path", WriteArgs::default())
                .is_err(),
            "an absolute ref is rejected"
        );
        assert!(
            CoreInvocation::write(
                CoreCapability::SetBody,
                "adr/x",
                WriteArgs {
                    expected_blob_hash: Some("NOTAHASH".into()),
                    ..Default::default()
                }
            )
            .is_err(),
            "a malformed blob hash is rejected"
        );
        assert!(
            CoreInvocation::write(
                CoreCapability::Rename,
                "adr/x",
                WriteArgs {
                    new_stem: Some("../escape".into()),
                    ..Default::default()
                }
            )
            .is_err(),
            "a traversal rename stem is rejected"
        );
    }

    #[test]
    fn write_rejects_a_non_write_capability() {
        let err = CoreInvocation::write(
            CoreCapability::CreateDocument,
            "adr/x",
            WriteArgs::default(),
        )
        .unwrap_err();
        assert!(matches!(
            err,
            CoreAdapterError::UnsupportedCapability { .. }
        ));
    }

    // --- S173: error redaction --------------------------------------------

    #[test]
    fn wire_reason_redacts_stderr_paths_and_secrets() {
        let leak = "/home/alice/private/repo panicked; token=sk-SECRET-123 at /abs/core.py:42";
        let err = CoreAdapterError::CoreFailed {
            code: Some(1),
            stderr: leak.to_string(),
        };
        let wire = err.wire_reason();
        assert!(
            !wire.contains("/home/alice")
                && !wire.contains("sk-SECRET-123")
                && !wire.contains(leak),
            "wire reason must not leak stderr paths/secrets: {wire}"
        );
        // The operator log still gets the full detail.
        assert_eq!(err.log_detail().as_deref(), Some(leak));
    }

    #[test]
    fn wire_reason_redacts_raw_argument_values() {
        let err = invalid(
            "related",
            "/secret/path/to/leak.md",
            "must be non-empty and not flag-shaped (no leading `-`)",
        );
        let wire = err.wire_reason();
        assert!(
            !wire.contains("/secret/path/to/leak.md"),
            "wire reason must not echo the raw value: {wire}"
        );
        assert!(wire.contains("related"), "but it names the field: {wire}");
        assert!(
            err.log_detail()
                .unwrap()
                .contains("/secret/path/to/leak.md"),
            "the raw value survives only in the operator log"
        );
    }

    #[test]
    fn malformed_envelope_wire_reason_hides_stdout() {
        let err = CoreAdapterError::MalformedEnvelope {
            stdout: "garbage /abs/leak KEY=xyz".to_string(),
        };
        assert!(!err.wire_reason().contains("/abs/leak"));
        assert!(!err.wire_reason().contains("KEY=xyz"));
    }

    // --- S173: bounded subprocess behaviour (cap + timeout) ----------------

    #[test]
    fn invoke_returns_a_status_bearing_envelope() {
        let adapter = shell_adapter(
            r#"printf '%s' '{"schema":"x.v1","status":"updated","data":{"n":1}}'"#,
            r#"[Console]::Out.Write('{"schema":"x.v1","status":"updated","data":{"n":1}}')"#,
        );
        let cwd = std::env::current_dir().unwrap();
        let env = adapter
            .invoke(&cwd, &shell_invocation(None))
            .expect("a status-bearing envelope parses");
        assert_eq!(env.status, "updated");
        assert!(env.is_success());
        assert_eq!(env.raw["data"]["n"], 1);
    }

    #[test]
    fn invoke_forwards_a_business_refusal_as_ok() {
        // A `status:"failed"` refusal exits non-zero but is a VALID business
        // response, not an adapter fault — it rides Ok, the caller branches on it.
        let adapter = shell_adapter(
            r#"printf '%s' '{"schema":"x.v1","status":"failed","data":{"conflict":true}}'; exit 1"#,
            r#"[Console]::Out.Write('{"schema":"x.v1","status":"failed","data":{"conflict":true}}'); exit 1"#,
        );
        let cwd = std::env::current_dir().unwrap();
        let env = adapter
            .invoke(&cwd, &shell_invocation(None))
            .expect("a status-bearing refusal is Ok, not an error");
        assert!(env.is_failed());
        assert_eq!(env.raw["data"]["conflict"], true);
    }

    #[test]
    fn invoke_streams_the_body_to_stdin() {
        // The child reads stdin and reports its byte length in the envelope,
        // proving the body was delivered (and never appeared on the argv).
        let adapter = shell_adapter(
            r#"n=$(cat | wc -c); printf '{"schema":"x.v1","status":"updated","data":{"n":%s}}' "$n""#,
            r#"$b=[Console]::In.ReadToEnd(); [Console]::Out.Write('{"schema":"x.v1","status":"updated","data":{"n":' + $b.Length + '}}')"#,
        );
        let cwd = std::env::current_dir().unwrap();
        let env = adapter
            .invoke(&cwd, &shell_invocation(Some("hello")))
            .expect("envelope parses");
        assert_eq!(env.raw["data"]["n"], 5, "the 5-byte body reached stdin");
    }

    #[test]
    fn invoke_reports_a_crash_with_no_envelope_as_core_failed_and_redacts() {
        // Non-zero exit + secret-laden stderr + no parseable envelope → a typed
        // CoreFailed whose wire reason is clean while the log keeps the detail.
        let adapter = shell_adapter(
            r#"printf '%s' '/abs/secret/path token=sk-LEAK' >&2; exit 3"#,
            r#"[Console]::Error.Write('/abs/secret/path token=sk-LEAK'); exit 3"#,
        );
        let cwd = std::env::current_dir().unwrap();
        let err = adapter.invoke(&cwd, &shell_invocation(None)).unwrap_err();
        assert!(
            matches!(err, CoreAdapterError::CoreFailed { .. }),
            "{err:?}"
        );
        assert!(
            !err.wire_reason().contains("sk-LEAK") && !err.wire_reason().contains("/abs/secret"),
            "the crash wire reason must not leak stderr"
        );
        assert!(
            err.log_detail().unwrap_or_default().contains("sk-LEAK"),
            "the stderr survives for the operator log"
        );
    }

    #[test]
    fn invoke_caps_runaway_stdout_instead_of_ooming() {
        let cap: u64 = 1024 * 1024;
        let bytes = (cap + 1024 * 1024) as usize;
        let adapter = shell_adapter(
            &format!("head -c {bytes} /dev/zero | tr '\\0' 'x'"),
            &format!("[Console]::Out.Write('x' * {bytes})"),
        )
        .with_stdout_cap(cap);
        let cwd = std::env::current_dir().unwrap();
        let err = adapter.invoke(&cwd, &shell_invocation(None)).unwrap_err();
        assert!(
            matches!(err, CoreAdapterError::OutputTooLarge { .. }),
            "runaway stdout → OutputTooLarge, got {err:?}"
        );
    }

    #[test]
    fn invoke_kills_a_hung_child_at_the_timeout() {
        let adapter = shell_adapter("sleep 30", "Start-Sleep -Seconds 30")
            .with_timeout(Duration::from_millis(400));
        let cwd = std::env::current_dir().unwrap();
        let start = std::time::Instant::now();
        let err = adapter.invoke(&cwd, &shell_invocation(None)).unwrap_err();
        let elapsed = start.elapsed();
        assert!(
            matches!(err, CoreAdapterError::Timeout { .. }),
            "hung child → Timeout, got {err:?}"
        );
        assert!(
            elapsed < Duration::from_secs(10),
            "returned at the ~0.4s deadline, not after the 30s sleep; took {elapsed:?}"
        );
    }

    #[test]
    fn timeout_and_cap_are_outcome_indeterminate_the_rest_are_not() {
        // The load-bearing R1 contract: a mid-flight kill leaves the write
        // OUTCOME-UNKNOWN (the core, or its surviving Windows grandchild, may have
        // completed it), so the apply caller MUST re-verify post-state and never
        // record "not applied." Determinate failures did not kill a write.
        assert!(CoreAdapterError::Timeout { secs: 1 }.is_outcome_indeterminate());
        assert!(CoreAdapterError::OutputTooLarge { cap_mib: 8 }.is_outcome_indeterminate());
        assert!(!invalid("ref", "x", "bad").is_outcome_indeterminate());
        assert!(
            !CoreAdapterError::CoreFailed {
                code: Some(1),
                stderr: String::new(),
            }
            .is_outcome_indeterminate()
        );
        assert!(
            !CoreAdapterError::Unavailable(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "missing",
            ))
            .is_outcome_indeterminate()
        );
    }

    #[test]
    #[cfg(unix)]
    fn timeout_group_kills_the_core_grandchild() {
        // The realistic apply bug R1 fixes: the direct child is a LAUNCHER (uv)
        // and the real vault write happens in a GRANDCHILD. Emulate with a shell
        // that backgrounds a grandchild which writes a marker after a delay, then
        // exits immediately. The deadline's GROUP-kill must reap the grandchild so
        // the marker is NEVER written; a bare child-kill (the pre-R1 bug) would
        // leave the orphaned grandchild to complete the "write."
        let marker = std::env::temp_dir().join(format!(
            "core_adapter_grandchild_{}_{}.marker",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = std::fs::remove_file(&marker);
        let snippet = format!("(sleep 2; printf done > '{}') &", marker.display());
        let adapter = CoreAdapter::from_invocation(vec!["sh".into(), "-c".into(), snippet])
            .with_timeout(Duration::from_millis(300));
        let cwd = std::env::current_dir().unwrap();
        let err = adapter.invoke(&cwd, &shell_invocation(None)).unwrap_err();
        assert!(matches!(err, CoreAdapterError::Timeout { .. }), "{err:?}");
        // Wait well past the grandchild's 2s write window; if the group-kill
        // reaped it, the marker is absent. (A leaked child would have written it.)
        std::thread::sleep(Duration::from_millis(2600));
        let survived = marker.exists();
        let _ = std::fs::remove_file(&marker);
        assert!(
            !survived,
            "group-kill must reap the backgrounded grandchild before it can write"
        );
    }

    #[test]
    fn invoke_surfaces_a_missing_core_as_unavailable() {
        let adapter =
            CoreAdapter::from_invocation(vec!["definitely-not-a-real-program-xyzzy".to_string()]);
        let cwd = std::env::current_dir().unwrap();
        let err = adapter.invoke(&cwd, &shell_invocation(None)).unwrap_err();
        assert!(
            matches!(err, CoreAdapterError::Unavailable(_)),
            "a missing core → Unavailable, got {err:?}"
        );
        assert_eq!(err.wire_reason(), "vaultspec-core could not be launched");
    }

    // --- S175: collaborators cannot see or invoke core-shaped writes -------

    #[test]
    fn every_capability_resolves_to_a_core_shaped_verb() {
        // The capability registry is the ONE place core verb strings live, and
        // every entry is core-shaped (`vault …`). Kept internal (`pub(crate)`),
        // it is never serialized onto the wire.
        for cap in [
            CoreCapability::CreateDocument,
            CoreCapability::SetBody,
            CoreCapability::SetFrontmatter,
            CoreCapability::Edit,
            CoreCapability::Rename,
            CoreCapability::CheckPlanStep,
            CoreCapability::UncheckPlanStep,
        ] {
            assert_eq!(
                cap.fixed_args().first().copied(),
                Some("vault"),
                "{cap:?} must resolve to a `vault …` verb"
            );
            // The audit/log label is SEMANTIC — it never re-exposes the raw verb.
            assert!(
                !cap.label().contains("vault") && !cap.label().contains("core"),
                "{cap:?} label must stay semantic: {}",
                cap.label()
            );
        }
    }

    #[test]
    fn semantic_command_vocabulary_is_disjoint_from_core_verbs() {
        // The collaborator-facing wire vocabulary is `CommandKind` (semantic). No
        // serialized command name is a core verb token, and no core verb token is
        // a command name — the two planes are disjoint namespaces, so a
        // collaborator payload can never name a core-shaped write. There is also
        // deliberately NO wire-string → CoreCapability path (no Deserialize /
        // FromStr), so an external string cannot select a capability at all;
        // capability selection is a compile-time Rust choice in the apply command.
        let core_verbs: Vec<&str> = [
            CoreCapability::CreateDocument,
            CoreCapability::SetBody,
            CoreCapability::SetFrontmatter,
            CoreCapability::Edit,
            CoreCapability::Rename,
            CoreCapability::CheckPlanStep,
            CoreCapability::UncheckPlanStep,
        ]
        .into_iter()
        .flat_map(|c| c.fixed_args().iter().copied())
        .collect();

        for command in CommandKind::ALL {
            let name = serde_json::to_value(command).unwrap();
            let name = name.as_str().unwrap().to_string();
            assert!(
                !core_verbs.contains(&name.as_str()),
                "semantic command `{name}` must not collide with a core verb"
            );
            assert!(
                !name.contains("core") && !name.contains("vault"),
                "semantic command `{name}` must not be core-shaped"
            );
        }
    }
}
