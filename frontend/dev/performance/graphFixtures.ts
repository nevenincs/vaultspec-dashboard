import type { SceneEdgeData, SceneNodeData } from "@app/scene/sceneController";
import type { D3Node } from "@app/scene/three/d3ForceSolver";

export function statistics(values: number[]) {
  if (values.length === 0) return { n: 0, mean: 0, p50: 0, p95: 0, max: 0 };
  const ordered = [...values].sort((a, b) => a - b);
  return {
    n: values.length,
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    p50: ordered[Math.floor(ordered.length * 0.5)],
    p95: ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * 0.95))],
    max: ordered[ordered.length - 1],
  };
}

export function seededRandom() {
  let state = 1;
  return () => ((state = (Math.imul(1664525, state) + 1013904223) | 0) >>> 0) / 2 ** 32;
}

export function kernelFixture(count: number, shape: "cold" | "dense" | "line") {
  const masses = new Array<number>(count).fill(0);
  const nodes: D3Node[] = [];
  for (let i = 0; i < count; i++) {
    const radius = (shape === "dense" ? 3 : 10) * Math.sqrt(i + 0.5);
    const angle = i * Math.PI * (3 - Math.sqrt(5));
    nodes.push({
      index: i,
      x: shape === "line" ? i * 40 : Math.cos(angle) * radius,
      y: shape === "line" ? 0 : Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      radius: 4 + (i % 17),
    });
    if (i > 0) {
      masses[i]++;
      masses[Math.floor((i - 1) / 3)]++;
    }
  }
  return { nodes, masses: masses.map((n) => Math.max(1, n)) };
}

export function sceneFixture(count: number) {
  const nodes: SceneNodeData[] = [],
    edges: SceneEdgeData[] = [];
  const groups = Math.max(3, Math.round(Math.sqrt(count) / 2));
  const stable = (seed: number) => {
    const value = Math.sin(seed * 12.9898) * 43758.5453;
    return value - Math.floor(value);
  };
  for (let g = 0; g < groups; g++)
    nodes.push({
      id: `feature:${g}`,
      kind: "feature",
      title: `Group ${g}`,
      featureTags: [`f${g}`],
      memberCount: Math.floor(count / groups),
      degreeByTier: {
        declared: Math.floor(count / groups),
        structural: 0,
        temporal: 0,
        semantic: 0,
      },
    });
  for (let i = 0; nodes.length < count; i++) {
    const group = i % groups;
    nodes.push({
      id: `doc:${i}`,
      kind: "document",
      docType: ["adr", "plan", "exec", "audit", "research", "reference"][i % 6],
      title: `Document ${i} performance sample`,
      featureTags: [`f${group}`],
      salience: stable(i),
      degreeByTier: { declared: 2, structural: i % 3, temporal: 1, semantic: 1 },
    });
    edges.push({
      id: `hub:${i}`,
      src: `doc:${i}`,
      dst: `feature:${group}`,
      relation: "member",
      tier: "declared",
      confidence: 0.9,
    });
    if (i > groups)
      edges.push({
        id: `cross:${i}`,
        src: `doc:${i}`,
        dst: `doc:${Math.floor(stable(i * 7) * i)}`,
        relation: "relates",
        tier: "declared",
        confidence: 0.6,
      });
  }
  return { nodes, edges };
}
