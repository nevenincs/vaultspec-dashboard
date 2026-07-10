---
tags:
  - '#plan'
  - '#mobile-enrichment'
date: '2026-07-08'
modified: '2026-07-10'
tier: L1
related:
  - '[[2026-07-08-mobile-enrichment-adr]]'
---


# `mobile-enrichment` plan

- [x] `S01` - D2: surface document review metadata inline on compact (date + plain-language ADR acceptance / plan progress) as a second meta line; `desktop one-value+tooltip untouched; `frontend/src/app/left/TreeBrowser.tsx`.
- [x] `S02` - D1: compact workspace switcher — MobileTopBar title trigger opens a BottomSheet re-presenting useWorktreePickerView with the shared activate/swap intents and unsaved-edit guard; `frontend/src/app/shell/WorkspaceSwitcherSheet.tsx`.
- [x] `S03` - D3: hoist the canonical Vault/doc-type/title trail into a shared helper consumed by DocPanel and CompactDocReader, retiring the bare 2-item breadcrumb; `frontend/src/app/viewer/docTrail.ts`.
- [x] `S04` - D4: edge-swipe back gesture in the compact reader (widget-intrinsic) routing the same doc-scoped unsaved-draft guard as tap-back; `frontend/src/app/shell/CompactDocReader.tsx`.
- [x] `S05` - Add a live-engine compact guard test asserting the ADR-status word and date render inline (the tooltip-only regression is otherwise silent); `frontend/src/app/left/VaultBrowser.compact.render.test.tsx`.
- [x] `S06` - Verify: full frontend lint gate green, live @390px visual parity against the binding Figma frames, and code review closeout; `frontend/`.
- [x] `S07` - D6: compact reader breadcrumb legibility — drop the Vault root on compact and keep ancestor crumbs whole so only the title truncates (no more Va… / Decisi… / title…); `frontend/src/app/kit/Breadcrumb.tsx`.
- [x] `S08` - D7: edge-swipe hardening decided — pointer-capture rejected, touch-action pan-y shipped; `real-device gap closed via a documented manual-verify checklist on the S04 record; `frontend/src/app/shell/CompactDocReader.tsx`.
- [x] `S09` - D8: desktop LeftRail tree-level indent guide added to the Figma design (SectionBody), matching the shipped code and the mobile Browse frame — Figma-only, no code change; `figma:SlhonORmySdoSMTQgDWw3w`.
## Description

Ratifies the accepted `mobile-enrichment` ADR: four view-layer enrichments to the
compact (phone/tablet) dashboard, riding the existing stores/scene contracts with no
engine, wire, or model change. D2 (S01) surfaces document review metadata inline on
touch — the headline legibility fix, since the desktop status mark + hover tooltip is
unreachable on a phone. D1 (S02) adds the compact workspace switcher. D3 (S03) gives
the compact reader the canonical breadcrumb trail. D4 (S04) adds the edge-swipe back
gesture. S05 guards the inline metadata; S06 is the green closeout. The work is
implemented and committed (7b61b9b515); this plan records the steps and drives the
closeout.

## Parallelization

S01–S05 are independent surface changes (distinct files); S06 depends on all of them.
Executed as one coherent commit rather than parallel workers.

## Verification

Full `just dev lint frontend` green (eslint, px-scan, prettier, tsc, tokens,
figma:names). A live-engine guard test asserts the compact inline metadata (ADR status
word + date) renders without a hover tooltip; the desktop rail render tests stay green
(9/9). A live @390px drive against the binding Figma frames confirms visual parity
(123 inline ADR-status words, 94 plan-progress values, 224 dates; switcher + reader
trail). A read-only code review is the final gate before the steps are marked done.
