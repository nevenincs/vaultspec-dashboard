# ===========================================================================
#  vaultspec-dashboard development harness
#
#  Every entry point is a top-level verb; behaviour within a verb is selected
#  by a `target` argument - `just lint frontend`, `just test rust`, `just fix
#  markdown`. Run `just` for the annotated recipe list, and `just <verb> help`
#  (or any unrecognised target) for that verb's targets with descriptions.
#
#  THIS FILE IS DEV-ONLY IN ITS ENTIRETY. That is why no verb carries a `dev`
#  prefix: there is no production half to distinguish it from. What this
#  repository SHIPS is the Rust engine (`engine/`) and the TypeScript SPA
#  (`frontend/src/`); everything reachable from here exists to build, check, or
#  measure those, and nothing here is packaged.
#
#  PLATFORM AGNOSTIC BY CONSTRUCTION. Every recipe body below is a single
#  command with no shell branching, no pipes, no conditionals, and no `sh`
#  versus PowerShell dialect. All of the logic - target dispatch, step
#  chaining, tool-or-Docker fallback, environment overlay - lives in the
#  stdlib-only modules under `dev/`, which therefore behave identically on
#  every platform. There is no shell script backing this file. To change what a
#  target runs, edit `dev/toolchain.py`, which is the single declarative source
#  of truth for the whole toolchain. `dev/guards` asserts both properties, so a
#  branch reintroduced here fails the build rather than quietly working on one
#  machine.
#
#  Help text is DERIVED from that same table rather than written here, so a
#  target cannot exist undocumented.
#
#  The verbs split by CONSEQUENCE, not by tool:
#
#    lint   GATES.    Read-only, and a finding fails the build.
#    fix    MUTATES.  Everything automatically repairable, in one pass.
#    audit  GATES.    A published advisory against a pinned version is a
#                     verdict, not a lead.
#    test   GATES.
#
#  NO TOOL IS MIRRORED HERE. `vaultspec-core` and `vaultspec-rag` are finished
#  products with their own CLIs and their own MCP servers; wrapping either one
#  only adds a layer that can drift out of step with it. Invoke them directly
#  (`uv run --no-sync vaultspec-core ...`) or through the MCP tools. The one
#  exception is the `vault` verb, which operates on THIS repository's own
#  `.vault/` corpus - a development action on this checkout rather than product
#  usage.
# ===========================================================================

set positional-arguments := false
set quiet := true

# just defaults to `sh -cu` on every platform, which on Windows means a Git Bash
# `sh.exe` that is only on PATH for some Git for Windows install options. This
# names the one interpreter every Windows machine is guaranteed to have. It is a
# shell DECLARATION, not platform-specific logic: because each recipe body below
# is a single command with no shell syntax, `cmd` and `sh` execute all of them
# identically, and there is no second dialect of anything to maintain.
set windows-shell := ["cmd.exe", "/c"]

# Every recipe that merely *uses* the environment goes through `uv run
# --no-sync`. Skipping the sync keeps `uv run` from re-resolving and rebuilding
# the project into `.venv`, which fails on Windows whenever a resident process
# - an MCP server, an editor, another agent's session - holds one of the
# console-script executables open. The recipes whose purpose IS to change the
# environment call `uv` directly, inside `dev/`.
dev := "uv run --no-sync python -m dev"

# List available recipes.
default:
    @just --list

# ===========================================================================
#  Bootstrap
# ===========================================================================

# The literal `uv sync` here is deliberate, and is the one recipe that does NOT
# route through `{{dev}}`: it is the only step that must work before a virtual
# environment exists, and `{{dev}}` presumes one. Every other recipe may assume
# this has run. `dev/guards` records the exemption by name, so a second
# non-dispatching recipe still fails the build.

# Provision a fresh clone or worktree: install the locked dev toolchain.
bootstrap:
    uv sync --locked --group dev

# ===========================================================================
#  Toolchain verbs
# ===========================================================================

# Manage the uv-provided dev toolchain and its lockfile.
deps target='sync':
    {{dev}} deps {{target}}

# Run gating static analysis: lints, formatting, types, tokens, and guards.
lint target='all':
    {{dev}} lint {{target}}

# Apply every available formatter and automatic fix.
fix target='all':
    {{dev}} fix {{target}}

# Audit the supply chain across Python, Rust, and Node.
audit target='all':
    {{dev}} audit {{target}}

# Run the project test suites.
test target='all':
    {{dev}} test {{target}}

# Build the project's artifacts.
build target='all':
    {{dev}} build {{target}}

# ===========================================================================
#  This checkout's own records and generated assets
# ===========================================================================

# Operate on this repository's own .vault/ development corpus.
vault target='check':
    {{dev}} vault {{target}}

# Regenerate the committed documentation assets under docs/assets/.
docs target='all':
    {{dev}} docs {{target}}

# Regenerate the DTCG colour CSS and verify no drift.
tokens:
    {{dev}} tokens

# ===========================================================================
#  Long-running surfaces
# ===========================================================================

# Start the live development survey: engine plus Vite HMR.
serve:
    {{dev}} serve

# Open the visual review desk: every surface x state x theme x viewport.
review:
    {{dev}} review

# ===========================================================================
#  Housekeeping
# ===========================================================================

# Reclaim dev artifact sprawl: engine target, dead worktrees, tmp scratch.
clean:
    {{dev}} clean

# Manage the git pre-commit hooks.
precommit target='run':
    {{dev}} precommit {{target}}

# ===========================================================================
#  Aggregate pipeline
# ===========================================================================

# This composes the gates rather than restating them, so the pipeline and the
# gates it claims to run cannot disagree. It mirrors what CI proves, so a green
# run here means what a green CI run means.

# Run the full local gate: lint, vault check, tests.
ci:
    {{dev}} ci
