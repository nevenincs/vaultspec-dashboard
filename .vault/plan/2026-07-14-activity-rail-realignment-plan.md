---
tags:
  - '#plan'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-14'
tier: L2
related:
  - '[[2026-07-14-activity-rail-realignment-adr]]'
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
     Replace activity-rail-realignment with a kebab-case feature tag, e.g. #foo-bar.
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

# `activity-rail-realignment` plan

### Phase `P01` - Figma design pass

Design every new element as bound Kit-composed frames in the binding file before code: the rail-footer framework status cluster with per-chip states, and the four control panel frames (ADR D5).


<!-- One-line headline summary plan. -->

- [x] `P01.S01` - Design the rail-footer framework status cluster frame - strip plus the four chips (Search service, Approvals, Backend health, Vault health) with resting, hover, attention-tone, and count-badge states - Kit-composed on the token scale; `Figma SlhonORmySdoSMTQgDWw3w FrameworkStatusCluster`.
- [x] `P01.S02` - Design the Search service and Approvals panel frames as modal dialogs re-hosting the existing console layouts, replacing the stale search-console binding; `Figma SlhonORmySdoSMTQgDWw3w SearchServicePanel ApprovalsPanel`.
- [x] `P01.S03` - Design the Backend health and Vault health panel frames - plain-language per-tier availability rows with reasons, core reachability, vault health word plus check verb row; `Figma SlhonORmySdoSMTQgDWw3w BackendHealthPanel VaultHealthPanel`.

### Phase `P02` - Stores and action plane

The panel open-state stores, the served framework-health chip projections, and the one-descriptor-per-panel action enrollment across palette and keymap (ADR D2/D4).

- [x] `P02.S04` - Create the control-panel open-state view store - four non-persisted open flags plus open, close, toggle intents on the settingsDialog idiom, with unit tests; `frontend/src/stores/view/controlPanels.ts`.
- [x] `P02.S05` - Derive the framework-status cluster projection - per-chip served health tone and count from the status tiers rollup, useCoreStatus vault health, rag status, and the approvals pending count - raw-selector-plus-useMemo discipline, with unit tests; `frontend/src/stores/server/queries/frameworkStatus.ts`.
- [x] `P02.S06` - Enroll one ActionDescriptor per panel toggle across the palette and keymap planes and extend the action-coverage guard; `frontend/src/stores/view/chromeActions.ts`.

### Phase `P03` - Chrome: cluster, panels, rail eviction

Mount the footer cluster and the four modal panels on the Settings-dialog idiom, re-mounting the two existing console bodies and building the two new health bodies; evict the admin sections from the rail (ADR D1/D3).

- [ ] `P03.S07` - Build the rail-footer FrameworkStatusCluster strip mirroring the bound frame - pinned outside the rail scroll, one FocusZone tab stop, chips dispatch the panel toggle descriptors; `frontend/src/app/right/FrameworkStatusCluster.tsx`.
- [ ] `P03.S08` - Build the four modal control panels over the Dialog primitive gated on the open-state store - re-mount RagOpsConsoleBody and ReviewStationSection bodies, mount the host once in the shell; `frontend/src/app/panels/ControlPanels.tsx`.
- [ ] `P03.S09` - Build the Backend health panel body - per-tier availability with plain-language names and reasons plus engine and core reachability - from the stores projection only; `frontend/src/app/panels/BackendHealthPanel.tsx`.
- [ ] `P03.S10` - Build the Vault health panel body - served vault health word plus the existing vault-check ops verb with receipt; `frontend/src/app/panels/VaultHealthPanel.tsx`.
- [ ] `P03.S11` - Evict the Search service and Approvals SectionCards from the rail and retire the rag-ops, rag-ops:details, and authoring-review section ids; `frontend/src/app/right/StatusTab.tsx`.

### Phase `P04` - Compact parity, test re-pinning, gate

Compact unified-rail parity for the cluster, re-pin the rail guard and parity-harness tests to the status-only composition, and run the full frontend gate (ADR D6).

- [ ] `P04.S12` - Join the cluster to the compact unified rail footer and verify the panels open compact-safe; `frontend/src/app/shell/CompactUnifiedRail.tsx`.
- [ ] `P04.S13` - Re-pin the rail guard tests and the status parity harness to the status-only composition and relocate the console and review-station tests beside their panels; `frontend/src/app/right/rail.test.ts`.
- [ ] `P04.S14` - Run the full frontend lint gate and the touched vitest suites; `verify Figma name-as-contract bindings; `frontend`.

## Description

Realign the right activity rail to status-only per the accepted ADR (D1-D6),
grounded by the same-feature research. The rail keeps Changes, Plans, Pull
requests, Issues, and Commits; the two inline admin consoles (Search service,
Approvals) move into Figma-designed modal control panels on the
Settings-dialog idiom, joined by two NEW panels over already-served but dark
health planes (Backend health from the status tiers rollup, Vault health from
the core rollup). A pinned rail-footer framework status cluster of
served-health chips toggles the panels; each toggle is one ActionDescriptor
enrolled across palette and keymap. Every new element is designed as a bound
Kit-composed Figma frame BEFORE implementation (user directive 2026-07-14).

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

P01 (Figma) gates P03 chrome (frames bind the visuals) but P02 (stores and
actions) may run in parallel with P01 - it has no visual dependency. Within
P02, S04/S05/S06 are independent files and parallelize. Within P03, S07-S10
parallelize across distinct new files once P02 lands; S11 (rail eviction) is
LAST in the phase - it deletes the old mounts only after the panels exist.
P04 is strictly after P03. Execution uses one named Opus coder per lane,
rolled out progressively (never all at once); the orchestrator owns all git.

## Verification

- The rail renders exactly Changes, Plans, Pull requests, Issues, Commits
  plus the footer cluster; no admin SectionCards remain (rail guard test).
- Every new frame exists in the binding Figma file and code mirrors it
  (name-as-contract; figma:names passes).
- Each panel opens from its chip, its palette command, and its chord; a
  closed panel mounts no body (mount-gating assertion).
- Chip tones and counts come only from stores projections (no raw tiers
  reads; guard grep).
- Backend health and Vault health panels render served truth including the
  degraded and unreachable states.
- Compact shell shows the cluster and opens the panels; the compact scroll
  contains no console bodies.
- Full frontend lint gate exits 0 and the touched vitest suites pass; the
  adversarial code review (vaultspec-code-review) signs off. The plan is
  complete when every Step row is closed.
