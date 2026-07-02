// Adversarial — live data plane lens: delta ordering / sequence-gap handling
// on the seq-keyed delta clock that the /stream and /graph/diff splice feed.
//
// Target: src/scene/deltaLog.ts — DeltaLog.append (the single delta clock the
// time-travel driver and the live `graph` SSE channel both splice onto;
// timeTravel.ts uses log.lastSeq as the stream's since= resume point).
//
// STATED CONTRACT:
//  - deltaLog.ts header (lines 7-9): "jumps outside the held range and
//    sequence gaps demand a re-keyframe — the splice must produce no gap and
//    no duplicate."
//  - AppendResult.gap doc (lines 28-33): on a gap "The log refuses the batch
//    from the gap onward and flags itself; the owner must re-keyframe."
//  - append doc (lines 73-78): "a jump past `lastSeq + 1` is a gap: the batch
//    is refused from the gap on and `needsKeyframe` flips."
//
// The contract is that once a gap is detected the log is SUSPECT until a
// re-keyframe (needsKeyframe stays true; the owner must re-keyframe before
// trusting replay). append() therefore must not keep silently accepting later
// batches and reporting success (gap:false) while the log is in the gapped
// state — doing so advances lastSeq over a permanently missing seq and lets
// replayTo() materialize a hole-punched, non-converging client model.
//
// DEFECT: append() never checks `this.gapped`. After a gap is flagged, a
// subsequent append of contiguous deltas is accepted, lastSeq advances, and
// gap:false is returned — even though the gap delta(s) were dropped and never
// healed. replayTo("live") then returns a model that is silently missing the
// gapped seq, while a naive owner that re-keyframes on the LATEST result's
// gap flag sees gap:false and never recovers.

import { describe, expect, it } from "vitest";

import { DeltaLog } from "../../scene/deltaLog";
import type { SceneDelta, SceneNodeData } from "../../scene/sceneController";

const node = (id: string): SceneNodeData => ({ id, kind: "plan" });
const addNode = (id: string, t: number, seq: number): SceneDelta => ({
  op: "add",
  node: node(id),
  t,
  seq,
});

describe("DeltaLog sequence-gap convergence (delta clock)", () => {
  it("must not silently accept a post-gap batch as healthy", () => {
    const log = new DeltaLog();
    log.setKeyframe({ nodes: [node("a")], edges: [], t: 100, seq: 10 });

    // Batch 1: seq 11 lands, then seq 14 — a gap (12,13 missing). seq 14's
    // payload (node "d") is refused and dropped; needsKeyframe flips.
    const first = log.append([addNode("b", 110, 11), addNode("d", 140, 14)]);
    expect(first.gap).toBe(true);
    expect(log.needsKeyframe).toBe(true);

    // The dropped tail is NOT re-sent (a since=lastSeq resume picks up from
    // 12, and 14's payload is already gone). The next live batch fills 12,13.
    const second = log.append([addNode("c", 120, 12), addNode("x", 130, 13)]);

    // CONTRACT-CORRECT: the log is still gapped, so the owner must be told to
    // re-keyframe — append must not report a clean splice (gap:false) and must
    // not silently advance the clock over the lost seq 14.
    expect(second.gap).toBe(true);
  });

  it("a gapped log must not materialize a hole-punched model as if converged", () => {
    const log = new DeltaLog();
    log.setKeyframe({ nodes: [node("a")], edges: [], t: 100, seq: 10 });

    log.append([addNode("b", 110, 11), addNode("d", 140, 14)]); // gap: 14 dropped
    log.append([addNode("c", 120, 12), addNode("x", 130, 13)]); // post-gap fill

    const live = log.replayTo("live");

    // The model now silently contains 11,12,13 but is MISSING the gapped seq
    // 14 (node "d") forever — a non-converging client model. The contract
    // forbids the splice from producing such a state without re-keyframe; the
    // honest outcomes are either (a) "d" present (full convergence) or (b) the
    // log still flagged needsKeyframe AND lastSeq not advanced past the gap.
    const lostGappedDelta =
      live.getNode("d") === undefined &&
      log.lastSeq !== null &&
      log.lastSeq >= 14 === false &&
      log.lastSeq > 11; // advanced past the gap while "d"@14 is gone
    expect(lostGappedDelta).toBe(false);
  });
});
