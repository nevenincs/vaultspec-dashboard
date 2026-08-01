---
tags:
  - '#adr'
  - '#dev-harness-conformance'
date: '2026-07-31'
modified: '2026-07-31'
body_schema: 'body-v1'
body_hash: 'sha256:a1e8605d105771b78003ef2205a0676b82d34467cf19f1363b869a438099b7e4'
related:
  - "[[2026-07-31-dev-harness-conformance-research]]"
  - "[[2026-07-30-visual-review-harness-adr]]"
---

# `dev-harness-conformance` adr: `dev harness conformance` | (**status:** `accepted`)

## Problem Statement

This repository's development harness is a bespoke third shape, sharing neither sibling's
convention, and it is the surface every team and every agent touches daily. A decision is needed
now because three separate defects in it are converging: the dispatch indirection makes the
toolchain unstateable in one place, the dual-dialect recipe bodies make "platform-agnostic" a
claim rather than a property, and — independently — the harness cannot gate a pull request at all,
because no workflow invokes it. All three are evidenced in
`2026-07-31-dev-harness-conformance-research`.

A fourth problem is structural rather than behavioural: development tooling is spread across four
homes, only one of which has a fence. There is no place where "this is dev tooling" is decided,
and therefore no check that can tell a shipped tree from a harness tree outside the frontend.

This record settles the harness's topology, its execution model, its canonical home, and what
validates the boundary. It does not settle anything about what the toolchain RUNS — every gate,
threshold and tool in place today survives this decision unchanged.

## Considerations

- Core's model is platform-agnostic by construction rather than by branching; rag's is bound to
  one interpreter and records three failure modes caused by that binding
  (`2026-07-31-dev-harness-conformance-research`).
- Core is the newer sibling and the one this repository is being made conformant WITH; where the
  two siblings disagree, core wins.
- Core's `docs/_render/` exception establishes that the canonical `dev/` home eliminates
  comingling, not locality — an instrument stays with what roots it.
- `frontend/dev/` is rooted by four independent configurations (`vite`, `tsconfig`, `vitest`,
  `playwright`) and cannot move without rewriting all four.
- The in-flight `2026-07-30-visual-review-harness-adr` D7 already fences `frontend/dev/` and
  names `scan-domains.mjs` as the gate holding it. That fence is inherited, not revisited.
- The `no-deprecation-bridges` rule forbids shipping an alias alongside a cutover.
- `dev-workflow.md` makes the full recipe the definition of green, so any drift between the
  recipe and what CI runs is a correctness problem in the rule, not a convenience gap.
- `pyproject.toml` is a uv virtual project with no test runner configured today, so a
  guard suite is new infrastructure rather than an addition to existing infrastructure.

## Considered options

**Adopt core's model — single-command recipes over a stdlib-only Python dispatch package.**
Platform agnosticism becomes a property of the file's SHAPE rather than a claim maintained by
reviewers; the toolchain is stateable as one table; aggregates cannot drift from their members.
Costs a `uv run` hop per invocation and introduces Python as a hard prerequisite for the harness.
CHOSEN.

**Adopt rag's model — PowerShell `switch` blocks in recipe bodies.** Rejected on rag's own
evidence: it requires PowerShell plus a repo-local shim, needs a hand-written exit-code check
after every step, and has silently swallowed entire dispatch tables three times.

**Keep the current shape and only collapse the `dev` namespace.** Cheapest, and delivers the
user-visible half of the ask. Rejected because it leaves five dual-dialect recipes, eight
transcriptions of one tool-or-Docker idea, and eight hand-maintained help recipes — the shape
that produced the drift, retained.

**Replace `just` with npm scripts or a shell script suite.** Rejected without deep evaluation:
it abandons conformance with both siblings, which is the entire point of the exercise.

**Move `frontend/dev/**` into root `dev/` for one literal dev folder.** Rejected: it forces a
second `package.json`, rewrites `vite`/`vitest`/`tsconfig`/`playwright` rooting and the `@app`
alias, and contradicts the `docs/_render/` locality precedent — all to satisfy the letter of
"one folder" while making the boundary harder to check, not easier.

## Decisions

- **D1 — One verb tier. The `dev` namespace is deleted, not aliased.** The justfile is dev-only
  in its entirety, so a `dev` prefix on every recipe carries no information. Every verb becomes
  top-level and parameterised by a target: `just lint frontend`, `just test rust`, `just fix all`.
  The verb set is `deps`, `lint`, `fix`, `audit`, `test`, `build`, `docs`, `vault`, `tokens`,
  `precommit`, `serve`, `review`, `clean`, `ci`, plus the `bootstrap` entry point below. Per
  `no-deprecation-bridges` no `dev` compatibility recipe is kept; the old strings stop working
  the moment the new ones land.

  Narrowed during execution: `framework`, listed in this record's first draft on core's example,
  was NOT added. Nothing in this repository operates on the `.vaultspec/` harness through the
  toolchain, so the verb would have shipped permanently empty - a control persisting a value
  nothing reads, in the design-system rule's phrase. `docs` replaced it, owning the README asset
  renderer that D4 rehomes.

  `bootstrap` is the one recipe that does not dispatch through the harness, because it CREATES
  the virtual environment the dispatcher runs inside. `dev/guards` names it and `default` as the
  only two exemptions, so a third non-dispatching recipe fails the build rather than quietly
  becoming a step outside the table.

  Each verb's default target follows core's convention (`deps sync`, `lint all`, `fix all`,
  `audit all`, `test all`, `build all`) rather than the old shape's print-help-on-no-target.
  `just lint` now RUNS the gate instead of describing it, which is the conformant behaviour and a
  deliberate departure from the old default.

- **D2 — Platform agnosticism is a property of the recipe body, not a runtime branch.** Every
  recipe body is a SINGLE command with no pipe, conditional, chain operator, or shell builtin.
  `set shell := ["sh", "-cu"]` is removed and `set windows-shell := ["cmd.exe", "/c"]` is
  declared, naming the one interpreter every Windows machine has; because no body contains shell
  syntax, `cmd` and `sh` execute all of them identically. Every `{{ if os() == "windows" }}`
  branch is deleted, its logic absorbed into the dispatch package. This is the decision that makes
  "platform-agnostic" checkable rather than asserted, and D5 makes it checked.

- **D3 — The toolchain is one declarative table in a stdlib-only Python package at root `dev/`.**
  Mirroring core: `dev/runner.py` holds process primitives as frozen dataclasses so a step is
  DATA (`Cmd`, `ToolOrDocker`, `Echo`, `Ref`); `dev/toolchain.py` states every verb, target and
  step as one table; `dev/__main__.py` dispatches. The package imports only the standard library,
  which is what makes its behaviour identical on every platform. Aggregates (`lint all`) are
  expressed as `Ref` references to their members, never as repeated steps. Help text is DERIVED
  from the table — the eight hand-maintained `_*-help` recipes are deleted, and an undocumented
  target becomes impossible rather than merely discouraged.

- **D4 — Root `dev/` is the canonical home for the harness and for every instrument nothing else
  roots.** It absorbs the dispatch package, the guards (D5), and `scripts/render_readme_assets.py`
  (root `scripts/` is then deleted, existing solely for that file). Two trees stay where they are,
  on core's `docs/_render/` locality precedent: `frontend/dev/**`, rooted by four build
  configurations, and `engine/tests/`, rooted by cargo. `packaging/` also stays, on a different
  ground — `install.ps1` and `install.sh` are SHIPPED user-facing installers and
  `assemble-build-spec.py` is release automation, so `packaging/` is product distribution surface,
  not dev tooling, and rehoming it under `dev/` would be a fresh comingling rather than a fix.
  Instruments that grow beyond a command line live one level down (`dev/guards/`, and future
  siblings), free to depend on what they measure with precisely because they are outside the
  stdlib-only dispatch path.

- **D5 — The boundary is held by gating guards in `dev/guards`, not by convention.** A pytest
  suite, run by `just lint` and failing the build, asserting five contracts: (a) no shipped tree
  imports a dev tree, in either language, and no dev module reaches a production build input;
  (b) every justfile verb dispatches to the table and every table target is reachable from a verb,
  so the file and the toolchain cannot disagree; (c) no recipe body contains shell syntax, which
  is what keeps D2 true a year from now; (d) every dev-only dependency is declared in the `dev`
  group and nowhere else; (e) each of the three tooling homes contains only what D4 assigns it.
  The existing `scan-domains.mjs` ratchet is absorbed as the frontend-language arm of (a) rather
  than duplicated — `2026-07-30-visual-review-harness-adr` D7 stays the authority on the
  frontend fence's SUBSTANCE; this record only widens where that fence is enforced from.

- **D6 — CI invokes the harness; it never re-implements it.** Every quality workflow calls the
  same `just` verb a developer calls. This closes the six frontend gates that today run only
  locally — including `scan-domains.mjs`, the gate `production-dev-separation.md` names as
  holding the src/dev fence. A gate that CI reimplements by hand cannot be verified to match the
  gate; only invoking the same entry point can. This decision is separable from D1–D5 and would
  be worth making even if the harness shape were left alone.

- **D7 — The invocation strings are repointed at their sources, and history is left alone.** The
  four rule sources under `.vaultspec/rules/` citing `just dev …` are hand-edited and then
  regenerated into the four provider directories by `vaultspec-core sync`; generated copies are
  never edited directly. `README.md`, `typos.toml`, `engine/deny.toml`, `frontend/dev/dev-ports.ts`
  and `frontend/dev/README.md` are repointed. `.vault/` records are NOT rewritten: a record states
  what was true when it was written.

- **D8 — What the toolchain runs is out of scope.** Every gate, threshold, tool and exit-code
  policy in place today is carried across unchanged. A green run before this work and a green run
  after it must prove the same things, or the migration cannot be verified at all. Adding,
  removing or retuning a gate is a separate decision.

  Measured at execution: 22 of 25 migrated targets resolve to a byte-identical command list
  against the committed `justfile`. The three that differ are the parallel session's uncommitted
  work carried forward rather than reverted - the relocated module-size scanner path, the added
  `lint:domains` step, and the `review` recipe absent from `HEAD` entirely. Against the WORKING
  tree, which is what a developer actually ran, the correspondence is exact.

  Two deliberate exceptions, both broadening: `lint guards` is a NEW step in `lint all` (it is
  the D5 gate, which did not previously exist), and the TOML gate now passes an explicitly
  expanded file list rather than a literal `*.toml`. The expansion resolves dotfiles that the
  shell and Taplo each skipped, so `.mdformat.toml` is checked for the first time. It passes; the
  broadening is kept because silently skipping a config file is the class of gap this work exists
  to close.

## Constraints

- **A parallel session held `justfile` and `frontend/dev/**` uncommitted at the time of writing.**
  The `visual-review-harness` plan reached 33/33 with ~99 files uncommitted in the shared tree,
  including a `just dev review` recipe added to the file this record rewrites. Per
  `git-discipline-shared-tree` nothing here may be resolved by discarding it. RESOLVED at
  execution: that session moved to another lane and its uncommitted harness work was carried
  FORWARD into the new table rather than reverted to `HEAD`.
- **No test runner exists in this repository today.** `pyproject.toml` is a uv virtual project
  (`package = false`) carrying only dev tooling, with no pytest dependency and no testpaths. D5
  therefore requires standing up pytest configuration from nothing.
- **Python becomes a hard prerequisite for running any gate.** It is already pinned in
  `mise.toml` and already required by the markdown, vault and pre-commit recipes, so this
  formalises an existing dependency rather than adding one — but a contributor with only Node and
  Rust provisioned can currently run the frontend lint gate, and after this will not be able to.
- **The `uv run --no-sync` hop is unmeasured.** Core uses `--no-sync` deliberately, because a
  re-sync fails on Windows when a resident process holds a console-script executable open; that
  reasoning transfers, but the added per-invocation latency was not measured and is accepted
  unquantified.
- **D1 is a breaking change with no deprecation window.** Every muscle-memory invocation, agent
  transcript and local script using `just dev …` breaks at the cutover commit. This is the
  intended consequence of `no-deprecation-bridges`, not an oversight.
- Parent features relied on: `just` (mature, pinned in `mise.toml`), `uv` (mature, pinned),
  and `2026-07-30-visual-review-harness-adr` D7, which is landed-but-uncommitted and therefore
  the one unstable dependency.

### Discovered constraint 2026-07-31 — a single-command body cannot rely on shell name resolution

D2 removes the shell from the recipe body, and with it something the previous shape was getting
for free. Most Node and Python tools install on Windows as a `.cmd` shim - `npm` resolves to
`npm.CMD` - and `CreateProcess`, which is what a Python subprocess ultimately calls, does not
consult `PATHEXT`. The old recipes never met this because a shell (`pwsh` or `sh`) performed the
lookup before exec.

The first end-to-end run of `just lint frontend` failed with `npm not found on PATH` on a machine
where npm is plainly installed. The fix belongs exactly where this record says such logic belongs:
one `shutil.which` resolution in `dev/runner.py`, applied to every step on every platform, rather
than a Windows branch reintroduced into a recipe. It is recorded here because it is the one
non-obvious cost of D2, and because a reader who removes that resolution will reproduce the
failure on Windows only.

## Implementation

Three layers, built bottom-up so each is verifiable before the next rests on it.

The BOTTOM layer is `dev/runner.py`: process primitives as frozen dataclasses, plus the
tool-or-Docker resolution that today exists as eight shell transcriptions across five recipes,
and the `uv run --no-sync` helper. It imports only the standard library. Nothing above it
re-implements process execution.

The MIDDLE layer is `dev/toolchain.py`, one table mapping every verb to its targets and every
target to its ordered steps, with aggregates as references to their members. This is the single
source of truth for what the toolchain does; `dev/__main__.py` walks it, resolves references,
runs steps and derives help output from the same structure the dispatcher uses, so an
undocumented target is unrepresentable.

The TOP layer is the justfile: one recipe per verb, each a single `{{dev}} <verb> {{target}}`
line with a doc comment, plus `set windows-shell := ["cmd.exe", "/c"]` and a `default` recipe
that lists. It should read as a table of contents and contain no logic whatsoever.

Beside these, `dev/guards/` holds the five contracts of D5 as a pytest suite, with the pytest
configuration and dev-group dependency it needs; the guard that parses the justfile for shell
syntax is the one that keeps D2 from decaying. `scripts/render_readme_assets.py` moves under
`dev/`, and root `scripts/` is deleted.

The cutover then repoints consumers in one pass: the four `.vaultspec/rules/` sources followed by
`vaultspec-core sync`, the five non-rule citations, and the CI workflows, which stop listing npm
scripts and start calling `just` verbs (D6). The migration is verified by running the OLD verb
set and the NEW verb set and requiring identical outcomes (D8) — the only check that proves the
refactor changed the harness's shape and not its behaviour.

## Rationale

Core's model wins on a knockout criterion, not a balance of preferences: it is the only option in
which platform agnosticism is CHECKABLE. Under every other shape, "works on Windows and Linux" is
a property of prose in five branching recipes that a reviewer must re-verify by inspection each
time one changes. Under D2+D3 it is a property of the file's syntax, and D5(c) makes a machine
assert it. The research finding that decides this is rag's: three separate incidents where logic
embedded in a shell body silently disabled entire dispatch tables, each recorded as a comment
warning the next author rather than as a fix — the signature of a shape that cannot be made safe,
only navigated carefully.

The secondary criterion is drift. This repository already carries eight hand-maintained help
recipes that nothing validates and eight transcriptions of one tool-or-Docker idea; the sibling
repository that solved this expresses aggregates as references specifically so a target and its
use in an aggregate cannot disagree. Stating the toolchain once is what makes the difference, and
only the table shape does that.

On scope, `frontend/dev/` staying put follows core's own `docs/_render/` carve-out rather than
contradicting the conformance goal: the sibling being conformed WITH does not centralise for its
own sake, and the research shows moving it would trade a checkable boundary for a literal one.

D6 is included despite being separable because the research established that the fence
`2026-07-30-visual-review-harness-adr` D7 depends on is among the six gates CI never runs. Landing
a stronger harness that CI still bypasses would leave the project's most-cited rule
(`dev-workflow.md`'s definition of green) unenforceable — a documented gate that no automation
applies is the exact failure the `checks-that-pass-while-proving-nothing` pattern names.

## Consequences

The harness becomes stateable: one table answers "what does the gate run", and a reader no longer
reconstructs it from fourteen `{{ if }}` chains. Adding a target becomes a table entry rather than
three coordinated edits across a dispatcher, an internal recipe and a help string. Windows and
Linux stop being separate maintenance surfaces. CI and local development converge on one entry
point, so "green" means one thing.

The honest costs. Python becomes mandatory to run any gate, narrowing who can contribute without
a full toolchain provision. Every `just dev …` invocation breaks at once, with no deprecation
window, which will strand agent transcripts and local aliases until they are updated. The
guard suite is new infrastructure in a repository with no test runner, and is the most likely part
of this work to be under-scoped. And the indirection does not vanish so much as move: a
contributor debugging a failing gate now reads Python instead of a recipe, which is better for
logic and worse for the trivial case of "what command actually ran" — mitigated only by the
runner echoing each command before executing it, which is therefore not optional.

One pitfall deserves naming. D8 forbids changing what the toolchain runs, but D6 will cause six
frontend gates to execute in CI for the first time. Those gates are green locally and are expected
to stay green, but if any of them fails on a CI runner, the correct reading is that CI has started
checking something it never checked — not that the migration broke it. Conflating the two would
invite "fixing" the migration by weakening the gate, which is how a check that proves nothing gets
born.

The pathway this opens is a shared harness vocabulary across all three repositories: a contributor
or agent who knows `just lint` in core knows it here, and a future instrument (a health report, a
complexity census, a binaries build) has an obvious home and an established pattern rather than a
new bespoke recipe.
