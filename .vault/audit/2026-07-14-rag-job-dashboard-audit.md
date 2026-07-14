---
tags:
  - '#audit'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - '[[2026-07-14-rag-job-dashboard-plan]]'
  - '[[2026-07-14-rag-job-dashboard-adr]]'
---

# `rag-job-dashboard` audit: `job dashboard over the codified rag contract`

## Scope

Adversarial review (vaultspec-code-reviewer persona, Opus) of the full L3
delivery — commits 0aa9c344f0 (W01 stores/contract), 4805e6562e (W02 cockpit
chrome), e2aa616da0 (W03 states/guards), plus the W03 files swept into the
concurrent shared-tree commit bb8da4b60a — against the ADR (D1-D7, including
the amended 500-line constraint), the plan, and the standing frontend laws.
The reviewer additionally verified the engine side (the broker forwards
lines/job_id and clamps at its own MAX_RAG_LOG_LINES).

## Findings

### orphaned-console-era-stores | medium | dead code stranded by the earlier console retirement

`stores/view/opsPanel.ts` and `stores/view/ragWatcherConfigDraft.ts` were
referenced only by their own tests, and `useRagWatcherReconfigure` (plus its
normalizer/bounds cluster in `ragControl.ts`) only by the orphaned opsPanel —
pre-existing strandings from the console-era ops panel, surfaced by this
feature's console-retirement sweep. FIXED same-day (orchestrator): all four
files deleted, the watcher-reconfigure client seam removed with a retirement
note (the brokered wire verb remains; a future surface rebuilds the seam —
no bridge), test imports pruned. 94 tests green after the reap.

### jobs-truncation-note-precision | low | served-count read post-parse

The truncation note derives servedCount from the parsed rows, so a malformed
(idless) job row could shift the "N of M" phrasing to imply older jobs when
the missing row was malformed. Cosmetic; accepted as-is.

### log-window-count-vs-filter | low | window count shows fetched size while the client filter narrows rows

The honesty caption states the window explicitly; arguably by-design.
Accepted.

### log-row-index-keys | low | array-index React keys on display-only log rows

Display-only list, re-rendered wholesale per envelope. Accepted.

### verbs-clickable-when-engine-unreachable | low | Doctor/Start dispatch fails cleanly when the engine itself is down

Matches the existing ops idiom (failed mutation receipt, no crash). Accepted.

### Cleared on verification (not defects)

Selector law clean throughout; the logs poll is genuinely panel-mount-gated
(closed panel = zero polls, live-tested); lines clamped 1-500 at hook, key,
and engine; cache keys do not fragment per filter text; truncation/window/
storage honesty all served-derived; the view store never touches the corpus
filter; no raw tiers reads; no import cycle from the envelope's home; verbs
ride the one dispatch seam with disabled-with-reason offline states; the wide
Dialog keeps the compact guard + focus trap; the jobs scroll region is
keyboard-reachable; the console deletion left no dangling references and the
retired fold id rehydrates safely; tests are live-wire and non-tautological.

## Recommendations

- Reap performed (see the medium finding) — no follow-up remains from it.
- The Figma inventory docs were refreshed alongside (retired console node
  annotated, superseded-by recorded; the dashboard frame carries its own
  citation).
- VERDICT: **APPROVED** — no CRITICAL/HIGH; the four LOW findings are
  recorded as accepted with rationale.
