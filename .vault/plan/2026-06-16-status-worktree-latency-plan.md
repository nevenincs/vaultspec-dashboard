---
tags:
  - '#plan'
  - '#status-worktree-latency'
date: '2026-06-16'
modified: '2026-06-16'
tier: L2
related:
  - '[[2026-06-16-status-worktree-latency-adr]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #plan) and one feature tag.
     Replace status-worktree-latency with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     tier is mandatory for new plans. Allowed: L1, L2, L3, L4.
     L1 = Steps only. L2 = Phases above Steps. L3 = Waves above
     Phases above Steps. L4 = Epic above Waves above Phases above
     Steps; PM association required. Pre-existing plans without this
     field default to L2.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'. The related field
     carries the AUTHORIZING documents (ADR, research, reference, prior
     plan) for every Step in this plan; Steps inherit this chain;
     per-row reference footers do not exist.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->


<!-- HIERARCHY AND TIERS:
     Epic > Wave > Phase > Step. Step is the canonical leaf-row
     noun. Execution Record artifact: <Step Record>.
     Tier is declared in frontmatter as tier: L1/L2/L3/L4
     (mandatory for new plans; pre-existing plans without the
     field default to L2 and the writer adds the field on first
     edit). The tier selects containers:
       L1 = Steps only.
       L2 = Phases above Steps.
       L3 = Waves above Phases above Steps.
       L4 = Epic above Waves above Phases above Steps; MUST declare
            a project-management association in the Epic intent
            block prose.
     Selection is by complexity criteria, not container counting.
     Writer never invents containers to qualify a tier. -->

<!-- IDENTIFIERS AND ROW CONTRACT:
     S##, P##, W## are flat, per-document, append-only, immutable.
     Promotion adds containers without renumbering. Gaps are not
     reused.
     Display paths are computed from current grouping:
       Step path:    L1 S##   L2 P##.S##   L3/L4 W##.P##.S##
       Phase heading:        L2 P##       L3/L4 W##.P##
       Wave heading:                      L3/L4 W##
     Row format:
       - [ ] `<display-path>` - imperative-verb action; `path/to/file`.
     Two-state checkboxes only ([ ] open, [x] closed). No per-row
     reference footers; wiki-links and markdown links are forbidden
     in plan body. Authorizing documents go in the plan's `related:`
     frontmatter once.
     ASCII spaced hyphens everywhere; em-dash (U+2014) and en-dash
     (U+2013) are forbidden. Step rows within a Phase are
     contiguous. -->

<!-- NO COMPRESSION:
     N self-similar actions = N rows. Never collapse into "for each
     X, do Y" / "across all callers, do Z" / "in every module,
     replace W". The rule applies at every tier including L1. -->

<!-- VAULTSPEC-CORE VAULT PLAN CLI:
     The `vaultspec-core vault plan` CLI is the canonical surface for
     structural manipulation of this plan document. Writers and
     executors MUST use `vaultspec-core vault plan step add/insert/move/
     remove/check/uncheck/toggle/edit`,
     `vaultspec-core vault plan phase add/move/remove/edit`,
     `vaultspec-core vault plan wave add/move/remove/edit`,
     `vaultspec-core vault plan epic intent`, and
     `vaultspec-core vault plan tier promote/demote` for every
     identifier-affecting change rather than hand-editing the row
     grammar. Hand edits are tolerated by the parser but flagged by
     `vaultspec-core vault plan check`; canonical-identifier preservation is
     guaranteed only when the CLI performs the mutation. Run
     `vaultspec-core vault plan --help` for the full subcommand
     surface. -->

# `status-worktree-latency` plan

### Phase `P01` - ingest-git: targeted inspect + parallel enumerate

Add a single-worktree inspect path and parallelize the all-worktree enumeration in the ingest-git worktrees module, preserving the WorktreeInfo contract and the B5b status-thread bound.


<!-- One-line headline summary plan. -->

- [x] `P01.S01` - Add a public inspect_one(workspace, path) that resolves and inspects only the worktree matching path; `engine/crates/ingest-git/src/worktrees.rs`.
- [x] `P01.S02` - Split enumerate into cheap descriptor collection then a bounded concurrent inspect fan-out, preserving the per-status thread bound; `engine/crates/ingest-git/src/worktrees.rs`.
- [x] `P01.S03` - Add unit tests for inspect_one selection/None and parallel enumerate parity with the prior serial set; `engine/crates/ingest-git/src/worktrees.rs`.

### Phase `P02` - wire enumerate-then-find-one callers to the targeted path

Switch the /status route and the CLI status command from enumerate().find(...) to the targeted single-worktree inspect so they stop paying for other worktrees.

- [x] `P02.S04` - Switch the /status handler to inspect_one for the served worktree; `engine/crates/vaultspec-api/src/routes/stream.rs`.
- [x] `P02.S05` - Switch the CLI status command to inspect_one; `engine/crates/vaultspec-cli/src/cmd/status.rs`.

### Phase `P03` - verify, measure, and review

Run the full engine gate, confirm /status latency no longer scales with worktree count, and pass code review.

- [x] `P03.S06` - Run the full engine gate (cargo fmt --check + clippy + tests) to exit 0; `engine/`.
- [x] `P03.S07` - Measure /status on a multi-worktree workspace and confirm latency no longer scales with worktree count; `engine/crates/vaultspec-api/src/routes/stream.rs`.
- [x] `P03.S08` - Code-review the change for correctness, bounded fan-out, and WorktreeInfo parity; `engine/crates/ingest-git/src/worktrees.rs`.

## Description

Remove the worktree-count-scaling latency from the `/status` front door. The
authorizing ADR establishes two complementary changes: a targeted
single-worktree inspect so `/status` (and the CLI `status` command) stop
enumerating every worktree to keep one, and a bounded concurrent fan-out for the
genuine all-worktree list consumers (`/map`, registry). The work is confined to
the ingest-git `worktrees` module and its two enumerate-then-find-one callers; it
changes no wire shape and stays CPU-bound within the existing B5b status-thread
bound. Grounded in the research findings F1-F4 and the ADR's accepted decision.

## Steps

<!-- The plan's tier (declared in frontmatter as `tier: L1`, `L2`, `L3`, or
`L4`) determines the structure under this section:

- `L1`: a flat list of Step rows (no Phase, Wave, or Epic).
- `L2`: one or more `### Phase` blocks each containing Step rows.
- `L3`: one or more `## Wave` blocks each containing Phase blocks.
- `L4`: a `## Epic intent` block, followed by Wave blocks. -->

<!-- Replace this scaffold with the tier-appropriate structure for your plan.
Format examples for each block type are embedded below as commented
templates. -->

<!-- IMPORTANT: This document must be updated between execution runs to
     track progress. -->

<!-- PHASE BLOCK FORMAT (L2, L3, L4):
     ### Phase `P02` - rewrite the writer-agent contract

     One sentence stating what this Phase delivers.

     - [ ] `P02.S01` - imperative-verb action; `path/to/file`.
     - [ ] `P02.S02` - imperative-verb action; `path/to/file`.

     At L3/L4 the Phase heading uses the ancestor-aware path
     (### Phase `W01.P02` - ...). The intent sentence is mandatory. -->

<!-- WAVE BLOCK FORMAT (L3, L4):
     ## Wave `W01` - language-only convention rollout

     One paragraph stating what this Wave delivers, which downstream
     Wave depends on it, and which authorizing documents back it.

     ### Phase `W01.P01` - ...
     ### Phase `W01.P02` - ...

     The Wave intent paragraph is mandatory. -->

<!-- EPIC INTENT BLOCK FORMAT (L4 only):
     ## Epic intent

     One paragraph stating the strategic goal, the external project-
     management association (milestone name, project board identifier,
     roadmap entry), the timeline horizon, and the teams or agents
     involved.

     ## Wave `W01` - ...
     ## Wave `W02` - ...

     The ## Epic intent block is mandatory at L4 and absent at L1, L2,
     L3. The plan title (the level-one # heading at the top of the
     document) is the Epic title; no separate Epic heading is emitted. -->

## Parallelization

P01 is the foundation and must land first: P02 depends on `inspect_one` existing,
and P03 verifies the whole. Within P01, S01 (inspect_one) and S02 (parallel
enumerate) are independent and may be done in either order; S03 (tests) follows
both. P02's two steps are independent of each other. P03 is strictly last.

## Verification

<!-- State the mission success criteria for this plan. Each criterion
should be a verifiable check (test passes, surface conforms,
reviewer signs off) rather than a free-form assertion.

The plan is complete when every Step in the plan is closed
(`- [x]`). At `L4`, the Epic-completion check additionally requires
the declared project-management association to report the Epic
complete.

For tier-specific verification cadence, see the authorizing
documents linked in the `related:` frontmatter. -->

The plan succeeds when:

- The full engine gate (`cargo fmt --check`, `clippy`, tests) exits 0, including
  new tests for `inspect_one` selection/None and parallel-`enumerate` parity.
- `worktrees::enumerate` returns the identical `WorktreeInfo` set as the prior
  serial implementation (parity test), with the per-status thread bound intact.
- `/status` and the CLI `status` command use the single-worktree path and return
  the same git block as before for the served worktree.
- `/status` latency is measured flat across worktree count (no longer ~5s on a
  multi-worktree workspace).
- Code review signs off on correctness, bounded fan-out, and contract parity.
