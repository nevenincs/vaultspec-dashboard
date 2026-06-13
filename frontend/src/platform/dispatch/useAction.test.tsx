// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Action } from "./dispatch";
import { appConfirmGuard, appDispatcher } from "./middleware";
import { useAction, useConfirmable, useDispatch } from "./useAction";

describe("useAction / useDispatch", () => {
  afterEach(() => appConfirmGuard.reset());

  it("dispatches through the app dispatcher to a registered handler", () => {
    const handler = vi.fn((_action: Action) => "ok");
    const off = appDispatcher.register("test:save", handler);
    const { result } = renderHook(() => useAction<number>("test:save"));
    const returned = result.current(7);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({ type: "test:save", payload: 7 });
    expect(returned).toBe("ok");
    off();
  });

  it("useDispatch dispatches an arbitrary action object", () => {
    const handler = vi.fn(() => 1);
    const off = appDispatcher.register("test:x", handler);
    const { result } = renderHook(() => useDispatch());
    result.current({ type: "test:x" });
    expect(handler).toHaveBeenCalled();
    off();
  });
});

describe("useConfirmable", () => {
  afterEach(() => appConfirmGuard.reset());

  it("arms on the first trigger and fires on the second", () => {
    const handler = vi.fn(() => "fired");
    const off = appDispatcher.register("test:danger", handler);
    const { result } = renderHook(() => useConfirmable("test:danger"));

    act(() => result.current.trigger());
    expect(result.current.armed).toBe(true);
    expect(handler).not.toHaveBeenCalled();

    act(() => result.current.trigger());
    expect(result.current.armed).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
    off();
  });

  it("cancel disarms the shared guard without firing", () => {
    const handler = vi.fn();
    const off = appDispatcher.register("test:danger2", handler);
    const { result } = renderHook(() => useConfirmable("test:danger2"));

    act(() => result.current.trigger());
    expect(result.current.armed).toBe(true);

    act(() => result.current.cancel());
    expect(result.current.armed).toBe(false);
    expect(appConfirmGuard.isArmed("test:danger2")).toBe(false);

    // Proves the guard truly disarmed: the next trigger arms again, never fires.
    act(() => result.current.trigger());
    expect(result.current.armed).toBe(true);
    expect(handler).not.toHaveBeenCalled();
    off();
  });
});
