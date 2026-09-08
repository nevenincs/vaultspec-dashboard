"""The machine-readable output switch is additive and off by default.

Every gate here reports as console text, which CI cannot act on beyond an exit
code. `VAULTSPEC_CI_REPORTS` turns the machine-readable forms on; these tests
pin that it changes nothing when unset, and that it never touches a command
that already chose its own format.
"""

from __future__ import annotations

from dev import ci_formats

LINT = ("npm", "--prefix", "frontend", "run", "lint")
TYPECHECK = ("npm", "--prefix", "frontend", "run", "typecheck")
TEST = ("npm", "--prefix", "frontend", "run", "test")
CLIPPY = ("cargo", "clippy", "--workspace", "--all-targets", "--", "-D", "warnings")


def test_unset_changes_nothing() -> None:
    """The default - every local run - must be byte-identical to today."""
    for argv in (LINT, TYPECHECK, TEST, CLIPPY):
        assert ci_formats.augment(argv, {}) == list(argv)


def test_eslint_gains_a_json_report(tmp_path) -> None:
    env = {ci_formats.REPORTS_ENV: str(tmp_path)}
    augmented = ci_formats.augment(LINT, env)
    assert "--format=json" in augmented
    assert augmented[len(LINT)] == "--", "npm needs -- before the tool's own flags"


def test_typecheck_drops_the_ansi_framing(tmp_path) -> None:
    augmented = ci_formats.augment(TYPECHECK, {ci_formats.REPORTS_ENV: str(tmp_path)})
    assert augmented[-2:] == ["--pretty", "false"]


def test_vitest_gains_a_junit_report(tmp_path) -> None:
    augmented = ci_formats.augment(TEST, {ci_formats.REPORTS_ENV: str(tmp_path)})
    assert "--reporter=junit" in augmented
    assert any(arg.startswith("--outputFile=") for arg in augmented)


def test_clippy_keeps_its_lint_flags_last(tmp_path) -> None:
    """`-D warnings` must stay after cargo's `--`, or clippy never sees it."""
    augmented = ci_formats.augment(CLIPPY, {ci_formats.REPORTS_ENV: str(tmp_path)})
    assert augmented[-3:] == ["--", "-D", "warnings"]
    assert augmented.index("--message-format=json") < augmented.index("--")


def test_a_chosen_format_is_never_overridden(tmp_path) -> None:
    env = {ci_formats.REPORTS_ENV: str(tmp_path)}
    chosen = (*TEST, "--", "--reporter=verbose")
    assert ci_formats.augment(chosen, env) == list(chosen)


def test_two_lanes_of_one_tool_get_distinct_artifacts(tmp_path) -> None:
    env = {ci_formats.REPORTS_ENV: str(tmp_path)}
    one = ci_formats.augment(TEST, env)
    two = ci_formats.augment((*TEST, "src/testing"), env)
    assert one != two
