// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeFocusRestoreOpen, useFocusRestore } from "./useFocusRestore";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe("useFocusRestore", () => {
  function buttons() {
    const opener = document.createElement("button");
    opener.textContent = "opener";
    const inside = document.createElement("button");
    inside.textContent = "inside";
    document.body.append(opener, inside);
    return { opener, inside };
  }

  it("normalizes runtime open values at the shared focus seam", () => {
    expect(normalizeFocusRestoreOpen(true)).toBe(true);
    expect(normalizeFocusRestoreOpen(false)).toBe(false);
    expect(normalizeFocusRestoreOpen("true")).toBe(false);
    expect(normalizeFocusRestoreOpen({ open: true })).toBe(false);
  });

  it("captures focus on open and restores it on close", () => {
    const { opener, inside } = buttons();
    opener.focus();
    const { rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useFocusRestore(open, { onOpen: () => inside.focus() }),
      { initialProps: { open: false } },
    );

    rerender({ open: true });
    expect(document.activeElement).toBe(inside);

    rerender({ open: false });
    expect(document.activeElement).toBe(opener);
  });

  it("runs the close callback before restoring focus", () => {
    const { opener } = buttons();
    opener.focus();
    const onClose = vi.fn(() => {
      expect(document.activeElement).not.toBe(opener);
    });
    const { rerender } = renderHook(
      ({ open }: { open: boolean }) => useFocusRestore(open, { onClose }),
      { initialProps: { open: false } },
    );

    rerender({ open: true });
    document.body.focus();
    rerender({ open: false });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
  });

  it("restores focus when unmounted while open", () => {
    const { opener, inside } = buttons();
    opener.focus();
    const { unmount } = renderHook(() =>
      useFocusRestore(true, { onOpen: () => inside.focus() }),
    );

    expect(document.activeElement).toBe(inside);
    unmount();

    expect(document.activeElement).toBe(opener);
  });

  it("ignores malformed truthy runtime open values", () => {
    const { opener, inside } = buttons();
    const onOpen = vi.fn(() => inside.focus());
    opener.focus();

    renderHook(() => useFocusRestore({ open: true }, { onOpen }));

    expect(onOpen).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);
  });
});
