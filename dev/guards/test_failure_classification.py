"""A red check must say which KIND of red it is.

These assert the discriminator holds in the direction that matters. Calling a
genuine test failure "infrastructure" would hide a real defect, so the summary
line is required to be present before anything is reported as a verdict; every
other outcome degrades to "no verdict was produced", which is honest rather than
wrong.

The fixtures are real captured shapes from the runs the issue cites, not
invented strings: a mid-suite kill that printed passing tests before dying, a
checkout that never reached the suite, and a completed run that genuinely
failed an assertion.
"""

from __future__ import annotations

from dev.classify_failure import classify, render

#: A run killed at exit 137 after real test output had already scrolled past.
#: This is the shape that has repeatedly been misread as a verdict.
KILLED_MID_SUITE = """
 ✓ src/app/left/AddProjectDialog.localization.test.tsx (5 tests) 412ms
 ✓ src/stores/server/queries/docmeta.test.ts (3 tests) 88ms
The runner has received a shutdown signal.
Error: The operation was canceled.
"""

#: A checkout that failed before the toolchain, let alone the suite.
EACCES_ON_SHARED_TARGET = """
##[error]EACCES: permission denied, open '/home/hello/.ci-shared/target/.rustc_info.json'
##[error]Process completed with exit code 1.
"""

#: A transient network fault while provisioning rust.
TOOLCHAIN_HANGUP = """
info: downloading component 'rust-std'
Error: socket hang up
##[error]Process completed with exit code 1.
"""

#: A completed run that genuinely failed. The summary line is present.
GENUINE_TEST_FAILURE = """
 ❯ src/app/stage/CategoryLegend.render.test.tsx (1 test | 1 failed)
   × the graph legend is still degraded
 Test Files  1 failed | 491 passed (492)
      Tests  1 failed | 4104 passed (4105)
"""


def test_a_completed_run_is_a_test_verdict() -> None:
    verdict = classify(GENUINE_TEST_FAILURE)
    assert verdict.is_test_verdict
    assert verdict.title == "Test failure"
    assert render(verdict).startswith("::error ")


def test_a_mid_suite_kill_is_not_a_verdict_despite_passing_test_output() -> None:
    """The failure mode the issue documents: partial output reads as a verdict."""
    verdict = classify(KILLED_MID_SUITE)
    assert not verdict.is_test_verdict
    assert verdict.fault == "runner was shut down mid-suite"
    assert render(verdict).startswith("::notice ")


def test_a_checkout_permission_fault_is_named() -> None:
    verdict = classify(EACCES_ON_SHARED_TARGET)
    assert not verdict.is_test_verdict
    assert verdict.fault == "shared cargo target is not writable"


def test_a_toolchain_hangup_is_named() -> None:
    verdict = classify(TOOLCHAIN_HANGUP)
    assert not verdict.is_test_verdict
    assert verdict.fault == "toolchain provisioning lost its connection"


def test_an_unrecognised_infrastructure_failure_is_still_not_a_verdict() -> None:
    """Signatures only NAME a fault; absence of the summary decides.

    A novel infrastructure failure must not be mistaken for an assertion just
    because no pattern matched it.
    """
    verdict = classify("Error: something nobody has seen before\n")
    assert not verdict.is_test_verdict
    assert verdict.fault is None
    assert "nothing was established" in verdict.guidance


def test_an_empty_log_is_not_a_verdict() -> None:
    """A step that never ran wrote no log; that is an absence, not a failure."""
    assert not classify("").is_test_verdict


def test_a_summary_wins_over_an_infrastructure_signature() -> None:
    """A suite that reported, then hit a teardown fault, still judged the code.

    Ordering matters: the reclaim step runs after the suite and can log its own
    noise, which must not downgrade a real verdict to infrastructure.
    """
    log = GENUINE_TEST_FAILURE + "\nError: socket hang up\n"
    assert classify(log).is_test_verdict
