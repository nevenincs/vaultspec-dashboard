---
tags:
  - '#plan'
  - '#action-surface-mapping'
date: '2026-06-22'
modified: '2026-06-22'
tier: L2
related:
  - '[[2026-06-22-action-surface-mapping-adr]]'
  - '[[2026-06-22-action-surface-mapping-audit]]'
  - '[[2026-06-21-command-palette-actions-adr]]'
  - '[[2026-06-19-keyboard-action-system-adr]]'
  - '[[2026-06-15-dashboard-context-menus-adr]]'
  - '[[2026-06-21-command-palette-planes-adr]]'
---


<!-- RETIRED: W01, W02, W03, P01, P02, P03, P04, P05, P06, P07, P08, P09, P10, P11, P12, P13, P14, P15, P16, P17, P18, S01, S02, S03, S04, S05, S06, S07, S08, S09, S10, S11, S12, S13, S14, S15, S16, S17, S18, S19, S20, S21, S22, S23, S24, S25, S26, S27, S28, S29, S30, S31, S32, S33, S34, S35, S36, S37, S38, S39, S40, S41, S42, S43, S44, S45, S46, S47, S48, S49, S50, S51, S52, S53, S54, S55, S56, S57, S58, S59, S60, S61, S62, S63, S64, S65, S66, S67, S68, S69, S70, S71, S72, S73, S74, S75, S76, S77, S78, S79, S80, S81, S82, S83, S84, S85, S86, S87, S88, S89, S90, S91, S92, S93, S94, S95, S96, S97, S98, S99, S100, S101, S102, S103, S104, S105, S106, S107, S108, S109, S110, S111, S112, S113, S114, S115, S116, S117 -->







# `action-surface-mapping` plan

### Phase `P19` - coverage grid reference

Capture the 6-domain by 3-plane action coverage grid (current enrollment + eligible-missing) as the single source for the remaining delta.

- [x] `P19.S118` - author the 6-domain by 3-plane action coverage grid reference (current + eligible-missing); `.vault/reference/2026-06-22-action-surface-mapping-reference.md`.

### Phase `P20` - left-rail palette-exposure gaps

Surface the keymap-only focus-filter and clear-filter verbs as command-provider entries under their existing shared ids.

- [x] `P20.S119` - add the focusFilterAction shared builder under its existing keymap id; `frontend/src/stores/view/leftRailKeybindings.ts`.
- [x] `P20.S120` - add the clearFilterAction shared builder under its existing keymap id; `frontend/src/stores/view/leftRailKeybindings.ts`.
- [x] `P20.S121` - extend CommandContext and the assembly hook with the focus-filter and clear-filter intents; `frontend/src/stores/view/commandRegistry.ts`.
- [x] `P20.S122` - contribute focus-filter from the left-rail command provider; `frontend/src/stores/view/commandProviders/leftRailCommandProvider.ts`.
- [x] `P20.S123` - contribute clear-filter from the left-rail command provider; `frontend/src/stores/view/commandProviders/leftRailCommandProvider.ts`.

### Phase `P21` - right-rail commit and PR verbs

Ground the right-rail status verbs' capability and plane eligibility, then enroll them and resolve the right-rail provider asymmetry.

- [x] `P21.S124` - ground the right-rail commit and pull-request verbs' capability and plane eligibility via rag; `frontend/src/app/right/StatusTab.tsx`.
- [x] `P21.S125` - enroll the commit verb on its eligible plane under one shared id; `frontend/src/app/right/menus/changeMenu.ts`.
- [x] `P21.S126` - enroll the pull-request verb on its eligible plane under one shared id; `frontend/src/app/right/menus/changeMenu.ts`.
- [x] `P21.S127` - add a right-rail command provider resolving the window-provider tab asymmetry; `frontend/src/stores/view/commandProviders/rightRailCommandProvider.ts`.

### Phase `P22` - editor capability verbs

Verify autofix and frontmatter are real capabilities, then enroll on their eligible plane or remove the non-capability rather than ship a disabled lie.

- [x] `P22.S128` - verify the editor autofix capability and enroll it or record it as a non-capability; `frontend/src/stores/view/editorKeybindings.ts`.
- [x] `P22.S129` - verify the editor frontmatter-edit capability and enroll it or record editor-surface-only; `frontend/src/app/viewer/MarkdownDocView.tsx`.

### Phase `P23` - coverage guard, verify, review, codify

Land the coverage-grid guard test, run the full gate and a live pass, review, and promote the codification candidate.

- [x] `P23.S130` - add the coverage-grid guard test asserting plane enrollment and cross-plane id identity; `frontend/src/stores/view/actionCoverage.guard.test.ts`.
- [x] `P23.S131` - run the full frontend lint gate to exit zero; `frontend`.
- [x] `P23.S132` - live-verify the newly enrolled verbs across the palette and menus; `frontend/src/app/palette`.
- [x] `P23.S133` - run the formal code review of the convergence delta; `.vault/audit/2026-06-22-action-surface-mapping-review-audit.md`.
- [x] `P23.S134` - promote the action-verbs-enroll-on-their-eligible-planes-by-shared-id rule after the cycle holds; `.vaultspec/rules/rules/action-verbs-enroll-on-their-eligible-planes-by-shared-id.md`.

## Description

Re-scoped from a 117-step blanket re-enrollment matrix to a verified coverage DELTA,
per the `2026-06-22-action-surface-mapping-adr` and the
`2026-06-22-action-surface-mapping-audit`. The audit (three rag-grounded audits plus
source verification) established that the action surface is ALREADY architecturally
converged: one shared `ActionDescriptor` is the verb unit for all three planes; the
keymap registry, the per-kind resolver registry, and the command-provider registry are
siblings cross-referenced by one shared action-id namespace; there is exactly one
global keydown listener; one resolver per entity kind; one shortcut persistence (the
engine `keybindings` setting) from which the legend, the dispatcher, and the palette
accelerators all derive; and one TanStack-backed backend-state authority with no
split-brain. The convergence the campaign sought is largely done.

What remains is coverage, not structure. This plan closes the verified gaps and leaves
a build-gated guarantee instead of a one-time sweep:

- Capture the 6-domain x 3-plane coverage grid as a reference (the single source for
  what is enrolled vs eligible-but-missing).
- Surface the keymap-only `focus-filter` / `clear-filter` verbs as palette commands
  under their existing shared ids.
- Enroll the right-rail commit / pull-request verbs on their eligible plane and resolve
  the right-rail command-provider asymmetry.
- Verify the editor `autofix` / `frontmatter` verbs are real capabilities and enroll
  them, or record the non-capability rather than ship a disabled lie.
- Land a coverage-grid guard test asserting each verb is enrolled on its eligible
  planes under one shared id, then verify, review, and codify.

Each enrolled verb keeps ONE action id across the planes it rides, so accelerator
derivation and the legend stay correct. A verb that genuinely belongs to one plane only
(an input-requiring `rename`, a target-only menu verb) is left there, not forced onto
another. Region/focus enrollment stays the in-flight `keyboard-navigation` campaign's
territory and is not duplicated here. Binding rules:
`keyboard-shortcuts-bind-through-the-one-keymap-registry`, `unified-action-plane`,
`palette-commands-come-from-the-one-provider-registry`,
`palette-command-accelerators-derive-from-the-keymap-registry`.

## Steps

The executable structure is the five Phase blocks above (`P19` through `P23`). The
canonical Step rows live under their Phases; this section is the narrative anchor.

## Parallelization

`P19` (the coverage grid) is the hard predecessor: it pins what is actually missing, so
every later phase enrolls against the grid rather than a remembered shape. `P20`
(left-rail palette gaps), `P21` (right-rail commit/PR + provider), and `P22` (editor
capability verbs) are mutually independent and may run in parallel, one per agent. `P23`
(guard + verify + review + codify) is the barrier: the guard test depends on every
enrollment landing, and the review closes the cycle. Within `P21` and `P22` the
capability-grounding Step is the hard predecessor of its enrollment Steps (a verb is
only enrolled once confirmed a real capability).

## Verification

- The coverage grid reference exists and is accurate; every later phase enrolled against
  it, and any verb left on a single plane carries a recorded reason (not a silent hole).
- The verified gaps are closed: `focus-filter` and `clear-filter` are reachable from the
  palette under their existing keymap ids; the right-rail commit / pull-request verbs are
  enrolled on their eligible plane; the editor `autofix` / `frontmatter` verbs are either
  enrolled or recorded as non-capabilities (no disabled lie).
- The coverage-grid guard test passes and asserts, for each declared surface verb, that
  it is enrolled on its eligible planes AND that its action id is identical across them
  (so accelerator derivation holds).
- Cross-plane id consistency holds; no verb's id diverges across keymap, resolver, and
  palette.
- `just dev lint frontend` is green (eslint, prettier, tsc, px, tokens, figma-registry)
  and the touched-module tests pass; the convergence delta is reviewed PASS.
- No re-architecture of the converged core (the three registries, the dispatcher, the
  settings schema, the TanStack stores) was performed.
- The plan is complete when every Step is closed (`- [x]`).
