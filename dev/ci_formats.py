"""Machine-readable output formats for the gates, opt-in through one variable.

Every gate in this repository reports as human-readable console text: eslint's
stylish output, `tsc`'s pretty diagnostics, vitest's runner summary, clippy's
rendered spans. That is the right default at a terminal and the wrong one in
CI, where the only thing a job can act on is the exit code and a wall of
scrollback nobody parses. A failing SPA lint therefore annotates nothing on the
pull request that caused it.

`VAULTSPEC_CI_REPORTS` names a directory for report artifacts and turns the
machine-readable forms on. UNSET - every local run, and any CI job that has not
opted in - every command runs exactly as it does today. That is deliberate:
the switch must be additive, so adopting it cannot change what a developer sees
at their own terminal.

This module decides only what a tool PRINTS and where its artifact lands. It
never alters a command's exit status, and `augment` is a pure function so the
mapping is testable without running any of the tools.
"""

from __future__ import annotations

import hashlib
import os
from collections.abc import Mapping, Sequence
from pathlib import Path

#: Names the directory report artifacts are written into, and enables the
#: machine-readable formats.
REPORTS_ENV = "VAULTSPEC_CI_REPORTS"

#: Set by CI when it wants GitHub annotations on the diff. Kept separate from
#: the directory: annotations go to stdout, not to a file, and a local run that
#: wants artifacts should not start emitting workflow commands.
ANNOTATIONS_ENV = "GITHUB_ACTIONS"


def reports_dir(env: Mapping[str, str]) -> Path | None:
    """Return the configured report directory, or ``None`` when unset."""
    value = env.get(REPORTS_ENV, "").strip()
    return Path(value) if value else None


def annotating(env: Mapping[str, str]) -> bool:
    """Whether findings should be emitted as GitHub workflow annotations."""
    return env.get(ANNOTATIONS_ENV, "").strip().lower() == "true"


def _artifact(directory: Path, stem: str, argv: Sequence[str], suffix: str) -> str:
    """Return a per-invocation artifact path under ``directory``.

    The digest keeps two lanes that run the same tool in one job - the SPA lint
    and the SPA type-check, the workspace test run and a crate-scoped one - from
    overwriting each other's report.
    """
    digest = hashlib.sha256(" ".join(argv).encode("utf-8")).hexdigest()[:8]
    return str(directory / f"{stem}-{digest}.{suffix}")


def _npm_script(argv: Sequence[str]) -> str | None:
    """Return the npm script name this command runs, if it runs one."""
    if argv[0] != "npm" or "run" not in argv:
        return None
    index = argv.index("run") + 1
    return argv[index] if index < len(argv) else None


def augment(argv: Sequence[str], env: Mapping[str, str] | None = None) -> list[str]:
    """Return ``argv`` with this run's machine-readable output flags added.

    Args:
        argv: The command about to run.
        env: The environment it will run under; defaults to the process's own.

    Returns:
        The command to run. Unchanged whenever reporting is not enabled, or the
        caller already chose a format.
    """
    environment = os.environ if env is None else env
    directory = reports_dir(environment)
    if directory is None or not argv:
        return list(argv)

    flags = " ".join(argv)
    script = _npm_script(argv)

    if script == "lint" and "--format" not in flags:
        # eslint's stylish output cannot be read by anything downstream.
        return [
            *argv,
            "--",
            "--format=json",
            "-o",
            _artifact(directory, "eslint", argv, "json"),
        ]
    if script == "typecheck" and "--pretty" not in flags:
        # tsc's pretty diagnostics carry ANSI framing that defeats log parsers.
        return [*argv, "--", "--pretty", "false"]
    if script == "test" and "--reporter" not in flags:
        return [
            *argv,
            "--",
            "--reporter=junit",
            f"--outputFile={_artifact(directory, 'vitest', argv, 'xml')}",
        ]
    if argv[0] == "cargo" and "clippy" in argv and "--message-format" not in flags:
        # Inserted before the `--` that separates cargo's arguments from the
        # lint flags, which must stay last.
        cut = argv.index("--") if "--" in argv else len(argv)
        return [*argv[:cut], "--message-format=json", *argv[cut:]]
    return list(argv)


def ensure_reports_dir(env: Mapping[str, str] | None = None) -> None:
    """Create the report directory when one is configured."""
    directory = reports_dir(os.environ if env is None else env)
    if directory is not None:
        directory.mkdir(parents=True, exist_ok=True)
