"""The toolchain, stated once, as data.

This module is the single declarative source of truth for what every
development verb runs. To change what a target does, edit the table here - not
the `justfile`, whose recipes are one line each and carry no logic, and not a
CI workflow, which invokes the same verbs a developer does.

Two properties are deliberate and are asserted by the guards in `dev/guards`:

* **Aggregates are references, never copies.** ``lint all`` names its members
  with :class:`~dev.runner.Ref`, so a target and its use in an aggregate cannot
  drift apart.
* **No step contains shell syntax.** Every command is an argument vector. There
  is no pipe, conditional, chain operator, or glob for a shell to interpret,
  which is why `cmd.exe` and `sh` run all of them identically.

The verbs split by CONSEQUENCE, not by tool:

    deps      MUTATES the environment.
    lint      GATES.   Read-only, and a finding fails the build.
    fix       MUTATES. Everything automatically repairable, in one pass.
    audit     GATES.   Supply-chain advisories against pinned versions.
    test      GATES.
    build     Produces artifacts.
    docs      Regenerates committed documentation assets.
    vault     Operates on this repository's own .vault/ corpus.
    serve     Long-running. Live development survey.
    review    Long-running. The visual review desk.
    clean     Reclaims dev artifact sprawl.
    tokens    Regenerates the DTCG colour CSS and checks drift.
    precommit Manages the git hooks.
    ci        The full local pipeline.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from dev.runner import (
    Cmd,
    Echo,
    Ref,
    ToolOrDocker,
    ToolOrHint,
    VerbRef,
    cargo,
    npm,
    uv_run,
)

if TYPE_CHECKING:
    from collections.abc import Mapping

    from dev.runner import Step

#: The pinned Taplo image used when the native binary is absent.
TAPLO_IMAGE = "tamasfe/taplo:0.9"

#: The target name of a verb that takes no target at all. Modelling these as a
#: single unnamed target keeps one dispatch path rather than two.
SIMPLE = ""


@dataclass(frozen=True)
class Target:
    """One selectable target within a verb.

    Args:
        summary: One line, shown by ``just <verb> help``.
        steps: The ordered steps. Execution stops at the first non-zero exit
            unless ``keep_going`` is set.
        advisory: When true the target reports findings without gating. It
            suppresses ``FINDINGS_CODES`` ONLY: a tool that crashed or was
            never installed still propagates, as ``ADVISORY_BROKEN``. See
            ``dev/EXIT-CODES.md``.
        keep_going: When true a failing step does not stop the remaining ones,
            and the target reports the FIRST non-zero status it saw. Every
            ``all`` aggregate sets this: an aggregate's purpose is a complete
            picture per invocation, and fail-fast costs one CI round-trip per
            defect while hiding the correlation between them.
    """

    summary: str
    steps: tuple[Step, ...]
    advisory: bool = False
    keep_going: bool = False


@dataclass(frozen=True)
class Verb:
    """One top-level verb, as invoked from the `justfile`.

    Args:
        summary: One line, shown by ``just help``.
        targets: The selectable targets, keyed by name. A verb taking no target
            has exactly one entry, keyed :data:`SIMPLE`.
        default: The target used when none is given.
    """

    summary: str
    targets: Mapping[str, Target]
    default: str

    @property
    def is_simple(self) -> bool:
        """Whether this verb takes no target argument."""
        return tuple(self.targets) == (SIMPLE,)


def _toml_files() -> tuple[str, ...]:
    """List the repository-root TOML files the formatter gates.

    The recipes this replaced passed a literal ``*.toml`` and relied on the
    shell - or on Taplo - to expand it, which resolved differently under `sh`,
    PowerShell, and the container. Expanding here makes the argument vector
    explicit and identical everywhere.

    Returns:
        The sorted root-level ``.toml`` filenames.
    """
    return tuple(sorted(path.name for path in Path.cwd().glob("*.toml")))


def _simple(summary: str, *steps: Step) -> Mapping[str, Target]:
    """Build the single-target mapping for a verb that takes no target."""
    return {SIMPLE: Target(summary, steps)}


DEPS = Verb(
    "Manage the uv-provided dev toolchain and its lockfile.",
    {
        "sync": Target(
            "Install the locked dev dependency group.",
            (Cmd(("uv", "sync", "--locked", "--group", "dev")),),
        ),
        "upgrade": Target(
            "Upgrade every dependency group.",
            (Cmd(("uv", "sync", "--upgrade", "--all-groups")),),
        ),
        "lock": Target("Refresh the lockfile.", (Cmd(("uv", "lock")),)),
        "lock-upgrade": Target(
            "Upgrade and refresh the lockfile.",
            (Cmd(("uv", "lock", "--upgrade")),),
        ),
    },
    default="sync",
)

LINT = Verb(
    "Run gating static analysis. Read-only; a finding fails the build.",
    {
        "toml": Target(
            "Check TOML formatting (taplo, or its pinned image).",
            (
                ToolOrDocker(
                    tool="taplo",
                    argv=("lint", *_toml_files()),
                    image=TAPLO_IMAGE,
                ),
            ),
        ),
        "markdown": Target(
            "Check the README's formatting and structure.",
            (
                uv_run("mdformat", "--check", "README.md"),
                uv_run(
                    "pymarkdown", "--config", ".pymarkdown.json", "scan", "README.md"
                ),
            ),
        ),
        "rust": Target(
            "Check engine formatting, lints, and module size.",
            (
                cargo("fmt", "--all", "--", "--check"),
                cargo("clippy", "--workspace", "--all-targets", "--", "-D", "warnings"),
                Cmd(("node", "frontend/dev/tooling/scan-module-size.mjs")),
            ),
        ),
        "frontend": Target(
            "Run every SPA gate: lints, formatting, types, tokens, and names.",
            (
                npm("lint"),
                npm("lint:localization"),
                npm("lint:px"),
                npm("lint:domains"),
                npm("lint:modules"),
                npm("lint:design-system"),
                npm("format:check"),
                npm("typecheck"),
                npm("tokens:check"),
                npm("figma:names"),
            ),
        ),
        "typos": Target(
            "Spell-check every tracked source file.",
            (
                ToolOrHint(
                    tool="typos",
                    argv=("typos",),
                    hint="install with: cargo install typos-cli (or: mise install)",
                ),
            ),
        ),
        "guards": Target(
            "Assert the src / dev / harness boundaries hold.",
            (uv_run("pytest", "dev/guards"),),
        ),
        # Two questions about the same artifacts, in the order that answers
        # them cheapest. actionlint asks whether the YAML is well-formed and
        # its expressions resolve; the contract asks whether a `run:` step is
        # calling a recipe or re-implementing one. A workflow can be perfectly
        # valid YAML and still be the six-gates-never-ran defect this
        # repository already paid for.
        "workflow": Target(
            "Lint the workflows, then hold them to the CI/justfile contract.",
            (
                uv_run("python", "-m", "dev.actionlint"),
                uv_run("python", "-m", "dev.ci_contract"),
            ),
        ),
        # ADVISORY structurally, not just in prose. Everything around this
        # target already said so - the summary, and `all` excluding it by name
        # - while the target itself gated on findings, which is the mismatch
        # `dev/EXIT-CODES.md` exists to make impossible to leave standing.
        #
        # Advisory is the right consequence twice over. An unused export is a
        # LEAD, not a verdict: knip cannot see a symbol a consumer imports, and
        # confirming one is a reading task. And this target reaches the network
        # on every run (`npx --yes knip@5`), so a proxy, a rate limit, or a
        # yanked version fails it for reasons that have nothing to do with the
        # SPA. `advisory=True` separates those two outcomes rather than merging
        # them the way `; exit 0` would: findings exit 0, a knip that could not
        # RUN exits TOOL_BROKEN (7) and stays visible.
        "knip": Target(
            "ADVISORY. Report unused SPA files, exports, and dependencies.",
            (Cmd(("npx", "--yes", "knip@5", "--directory", "frontend")),),
            advisory=True,
        ),
        "all": Target(
            "Every blocking linter. Advisory 'knip' is deliberately excluded.",
            (
                Ref("workflow"),
                Ref("toml"),
                Ref("markdown"),
                Ref("rust"),
                Ref("frontend"),
                Ref("typos"),
                Ref("guards"),
            ),
            keep_going=True,
        ),
    },
    default="all",
)

FIX = Verb(
    "Apply every available formatter and automatic fix.",
    {
        "toml": Target(
            "Format TOML files.",
            (
                ToolOrDocker(
                    tool="taplo",
                    argv=("fmt", *_toml_files()),
                    image=TAPLO_IMAGE,
                ),
            ),
        ),
        "markdown": Target(
            "Format the README and repair its structure.",
            (
                uv_run("mdformat", "README.md"),
                uv_run("pymarkdown", "--config", ".pymarkdown.json", "fix", "README.md"),
            ),
        ),
        "vault": Target(
            "Repair this repository's own .vault/ corpus.",
            (
                uv_run("vaultspec-core", "vault", "check", "all", "--fix"),
                uv_run("vaultspec-core", "vault", "sanitize", "annotations"),
            ),
        ),
        "rust": Target("Format the engine workspace.", (cargo("fmt", "--all"),)),
        "frontend": Target("Format the SPA.", (npm("format"),)),
        "all": Target(
            "Every fixer, in one pass.",
            (Ref("toml"), Ref("markdown"), Ref("vault"), Ref("rust"), Ref("frontend")),
            keep_going=True,
        ),
    },
    default="all",
)

AUDIT = Verb(
    "Audit the supply chain. A published advisory against a pinned version gates.",
    {
        # THE gate. `dev/audit/dependency_audit.py` resolves every pinned
        # coordinate out of the committed lockfiles - uv.lock,
        # frontend/package-lock.json, engine/Cargo.lock - and queries OSV for
        # all of them in one pass, so Python, Node and Rust are audited by one
        # implementation with one verdict. It replaced a bare
        # `uv audit --no-dev`, which exits 0 even when it prints advisories and
        # therefore could not fail; the verdict is now a property of the
        # finding set, not of a preview tool's exit code. Accepted advisories
        # live in `dependency-audit-allowlist.toml`, each with a reason and an
        # expiry, and an expired acceptance fails the gate.
        "deps": Target(
            "Audit every locked dependency ecosystem for advisories (GATES).",
            (Cmd(("uv", "run", "--no-sync", "python", "-m", "dev.audit.dependency_audit")),),
        ),
        # Kept as the names CI and muscle memory already use; both now resolve
        # to the one cross-ecosystem gate rather than to two partial ones.
        "python": Target(
            "Audit the locked dependencies (alias for 'deps').", (Ref("deps"),)
        ),
        "node": Target(
            "Audit the locked dependencies (alias for 'deps').", (Ref("deps"),)
        ),
        # Not a duplicate of `deps`: cargo-deny checks licences, bans and
        # sources, which OSV knows nothing about. Its advisory dimension
        # overlaps, and that redundancy is cheap.
        "rust": Target(
            "Audit the engine's crates (licences, bans, sources).",
            (
                ToolOrHint(
                    tool="cargo-deny",
                    argv=("cargo", "deny", "--manifest-path", "engine/Cargo.toml", "check"),
                    hint="install with: cargo install cargo-deny (or: mise install)",
                ),
            ),
        ),
        # What reaches a user is the built bundle embedded in the engine
        # binary, so `deps` is what gates. npm's own view of the SPA's build
        # tooling stays visible but advisory: an advisory there is a
        # maintenance signal about our own build box, not a reason to refuse a
        # release.
        "node-tooling": Target(
            "ADVISORY. Report advisories against the SPA's build tooling.",
            (Cmd(("npm", "--prefix", "frontend", "audit")),),
            advisory=True,
        ),
        "all": Target(
            "Every gating supply-chain audit. Advisory 'node-tooling' is "
            "deliberately excluded.",
            (
                Echo("=== dependency advisories (python, node, rust) ==="),
                Ref("deps"),
                Echo("=== rust licences, bans and sources ==="),
                Ref("rust"),
            ),
            keep_going=True,
        ),
    },
    default="all",
)

TEST = Verb(
    "Run the project test suites.",
    {
        "rust": Target(
            "Run the engine workspace tests, end-to-end included.",
            (cargo("test", "--workspace"),),
        ),
        "bench": Target(
            "Run the cold-index benchmark against its baseline.",
            (
                Cmd(
                    (
                        "cargo",
                        "test",
                        "--manifest-path",
                        "engine/Cargo.toml",
                        "-p",
                        "engine-e2e",
                        "--test",
                        "bench",
                        "--",
                        "--nocapture",
                    ),
                    env={"VAULTSPEC_BENCH_STRICT": "1"},
                ),
            ),
        ),
        "frontend": Target("Run the SPA unit suite.", (npm("test"),)),
        "guards": Target(
            "Run the architectural guards alone.",
            (uv_run("pytest", "dev/guards"),),
        ),
        # Separate from 'all' because it drives a live `vaultspec serve` origin
        # and a real browser. The install is idempotent.
        "e2e": Target(
            "Provision Chromium and run the Playwright smoke.",
            (
                Cmd(("npm", "--prefix", "frontend", "exec", "--", "playwright", "install", "chromium")),
                npm("e2e"),
            ),
        ),
        "all": Target(
            "The engine and SPA suites, plus the guards.",
            (Ref("rust"), Ref("frontend"), Ref("guards")),
            keep_going=True,
        ),
    },
    default="all",
)

BUILD = Verb(
    "Build the project's artifacts.",
    {
        "rust": Target(
            "Build the engine workspace in release mode.",
            (cargo("build", "--workspace", "--release"),),
        ),
        "frontend": Target("Build the SPA production bundle.", (npm("build"),)),
        # The packaged artifact (dashboard-packaging ADR): the SPA bundle is
        # built, staged INSIDE the api crate (distribution-channels ADR:
        # boundary-clean embed), then baked into the release binary via the
        # embed-spa feature, so the result serves standalone with no
        # frontend/dist on disk.
        "package": Target(
            "Build the installable single binary, with the SPA embedded.",
            (
                npm("build"),
                uv_run("python", "-m", "dev.stage_spa"),
                Cmd(
                    (
                        "cargo",
                        "build",
                        "--manifest-path",
                        "engine/Cargo.toml",
                        "--release",
                        "-p",
                        "vaultspec-cli",
                        "--features",
                        "embed-spa",
                    )
                ),
            ),
        ),
        "all": Target(
            "The engine and the SPA.",
            (Ref("rust"), Ref("frontend")),
            keep_going=True,
        ),
    },
    default="all",
)

DOCS = Verb(
    "Regenerate the committed documentation assets.",
    {
        "readme-assets": Target(
            "Re-render the README's CLI-output SVGs from a real binary.",
            (uv_run("python", "-m", "dev.readme_assets"),),
        ),
        "all": Target(
            "Every documentation asset.",
            (Ref("readme-assets"),),
            keep_going=True,
        ),
    },
    default="all",
)

VAULT = Verb(
    "Operate on this repository's own .vault/ development corpus.",
    {
        "check": Target(
            "Validate the corpus.",
            (uv_run("vaultspec-core", "vault", "check", "all"),),
        ),
        "fix": Target(
            "Repair the corpus and strip template annotations.",
            (
                uv_run("vaultspec-core", "vault", "check", "all", "--fix"),
                uv_run("vaultspec-core", "vault", "sanitize", "annotations"),
            ),
        ),
    },
    default="check",
)

PRECOMMIT = Verb(
    "Manage the git pre-commit hooks.",
    {
        "install": Target("Install the hooks.", (uv_run("prek", "install"),)),
        "upgrade": Target("Update the hooks.", (uv_run("prek", "auto-update"),)),
        "run": Target(
            "Run every hook over every file.",
            (uv_run("prek", "run", "--all-files"),),
        ),
    },
    default="run",
)

# Live development survey: one command starts the Vite SPA dev server, which in
# turn supervises the `vaultspec serve` engine. Chrome edits hot-reload (Vite
# HMR), `.vault/` corpus edits stream live (engine SSE), and engine source edits
# rebuild + restart the engine and force a browser refresh. Stale caches are
# cleared on boot. Override the engine port with VAULTSPEC_DEV_PORT and the
# engine handling with VAULTSPEC_DEV_ENGINE=manage|adopt|off.
SERVE = Verb(
    "Start the live development survey: engine plus Vite HMR.",
    _simple("Start the SPA dev server, which supervises the engine.", npm("dev")),
    default=SIMPLE,
)

# The visual review desk: every principal UI surface across the four review
# states (normal / loading / empty / degraded) under the light, dark, and
# high-contrast themes.
#
# UNTETHERED by design: every specimen renders the real production component
# from authored inputs and the page's fetch is hermetically inert, so there is
# no engine to run and no backend whose slowness or absence could blank a cell.
REVIEW = Verb(
    "Open the visual review desk: every surface x state x theme.",
    _simple(
        "Serve the review desk (Vite only; no engine).",
        Cmd(("node", "frontend/dev/tooling/visual-review-serve.mjs")),
    ),
    default=SIMPLE,
)

# Reclaim Class-A dev artifact sprawl (resource-hardening). `cargo clean` drops
# the multi-GB engine target; `git worktree prune` clears administrative entries
# for removed worktrees; `git clean -fdX -- tmp` drops gitignored scratch under
# tmp/. NOTE: this does NOT delete the shared HuggingFace model cache
# (~/.cache/huggingface) - it belongs to other tools; scope it per-project with
# HF_HOME if needed. And it does NOT remove live agent worktrees under
# .claude/worktrees/ - remove those with `git worktree remove --force <path>`
# once their work is merged (the worktree teardown half of the policy).
CLEAN = Verb(
    "Reclaim dev artifact sprawl: engine target, dead worktrees, tmp scratch.",
    _simple(
        "Drop the engine target, prune worktree entries, clear tmp scratch.",
        cargo("clean"),
        Cmd(("git", "worktree", "prune", "-v")),
        Cmd(("git", "clean", "-fdX", "--", "tmp")),
        Echo("reclaimed: engine/target, pruned worktree admin entries, tmp/ scratch"),
        Echo("note: the shared HF model cache and live agent worktrees are left intact"),
    ),
    default=SIMPLE,
)

TOKENS = Verb(
    "Regenerate the DTCG colour CSS and verify no drift.",
    _simple(
        "Rebuild the token-derived CSS regions, then check parity.",
        npm("tokens:build"),
        npm("tokens:check"),
    ),
    default=SIMPLE,
)

CI = Verb(
    "Run the full local pipeline: lint, dependency audit, vault, tests, build.",
    _simple(
        "Everything a pull request must pass.",
        Echo("=== lint ==="),
        VerbRef("lint", "all"),
        # `audit deps` and NOTHING ELSE from the audit verb. The audit group is
        # advisory by construction - each finding is a lead to confirm, and a
        # pipeline that fails on a lead teaches people to stop reading it. A
        # published advisory against a pinned version is not a lead, it is a
        # verdict, so it is the one audit that gates. Running `audit all` here
        # would put dead-code and duplication findings between a developer and
        # a merge; running none would let a known CVE through.
        Echo("=== dependency audit ==="),
        VerbRef("audit", "deps"),
        Echo("=== vault ==="),
        VerbRef("vault", "check"),
        Echo("=== test ==="),
        VerbRef("test", "all"),
        # BUILD IS PART OF CI. It was not, and the consequence is measured:
        # a break on the release path surfaced at release time, when the tag
        # was already cut and the only remedies were a revert or a hotfix
        # release. The gates above prove the source is well-formed and the
        # tests pass; only this one proves the artifact the user receives can
        # still be produced from it.
        Echo("=== build ==="),
        VerbRef("build", "all"),
    ),
    default=SIMPLE,
)

#: Every verb, in the order `just help` lists them.
VERBS: Mapping[str, Verb] = {
    "deps": DEPS,
    "lint": LINT,
    "fix": FIX,
    "audit": AUDIT,
    "test": TEST,
    "build": BUILD,
    "docs": DOCS,
    "vault": VAULT,
    "tokens": TOKENS,
    "precommit": PRECOMMIT,
    "serve": SERVE,
    "review": REVIEW,
    "clean": CLEAN,
    "ci": CI,
}
