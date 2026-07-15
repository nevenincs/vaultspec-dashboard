// Auto-split from queries.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the queries barrel; see ./index.ts.

import type { KeybindingOverrides } from "../../../platform/keymap/registry";
import { setKeymapOverridesReader } from "../../view/keymapDispatcher";
import {
  EngineError,
  engineClient,
  type SessionUpdate,
  type SettingUpdate,
  type SettingsSchema,
  type SettingsState,
} from "../engine";
import {
  CONSUMED_SETTING_KEYS,
  normalizeSettingsScope,
  resolveEffectiveSetting,
  resolveGraphSettingsDefaults,
  resolveKeybindingOverrides,
  resolveLanguageAuthority,
  resolveReduceMotionSetting,
  resolveSettings,
  settingEnumMembers,
  type GraphSettingsDefaults,
  type SettingsGroup,
} from "../settingsSelectors";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { engineKeys } from "./internal";
import { seedSessionCache } from "./workspaces";

// --- session / settings (user-state-persistence W04.P08.S26) -------------------------
//
// The durable "where am I" session and the user settings, consumed through
// stores hooks so chrome and scene never touch the wire (dashboard-layer-
// ownership). `useSession` is what Stage reads on load to restore the persisted
// active scope instead of recomputing a default — the reload-amnesia cure. The
// mutation hooks persist a selection and invalidate their own key so the read
// re-fetches the authoritative server shape.

/** Read the current session — the restore-on-load source of truth. */
export function useSession() {
  return useQuery({
    queryKey: engineKeys.session(),
    queryFn: () => engineClient.session(),
  });
}

/** True when a session mutation was rejected by the engine as a bad request. */
export function isSessionMutationRejected(error: unknown): boolean {
  return error instanceof EngineError && error.status === 400;
}

/** Read user settings (global + per-scope scoped keys). */
export function useSettings() {
  return useQuery({
    queryKey: engineKeys.settings(),
    queryFn: () => engineClient.settings(),
  });
}

/**
 * Read the engine-owned settings schema registry — the single source of truth
 * the settings dialog renders its controls and defaults from (dashboard-settings).
 * The schema is stable for a deployment, so it is cached long and never
 * invalidated by a value write; only the schema itself changing (a redeploy)
 * would alter it.
 */
export function useSettingsSchema() {
  return useQuery({
    queryKey: engineKeys.settingsSchema(),
    queryFn: () => engineClient.settingsSchema(),
    staleTime: Infinity,
    // Bounded by default (bounded-by-default-for-every-accumulator): a
    // staleTime:Infinity query MUST still declare a gcTime so an unobserved
    // schema entry is reclaimed rather than lingering on the default. The
    // schema is tiny and cheap to refetch, so a short window suffices.
    gcTime: 60_000,
  });
}

export interface SettingsDialogView {
  loading: boolean;
  schemaLoading: boolean;
  settingsLoading: boolean;
  groups: SettingsGroup[];
  title: string;
  description: string;
  loadingMessage: string;
  emptyMessage: string;
  cancelLabel: string;
  doneLabel: string;
}

export interface ThemeSettingView {
  loading: boolean;
  serverTheme: string | undefined;
  themeMembers: readonly string[];
}

export interface SettingsEffectsView {
  loading: boolean;
  reduceMotion: boolean;
  languagePreference: "system" | "en" | null;
  languagePreferenceCacheable: boolean;
  graphDefaults: GraphSettingsDefaults | null;
}

export function deriveSettingsDialogView(
  schema: SettingsSchema | undefined,
  settings: SettingsState | undefined,
  activeScope: unknown,
  schemaLoading: boolean,
  settingsLoading = false,
): SettingsDialogView {
  const loading = schemaLoading || settingsLoading;
  return {
    loading,
    schemaLoading,
    settingsLoading,
    groups: loading ? [] : resolveSettings(schema, settings, activeScope),
    title: "Settings",
    description: "Preferences are saved to this workspace. Some apply per scope.",
    loadingMessage: "Loading settings…",
    emptyMessage: "No settings are available.",
    cancelLabel: "Cancel",
    doneLabel: "Done",
  };
}

export function deriveThemeSettingView(
  schema: SettingsSchema | undefined,
  settings: SettingsState | undefined,
  schemaLoading = false,
  settingsLoading = false,
): ThemeSettingView {
  const loading = schemaLoading || settingsLoading;
  const themeSetting = resolveEffectiveSetting(
    loading ? undefined : schema,
    loading ? undefined : settings,
    null,
    CONSUMED_SETTING_KEYS.theme,
  );
  return {
    loading,
    serverTheme: themeSetting?.value,
    themeMembers: settingEnumMembers(themeSetting?.def),
  };
}

export function deriveSettingsEffectsView(
  schema: SettingsSchema | undefined,
  settings: SettingsState | undefined,
  activeScope: unknown,
  schemaLoading = false,
  settingsLoading = false,
): SettingsEffectsView {
  const loading = schemaLoading || settingsLoading;
  const language = loading ? null : resolveLanguageAuthority(schema, settings);
  return {
    loading,
    reduceMotion: loading ? false : resolveReduceMotionSetting(schema, settings),
    languagePreference: language?.preference ?? (loading ? null : "en"),
    languagePreferenceCacheable: language?.cacheable ?? false,
    graphDefaults: loading
      ? null
      : resolveGraphSettingsDefaults(schema, settings, activeScope),
  };
}

/**
 * Stores selector for the schema-driven settings dialog. It composes the schema
 * registry and persisted values into resolved groups so app chrome never
 * re-implements effective-value precedence or query loading semantics.
 */
export function useSettingsDialogView(activeScope: unknown): SettingsDialogView {
  const normalizedScope = normalizeSettingsScope(activeScope);
  const schema = useSettingsSchema();
  const settings = useSettings();
  return deriveSettingsDialogView(
    schema.data,
    settings.data,
    normalizedScope,
    schema.isPending,
    settings.isPending,
  );
}

/**
 * Stores selector for the platform theme bridge. Theme application stays in the
 * app/platform bridge, but effective-value resolution stays in this layer.
 */
export function useThemeSettingView(): ThemeSettingView {
  const schema = useSettingsSchema();
  const settings = useSettings();
  return deriveThemeSettingView(
    schema.data,
    settings.data,
    schema.isPending,
    settings.isPending,
  );
}

/**
 * Stores selector for settings side effects. The app bridge applies document
 * attributes and one-time dashboard defaults, but settings interpretation stays
 * centralized here.
 */
export function useSettingsEffectsView(activeScope: unknown): SettingsEffectsView {
  const normalizedScope = normalizeSettingsScope(activeScope);
  const schema = useSettingsSchema();
  const settings = useSettings();
  return deriveSettingsEffectsView(
    schema.data,
    settings.data,
    normalizedScope,
    schema.isPending,
    settings.isPending,
  );
}

/**
 * Persist a partial session update (active scope, scope context, or a recent).
 * On success the server returns the full updated session, which seeds the cache
 * directly AND triggers an invalidation so any other observer re-reads. A
 * rejected switch (unknown scope → tiered 400) rejects the mutation; callers
 * surface it gracefully and the persisted state stays unchanged.
 */
export function usePutSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SessionUpdate) => engineClient.putSession(body),
    onSuccess: (session) => {
      // A session mutation may carry a registry mutation (select/add/forget a
      // workspace, dashboard-workspace-registry ADR), so refresh the registry
      // enumeration too — the picker re-reads the authoritative roots + active
      // marker without a separate mutation hook.
      seedSessionCache(queryClient, session);
    },
  });
}

// --- live keybinding override binding (keyboard-action-system W02) ---------------
//
// The one global keymap dispatcher resolves a chord against the registry using a
// SYNCHRONOUS override reader (`setKeymapOverridesReader`). The persisted override
// map lives in the engine `keybindings` setting, read through this layer (the sole
// wire client — dashboard-layer-ownership). We bridge the two with a module-scoped
// cache: the binding hook recomputes the decoded map whenever the settings snapshot
// changes and stores it here, and the reader returns it on each keydown without a
// React render. This keeps stores the owner of wire access while the dispatcher
// stays a pure synchronous resolver.

let liveKeybindingOverrides: KeybindingOverrides = {};
let keymapReaderWired = false;

/**
 * Mount-once binding that wires the persisted-override selector into the global
 * keymap dispatcher. It reads the live settings snapshot through the stores hooks
 * and pushes the decoded override map into the module cache the dispatcher's
 * synchronous reader returns. App chrome mounts this once near the shell top; it
 * fetches nothing itself and reads no raw `tiers` block.
 */
export function useKeymapOverridesBinding(): void {
  const schema = useSettingsSchema();
  const settings = useSettings();
  const overrides = useMemo(
    () => resolveKeybindingOverrides(schema.data, settings.data),
    [schema.data, settings.data],
  );

  useEffect(() => {
    if (!keymapReaderWired) {
      setKeymapOverridesReader(() => liveKeybindingOverrides);
      keymapReaderWired = true;
    }
    // M4: reset to the no-override default on unmount so a teardown/remount (HMR,
    // StrictMode, a future non-app-lifetime mount) never leaves the dispatcher
    // reading a stale closure over the last-known overrides.
    return () => {
      setKeymapOverridesReader(() => ({}));
      liveKeybindingOverrides = {};
      keymapReaderWired = false;
    };
  }, []);

  useEffect(() => {
    liveKeybindingOverrides = overrides;
  }, [overrides]);
}

export function normalizeSettingUpdate(update: unknown): SettingUpdate | null {
  if (update === null || typeof update !== "object") return null;
  const record = update as Record<string, unknown>;
  if (typeof record.key !== "string" || typeof record.value !== "string") {
    return null;
  }
  const key = record.key.trim();
  if (key.length === 0) return null;
  const scope = normalizeSettingsScope(record.scope) ?? undefined;
  return { key, value: record.value, scope };
}

/** Persist a single settings write; seed + invalidate the settings cache. */
export function usePutSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => {
      const normalized = normalizeSettingUpdate(body);
      return normalized === null
        ? Promise.reject(new Error("Invalid settings update"))
        : engineClient.putSettings(normalized);
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(engineKeys.settings(), settings);
      void queryClient.invalidateQueries({ queryKey: engineKeys.settings() });
    },
  });
}
