// Keyframe + delta replay on the single sequence clock (W01.P02.S06, ADR
// G4.b; contract: keyframe + diff committed, REDLINE-3 single delta clock).
//
// The client holds a keyframe (a full snapshot from the asof endpoint) plus
// an ordered delta log (diff entries and live `graph` SSE events share one
// shape and one monotonic sequence). Scrubbing replays deltas locally at
// frame rate with zero per-frame queries; jumps outside the held range and
// sequence gaps demand a re-keyframe — the splice must produce no gap and
// no duplicate. Scene-layer module: framework-free by design.

import { SceneGraphModel } from "./graphModel";
import type { SceneDelta, SceneEdgeData, SceneNodeData } from "./sceneController";

export interface Keyframe {
  nodes: readonly SceneNodeData[];
  edges: readonly SceneEdgeData[];
  /** Timestamp of the snapshot (the asof T). */
  t: number;
  /** Sequence position of the snapshot on the shared delta clock. */
  seq: number;
}

export interface AppendResult {
  /** Deltas accepted onto the log (in order). */
  accepted: number;
  /** Deltas dropped as already-held duplicates (seq at or below the splice). */
  duplicates: number;
  /**
   * True when the incoming batch left a sequence gap. The log refuses the
   * batch from the gap onward and flags itself; the owner must re-keyframe.
   */
  gap: boolean;
}

export class DeltaLog {
  private keyframe: Keyframe | null = null;
  private deltas: SceneDelta[] = [];
  /** Materialized state at the cursor. */
  private model = new SceneGraphModel();
  /** Index into `deltas` of the first entry NOT applied to `model`. */
  private cursor = 0;
  private gapped = false;

  /** Highest sequence number held (keyframe seq when the log is empty). */
  get lastSeq(): number | null {
    if (this.deltas.length > 0) return this.deltas[this.deltas.length - 1].seq;
    return this.keyframe?.seq ?? null;
  }

  /** True after a sequence gap was detected; replay output is suspect. */
  get needsKeyframe(): boolean {
    return this.gapped || this.keyframe === null;
  }

  /** The held range start (keyframe T), or null before the first keyframe. */
  get keyframeT(): number | null {
    return this.keyframe?.t ?? null;
  }

  /**
   * Install a keyframe. Resets the log: held deltas predate the snapshot by
   * definition of the shared clock (their seq is at or below the keyframe's)
   * or must be re-fetched against it.
   */
  setKeyframe(keyframe: Keyframe): void {
    this.keyframe = keyframe;
    this.deltas = [];
    this.cursor = 0;
    this.gapped = false;
    this.model.setData(keyframe.nodes, keyframe.edges);
  }

  /**
   * Append ordered deltas (diff response or live SSE batch — one code path,
   * per the contract's shared delta shape). Entries at or below `lastSeq`
   * are dropped as duplicates (idempotent splice at the LIVE boundary); a
   * jump past `lastSeq + 1` is a gap: the batch is refused from the gap on
   * and `needsKeyframe` flips.
   */
  append(incoming: readonly SceneDelta[]): AppendResult {
    if (this.keyframe === null) {
      return { accepted: 0, duplicates: 0, gap: true };
    }
    let accepted = 0;
    let duplicates = 0;
    for (const delta of incoming) {
      const last = this.lastSeq!;
      if (delta.seq <= last) {
        duplicates += 1;
        continue;
      }
      if (delta.seq > last + 1) {
        this.gapped = true;
        return { accepted, duplicates, gap: true };
      }
      this.deltas.push(delta);
      accepted += 1;
    }
    return { accepted, duplicates, gap: false };
  }

  /**
   * Materialize the state as of time `t` ("live" = end of log) and return
   * the model. Forward motion applies pending deltas incrementally (the
   * 60fps scrub path); backward motion rebuilds from the keyframe — large
   * backward jumps are exactly the contract's re-keyframe case, and the
   * rebuild keeps small ones correct in the meantime.
   *
   * The CURSOR is driven by sequence position, never by timestamp: the
   * contract guarantees seq monotonicity only — equal or non-monotonic
   * timestamps inside a monotonic-seq batch are legal (audit finding
   * replay-clock-conflation-005). `t` selects the target seq (the last
   * delta whose label is ≤ t, including its whole ts-collision group);
   * everything after is pure seq arithmetic.
   */
  replayTo(t: number | "live"): SceneGraphModel {
    if (this.keyframe === null) {
      throw new Error("DeltaLog.replayTo before setKeyframe");
    }
    // Resolve t → target index: the count of deltas with label ≤ t. A
    // single backward scan from the end handles non-monotonic labels by
    // including every delta up to the LAST one satisfying the bound.
    let targetIndex = this.deltas.length;
    if (t !== "live") {
      while (targetIndex > 0 && this.deltas[targetIndex - 1].t > t) {
        targetIndex -= 1;
      }
    }
    if (targetIndex < this.cursor) {
      // Backward: rebuild from the keyframe.
      this.model.setData(this.keyframe.nodes, this.keyframe.edges);
      this.cursor = 0;
    }
    while (this.cursor < targetIndex) {
      this.model.applyDelta(this.deltas[this.cursor]);
      this.cursor += 1;
    }
    return this.model;
  }
}
