// Apply consumed settings to app state (dashboard-settings W05, review HIGH-1).
// Every setting in the served registry has a real consumer; this app-layer
// bridge is where the non-theme ones take effect (theme lives in themeSetting.ts).
// Mounted once at the shell top so it runs regardless of rail/dialog state. It
// reads the schema + values through stores hooks (sole wire client) and drives
// view state / a document attribute — it never fetches or reads the raw tiers.

import { useEffect, useRef } from "react";

import { useSettings, useSettingsSchema } from "../../stores/server/queries";
import { decodeBool, resolveEffective } from "../../stores/server/settingsSelectors";
import { useViewStore } from "../../stores/view/viewStore";

export function useSettingsEffects() {
  const schema = useSettingsSchema();
  const settings = useSettings();
  const scope = useViewStore((s) => s.scope);
  const setGranularity = useViewStore((s) => s.setGranularity);

  const defs = schema.data?.settings;

  // reduce_motion -> a document attribute the stylesheet honors (parallel to the
  // OS prefers-reduced-motion media query): animations/transitions collapse when
  // either the OS asks or this setting is on.
  const reduceMotionDef = defs?.find((d) => d.key === "reduce_motion");
  const reduceMotion = reduceMotionDef
    ? decodeBool(resolveEffective(reduceMotionDef, settings.data, scope).value)
    : false;
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = reduceMotion ? "true" : "false";
  }, [reduceMotion]);

  // default_granularity -> the level of detail the graph OPENS WITH for a scope.
  // Seed the view granularity once per scope (entering a scope applies its
  // default); the user can still toggle granularity for the session afterward.
  const granularityDef = defs?.find((d) => d.key === "default_granularity");
  const seededScope = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!granularityDef || !settings.data) return;
    if (seededScope.current === scope) return;
    const eff = resolveEffective(granularityDef, settings.data, scope).value;
    if (eff === "feature" || eff === "document") {
      setGranularity(eff);
      seededScope.current = scope;
    }
  }, [granularityDef, settings.data, scope, setGranularity]);
}
