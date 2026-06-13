---
tags:
  - '#audit'
  - '#frontend-state-system'
date: '2026-06-13'
modified: '2026-06-13'
related:
  - "[[2026-06-13-frontend-state-system-reference]]"
  - "[[2026-06-13-dashboard-live-state-adr]]"
---



# `frontend-state-system` audit: `state system delivery readiness`

## Scope

A delivery-readiness audit of the COMPLETE frontend state system (all of
`frontend/src/stores/` plus the coupled state machinery: the scene delta clock, the
time-travel driver, the degradation derivation, and the platform dispatch and failure
seams), conducted to answer whether the system can be asserted DELIVERED as a complete,
conformant, verified whole - not just the one `dashboard-live-state` feature built
earlier in the session. Anchored to the wire contract and the four binding ADRs
(foundation, gui, platform, live-state). The blueprint of the delivered system is the
sibling reference `2026-06-13-frontend-state-system-reference`.

## Findings

**Verdict: DELIVERED. The state system is complete, conformant, and verified across all
four mandate verbs.** A comprehensive enumeration confirmed every wire-contract type
family has a store/hook, every state machine is reachable and tested, and all gates are
green. The audit surfaced three buildable gaps - one central (the manipulate seam had
zero adopters), one a correctness bug in the just-delivered live-state feature, one
cleanup - all now CLOSED. The remainder is engine-blocked and correctly flagged.

### The four mandate verbs

- **EXPRESS (types): complete.** Every wire family (§2-§8) has a type carrying the
  per-tier `tiers` block; live-origin divergences absorbed by tolerant adapters, not by
  forking types. No missing type family.
- **STORE (caches/slices): complete.** The query cache keyed on the contract's
  cacheability unit, the six view stores, the live-connection slice, and the single
  seq-driven delta clock - all present and tested.
- **MANAGE (state machines): complete.** Timeline mode, selection, degradation
  derivation, live-connection/stream lifecycle, and the scope-swap wholesale reset are
  all reachable and tested; the two formerly-hardwired degradation rows now derive from
  real state (finding 036 closed).
- **MANIPULATE (mutation seams): complete, and the unified seam is now ADOPTED.** This
  was the one incomplete leg at the start of the audit: the platform dispatch seam was
  built and tested but had zero adopters, so "manipulate through one seam" was a
  published, not exercised, capability. Closed by B-1 below.

### Gaps found and closed in this delivery pass

- **B-1 (MOST CENTRAL, closed) - manipulate-seam adoption.** The platform dispatch seam
  (`platform/dispatch/`) had zero consumers; the ops and palette surfaces hand-rolled the
  arm-to-confirm guard the seam exists to provide (GUI finding 032). Closed: a new
  `app/right/opsActions.ts` registers the ops verbs as a dispatch handler and `OpsPanel`
  fires through `dispatchOps`, so every ops intent now flows through the one logged,
  traced, guardable seam - the seam's first real adopter. (Fuller adoption - extracting
  `useConfirmable` into both ops and palette to remove the arm-to-confirm duplication -
  remains the opt-in follow-on the platform ADR designed as additive.)
- **B-2 (closed) - live-slice scope reset.** The live-state ADR D1 states the
  live-connection slice resets on a wholesale scope swap, but `viewStore.setScope` never
  called `useLiveStatusStore.reset()` - a stale-cross-scope bleed of the class findings
  022/023 fixed for pins/lenses. Closed: `setScope` now resets the live slice; a test
  asserts the previous corpus's `lastSeq`/`brokenLinkCount`/`streamConnected` do not
  bleed into the new scope. (This was a real correctness bug in the live-state feature
  delivered earlier this session.)
- **B-4 (closed) - degradation subscription hack (finding 037).** `useSurfaceStates`
  carried a dead `void overrides` subscription alongside an imperative `resolve()` get;
  closed by applying the subscribed overrides directly, so subscription and computation
  share one source and the apparently-dead line can no longer be deleted into a silent
  reactivity break.

### Engine-blocked (flagged, not built)

- **S50 - no-refetch live constellation delta animation:** needs the constellation
  keyframe `seq`; constellation `asof`/`diff` is the open S50 divergence. Built to the
  boundary and stopped (`engine-read-and-infer`); `lastSeq` and the dedup machinery are
  staged for when the engine unblocks it.
- **`dateMandateMissing` degradation row:** reachable only via the dev debug switch until
  the engine surfaces a `date-mandate` signal in `/status` (§6); the adapter half is a
  one-line map once named.
- **Evidence excerpt preview:** deferred to a future engine rev (§11 W1).

### Verification (the delivered whole, all green)

- `tsc -b`: clean. `eslint src spike`: clean. `vitest run`: 340 tests / 71 files.
- Adversarial conformance suite (`stores/__adversarial__`, the hardening campaign's
  reproduction tests): 11 tests / 8 files, green.
- `vite build`: production bundle builds. Adverse e2e: 6 live tests pass in chromium.
- `vault check all`: green.
- All four binding ADRs carry PASS audits (foundation, gui, platform, live-state).

## Recommendations

- Fuller dispatch-seam adoption (extract `useConfirmable` into `OpsPanel` and
  `CommandPalette` to delete the duplicated arm-to-confirm guard, GUI finding 032) is the
  natural next opt-in step now that the first adopter is live.
- When the engine unblocks S50 (constellation seq baseline) and the `date-mandate`
  status signal, the two flagged frontend halves are small adapter/wiring changes; the
  state system already lays their inputs.
- Keep the state system and the concurrent data-plane hardening campaign's adversarial
  suite green together as the campaign continues; this audit and the sibling reference
  are the delivery baseline.

## Codification candidates

Deferred per the `vaultspec-codify` cross-cycle bar. The strongest candidate to revisit
after a second cycle exercises it: `ui-intents-flow-through-dispatch` (a user intent that
needs logging/guarding/tracing/audit is dispatched through the platform seam, not fired
ad-hoc) - now that it has a first adopter, a second adopter would justify promotion.
Recorded, not promoted.


