// Apply consumed settings to app state (dashboard-settings W05, review HIGH-1).
// Every setting in the served registry has a real consumer; this app-layer
// bridge is where the non-theme ones take effect (theme lives in themeSetting.ts).
// Mounted once at the shell top so it runs regardless of rail/dialog state. It
// reads the schema + values through stores hooks (sole wire client) and drives
// view state / a document attribute — it never fetches or reads the raw tiers.

import { useEffect, useRef } from "react";

import { useSettings, useSettingsSchema } from "../../stores/server/queries";
import {
  decodeBool,
  decodeInt,
  resolveEffective,
} from "../../stores/server/settingsSelectors";
import { useFilterStore } from "../../stores/view/filters";
import { useViewStore } from "../../stores/view/viewStore";

export function useSettingsEffects() {
  const schema = useSettingsSchema();
  const settings = useSettings();
  const scope = useViewStore((s) => s.scope);
  const setGranularity = useViewStore((s) => s.setGranularity);
  const setMinConfidence = useFilterStore((s) => s.setMinConfidence);
  const setTextMatch = useFilterStore((s) => s.setTextMatch);

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

  // The Graph defaults that the graph OPENS WITH for a scope. Seeded once per
  // scope (entering a scope applies its persisted defaults); the user can still
  // change the live controls for the session afterward. One shared seed ref so
  // all three Graph defaults apply together on a scope transition, never
  // clobbering mid-session edits.
  const granularityDef = defs?.find((d) => d.key === "default_granularity");
  const confidenceDef = defs?.find((d) => d.key === "confidence_floor");
  const labelFilterDef = defs?.find((d) => d.key === "label_filter");
  const seededScope = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!settings.data) return;
    if (seededScope.current === scope) return;

    // default_granularity -> the level of detail the graph opens with.
    if (granularityDef) {
      const eff = resolveEffective(granularityDef, settings.data, scope).value;
      if (eff === "feature" || eff === "document") setGranularity(eff);
    }

    // confidence_floor -> the inferred-edge (temporal + semantic) confidence
    // floor DEFAULT the Stage's per-tier sliders initialize from. The setting
    // is a percent (0..100); the filter store's floors are 0..1, so map down.
    if (confidenceDef) {
      const percent = decodeInt(
        resolveEffective(confidenceDef, settings.data, scope).value,
        0,
      );
      const floor = Math.min(1, Math.max(0, percent / 100));
      setMinConfidence("temporal", floor);
      setMinConfidence("semantic", floor);
    }

    // label_filter -> the node-stem text-match DEFAULT the Stage opens with.
    if (labelFilterDef) {
      const text = resolveEffective(labelFilterDef, settings.data, scope).value;
      setTextMatch(text);
    }

    seededScope.current = scope;
  }, [
    granularityDef,
    confidenceDef,
    labelFilterDef,
    settings.data,
    scope,
    setGranularity,
    setMinConfidence,
    setTextMatch,
  ]);
}
