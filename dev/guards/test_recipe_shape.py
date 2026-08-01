"""The `justfile` carries no logic, so it cannot carry a platform dialect.

This is the guard that keeps the harness platform-agnostic. The property is not
"the recipes were written carefully for both shells" - it is "there is nothing
in a recipe body for a shell to interpret differently", and that is checkable.

The shape this replaced had five recipes branching on `os() == "windows"`, each
carrying two full transcriptions of the same logic. Four of them were the same
tool-or-Docker fallback written twice in two dialects: eight transcriptions of
one idea, each independently able to drift. Those now live once, in
`dev/runner.py`.
"""

from __future__ import annotations

import pytest

#: Constructs that make a recipe body shell-dependent. Each would behave
#: differently, or fail outright, between `cmd.exe` and `sh`.
FORBIDDEN_SYNTAX = {
    "|": "a pipe",
    "&&": "a chain operator",
    "||": "a chain operator",
    ">": "a redirect",
    "<": "a redirect",
    ";": "a statement separator",
    "$(": "a command substitution",
    "`": "a command substitution",
    "if ": "a conditional",
    "for ": "a loop",
    "*": "a glob the shell would expand",
}

#: `just` expressions that reintroduce a platform branch at the recipe level.
FORBIDDEN_EXPRESSIONS = ("os()", "os_family()", "windows-shell", "if ")

#: The only recipes permitted not to dispatch into `dev/`, each for a reason
#: that cannot be satisfied by the dispatcher itself:
#:
#: * ``default`` asks `just` to list its own recipes.
#: * ``bootstrap`` creates the virtual environment every other recipe runs
#:   inside, so it cannot route through a dispatcher that presumes one.
#:
#: Naming them here is the point: a third non-dispatching recipe fails the
#: build rather than quietly becoming a step outside the toolchain table.
SELF_HOSTED_RECIPES = frozenset({"default", "bootstrap"})


def test_every_recipe_body_is_a_single_command(
    recipe_bodies: dict[str, list[str]],
) -> None:
    """A body of more than one line is step chaining that belongs in the table.

    Multi-step targets are expressed as a tuple of steps in `dev/toolchain.py`,
    where the dispatcher stops at the first failure. Chaining in the recipe
    instead reintroduces the question of what a shell does after a non-zero
    exit, which differs between shells.
    """
    offenders = {
        name: body for name, body in recipe_bodies.items() if len(body) != 1
    }
    assert not offenders, (
        "every recipe body must be exactly one command; "
        f"these are not: {sorted(offenders)}"
    )


@pytest.mark.parametrize(("token", "description"), sorted(FORBIDDEN_SYNTAX.items()))
def test_no_recipe_body_contains_shell_syntax(
    recipe_bodies: dict[str, list[str]],
    token: str,
    description: str,
) -> None:
    """No recipe body may contain anything a shell would interpret.

    Args:
        recipe_bodies: Every recipe's body lines.
        token: The forbidden construct.
        description: What the construct is, for the failure message.
    """
    offenders = [
        name
        for name, body in recipe_bodies.items()
        if any(token in line for line in body)
    ]
    assert not offenders, (
        f"{description} ({token!r}) makes a recipe shell-dependent; "
        f"move it into dev/toolchain.py. Offending recipes: {sorted(offenders)}"
    )


def test_no_recipe_branches_on_the_platform(justfile_text: str) -> None:
    """The justfile declares a shell; it never branches on which one ran.

    Args:
        justfile_text: The `justfile`'s full text.
    """
    body_lines = [
        line
        for line in justfile_text.splitlines()
        if line[:1].isspace() and line.strip() and not line.lstrip().startswith("#")
    ]
    offenders = [
        line
        for line in body_lines
        if any(expression in line for expression in FORBIDDEN_EXPRESSIONS)
    ]
    assert not offenders, (
        "a recipe branched on the platform; the dispatch core handles this. "
        f"Offending lines: {offenders}"
    )


def test_every_recipe_dispatches_into_the_harness(
    recipe_bodies: dict[str, list[str]],
) -> None:
    """A recipe runs the dispatcher, never a tool directly.

    A recipe invoking a tool itself is a step that exists outside the table, so
    `dev/toolchain.py` stops being the single source of truth for what the
    toolchain runs.
    """
    offenders = [
        name
        for name, body in recipe_bodies.items()
        if name not in SELF_HOSTED_RECIPES
        and not all(line.startswith("{{dev}}") for line in body)
    ]
    assert not offenders, (
        "these recipes run something other than the dispatcher, so their steps "
        f"are invisible to dev/toolchain.py: {sorted(offenders)}"
    )
