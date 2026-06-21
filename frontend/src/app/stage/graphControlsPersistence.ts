// Graph-controls persistence round-trip (graph-control-standardisation): the
// force + appearance control VALUES persist via the engine-owned `graph_controls`
// SETTING (shape-b, the keybindings pattern) — global, sparse `{control_id: value}`
// override map, resolved against the canonical `graphControlSchema` defaults.
//
// Echo-safe by construction: the PUT rides the /settings channel (NOT the graph
// dashboard-state delta clock), and the persist skips when the live UI overrides
// already equal the resolved (persisted) ones — so a restore can never re-persist
// and loop. Mounted once by Stage (the always-mounted scene owner); the controller
// is passed in so this module never imports Stage (no import cycle).

import { useEffect } from "react";

import type { SceneController } from "../../scene/sceneController";
import {
  resolveAppearanceParams,
  resolveForceParams,
  specById,
  type GraphControlOverrides,
} from "../../scene/three/graphControlSchema";
import {
  useSettings,
  useSettingsSchema,
  usePutSettings,
} from "../../stores/server/queries";
import { resolveGraphControlOverrides } from "../../stores/server/settingsSelectors";
import {
  setGraphControlsAppearanceParams,
  setGraphControlsTuneParams,
  useGraphControlsChromeStore,
  type GraphControlsAppearanceParams,
  type GraphControlsTuneParams,
} from "../../stores/view/graphControlsChrome";

/** Trailing debounce for a persist write: a settle after the last slider change. */
const PERSIST_DEBOUNCE_MS = 400;

function addOverride(
  map: GraphControlOverrides,
  id: string,
  value: number | string | boolean,
): void {
  // Sparse: persist only what the user changed from the schema default.
  if (specById(id)?.default !== value) map[id] = value;
}

/**
 * Build the SPARSE override map from the live UI params — only values that differ
 * from the schema default are written (absent = default). The UI's `repulsion`
 * magnitude persists as the canonical signed `charge` (charge = −repulsion).
 */
export function buildGraphControlOverrides(
  tune: GraphControlsTuneParams,
  appearance: GraphControlsAppearanceParams,
): GraphControlOverrides {
  const map: GraphControlOverrides = {};
  addOverride(map, "charge", -tune.repulsion);
  addOverride(map, "linkDistance", tune.linkDistance);
  addOverride(map, "linkStrength", tune.linkSpring);
  addOverride(map, "nodeSizeScale", appearance.nodeSizeScale);
  addOverride(map, "nodeSalienceScale", appearance.nodeSalienceScale);
  addOverride(map, "edgeWidthMax", appearance.edgeWidthMax);
  addOverride(map, "edgeOpacityMax", appearance.edgeOpacityMax);
  addOverride(map, "edgeColorMode", appearance.edgeColorMode);
  addOverride(map, "nodeIcons", appearance.nodeIcons);
  return map;
}

/** Compact, sorted-key JSON — the engine-contract wire form + a stable identity
 *  for the restore/persist effects and the echo guard. */
export function stableGraphControlOverrides(map: GraphControlOverrides): string {
  const sorted: GraphControlOverrides = {};
  for (const key of Object.keys(map).sort()) sorted[key] = map[key];
  return JSON.stringify(sorted);
}

/**
 * Restore persisted graph-control overrides to the field + the UI store on
 * load/change, and persist a user change as a debounced sparse PUT.
 */
export function useGraphControlsPersistenceSync(controller: SceneController): void {
  const schema = useSettingsSchema();
  const settings = useSettings();
  const putSettings = usePutSettings();
  const resolved = resolveGraphControlOverrides(schema.data, settings.data);
  const resolvedKey = stableGraphControlOverrides(resolved);

  // RESTORE: apply the persisted overrides to the field and SEED the UI store so
  // the sliders reflect the persisted values. Direct sets (not the GraphControls
  // `apply` path), so a restore never triggers a persist.
  useEffect(() => {
    const force = resolveForceParams(resolved);
    const appearance = resolveAppearanceParams(resolved);
    setGraphControlsTuneParams({
      repulsion: -force.charge,
      linkDistance: force.linkDistance,
      linkSpring: force.linkStrength,
    });
    setGraphControlsAppearanceParams(appearance);
    controller.command({
      kind: "set-force-params",
      params: {
        charge: force.charge,
        linkDistance: force.linkDistance,
        linkStrength: force.linkStrength,
      },
    });
    controller.command({ kind: "set-appearance-params", params: appearance });
    // `resolvedKey` captures the override content; `controller` is app-lifetime stable.
  }, [resolvedKey, controller]);

  // PERSIST: a user change makes the live store diverge from the persisted
  // overrides → debounce a single sparse PUT. The `=== resolvedKey` guard skips a
  // restore-driven store update, breaking the restore→persist echo.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useGraphControlsChromeStore.subscribe((state) => {
      const key = stableGraphControlOverrides(
        buildGraphControlOverrides(state.tuneParams, state.appearanceParams),
      );
      if (key === resolvedKey) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        putSettings.mutate({ key: "graph_controls", value: key });
      }, PERSIST_DEBOUNCE_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [resolvedKey, putSettings]);
}
