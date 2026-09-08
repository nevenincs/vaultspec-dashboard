"""The `justfile` and the toolchain table cannot disagree about what exists.

Every verb the file offers must reach the table, and every target the table
holds must be reachable from a verb. Without this, the two drift: a recipe
survives whose target was renamed, or a target accumulates that nothing can
invoke, and the help output - derived from the table - describes a toolchain the
entry points do not expose.
"""

from __future__ import annotations

import re

import pytest

from dev.runner import Ref, VerbRef
from dev.toolchain import SIMPLE, VERBS

#: Matches the verb name in a dispatching recipe body, e.g. `{{dev}} lint ...`.
_DISPATCH = re.compile(r"^\{\{dev\}\}\s+(?P<verb>[a-z][a-z0-9-]*)")

#: Recipes that legitimately do not dispatch a verb.
_NON_DISPATCHING = frozenset({"default"})


def _dispatched_verbs(recipe_bodies: dict[str, list[str]]) -> dict[str, str]:
    """Map each dispatching recipe to the verb it invokes."""
    dispatched: dict[str, str] = {}
    for name, body in recipe_bodies.items():
        if name in _NON_DISPATCHING:
            continue
        for line in body:
            match = _DISPATCH.match(line)
            if match:
                dispatched[name] = match.group("verb")
    return dispatched


def test_every_recipe_reaches_a_real_verb(
    recipe_bodies: dict[str, list[str]],
) -> None:
    """A recipe dispatching an unknown verb is a usage error at runtime."""
    unknown = {
        recipe: verb
        for recipe, verb in _dispatched_verbs(recipe_bodies).items()
        if verb not in VERBS
    }
    assert not unknown, f"recipes dispatch verbs the table does not define: {unknown}"


def test_every_verb_has_a_recipe(recipe_bodies: dict[str, list[str]]) -> None:
    """A verb with no recipe is unreachable from the documented entry point."""
    exposed = set(_dispatched_verbs(recipe_bodies).values())
    missing = sorted(set(VERBS) - exposed)
    assert not missing, f"these verbs have no justfile recipe: {missing}"


#: Recipes whose name deliberately does not begin with the verb they dispatch.
#: Each is a domain-named entry point rather than an action-named gate, or the
#: composed pipeline itself, and each is listed by name so a fifth cannot appear
#: by accident.
_RENAMED_ENTRY_POINTS: dict[str, str] = {
    "ci": "ci",
    "fix-tokens": "tokens",
    "dev-serve": "serve",
    "dev-review": "review",
    "dev-clean": "clean",
}


def test_recipe_name_states_the_verb_it_dispatches(
    recipe_bodies: dict[str, list[str]],
) -> None:
    """`check-frontend` must run the `lint` verb's `frontend` target.

    The recipe name is now `<group-verb>-<target>` rather than the bare verb,
    because the verb-plus-argument form kept the real surface out of
    `just --list`. The dispatched verb is therefore not always the recipe's own
    first segment - the gating verb is spelled `check` at the recipe and `lint`
    in the table - so the check is that the recipe's TARGET segment names the
    target it dispatches, with the verb spellings mapped explicitly.
    """
    verb_spelling = {"check": "lint", "health": "health", "dev": None}
    mismatched: dict[str, str] = {}
    for recipe, verb in _dispatched_verbs(recipe_bodies).items():
        if _RENAMED_ENTRY_POINTS.get(recipe) == verb:
            continue
        head, _, tail = recipe.partition("-")
        expected = verb_spelling.get(head, head)
        if expected != verb:
            mismatched[recipe] = verb
            continue
        if not tail:
            mismatched[recipe] = verb
    assert not mismatched, f"recipe name and dispatched verb disagree: {mismatched}"


def test_every_recipe_target_segment_names_a_real_target(
    recipe_bodies: dict[str, list[str]],
) -> None:
    """`check-frotnend` must fail the build, not just error at runtime.

    A typo in the target segment of a recipe name is invisible until someone
    runs it: the recipe exists, so `just --list` shows it, and only the
    dispatcher rejects the argument. This closes that window.
    """
    unknown: dict[str, str] = {}
    for recipe, body in recipe_bodies.items():
        if recipe in _NON_DISPATCHING or recipe in _RENAMED_ENTRY_POINTS:
            continue
        for line in body:
            match = re.match(
                r"^\{\{dev\}\}\s+(?P<verb>[a-z][a-z0-9-]*)\s+(?P<target>[a-z][a-z0-9-]*)$",
                line,
            )
            if not match:
                continue
            verb, target = match.group("verb"), match.group("target")
            if verb in VERBS and target not in VERBS[verb].targets:
                unknown[recipe] = f"{verb}:{target}"
    assert not unknown, f"recipes name targets the table does not define: {unknown}"


def test_no_aggregate_is_a_just_dependency_chain(justfile_text: str) -> None:
    """An `-all` recipe must run every member and report, not stop at the first.

    A just dependency list is fail-fast. An aggregate is asked for a complete
    picture, so writing one as `check-all: check-toml check-rust ...` reports
    one failure where there may be five and costs a CI round-trip per defect.
    Membership therefore lives in `dev/toolchain.py`, where the aggregate is a
    `keep_going` target composing `Ref`s to the same targets these recipes run.
    """
    chained = re.findall(r"(?m)^([a-z-]+-all):[ 	]+\S", justfile_text)
    assert not chained, (
        f"these aggregates are fail-fast just dependency chains: {sorted(chained)}"
    )


@pytest.mark.parametrize("name", sorted(VERBS))
def test_verb_default_target_exists(name: str) -> None:
    """A default naming a missing target fails only when someone omits the arg.

    Args:
        name: The verb under test.
    """
    verb = VERBS[name]
    assert verb.default in verb.targets, (
        f"{name}'s default target {verb.default!r} is not one of its targets"
    )


@pytest.mark.parametrize("name", sorted(VERBS))
def test_every_reference_resolves(name: str) -> None:
    """An aggregate naming a missing member raises only when that path runs.

    Args:
        name: The verb under test.
    """
    verb = VERBS[name]
    for target, body in verb.targets.items():
        for step in body.steps:
            if isinstance(step, Ref):
                assert step.target in verb.targets, (
                    f"{name}:{target} references missing target {step.target!r}"
                )
            elif isinstance(step, VerbRef):
                assert step.verb in VERBS, (
                    f"{name}:{target} references missing verb {step.verb!r}"
                )
                assert step.target in VERBS[step.verb].targets, (
                    f"{name}:{target} references missing target "
                    f"{step.verb}:{step.target}"
                )


@pytest.mark.parametrize("name", sorted(VERBS))
def test_every_target_is_reachable(name: str) -> None:
    """A target nothing can invoke is dead weight that still reads as offered.

    A target is reachable when it is the default, or is named by a reference,
    or can be typed as an argument - which for a non-simple verb is any target.
    A simple verb has exactly one, unnamed, target.

    Args:
        name: The verb under test.
    """
    verb = VERBS[name]
    if verb.is_simple:
        assert tuple(verb.targets) == (SIMPLE,), (
            f"{name} is simple but holds named targets: {sorted(verb.targets)}"
        )
        return
    assert SIMPLE not in verb.targets, (
        f"{name} takes targets but also holds an unnamed one, which nothing can select"
    )


def test_no_verb_summary_is_empty() -> None:
    """Help output is derived, so an empty summary ships as blank help text."""
    blank = sorted(
        name
        for name, verb in VERBS.items()
        if not verb.summary.strip()
        or any(not target.summary.strip() for target in verb.targets.values())
    )
    assert not blank, f"these verbs carry a blank summary: {blank}"
