import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { debounce } from "../../platform/timing";
import { normalizeSearchQuery } from "../searchQuery";
import {
  normalizeDashboardTextFilterScope,
  useDashboardTextFilterIntent,
} from "../server/dashboardTextFilterIntent";

export const DASHBOARD_TEXT_FILTER_DEBOUNCE_MS = 200;

export interface DashboardTextFilterDraft {
  /** Immediate draft value for controlled visual inputs. */
  value: string;
  /** Queue a canonical dashboard text-filter write after the shared debounce. */
  setValue: (value: unknown) => void;
  /** Cancel any queued write and clear the canonical dashboard text filter now. */
  clear: () => void;
}

export function normalizeDashboardTextFilterDraftValue(value: unknown): string {
  return normalizeSearchQuery(value);
}

/**
 * Shared text-filter draft protocol for visual filter inputs.
 *
 * The canonical value lives in dashboard-state; local draft state exists only so
 * text fields can echo keystrokes immediately while the graph visibility update
 * is trailing-edge debounced. Every surface that edits `filters.text` must use
 * this hook so clear/canonical-change cancellation stays identical.
 */
export function useDashboardTextFilterDraft(scope: unknown): DashboardTextFilterDraft {
  const normalizedScope = normalizeDashboardTextFilterScope(scope);
  const { canonicalText, sourceIdentity, writeTextFilter } =
    useDashboardTextFilterIntent(normalizedScope);
  const writeTextFilterRef = useRef(writeTextFilter);
  writeTextFilterRef.current = writeTextFilter;
  const [value, setLocalValue] = useState(canonicalText);

  const debouncedSetTextFilter = useMemo(
    () =>
      debounce((next: string) => {
        void writeTextFilterRef.current(next).catch(() => undefined);
      }, DASHBOARD_TEXT_FILTER_DEBOUNCE_MS),
    [],
  );

  useEffect(() => () => debouncedSetTextFilter.cancel(), [debouncedSetTextFilter]);

  useEffect(() => {
    debouncedSetTextFilter.cancel();
    setLocalValue(canonicalText);
  }, [canonicalText, debouncedSetTextFilter, normalizedScope, sourceIdentity]);

  const setValue = useCallback(
    (next: unknown) => {
      const normalized = normalizeDashboardTextFilterDraftValue(next);
      setLocalValue(normalized);
      debouncedSetTextFilter(normalized);
    },
    [debouncedSetTextFilter],
  );

  const clear = useCallback(() => {
    debouncedSetTextFilter.cancel();
    setLocalValue("");
    void writeTextFilterRef.current("").catch(() => undefined);
  }, [debouncedSetTextFilter]);

  return { value, setValue, clear };
}
