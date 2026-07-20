//! Migration-range validation and quiescence-gated staged migration (S50).
//!
//! A transactional update may advance the A2A desktop schema, but only the A2A
//! capsule owns the migration graph. This module owns the two product-side
//! responsibilities the ADR assigns it and nothing more:
//!
//! 1. **Range validation.** Given the installed schema head and the candidate
//!    capsule's declared migration range, decide deterministically whether the
//!    update is already current, a legal single-step forward migration, or an
//!    incompatible move the product refuses. The product never orders opaque
//!    revisions itself — it only compares the installed head against the
//!    candidate's declared base and head.
//! 2. **Quiescence-gated bounded invocation.** Invoke ONLY the staged (candidate)
//!    A2A migration entrypoint, and only after complete quiescence — admission
//!    closed and the owned runtime stopped. Quiescence is a typed proof the S52
//!    transaction constructs after it drains and stops the gateway; a migration
//!    cannot run without it. The invocation is bounded by an output byte cap AND
//!    a wall-clock timeout, and the whole process tree is killed on either breach
//!    (resource-bounds law).
//!
//! The migration program is resolved capsule-relative through the same validated
//! path authority the gateway launch uses, so a malformed manifest can never
//! point the invocation outside the candidate capsule.

use std::ffi::OsString;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crate::process::ResolvedProgram;

const MAX_REVISION_BYTES: usize = 64;

/// One validated schema revision identifier (a migration base or head).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Revision(String);

impl Revision {
    /// Validate a revision identifier against the capsule migration grammar:
    /// non-empty, bounded, alphanumeric plus `._-`, first byte alphanumeric, and
    /// never a floating alembic selector (`head`, `base`, `latest`, `x`).
    pub fn new(value: impl Into<String>) -> Result<Self, MigrationError> {
        let value = value.into();
        let lower = value.to_ascii_lowercase();
        let ok = !value.is_empty()
            && value.len() <= MAX_REVISION_BYTES
            && !matches!(lower.as_str(), "head" | "heads" | "base" | "latest" | "x")
            && value
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
            && value.as_bytes()[0].is_ascii_alphanumeric();
        if ok {
            Ok(Self(value))
        } else {
            Err(MigrationError::InvalidRevision(value))
        }
    }

    /// The revision text.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// A candidate capsule's declared migration range: the base it migrates from and
/// the head it migrates to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MigrationRangeSpec {
    base: Revision,
    head: Revision,
}

impl MigrationRangeSpec {
    /// Validate a candidate migration range from its raw base and head revisions.
    pub fn new(base: impl Into<String>, head: impl Into<String>) -> Result<Self, MigrationError> {
        Ok(Self {
            base: Revision::new(base)?,
            head: Revision::new(head)?,
        })
    }

    /// The base revision the candidate migrates from.
    #[must_use]
    pub fn base(&self) -> &str {
        self.base.as_str()
    }

    /// The head revision the candidate migrates to.
    #[must_use]
    pub fn head(&self) -> &str {
        self.head.as_str()
    }
}

/// Whether a validated plan requires invoking the staged migration.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MigrationDecision {
    /// The installed schema is already the candidate head; no migration runs.
    AlreadyCurrent,
    /// A legal forward migration from the installed head (or a fresh install) to
    /// the candidate head must be applied.
    Forward,
}

/// A validated migration plan bound to one candidate head.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MigrationPlan {
    decision: MigrationDecision,
    from: Option<String>,
    target_head: String,
}

impl MigrationPlan {
    /// Whether the staged migration must be invoked.
    #[must_use]
    pub fn decision(&self) -> MigrationDecision {
        self.decision
    }

    /// The installed head this plan migrates from, or `None` for a fresh install.
    #[must_use]
    pub fn from(&self) -> Option<&str> {
        self.from.as_deref()
    }

    /// The candidate head this plan targets.
    #[must_use]
    pub fn target_head(&self) -> &str {
        &self.target_head
    }
}

/// Decide the migration plan from the installed schema head and the candidate
/// range.
///
/// The move is refused unless it is a legal forward step: the installed head must
/// equal the candidate's declared base (or be absent, for a fresh install), or
/// already equal the candidate head. The product deliberately does not infer that
/// an in-between installed revision is bridgeable, because only the capsule owns
/// the migration graph; an unrecognized installed head fails closed.
pub fn plan_migration(
    installed_head: Option<&str>,
    candidate: &MigrationRangeSpec,
) -> Result<MigrationPlan, MigrationError> {
    let installed = installed_head.map(Revision::new).transpose()?;
    let from = installed
        .as_ref()
        .map(|revision| revision.as_str().to_owned());
    let decision = match installed.as_ref() {
        Some(installed) if installed == &candidate.head => MigrationDecision::AlreadyCurrent,
        Some(installed) if installed == &candidate.base => MigrationDecision::Forward,
        Some(_) => {
            return Err(MigrationError::IncompatibleRange {
                installed: from.unwrap_or_default(),
                base: candidate.base.as_str().to_owned(),
                head: candidate.head.as_str().to_owned(),
            });
        }
        None => MigrationDecision::Forward,
    };
    Ok(MigrationPlan {
        decision,
        from,
        target_head: candidate.head.as_str().to_owned(),
    })
}

/// Typed proof that admission is closed and the owned runtime is stopped.
///
/// The S52 transaction constructs this only after it has drained and stopped the
/// owned gateway. A staged migration requires it, so a migration can never run
/// against a live database. It carries no authority beyond that ordering witness.
#[derive(Debug)]
pub struct Quiescence(());

impl Quiescence {
    /// Assert quiescence. Crate-internal so only the transaction that performed
    /// the drain-and-stop can vouch for it.
    #[must_use]
    #[allow(
        dead_code,
        reason = "S50 lands the quiescence witness before its S52 transaction consumer"
    )]
    pub(crate) fn asserted_after_stop() -> Self {
        Self(())
    }
}

/// Bounds on one staged migration invocation.
#[derive(Debug, Clone, Copy)]
pub struct MigrationLimits {
    output_cap: usize,
    wall_timeout: Duration,
}

impl MigrationLimits {
    /// Bound the invocation by a captured-output byte cap and a wall-clock
    /// timeout. Both must be positive.
    #[must_use]
    pub fn new(output_cap: usize, wall_timeout: Duration) -> Self {
        Self {
            output_cap,
            wall_timeout,
        }
    }
}

/// A resolved, bounded staged-migration invocation.
#[derive(Debug)]
pub struct StagedMigration {
    program: std::path::PathBuf,
    args: Vec<OsString>,
    limits: MigrationLimits,
}

impl StagedMigration {
    /// Resolve the staged migration program capsule-relative under the candidate
    /// capsule root, so it can never escape the capsule tree.
    pub fn from_capsule_relative(
        capsule_root: &Path,
        segments: &[&str],
        args: impl IntoIterator<Item = OsString>,
        limits: MigrationLimits,
    ) -> Result<Self, MigrationError> {
        let program = ResolvedProgram::from_capsule_relative(capsule_root, segments)
            .map_err(|error| MigrationError::Resolve(error.to_string()))?;
        Ok(Self {
            program: program.path().to_path_buf(),
            args: args.into_iter().collect(),
            limits,
        })
    }

    /// Test-only construction from a raw program path. Not public: an external
    /// caller cannot bypass capsule-relative resolution.
    #[cfg(test)]
    pub(crate) fn from_program(
        program: std::path::PathBuf,
        args: impl IntoIterator<Item = OsString>,
        limits: MigrationLimits,
    ) -> Self {
        Self {
            program,
            args: args.into_iter().collect(),
            limits,
        }
    }

    /// Invoke the staged migration for `plan` under proven quiescence.
    ///
    /// An already-current plan runs nothing. Otherwise the child is spawned in its
    /// own process group with captured stdout, and the whole tree is force-killed
    /// on a wall-clock timeout or an output-cap breach. A non-zero exit is a typed
    /// failure carrying bounded diagnostics.
    pub fn run(
        &self,
        plan: &MigrationPlan,
        _quiescence: &Quiescence,
    ) -> Result<MigrationOutcome, MigrationError> {
        if plan.decision == MigrationDecision::AlreadyCurrent {
            return Ok(MigrationOutcome::Skipped);
        }
        self.run_bounded()
    }

    fn run_bounded(&self) -> Result<MigrationOutcome, MigrationError> {
        let mut command = Command::new(&self.program);
        command.args(&self.args);
        run_bounded_command(&mut command, self.limits)
    }
}

/// Spawn a prepared command in its own process group with captured, bounded
/// stdout, killing the whole tree on a wall-clock timeout or an output-cap
/// breach. The command's program, args, and environment are the caller's; this
/// runner owns only stdio, bounding, and tree cleanup.
fn run_bounded_command(
    command: &mut Command,
    limits: MigrationLimits,
) -> Result<MigrationOutcome, MigrationError> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = spawn_group(command).map_err(MigrationError::Spawn)?;
    let pid = child.id();
    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| MigrationError::Spawn(std::io::Error::other("no captured stdout")))?;

    // Drain stdout on a worker thread so the child never blocks on a full pipe,
    // retaining only the first cap + 1 bytes and setting an overflow flag once the
    // cap is exceeded. Draining is itself time-bounded because the main loop kills
    // the child on the wall-clock deadline or as soon as it observes the overflow.
    let cap = limits.output_cap;
    let overflow = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let reader_overflow = std::sync::Arc::clone(&overflow);
    let reader = std::thread::spawn(move || {
        let mut retained = Vec::new();
        let mut scratch = [0_u8; 8192];
        let mut total = 0usize;
        loop {
            match stdout.read(&mut scratch) {
                Ok(0) | Err(_) => break,
                Ok(read) => {
                    total = total.saturating_add(read);
                    if retained.len() <= cap {
                        let keep = (cap + 1 - retained.len()).min(read);
                        retained.extend_from_slice(&scratch[..keep]);
                    }
                    if total > cap {
                        reader_overflow.store(true, std::sync::atomic::Ordering::Release);
                    }
                }
            }
        }
        retained
    });

    let deadline = Instant::now() + limits.wall_timeout;
    let mut breach: Option<MigrationError> = None;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => {}
            Err(error) => {
                kill_group(&mut child, pid);
                let _ = reader.join();
                return Err(MigrationError::Spawn(error));
            }
        }
        if overflow.load(std::sync::atomic::Ordering::Acquire) {
            breach = Some(MigrationError::OutputTooLarge { cap });
            kill_group(&mut child, pid);
            break None;
        }
        if Instant::now() >= deadline {
            breach = Some(MigrationError::Timeout {
                wall_timeout: limits.wall_timeout,
            });
            kill_group(&mut child, pid);
            break None;
        }
        std::thread::sleep(Duration::from_millis(20));
    };

    let output = reader.join().unwrap_or_default();
    if let Some(breach) = breach {
        return Err(breach);
    }
    // A child that exited on its own could still have raced past the cap between
    // the last overflow check and exit.
    if output.len() > cap {
        return Err(MigrationError::OutputTooLarge { cap });
    }
    let status = status.expect("status is Some when no breach occurred");
    if status.success() {
        Ok(MigrationOutcome::Applied {
            bounded_output: output,
        })
    } else {
        Err(MigrationError::MigrationFailed {
            code: status.code(),
            bounded_output: output,
        })
    }
}

/// The result of a staged migration invocation.
#[derive(Debug)]
pub enum MigrationOutcome {
    /// The installed schema was already current; nothing ran.
    Skipped,
    /// The migration applied successfully; bounded captured output is retained.
    Applied {
        /// Captured stdout, bounded by the output cap.
        bounded_output: Vec<u8>,
    },
}

fn spawn_group(command: &mut Command) -> std::io::Result<std::process::Child> {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt as _;
        command.process_group(0);
        command.spawn()
    }
    #[cfg(windows)]
    {
        command.spawn()
    }
}

fn kill_group(child: &mut std::process::Child, pid: u32) {
    #[cfg(unix)]
    {
        use nix::sys::signal::{Signal, killpg};
        use nix::unistd::Pid;
        if let Ok(raw) = i32::try_from(pid) {
            let _ = killpg(Pid::from_raw(raw), Signal::SIGKILL);
        }
    }
    #[cfg(windows)]
    {
        let _ = pid;
        let _ = child.kill();
    }
    let _ = child.wait();
}

/// Why a migration could not be planned or invoked.
#[derive(Debug)]
pub enum MigrationError {
    /// A revision identifier violated the migration grammar.
    InvalidRevision(String),
    /// The installed head is neither the candidate base nor the candidate head,
    /// so the product cannot prove a legal forward migration.
    IncompatibleRange {
        /// The installed schema head.
        installed: String,
        /// The candidate's declared migration base.
        base: String,
        /// The candidate's declared migration head.
        head: String,
    },
    /// The staged migration program could not be resolved capsule-relative.
    Resolve(String),
    /// The staged migration child could not be spawned or reaped.
    Spawn(std::io::Error),
    /// The staged migration exceeded its wall-clock timeout and was killed.
    Timeout {
        /// The wall-clock bound that was breached.
        wall_timeout: Duration,
    },
    /// The staged migration produced more than its output cap and was killed.
    OutputTooLarge {
        /// The output byte cap that was breached.
        cap: usize,
    },
    /// The staged migration exited non-zero.
    MigrationFailed {
        /// The child exit code, if one was reported.
        code: Option<i32>,
        /// Bounded captured output for diagnosis.
        bounded_output: Vec<u8>,
    },
}

impl std::fmt::Display for MigrationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidRevision(value) => {
                write!(f, "invalid migration revision {value:?}")
            }
            Self::IncompatibleRange {
                installed,
                base,
                head,
            } => write!(
                f,
                "installed schema {installed:?} is not a legal base for candidate migration {base:?}..{head:?}"
            ),
            Self::Resolve(detail) => {
                write!(f, "staged migration program resolution failed: {detail}")
            }
            Self::Spawn(error) => write!(f, "staged migration process error: {error}"),
            Self::Timeout { wall_timeout } => {
                write!(
                    f,
                    "staged migration exceeded {wall_timeout:?} and was killed"
                )
            }
            Self::OutputTooLarge { cap } => {
                write!(
                    f,
                    "staged migration exceeded its {cap}-byte output cap and was killed"
                )
            }
            Self::MigrationFailed { code, .. } => {
                write!(f, "staged migration exited non-zero (code {code:?})")
            }
        }
    }
}

impl std::error::Error for MigrationError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Spawn(error) => Some(error),
            _ => None,
        }
    }
}

#[cfg(test)]
#[path = "migration/tests.rs"]
mod tests;
