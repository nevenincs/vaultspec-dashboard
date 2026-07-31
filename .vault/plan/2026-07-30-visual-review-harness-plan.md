---
tags:
  - '#plan'
  - '#visual-review-harness'
date: '2026-07-30'
modified: '2026-07-31'
body_hash: 'sha256:b01529f0626a3b55e8d77f3524057e943990223bfd60fe17cb78fe5e6151f288'
tier: L2
related:
  - '[[2026-07-30-visual-review-harness-adr]]'
  - '[[2026-07-30-visual-review-harness-research]]'
  - '[[2026-06-25-state-mode-uniformity-adr]]'
  - '[[2026-06-15-figma-design-bridge-adr]]'
---

# `visual-review-harness` plan

### Phase `P01` - Dev domain and harness core

Stand up the fenced dev domain and the iframe matrix harness per ADR D6 and D7, with the axis module, specimen descriptor, registry, frame and shell, and every kit primitive enrolled.

- [x] `P01.S01` - Create the frontend/dev domain root and a dev-only Vite config rooted there, binding a new strict-port gallery entry added to dev-ports.ts; `frontend/dev/, frontend/vite.dev.config.ts, frontend/dev-ports.ts, frontend/package.json`.
- [x] `P01.S02` - Author the axis module declaring the review matrix centrally: light and dark themes with high-contrast opt-in, mobile 390x844 and desktop 1440x900 viewports, and the four canonical state modes; `frontend/dev/gallery/matrix.ts`.
- [x] `P01.S03` - Author the Specimen descriptor carrying id, group, title, size class and optional declared modes, plus the one registry every specimen enrolls in; `frontend/dev/gallery/registry/specimen.ts, frontend/dev/gallery/registry/registry.ts`.
- [x] `P01.S04` - Build the single-cell frame renderer that an iframe loads, resolving specimen, mode, theme and viewport from URL parameters and applying the theme to its own document root; `frontend/dev/gallery/frame/`.
- [x] `P01.S05` - Build the gallery shell navigator rendering the specimen list, axis toggles and the matrix grid of true-width iframes scaled to fit a 1920x1080 reviewing screen, with deep-linkable URL state; `frontend/dev/gallery/shell/`.
- [x] `P01.S06` - Enroll all 29 kit primitives as specimens with their full variant and size coverage, declaring no state axis for stateless primitives per ADR D4; `frontend/dev/gallery/registry/specimens/`.

### Phase `P02` - Shallow rehome

Move the four visual labs, the dev HTML entries and the spike tree into the dev domain, and delete the empty prototype directory and the stale scratch scripts.

- [x] `P02.S07` - Move the four visual labs and their HTML entries into the dev domain unchanged, confirming no test or build config references them; `frontend/dev/labs/, frontend/src/filters-visual/, frontend/src/status-visual/, frontend/src/viewer-visual/, frontend/src/graph-visual/`.
- [x] `P02.S08` - Move the spike tree into the dev domain, delete the empty prototype directory, and remove the stale scratch scripts pointing at non-canonical ports; `frontend/dev/spike/, frontend/spike/, frontend/src/prototype/, frontend/tmp-*.mjs, frontend/.tmp/`.
- [x] `P02.S09` - Extend the tsconfig include, the eslint lint script and the prettier format globs to cover the dev domain so rehomed code stays type-checked and linted; `frontend/tsconfig.json, frontend/package.json`.

### Phase `P03` - Separation gate

Enforce the ADR D7 one-way import law with a scanner wired into the frontend lint gate, and codify the rule so a reintroduced preview prop or dev entry fails the build.

- [x] `P03.S10` - Author the domain scanner enforcing the one-way import law, failing on dev-shaped directories under src, a src to dev import, a preview-override prop, or a dev HTML entry at the frontend root; `frontend/scripts/scan-domains.mjs`.
- [x] `P03.S11` - Wire the domain scanner into the frontend lint recipe beside the existing px and localization scanners; `justfile, frontend/package.json`.
- [x] `P03.S12` - Codify the production and dev separation rule with its one-way import law and the ban on preview affordances in production components; `.claude/rules/`.

### Phase `P04` - Three-lab detangle

Rehome the three-lab surface, move its vocabulary module out of the production stores layer, and unwire its copy from the shipped localization catalog.

- [x] `P04.S13` - Rehome the three-lab surface and its HTML entry into the dev domain, keeping its imports of production scene modules which remain legal under the one-way law; `frontend/dev/labs/three/, frontend/src/three-lab/`.
- [x] `P04.S14` - Move threeLabVocabulary out of the production stores layer into the dev domain, confirming it has zero production consumers before the move; `frontend/src/stores/view/threeLabVocabulary.ts, frontend/dev/labs/three/`.
- [x] `P04.S15` - Unwire three-lab copy from the shipped localization catalog and relocate its message policy, catalog keys, test resources and catalog assertions into the dev domain; `frontend/src/localization/messagePolicy.ts, frontend/src/localization/messagePolicy.threeLab.ts, frontend/src/localization/catalogThreeLabKeys.ts, frontend/src/localization/catalogKeys.test.ts`.

### Phase `P05` - Container and view split

Apply ADR D2 across the mode-bearing surfaces, delete the dev-only override prop, unify the state vocabulary and the railStates modules, then enroll the resulting views on the four-mode axis.

- [x] `P05.S16` - Unify the state vocabulary by replacing populated with typical and merge the two competing railStates modules into one kit definition per ADR D5; `frontend/src/app/kit/, frontend/src/app/left/railStates.tsx, frontend/src/app/right/railStates.tsx`.
- [x] `P05.S17` - Split StatusTab into a deriving container and a StatusTabView taking the resolved mode as a required prop, and delete the dev-only stateOverride prop outright per ADR D2; `frontend/src/app/right/StatusTab.tsx`.
- [x] `P05.S18` - Enrol the mode-bearing surfaces that are already wire-free presentational components, and record the remaining wire-bound surfaces as out of scope pending their own container and view split; `frontend/src/app/left/railStates.tsx, frontend/dev/gallery/registry/specimens/surfaces.tsx`.
- [x] `P05.S19` - Enroll the mode-bearing views as specimens declaring their genuinely supported modes, and enroll any integrated specimen against the real engine over the committed fixture vault per ADR D3; `frontend/dev/gallery/registry/specimens/`.

### Phase `P06` - Coverage guard and review

Lock the harness canonical with a guard over kit and mode coverage, then run the full gate and route the feature to code review.

- [x] `P06.S20` - Author the coverage guard asserting every kit barrel export has at least one specimen and every declared mode renders, so the harness cannot drift as the kit grows; `frontend/dev/gallery/coverage.guard.test.ts`.
- [x] `P06.S21` - Run the full frontend lint gate and the touched-scope test suites, confirming the px and localization scanners still report zero findings and the production build carries no dev module; `frontend/`.
- [x] `P06.S22` - Route the completed feature to code review and record the audit; `.vault/audit/`.

### Phase `P07` - Tooling domain reconciliation

Reconcile every non-shipped tooling file into the dev domain, covering the gate scanners, the figma and token tooling, the playwright configs and their data files, then update every reference including the vaultspec-managed rule sources.

- [x] `P07.S23` - Classify all 17 scripts entries and the 8 root config files into shipped, never-shipped, and required-at-root, recording the verdict per file so the reconciliation is complete rather than partial; `frontend/scripts/, frontend/*.config.ts, frontend/dev-ports.ts`.
- [x] `P07.S24` - Move the five gate scanners and their data files into the dev domain, keeping the localization policy module beside its scanner; `frontend/scripts/scan-px.mjs, frontend/scripts/scan-localization.mjs, frontend/scripts/scan-localization-policy.mjs, frontend/scripts/scan-module-size.mjs, frontend/scripts/scan-domains.mjs, frontend/scripts/px-allowlist.json, frontend/scripts/module-size-baseline.json`.
- [x] `P07.S25` - Move the figma and token tooling into the dev domain, including the style-dictionary transforms and the capture and icon extractors; `frontend/scripts/figma-export.ts, frontend/scripts/figma-icons.mjs, frontend/scripts/figma-names-check.mjs, frontend/scripts/token-drift-check.ts, frontend/scripts/token-css-diff.ts, frontend/scripts/sd-transforms.ts, frontend/scripts/capture-readme.mjs`.
- [x] `P07.S26` - Move the scanner and token tests plus the localization fixtures with their modules, and update the vitest include so they still run; `frontend/scripts/scan-localization.test.ts, frontend/scripts/token-drift-check.test.ts, frontend/scripts/fixtures/, frontend/vite.config.ts`.
- [x] `P07.S27` - Move the four playwright configs and dev-ports into the dev domain, resolving the production vite config's dependency on the shared port source; `frontend/playwright.config.ts, frontend/playwright.adverse.config.ts, frontend/playwright.editor.config.ts, frontend/playwright.localization.config.ts, frontend/dev-ports.ts, frontend/vite.config.ts`.
- [x] `P07.S28` - Update every reference to the moved tooling across package.json scripts, the justfile recipes, and the figma documentation; `frontend/package.json, justfile, frontend/figma/README.md, frontend/figma/FIGMA-SEED.md, frontend/dev/README.md`.
- [x] `P07.S29` - Update the vaultspec-managed rule sources citing the old tooling paths and run sync so every generated provider copy is regenerated rather than hand-edited; `.vaultspec/rules/design-system.md, .vaultspec/rules/production-dev-separation.md`.
- [x] `P07.S30` - Extend the domain scanner to enforce the tooling home so a new scanner or config cannot reappear outside the dev domain; `frontend/dev/tooling/scan-domains.mjs`.

### Phase `P08` - Tooling gate adoption

Bring the relocated dev tooling into typecheck and eslint for the first time, fixing the pre-existing errors that exposure surfaces, while permanently excluding the deliberately-invalid scanner fixtures.

- [x] `P08.S31` - Bring the dev tooling into typecheck and eslint scope, keeping only the deliberately-invalid scanner fixtures excluded; `frontend/tsconfig.json, frontend/eslint.config.js`.
- [x] `P08.S32` - Resolve the pre-existing type errors the exposure surfaces, establishing whether the figma export tooling is genuinely broken or merely untyped; `frontend/dev/tooling/figma-export.ts, frontend/dev/tooling/token-drift-check.ts`.
- [x] `P08.S33` - Declare the Node globals the relocated scripts rely on so they lint as maintained code rather than being ignored; `frontend/eslint.config.js, frontend/dev/tooling/capture-readme.mjs`.

## Description

## Steps

## Parallelization

## Verification
