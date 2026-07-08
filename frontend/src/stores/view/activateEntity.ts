// The ONE canonical "activate an entity" seam (unified-selection plane). Every
// surface that activates a graph entity — a graph node click/double-click, a left-rail
// document row, the right activity-rail plan/change rows, a Cmd+K search hit — routes
// the activation through `activateEntity` so the three obligations always fire together
// and no surface re-implements (or drops) one of them:
//
//   (a) write the CANONICAL dashboard-state selection (singleton node selection), the
//       one global TanStack-backed selected_ids;
//   (b) OPEN the entity's document as a #15 dock tab — PROVISIONAL on a preview
//       (single-click) and PERMANENT on an open (double-click / Enter) — for an
//       addressable `doc:` / `code:` node;
//   (c) FRAME / center the graph on the node, MATERIALIZING it first via a working-set
//       ego-expand when it is off the current (feature-granularity) constellation, so
//       `focus-node` has a real RENDERED node to center on.
//
// A synthesized `feature:` convergence node owns no document: it DESCENDS the slice to
// that feature (the graph node path supplies the descent intent), never opening a tab.
//
// Layering (dashboard-layer-ownership): this is a stores/view composer. It reuses the
// #15 tab seam (`previewDocTab` / `openDocTab`, which already compose selectNode (a) +
// openDoc (b)), the working-set materialize seam, and the opaque `runSceneCommand`
// bridge for the camera frame — it never imports the scene. D1 = converge open on the
// dock tab (retire the on-canvas island as the default open). D2 = ego-expand to
// materialize an off-slice node before the frame (no engine change; the engine's
// selected_ids⊆full-graph guard already passes for any real document, so the expand is
// for RENDERING the node, not for the selection write).

import { featureTagFromNodeId } from "../server/liveAdapters";
import { normalizeNodeId } from "../nodeIds";
import { normalizeSelectionScope } from "./selection";
import { requestSelectionReveal } from "./selectionReveal";
import { runSceneCommand } from "./sceneCommandBridge";
import { openDocTab, previewDocTab } from "./tabs";
import { expandWorkingSet } from "./workingSet";

/** The viewer surface an addressable node id opens into, or null for a node that
 *  carries no document (a synthesized `feature:` convergence node descends instead).
 *  `doc:` → markdown reader, `code:` → code viewer. */
export function activationSurfaceForNodeId(id: string): "markdown" | "code" | null {
  if (id.startsWith("doc:")) return "markdown";
  if (id.startsWith("code:")) return "code";
  return null;
}

/** The feature-descent intent the graph node path supplies so a `feature:` node
 *  activation descends the slice (the only activation that is not a document open). */
export interface FeatureDescentIntent {
  descendFeatureTag: (featureTag: unknown) => Promise<unknown>;
}

export interface ActivateEntityOptions {
  /** PERMANENT tab (double-click / Enter / explicit open) vs PROVISIONAL preview
   *  (single-click). Default false = provisional, matching VS Code single-click. */
  permanent?: boolean;
  /** Materialize-then-center the graph on the node (c). OFF-canvas activations (rail,
   *  activity-rail, search) pass true so the graph reveals + frames the node; an
   *  on-canvas graph CLICK passes false (the node is already rendered where the user
   *  clicked, so the camera must not yank). Default false. */
  frame?: boolean;
  /** Surface override; defaults to deriving from the node id (`doc:`/`code:`). */
  surface?: "markdown" | "code";
  /** Feature-descent intent for `feature:` nodes (graph node path only). Absent for
   *  document-only callers (rail/activity-rail/search never activate a feature node). */
  featureDescent?: FeatureDescentIntent;
}

/**
 * Activate an entity through the one unified seam. Returns true when the activation was
 * accepted (a tab opened / the slice descended), false for a non-addressable id or a
 * feature node with no descent intent.
 */
export async function activateEntity(
  nodeId: unknown,
  scope: unknown,
  options: ActivateEntityOptions = {},
): Promise<boolean> {
  const id = normalizeNodeId(nodeId);
  if (id === null) return false;
  const normalizedScope = normalizeSelectionScope(scope);

  // A `feature:` convergence node carries no document — descend the slice to it (the
  // graph node path supplies the intent). It is never a dock-tab open.
  const featureTag = featureTagFromNodeId(id);
  if (featureTag !== null) {
    if (normalizedScope === null || !options.featureDescent) return false;
    await options.featureDescent.descendFeatureTag(featureTag);
    return true;
  }

  const surface = options.surface ?? activationSurfaceForNodeId(id);
  if (surface === null) return false; // a non-addressable node has nothing to open

  // (c-pre) MATERIALIZE: when the activation must frame the graph (off-canvas callers),
  // add the node to the working set so its 1-hop ego fans out (useNodeNeighborsBulk) and
  // MERGES the node onto the constellation — otherwise `focus-node` has no rendered node
  // at feature granularity. Bounded by WORKING_SET_CAP (graph-queries-are-bounded). An
  // on-canvas click (frame:false) skips this: the node is already rendered.
  if (options.frame) expandWorkingSet(id);

  // (a)+(b): the #15 tab seam composes selectNode (canonical selection) + openDoc (the
  // provisional/permanent dock tab). One source of truth for tab + selection state.
  // When no scope was supplied (a no-target menu/search "Open"), `normalizedScope` is
  // null — pass `undefined` so the tab seam's active-scope default fires and the
  // canonical selection (a) lands on the live scope rather than a null no-op.
  const tabScope = normalizedScope ?? undefined;
  const opened = options.permanent
    ? await openDocTab(id, surface, tabScope)
    : await previewDocTab(id, surface, tabScope);

  // (c): center the graph on the node. Off-canvas only — an on-canvas click leaves the
  // camera where the user clicked. The scene's `focus-node` handler centers immediately
  // when the node is rendered, and (after the ego-expand above lands) frames it on
  // arrival when it was off-slice — so the camera reaches "the actual document on the
  // graph" regardless of the starting granularity.
  //
  // (c-rail) REVEAL: the same off-canvas gate (`frame:true`) also asks the projection
  // surfaces to scroll the node's row into view (GS-003) — a rail/search/menu selection
  // reveals across surfaces, while an on-canvas click (`frame:false`) never does, so the
  // canvas click doesn't yank the rail. Mirrors the camera focus-bounce gating.
  if (options.frame) {
    runSceneCommand({ kind: "focus-node", id });
    requestSelectionReveal(id);
  }

  return opened;
}
