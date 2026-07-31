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


def test_recipe_name_matches_the_verb_it_dispatches(
    recipe_bodies: dict[str, list[str]],
) -> None:
    """`just lint` must run the `lint` verb, not some other one."""
    mismatched = {
        recipe: verb
        for recipe, verb in _dispatched_verbs(recipe_bodies).items()
        if recipe != verb
    }
    assert not mismatched, f"recipe name and dispatched verb disagree: {mismatched}"


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


#: Invocation prefixes that no longer exist: the previous two-tier shape put a
#: `dev` namespace in front of every verb, which is now top-level.
#:
#: Assembled from fragments ON PURPOSE. Written as a literal, the retired string
#: would appear in this file and the sweep below would flag its own source - the
#: guard failing on itself is how the first version of it behaved.
RETIRED_INVOCATIONS = ("just " + "dev ",)

#: Trees excluded from the citation sweep. `.vault/` records state what was true
#: when they were written and are deliberately never rewritten; the rest are
#: generated, vendored, or build output.
CITATION_EXCLUDED = {
    ".vault",
    ".git",
    "node_modules",
    "target",
    "dist",
    ".venv",
    "tmp",
}

#: Suffixes worth sweeping for a stale invocation string.
CITATION_SUFFIXES = frozenset(
    {".py", ".mjs", ".js", ".ts", ".tsx", ".rs", ".md", ".toml", ".yml", ".yaml", ".json"}
)


def test_no_live_source_cites_a_retired_invocation(repo_root) -> None:
    """A doc comment or error message naming a retired prefix sends readers nowhere.

    Four such citations survived the cutover's first sweep - in a Rust comment, a
    TypeScript doc block, a Figma workflow doc, and the error text the README
    renderer raises - because that sweep walked a hand-written file list. This
    walks the tree instead, so the next rename cannot rely on someone
    remembering every consumer.

    Args:
        repo_root: The repository root.
    """
    offenders: list[str] = []
    for path in repo_root.rglob("*"):
        if not path.is_file() or path.suffix not in CITATION_SUFFIXES:
            continue
        if CITATION_EXCLUDED & set(path.relative_to(repo_root).parts):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if any(retired in text for retired in RETIRED_INVOCATIONS):
            offenders.append(str(path.relative_to(repo_root)))
    assert not offenders, (
        f"these cite a retired invocation {RETIRED_INVOCATIONS}: {sorted(offenders)}"
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
