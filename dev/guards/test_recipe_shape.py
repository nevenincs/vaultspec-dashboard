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

from dev.guards.conftest import devserver_constant

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
#: * the ``init`` family provisions the environment every other recipe runs
#:   inside, so it cannot route through a dispatcher that presumes one. It
#:   runs on an ephemeral `--no-project` interpreter, which is why
#:   `dev/init/` is stdlib-only.
#:
#: Naming them here is the point: a further non-dispatching recipe fails the
#: build rather than quietly becoming a step outside the toolchain table.
SELF_HOSTED_RECIPES = frozenset(
    {
        "default",
        "init",
        "init-python",
        "init-node",
        "init-tools",
        "init-check",
    }
)


def test_every_recipe_body_is_a_single_command(
    recipe_bodies: dict[str, list[str]],
) -> None:
    """A body of more than one line is step chaining that belongs in the table.

    Multi-step targets are expressed as a tuple of steps in `dev/toolchain.py`,
    where the dispatcher stops at the first failure. Chaining in the recipe
    instead reintroduces the question of what a shell does after a non-zero
    exit, which differs between shells.
    """
    offenders = {name: body for name, body in recipe_bodies.items() if len(body) != 1}
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


#: The machine-wide dev-server recipe, exempt from the dispatch rule by TEXT,
#: not by name. It is the one recipe this file does not own: every web app on
#: the workstation carries it verbatim (`dev/devserver.py render recipe`), and
#: it runs that shared harness through `uv run --script` because the harness is
#: a PEP 723 script with its own dependencies, identical in every repository.
#: Routing it through `{{dev}}` would fork it; `just dev check` fails when it
#: drifts. Only a body byte-identical to the canonical text is exempt, so a
#: hand-edited `dev` recipe - or any other recipe named `dev` - still fails.
SHARED_DEV_RECIPE = "dev"


def _carries_the_canonical_dev_recipe(justfile_text: str) -> bool:
    """Whether the justfile holds the shared `dev` recipe exactly as rendered.

    `justfile_text` is read in text mode, so line endings are already `\\n`.
    """
    return devserver_constant("RECIPE") in justfile_text


def test_every_recipe_dispatches_into_the_harness(
    recipe_bodies: dict[str, list[str]],
    justfile_text: str,
) -> None:
    """A recipe runs the dispatcher, never a tool directly.

    A recipe invoking a tool itself is a step that exists outside the table, so
    `dev/toolchain.py` stops being the single source of truth for what the
    toolchain runs. The shared `dev` recipe is the stated exception above.
    """
    exempt = set(SELF_HOSTED_RECIPES)
    if _carries_the_canonical_dev_recipe(justfile_text):
        exempt.add(SHARED_DEV_RECIPE)
    offenders = [
        name
        for name, body in recipe_bodies.items()
        if name not in exempt and not all(line.startswith("{{dev}}") for line in body)
    ]
    assert not offenders, (
        "these recipes run something other than the dispatcher, so their steps "
        f"are invisible to dev/toolchain.py: {sorted(offenders)}"
    )


def test_the_shared_dev_recipe_is_the_canonical_one(
    recipe_bodies: dict[str, list[str]],
    justfile_text: str,
) -> None:
    """The `dev` recipe exists and is byte-identical to the shared harness's.

    Guard the exemption: it is granted by matching the canonical text, so a
    drifted copy must fail here rather than quietly lose its exemption and fail
    somewhere less legible.
    """
    assert SHARED_DEV_RECIPE in recipe_bodies, "the justfile has no `dev` recipe"
    assert _carries_the_canonical_dev_recipe(justfile_text), (
        "the `dev` recipe differs from `dev/devserver.py render recipe`; paste the "
        "rendered text verbatim"
    )
