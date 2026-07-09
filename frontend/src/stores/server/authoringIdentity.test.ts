// @vitest-environment happy-dom
//
// Current-editor identity bootstrap (ledgered-edit-migration W01.P01).
//
// The ADR chose a first-class, SHARED editor identity over an anonymous
// per-edit token: a plain editing session and the review station must resolve
// to the SAME human principal. These tests exercise the hook logic itself
// (bootstrap orchestration, cross-instance visibility, the auto-mint gate) by
// spying `authoringClient.issueActorToken` to CAPTURE the outgoing request and
// return a fixture shaped exactly like the live wire response already proven in
// `authoring.live.test.ts` ("mints a per-principal actor token exactly once").
// This is the REQUEST-side unit test the `editorWriteSeam.test.tsx` precedent
// establishes — the unit under test is OUR identity-hook wiring, not a faked
// engine verb.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CURRENT_EDITOR_ACTOR,
  authoringClient,
  getActorToken,
  setActorToken,
  useCurrentEditorIdentity,
  useEnsureCurrentEditorIdentity,
  useReviewDecision,
  type IssuedActorToken,
} from "./authoring";
import type { TiersBlock } from "./engine";

const availableTiers: TiersBlock = {
  declared: { available: true },
  structural: { available: true },
  temporal: { available: true },
  semantic: { available: true },
};

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function issuedToken(raw: string): IssuedActorToken {
  return { raw_token: raw, record: null, tiers: availableTiers };
}

beforeEach(() => {
  setActorToken(null);
});

afterEach(() => {
  cleanup();
  setActorToken(null);
  vi.restoreAllMocks();
});

describe("useCurrentEditorIdentity — bootstrap", () => {
  it("starts with no token and mints the shared CURRENT_EDITOR_ACTOR principal on bootstrap", async () => {
    const spy = vi
      .spyOn(authoringClient, "issueActorToken")
      .mockResolvedValue(issuedToken("token-abc"));
    const { result } = renderHook(() => useCurrentEditorIdentity(), {
      wrapper: wrapper(new QueryClient()),
    });

    expect(result.current.hasToken).toBe(false);

    await act(async () => {
      result.current.bootstrap();
    });
    await waitFor(() => expect(result.current.hasToken).toBe(true));

    expect(spy).toHaveBeenCalledWith({ actor: CURRENT_EDITOR_ACTOR });
    expect(getActorToken()).toBe("token-abc");
  });

  it("does not re-mint once already bootstrapped", async () => {
    const spy = vi
      .spyOn(authoringClient, "issueActorToken")
      .mockResolvedValue(issuedToken("token-once"));
    const { result } = renderHook(() => useCurrentEditorIdentity(), {
      wrapper: wrapper(new QueryClient()),
    });

    await act(async () => {
      result.current.bootstrap();
    });
    await waitFor(() => expect(result.current.hasToken).toBe(true));

    act(() => {
      // A later call, once bootstrapped, is a no-op guard — never a re-mint.
      result.current.bootstrap();
    });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("signOut clears the session token", async () => {
    const spy = vi
      .spyOn(authoringClient, "issueActorToken")
      .mockResolvedValue(issuedToken("token-signout"));
    const { result } = renderHook(() => useCurrentEditorIdentity(), {
      wrapper: wrapper(new QueryClient()),
    });

    await act(async () => {
      result.current.bootstrap();
    });
    await waitFor(() => expect(result.current.hasToken).toBe(true));

    act(() => {
      result.current.signOut();
    });

    expect(result.current.hasToken).toBe(false);
    expect(getActorToken()).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("useEnsureCurrentEditorIdentity — a fresh editing session auto-mints", () => {
  it("mints one human actor token as soon as an editing session mounts enabled, with no explicit sign-in gesture", async () => {
    const spy = vi
      .spyOn(authoringClient, "issueActorToken")
      .mockResolvedValue(issuedToken("token-auto"));

    renderHook(() => useEnsureCurrentEditorIdentity(true), {
      wrapper: wrapper(new QueryClient()),
    });

    await waitFor(() => expect(getActorToken()).toBe("token-auto"));
    expect(spy).toHaveBeenCalledWith({ actor: CURRENT_EDITOR_ACTOR });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not bootstrap while disabled (a read-only view mounts no session identity)", async () => {
    const spy = vi.spyOn(authoringClient, "issueActorToken");

    renderHook(() => useEnsureCurrentEditorIdentity(false), {
      wrapper: wrapper(new QueryClient()),
    });
    // Let any pending microtasks/effects settle.
    await act(async () => {
      await Promise.resolve();
    });

    expect(spy).not.toHaveBeenCalled();
    expect(getActorToken()).toBeNull();
  });
});

describe("the editor and the review station resolve to the SAME principal", () => {
  it("bootstrapping from one identity-hook instance (the editor) is visible from a second, independently-mounted instance (the review station)", async () => {
    const spy = vi
      .spyOn(authoringClient, "issueActorToken")
      .mockResolvedValue(issuedToken("token-shared"));
    const client = new QueryClient();

    const editorSide = renderHook(() => useCurrentEditorIdentity(), {
      wrapper: wrapper(client),
    });
    const reviewStationSide = renderHook(() => useCurrentEditorIdentity(), {
      wrapper: wrapper(client),
    });

    expect(editorSide.result.current.hasToken).toBe(false);
    expect(reviewStationSide.result.current.hasToken).toBe(false);

    await act(async () => {
      editorSide.result.current.bootstrap();
    });
    await waitFor(() => expect(reviewStationSide.result.current.hasToken).toBe(true));

    // ONE mint, ONE shared principal — the review station never mints its own.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ actor: CURRENT_EDITOR_ACTOR });
    expect(getActorToken()).toBe("token-shared");
  });
});

describe("fail-safe: an edit attempted with no bootstrapped identity is refused, not silently dropped", () => {
  it("a ledgered command mutation throws a clear error when no actor token is bootstrapped", async () => {
    expect(getActorToken()).toBeNull();
    const { result } = renderHook(() => useReviewDecision(), {
      wrapper: wrapper(new QueryClient()),
    });

    await expect(
      result.current.mutateAsync({
        approvalId: "approval:no-identity",
        payload: {
          proposal_id: "proposal:no-identity",
          approval_id: "approval:no-identity",
          decision: "approve",
          reviewed_revision: "proposal:rev1",
        },
      }),
    ).rejects.toThrow(/no authoring actor token is bootstrapped/);
  });
});
