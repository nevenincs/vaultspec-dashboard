use super::*;

fn range(base: &str, head: &str) -> MigrationRangeSpec {
    MigrationRangeSpec::new(base, head).unwrap()
}

#[test]
fn revision_grammar_rejects_floating_and_malformed() {
    for bad in [
        "", "head", "HEADS", "base", "latest", "x", "-lead", ".dot", "a b", "a/b",
    ] {
        assert!(Revision::new(bad).is_err(), "{bad:?} must be refused");
    }
    for ok in ["0001", "0008", "abc123", "0001_init", "rev-9"] {
        assert!(Revision::new(ok).is_ok(), "{ok:?} must be accepted");
    }
    assert!(Revision::new("g".repeat(65)).is_err());
}

#[test]
fn range_requires_two_valid_revisions() {
    assert!(MigrationRangeSpec::new("0001", "0008").is_ok());
    assert!(MigrationRangeSpec::new("0001", "head").is_err());
    assert!(MigrationRangeSpec::new("", "0008").is_err());
}

#[test]
fn fresh_install_is_a_forward_migration() {
    let plan = plan_migration(None, &range("0001", "0008")).unwrap();
    assert_eq!(plan.decision(), MigrationDecision::Forward);
    assert_eq!(plan.from(), None);
    assert_eq!(plan.target_head(), "0008");
}

#[test]
fn installed_head_equal_to_candidate_head_is_already_current() {
    let plan = plan_migration(Some("0008"), &range("0001", "0008")).unwrap();
    assert_eq!(plan.decision(), MigrationDecision::AlreadyCurrent);
    assert_eq!(plan.from(), Some("0008"));
}

#[test]
fn installed_head_equal_to_candidate_base_is_a_forward_step() {
    let plan = plan_migration(Some("0008"), &range("0008", "0012")).unwrap();
    assert_eq!(plan.decision(), MigrationDecision::Forward);
    assert_eq!(plan.from(), Some("0008"));
    assert_eq!(plan.target_head(), "0012");
}

#[test]
fn an_unrecognized_installed_head_fails_closed() {
    let error = plan_migration(Some("0005"), &range("0008", "0012")).unwrap_err();
    assert!(matches!(error, MigrationError::IncompatibleRange { .. }));
}

#[test]
fn a_malformed_installed_head_is_rejected() {
    assert!(plan_migration(Some("head"), &range("0001", "0008")).is_err());
}

#[test]
fn an_already_current_plan_runs_no_process() {
    // The program path is deliberately non-existent: an already-current plan must
    // short-circuit before any spawn.
    let migration = StagedMigration::from_program(
        std::path::PathBuf::from("/nonexistent/staged-migration"),
        Vec::<OsString>::new(),
        MigrationLimits::new(4096, Duration::from_secs(5)),
    );
    let plan = plan_migration(Some("0008"), &range("0001", "0008")).unwrap();
    let quiescence = Quiescence::asserted_after_stop();
    assert!(matches!(
        migration.run(&plan, &quiescence),
        Ok(MigrationOutcome::Skipped)
    ));
}

// ---------------------------------------------------------------------------
// Bounded runner proofs against a REAL child process (the re-invoked test
// binary), not a mock. See `migration_child_process`.
// ---------------------------------------------------------------------------

fn child_command(emit: usize, sleep_ms: u64, exit: i32) -> Command {
    let exe = std::env::current_exe().expect("test binary path");
    let mut command = Command::new(exe);
    command
        .arg("migration_child_process")
        .arg("--nocapture")
        .arg("--test-threads=1")
        .env("MIGRATION_CHILD", "1")
        .env("MIGRATION_CHILD_EMIT", emit.to_string())
        .env("MIGRATION_CHILD_SLEEP_MS", sleep_ms.to_string())
        .env("MIGRATION_CHILD_EXIT", exit.to_string());
    command
}

#[test]
fn bounded_runner_captures_output_and_reports_success() {
    let mut command = child_command(16, 0, 0);
    let limits = MigrationLimits::new(64 * 1024, Duration::from_secs(10));
    match run_bounded_command(&mut command, limits) {
        Ok(MigrationOutcome::Applied { bounded_output }) => {
            assert!(bounded_output.iter().filter(|b| **b == b'M').count() >= 16);
        }
        other => panic!("expected Applied, got {other:?}"),
    }
}

#[test]
fn bounded_runner_kills_on_wall_clock_timeout() {
    let mut command = child_command(0, 5_000, 0);
    let limits = MigrationLimits::new(64 * 1024, Duration::from_millis(200));
    assert!(matches!(
        run_bounded_command(&mut command, limits),
        Err(MigrationError::Timeout { .. })
    ));
}

#[test]
fn bounded_runner_kills_on_output_cap_breach() {
    let mut command = child_command(200_000, 0, 0);
    let limits = MigrationLimits::new(1024, Duration::from_secs(10));
    assert!(matches!(
        run_bounded_command(&mut command, limits),
        Err(MigrationError::OutputTooLarge { cap: 1024 })
    ));
}

#[test]
fn bounded_runner_reports_a_non_zero_exit() {
    let mut command = child_command(8, 0, 3);
    let limits = MigrationLimits::new(64 * 1024, Duration::from_secs(10));
    match run_bounded_command(&mut command, limits) {
        Err(MigrationError::MigrationFailed { code, .. }) => assert_eq!(code, Some(3)),
        other => panic!("expected MigrationFailed, got {other:?}"),
    }
}

/// A hidden helper the bounded-runner tests re-invoke as a REAL child. In a
/// normal `cargo test` run (no `MIGRATION_CHILD` env) it is a no-op. Under the
/// env it emits `MIGRATION_CHILD_EMIT` bytes to stdout, optionally sleeps, then
/// exits with `MIGRATION_CHILD_EXIT`.
#[test]
fn migration_child_process() {
    use std::io::Write as _;
    if std::env::var("MIGRATION_CHILD").is_err() {
        return;
    }
    let emit: usize = env_usize("MIGRATION_CHILD_EMIT");
    let sleep_ms: u64 = env_u64("MIGRATION_CHILD_SLEEP_MS");
    let exit: i32 = std::env::var("MIGRATION_CHILD_EXIT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    if emit > 0 {
        let mut out = std::io::stdout();
        let _ = out.write_all(&vec![b'M'; emit]);
        let _ = out.flush();
    }
    if sleep_ms > 0 {
        std::thread::sleep(Duration::from_millis(sleep_ms));
    }
    std::process::exit(exit);
}

fn env_usize(key: &str) -> usize {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0)
}

fn env_u64(key: &str) -> u64 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0)
}
