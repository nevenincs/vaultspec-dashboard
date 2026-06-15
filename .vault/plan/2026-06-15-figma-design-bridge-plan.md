---
tags:
  - '#plan'
  - '#figma-design-bridge'
date: '2026-06-15'
modified: '2026-06-15'
tier: L3
related:
  - '[[2026-06-15-figma-design-bridge-adr]]'
  - '[[2026-06-15-figma-design-bridge-research]]'
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

# `figma-design-bridge` plan

## Wave `W01` - Tokens bridge

Make DTCG-JSON-in-Git the canonical token source and generate the existing CSS token tier downstream, with Figma Variables as a one-way mirror; this Wave must land before Wave W02 because the component gallery and Figma seeding both depend on a single canonical token surface. Backed by the figma-design-bridge ADR and research.

Backport the hand-rolled React design system into a code-canonical, Figma-mirrored framework: DTCG tokens drive both CSS and Figma Variables, and a repo-maintained registry cross-connects components to Figma.

### Phase `W01.P01` - DTCG token source

Author the DTCG token files mirroring the existing OKLCH primitive ramps, semantic tier, and light/dark/high-contrast modes.

- [x] `W01.P01.S01` - Author the primitive OKLCH ramps (neutral, accent, tier hues, diff) with hex fallback as DTCG; `frontend/tokens/primitives.tokens.json`.
- [x] `W01.P01.S02` - Author the semantic tier (surfaces, borders, accent/focus, ink) aliasing primitives as DTCG, default mode; `frontend/tokens/semantic.tokens.json`.
- [x] `W01.P01.S03` - Author the dark-mode semantic remap as a DTCG resolver context; `frontend/tokens/themes/dark.tokens.json`.
- [x] `W01.P01.S04` - Author the high-contrast semantic remap as a DTCG resolver context; `frontend/tokens/themes/high-contrast.tokens.json`.
- [x] `W01.P01.S05` - Author the DTCG resolver manifest declaring the light/dark/high-contrast modes; `frontend/tokens/resolver.json`.
- [x] `W01.P01.S06` - Document the token taxonomy mapping each DTCG token to its CSS custom property and scene-read subset; `frontend/tokens/README.md`.

### Phase `W01.P02` - Style Dictionary export, parity-verified

Build the DTCG-to-CSS pipeline and prove the generated CSS is byte-equivalent to the current hand-authored styles before flipping canonical.

- [x] `W01.P02.S07` - Add style-dictionary as a dev dependency and author its build config; `frontend/style-dictionary.config.ts`.
- [x] `W01.P02.S08` - Author the custom OKLCH-and-hex transform plus the CSS-variable format emitting :root and [data-theme] blocks; `frontend/build/sd-transforms.ts`.
- [x] `W01.P02.S09` - Generate the candidate CSS from the DTCG source to a non-canonical output file; `frontend/src/styles.generated.css`.
- [x] `W01.P02.S10` - Author the parity diff script comparing generated color blocks against the committed styles; `frontend/scripts/token-parity.ts`.
- [x] `W01.P02.S11` - Iterate DTCG values until the parity script reports byte-equivalence with the current color tier; `frontend/tokens/primitives.tokens.json`.
- [x] `W01.P02.S12` - Wire token generation into the build via a just recipe and npm script; `justfile`.

### Phase `W01.P03` - Flip canonical and retire hand-authored color

Make generation canonical, remove the hand-authored color blocks, and prove theme switching and scene hex reads are unchanged.

- [ ] `W01.P03.S13` - Replace the hand-authored color blocks with the generated token output as the canonical source; `frontend/src/styles.css`.
- [ ] `W01.P03.S14` - Remove the now-duplicated primitive and semantic color declarations left in the stylesheet; `frontend/src/styles.css`.
- [ ] `W01.P03.S15` - Verify the scene getComputedStyle hex readers still resolve every scene-read token; `frontend/src/scene/field/tokenReads.test.ts`.
- [ ] `W01.P03.S16` - Verify light, dark, and high-contrast theme switching is unchanged after the flip; `frontend/src/platform/theme/themeController.test.ts`.
- [ ] `W01.P03.S17` - Run the full frontend lint gate and confirm exit zero; `justfile`.

### Phase `W01.P04` - Tokens Studio push to Figma Variables

Configure Tokens Studio to write the DTCG tokens into Figma Primitives and Semantic collections with modes via the Plugin API, one way.

- [ ] `W01.P04.S18` - Author the Tokens Studio configuration mapping DTCG sets to Figma collections and modes; `frontend/tokens/tokens-studio.config.json`.
- [ ] `W01.P04.S19` - Document the Plugin-API push runbook for the Primitives and Semantic collections with light/dark/high-contrast modes; `frontend/tokens/FIGMA-SYNC.md`.
- [ ] `W01.P04.S20` - Execute the Tokens Studio push and verify the variables and modes land in the Figma file; `frontend/tokens/FIGMA-SYNC.md`.

### Phase `W01.P05` - Token drift gate

Add a CI check that regenerates CSS from DTCG and fails when it diverges from the committed output.

- [x] `W01.P05.S21` - Author the drift-check script that regenerates CSS from DTCG and fails on divergence from committed output; `frontend/scripts/token-drift-check.ts`.
- [x] `W01.P05.S22` - Add a unit test proving the drift checker fails on a deliberately mutated token; `frontend/scripts/token-drift-check.test.ts`.
- [x] `W01.P05.S23` - Wire the drift gate into the lint pipeline; `justfile`.

## Wave `W02` - Component cross-connect

Stand up a Storybook gallery, a repo-maintained code-to-Figma mapping registry with naming parity, seed Figma with the existing UI, and verify parity through the read-only Figma MCP; depends on Wave W01's canonical tokens. Backed by the figma-design-bridge ADR and research.

### Phase `W02.P06` - Storybook adoption

Stand up Storybook on the Vite builder with token CSS and theme switching as the seeding and parity substrate.

- [ ] `W02.P06.S24` - Add Storybook with the Vite builder and its core configuration; `frontend/.storybook/main.ts`.
- [ ] `W02.P06.S25` - Configure the Storybook preview to load the token CSS and a light/dark/high-contrast theme switcher; `frontend/.storybook/preview.tsx`.
- [ ] `W02.P06.S26` - Wire just recipes to run and build the Storybook gallery; `justfile`.

### Phase `W02.P07` - Story coverage of the chrome inventory

Author stories covering the app chrome regions and shared marks so every component has a clean render surface.

- [ ] `W02.P07.S27` - Author a foundations story showcasing color tokens, type scale, spacing, shadow, and radius; `frontend/src/app/foundations.stories.tsx`.
- [ ] `W02.P07.S28` - Author stories for the left-rail chrome region components; `frontend/src/app/left/left.stories.tsx`.
- [ ] `W02.P07.S29` - Author stories for the stage region components; `frontend/src/app/stage/stage.stories.tsx`.
- [ ] `W02.P07.S30` - Author stories for the right-rail region components; `frontend/src/app/right/right.stories.tsx`.
- [ ] `W02.P07.S31` - Author stories for the timeline region components; `frontend/src/app/timeline/timeline.stories.tsx`.
- [ ] `W02.P07.S32` - Author stories for the islands, palette, and menu region components; `frontend/src/app/islands/islands.stories.tsx`.
- [ ] `W02.P07.S33` - Author stories for the shared domain marks and iconography; `frontend/src/scene/field/marks.stories.tsx`.

### Phase `W02.P08` - Code-to-Figma mapping registry

Define the registry schema, author the mapping, and enforce the 1:1 naming-parity contract.

- [ ] `W02.P08.S34` - Define the code-to-Figma mapping registry JSON schema; `frontend/figma/registry.schema.json`.
- [ ] `W02.P08.S35` - Author the mapping registry enumerating each chrome component with its Figma node reference field; `frontend/figma/component-map.json`.
- [ ] `W02.P08.S36` - Author the naming-parity validator asserting every registry entry resolves to a real component under the naming contract; `frontend/scripts/figma-registry-check.ts`.
- [ ] `W02.P08.S37` - Document the 1:1 code-to-Figma naming-parity contract; `frontend/figma/README.md`.

### Phase `W02.P09` - Figma seeding

Seed the Figma file: manually rebuild foundations and icons, importer-seed composite screens, clean up, and record node references.

- [ ] `W02.P09.S38` - Create the Figma file and the Primitives and Semantic variable collections from the Tokens Studio push; `frontend/figma/FIGMA-SEED.md`.
- [ ] `W02.P09.S39` - Manually rebuild the foundation in Figma: color styles, type scale, and the Lucide/Phosphor icon set; `frontend/figma/FIGMA-SEED.md`.
- [ ] `W02.P09.S40` - Importer-seed the composite screens from the running Storybook gallery using html.to.design or Codia; `frontend/figma/FIGMA-SEED.md`.
- [ ] `W02.P09.S41` - Run the cleanup pass renaming layers and componentizing seeded frames to the naming contract; `frontend/figma/FIGMA-SEED.md`.
- [ ] `W02.P09.S42` - Record the resulting Figma node ids and urls back into the mapping registry; `frontend/figma/component-map.json`.

### Phase `W02.P10` - MCP parity checks and gate

Author the read-only MCP parity-check script and wire registry completeness and naming parity into CI.

- [ ] `W02.P10.S43` - Author the read-only MCP parity-check script pulling metadata, design context, and screenshots per registry entry; `frontend/scripts/figma-parity.ts`.
- [ ] `W02.P10.S44` - Add the screenshot-diff comparison of the Figma node against the Storybook render; `frontend/scripts/figma-parity.ts`.
- [ ] `W02.P10.S45` - Wire registry completeness and naming parity into the CI gate; `justfile`.
- [ ] `W02.P10.S46` - Document the end-to-end Figma parity verification workflow; `frontend/figma/README.md`.

## Description

This plan executes the accepted figma-design-bridge ADR, grounded in the
figma-design-bridge research. The goal is to cross-connect the existing
hand-rolled React design system with Figma while keeping the repository
canonical. Two myths the research disproved shape the plan: Figma cannot store
our OKLCH color model (RGBA only), and at our Professional tier neither Code
Connect nor the Variables REST API is available. The durable architecture is
therefore code-canonical with Figma as a one-way synced mirror.

Wave W01 (tokens bridge) introduces a DTCG token source mirroring the current
OKLCH primitive ramps, semantic tier, and light/dark/high-contrast modes, builds
a Style Dictionary pipeline that regenerates the existing CSS token tier, proves
byte-equivalence against the committed stylesheet before flipping generation
canonical, pushes the same tokens into Figma Variables via Tokens Studio's
Plugin-API path, and gates drift in CI. Wave W02 (component cross-connect) stands
up a Storybook gallery as the seeding and parity substrate, authors stories
across the chrome inventory, defines a repo-maintained code-to-Figma mapping
registry with a 1:1 naming-parity contract, seeds the Figma file (manual
foundations and icons, importer-seeded composite screens), and verifies parity
through the read-only Figma MCP with a CI gate.

Non-goals are fenced explicitly: Figma is never the master, OKLCH is never stored
in Figma, the PixiJS scene layer is not mirrored, and Code Connect is not used at
the current tier. Layer ownership is respected: the token and stylesheet surface
is cross-cutting platform substrate, the components are app chrome, and the scene
layer is untouched.

## Steps







## Parallelization

Wave W01 must land before Wave W02: the gallery, the mapping registry, and Figma
seeding all depend on a single canonical token surface. Within W01 the phases are
strictly sequential (P01 token source, then P02 parity-verified export, then P03
the canonical flip, then P04 the Figma push, then P05 the drift gate) because each
consumes the prior phase's output; P04 (Tokens Studio push) and P05 (drift gate)
may overlap once P03 lands. Within W02, P06 (Storybook) precedes P07 (stories);
P08 (registry schema and validator) can proceed in parallel with P06/P07 since it
depends only on the component inventory; P09 (Figma seeding) requires P07 (a
render surface) and P04 (the variable collections); P10 (parity checks) requires
both P08 and P09. Steps P09.S38 through P09.S41 are operator steps run by the user
in the Figma desktop app and are sequential among themselves.

## Verification

The plan is complete when every Step is closed and these criteria hold:

- The DTCG-generated CSS is byte-equivalent to the committed token tier, proven by
  the parity script in P02 and continuously enforced by the P05 drift gate (CI
  fails on divergence).
- After the canonical flip (P03), the full frontend lint gate passes (`just dev
  lint frontend`, exit 0), the scene getComputedStyle hex readers resolve every
  scene-read token, and light/dark/high-contrast switching is unchanged.
- The Figma file carries Primitives and Semantic variable collections with
  light/dark/high-contrast modes, populated from the DTCG source via Tokens Studio
  (verified in P04).
- Storybook builds and renders the chrome inventory (P06/P07).
- The mapping registry validates: every entry resolves to a real component under
  the 1:1 naming-parity contract, enforced by the P08 validator and the P10 CI
  gate; the registry carries Figma node references after seeding (P09).
- The MCP parity-check script runs against the registry and reports each
  component's Figma-versus-Storybook parity (P10).
- A vaultspec-code-review pass signs off the code-bearing waves.

Figma desktop operator steps (P09.S38-S41) are verified by the user confirming
the variables, foundations, and seeded frames exist in the Figma file before the
node references are recorded.
