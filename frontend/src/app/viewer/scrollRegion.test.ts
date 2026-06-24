import { describe, expect, it, vi } from "vitest";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { stopScrollKeyPropagation } from "./scrollRegion";

function keyEvent(key: string): {
  event: ReactKeyboardEvent<HTMLElement>;
  stop: ReturnType<typeof vi.fn>;
  prevent: ReturnType<typeof vi.fn>;
} {
  const stop = vi.fn();
  const prevent = vi.fn();
  return {
    event: {
      key,
      stopPropagation: stop,
      preventDefault: prevent,
    } as unknown as ReactKeyboardEvent<HTMLElement>,
    stop,
    prevent,
  };
}

describe("stopScrollKeyPropagation", () => {
  it.each(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "])(
    "stops the scroll key %s from bubbling to the global dispatcher (so the browser scrolls natively)",
    (key) => {
      const { event, stop, prevent } = keyEvent(key);
      stopScrollKeyPropagation(event);
      expect(stop).toHaveBeenCalledTimes(1);
      // Critically, it does NOT preventDefault — the browser must still scroll.
      expect(prevent).not.toHaveBeenCalled();
    },
  );

  it.each(["Enter", "Escape", "Tab", "a", "k"])(
    "leaves a non-scroll key %s to propagate (command shortcuts still reach the dispatcher)",
    (key) => {
      const { event, stop } = keyEvent(key);
      stopScrollKeyPropagation(event);
      expect(stop).not.toHaveBeenCalled();
    },
  );
});
