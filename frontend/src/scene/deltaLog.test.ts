import { describe, expect, it } from "vitest";

import { DeltaLog } from "./deltaLog";
import type { SceneDelta, SceneNodeData } from "./sceneController";

const node = (id: string): SceneNodeData => ({ id, kind: "plan" });

const addNode = (id: string, t: number, seq: number): SceneDelta => ({
  op: "add",
  node: node(id),
  t,
  seq,
});

const removeNode = (id: string, t: number, seq: number): SceneDelta => ({
  op: "remove",
  node: node(id),
  t,
  seq,
});

const keyframe = () => ({
  nodes: [node("a")],
  edges: [],
  t: 100,
  seq: 10,
});

describe("DeltaLog", () => {
  it("requires a keyframe before append or replay", () => {
    const log = new DeltaLog();
    expect(log.needsKeyframe).toBe(true);
    expect(log.append([addNode("b", 101, 11)])).toEqual({
      accepted: 0,
      duplicates: 0,
      gap: true,
    });
    expect(() => log.replayTo("live")).toThrow();
  });

  it("replays forward to T and to live on one clock", () => {
    const log = new DeltaLog();
    log.setKeyframe(keyframe());
    log.append([
      addNode("b", 110, 11),
      addNode("c", 120, 12),
      removeNode("a", 130, 13),
    ]);
    expect(log.replayTo(115).getNode("b")).toBeDefined();
    expect(log.replayTo(115).getNode("c")).toBeUndefined();
    const live = log.replayTo("live");
    expect(live.getNode("c")).toBeDefined();
    expect(live.getNode("a")).toBeUndefined();
  });

  it("rebuilds from the keyframe on backward scrub", () => {
    const log = new DeltaLog();
    log.setKeyframe(keyframe());
    log.append([addNode("b", 110, 11), removeNode("a", 120, 12)]);
    expect(log.replayTo("live").getNode("a")).toBeUndefined();
    const back = log.replayTo(105);
    expect(back.getNode("a")).toBeDefined();
    expect(back.getNode("b")).toBeUndefined();
    // Forward again after the rewind stays consistent.
    expect(log.replayTo(110).getNode("b")).toBeDefined();
  });

  it("drops duplicate sequence entries at the splice (no duplicate at LIVE)", () => {
    const log = new DeltaLog();
    log.setKeyframe(keyframe());
    log.append([addNode("b", 110, 11)]);
    // Live stream resumes overlapping the held diff: seq 11 is a duplicate.
    const result = log.append([addNode("b", 110, 11), addNode("c", 120, 12)]);
    expect(result).toEqual({ accepted: 1, duplicates: 1, gap: false });
    expect(log.lastSeq).toBe(12);
  });

  it("refuses past a sequence gap and demands a re-keyframe", () => {
    const log = new DeltaLog();
    log.setKeyframe(keyframe());
    const result = log.append([addNode("b", 110, 11), addNode("c", 130, 14)]);
    expect(result).toEqual({ accepted: 1, duplicates: 0, gap: true });
    expect(log.needsKeyframe).toBe(true);
    // Re-keyframe clears the gap state.
    log.setKeyframe({
      nodes: [node("a"), node("b"), node("c")],
      edges: [],
      t: 130,
      seq: 14,
    });
    expect(log.needsKeyframe).toBe(false);
    expect(log.lastSeq).toBe(14);
  });

  it("anchors lastSeq at the keyframe when the log is empty", () => {
    const log = new DeltaLog();
    log.setKeyframe(keyframe());
    expect(log.lastSeq).toBe(10);
    expect(log.keyframeT).toBe(100);
  });
});
