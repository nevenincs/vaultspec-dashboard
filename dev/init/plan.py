"""What initializing THIS repository means.

The only file in :mod:`dev.init` that differs between repositories. Everything
here is data: the host tools the workstation must already provide, the steps
each phase runs, and - the part that is easy to get wrong - the inputs whose
change makes a phase stale and the artifacts whose absence does the same.

``vaultspec-dashboard`` is the four-toolchain repository, and the one where the
old `bootstrap` was most misleading: it ran `uv sync` and stopped, so a fresh
worktree could not lint, serve, or test, because the SPA's `node_modules` was
never restored. `npm --prefix frontend ci` lived only in CONTRIBUTING.md prose
and in CI. `init-node` is that step, automated.

Two things are reported rather than performed. `mise install` provisions the
HOST - `just`, `node`, `python`, `uv`, and two cargo-built gates - and host
provisioning is not `init`'s job. The Rust toolchain is resolved by rustup from
`engine/rust-toolchain.toml`, which is likewise outside the worktree. Both are
probed, named, and left to the operator.

Stdlib-only, by the constraint stated in :mod:`dev.init`.
"""

from __future__ import annotations

import sys
from typing import Final

from dev.init.contract import Phase, Step
from dev.init.probe import Requirement

#: The ephemeral interpreter `init` is running on. Steps that are themselves
#: Python reuse it rather than assuming a `python` on PATH, because the whole
#: premise of this package is that the environment does not exist yet.
PY: Final = sys.executable

#: What the workstation must provide before `init` can do anything.
#:
#: `cargo` and `mise` are advisory rather than required: the SPA and the Python
#: toolchain are usable without them, and only the engine's build and the Rust
#: gates are not. Making them blocking would stop a frontend contributor's
#: `init` over a toolchain they will never invoke.
REQUIREMENTS: Final[tuple[Requirement, ...]] = (
    Requirement(
        command="uv",
        purpose="It resolves the locked Python environment.",
        install_url="https://docs.astral.sh/uv/getting-started/installation/",
    ),
    Requirement(
        command="npm",
        purpose="It restores the SPA's locked dependency graph under frontend/.",
        install_url="https://nodejs.org/",
    ),
    Requirement(
        command="node",
        purpose="It runs the SPA's build, tests, and module-size gate.",
        install_url="https://nodejs.org/",
        minimum="22.12.0",
    ),
    Requirement(
        command="cargo",
        purpose="It builds the engine and runs the Rust gates.",
        install_url="https://rustup.rs/",
        advisory=True,
    ),
    Requirement(
        command="mise",
        purpose="It pins every toolchain this repository needs; run `mise install`.",
        install_url="https://mise.jdx.dev/getting-started.html",
        advisory=True,
    ),
)

#: Steps that run before any phase, on every entry point. Materializing `.env`
#: belongs here rather than in `init-tools` because a worktree without one is
#: under-configured for tools that read it, including `just` itself in the
#: repositories that set `dotenv-load`. The rule is uniform across the fleet.
PREFLIGHT: Final[tuple[Step, ...]] = (
    Step(
        name="dotenv",
        argv=(PY, "-m", "dev.init.dotenv", ".env.example", ".env"),
        summary="Provision .env from .env.example when it is absent.",
    ),
)

PYTHON = Phase(
    name="python",
    summary="Resolve the locked Python development toolchain into .venv.",
    steps=(
        Step(
            name="uv-sync",
            argv=("uv", "sync", "--locked", "--group", "dev"),
            summary="Install the locked dev dependency group.",
        ),
    ),
    inputs=("uv.lock", "pyproject.toml", "mise.toml"),
    artifacts=(".venv",),
)

NODE = Phase(
    name="node",
    summary="Restore the SPA's pinned npm dependency graph under frontend/.",
    steps=(
        Step(
            name="npm-ci",
            argv=("npm", "--prefix", "frontend", "ci"),
            summary="Install frontend/node_modules exactly as the lock pins it.",
        ),
    ),
    inputs=("frontend/package-lock.json", "frontend/package.json"),
    artifacts=("frontend/node_modules",),
)

TOOLS = Phase(
    name="tools",
    summary="Enroll the Vaultspec framework and install the committed git hooks.",
    steps=(
        Step(
            name="framework-install",
            argv=("uv", "run", "--no-sync", "vaultspec-core", "install", "--force"),
            summary="Rebuild the gitignored install manifest from tracked config.",
        ),
        Step(
            name="hook-runner",
            # The committed hooks include `frontend-eslint` and
            # `frontend-typecheck`, which is the concrete reason `init-node`
            # runs before `init-tools`: installing hooks that cannot run is
            # worse than not installing them.
            argv=(PY, "-m", "dev.init.hooks", ".pre-commit-config.yaml"),
            summary="Install the committed hooks with the locked prek.",
            advisory=True,
        ),
    ),
    inputs=("uv.lock", ".pre-commit-config.yaml"),
    artifacts=(".vaultspec/providers.json",),
)

#: The phases, keyed by name. The runner reads this and nothing else.
PHASE_PLAN: Final[dict[str, Phase]] = {
    "python": PYTHON,
    "node": NODE,
    "tools": TOOLS,
}
