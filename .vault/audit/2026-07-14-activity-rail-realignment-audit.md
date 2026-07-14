---
tags:
  - '#audit'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - '[[2026-07-14-activity-rail-realignment-plan]]'
  - '[[2026-07-14-activity-rail-realignment-adr]]'
---

# `activity-rail-realignment` audit: `status-only rail, footer cluster, control panels`

## Scope

Adversarial review (vaultspec-code-reviewer persona, Opus, named rail-reviewer)
of the full realignment delivery — commits 621e209022 (stores/action plane),
a78e241414 (chrome + rail eviction + shell scroll restructure), 1698ce53c0
(compact parity + guards) — against the ADR (D1-D6), the plan, and the standing
frontend laws (store selectors, layer boundaries, wire contract, action plane,
mount-gating, design system). Initial verdict: WITHHELD on two HIGH findings;
revisions landed same-day (see per-finding status).

## Findings

### shelllayout-test-stale | high | shellLayout.test.ts red; the S14 "gate green" claim was false

The scroll restructure (`SHELL_ACTIVITY_RAIL_CLASS` / `SHELL_ACTIVITY_PANEL_CLASS`
in `stores/view/shellLayout.ts`) moved the rail scroll onto the inner panel, but
its own suite still asserted the pre-refactor class strings, so
`stores/view/shellLayout.test.ts` failed (1 failed | 11 passed) while the S14
record claimed the gate green — a dev-workflow breach (the touched-suite run
missed this file). FIXED: the expected strings re-pinned to the restructured
classes with a D2 comment; suite green (12/12).

### vault-chip-green-word | high | ambient Vault chip contradicted its own panel on a healthy vault

The engine's canonical healthy vault word is `green` (the live adapter's
vault-green rollup); the chip's healthy-word set in
`stores/server/queries/frameworkStatus.ts` held only `healthy`/`ok`, so the
always-visible cluster chip showed attention (yellow) on a healthy vault while
the Vault health panel it opens — using its own local set including `green` —
showed ok. FIXED: one shared exported `HEALTHY_VAULT_WORDS` (healthy/ok/green)
now feeds both the chip and the panel (the panel's local duplicate deleted),
with a `green` chip test case pinning the canonical word.

### ops-receipt-bleed | low | the global ops receipt could surface a foreign verb in the Vault panel

`useOpsReceipt` is a global singleton (reset only on scope/time-travel), so a
future second dispatcher could paint its receipt under "Run vault check".
FIXED: the panel filters the shared receipt to `verb === "vault-check"`.

### stale-header-comment | low | StatusTab comment said "six fold headers"; five after the eviction

Doc-only. FIXED.

### Cleared on verification (not defects)

The dropped rail wrapper gap (StatusTab supplies its own spacing); the compact
height interplay (single inner scrollbar, sticky headers pin correctly, footer
unobstructed); no consumers of the shell activity classes beyond the desktop
rail; keymap/focus regions and F6 traversal intact; retired ids drop cleanly on
rehydrate while `rag-ops:details` stays live inside the panel; the approvals
count is suppressed under truncation (no client re-count); labels are
plain-language; the review-badge poll is bounded (SSE-driven, no interval).

## Recommendations

- Revision commit re-runs the touched suites INCLUDING the test file beside any
  edited stores module — the S14 miss was exactly a beside-file omission.
- File the two served-truth follow-ons toward the engine: per-tier human
  reasons for structural/declared/temporal degradation, and a lightweight
  pending-approvals count route so the chip can show an exact number on a
  truncated queue.
- Post-fix status: both HIGH and both LOW findings fixed in revision commit
  3fde848dc2 and verified (110 tests green across the touched suites,
  tsc/eslint/prettier clean).
- Reviewer re-check (same day): all four fix sites independently verified,
  four affected suites re-run green (56 tests). Verdict: APPROVED — the
  withhold lifts; no CRITICAL/HIGH remaining.
