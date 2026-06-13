import { describe, expect, it, vi } from "vitest";

import type { Action, Middleware } from "./dispatch";
import { Dispatcher, UnknownActionError } from "./dispatch";

describe("Dispatcher handler registry", () => {
  it("routes an action to its registered handler and returns the result", () => {
    const d = new Dispatcher();
    d.register<number>("inc", (a) => (a.payload ?? 0) + 1);
    expect(d.dispatch({ type: "inc", payload: 41 })).toBe(42);
  });

  it("throws UnknownActionError for an unregistered type", () => {
    const d = new Dispatcher();
    expect(() => d.dispatch({ type: "ghost" })).toThrowError(UnknownActionError);
  });

  it("unregisters via the returned disposer", () => {
    const d = new Dispatcher();
    const off = d.register("x", () => "ok");
    expect(d.hasHandler("x")).toBe(true);
    off();
    expect(d.hasHandler("x")).toBe(false);
  });

  it("a disposer does not delete a handler that was re-registered", () => {
    const d = new Dispatcher();
    const off = d.register("x", () => "first");
    d.register("x", () => "second");
    off();
    expect(d.hasHandler("x")).toBe(true);
    expect(d.dispatch({ type: "x" })).toBe("second");
  });
});

describe("Dispatcher middleware chain", () => {
  it("runs middleware in install order around the terminal handler", () => {
    const d = new Dispatcher();
    const order: string[] = [];
    const mw =
      (label: string): Middleware =>
      (action, next) => {
        order.push(`${label}:before`);
        const result = next(action);
        order.push(`${label}:after`);
        return result;
      };
    d.use(mw("a"));
    d.use(mw("b"));
    d.register("t", () => order.push("handler"));
    d.dispatch({ type: "t" });
    expect(order).toEqual(["a:before", "b:before", "handler", "b:after", "a:after"]);
  });

  it("lets a middleware short-circuit without calling the handler", () => {
    const d = new Dispatcher();
    const handler = vi.fn();
    d.register("t", handler);
    d.use((action, next) => (action.meta?.block ? "short-circuited" : next(action)));
    expect(d.dispatch({ type: "t", meta: { block: true } })).toBe("short-circuited");
    expect(handler).not.toHaveBeenCalled();
  });

  it("lets a middleware transform the action passed downstream", () => {
    const d = new Dispatcher();
    let seen: Action | null = null;
    d.register<string>("t", (a) => {
      seen = a;
    });
    d.use((action, next) =>
      next({ ...action, meta: { ...action.meta, tagged: true } }),
    );
    d.dispatch({ type: "t", payload: "p" });
    expect(seen).toMatchObject({ type: "t", payload: "p", meta: { tagged: true } });
  });
});
