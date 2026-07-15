---
tags:
  - '#research'
  - '#agentic-feedback-loop'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - "[[2026-07-14-agentic-document-offering-research]]"
  - "[[2026-07-14-agentic-document-offering-reference]]"
---

# `agentic-feedback-loop` research: `anchored comment batches for agent revision`

This focused decision research evaluates how users should revise generated documents
with agents and how editorial feedback relates to the existing proposal-governance
plane.

## Findings

The current comments plane is the correct durable substrate for iterative feedback, but
it only targets canonical documents and heading sections. The selector holds heading
path, expected section hash, and advisory `range_hint`; range and line data do not
participate in identity (`frontend/src/stores/server/authoringComments.ts:42`,
`engine/crates/vaultspec-api/src/authoring/sections.rs:35-113`). Generated, unapplied
artifacts and selected text cannot currently be addressed.

The accepted exact section-operation selector supplies the safe extension model:
structural containing section, selected preimage and hash, revision-fenced byte hints,
and exact-or-conflict resolution. Line numbers remain display coordinates. A DOM
selection range is not durable or authenticated source identity.

Comments are not agent input today. `StartPromptTurnRequest` carries only `prompt` and
optional `summary` (`engine/crates/vaultspec-api/src/authoring/api/mod.rs:392`).
Flattening comments into prompt text would discard anchor, actor, target revision, and
comment identity and would make retries ambiguous.

The sibling A2A service does not close this gap. Its current `POST /api/threads`
request accepts an initial message, team preset, and thread metadata, but no feedback
batch reference. The accepted five-verb dashboard gateway and a continuation contract
are both unimplemented. Anchored revision is therefore a future cross-repository
addition, not behavior the first composer may imply is already available.

Current first-party Claude and GitHub agent guidance supports batching targeted requests
before execution. Immediate execution for each comment creates fragmented revisions and
races while the user is still annotating. The safe handoff is an explicit, immutable,
bounded feedback batch linked to a continuation turn.

Product iteration and governance are distinct. Comments request editorial work;
approval authorizes one exact proposal revision. The Review Station must remain the
authority plane for policy gates, destructive operations, stale or conflicted work,
rollback, audit, and exceptional intervention. It should no longer define the principal
authoring experience. The happy path remains the standard conversation: pending
document comments attach as context to the user's next ordinary message.

Recommendation: extend comment anchors to a versioned union for document, section, and
exact selection targets, including generated artifact and proposal-revision identity.
Submitting the next composer message snapshots attached comments and the instruction
into a bounded feedback batch. The agent returns a new ledgered revision but cannot
resolve, delete, rewrite, or impersonate human comments. This adds no custom revision
button, review card, or per-comment agent disposition state. Approval and comment
resolution remain separate facts.
