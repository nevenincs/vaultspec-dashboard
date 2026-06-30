---
tags:
  - '#audit'
  - '#rag-affordance-adoption'
date: '2026-06-27'
modified: '2026-06-27'
related:
  - "[[2026-06-27-rag-affordance-adoption-plan]]"
---

# `rag-affordance-adoption` audit: `code review verification`

## Scope

Verify-phase review of the `rag-affordance-adoption` feature: the machine-global discovery
candidate (`rag-client/client.rs`) and the version-tolerant `--json` start with rag's
authoritative failure reason (`vaultspec-api/routes/ops.rs`). The review focused on the
load-bearing property - the change must NOT break against any released rag version - plus
the additivity of the new discovery candidate and the structured-reason parse. Verdict:
ship.

## Findings

- **Version-tolerance: PASS (and hardened).** The first start runs with `--json`; on a
  non-zero exit `rag_rejected_json` triggers a retry of the plain start (args minus
  `--json`), then control falls through to the unchanged exit-0/reprobe logic - so an older
  rag reaches today's exact behavior and a new rag keeps `--json` and reads the structured
  reason. The reviewer's Medium (the retry rested on text recall, and at deploy time EVERY
  released rag is an "older rag" so the retry is on the hot path) was addressed: the retry
  now triggers PRIMARILY on typer's usage-error exit code 2 (text-independent), with the
  unknown-option text scan as a belt-and-suspenders. rag's own `--json` failures exit 1, not
  2, so this never misfires on a real start failure.
- **Discovery additivity: PASS.** The machine pointer is the first candidate, the
  STATUS_DIR-default file is next, the per-scope file last; `discover_at` skips an absent
  candidate, so an older rag falls through unchanged (proven by a real `discover_at` test).
  The stale-pointer concern (L1) is closed: rag writes both files from one heartbeat tick
  with the same payload, now noted in the precedence comment.
- **`rag_start_failure`: PASS.** Parses `{ok:false, error, data}` only (a success/non-envelope
  returns None -> degrade); the surfaced `rag_error`/`rag_data` are additive, never
  overriding the engine's status/reason/attach vocabulary; panic-free. Now reads stdout then
  falls back to stderr (L2) so the reason is lifted regardless of which stream rag uses.
- **Probe-first attach: unchanged.** An already-running service still returns
  `already_running` without calling start.
- **Conventions: PASS.** engine-read-and-infer (rag's outcome forwarded, no invented
  lifecycle semantics); no mocks; clippy/fmt clean; `run.combined()` bound once (N2).

## Recommendations

All actionable findings were fixed in the same feature branch before merge: the Medium
(exit-code-2 text-independent retry), L1 (lockstep-heartbeat note), L2 (stderr fallback for
the structured reason), and N2 (bind `combined()` once). The remaining notes are accepted:
the `qdrant-server` path coupling matches the pre-existing `.vaultspec-rag/service.json`
hardcode and is documented (L3); a hermetic test of the full async retry orchestration is
awkward under the no-mocks mandate, and the leaf predicates are unit-tested (L4).

## Codification candidates

- **Source:** the version-tolerance design plus the reviewer's exit-code hardening.
  **Rule slug:** `cross-repo-cli-adoption-is-version-tolerant`.
  **Rule:** When the engine adopts a new flag or output shape on a sibling CLI it shells out
  to, it must version-tolerate - try the new flag and fall back to the prior invocation when
  the sibling rejects it (preferring the sibling's usage-error exit code over text matching),
  and parse the new structured output only when present, degrading to the prior behavior
  otherwise - so the engine never breaks against a sibling version that predates the feature
  and needs no cross-repo release ordering.

Per the codify discipline, this holds one full execution cycle before promotion. The natural
promotion occasion is the next sibling-CLI flag/output the engine adopts. Promote with
`vaultspec-core vault rule promote --from 2026-06-27-rag-affordance-adoption-audit --as cross-repo-cli-adoption-is-version-tolerant`.
