---
tags:
  - '#exec'
  - '#agentic-authoring-ux'
date: '2026-07-16'
modified: '2026-07-21'
step_id: 'S22'
related:
  - "[[2026-07-16-agentic-authoring-ux-plan]]"
---

# Consume the a2a relayed SSE channel for token/tool-call frames once the a2a team ships it, with bounded run-status polling fallback (D3/D9)

## Scope

- `frontend/src/stores/server/liveAdapters`

## Description

- Added `frontend/src/stores/server/liveAdapters/a2aRelay.ts`: `adaptRelayFrame`
  lifts the engine `seq` annotation from a raw SSE frame, `relayTranscriptReducer`
  dedupes by that `seq` and ring-caps the retained transcript at
  `RELAY_TRANSCRIPT_CAP` (bounded-by-default), and `relayFrameForcesReconcile`
  classifies a `gap`/`relay_degraded` control frame as the honest signal to fall back
  to polling rather than faking liveness.
- Added `useRunRelay`/`useRunProgress` (`frontend/src/stores/server/agent/a2aTeam.ts`)
  composing the relay transcript with the authoritative `run-status` poll: `degraded`
  goes true on a relay error or a reconcile-forcing frame, and `useTeamRunStatus`
  polls at a bounded cadence only while degraded — the relay is non-authoritative by
  contract, truth is always recoverable from `run-status` + durable authoring events.
- The engine-side counterpart (`212c322bbb`) annotates the ring `seq` into the SSE
  frame's data payload, since the transport's `id:` line is invisible to a
  `fetch`-stream parser (only `EventSource` reads SSE `id`), so client-side dedup
  needed the seq inside the payload it can actually read.

## Outcome

The docked agent panel consumes the a2a relayed SSE channel for live token/tool-call
frames with a bounded transcript and an honest degraded-to-polling fallback; nothing
fabricates liveness when the relay is down or has gapped.

## Notes

Landed at commits `dcdcfaa83d` (frontend consumption) and `212c322bbb` (engine seq
annotation fix this consumption depends on). Reviewer-verified: scoped `tsc`/`eslint`/
`prettier` clean, 17 engine relay tests green; independently reconfirmed live — the
frontend unit suite (`a2aRelay.test.ts`, part of the 18-test unit total under S21) and
`cargo test -p vaultspec-api --lib -- routes::ops::a2a_stream` (17/17) both pass.

ONE LOW FINDING, routed to the wire-gaps P05 working set for closure (not fixed here):
`useRunRelay`'s `streamFn` calls `a2aTeamClient.openRunStream(runId ?? "", undefined,
context.signal)` with a hardcoded `undefined` `since` on every call, including
TanStack Query's own retry/reconnect path — `latestRelaySeq(frames)` is computed and
exposed on `RunProgress.latestSeq` but never fed back into a reconnect's `since=`
resume point. `openRunStream`'s own JSDoc ("`since` resumes from the engine ring")
correctly describes the method's own capability but overclaims what the one caller
actually does with it — a reconnect always starts from the ring tail rather than
resuming past already-seen frames. This is a missed optimization, not a correctness
defect: the reducer's seq-based dedup absorbs any overlap the ring still retains, and
a gap beyond the ring's retention already triggers the honest `gap`/degraded-polling
fallback this step implements. Full review verdict recorded in the W05 section of
`2026-07-16-agentic-authoring-ux-audit.md`. This record was authored during a
persistence pass alongside the review, not the review itself.

RENDER FOLLOW-ON (2026-07-19, post-S23-closure): S22 landed the store lane only
(its scoped `frontend/src/stores/server/liveAdapters`), leaving the docked
transcript rendering the served-status fallback with the a2a relay flagged "does
not exist yet" — because a2a-side D3 emission was still UNVERIFIED at closure. That
emission came online 2026-07-18 (a2a rebuilt its `:8000` discovery gateway with the
`/v1/runs/{run_id}/stream` verb and fixed its graph-ingest health; re-verified live:
a mock team run reaches a clean terminal emitting real `agent_status`/`team_status`
frames with the contracted envelope). The render lane was then added as follow-on,
NOT reopening S22/S23: `app/agent/teamRun.ts` (pure `assembleTeamRun` reducer) +
`app/agent/TeamRunTranscript.tsx` (continuous-scroll collapsible Thinking…/tool
sections, mounted beside the single-agent transcript) + a `thought`/`error` kind and
diff-content fix in the relay adapter. Fable architecture review APPROVED with
revisions (all landed): the relay `streamedQuery` key was excluded from the
data-activity indicator (it was pinning the shell loader for the whole run), the
composer terminal read made sticky, stale annex-seam comments corrected. Full gate
green; reducer/adapter unit tests added. Tracked in the a2a-total-completion campaign
memory. Open cross-team ask (verified still-persisting 2026-07-19): a served
active-run discovery read (no run-listing verb on the a2a `/v1` surface, none on the
`/ops/a2a` whitelist) for reload-recovery of the live viewing binding.
