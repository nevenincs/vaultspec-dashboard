// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WATCHER_COOLDOWN_S_MAX, WATCHER_DEBOUNCE_MS_MAX } from "../server/ragControl";
import {
  normalizeRagWatcherConfigDraftValue,
  useRagWatcherConfigDraft,
  watcherReconfigureArgsFromDraft,
} from "./ragWatcherConfigDraft";

describe("rag watcher config draft", () => {
  it("normalizes runtime draft input at the watcher seam", () => {
    expect(normalizeRagWatcherConfigDraftValue("250")).toBe("250");
    expect(normalizeRagWatcherConfigDraftValue(null)).toBe("");
    expect(normalizeRagWatcherConfigDraftValue({ value: "250" })).toBe("");
  });

  it("normalizes draft fields into the watcher reconfigure wire shape", () => {
    expect(
      watcherReconfigureArgsFromDraft({ debounce: "250", cooldown: "3.5" }),
    ).toEqual({
      debounce_ms: 250,
      cooldown_s: 3.5,
    });
    expect(watcherReconfigureArgsFromDraft({ debounce: "0", cooldown: "0" })).toEqual({
      debounce_ms: 0,
      cooldown_s: 0,
    });
  });

  it("omits empty or invalid watcher drafts instead of leaking coerced values", () => {
    expect(watcherReconfigureArgsFromDraft({ debounce: "", cooldown: "" })).toEqual({});
    expect(
      watcherReconfigureArgsFromDraft({ debounce: "10.5", cooldown: "nope" }),
    ).toEqual({});
    expect(
      watcherReconfigureArgsFromDraft({ debounce: "-1", cooldown: "-0.5" }),
    ).toEqual({});
    expect(
      watcherReconfigureArgsFromDraft({
        debounce: { value: "250" },
        cooldown: ["3"],
      }),
    ).toEqual({});
    expect(
      watcherReconfigureArgsFromDraft({
        debounce: String(WATCHER_DEBOUNCE_MS_MAX + 1),
        cooldown: String(WATCHER_COOLDOWN_S_MAX + 0.5),
      }),
    ).toEqual({});
  });

  it("re-baselines drafts when the brokered watcher snapshot changes", () => {
    const { result, rerender } = renderHook(
      ({ debounce, cooldown }: { debounce: number; cooldown: number }) =>
        useRagWatcherConfigDraft(
          {
            debounce_ms: debounce,
            cooldown_s: cooldown,
          },
          "scope-a",
        ),
      { initialProps: { debounce: 250, cooldown: 3 } },
    );

    act(() => {
      result.current.setDebounce("999");
      result.current.setCooldown("77");
    });

    expect(result.current.reconfigureArgs()).toEqual({
      debounce_ms: 999,
      cooldown_s: 77,
    });

    rerender({ debounce: 500, cooldown: 5 });

    expect(result.current.debounce).toBe("500");
    expect(result.current.cooldown).toBe("5");
  });

  it("re-baselines drafts when the watcher source changes with the same snapshot values", () => {
    const { result, rerender } = renderHook(
      ({ sourceKey }: { sourceKey: string }) =>
        useRagWatcherConfigDraft(
          {
            debounce_ms: 250,
            cooldown_s: 3,
          },
          sourceKey,
        ),
      { initialProps: { sourceKey: "scope-a" } },
    );

    act(() => {
      result.current.setDebounce("999");
      result.current.setCooldown("77");
    });

    rerender({ sourceKey: "scope-b" });

    expect(result.current.debounce).toBe("250");
    expect(result.current.cooldown).toBe("3");
  });

  it("normalizes malformed runtime setter input before storing drafts", () => {
    const { result } = renderHook(() =>
      useRagWatcherConfigDraft(
        {
          debounce_ms: 250,
          cooldown_s: 3,
        },
        "scope-a",
      ),
    );

    act(() => {
      result.current.setDebounce({ value: "999" });
      result.current.setCooldown(null);
    });

    expect(result.current.debounce).toBe("");
    expect(result.current.cooldown).toBe("");
    expect(result.current.reconfigureArgs()).toEqual({});
  });
});
