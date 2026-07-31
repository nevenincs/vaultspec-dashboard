"""Dispatch a development verb against the toolchain table.

Invoked as ``python -m dev <verb> [target]``, which is what every `justfile`
recipe expands to. Help output is DERIVED from the same table the dispatcher
walks, so an undocumented target is unrepresentable rather than merely
discouraged - the eight hand-maintained help recipes this replaced could and did
drift from the recipes they described.

Steps run in order and execution stops at the first non-zero exit, which is the
behaviour a reader assumes from a list of commands. A gate behind a failed gate
never runs, so it must never be reported as having passed.
"""

from __future__ import annotations

import sys
from typing import TYPE_CHECKING

from dev.runner import (
    Cmd,
    Echo,
    Ref,
    ToolOrDocker,
    ToolOrHint,
    VerbRef,
    run,
    run_tool_or_docker,
    run_tool_or_hint,
)
from dev.toolchain import SIMPLE, VERBS

if TYPE_CHECKING:
    from collections.abc import Sequence

    from dev.runner import Step
    from dev.toolchain import Verb

#: Exit code for a malformed invocation - an unknown verb or target.
USAGE_ERROR = 2

#: The tokens that request help rather than execution.
HELP_TOKENS = frozenset({"help", "--help", "-h"})


def _format_verbs() -> str:
    """Render the top-level verb list.

    Returns:
        The help text listing every verb and its summary.
    """
    width = max(len(name) for name in VERBS)
    lines = ["Usage: just <verb> [target]", "", "Verbs:"]
    lines += [f"  {name:<{width}}  {verb.summary}" for name, verb in VERBS.items()]
    lines += ["", "Run 'just <verb> help' for a verb's targets."]
    return "\n".join(lines)


def _format_targets(name: str, verb: Verb) -> str:
    """Render one verb's target list.

    Args:
        name: The verb's name.
        verb: The verb whose targets are listed.

    Returns:
        The help text for that verb.
    """
    if verb.is_simple:
        return f"Usage: just {name}\n\n{verb.summary}"
    width = max(len(target) for target in verb.targets)
    lines = [f"Usage: just {name} <target>", "", verb.summary, "", "Targets:"]
    lines += [
        f"  {target:<{width}}  {body.summary}"
        + ("  (default)" if target == verb.default else "")
        for target, body in verb.targets.items()
    ]
    return "\n".join(lines)


def _run_step(step: Step, verb: Verb, verb_name: str, seen: frozenset[str]) -> int:
    """Execute one step, resolving references recursively.

    Args:
        step: The step to execute.
        verb: The verb owning the step, used to resolve same-verb references.
        verb_name: That verb's name, used for cycle reporting.
        seen: The ``verb:target`` pairs already on the resolution stack.

    Returns:
        The step's exit code.
    """
    match step:
        case Echo():
            print(step.text, flush=True)
            return 0
        case Cmd():
            return run(step.argv, step.env)
        case ToolOrDocker():
            return run_tool_or_docker(step)
        case ToolOrHint():
            return run_tool_or_hint(step)
        case Ref():
            return _run_target(verb_name, verb, step.target, seen)
        case VerbRef():
            referenced = VERBS[step.verb]
            return _run_target(step.verb, referenced, step.target, seen)


def _run_target(name: str, verb: Verb, target: str, seen: frozenset[str]) -> int:
    """Execute one target's steps in order, stopping at the first failure.

    Args:
        name: The verb's name.
        verb: The verb owning the target.
        target: The target to run.
        seen: The ``verb:target`` pairs already on the resolution stack.

    Returns:
        The first non-zero exit code, or zero when every step succeeded.
    """
    key = f"{name}:{target}"
    if key in seen:
        print(f"cyclic reference through {key}", file=sys.stderr, flush=True)
        return USAGE_ERROR
    stack = seen | {key}
    for step in verb.targets[target].steps:
        code = _run_step(step, verb, name, stack)
        if code != 0:
            return code
    return 0


def main(argv: Sequence[str]) -> int:
    """Parse the invocation and dispatch it.

    Args:
        argv: The arguments after the program name.

    Returns:
        The process exit code.
    """
    if not argv or argv[0] in HELP_TOKENS:
        print(_format_verbs())
        return 0

    name, rest = argv[0], argv[1:]
    verb = VERBS.get(name)
    if verb is None:
        print(f"unknown verb: {name}\n", file=sys.stderr)
        print(_format_verbs(), file=sys.stderr)
        return USAGE_ERROR

    if rest and rest[0] in HELP_TOKENS:
        print(_format_targets(name, verb))
        return 0

    target = rest[0] if rest else verb.default
    if verb.is_simple:
        # A target-less verb reached through a recipe that passes no argument.
        # Anything present here was typed by hand and is a mistake worth naming.
        if rest:
            print(f"{name} takes no target, got: {rest[0]}\n", file=sys.stderr)
            print(_format_targets(name, verb), file=sys.stderr)
            return USAGE_ERROR
        target = SIMPLE
    elif target not in verb.targets:
        print(f"unknown {name} target: {target}\n", file=sys.stderr)
        print(_format_targets(name, verb), file=sys.stderr)
        return USAGE_ERROR

    return _run_target(name, verb, target, frozenset())


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
