---
tags:
  - '#audit'
  - '#temporal-graph-layout'
date: '2026-06-17'
modified: '2026-06-18'
related: []
---

# `temporal-graph-layout` code review

## Scope

Reviewed the temporal Cosmos reimplementation paths: timeline-to-scene mapping, deterministic day clustering, representation mode routing, scene field static layout behavior, dashboard-state mode contract, and focused frontend/backend tests.

## Findings

## spatial-return-001 | medium | Spatial selection does not leave canonical time-travel mode

Selecting a spatial mode while Timeline is active calls `movePlayhead("live")`, but the dashboard-state `timeline_mode` is not patched back to `live`. The UI then continues to read canonical state as `time-travel`, so the Timeline segment remains active and the graph scene can remain gated as temporal even after the user selected a spatial representation. The focused `GraphControls.render.test.tsx` run caught this with `timeline_mode.kind` still equal to `time-travel`.

Status: resolved in the implementation by patching spatial selection to write `timeline_mode: { kind: "live" }` through the dashboard-state mutation. The focused layout selector test now passes.

## Recommendations

Patch spatial selection to write `timeline_mode: { kind: "live" }` through the dashboard-state mutation before or alongside the representation-mode change, then rerun the focused layout selector tests.

## Codification candidates

None.

## follow-up-review-002 | low | Temporal canvas follow-up review found no new implementation defect

Reviewed the added accessible node controls, hotspot bucket guides, temporal debug text, edge capping, and scene-controller temporal representation coverage. The earlier unbounded-edge behavior found during browser inspection was resolved by capping self-consistent arcs with the existing timeline arc ceiling before sending them to Cosmos. Focused temporal and graph-control tests pass.

Residual verification note: full frontend typecheck is currently blocked by unrelated `scope` prop errors in `ChangesOverview.tsx` and `MarkdownReader.test.tsx`. Clean post-cap browser screenshot capture also remained unstable, so visual browser verification stays open in the plan.

## final-review-003 | low | Final temporal graph layout review passes

Reviewed the completed temporal graph layout implementation after browser verification closed the final plan row. The final state keeps the Timeline UX skeleton, mounts the Cosmos canvas as the main temporal surface, feeds it bounded temporal scene data, preserves individual same-day document nodes, keeps edges visual but non-authoritative for layout, exposes bucket/debug/truncation state, and retains accessible node summaries. No new high or critical findings were identified.

Final verification evidence: frontend typecheck passed, focused temporal and graph-control tests passed, backend dashboard-state route test passed, formatting passed, VaultSpec plan status reached 23 of 23, and the live browser screenshot artifact shows the post-cap temporal Cosmos canvas.
