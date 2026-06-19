---
tags:
  - '#plan'
  - '#relative-units-migration'
date: '2026-06-19'
modified: '2026-06-19'
tier: L2
related:
  - '[[2026-06-19-relative-units-migration-adr]]'
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
     Replace relative-units-migration with a kebab-case feature tag, e.g. #foo-bar.
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

# `relative-units-migration` plan

### Phase `P01` - structural guard

Land a px-scan CI gate in the frontend lint recipe so the no-px mandate is enforceable and regression-proof while the migration lands incrementally behind a shrinking allowlist.


Migrate all hardcoded px in the frontend DOM CSS and styling to relative units (rem/em), behind a structural px-scan guard, surface by surface; scene/canvas deferred.

- [x] `P01.S01` - Add a px-scan gate script that fails on hardcoded px in app CSS and tsx Tailwind arbitrary values, path-scoped to exclude the scene layer, tests, and the managed token region; `frontend/scripts/scan-px.mjs`.
- [x] `P01.S02` - Wire the px-scan gate into the frontend lint recipe with a seeded shrinking allowlist of known-pending files; `frontend/package.json`.

### Phase `P02` - token reconciliation

Map off-scale inline px to the existing rem DTCG scale and close genuine gaps by adding tokens to the DTCG sources (regenerated, Figma kept binding).

- [x] `P02.S03` - Audit every off-scale inline px value and map each to the nearest rem DTCG token, recording genuine scale gaps; `frontend/tokens`.
- [x] `P02.S04` - Add the missing spacing/type tokens to the DTCG sources, regenerate the styles.css managed region and Tailwind registration, and mirror to the Figma bridge; `frontend/tokens/spacing.tokens.json`.

### Phase `P03` - kit primitives conversion

Convert the shared kit components' hardcoded px to rem token utilities or rem arbitrary values.

- [x] `P03.S05` - Convert hardcoded px to rem token utilities; `frontend/src/app/kit/DocRow.tsx`.
- [x] `P03.S06` - Convert hardcoded px to rem token utilities; `frontend/src/app/kit/FacetRow.tsx`.
- [x] `P03.S07` - Convert hardcoded px to rem token utilities; `frontend/src/app/kit/SearchField.tsx`.
- [x] `P03.S08` - Convert hardcoded px to rem token utilities; `frontend/src/app/kit/SectionLabel.tsx`.
- [x] `P03.S09` - Convert hardcoded px to rem token utilities; `frontend/src/app/kit/Switch.tsx`.
- [x] `P03.S10` - Convert hardcoded px to rem token utilities; `frontend/src/app/kit/TreeRow.tsx`.

### Phase `P04` - left rail conversion

Convert the left-rail surfaces' hardcoded px to rem.

- [x] `P04.S11` - Convert hardcoded px to rem token utilities; `frontend/src/app/left/TreeBrowser.tsx`.
- [x] `P04.S12` - Convert hardcoded px to rem token utilities; `frontend/src/app/left/LeftRail.tsx`.
- [x] `P04.S13` - Convert hardcoded px to rem token utilities; `frontend/src/app/left/CodeTree.tsx`.
- [x] `P04.S14` - Convert hardcoded px to rem token utilities; `frontend/src/app/left/BrowserRegion.tsx`.

### Phase `P05` - timeline conversion

Convert the timeline surfaces' hardcoded px to rem, distinguishing layout sizing (migrate) from canvas/scroll math (leave).

- [x] `P05.S15` - Convert layout-sizing px to rem, leaving canvas/scroll math; `frontend/src/app/timeline/TimelineControls.tsx`.
- [x] `P05.S16` - Convert layout-sizing px to rem, leaving canvas/scroll math; `frontend/src/app/timeline/Timeline.tsx`.
- [x] `P05.S17` - Convert layout-sizing px to rem, leaving canvas/scroll math; `frontend/src/app/timeline/Minimap.tsx`.

### Phase `P06` - viewer and shell conversion

Convert the viewer and shell chrome surfaces' hardcoded px to rem.

- [x] `P06.S18` - Convert hardcoded px to rem token utilities; `frontend/src/app/viewer/MarkdownReader.tsx`.
- [x] `P06.S19` - Convert hardcoded px to rem token utilities; `frontend/src/app/shell/IconRail.tsx`.

### Phase `P07` - stage filters and dev harnesses

Convert the stage filter menu and the visual dev-harness entry points' hardcoded px to rem.

- [x] `P07.S20` - Convert hardcoded px to rem token utilities; `frontend/src/app/stage/FilterMenu.tsx`.
- [x] `P07.S21` - Convert hardcoded px to rem in the viewer visual dev harness; `frontend/src/viewer-visual/main.tsx`.
- [x] `P07.S22` - Convert hardcoded px to rem in the filters visual dev harness; `frontend/src/filters-visual/main.tsx`.
- [x] `P07.S23` - Convert hardcoded px to rem in the status visual dev harness; `frontend/src/status-visual/main.tsx`.
- [x] `P07.S24` - Convert hardcoded px to rem in the crash injector overlay; `frontend/src/platform/errors/CrashInjector.tsx`.
- [x] `P07.S29` - Convert hardcoded px to rem token utilities; `frontend/src/app/stage/FilterSidebar.tsx`.

### Phase `P08` - app stylesheet literals

Convert the hand-authored literals in the app stylesheet (borders, shadows, letter-spacing, radius, dockview vars) to rem/em, leaving the CLI-managed token region untouched.

- [x] `P08.S25` - Convert hand-authored literals (borders to 0.0625rem, shadow geometry to rem, letter-spacing to em, radius literals, dockview vars) outside the managed token region; `frontend/src/styles.css`.

### Phase `P09` - final gate and close

Empty the allowlist, run the full frontend lint gate green, verify visual parity per surface, and confirm the token drift gate.

- [ ] `P09.S26` - Empty the px-scan allowlist and run the full frontend lint gate to exit 0; `frontend/package.json`.
- [ ] `P09.S27` - Verify visual parity per converted surface against the binding Figma nodes; `frontend/src/app`.
- [ ] `P09.S28` - Confirm the token drift gate passes and close the vault feature records; `frontend/tokens`.

## Description

Eliminate every hardcoded pixel value from the frontend's DOM CSS and styling and
migrate it to relative units (rem at the 16px basis, em for font-relative metrics),
per the accepted ADR. The foundation token families are already rem; this plan drives
the remaining inline px in the implementation onto that scale and makes the constraint
structural. Phase `P01` lands the px-scan guard first so the mandate is enforceable;
`P02` reconciles off-scale values against the DTCG scale and adds tokens for genuine
gaps (Figma kept binding); `P03`-`P08` convert each DOM surface and the app stylesheet
in turn behind a shrinking allowlist; `P09` empties the allowlist, runs the full lint
gate green, and verifies visual parity. The WebGL scene/canvas layer is deferred (rem
is undefined in render space; the live graph is mid-migration to three.js by a parallel
team) and is out of this plan's scope. See the relative-units-migration ADR and
research in the related frontmatter.

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

`P01` (guard) and `P02` (token reconciliation) carry hard ordering and must land
first: the guard makes every later phase verifiable, and the token gaps must exist
before surfaces snap onto them. Once `P02` is closed, the conversion phases
`P03`-`P08` are mutually independent (each touches a disjoint set of files) and may be
executed in parallel. `P09` (final gate) depends on all conversion phases being
closed. The scene layer is deferred and excluded; conversion phases must not edit
`frontend/src/scene/` to avoid contending the parallel three.js migration.

## Verification

The plan succeeds when:

- The px-scan gate runs in `just dev lint frontend` with an empty allowlist and exits 0
  (no hardcoded px in app CSS or `*.tsx` arbitrary values outside the sanctioned
  scene/test/managed-token exceptions).
- The full frontend lint gate (eslint + prettier + tsc) exits 0, per the
  declaring-green discipline.
- The Style Dictionary token drift gate passes (any added DTCG tokens are regenerated,
  not hand-edited between the managed markers).
- Each converted surface is visually verified against its binding Figma node (no
  unintended drift from snapping off-scale values).
- The vault validates clean and every Step is closed.

The scene/canvas UI-scaling feature is explicitly out of scope and tracked as deferred
follow-on work, not a completion criterion here.
