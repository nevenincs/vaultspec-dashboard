// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  normalizeSettingsControlDraftMaxLength,
  normalizeSettingsControlDraftContinuous,
  normalizeSettingsControlDraftValue,
  SETTINGS_CONTINUOUS_COMMIT_MS,
  useSettingsControlDraft,
} from "./settingsControlDraft";

function recordStringCommit(commits: string[]): (next: unknown) => void {
  return (next) => {
    if (typeof next !== "string") {
      throw new Error(`Expected normalized string commit, received ${typeof next}`);
    }
    commits.push(next);
  };
}

describe("settings control draft", () => {
  it("normalizes draft input at the settings draft seam", () => {
    expect(normalizeSettingsControlDraftValue("dark")).toBe("dark");
    expect(normalizeSettingsControlDraftValue("semantic", 4)).toBe("sema");
    expect(normalizeSettingsControlDraftValue("semantic", -1)).toBe("semantic");
    expect(normalizeSettingsControlDraftMaxLength(4.8)).toBe(4);
    expect(normalizeSettingsControlDraftMaxLength("4")).toBeUndefined();
    expect(normalizeSettingsControlDraftValue(null)).toBe("");
    expect(normalizeSettingsControlDraftValue({ value: "dark" })).toBe("");
    expect(normalizeSettingsControlDraftContinuous(true)).toBe(true);
    expect(normalizeSettingsControlDraftContinuous(false)).toBe(false);
    expect(normalizeSettingsControlDraftContinuous("true")).toBe(false);
  });

  it("debounces continuous commits and cancels stale pending writes on canonical change", async () => {
    const commits: string[] = [];
    let cancelCount = 0;
    const { result, rerender } = renderHook(
      ({ controlValue }: { controlValue: string }) =>
        useSettingsControlDraft({
          controlValue,
          continuous: true,
          commit: recordStringCommit(commits),
          onCancelPending: () => {
            cancelCount += 1;
          },
        }),
      { initialProps: { controlValue: "" } },
    );

    act(() => result.current.change("stale draft"));
    expect(result.current.value).toBe("stale draft");

    rerender({ controlValue: "canonical" });
    expect(result.current.value).toBe("canonical");
    expect(cancelCount).toBe(1);

    await new Promise((resolve) =>
      setTimeout(resolve, SETTINGS_CONTINUOUS_COMMIT_MS + 40),
    );
    expect(commits).toEqual([]);
  });

  it("commits discrete controls immediately", () => {
    const commits: string[] = [];
    const { result } = renderHook(() =>
      useSettingsControlDraft({
        controlValue: "system",
        continuous: false,
        commit: recordStringCommit(commits),
      }),
    );

    act(() => result.current.change("dark"));

    expect(commits).toEqual(["dark"]);
    expect(result.current.value).toBe("system");
  });

  it("normalizes malformed discrete changes before commit", () => {
    const commits: string[] = [];
    const { result } = renderHook(() =>
      useSettingsControlDraft({
        controlValue: "system",
        continuous: false,
        commit: recordStringCommit(commits),
      }),
    );

    act(() => result.current.change(null));

    expect(commits).toEqual([""]);
    expect(result.current.value).toBe("system");
  });

  it("normalizes canonical control values before exposing drafts", () => {
    const initialProps: { controlValue: unknown } = {
      controlValue: { value: "system" },
    };
    const { result, rerender } = renderHook(
      ({ controlValue }: { controlValue: unknown }) =>
        useSettingsControlDraft({
          controlValue,
          continuous: false,
          commit: () => undefined,
        }),
      { initialProps },
    );

    expect(result.current.value).toBe("");

    rerender({ controlValue: "dark" });

    expect(result.current.value).toBe("dark");
  });

  it("bounds canonical and changed drafts by the schema max length", () => {
    const commits: string[] = [];
    const { result, rerender } = renderHook(
      ({ controlValue }: { controlValue: unknown }) =>
        useSettingsControlDraft({
          controlValue,
          continuous: false,
          maxLength: 4,
          commit: recordStringCommit(commits),
        }),
      { initialProps: { controlValue: "semantic" } },
    );

    expect(result.current.value).toBe("sema");

    act(() => result.current.change("meaning"));
    expect(commits).toEqual(["mean"]);

    rerender({ controlValue: "graph" });
    expect(result.current.value).toBe("grap");
  });

  it("treats malformed continuous flags as discrete controls", async () => {
    const commits: string[] = [];
    const { result } = renderHook(() =>
      useSettingsControlDraft({
        controlValue: "",
        continuous: "true",
        commit: recordStringCommit(commits),
      }),
    );

    act(() => result.current.change("now"));

    expect(commits).toEqual(["now"]);
    await new Promise((resolve) =>
      setTimeout(resolve, SETTINGS_CONTINUOUS_COMMIT_MS + 40),
    );
    expect(commits).toEqual(["now"]);
  });
});
