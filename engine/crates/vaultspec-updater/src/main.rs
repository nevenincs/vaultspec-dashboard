//! The copied external updater executable (a2a-product-provisioning W03.P07.S59).
//!
//! Invoked from OUTSIDE the active release with exactly one operand: the path to
//! the one-time owner-restricted descriptor. It accepts no free-form executable or
//! path operands beyond that descriptor. The runner (see the library) acquires the
//! installation lock BEFORE any drain or mutation, never delegates lock ownership
//! to the gateway, and executes or recovers the ordered transaction. Diagnostics
//! are bounded and secret-redacted; the exit code is a stable, closed classifier.
//!
//! The fresh-update EXECUTE path (drain of the discovered gateway -> snapshot ->
//! migrate -> materialize -> receipt-commit SWAP) is the activation seam
//! (materializer); this executable is the shell that parses, runs, relaunches the
//! prior seat when the handoff asked for one, and classifies.

use std::path::Path;

use vaultspec_updater::{UpdaterError, UpdaterRun, relaunch_prior_seat, run};

/// Successful run.
const EXIT_OK: i32 = 0;
/// Malformed invocation (wrong operand count).
const EXIT_USAGE: i32 = 2;
/// The installation lock is held by another installer or updater.
const EXIT_BUSY: i32 = 3;
/// The owner-restricted descriptor was absent, unreadable, or malformed.
const EXIT_DESCRIPTOR: i32 = 4;
/// The transaction, recovery, or a bounded I/O operation failed.
const EXIT_FAILED: i32 = 5;
/// The run itself completed, but the prior seat could not be relaunched. The
/// installed release is intact; only the front door is down.
const EXIT_RELAUNCH: i32 = 6;

fn main() {
    std::process::exit(dispatch(std::env::args_os().skip(1)));
}

/// Parse the single descriptor operand, run the updater, and classify the outcome
/// into a stable exit code with a bounded, secret-free diagnostic.
fn dispatch(mut operands: impl Iterator<Item = std::ffi::OsString>) -> i32 {
    let Some(descriptor) = operands.next() else {
        eprintln!("vaultspec-updater: exactly one owner-restricted descriptor path is required");
        return EXIT_USAGE;
    };
    if operands.next().is_some() {
        eprintln!(
            "vaultspec-updater: unexpected operand; only one descriptor path is accepted, and no \
             free-form executable or path operands"
        );
        return EXIT_USAGE;
    }

    match run(Path::new(&descriptor)) {
        Ok(run) => {
            println!("vaultspec-updater: {}", summarize(&run));
            // The prior seat is relaunched LAST, once the run has resolved the
            // installed state — the seat must never come back onto a release
            // that is still mid-transaction.
            match run.relaunch.as_ref().map(relaunch_prior_seat) {
                None | Some(Ok(_)) => EXIT_OK,
                Some(Err(error)) => {
                    eprintln!("vaultspec-updater: {error}");
                    EXIT_RELAUNCH
                }
            }
        }
        Err(error) => {
            // The Display of every variant is bounded and secret-free (descriptor
            // text and credentials never appear).
            eprintln!("vaultspec-updater: {error}");
            exit_code(&error)
        }
    }
}

fn summarize(run: &UpdaterRun) -> String {
    let relaunch = if run.relaunch.is_some() {
        "relaunch requested"
    } else {
        "no relaunch"
    };
    format!("recovery {:?}; {relaunch}", run.recovery)
}

fn exit_code(error: &UpdaterError) -> i32 {
    match error {
        UpdaterError::Busy | UpdaterError::RequesterAlive => EXIT_BUSY,
        UpdaterError::Descriptor(_) | UpdaterError::Intent(_) => EXIT_DESCRIPTOR,
        UpdaterError::Drain(_)
        | UpdaterError::Verification(_)
        | UpdaterError::Activation(_)
        | UpdaterError::Transaction(_)
        | UpdaterError::Recovery(_)
        | UpdaterError::Io(_) => EXIT_FAILED,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_operand_is_a_usage_error() {
        assert_eq!(dispatch(std::iter::empty()), EXIT_USAGE);
    }

    #[test]
    fn extra_operands_are_a_usage_error() {
        let operands = vec![
            std::ffi::OsString::from("/tmp/descriptor.json"),
            std::ffi::OsString::from("/unexpected/extra"),
        ];
        assert_eq!(dispatch(operands.into_iter()), EXIT_USAGE);
    }

    #[test]
    fn an_absent_descriptor_is_a_descriptor_error() {
        let operands = vec![std::ffi::OsString::from(
            "/no/such/updater/descriptor/anywhere.json",
        )];
        assert_eq!(dispatch(operands.into_iter()), EXIT_DESCRIPTOR);
    }

    #[test]
    fn exit_codes_are_a_closed_stable_classifier() {
        assert_eq!(exit_code(&UpdaterError::Busy), EXIT_BUSY);
        // A requester that has not exited is the same retryable class as a busy
        // lock: nothing was mutated and the handoff still stands.
        assert_eq!(exit_code(&UpdaterError::RequesterAlive), EXIT_BUSY);
        assert_eq!(exit_code(&UpdaterError::Descriptor("x")), EXIT_DESCRIPTOR);
        assert_eq!(
            exit_code(&UpdaterError::Io("bounded".to_string())),
            EXIT_FAILED
        );
    }
}
