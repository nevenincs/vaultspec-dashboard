---
tags:
  - '#exec'
  - '#agent-wire-gaps'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S44'
related:
  - "[[2026-07-17-agent-wire-gaps-plan]]"
---

# [OWNED BY 2026-07-17-a2a-orchestration-edge-plan P04.S12 - do not execute from this plan unless that plan releases it] Ride the composer's staged comment batch along as a feedback_batch_id created via POST /v1/feedback-batches on submit, recorded on the turn alongside the existing serialized prompt block

## Scope

- `frontend/src/stores/view/agentComposer.ts` (this step's named file)
- `frontend/src/app/agent/Composer.tsx`
- `frontend/src/app/viewer/MarkdownReader.tsx`, `readerComments.ts`
- `frontend/src/stores/server/agent/index.ts`, `wireTypes.ts`
- (substance owned and delivered by `2026-07-17-a2a-orchestration-edge-plan` `P04.S12`)

## Description

This step is explicitly marked in the plan text as OWNED by the
`a2a-orchestration-edge` plan's `P04.S12`, not to be executed from this plan. That
step is ticked on the edge plan and its substance is exactly this step's ask:

- The composer's staged comment batch now rides as a `feedback_batch_id`, created
  via `POST /authoring/v1/feedback-batches` on submit (`buildFeedbackBatchRequest`,
  `useCreateFeedbackBatch`), rather than the interim serialized "Comments to
  address:" prompt prose.
- The prose serialization path (`serializeCommentBatch`,
  `AGENT_COMPOSER_COMMENTS_PREFIX`, and the comments arm of `buildAgentPrompt`) was
  DELETED outright, not left as a parallel path.
- `StartTurnPayload` gained the optional `feedback_batch_id`, recorded on the turn.
- Single-document batch semantics (latest-document-wins, visible via the chip
  count) and the queued mid-run path holding/freezing the batch at dispatch are
  also covered.

## Outcome

The plan's ask is satisfied via the edge plan's already-ticked and already-reviewed
`P04.S12`; no separate execution from this plan was needed or performed, matching
the step's own explicit ownership annotation.

## Notes

Landed at commit `27f2df9005` ("structured feedback-batch continuation, delete
prose serialization"). This record was authored during a fill pass, cross-citing
the edge plan's ownership per the team's committed ownership annotations — no code
change by me.

Independently reverified: `git show 27f2df9005 --stat` matches the reported 10
files; confirmed `2026-07-17-a2a-orchestration-edge-plan` `P04.S12` is ticked; live
rerun of `stores/view/agentComposer.test.ts` (12/12) and
`app/viewer/ReaderComments.render.test.tsx` (part of the combined 33/34 run) — all
green. `Composer.render.test.tsx`'s one red test
(`Composer slash commands > opens on "/" at column 0...`) is the same pre-existing,
unrelated defect already flagged in `S39`'s record — not attributable to this
step's scope.
