"""Process-execution primitives shared by every development verb.

Each step type below is a small, declarative description of one action. They are
data rather than code so :mod:`dev.toolchain` can state the toolchain as a table,
and so the platform-specific parts - executable resolution, Docker fallback,
environment overlay - are implemented once here instead of being re-expressed in
each recipe.

This module imports only the standard library. That is not incidental: it is the
property that lets the same table drive `cmd.exe` and `sh` identically, which is
what makes the harness platform-agnostic by construction rather than by
branching.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

#: Exit code for "the required tool is not installed and has no fallback".
#: 127 is the conventional shell status for command-not-found, which keeps the
#: meaning legible to CI logs and to anyone reading the exit code directly.
TOOL_MISSING = 127


@dataclass(frozen=True)
class Cmd:
    """A single subprocess invocation.

    Args:
        argv: The full argument vector, already split. Never a shell string -
            passing a list is what keeps quoting identical on every platform.
        env: Environment variables overlaid on the inherited environment.
    """

    argv: tuple[str, ...]
    env: Mapping[str, str] = field(default_factory=dict[str, str])


@dataclass(frozen=True)
class ToolOrDocker:
    """An external tool, falling back to its Docker image when absent.

    ``taplo`` is a native binary rather than a Python package, so it cannot be
    pinned in the lockfile and may simply be missing. Rather than fail, the
    harness runs the pinned image with the working tree mounted at ``/repo``.

    Args:
        tool: Executable name to look for on ``PATH``.
        argv: Arguments passed to the native executable.
        image: Docker image reference used when the executable is absent.
        docker_argv: Arguments passed to the container. Defaults to ``argv``,
            and differs only where the container needs repo-absolute paths.
    """

    tool: str
    argv: tuple[str, ...]
    image: str
    docker_argv: tuple[str, ...] | None = None


@dataclass(frozen=True)
class ToolOrHint:
    """An external tool with no fallback, and the hint printed when it is absent.

    ``typos`` and ``cargo-deny`` are provisioned by ``mise install`` and have no
    container form in this repository's gates. When one is missing the honest
    result is a hard stop naming the install command, never a silent skip - a
    swallowed missing tool manufactures a green that proves nothing.

    Args:
        tool: Executable name to look for on ``PATH``. May differ from
            ``argv[0]``: ``cargo-deny`` is probed by that name but invoked as
            ``cargo deny``.
        argv: The full argument vector to execute when the tool is present.
        hint: The install instruction printed when the tool is absent.
    """

    tool: str
    argv: tuple[str, ...]
    hint: str


@dataclass(frozen=True)
class Echo:
    """A line printed between the steps of an aggregate target."""

    text: str


@dataclass(frozen=True)
class Ref:
    """A reference to another target within the same verb.

    Aggregates such as ``lint all`` are expressed as references rather than by
    repeating their steps, so a target and its use in an aggregate cannot drift
    apart.
    """

    target: str


@dataclass(frozen=True)
class VerbRef:
    """A reference to a target belonging to a DIFFERENT verb.

    The ``ci`` pipeline is the only current use: it composes the existing
    gates rather than restating their steps, so the pipeline and the gates it
    claims to run cannot disagree.

    Args:
        verb: The verb owning the referenced target.
        target: The target name within that verb.
    """

    verb: str
    target: str


Step = Cmd | ToolOrDocker | ToolOrHint | Echo | Ref | VerbRef


def _resolve(program: str, env: Mapping[str, str]) -> str | None:
    """Resolve a program name to a path the OS will actually execute.

    This is the single place the harness accounts for how Windows locates an
    executable, and it is why no recipe needs to. Most Node and Python tools
    install on Windows as a `.cmd` shim - ``npm`` is ``npm.CMD`` - and
    ``CreateProcess`` does not consult ``PATHEXT``, so handing it the bare name
    fails with "not found" even though the tool is plainly installed. Resolving
    through :func:`shutil.which`, which does consult ``PATHEXT``, yields a full
    path that executes on both platforms.

    Args:
        program: The executable name as written in the step.
        env: The environment the command will run under, whose ``PATH`` is the
            one searched.

    Returns:
        The resolved path, or ``None`` when the program is not on ``PATH``.
    """
    return shutil.which(program, path=env.get("PATH"))


def run(argv: Sequence[str], env: Mapping[str, str] | None = None) -> int:
    """Run one subprocess and return its exit code.

    The command is echoed before it runs. That is required rather than
    decorative: moving logic out of the recipe bodies means the justfile no
    longer shows what actually executed, and this line is what replaces it.

    Args:
        argv: The argument vector to execute.
        env: Variables overlaid on the inherited environment.

    Returns:
        The child process exit code, or :data:`TOOL_MISSING` when the executable
        does not exist.
    """
    merged = {**os.environ, **(env or {})}
    print(f"$ {' '.join(argv)}", flush=True)
    resolved = _resolve(argv[0], merged)
    if resolved is None:
        print(f"{argv[0]} not found on PATH", file=sys.stderr, flush=True)
        return TOOL_MISSING
    try:
        return subprocess.run([resolved, *argv[1:]], env=merged, check=False).returncode
    except OSError as error:
        print(f"{argv[0]} could not be executed: {error}", file=sys.stderr, flush=True)
        return TOOL_MISSING


def run_tool_or_docker(step: ToolOrDocker) -> int:
    """Run a native tool, or its Docker image when the tool is unavailable.

    Args:
        step: The tool description to execute.

    Returns:
        The exit code of whichever form ran, or :data:`TOOL_MISSING` when
        neither the tool nor Docker is present.
    """
    if shutil.which(step.tool):
        return run([step.tool, *step.argv])
    if shutil.which("docker"):
        container_argv = step.docker_argv if step.docker_argv is not None else step.argv
        return run(
            [
                "docker",
                "run",
                "--rm",
                "-v",
                f"{Path.cwd()}:/repo",
                "-w",
                "/repo",
                step.image,
                *container_argv,
            ]
        )
    print(
        f"{step.tool} not found and docker is unavailable",
        file=sys.stderr,
        flush=True,
    )
    return TOOL_MISSING


def run_tool_or_hint(step: ToolOrHint) -> int:
    """Run a native tool, or fail loudly with its install hint.

    Args:
        step: The tool description to execute.

    Returns:
        The tool's exit code, or :data:`TOOL_MISSING` when it is absent.
    """
    if shutil.which(step.tool):
        return run(step.argv)
    print(f"{step.tool} not found - {step.hint}", file=sys.stderr, flush=True)
    return TOOL_MISSING


def uv_run(*argv: str) -> Cmd:
    """Build a command that runs a tool already present in the environment.

    ``--no-sync`` keeps ``uv run`` from re-resolving and rebuilding the project
    into ``.venv``. That rebuild fails on Windows whenever a resident process -
    an MCP server, an editor, another agent's session - holds one of the
    console-script executables open, so every recipe that merely *uses* the
    environment goes through here. The recipes whose purpose is to *change* the
    environment (``uv sync``, ``uv lock``) call ``uv`` directly.

    Args:
        *argv: The command and arguments to run inside the environment.

    Returns:
        The corresponding :class:`Cmd`.
    """
    return Cmd(("uv", "run", "--no-sync", *argv))


def npm(script: str) -> Cmd:
    """Build a command that runs one of the SPA's npm scripts.

    Args:
        script: The ``package.json`` script name.

    Returns:
        The corresponding :class:`Cmd`.
    """
    return Cmd(("npm", "--prefix", "frontend", "run", script))


def cargo(*argv: str) -> Cmd:
    """Build a cargo command pinned to the engine workspace manifest.

    Every cargo invocation in this repository targets ``engine/Cargo.toml``;
    naming it here keeps the manifest path from being retyped per step.

    Args:
        *argv: The cargo subcommand and its arguments, with ``--manifest-path``
            inserted after the subcommand.

    Returns:
        The corresponding :class:`Cmd`.
    """
    subcommand, rest = argv[0], argv[1:]
    return Cmd(("cargo", subcommand, "--manifest-path", "engine/Cargo.toml", *rest))
