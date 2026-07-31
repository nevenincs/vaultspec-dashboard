// Specimens: `islands` area (open-in-place node interiors).
//
// `NodeInterior` is a container over `useNodeDetailView(id, scope)`: the cell
// seeds `engineKeys.node(scope, id)` at the real key. A doc-type (adr) node
// exercises the `NodeSummary` branch — the type + lifecycle-state pair is the
// entirety of what that branch renders (it carries no relations affordance of
// its own, despite the node's richer served shape).

import type { EngineNode, NodeDetail } from "@app/stores/server/engine";
import { engineKeys } from "@app/stores/server/queries";
import { NodeInterior } from "@app/app/islands/NodeInterior";

import type { SpecimenDef } from "../registry";
import { REVIEW_SCOPE, tiersDown, tiersHealthy } from "./support";

const NODE_ID = "adr:2026-07-18-review-harness-adr";
const NODE_ID_EMPTY = "adr:2026-07-31-review-harness-empty-adr";

const NODE_DETAIL_NORMAL: NodeDetail = {
  node: {
    id: NODE_ID,
    kind: "doc",
    doc_type: "adr",
    title: "Adopt authored-props visual review",
    status: "accepted",
    dates: { created: "2026-07-18", modified: "2026-07-18" },
    lifecycle: { state: "complete" },
  },
  summary:
    "Decides the desk renders real production components from authored props instead of a seeded engine double.",
  tiers: tiersHealthy("structural"),
};

/** A served minimal node: no `doc_type`, no `lifecycle` — `NodeSummary`'s own
 *  honest empty rendering (an empty `<dl>`, both conditional entries absent). */
const NODE_DETAIL_EMPTY: NodeDetail = {
  node: { id: NODE_ID_EMPTY, kind: "doc" },
  tiers: tiersHealthy("structural"),
};

/** `deriveNodeInteriorView`'s "unavailable" branch reads `detail.state ===
 *  "unavailable" || detail.detail === null`, and `deriveNodeDetailView` sets
 *  `"unavailable"` on `errored || !data?.node` — this authors the LATTER: a
 *  success-shaped payload whose `node` the store's own defensive check already
 *  anticipates missing, never a synthetic thrown query error. `NodeDetail.node`
 *  is typed required, so the omission needs an explicit cast — the cast IS the
 *  honest content of this fixture. */
const NODE_DETAIL_DEGRADED: NodeDetail = {
  node: undefined as unknown as EngineNode,
  tiers: tiersDown(["structural"]),
};

export const islandsSpecimens: Readonly<Record<string, SpecimenDef>> = {
  "islands-nodeinterior": {
    note: "Container over useNodeDetailView(id, scope): seeds engineKeys.node(scope, id) at the real key. A doc-type (adr) node exercises the summary branch, whose entire rendered content is the type + lifecycle-state pair (this component carries no relations section of its own). 'loading' leaves the key unseeded so the query pends and the component's own Skeleton renders. 'empty' seeds a minimal node with neither doc_type nor lifecycle, so NodeSummary honestly renders an empty <dl> with no visible entries. 'degraded' seeds a success-shaped NodeDetail whose `node` field is absent (an explicit cast — the type declares it required, but deriveNodeDetailView's own `!data?.node` guard exists for exactly this sparser wire), reaching the real 'unavailable' StateBlock branch without faking a thrown query error.",
    seed: (client, state) => {
      if (state === "loading") return;
      const id = state === "empty" ? NODE_ID_EMPTY : NODE_ID;
      const detail =
        state === "empty"
          ? NODE_DETAIL_EMPTY
          : state === "degraded"
            ? NODE_DETAIL_DEGRADED
            : NODE_DETAIL_NORMAL;
      client.setQueryData(engineKeys.node(REVIEW_SCOPE, id), detail);
    },
    render: (state) => (
      <NodeInterior
        id={state === "empty" ? NODE_ID_EMPTY : NODE_ID}
        scope={REVIEW_SCOPE}
      />
    ),
  },
};
