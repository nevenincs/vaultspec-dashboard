// @vitest-environment happy-dom
// Split from queries.test.ts (module-decomposition mandate, 2026-07-12).

import { afterEach, describe, expect, it } from "vitest";
import { liveScope, liveTransport } from "../../../testing/liveClient";
import { engineClient } from "../engine";
import { useLinkResolution } from "./index";
import { renderHook } from "@testing-library/react";
import { testQueryClient, wrapper } from "./testFixtures";

afterEach(() => {
  engineClient.useTransport(liveTransport);
});

describe("useLinkResolution closed-editor boundary", () => {
  it("does not subscribe to the graph when no document is open", async () => {
    const scope = await liveScope();
    const graphRequests: string[] = [];
    engineClient.useTransport((input, init) => {
      if (input.includes("/graph/query")) graphRequests.push(input);
      return liveTransport(input, init);
    });

    const client = testQueryClient();
    const { result, unmount } = renderHook(() => useLinkResolution(null, scope), {
      wrapper: wrapper(client),
    });

    expect(result.current).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(graphRequests).toEqual([]);
    unmount();
  });
});
