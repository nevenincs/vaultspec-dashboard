import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_SEARCH_TARGET,
  SEARCH_INTENT_QUERY_MAX_CHARS,
  SEARCH_TARGET_OPTIONS,
  deriveSearchTargetRows,
  isSearchTarget,
  normalizeSearchIntentQuery,
  normalizeSearchIntentTarget,
  setSearchIntentQuery,
  setSearchIntentTarget,
  useSearchIntentStore,
} from "./searchIntent";

describe("search intent store", () => {
  beforeEach(() => useSearchIntentStore.getState().reset());

  it("declares the right-rail target domain once for consumers", () => {
    expect(SEARCH_TARGET_OPTIONS).toEqual(["vault", "code"]);
    expect(SEARCH_TARGET_OPTIONS).toContain(DEFAULT_SEARCH_TARGET);
    expect(isSearchTarget("vault")).toBe(true);
    expect(isSearchTarget(" code ")).toBe(true);
    expect(isSearchTarget("graph")).toBe(false);
    expect(normalizeSearchIntentTarget(" code ")).toBe("code");
    expect(normalizeSearchIntentTarget(" graph ")).toBeNull();
    expect(normalizeSearchIntentTarget(null)).toBeNull();
  });

  it("projects target domain rows for the right-rail renderer", () => {
    expect(deriveSearchTargetRows()).toEqual([
      {
        target: "vault",
        label: "vault",
      },
      {
        target: "code",
        label: "code",
      },
    ]);
  });

  it("stores query text and target for the right-rail search controller", () => {
    const store = useSearchIntentStore.getState();

    store.setQuery("graph state");
    store.setTarget("code");

    expect(useSearchIntentStore.getState()).toMatchObject({
      query: "graph state",
      target: "code",
    });
  });

  it("resets to an empty vault search baseline", () => {
    const store = useSearchIntentStore.getState();
    store.setQuery("old corpus");
    store.setTarget("code");

    store.reset();

    expect(useSearchIntentStore.getState()).toMatchObject({
      query: "",
      target: DEFAULT_SEARCH_TARGET,
    });
  });

  it("bounds pasted query text before it reaches the search controller", () => {
    const store = useSearchIntentStore.getState();
    const query = "x".repeat(SEARCH_INTENT_QUERY_MAX_CHARS + 25);

    store.setQuery(query);

    expect(useSearchIntentStore.getState().query).toHaveLength(
      SEARCH_INTENT_QUERY_MAX_CHARS,
    );
  });

  it("normalizes malformed query payloads at the search-intent seam", () => {
    expect(normalizeSearchIntentQuery(null)).toBe("");
    expect(normalizeSearchIntentQuery({ text: "ignored" })).toBe("");

    setSearchIntentQuery("git history");
    setSearchIntentQuery(undefined);

    expect(useSearchIntentStore.getState().query).toBe("");
  });

  it("exposes named search-intent helpers for right-rail consumers", () => {
    setSearchIntentQuery("git history");
    setSearchIntentTarget(" code ");

    expect(useSearchIntentStore.getState()).toMatchObject({
      query: "git history",
      target: "code",
    });
  });

  it("ignores unknown target values at the search-intent seam", () => {
    setSearchIntentTarget("code");
    setSearchIntentTarget("graph");

    expect(useSearchIntentStore.getState().target).toBe("code");
  });

  it("ignores unknown target values at the store action boundary", () => {
    const store = useSearchIntentStore.getState();

    store.setTarget("code");
    store.setTarget("graph");
    store.setTarget(" vault ");
    store.setTarget(7);

    expect(useSearchIntentStore.getState().target).toBe("vault");
  });
});
