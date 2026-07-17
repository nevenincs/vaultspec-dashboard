---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S06'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# Add a versioned run stream verb under the v1 a2a gateway re-serving the bounded SSE progress frames on the public surface, with live tests, in the vaultspec-a2a repository

## Scope

- `src/vaultspec_a2a/api/`

## Description

- Extract a shared `build_thread_stream_response` helper in the internal SSE route module (`thread_stream.py`) that resolves a thread, raises a caller-vocabulary 404 when absent, and returns the `text/event-stream` StreamingResponse over the existing bounded frame generator.
- Re-point the internal `GET /api/threads/{thread_id}/stream` route at the extracted helper so no relay logic is duplicated.
- Add the versioned `GET /v1/runs/{run_id}/stream` verb to the v1 gateway router, delegating to the shared helper with a `Run not found` 404 detail; a run id is the thread id, so it reuses the same run/thread mapping run-status already uses.
- Update the gateway module docstring to record the new streaming companion verb.
- Add two live, mock-free tests over a real TCP socket: mid-stream versioned progress delivery plus terminal-close on the run surface, and the run-vocabulary 404 for an unknown run.

## Outcome

The public engine-facing edge now exposes a droppable SSE progress relay alongside the authoritative run-status snapshot. The verb re-serves the identical `api_version: v1` stamp, the 256 KiB per-frame bound with the `progress_dropped` degradation sentinel, and the terminal-replay-then-close semantics, all through a single code path shared with the internal route. `ruff check` and `ty check` pass on the touched modules; the two new live tests pass and all pre-existing gateway/stream tests remain green. Landed in vaultspec-a2a as commit on the run-stream verb.

## Notes

One pre-existing failure in `test_presets_list_is_truthful_and_resilient` (`assert "zai" in zai_reasons`) is environment-dependent on Z.ai credential state in the host env and reproduces on clean HEAD without these changes; it is unrelated to the run-stream verb and out of scope for this Step.
