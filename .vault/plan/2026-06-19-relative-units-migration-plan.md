---
tags:
  - '#plan'
  - '#relative-units-migration'
date: '2026-06-19'
modified: '2026-07-12'
tier: L2
related:
  - '[[2026-06-19-relative-units-migration-adr]]'
  - '[[2026-06-19-relative-units-migration-research]]'
---
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

- [x] `P09.S26` - Empty the px-scan allowlist and run the full frontend lint gate to exit 0; `frontend/package.json`.
- [x] `P09.S27` - Verify visual parity per converted surface against the binding Figma nodes; `frontend/src/app`.
- [x] `P09.S28` - Confirm the token drift gate passes and close the vault feature records; `frontend/tokens`.

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
