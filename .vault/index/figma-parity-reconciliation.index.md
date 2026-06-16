---
generated: true
tags:
  - '#index'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
related:
  - '[[2026-06-16-figma-parity-reconciliation-W01-P01-S01]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P01-S02]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P01-S03]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P01-S04]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P01-S05]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P01-S06]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P01-S07]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P01-S08]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P01-S09]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P01-S10]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P01-summary]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P02-S11]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P02-S12]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P02-S13]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P02-S14]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P02-S15]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P02-S16]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P02-S17]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P02-S18]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P02-summary]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P03-S19]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P03-S20]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P03-S21]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P03-S22]]'
  - '[[2026-06-16-figma-parity-reconciliation-W01-P03-summary]]'
  - '[[2026-06-16-figma-parity-reconciliation-adr]]'
  - '[[2026-06-16-figma-parity-reconciliation-plan]]'
  - '[[2026-06-16-figma-parity-reconciliation-reference]]'
  - '[[2026-06-16-figma-parity-reconciliation-research]]'
---

# `figma-parity-reconciliation` feature index

Auto-generated index of all documents tagged with `#figma-parity-reconciliation`.

## Documents

### adr

- `2026-06-16-figma-parity-reconciliation-adr` - `figma-parity-reconciliation` adr: `Figma-binding frontend rewrite and reconciliation` | (**status:** `accepted`)

### exec

- `2026-06-16-figma-parity-reconciliation-W01-P01-S01` - Author the DTCG type-scale source with the Figma role names display, title, body, body-strong, label, meta, caption, and mono
- `2026-06-16-figma-parity-reconciliation-W01-P01-S02` - Author the DTCG radius source with the Figma scale xs4, sm5, md7, lg10, and pill18
- `2026-06-16-figma-parity-reconciliation-W01-P01-S03` - Author the DTCG elevation source with the Figma three-level scale raised, overlay, and popover
- `2026-06-16-figma-parity-reconciliation-W01-P01-S04` - Author the DTCG spacing source mirroring the existing 4-base scale to bring spacing under the generated pipeline
- `2026-06-16-figma-parity-reconciliation-W01-P01-S05` - Extend the Style Dictionary resolver and build to emit the four non-color families into the generated stylesheet regions
- `2026-06-16-figma-parity-reconciliation-W01-P01-S06` - Extend the Figma token mirror to carry the type, spacing, radius, and elevation families alongside color
- `2026-06-16-figma-parity-reconciliation-W01-P01-S07` - Adopt Inter and JetBrains Mono as the bound font families, replacing the system stack
- `2026-06-16-figma-parity-reconciliation-W01-P01-S08` - Migrate the ~30 elevation usages from the six-level scale to the three Figma levels, smallest blast radius first
- `2026-06-16-figma-parity-reconciliation-W01-P01-S09` - Migrate the ~167 radius usages to the Figma scale, re-keying and converting rounded-full to pill18
- `2026-06-16-figma-parity-reconciliation-W01-P01-S10` - Migrate the ~309 text usages to the Figma role-named type scale, guarding the text-title versus text-heading collision
- `2026-06-16-figma-parity-reconciliation-W01-P01-summary` - `figma-parity-reconciliation` `W01.P01` summary
- `2026-06-16-figma-parity-reconciliation-W01-P02-S11` - Freeze and document the preserved stores hooks as the rewrite-consumable contract API surface
- `2026-06-16-figma-parity-reconciliation-W01-P02-S12` - Freeze and document the SceneController command and event contract as the canvas rewrite API surface
- `2026-06-16-figma-parity-reconciliation-W01-P02-S13` - Enrich the node-evidence projection to the GUI shape (document path plus doc_type, corrected code-location field, commit subject) through the shared envelope
- `2026-06-16-figma-parity-reconciliation-W01-P02-S14` - Add the bounded read-only historical text-diff route as a two-rev git diff whitelist extension, read-and-infer with no vault writes
- `2026-06-16-figma-parity-reconciliation-W01-P02-S15` - Carry the tiers degradation block on the historical text-diff route success and error envelopes through the shared helper
- `2026-06-16-figma-parity-reconciliation-W01-P02-S16` - Mirror the enriched node-evidence shape in the mock engine to match the live wire byte-for-byte
- `2026-06-16-figma-parity-reconciliation-W01-P02-S17` - Mirror the historical text-diff route shape in the mock engine to match the live wire byte-for-byte
- `2026-06-16-figma-parity-reconciliation-W01-P02-S18` - Add conformance tests feeding a captured live sample of both new shapes through the shared client adapter path
- `2026-06-16-figma-parity-reconciliation-W01-P02-summary` - `figma-parity-reconciliation` `W01.P02` summary
- `2026-06-16-figma-parity-reconciliation-W01-P03-S19` - Finalize the component registry repointed to the live Figma file mapping code components to the Kit primitives at frame 135:2
- `2026-06-16-figma-parity-reconciliation-W01-P03-S20` - Author or update the Code Connect config naming the live file and the connect directory
- `2026-06-16-figma-parity-reconciliation-W01-P03-S21` - Author parse-clean figma mappings for every mappable code component against its Kit primitive
- `2026-06-16-figma-parity-reconciliation-W01-P03-S22` - Validate the full Code Connect map parses with zero errors via figma connect parse, leaving publish as the human's gated step
- `2026-06-16-figma-parity-reconciliation-W01-P03-summary` - `figma-parity-reconciliation` `W01.P03` summary

### plan

- `2026-06-16-figma-parity-reconciliation-plan` - `figma-parity-reconciliation` plan

### reference

- `2026-06-16-figma-parity-reconciliation-reference` - `figma-parity-reconciliation` reference: `Preserved stores and SceneController contract`

### research

- `2026-06-16-figma-parity-reconciliation-research` - `figma-parity-reconciliation` research: `Figma design parity and reconciliation`
