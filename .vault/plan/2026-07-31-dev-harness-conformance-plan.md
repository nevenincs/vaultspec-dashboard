---
tags:
  - '#plan'
  - '#dev-harness-conformance'
date: '2026-07-31'
modified: '2026-07-31'
body_hash: 'sha256:65d3c8683f150d3e06c9109c7373317477e68fdd5b354d21711ae792abfea7b6'
tier: L2
related:
  - '[[2026-07-31-dev-harness-conformance-adr]]'
  - '[[2026-07-31-dev-harness-conformance-research]]'
---

# `dev-harness-conformance` plan

### Phase `P01` - Dispatch core

Build the stdlib-only dev/ package bottom-up (runner primitives, declarative toolchain table, dispatcher) alongside the existing justfile, so every layer is verifiable before anything depends on it. Nothing user-facing changes in this phase.

- [x] `P01.S01` - Author the process primitives as frozen dataclasses (command, tool-or-docker, echo, reference) plus the uv-run helper, importing only the standard library; `dev/__init__.py, dev/runner.py`.
- [x] `P01.S02` - State every current verb, target and step as one declarative table, expressing aggregates as references to their members rather than as repeated steps; `dev/toolchain.py`.
- [x] `P01.S03` - Author the dispatcher that walks the table, resolves references, echoes each command before running it, and derives help output from the same structure it dispatches on; `dev/__main__.py`.
- [x] `P01.S04` - Prove every target runs from the module entry point directly, before any recipe depends on the package; `dev/`.

### Phase `P02` - Justfile cutover

Collapse the dev namespace to one verb tier and reduce every recipe body to a single command, deleting the fourteen if-dispatch chains, the five os-branching recipes and the eight hand-maintained help recipes (ADR D1, D2, D3).

- [x] `P02.S05` - Rewrite the justfile as one single-command recipe per top-level verb with a doc comment each, deleting the dev namespace and the fourteen string-building dispatch chains; `justfile`.
- [x] `P02.S06` - Delete the five platform-branching recipe bodies and declare the single Windows interpreter, absorbing the tool-or-docker fallback into the runner; `justfile, dev/runner.py`.
- [x] `P02.S07` - Delete the eight hand-maintained help recipes and route the bare invocation to the derived listing; `justfile`.

### Phase `P03` - Canonical dev home

Rehome the instruments nothing else roots into dev/ and delete the directories that existed only to hold them, leaving frontend/dev, engine/tests and packaging where their own build roots them (ADR D4).

- [x] `P03.S08` - Move the readme-asset renderer under the canonical dev home and delete the root scripts directory that existed only to hold it; `dev/, scripts/`.
- [x] `P03.S09` - Repoint the readme-asset target and every caller at the rehomed module; `dev/toolchain.py, frontend/package.json`.

### Phase `P04` - Architectural guards

Stand up pytest from nothing and author the five gating contracts in dev/guards that hold the src, dev and harness boundary mechanically rather than by convention (ADR D5).

- [x] `P04.S10` - Add pytest and its configuration to the dev dependency group and the project manifest, standing up a test runner this repository does not currently have; `pyproject.toml`.
- [x] `P04.S11` - Author the import-fence guard asserting no shipped tree imports a dev tree in either language and no dev module reaches a production build input, absorbing the existing frontend domain scanner as its frontend arm rather than duplicating it; `dev/guards/, frontend/dev/tooling/scan-domains.mjs`.
- [x] `P04.S12` - Author the dispatch-conformance guard asserting every justfile verb reaches the table and every table target is reachable from a verb, so the file and the toolchain cannot disagree; `dev/guards/`.
- [x] `P04.S13` - Author the no-shell-syntax guard that parses every recipe body and rejects a pipe, conditional, chain operator or shell builtin, which is what keeps the platform-agnostic property from decaying; `dev/guards/`.
- [x] `P04.S14` - Author the dependency-declaration guard asserting every dev-only dependency is declared in the dev group and nowhere else; `dev/guards/, pyproject.toml`.
- [x] `P04.S15` - Author the tooling-home guard asserting each sanctioned tooling home contains only what the decision record assigns it; `dev/guards/`.
- [x] `P04.S16` - Wire the guard suite into the lint verb so a boundary violation fails the build rather than reporting; `dev/toolchain.py`.

### Phase `P05` - Consumer repoint

Repoint every live citation of the old invocation strings at its source, syncing the rule corpus through the owning verb, and deliberately leave .vault history alone (ADR D7).

- [x] `P05.S17` - Repoint the four rule sources at the new invocation strings and regenerate the four provider directories through the owning sync verb, never editing a generated copy; `.vaultspec/rules/`.
- [x] `P05.S18` - Repoint the five live non-rule citations and leave every vault record stating what was true when it was written; `README.md, typos.toml, engine/deny.toml, frontend/dev/`.

### Phase `P06` - CI invokes the harness

Replace every hand-reimplemented gate step in the workflows with a call to the same just verb a developer runs, closing the six frontend gates that today never run on a pull request (ADR D6).

- [x] `P06.S19` - Replace the hand-listed gate steps with calls to the same verbs a developer runs, provisioning the task runner and the Python environment on the runner; `.github/workflows/quality-gates.yml`.
- [ ] `P06.S20` - Confirm the six frontend gates that never ran on a pull request pass on a runner, treating any failure as a check that started working rather than as a reason to weaken it; `.github/workflows/`.
- [ ] `P06.S21` - Repoint any remaining workflow step that reimplements a harness step by hand; `.github/workflows/`.

### Phase `P07` - Equivalence proof and closeout

Prove the migration changed the harness shape and not its behaviour by running the old and new verb sets to identical outcomes, then route to review (ADR D8).

- [x] `P07.S22` - Run the old verb set against the pre-cutover commit and the new verb set against the cutover, and require identical outcomes target by target; `justfile, dev/`.
- [ ] `P07.S23` - Run the full lint gate and the touched-scope test suites and confirm exit zero; `repository`.
- [ ] `P07.S24` - Route the campaign to code review and record the audit; `.vault/audit/`.

## Description

Execute `2026-07-31-dev-harness-conformance-adr` in full, grounded in
`2026-07-31-dev-harness-conformance-research`. One ADR governs every Phase, so there is no
per-Phase ADR split.

The work makes this repository's development harness conformant with `vaultspec-core`'s: one tier
of top-level verbs, every recipe body a single command, and the whole toolchain stated as one
declarative table in a stdlib-only Python package at root `dev/`. It rehomes the instruments
nothing else roots into that package, replaces convention with five gating guards over the
src / dev / harness boundary, and puts CI on the same entry point a developer uses.

What the toolchain RUNS is deliberately unchanged (ADR D8). Every gate, threshold and tool in
place today is carried across as-is, because a migration that alters behaviour and shape at once
cannot be verified to have preserved either.

Phases build bottom-up so each is verifiable before the next rests on it: the dispatch core (P01)
is proven runnable from its own module entry point before the justfile depends on it (P02), the
canonical home settles (P03) before the guards that police it are authored (P04), and the
consumer repoint (P05) precedes CI adopting the new entry point (P06).

**Execution is blocked.** At authoring time a parallel session held `justfile` and
`frontend/dev/**` uncommitted in this shared tree, including a `just dev review` recipe added to
the very file P02 rewrites. P01 may proceed (it adds new files only), but P02 onward must wait
for that work to land. Per `git-discipline-shared-tree` no step here is unblocked by discarding
another session's work.

## Steps

## Parallelization

Mostly sequential by construction — each Phase consumes what the previous one produced.

P01's four Steps are strictly ordered: the table (S02) needs the primitives (S01), the dispatcher
(S03) needs the table, and S04 proves all three. P02 is ordered within itself and cannot start
until P01.S04 passes.

The one genuine fan-out is P04.S11 through P04.S15 — the five guards are independent of each
other once S10 has stood up pytest, and can be authored in parallel. S16 is their barrier.

P05.S17 and P05.S18 are independent of each other and may run in parallel, but both must follow
P02 (the strings they point at do not exist until the cutover lands) and S17 must route through
the owning sync verb rather than editing a generated copy.

P06 must follow P05 and P03. P07 is the closing barrier over everything.

No Step in this plan may be run concurrently with another session editing `justfile`,
`frontend/dev/**`, or `pyproject.toml`.

## Verification

The plan's central proof is EQUIVALENCE, not greenness (P07.S22): the old verb set run against
the pre-cutover commit and the new verb set run against the cutover must produce identical
outcomes target by target. A green new gate proves nothing on its own — it must be green over the
same checks.

Per `dev-workflow.md`, declaring any Phase green requires the FULL lint gate for the touched
language at exit 0, plus the touched-scope test suites — the lint gate never invokes the test
runners. That applies to the new guard suite too from P04 onward.

Phase-specific proofs:

- **P01** — every target runs from `python -m dev` directly, with no justfile involved (S04).
- **P02** — every verb resolves and runs on both a POSIX and a Windows shell, with no recipe body
  containing shell syntax. P04.S13 later makes this assertion permanent.
- **P03** — the readme-asset renderer runs from its new home and root `scripts/` no longer exists.
- **P04** — each guard is proven to FAIL on a deliberately introduced violation before it is
  accepted. A guard that has never gone red is not evidence it can. This is the phase most at risk
  of shipping a check that passes while proving nothing.
- **P05** — the rule corpus regenerates through the sync verb with no generated copy hand-edited,
  and no live citation of a retired invocation string remains outside `.vault/`.
- **P06** — a pull request exercises all ten frontend gates, not the previous three. Any failure
  among the six newly-executing gates is reported as a check that started working, and is fixed at
  the finding rather than by weakening the gate (ADR D8 pitfall).
- **P07** — the equivalence run (S22), a clean full gate (S23), and a code review recorded as an
  audit (S24).

Because this work rewrites the gate itself, every green reported during execution must name the
commit it ran against — a local green in this shared tree describes a tree nobody else has.
