//! The ONE bounded async child-process runner for the engine's serve paths.
//!
//! Every external process the engine spawns carries BOTH an output byte cap AND
//! a wall-clock timeout, killing the child on either breach (project rule
//! `resource-bounds`). That lifecycle was previously hand-copied at every call
//! site, and every copy but one piped the child's stderr and then never read it
//! — a chatty child that fills the OS stderr pipe buffer (64 KiB on Windows, 64
//! KiB on Linux) blocks forever on its own write, its stdout stops, and the call
//! wedges until the wall-clock timeout fires and surfaces as a spurious 504/502.
//!
//! This module owns the whole lifecycle once: pipe every stream, write any stdin
//! body and drain BOTH output streams CONCURRENTLY under the cap, kill on either
//! bound, then reap. Callers supply the argv/env/cwd, the caps, and the cap
//! policy, and interpret the raw [`BoundedOutcome`] themselves — the exit-code
//! and envelope semantics differ per route and stay at the call site.

use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};

/// The two bounds every spawned child carries.
#[derive(Debug, Clone, Copy)]
pub(crate) struct BoundedLimits {
    /// Per-stream byte ceiling. Each of stdout and stderr is read through it.
    pub(crate) cap: u64,
    /// Wall-clock ceiling on the whole write-and-drain phase.
    pub(crate) timeout: Duration,
}

/// What reaching the byte cap means for this caller.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CapPolicy {
    /// A runaway child is a fault: the cap breach is [`BoundedFault::OverCap`],
    /// never a truncated payload parsed as if it were complete.
    Refuse,
    /// The bounded prefix is a usable answer: the outcome carries what was read
    /// with `truncated` set, and the exit status is NOT consulted (the child was
    /// killed mid-stream, so its status says nothing about the work).
    KeepPartial,
}

/// A completed bounded run. Exit-code interpretation belongs to the caller.
#[derive(Debug)]
pub(crate) struct BoundedOutcome {
    /// The child's exit code, absent when it was signalled or killed at the cap.
    pub(crate) code: Option<i32>,
    /// Whether the child exited successfully. Always `false` when `truncated`.
    pub(crate) success: bool,
    /// Bytes read from stdout, at most `cap`.
    pub(crate) stdout: Vec<u8>,
    /// Bytes read from stderr, at most `cap`. Drained even when unused, because
    /// an undrained pipe is what wedges the child.
    pub(crate) stderr: Vec<u8>,
    /// Set only under [`CapPolicy::KeepPartial`]: a stream reached the cap and
    /// the child was killed, so this payload is a bounded prefix.
    pub(crate) truncated: bool,
}

impl BoundedOutcome {
    /// Stdout as lossy UTF-8.
    pub(crate) fn stdout_lossy(&self) -> std::borrow::Cow<'_, str> {
        String::from_utf8_lossy(&self.stdout)
    }

    /// Stderr as lossy UTF-8.
    pub(crate) fn stderr_lossy(&self) -> std::borrow::Cow<'_, str> {
        String::from_utf8_lossy(&self.stderr)
    }
}

/// Why a bounded run produced no outcome. Each is a genuine engine-side fault —
/// a non-zero child exit is NOT one of these, it is a successful run the caller
/// interprets.
#[derive(Debug)]
pub(crate) enum BoundedFault {
    /// The program could not be spawned (absent, not executable).
    Spawn(std::io::Error),
    /// Reading a stream failed.
    Read(std::io::Error),
    /// The wall-clock bound elapsed; the child was killed.
    Timeout,
    /// A stream reached the byte cap under [`CapPolicy::Refuse`]; the child was
    /// killed.
    OverCap,
    /// The child could not be reaped.
    Wait(std::io::Error),
}

/// Run `command` to completion under both bounds, draining stdout and stderr
/// concurrently.
///
/// The runner owns every stdio decision: stdin is piped when `stdin_body` is
/// `Some` (the bytes are written and the handle CLOSED so the child's stdin read
/// sees EOF) and nulled otherwise; stdout and stderr are always piped and always
/// drained. The stdin write joins the same concurrent phase as the two reads, so
/// a body larger than the stdin pipe buffer cannot deadlock against a child that
/// is already writing output.
pub(crate) async fn run_bounded(
    mut command: tokio::process::Command,
    stdin_body: Option<&str>,
    limits: BoundedLimits,
    cap_policy: CapPolicy,
) -> Result<BoundedOutcome, BoundedFault> {
    command
        .stdin(if stdin_body.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn().map_err(BoundedFault::Spawn)?;

    let stdin = child.stdin.take();
    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");

    let body = stdin_body.map(str::to_owned);
    let feed = async move {
        // A broken pipe here (the child exited before reading) is not fatal on
        // its own: the exit status and output below decide the outcome.
        if let Some(mut stdin) = stdin {
            if let Some(text) = body {
                let _ = stdin.write_all(text.as_bytes()).await;
            }
            let _ = stdin.flush().await;
            // Drop closes the pipe, which is the child's EOF.
        }
    };
    let out_sink = Arc::new(Mutex::new(Vec::new()));
    let err_sink = Arc::new(Mutex::new(Vec::new()));
    // One stream reaching the cap ends the whole run: the other stream may never
    // reach EOF (the child is blocked writing into the pipe we stopped reading),
    // so waiting for both would reintroduce the wedge the cap exists to bound.
    let (cap_tx, mut cap_rx) = tokio::sync::mpsc::channel::<()>(2);
    let collect = async {
        tokio::join!(
            drain_capped(stdout, limits.cap, Arc::clone(&out_sink), cap_tx.clone()),
            drain_capped(stderr, limits.cap, Arc::clone(&err_sink), cap_tx.clone()),
            feed,
        )
    };

    let reads = tokio::time::timeout(limits.timeout, async {
        tokio::select! {
            (out_read, err_read, ()) = collect => Some((out_read, err_read)),
            _ = cap_rx.recv() => None,
        }
    })
    .await;
    let stdout = std::mem::take(&mut *out_sink.lock().expect("stdout sink"));
    let stderr = std::mem::take(&mut *err_sink.lock().expect("stderr sink"));

    let reads = match reads {
        Ok(reads) => reads,
        Err(_) => {
            // Timed out: kill the child so it cannot linger as a zombie.
            let _ = child.kill().await;
            return Err(BoundedFault::Timeout);
        }
    };
    if let Some((out_read, err_read)) = reads {
        out_read.map_err(BoundedFault::Read)?;
        err_read.map_err(BoundedFault::Read)?;
    }

    let at_cap = stdout.len() as u64 >= limits.cap || stderr.len() as u64 >= limits.cap;
    if at_cap {
        let _ = child.kill().await;
        return match cap_policy {
            CapPolicy::Refuse => Err(BoundedFault::OverCap),
            CapPolicy::KeepPartial => Ok(BoundedOutcome {
                code: None,
                success: false,
                stdout,
                stderr,
                truncated: true,
            }),
        };
    }

    let status = child.wait().await.map_err(BoundedFault::Wait)?;
    Ok(BoundedOutcome {
        code: status.code(),
        success: status.success(),
        stdout,
        stderr,
        truncated: false,
    })
}

/// Drain one child stream into `sink`, stopping at `cap` bytes and announcing
/// that breach on `cap_hit`. The sink is shared so the bytes read before a cap
/// breach or a timeout survive the dropped future.
async fn drain_capped(
    reader: impl AsyncRead + Unpin,
    cap: u64,
    sink: Arc<Mutex<Vec<u8>>>,
    cap_hit: tokio::sync::mpsc::Sender<()>,
) -> std::io::Result<()> {
    let mut reader = reader;
    let mut chunk = [0_u8; 8 * 1024];
    loop {
        let read = reader.read(&mut chunk).await?;
        if read == 0 {
            return Ok(());
        }
        let filled = {
            let mut sink = sink.lock().expect("stream sink");
            let room = usize::try_from(cap).unwrap_or(usize::MAX) - sink.len();
            sink.extend_from_slice(&chunk[..read.min(room)]);
            sink.len() as u64 >= cap
        };
        if filled {
            // Buffered send: the outer select cannot miss this wakeup.
            let _ = cap_hit.try_send(());
            return Ok(());
        }
    }
}

#[cfg(test)]
mod tests;
