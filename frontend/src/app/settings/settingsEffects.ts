// Apply document-level settings effects. Graph and filter defaults are now
// dashboard-state concerns, so this bridge must not seed legacy view/filter
// stores. Mounted once at the shell top so reduce-motion applies regardless of
// rail/dialog state. It reads settings through stores hooks and never fetches.

import { useEffect } from "react";
import { useRef } from "react";

import {
  useDashboardGraphDefaultsInitializationView,
  useKeymapOverridesBinding,
  useSettingsEffectsView,
} from "../../stores/server/queries";
import { useSettingsEffectsIntent } from "../../stores/server/settingsEffectsIntent";

export function useSettingsEffects(scope: string | null = null) {
  const { loading, reduceMotion, graphDefaults } = useSettingsEffectsView(scope);
  // Bridge persisted keybinding overrides into the global keymap dispatcher
  // (keyboard-action-system W02). Stores owns the wire read; this only mounts.
  useKeymapOverridesBinding();
  const graphDefaultsInitialization =
    useDashboardGraphDefaultsInitializationView(scope);
  const settingsIntent = useSettingsEffectsIntent(scope);
  const initializedGraphDefaults = useRef<Set<string>>(new Set());
  const pendingGraphDefaults = useRef<Set<string>>(new Set());

  // reduce_motion -> a document attribute the stylesheet honors (parallel to the
  // OS prefers-reduced-motion media query): animations/transitions collapse when
  // either the OS asks or this setting is on.
  useEffect(() => {
    if (loading) return;
    document.documentElement.dataset.reduceMotion = reduceMotion ? "true" : "false";
  }, [loading, reduceMotion]);

  // Graph/filter defaults initialize a fresh dashboard-state scope once. After
  // that, dashboard-state is the live owner; settings must not keep overwriting
  // user graph intent as a hidden second writer.
  useEffect(() => {
    if (!scope || !graphDefaults || !graphDefaultsInitialization.fresh) return;
    if (initializedGraphDefaults.current.has(scope)) return;
    if (pendingGraphDefaults.current.has(scope)) return;

    pendingGraphDefaults.current.add(scope);
    void settingsIntent
      .applyGraphDefaults(graphDefaults)
      .then(() => {
        initializedGraphDefaults.current.add(scope);
      })
      .catch(() => undefined)
      .finally(() => {
        pendingGraphDefaults.current.delete(scope);
      });
  }, [graphDefaults, graphDefaultsInitialization.fresh, scope, settingsIntent]);
}
