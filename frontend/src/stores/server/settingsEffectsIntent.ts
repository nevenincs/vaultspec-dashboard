import {
  normalizeDashboardStateWriteScope,
  useDashboardStateMutations,
} from "./dashboardState";

export interface SettingsEffectsIntent {
  applyGraphDefaults: (defaults: unknown) => Promise<unknown>;
  applyFreshGraphDefaults: (
    defaults: unknown,
    initialization: unknown,
  ) => Promise<unknown>;
}

export const normalizeSettingsEffectsScope = normalizeDashboardStateWriteScope;

export const SETTINGS_GRAPH_DEFAULTS_IDENTITY_MAX_CHARS = 512;
export const SETTINGS_GRAPH_DEFAULTS_IDENTITY_GUARD_CAP = 256;

const initializedGraphDefaultsByIdentity = new Set<string>();
const pendingGraphDefaultsByIdentity = new Set<string>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeSettingsGraphDefaultsInitializationIdentity(
  identity: unknown,
): string | null {
  if (typeof identity !== "string") return null;
  const normalized = identity.trim();
  return normalized.length > 0 &&
    normalized.length <= SETTINGS_GRAPH_DEFAULTS_IDENTITY_MAX_CHARS
    ? normalized
    : null;
}

export function isFreshSettingsGraphDefaultsInitialization(
  initialization: unknown,
): boolean {
  return isRecord(initialization) && initialization.fresh === true;
}

export function resetSettingsGraphDefaultsInitializationGuard(): void {
  initializedGraphDefaultsByIdentity.clear();
  pendingGraphDefaultsByIdentity.clear();
}

export function settingsGraphDefaultsInitializationGuardSizes(): {
  initialized: number;
  pending: number;
} {
  return {
    initialized: initializedGraphDefaultsByIdentity.size,
    pending: pendingGraphDefaultsByIdentity.size,
  };
}

export function rememberSettingsGraphDefaultsInitializedIdentity(
  identity: unknown,
): boolean {
  const normalized = normalizeSettingsGraphDefaultsInitializationIdentity(identity);
  if (normalized === null) return false;
  initializedGraphDefaultsByIdentity.delete(normalized);
  initializedGraphDefaultsByIdentity.add(normalized);
  while (
    initializedGraphDefaultsByIdentity.size >
    SETTINGS_GRAPH_DEFAULTS_IDENTITY_GUARD_CAP
  ) {
    const oldest = initializedGraphDefaultsByIdentity.values().next().value;
    if (oldest === undefined) break;
    initializedGraphDefaultsByIdentity.delete(oldest);
  }
  return true;
}

export function reserveSettingsGraphDefaultsPendingIdentity(identity: unknown): boolean {
  const normalized = normalizeSettingsGraphDefaultsInitializationIdentity(identity);
  if (normalized === null || pendingGraphDefaultsByIdentity.has(normalized)) {
    return false;
  }
  if (
    pendingGraphDefaultsByIdentity.size >= SETTINGS_GRAPH_DEFAULTS_IDENTITY_GUARD_CAP
  ) {
    return false;
  }
  pendingGraphDefaultsByIdentity.add(normalized);
  return true;
}

export function releaseSettingsGraphDefaultsPendingIdentity(identity: unknown): void {
  const normalized = normalizeSettingsGraphDefaultsInitializationIdentity(identity);
  if (normalized !== null) pendingGraphDefaultsByIdentity.delete(normalized);
}

/**
 * Stores-owned write seam for settings effects that initialize dashboard state.
 * The app-level effects bridge may decide when to apply document settings, but it
 * should not compose dashboard-state writes itself.
 */
export function useSettingsEffectsIntent(scope: unknown): SettingsEffectsIntent {
  const normalizedScope = normalizeSettingsEffectsScope(scope);
  const mutations = useDashboardStateMutations(normalizedScope);
  const applyGraphDefaults = (defaults: unknown) =>
    normalizedScope === null
      ? Promise.resolve(null)
      : mutations.applyGraphSettingsDefaults(defaults);
  return {
    applyGraphDefaults,
    applyFreshGraphDefaults: (defaults, initialization) => {
      const identity = normalizeSettingsGraphDefaultsInitializationIdentity(
        isRecord(initialization) ? initialization.identity : null,
      );
      if (
        normalizedScope === null ||
        !isFreshSettingsGraphDefaultsInitialization(initialization) ||
          identity === null ||
          initializedGraphDefaultsByIdentity.has(identity) ||
          pendingGraphDefaultsByIdentity.has(identity)
        ) {
        return Promise.resolve(null);
      }

      if (!reserveSettingsGraphDefaultsPendingIdentity(identity)) {
        return Promise.resolve(null);
      }
      return applyGraphDefaults(defaults)
        .then((result) => {
          rememberSettingsGraphDefaultsInitializedIdentity(identity);
          return result;
        })
        .finally(() => {
          releaseSettingsGraphDefaultsPendingIdentity(identity);
        });
    },
  };
}
