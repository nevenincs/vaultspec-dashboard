---
tags:
  - '#plan'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-06-15'
tier: L2
related:
  - '[[2026-06-14-dashboard-code-tree-adr]]'
  - '[[2026-06-14-dashboard-left-rail-research]]'
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
     Replace dashboard-code-tree with a kebab-case feature tag, e.g. #foo-bar.
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

# `dashboard-code-tree` plan

### Phase `P01` - Backend listing endpoint

Add a read-only GET /file-tree endpoint returning one directory level at a time over the active scope: metadata only (no file bytes), repository-ignore-aware, hard-capped and cursor-paginated, carrying the tiers block and degrading honestly on a remote-ref or structural-absent scope. Mirrors the /vault-tree shape with directory nesting.


<!-- One-line headline summary plan. -->

- [x] `P01.S01` - Add the read-only GET /file-tree?scope=&path=&cursor= route returning one directory level beside the vault-tree handler; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `P01.S02` - Return per child the repo-relative path, kind dir or file, has_children hint, and code:<path> node id, metadata only with no bytes; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `P01.S03` - Honor repository ignore rules via the gix machinery to exclude .git, build output, and vendored trees; `engine/crates/ingest-git/`.
- [x] `P01.S04` - Hard-cap each level, cursor-paginate a pathological directory, and emit a truncated-style honesty marker; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `P01.S05` - Degrade honestly for a remote-ref scope or absent structural tier while carrying the tiers block; `engine/crates/vaultspec-api/src/routes/query.rs`.

### Phase `P02` - Interlink and contract

Derive the code:<path> node id through the shared node_id rule (no private convention) so a file row joins the graph, define the wire contract types, and mirror the shape in the frontend mock.

- [x] `P02.S06` - Derive code:<path> through the shared node_id rule with no private convention; `engine/crates/engine-model/src/`.
- [x] `P02.S07` - Define the file-tree response wire contract types; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `P02.S08` - Mirror the /file-tree response shape in the frontend mock fixtures; `frontend/src/stores/server/`.

### Phase `P03` - Frontend code mode

Render the /file-tree projection as a lazy, collapsible directory hierarchy (Lucide chevrons, Phosphor file/dir marks passing the 14px grayscale gate, monospace path identity), with a bidirectional selection join to code: stage nodes mirroring the vault browser's doc:<stem> join, per-scope caching, and a quiet absent-interlink state for unindexed files. The vault/code mode toggle itself is owned by the left-rail IA plan.

- [x] `P03.S09` - Add a stores query hook for /file-tree with lazy per-directory fetch and per-scope cache; `frontend/src/stores/server/`.
- [x] `P03.S10` - Author the code-mode view rendering the directory hierarchy as lazy collapsible disclosure rows with Lucide chevrons and Phosphor file marks; `frontend/src/app/left/CodeTree.tsx`.
- [x] `P03.S11` - Join code-row selection bidirectionally to code: stage nodes mirroring the doc:<stem> join; `frontend/src/app/left/browserSelection.ts`.
- [x] `P03.S12` - Render a quiet absent-interlink state for files with no graph node; `frontend/src/app/left/CodeTree.tsx`.

### Phase `P04` - Verification

Verify: bounded reads truncate and paginate honestly, gitignore exclusion and worktree-only degradation hold, the selection join works both directions, the four honest states render, and the feature-scoped lint, test, and vault-check gates pass.

- [x] `P04.S13` - Prove bounded reads: a capped directory level truncates honestly and cursor-paginates; `engine/crates/vaultspec-api/tests/`.
- [x] `P04.S14` - Prove gitignore exclusion and worktree-only honest degradation; `engine/crates/vaultspec-api/tests/`.
- [x] `P04.S15` - Test the code-mode selection join both directions and the four honest states; `frontend/src/app/left/`.
- [x] `P04.S16` - Run the feature-scoped lint, test, and vault-check gates to green; `engine/crates/vaultspec-api/`.

## Description

<!-- Briefly describe the proposed work. Reference `{adr}`s,
`{research}`, `{reference}`. Supporting documentation must be read prior to
writing the plan document. -->

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

<!-- State which Steps, Phases, or Waves can be executed in parallel and
which carry hard ordering. At `L1` and `L2`, parallelism is decided
per-Step or per-Phase. At `L3` and `L4`, Waves are sequenced by
default (one Wave must land before the next can begin); Phases
within a single Wave may be parallelized when they share no hard
interdependency. -->

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
