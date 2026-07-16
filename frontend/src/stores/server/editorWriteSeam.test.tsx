// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { setActorToken } from "./authoring";
import { useCreateDoc } from "./queries";

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

afterEach(() => {
  setActorToken(null);
});

describe("editor write seam fail-closed behavior", () => {
  it("refuses a create with no document type before any network write", async () => {
    setActorToken("test-actor-token");
    const { result } = renderHook(() => useCreateDoc(), {
      wrapper: wrapper(new QueryClient()),
    });

    const response = await result.current.mutateAsync({
      scope: "Y:/repo",
      docType: "",
      feature: "alpha",
    });

    expect(response.result.kind).toBe("refused");
    expect(response.nodeId).toBeNull();
  });

  it("refuses a create with no feature before any network write", async () => {
    setActorToken("test-actor-token");
    const { result } = renderHook(() => useCreateDoc(), {
      wrapper: wrapper(new QueryClient()),
    });

    const response = await result.current.mutateAsync({
      scope: "Y:/repo",
      docType: "research",
      feature: "",
    });

    expect(response.result.kind).toBe("refused");
    expect(response.nodeId).toBeNull();
  });

  it("rejects when no authoring actor token is bootstrapped", async () => {
    const { result } = renderHook(() => useCreateDoc(), {
      wrapper: wrapper(new QueryClient()),
    });

    await expect(
      result.current.mutateAsync({
        scope: "Y:/repo",
        docType: "research",
        feature: "alpha",
      }),
    ).rejects.toThrow(/no authoring actor token is bootstrapped/u);
  });
});
