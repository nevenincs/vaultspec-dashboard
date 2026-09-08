# ===========================================================================
#  vaultspec-dashboard development harness
#
#  Every entry point is a FLAT HYPHENATED recipe named `<verb>-<thing>` -
#  `just check-frontend`, `just test-rust`, `just fix-markdown`. There is no
#  `target` argument anywhere: the thing a recipe acts on is part of its name,
#  so `just --list` is the complete surface and tab completion reaches every
#  one of them. Run `just` for the annotated recipe list, grouped by
#  CONSEQUENCE.
#
#  THIS FILE IS DEV-ONLY IN ITS ENTIRETY. What this repository SHIPS is the
#  Rust engine (`engine/`) and the TypeScript SPA (`frontend/src/`); everything
#  reachable from here exists to build, check, or measure those, and nothing
#  here is packaged. The `dev` GROUP below is therefore not "the dev half" - it
#  is the day-to-day operations that are neither a gate nor a build.
#
#  PLATFORM AGNOSTIC BY CONSTRUCTION. Every recipe body below is a single
#  command with no shell branching, no pipes, no conditionals, and no `sh`
#  versus PowerShell dialect. All of the logic - step chaining, tool-or-Docker
#  fallback, environment overlay - lives in the stdlib-only modules under
#  `dev/`, which therefore behave identically on every platform. There is no
#  shell script backing this file. To change what a recipe runs, edit
#  `dev/toolchain.py`, which is the single declarative source of truth for the
#  whole toolchain. `dev/guards` asserts both properties, so a branch
#  reintroduced here fails the build rather than quietly working on one
#  machine.
#
#  The GROUPS split by CONSEQUENCE, not by tool. The taxonomy is a closed set
#  of ten, identical in every repository:
#
#    setup    Provisioning and dependency resolution. MUTATES the environment.
#    dev      Day-to-day operations on this checkout that are not gates.
#    check    GATES.    Read-only, and a finding fails the build.
#    fix      MUTATES.  Everything automatically repairable, in one pass.
#    audit    ADVISORY, except the dependency audit, which GATES.
#    build    Produces artifacts from a plain checkout.
#    release  Actions that need a published tag.
#    docs     Regenerates committed documentation assets.
#    test     GATES.
#    meta     The recipe list and the composed pipeline.
#
#  A NOTE ON `audit-*` IN THIS REPOSITORY. Elsewhere the group is advisory with
#  `audit-deps` as the single gating exception. Here the supply-chain audits
#  are the whole group and they GATE, because a published advisory against a
#  pinned version is a verdict, not a lead. `audit-node-tooling` is the one
#  advisory member and is named as such; it is deliberately not a member of
#  `audit-all`.
#
#  NO TOOL IS MIRRORED HERE. `vaultspec-core` and `vaultspec-rag` are finished
#  products with their own CLIs and their own MCP servers; wrapping either one
#  only adds a layer that can drift out of step with it. Invoke them directly
#  (`uv run --no-sync vaultspec-core ...`) or through the MCP tools. The one
#  exception is the `vault-*` pair, which operates on THIS repository's own
#  `.vault/` corpus - a development action on this checkout rather than product
#  usage.
# ===========================================================================

set quiet := true

# Requires just >= 1.38 (`set working-directory`, native modules, `[doc]`/`[group]`).
#
# just defaults to `sh -cu` on every platform, which on Windows means a Git Bash
# `sh.exe` that is only on PATH for some Git for Windows install options. This
# names the one interpreter every Windows machine is guaranteed to have.
#
# `cmd` is chosen for EXIT-CODE FIDELITY, not familiarity. It forwards a native
# command's status verbatim; `pwsh -Command` and `powershell -Command` collapse
# every non-zero status onto 1, which would erase this harness's own exit codes
# and destroy the advisory-versus-gating split the recipe groups are built on.
# cmd's weaknesses - `%VAR%` expansion and no single-quote literal - cost
# nothing here, because every recipe body below is a single command with no
# shell syntax and no recipe body contains either character.
set windows-shell := ["cmd.exe", "/c"]

# Every recipe that merely *uses* the environment goes through `uv run
# --no-sync`. Skipping the sync keeps `uv run` from re-resolving and rebuilding
# the project into `.venv`, which fails on Windows whenever a resident process
# - an MCP server, an editor, another agent's session - holds one of the
# console-script executables open. The recipes whose purpose IS to change the
# environment call `uv` directly, inside `dev/`.
dev := "uv run --no-sync python -m dev"

# List every recipe, grouped by consequence.
[group('meta')]
default:
    @just --list

# ===========================================================================
#  setup
# ===========================================================================

# `init` is the one command a fresh worktree needs, and the command git
# tooling and the worktree provisioner call after creating one. It cannot
# route through `{{dev}}`, which presumes the environment `init` is
# responsible for creating; it runs on an ephemeral interpreter instead, and
# `dev/init/` is stdlib-only for exactly that reason.
#
# Idempotent: a second run costs a stamp comparison and touches nothing.
# `just init-check` verifies without mutating, exiting 3 when the worktree is
# not initialized, which is what a hook or a provisioner calls. Set
# VAULTSPEC_INIT_JSON=1 for an NDJSON event stream, VAULTSPEC_INIT_FORCE=1 to
# ignore the stamp. Every run writes `.venv/init-report.json`.
#
# The phases run in dependency order and stop at the first failure: unlike the
# `-all` aggregates, which chain independent inspectors and run every one,
# these build one artifact, and `init-tools` runs executables out of the
# environment `init-python` creates. The report still lists every phase, with
# the ones that were not attempted naming the failure that stopped them.

# Initialize a fresh clone or worktree: Python, the SPA, hooks, and .env.
[group('setup')]
init:
    uv run --no-project --python 3.13 -- python -m dev.init all

# Resolve the locked Python development toolchain into .venv.
[group('setup')]
init-python:
    uv run --no-project --python 3.13 -- python -m dev.init python

# Restore the SPA's pinned npm dependency graph under frontend/.
[group('setup')]
init-node:
    uv run --no-project --python 3.13 -- python -m dev.init node

# Enroll the Vaultspec framework and install the committed git hooks.
[group('setup')]
init-tools:
    uv run --no-project --python 3.13 -- python -m dev.init tools

# Report whether this worktree is initialized. Mutates nothing; exits 3 if not.
[group('setup')]
init-check:
    uv run --no-project --python 3.13 -- python -m dev.init check

# Install the locked dev dependency group.
[group('setup')]
deps-sync:
    {{dev}} deps sync

# Upgrade every dependency group.
[group('setup')]
deps-upgrade:
    {{dev}} deps upgrade

# Refresh the lockfile.
[group('setup')]
deps-lock:
    {{dev}} deps lock

# Upgrade and refresh the lockfile.
[group('setup')]
deps-lock-upgrade:
    {{dev}} deps lock-upgrade

# Install the git pre-commit hooks.
[group('setup')]
precommit-install:
    {{dev}} precommit install

# Update the git pre-commit hooks.
[group('setup')]
precommit-upgrade:
    {{dev}} precommit upgrade

# Run every git pre-commit hook over every file.
[group('setup')]
precommit-run:
    {{dev}} precommit run

# ===========================================================================
#  check - GATES. Read-only, and a finding fails the build.
# ===========================================================================

# Check TOML formatting.
[group('check')]
check-toml:
    {{dev}} lint toml

# Check the README's formatting and structure.
[group('check')]
check-markdown:
    {{dev}} lint markdown

# Check the dev harness: lints, formatting, and types.
[group('check')]
check-python:
    {{dev}} lint python

# Check engine formatting, lints, and module size.
[group('check')]
check-rust:
    {{dev}} lint rust

# Run every SPA gate: lints, formatting, types, tokens, and names.
[group('check')]
check-frontend:
    {{dev}} lint frontend

# Spell-check every tracked source file.
[group('check')]
check-typos:
    {{dev}} lint typos

# Lint the workflows, then hold them to the CI/justfile contract.
[group('check')]
check-workflow:
    {{dev}} lint workflow

# Assert the src / dev / harness boundaries hold.
[group('check')]
check-guards:
    {{dev}} lint guards

# AGGREGATES RUN EVERY STEP and exit with the first non-zero status; they do
# not stop at the first failure. An aggregate is asked for a complete picture,
# and fail-fast costs a CI round-trip per defect. That is why this dispatches
# into `dev/` rather than listing its members as just dependencies: a
# dependency chain cannot express run-all-then-report. The membership lives in
# `dev/toolchain.py` as references to the same targets the individual recipes
# above run, so this aggregate and those gates cannot disagree.
# Advisory `audit-knip` is deliberately not a member: it reports leads to
# confirm rather than a verdict, and chaining it in would fail the build on
# an unused export.

# Run every blocking linter.
[group('check')]
check-all:
    {{dev}} lint all

# ===========================================================================
#  fix - MUTATES. Everything automatically repairable, in one pass.
# ===========================================================================

# Format TOML files.
[group('fix')]
fix-toml:
    {{dev}} fix toml

# Format the README and repair its structure.
[group('fix')]
fix-markdown:
    {{dev}} fix markdown

# Repair this repository's own .vault/ corpus.
[group('fix')]
fix-vault:
    {{dev}} fix vault

# Format the engine workspace.
[group('fix')]
fix-rust:
    {{dev}} fix rust

# Format the SPA.
[group('fix')]
fix-frontend:
    {{dev}} fix frontend

# Regenerate the DTCG colour CSS and verify no drift.
[group('fix')]
fix-tokens:
    {{dev}} tokens

# Apply every fixer, in one pass.
[group('fix')]
fix-all:
    {{dev}} fix all

# ===========================================================================
#  audit - the supply chain. GATES here; see the header note.
# ===========================================================================

# Audit every locked dependency ecosystem for advisories.
[group('audit')]
audit-deps:
    {{dev}} audit deps

# Audit the engine's crates for licences, bans, and sources.
[group('audit')]
audit-rust:
    {{dev}} audit rust

# Report advisories against the SPA's build tooling; advisory, exits 0.
[group('audit')]
audit-node-tooling:
    {{dev}} audit node-tooling

# ADVISORY in fact, not only in prose: a finding exits 0, and a knip that could
# not RUN exits TOOL_BROKEN rather than FAILED. It shells to `npx --yes knip@5`
# on every invocation, so gating on it would fail the build on a proxy hiccup
# instead of on a finding - which is a different claim from the one a gate
# makes. The registry verb behind it is still `lint`; the name and group state
# the consequence, which is what a reader is choosing between.

# Report unused SPA files, exports, and dependencies; advisory, exits 0.
[group('audit')]
audit-knip:
    {{dev}} lint knip

# Run every gating supply-chain audit. Advisory `audit-node-tooling` is
# deliberately not a member.
[doc('Run every gating supply-chain audit; the advisory dimension is excluded.')]
[group('audit')]
audit-all:
    {{dev}} audit all

# ===========================================================================
#  test - GATES.
# ===========================================================================

# Run the engine workspace tests, end-to-end included.
[group('test')]
test-rust:
    {{dev}} test rust

# Run the cold-index benchmark against its baseline.
[group('test')]
test-bench:
    {{dev}} test bench

# Run the SPA unit suite.
[group('test')]
test-frontend:
    {{dev}} test frontend

# Run the architectural guards alone.
[group('test')]
test-guards:
    {{dev}} test guards

# Provision Chromium and run the Playwright smoke.
[group('test')]
test-e2e:
    {{dev}} test e2e

# Run the engine and SPA suites, plus the guards.
[group('test')]
test-all:
    {{dev}} test all

# ===========================================================================
#  build
# ===========================================================================

# Build the engine workspace in release mode.
[group('build')]
build-rust:
    {{dev}} build rust

# Build the SPA production bundle.
[group('build')]
build-frontend:
    {{dev}} build frontend

# Build the installable single binary, with the SPA embedded.
[group('build')]
build-package:
    {{dev}} build package

# Build the engine and the SPA.
[group('build')]
build-all:
    {{dev}} build all

# Grouped with `build-*` rather than `dev-*` because the bulk of what it
# reclaims is what `build-all` produced - the engine target directory - and a
# contributor looking for "how do I get rid of what the build made" reads this
# section. It reaps more than build output (dead worktrees, tmp scratch), which
# is why the summary says so rather than claiming to be a plain build clean.

# Reclaim dev artifact sprawl: engine target, dead worktrees, tmp scratch.
[group('build')]
build-clean:
    {{dev}} clean

# ===========================================================================
#  docs
# ===========================================================================

# Re-render the README's CLI-output SVGs from a real binary.
[group('docs')]
docs-readme-assets:
    {{dev}} docs readme-assets

# Regenerate every committed documentation asset.
[group('docs')]
docs-all:
    {{dev}} docs all

# ===========================================================================
#  dev - this checkout's own records, and the long-running surfaces
# ===========================================================================

# Validate this repository's own .vault/ corpus.
[group('dev')]
vault-check:
    {{dev}} vault check

# Repair this repository's own .vault/ corpus and strip template annotations.
[group('dev')]
vault-fix:
    {{dev}} vault fix

# Start the live development survey: engine plus Vite HMR.
[group('dev')]
dev-serve:
    {{dev}} serve

# Open the visual review desk: every surface x state x theme x viewport.
[group('dev')]
dev-review:
    {{dev}} review

# ===========================================================================
#  meta
# ===========================================================================

# This composes the gates rather than restating them, so the pipeline and the
# gates it claims to run cannot disagree. It mirrors what CI proves, so a green
# run here means what a green CI run means.

# Run the full local gate: static analysis, vault check, tests.
[group('check')]
ci:
    {{dev}} ci
