// Community / clustered (Louvain) layout (graph-layout-catalog ADR D1, D8, D9,
// D7; W02.P07).
//
// A deterministic-seed mode (D1): returns a populated positions Map the assembly
// seeds the solver from and holds stopped. Pure CPU compute over the served slice
// (graph-compute-is-CPU), framework-free — a SELF-CONTAINED hand-rolled Louvain
// (D8): graphology / graphology-communities-louvain are NOT re-adopted, because
// re-adopting graphology purely for one algorithm would re-open the dependency
// the stability cycle deliberately retired. The hand-roll is ~modularity-gain
// move loop + community-aggregation recursion, near-linear in edge count and
// negligible at the bounded ceiling.
//
// Placement (D9): a DETERMINISTIC two-level seed, NOT a grouped-force. Communities
// are arranged on a coarse outer circle; each community's members are packed
// locally on an inner circle via the circularArrange idiom. The grouped-force
// alternative (feeding membership as a solver attraction force) is declined — it
// re-introduces the solver and breaks the deterministic-seed contract that
// mode-switch object constancy and mental-map stability depend on.
//
// Determinism is a hard contract (D9): there is NO RNG — every Louvain tie-break
// (community membership, move order, gain ties) is by id sort, mirroring lineage.
// The same slice always yields the same communities and the same placement, so a
// re-seed never flickers communities (the mental-map instability the stability
// ADR fought).
//
// Edge input (D7): the layout backbone (declared + structural) via
// splitBackbone().backbone — the same anti-hairball subset every non-lineage
// layout feeds on.

import type { SceneEdgeData, SceneNodeData } from "../sceneController";
import { splitBackbone } from "./backbone";
import { circularArrange } from "./circularLayout";

/** World-space radius of the coarse outer circle the communities sit on. Scales
 *  with sqrt(community count) so more communities spread further, matching the
 *  circularArrange density discipline. */
export const COMMUNITY_OUTER_BASE_RADIUS = 360;
/** Inner-pack spacing scalar: the local circularArrange radius is multiplied by
 *  this so member packs stay clear of one another on the outer circle. */
export const COMMUNITY_INNER_SCALE = 0.62;
/**
 * Small-community cap (open question resolution): communities with fewer than
 * this many members are MERGED into one synthetic "singletons" community for
 * placement legibility, so a forest of 1-2-node communities does not fragment the
 * outer circle into illegible noise. The merge is placement-only — it never
 * alters the detected Louvain membership a hull overlay would read.
 */
export const COMMUNITY_MIN_SIZE = 2;

/** A detected community: its members (id-sorted) keyed by a stable community id. */
export interface CommunityResult {
  /** node id -> community id (stable, deterministic). */
  membership: Map<string, string>;
  /** community id -> member node ids (id-sorted). */
  communities: Map<string, string[]>;
}

/**
 * Detect communities over the served slice's backbone and return the membership.
 * Exposed for the optional featureHulls overlay drive (D9) — an OVERLAY, never a
 * re-layout. Pure and deterministic.
 */
export function detectCommunities(
  nodes: readonly SceneNodeData[],
  edges: readonly SceneEdgeData[],
): CommunityResult {
  const nodeIds = nodes.map((n) => n.id).sort();
  const idSet = new Set(nodeIds);
  const { backbone } = splitBackbone(edges);

  // Build the undirected weighted adjacency (parallel edges sum weight 1 each).
  const weight = new Map<string, Map<string, number>>();
  for (const id of nodeIds) weight.set(id, new Map());
  let m2 = 0; // 2 * total edge weight (the Louvain normaliser)
  for (const e of backbone) {
    if (!idSet.has(e.src) || !idSet.has(e.dst) || e.src === e.dst) continue;
    bump(weight, e.src, e.dst, 1);
    bump(weight, e.dst, e.src, 1);
    m2 += 2;
  }

  if (m2 === 0) {
    // No backbone edges: every node is its own community (deterministic).
    const membership = new Map<string, string>();
    const communities = new Map<string, string[]>();
    for (const id of nodeIds) {
      membership.set(id, id);
      communities.set(id, [id]);
    }
    return { membership, communities };
  }

  const detected = louvain(nodeIds, weight, m2);
  return detected;
}

/**
 * Lay the served slice out as a two-level community seed. Pure: same inputs ->
 * same positions.
 */
export function communityLayout(
  nodes: readonly SceneNodeData[],
  edges: readonly SceneEdgeData[],
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return out;

  const { communities } = detectCommunities(nodes, edges);

  // D9 small-community merge (placement-only): collect under-sized communities
  // into one synthetic singletons bucket so the outer circle stays legible.
  const placementGroups: { key: string; members: string[] }[] = [];
  const singletons: string[] = [];
  for (const [cid, members] of [...communities.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    if (members.length >= COMMUNITY_MIN_SIZE) {
      placementGroups.push({ key: cid, members: members.slice().sort() });
    } else {
      singletons.push(...members);
    }
  }
  if (singletons.length > 0) {
    placementGroups.push({ key: "￿singletons", members: singletons.sort() });
  }

  // Order placement groups deterministically: larger communities first (so the
  // dominant clusters anchor the outer circle), ties by community id.
  placementGroups.sort((a, b) => {
    if (a.members.length !== b.members.length)
      return b.members.length - a.members.length;
    return a.key.localeCompare(b.key);
  });

  // Level 1: community centres on a coarse outer circle (circularArrange idiom).
  const centreIds = placementGroups.map((g) => g.key);
  const centres = circularArrange(centreIds);
  const outerScale =
    centreIds.length > 1
      ? (COMMUNITY_OUTER_BASE_RADIUS * Math.sqrt(centreIds.length)) /
        // circularArrange already scales by sqrt(N) * 200; renormalise its radius
        // band onto our outer-circle radius so spacing is tuned for community packs.
        (200 * Math.sqrt(centreIds.length))
      : 1;

  // Level 2: pack each community's members locally and offset to its centre.
  for (const group of placementGroups) {
    const centre = centres.get(group.key) ?? { x: 0, y: 0 };
    const cx = centre.x * outerScale;
    const cy = centre.y * outerScale;
    const local = circularArrange(group.members);
    for (const [id, p] of local) {
      out.set(id, {
        x: cx + p.x * COMMUNITY_INNER_SCALE,
        y: cy + p.y * COMMUNITY_INNER_SCALE,
      });
    }
  }

  return out;
}

// --- the Louvain hand-roll (deterministic, framework-free) --------------------

function bump(
  weight: Map<string, Map<string, number>>,
  a: string,
  b: string,
  w: number,
): void {
  const row = weight.get(a)!;
  row.set(b, (row.get(b) ?? 0) + w);
}

/**
 * Seeded Louvain (D8): the modularity-gain local-move loop plus the
 * community-aggregation recursion. Deterministic — there is no RNG; nodes are
 * visited in id order and every gain tie is broken by community id, so the same
 * graph always yields the same partition. Recursion stops when a pass makes no
 * move (modularity converged) or the graph collapses to one super-node.
 */
function louvain(
  nodeIds: readonly string[],
  weight: Map<string, Map<string, number>>,
  m2: number,
): CommunityResult {
  // The aggregation level operates on super-nodes; track each super-node's
  // original member ids so the final membership maps back to real nodes.
  let superIds = [...nodeIds].sort();
  let superWeight = weight;
  let superM2 = m2;
  let membersOf = new Map<string, string[]>();
  for (const id of superIds) membersOf.set(id, [id]);

  for (let level = 0; level < 32; level++) {
    const { community, moved } = oneLevel(superIds, superWeight, superM2);
    if (!moved) break;

    // Aggregate: each community becomes one super-node. The new super-id is the
    // smallest member id in the community (deterministic, stable).
    const commMembers = new Map<string, string[]>(); // commId -> super-node ids
    for (const sid of superIds) {
      const c = community.get(sid)!;
      (commMembers.get(c) ?? commMembers.set(c, []).get(c)!).push(sid);
    }
    const superNameOf = new Map<string, string>(); // commId -> new super-id
    for (const [c, members] of commMembers) {
      superNameOf.set(c, members.slice().sort()[0]);
    }

    const nextMembersOf = new Map<string, string[]>();
    for (const [c, members] of commMembers) {
      const name = superNameOf.get(c)!;
      const orig: string[] = [];
      for (const sid of members) orig.push(...(membersOf.get(sid) ?? [sid]));
      nextMembersOf.set(name, orig.sort());
    }

    // Build the aggregated weighted adjacency between super-nodes.
    const nextWeight = new Map<string, Map<string, number>>();
    for (const name of superNameOf.values()) nextWeight.set(name, new Map());
    for (const a of superIds) {
      const an = superNameOf.get(community.get(a)!)!;
      for (const [b, w] of superWeight.get(a) ?? []) {
        const bn = superNameOf.get(community.get(b)!)!;
        bump(nextWeight, an, bn, w);
      }
    }

    superIds = [...superNameOf.values()].sort();
    superWeight = nextWeight;
    membersOf = nextMembersOf;
    // superM2 is invariant under aggregation (total weight is conserved).
    superM2 = m2;

    if (superIds.length <= 1) break;
  }

  // Flatten: each surviving super-node is a final community; its label is the
  // smallest original member id (deterministic, human-meaningful).
  const membership = new Map<string, string>();
  const communities = new Map<string, string[]>();
  for (const [, orig] of membersOf) {
    const label = orig.slice().sort()[0];
    communities.set(label, orig.slice().sort());
    for (const id of orig) membership.set(id, label);
  }
  return { membership, communities };
}

/**
 * One Louvain level: greedy modularity-gain local moves until no node changes
 * community in a full id-ordered pass. Returns the partition and whether any move
 * happened. Deterministic — nodes are visited in id order and gain ties break by
 * target community id.
 */
function oneLevel(
  ids: readonly string[],
  weight: Map<string, Map<string, number>>,
  m2: number,
): { community: Map<string, string>; moved: boolean } {
  const community = new Map<string, string>();
  for (const id of ids) community.set(id, id); // singleton start

  // Weighted degree (k_i) of each node, including its self-loop weight.
  const degree = new Map<string, number>();
  for (const id of ids) {
    let k = 0;
    for (const w of (weight.get(id) ?? new Map()).values()) k += w;
    degree.set(id, k);
  }

  // Sigma_tot per community: total weighted degree of nodes in the community.
  const sigmaTot = new Map<string, number>();
  for (const id of ids) sigmaTot.set(id, degree.get(id) ?? 0);

  const sorted = [...ids].sort();
  let movedAny = false;
  let improved = true;
  let guard = 0;
  while (improved && guard < 64) {
    improved = false;
    guard++;
    for (const id of sorted) {
      const cur = community.get(id)!;
      const ki = degree.get(id) ?? 0;

      // Sum of weights from id into each neighbouring community (k_i,in).
      const kiIn = new Map<string, number>();
      for (const [nb, w] of weight.get(id) ?? []) {
        if (nb === id) continue;
        const c = community.get(nb)!;
        kiIn.set(c, (kiIn.get(c) ?? 0) + w);
      }

      // Remove id from its current community before evaluating gains.
      sigmaTot.set(cur, (sigmaTot.get(cur) ?? 0) - ki);

      // Best community: maximise ΔQ = k_i,in - Σ_tot * k_i / m2. Ties break by
      // community id (deterministic); the current community is a candidate so a
      // node only moves on a STRICT improvement.
      let bestComm = cur;
      let bestGain = (kiIn.get(cur) ?? 0) - ((sigmaTot.get(cur) ?? 0) * ki) / m2;
      const candidates = [...kiIn.keys()].sort();
      for (const c of candidates) {
        const gain = (kiIn.get(c) ?? 0) - ((sigmaTot.get(c) ?? 0) * ki) / m2;
        if (gain > bestGain + 1e-12 || (gain > bestGain - 1e-12 && c < bestComm)) {
          bestGain = gain;
          bestComm = c;
        }
      }

      // Re-insert into the chosen community.
      sigmaTot.set(bestComm, (sigmaTot.get(bestComm) ?? 0) + ki);
      if (bestComm !== cur) {
        community.set(id, bestComm);
        improved = true;
        movedAny = true;
      }
    }
  }

  return { community, moved: movedAny };
}
