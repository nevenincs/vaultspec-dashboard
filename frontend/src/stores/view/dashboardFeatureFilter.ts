import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { debounce } from "../../platform/timing";
import {
  featureQueryEchoText,
  parseFeatureQueryInput,
  type FeatureQuery,
} from "../featureQuery";
import { normalizeSearchQuery } from "../searchQuery";
import {
  normalizeDashboardFeatureFilterScope,
  useDashboardFeatureFilterIntent,
} from "../server/dashboardFeatureFilterIntent";

export const DASHBOARD_FEATURE_FILTER_DEBOUNCE_MS = 200;

export interface DashboardFeatureFilterDraft {
  /** The literal text the field echoes (the user's raw input). */
  value: string;
  /** Queue a canonical feature-query write after the shared debounce. */
  setValue: (value: unknown) => void;
  /** Apply a value immediately (no debounce) — used when an autofill suggestion is
   *  chosen or Enter commits, so the filter lands without waiting. */
  commit: (value: unknown) => void;
  /** Cancel any queued write and clear the canonical feature query now. */
  clear: () => void;
}

/**
 * Shared feature-query draft protocol for the rail's feature search bar. The
 * canonical value lives in dashboard-state (`filters.feature_query`); local draft
 * state exists only so the field can echo keystrokes immediately while the wire
 * write is trailing-edge debounced. The bar's raw input is parsed into the wire
 * `{value,mode}` (glob/regex) on write; a re-seed from canonical echoes the
 * inverse text. Mirrors `useDashboardTextFilterDraft`.
 */
export function useDashboardFeatureFilterDraft(
  scope: unknown,
): DashboardFeatureFilterDraft {
  const normalizedScope = normalizeDashboardFeatureFilterScope(scope);
  const { canonicalFeatureQuery, sourceIdentity, writeFeatureQuery } =
    useDashboardFeatureFilterIntent(normalizedScope);
  const writeFeatureQueryRef = useRef(writeFeatureQuery);
  writeFeatureQueryRef.current = writeFeatureQuery;
  const echoText = featureQueryEchoText(canonicalFeatureQuery);
  const [value, setLocalValue] = useState(echoText);

  const write = useCallback((next: string) => {
    const parsed = parseFeatureQueryInput(next);
    void writeFeatureQueryRef
      .current(parsed satisfies FeatureQuery | null)
      .catch(() => undefined);
  }, []);

  const debouncedWrite = useMemo(
    () => debounce((next: string) => write(next), DASHBOARD_FEATURE_FILTER_DEBOUNCE_MS),
    [write],
  );

  useEffect(() => () => debouncedWrite.cancel(), [debouncedWrite]);

  // Re-seed the echo from canonical on a scope/session swap or external write.
  useEffect(() => {
    debouncedWrite.cancel();
    setLocalValue(echoText);
  }, [echoText, debouncedWrite, normalizedScope, sourceIdentity]);

  const setValue = useCallback(
    (next: unknown) => {
      const normalized = normalizeSearchQuery(next);
      setLocalValue(normalized);
      debouncedWrite(normalized);
    },
    [debouncedWrite],
  );

  const commit = useCallback(
    (next: unknown) => {
      const normalized = normalizeSearchQuery(next);
      setLocalValue(normalized);
      debouncedWrite.cancel();
      write(normalized);
    },
    [debouncedWrite, write],
  );

  const clear = useCallback(() => {
    debouncedWrite.cancel();
    setLocalValue("");
    void writeFeatureQueryRef.current(null).catch(() => undefined);
  }, [debouncedWrite]);

  return { value, setValue, commit, clear };
}
