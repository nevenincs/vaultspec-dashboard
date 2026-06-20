import { useCallback, useEffect, useState } from "react";

import {
  normalizeWatcherReconfigureArgs,
  type RagWatcherState,
  type WatcherReconfigureArgs,
} from "../server/ragControl";

export interface RagWatcherConfigDraft {
  debounce: string;
  cooldown: string;
  setDebounce: (value: unknown) => void;
  setCooldown: (value: unknown) => void;
  reconfigureArgs: () => WatcherReconfigureArgs;
}

export function normalizeRagWatcherConfigDraftValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function watcherReconfigureArgsFromDraft({
  debounce,
  cooldown,
}: {
  debounce: unknown;
  cooldown: unknown;
}): WatcherReconfigureArgs {
  return normalizeWatcherReconfigureArgs({
    debounce_ms: normalizeRagWatcherConfigDraftValue(debounce),
    cooldown_s: normalizeRagWatcherConfigDraftValue(cooldown),
  });
}

/**
 * Local draft protocol for the brokered rag watcher configuration.
 *
 * The authoritative values are read from rag through the stores control-plane
 * hook. The inputs keep string drafts so users can type normally, then
 * re-baseline whenever the brokered watcher snapshot changes.
 */
export function useRagWatcherConfigDraft(
  watch: Pick<RagWatcherState, "debounce_ms" | "cooldown_s">,
  sourceKey: string | null,
): RagWatcherConfigDraft {
  const canonicalDebounce = String(watch.debounce_ms);
  const canonicalCooldown = String(watch.cooldown_s);
  const [debounce, setDebounceDraft] = useState(canonicalDebounce);
  const [cooldown, setCooldownDraft] = useState(canonicalCooldown);

  useEffect(() => {
    setDebounceDraft(canonicalDebounce);
    setCooldownDraft(canonicalCooldown);
  }, [canonicalDebounce, canonicalCooldown, sourceKey]);

  const setDebounce = useCallback((next: unknown) => {
    setDebounceDraft(normalizeRagWatcherConfigDraftValue(next));
  }, []);

  const setCooldown = useCallback((next: unknown) => {
    setCooldownDraft(normalizeRagWatcherConfigDraftValue(next));
  }, []);

  return {
    debounce,
    cooldown,
    setDebounce,
    setCooldown,
    reconfigureArgs: () => watcherReconfigureArgsFromDraft({ debounce, cooldown }),
  };
}
