/**
 * @vitest-environment happy-dom
 *
 * Proves the global unmount barrier in `rtlCleanup.ts` actually FIRES.
 *
 * A guard that only asserts the hook is registered would prove the mechanism
 * EXISTS, not that it runs — the distinction that cost the investigation behind
 * this barrier several wrong answers. So this guard reads the disconfirming
 * value directly: the first test mounts a component that both writes into
 * `document.body` and subscribes to shared state, and the second test asserts
 * the DOM node is gone and the subscription was torn down.
 *
 * Delete the `afterEach(cleanup)` from `rtlCleanup.ts` and both assertions in
 * the second test fail.
 */

import { render } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";

const MARKER = "rtl-cleanup-barrier-marker";

let liveSubscriptions = 0;

function Leaky() {
  useEffect(() => {
    liveSubscriptions += 1;
    return () => {
      liveSubscriptions -= 1;
    };
  }, []);
  return <div data-testid={MARKER} />;
}

describe("the global unmount barrier", () => {
  it("mounts a subscribing component and leaves it mounted at test end", () => {
    render(<Leaky />);
    expect(document.querySelectorAll(`[data-testid="${MARKER}"]`)).toHaveLength(1);
    expect(liveSubscriptions).toBe(1);
  });

  it("has unmounted the previous test's component before this one starts", () => {
    expect(document.querySelectorAll(`[data-testid="${MARKER}"]`)).toHaveLength(0);
    expect(liveSubscriptions).toBe(0);
  });
});
