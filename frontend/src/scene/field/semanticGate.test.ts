// graph-viz-quality W03.P08.S40: the SHIPPING Meaning verdict.
//
// Two honesty laws are asserted here, end to end:
//
//   1. SCENE composite gate (graph-node-representation ADR D2):
//      `runSemanticGateOnRealData` SHIPS Meaning when the real served embeddings
//      clear BOTH the formalized scorecard composite (trustworthiness / continuity
//      / Q_NX + neighbourhood-hit + silhouette + nearest-centroid against the
//      calibrated SEMANTIC_THRESHOLDS) AND the embedding-presence floor. It HOLDS
//      when either fails. The synthetic fixture is retained only as the
//      determinism + time guard (`runSemanticGate`), NOT as the verdict.
//
//   2. STORES tiers gate (degradation-is-read-from-tiers-not-guessed-from-errors,
//      ADR D7): `deriveSemanticEmbeddingsView` reads HELD (`unavailable`) from the
//      `tiers` block ALONE — it HOLDS when the search/semantic tier reports down
//      even if some embeddings array is present, and it does NOT flap held on a
//      bare transport error (no tiers => not held). Availability additionally
//      requires the embedding-presence floor.
//
// Together these prove the verdict ships on present embeddings clearing the
// composite + presence floor, and holds from tiers when absent — never inferred
// from an empty array or a transport error.

import { describe, expect, it } from "vitest";

import {
  EngineError,
  type EmbeddingsResponse,
  type TiersBlock,
} from "../../stores/server/engine";
import { deriveSemanticEmbeddingsView } from "../../stores/server/queries";
import type { SceneNodeData } from "../sceneController";
import { generateBlobs } from "./scorecard/generators/blobs";
import {
  SEMANTIC_GATE_DATA_PRESENCE_MIN,
  runSemanticGate,
  runSemanticGateOnRealData,
} from "./semanticGate";

// A well-separated REAL embedding fixture: four Gaussian clusters in 16-D with a
// tight cluster_std, the same shape the synthetic scorecard gate clears. Each
// vector becomes a SceneNodeData carrying its `embedding`, and `labelOf` maps each
// node to its planted cluster so the composite's label-aware metrics are scored.
function realDataFixture(): {
  nodes: SceneNodeData[];
  labelOf: Map<string, number>;
} {
  const fx = generateBlobs({
    count: 96,
    dims: 16,
    clusters: 4,
    clusterStd: 0.45,
    seed: 7,
    centerSpread: 12,
  });
  const nodes: SceneNodeData[] = fx.vectors.map((v, i) => ({
    id: `doc:n${i}`,
    kind: "adr",
    embedding: v,
  }));
  const labelOf = new Map<string, number>();
  fx.labels.forEach((label, i) => labelOf.set(`doc:n${i}`, label));
  return { nodes, labelOf };
}

describe("runSemanticGateOnRealData — the shipping Meaning verdict (D2 composite)", () => {
  it("SHIPS when present embeddings clear the composite AND the presence floor", () => {
    const { nodes, labelOf } = realDataFixture();
    const verdict = runSemanticGateOnRealData(nodes, labelOf);

    // The presence floor: every node carries a real vector → presence 1.
    expect(verdict.presence).toBe(1);
    expect(verdict.presence).toBeGreaterThanOrEqual(SEMANTIC_GATE_DATA_PRESENCE_MIN);

    // The verdict derives from the FORMALIZED scorecard composite (the per-metric
    // AND), not a single separation ratio: a passing composite ships.
    expect(verdict.scorecard.passed).toBe(true);
    expect(verdict.scorecard.metrics.length).toBeGreaterThan(0);
    expect(verdict.scorecard.metrics.every((m) => m.pass)).toBe(true);

    expect(verdict.shipped).toBe(true);
    expect(verdict.reason).toMatch(/REAL-DATA SHIPPED/);
  });

  it("HOLDS on an empty/fallback path (presence floor unmet), reading presence not a ratio", () => {
    // A slice where almost every node lacks an embedding: the unserved-embedding
    // path the synthetic-only gate masked. Presence falls under the floor → held.
    const embedded = realDataFixture().nodes.slice(0, 1);
    const bare: SceneNodeData[] = Array.from({ length: 20 }, (_, i) => ({
      id: `doc:bare${i}`,
      kind: "doc",
    }));
    const nodes = [...embedded, ...bare];
    const labelOf = new Map<string, number>([[embedded[0].id, 0]]);

    const verdict = runSemanticGateOnRealData(nodes, labelOf);
    expect(verdict.presence).toBeLessThan(SEMANTIC_GATE_DATA_PRESENCE_MIN);
    expect(verdict.shipped).toBe(false);
    expect(verdict.reason).toMatch(/REAL-DATA HELD/);
  });

  it("is byte-reproducible: the same fixture yields the same verdict (determinism guard)", () => {
    const a = realDataFixture();
    const b = realDataFixture();
    const va = runSemanticGateOnRealData(a.nodes, a.labelOf);
    const vb = runSemanticGateOnRealData(b.nodes, b.labelOf);
    expect(vb.shipped).toBe(va.shipped);
    expect(vb.presence).toBe(va.presence);
    expect(vb.scorecard.metrics.map((m) => m.value)).toEqual(
      va.scorecard.metrics.map((m) => m.value),
    );
  });

  it("retains the synthetic fixture only as the determinism + time guard (not the verdict)", () => {
    // The module-load synthetic gate still measures projection time over the
    // ceiling-sized slice — the perf/reproducibility floor that fences CI. It is
    // NOT the availability verdict (that is the real-data composite above).
    const guard = runSemanticGate();
    expect(guard.projectionMs).toBeGreaterThanOrEqual(0);
    expect(guard.reason).toMatch(/semantic mode (SHIPPED|HELD)/);
  });
});

// --- the stores-side tiers gate (held read from tiers, never an array/error) -------

const tiersWith = (semantic: { available: boolean; reason?: string }): TiersBlock => ({
  declared: { available: true },
  structural: { available: true },
  temporal: { available: true },
  semantic,
});

/** A served embeddings response carrying real vectors and a tiers block. */
function embeddingsResponse(count: number, tiers: TiersBlock): EmbeddingsResponse {
  return {
    embeddings: Array.from({ length: count }, (_, i) => ({
      node_id: `doc:n${i}`,
      vector: [i, i + 1, i + 2],
    })),
    generation: 5,
    tiers,
  };
}

describe("deriveSemanticEmbeddingsView — held is read from tiers, availability from the floor", () => {
  it("is AVAILABLE (Meaning ships) when the tier is up and the presence floor is met", () => {
    const view = deriveSemanticEmbeddingsView(
      embeddingsResponse(8, tiersWith({ available: true })),
      null,
      false,
      true,
    );
    expect(view.unavailable).toBe(false);
    expect(view.available).toBe(true);
    expect(view.embeddingCount).toBe(8);
    expect(view.embeddings.size).toBe(8);
  });

  it("HOLDS (unavailable) when the tiers block reports the search tier down, even with an array present", () => {
    // The response STILL carries embeddings, but the FRESH tiers truth marks the
    // semantic tier unavailable — held is read from tiers, NOT the array. The
    // honest absence wins: unavailable true, not available, no vectors surfaced.
    const view = deriveSemanticEmbeddingsView(
      embeddingsResponse(8, tiersWith({ available: false, reason: "rag offline" })),
      null,
      false,
      true,
    );
    expect(view.unavailable).toBe(true);
    expect(view.available).toBe(false);
    // Held suppresses the vectors so the scene draws the designed fallback ring.
    expect(view.embeddings.size).toBe(0);
  });

  it("HOLDS when a served tiers block omits semantic, even with an array present", () => {
    const view = deriveSemanticEmbeddingsView(
      embeddingsResponse(8, {
        declared: { available: true },
        structural: { available: true },
        temporal: { available: true },
      }),
      null,
      false,
      true,
    );
    expect(view.unavailable).toBe(true);
    expect(view.available).toBe(false);
    expect(view.embeddings.size).toBe(0);
  });

  it("HOLDS from the FRESH error envelope's tiers over a stale held-success block", () => {
    // A previously held success block reported the tier UP; the latest request
    // errored with a tiers-bearing envelope reporting it DOWN. The fresh error
    // tiers win (degradation-is-read-from-tiers): held, not available.
    const heldSuccess = embeddingsResponse(8, tiersWith({ available: true }));
    const freshError = new EngineError("/graph/embeddings", 502, {
      tiers: tiersWith({ available: false, reason: "rag 502" }),
    });
    const view = deriveSemanticEmbeddingsView(heldSuccess, freshError, false, true);
    expect(view.unavailable).toBe(true);
    expect(view.available).toBe(false);
  });

  it("does NOT flap held on a bare transport error (no tiers => tiers-driven only)", () => {
    // A tiers-less transport fault (a network blip) carries no degradation truth.
    // It must NOT mark the mode held — that is the query's error state, distinct
    // from a backend tier being down. With no held success data either, the view
    // is neither unavailable nor available: it never flaps offline on a blip.
    const bareError = new EngineError("/graph/embeddings", 500, {});
    const view = deriveSemanticEmbeddingsView(undefined, bareError, false, true);
    expect(view.unavailable).toBe(false);
    expect(view.available).toBe(false);
  });

  it("is NOT held on an empty embeddings array with the tier UP — just not yet available", () => {
    // An empty array with the tier up is the unmet-presence-floor middle state:
    // not available (nothing to project), but NOT held (held is the tiers' job).
    const view = deriveSemanticEmbeddingsView(
      embeddingsResponse(0, tiersWith({ available: true })),
      null,
      false,
      true,
    );
    expect(view.unavailable).toBe(false);
    expect(view.available).toBe(false);
    expect(view.embeddingCount).toBe(0);
  });
});
