---
generated: true
tags:
  - '#index'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - '[[2026-07-14-activity-rail-realignment-P01-S01]]'
  - '[[2026-07-14-activity-rail-realignment-P01-S02]]'
  - '[[2026-07-14-activity-rail-realignment-P01-S03]]'
  - '[[2026-07-14-activity-rail-realignment-P01-summary]]'
  - '[[2026-07-14-activity-rail-realignment-P02-S04]]'
  - '[[2026-07-14-activity-rail-realignment-P02-S05]]'
  - '[[2026-07-14-activity-rail-realignment-P02-S06]]'
  - '[[2026-07-14-activity-rail-realignment-P02-summary]]'
  - '[[2026-07-14-activity-rail-realignment-P03-S07]]'
  - '[[2026-07-14-activity-rail-realignment-P03-S08]]'
  - '[[2026-07-14-activity-rail-realignment-P03-S09]]'
  - '[[2026-07-14-activity-rail-realignment-P03-S10]]'
  - '[[2026-07-14-activity-rail-realignment-P03-S11]]'
  - '[[2026-07-14-activity-rail-realignment-P03-summary]]'
  - '[[2026-07-14-activity-rail-realignment-P04-S12]]'
  - '[[2026-07-14-activity-rail-realignment-P04-S13]]'
  - '[[2026-07-14-activity-rail-realignment-P04-S14]]'
  - '[[2026-07-14-activity-rail-realignment-P04-summary]]'
  - '[[2026-07-14-activity-rail-realignment-adr]]'
  - '[[2026-07-14-activity-rail-realignment-audit]]'
  - '[[2026-07-14-activity-rail-realignment-plan]]'
  - '[[2026-07-14-activity-rail-realignment-research]]'
---

# `activity-rail-realignment` feature index

Auto-generated index of all documents tagged with `#activity-rail-realignment`.

## Documents

### adr

- `2026-07-14-activity-rail-realignment-adr` - `activity-rail-realignment` adr: `status-only rail, footer status cluster, Figma-designed control panels` | (**status:** `accepted`)

### audit

- `2026-07-14-activity-rail-realignment-audit` - `activity-rail-realignment` audit: `status-only rail, footer cluster, control panels`

### exec

- `2026-07-14-activity-rail-realignment-P01-S01` - Design the rail-footer framework status cluster frame - strip plus the four chips (Search service, Approvals, Backend health, Vault health) with resting, hover, attention-tone, and count-badge states - Kit-composed on the token scale
- `2026-07-14-activity-rail-realignment-P01-S02` - Design the Search service and Approvals panel frames as modal dialogs re-hosting the existing console layouts, replacing the stale search-console binding
- `2026-07-14-activity-rail-realignment-P01-S03` - Design the Backend health and Vault health panel frames - plain-language per-tier availability rows with reasons, core reachability, vault health word plus check verb row
- `2026-07-14-activity-rail-realignment-P01-summary` - `activity-rail-realignment` `P01` summary
- `2026-07-14-activity-rail-realignment-P02-S04` - Create the control-panel open-state view store - four non-persisted open flags plus open, close, toggle intents on the settingsDialog idiom, with unit tests
- `2026-07-14-activity-rail-realignment-P02-S05` - Derive the framework-status cluster projection - per-chip served health tone and count from the status tiers rollup, useCoreStatus vault health, rag status, and the approvals pending count - raw-selector-plus-useMemo discipline, with unit tests
- `2026-07-14-activity-rail-realignment-P02-S06` - Enroll one ActionDescriptor per panel toggle across the palette and keymap planes and extend the action-coverage guard
- `2026-07-14-activity-rail-realignment-P02-summary` - `activity-rail-realignment` `P02` summary
- `2026-07-14-activity-rail-realignment-P03-S07` - Build the rail-footer FrameworkStatusCluster strip mirroring the bound frame - pinned outside the rail scroll, one FocusZone tab stop, chips dispatch the panel toggle descriptors
- `2026-07-14-activity-rail-realignment-P03-S08` - Build the four modal control panels over the Dialog primitive gated on the open-state store - re-mount RagOpsConsoleBody and ReviewStationSection bodies, mount the host once in the shell
- `2026-07-14-activity-rail-realignment-P03-S09` - Build the Backend health panel body - per-tier availability with plain-language names and reasons plus engine and core reachability - from the stores projection only
- `2026-07-14-activity-rail-realignment-P03-S10` - Build the Vault health panel body - served vault health word plus the existing vault-check ops verb with receipt
- `2026-07-14-activity-rail-realignment-P03-S11` - Evict the Search service and Approvals SectionCards from the rail and retire the rag-ops, rag-ops:details, and authoring-review section ids
- `2026-07-14-activity-rail-realignment-P03-summary` - `activity-rail-realignment` `P03` summary
- `2026-07-14-activity-rail-realignment-P04-S12` - Join the cluster to the compact unified rail footer and verify the panels open compact-safe
- `2026-07-14-activity-rail-realignment-P04-S13` - Re-pin the rail guard tests and the status parity harness to the status-only composition and relocate the console and review-station tests beside their panels
- `2026-07-14-activity-rail-realignment-P04-S14` - Run the full frontend lint gate and the touched vitest suites
- `2026-07-14-activity-rail-realignment-P04-summary` - `activity-rail-realignment` `P04` summary

### plan

- `2026-07-14-activity-rail-realignment-plan` - `activity-rail-realignment` plan

### research

- `2026-07-14-activity-rail-realignment-research` - `activity-rail-realignment` research: `status rail vs admin pop-up panels`
