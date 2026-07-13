---
generated: true
tags:
  - '#index'
  - '#mobile-enrichment'
date: '2026-07-09'
modified: '2026-07-12'
related:
  - '[[2026-07-08-mobile-enrichment-S01]]'
  - '[[2026-07-08-mobile-enrichment-S02]]'
  - '[[2026-07-08-mobile-enrichment-S03]]'
  - '[[2026-07-08-mobile-enrichment-S04]]'
  - '[[2026-07-08-mobile-enrichment-S05]]'
  - '[[2026-07-08-mobile-enrichment-S06]]'
  - '[[2026-07-08-mobile-enrichment-S07]]'
  - '[[2026-07-08-mobile-enrichment-S08]]'
  - '[[2026-07-08-mobile-enrichment-S09]]'
  - '[[2026-07-08-mobile-enrichment-adr]]'
  - '[[2026-07-08-mobile-enrichment-plan]]'
  - '[[2026-07-09-mobile-enrichment-audit]]'
---

# `mobile-enrichment` feature index

Auto-generated index of all documents tagged with `#mobile-enrichment`.

## Documents

### adr

- `2026-07-08-mobile-enrichment-adr` - `mobile-enrichment` adr: `compact dashboard enrichment` | (**status:** `accepted`)

### audit

- `2026-07-09-mobile-enrichment-audit` - `mobile-enrichment` audit: `phase review and revisions`

### exec

- `2026-07-08-mobile-enrichment-S01` - D2: surface document review metadata inline on compact (date + plain-language ADR acceptance / plan progress) as a second meta line
- `2026-07-08-mobile-enrichment-S02` - D1: compact workspace switcher — MobileTopBar title trigger opens a BottomSheet re-presenting useWorktreePickerView with the shared activate/swap intents and unsaved-edit guard
- `2026-07-08-mobile-enrichment-S03` - D3: hoist the canonical Vault/doc-type/title trail into a shared helper consumed by DocPanel and CompactDocReader, retiring the bare 2-item breadcrumb
- `2026-07-08-mobile-enrichment-S04` - D4: edge-swipe back gesture in the compact reader (widget-intrinsic) routing the same doc-scoped unsaved-draft guard as tap-back
- `2026-07-08-mobile-enrichment-S05` - Add a live-engine compact guard test asserting the ADR-status word and date render inline (the tooltip-only regression is otherwise silent)
- `2026-07-08-mobile-enrichment-S06` - Verify: full frontend lint gate green, live @390px visual parity against the binding Figma frames, and code review closeout
- `2026-07-08-mobile-enrichment-S07` - D6: compact reader breadcrumb legibility — drop the Vault root on compact and keep ancestor crumbs whole so only the title truncates (no more Va… / Decisi… / title…)
- `2026-07-08-mobile-enrichment-S08` - D7: edge-swipe hardening decided — pointer-capture rejected, touch-action pan-y shipped
- `2026-07-08-mobile-enrichment-S09` - D8: desktop LeftRail tree-level indent guide added to the Figma design (SectionBody), matching the shipped code and the mobile Browse frame — Figma-only, no code change

### plan

- `2026-07-08-mobile-enrichment-plan` - `mobile-enrichment` plan
