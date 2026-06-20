// @vitest-environment happy-dom

import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { createRef, type RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isInsideIgnoredDismissTarget,
  normalizeDismissOnOutsidePointerEnabled,
  normalizeDismissOnOutsidePointerIgnoreSelector,
  useDismissOnOutsidePointer,
} from "./useDismissOnOutsidePointer";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe("useDismissOnOutsidePointer", () => {
  function mountRoot(): RefObject<HTMLDivElement | null> {
    const root = document.createElement("div");
    document.body.append(root);
    const ref = createRef<HTMLDivElement>();
    ref.current = root;
    return ref;
  }

  it("normalizes listener gate and ignore-selector runtime values", () => {
    expect(normalizeDismissOnOutsidePointerEnabled(undefined)).toBe(true);
    expect(normalizeDismissOnOutsidePointerEnabled(true)).toBe(true);
    expect(normalizeDismissOnOutsidePointerEnabled(false)).toBe(false);
    expect(normalizeDismissOnOutsidePointerEnabled("true")).toBe(false);
    expect(normalizeDismissOnOutsidePointerIgnoreSelector("[data-filter-bar]")).toBe(
      "[data-filter-bar]",
    );
    expect(normalizeDismissOnOutsidePointerIgnoreSelector("   ")).toBeNull();
    expect(normalizeDismissOnOutsidePointerIgnoreSelector([".bad"])).toBeNull();
  });

  it("treats malformed ignore selectors as non-matches", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);

    expect(isInsideIgnoredDismissTarget(trigger, "[data-filter-bar]")).toBe(false);
    expect(isInsideIgnoredDismissTarget(trigger, "[")).toBe(false);
    expect(isInsideIgnoredDismissTarget(null, "[data-filter-bar]")).toBe(false);
  });

  it("calls onDismiss when a pointer starts outside the root", () => {
    const onDismiss = vi.fn();
    const ref = mountRoot();
    renderHook(() => useDismissOnOutsidePointer(ref, onDismiss));

    fireEvent.pointerDown(document.body);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("ignores pointer starts inside the root", () => {
    const onDismiss = vi.fn();
    const ref = mountRoot();
    const child = document.createElement("button");
    ref.current?.append(child);
    renderHook(() => useDismissOnOutsidePointer(ref, onDismiss));

    fireEvent.pointerDown(child);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("ignores a pointer inside an element matching ignoreSelector", () => {
    // An external trigger (e.g. a toolbar button) owns its own open/close; a
    // pointer on it must not light-dismiss the popover or the two would fight.
    const onDismiss = vi.fn();
    const ref = mountRoot();
    const trigger = document.createElement("button");
    trigger.setAttribute("data-filter-bar", "");
    document.body.append(trigger);
    renderHook(() =>
      useDismissOnOutsidePointer(ref, onDismiss, {
        ignoreSelector: "[data-filter-bar]",
      }),
    );

    fireEvent.pointerDown(trigger);
    expect(onDismiss).not.toHaveBeenCalled();

    // A pointer elsewhere outside still dismisses.
    fireEvent.pointerDown(document.body);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("attaches no listener when disabled", () => {
    const onDismiss = vi.fn();
    const ref = mountRoot();
    renderHook(() => useDismissOnOutsidePointer(ref, onDismiss, { enabled: false }));

    fireEvent.pointerDown(document.body);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("attaches no listener for malformed truthy enabled values", () => {
    let dismissCount = 0;
    const ref = mountRoot();
    renderHook(() =>
      useDismissOnOutsidePointer(
        ref,
        () => {
          dismissCount += 1;
        },
        { enabled: "true" },
      ),
    );

    fireEvent.pointerDown(document.body);

    expect(dismissCount).toBe(0);
  });

  it("does not throw or ignore dismissal for malformed selector values", () => {
    let dismissCount = 0;
    const ref = mountRoot();
    const trigger = document.createElement("button");
    document.body.append(trigger);
    renderHook(() =>
      useDismissOnOutsidePointer(
        ref,
        () => {
          dismissCount += 1;
        },
        { ignoreSelector: "[" },
      ),
    );

    expect(() => fireEvent.pointerDown(trigger)).not.toThrow();
    expect(dismissCount).toBe(1);
  });

  it("removes the listener on unmount", () => {
    const onDismiss = vi.fn();
    const ref = mountRoot();
    const { unmount } = renderHook(() => useDismissOnOutsidePointer(ref, onDismiss));

    unmount();
    fireEvent.pointerDown(document.body);

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
