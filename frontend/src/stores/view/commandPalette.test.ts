import { beforeEach, describe, expect, it } from "vitest";

import {
  COMMAND_PALETTE_ARMED_COMMAND_ID_MAX_CHARS,
  COMMAND_PALETTE_QUERY_MAX_CHARS,
  beginCommandPaletteOpsFeedback,
  commandPaletteOpsFeedback,
  closeCommandPalette,
  deriveSearchPaletteKeyboardIntent,
  deriveSearchPalettePresentationView,
  normalizeCommandPaletteArmedCommandId,
  normalizeCommandPaletteCursor,
  normalizeCommandPaletteFeedbackScope,
  normalizeCommandPaletteFeedbackTimeTravel,
  normalizeCommandPaletteOpen,
  normalizeCommandPaletteOpsFeedback,
  normalizeCommandPaletteQuery,
  normalizeCommandPaletteSurfaceState,
  openCommandPalette,
  resetCommandPaletteSurfaceState,
  searchPaletteMovedCursor,
  setCommandPaletteArmedCommandId,
  setCommandPaletteCursor,
  setCommandPaletteOpsFeedbackForEpoch,
  setCommandPaletteQuery,
  toggleCommandPalette,
  useCommandPaletteStore,
} from "./commandPalette";
import { normalizeSearchCorpus } from "../server/searchProviders";

describe("command palette store", () => {
  beforeEach(() => useCommandPaletteStore.getState().reset());

  it("opens, closes, and toggles the lifted command surface", () => {
    expect(useCommandPaletteStore.getState().open).toBe(false);

    useCommandPaletteStore.getState().openPalette();
    expect(useCommandPaletteStore.getState().open).toBe(true);

    useCommandPaletteStore.getState().closePalette();
    expect(useCommandPaletteStore.getState().open).toBe(false);

    useCommandPaletteStore.getState().togglePalette();
    expect(useCommandPaletteStore.getState().open).toBe(true);
  });

  it("exposes named palette chrome helpers for app-layer consumers", () => {
    openCommandPalette();
    expect(useCommandPaletteStore.getState().open).toBe(true);

    toggleCommandPalette();
    expect(useCommandPaletteStore.getState().open).toBe(false);

    toggleCommandPalette();
    closeCommandPalette();
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });

  it("accepts only catalog-owned operation feedback at the palette seam", () => {
    const feedback = commandPaletteOpsFeedback({
      concept: "refresh-search",
      condition: "running",
    });
    expect(normalizeCommandPaletteOpsFeedback(feedback)).toBe(feedback);
    expect(
      normalizeCommandPaletteOpsFeedback({
        message: { key: "operations:feedback.refreshSearch.running" },
        tone: "success",
      }),
    ).toBeNull();
    expect(normalizeCommandPaletteOpsFeedback("reindex queued")).toBeNull();
  });

  it("owns transient surface input, cursor, and armed row state", () => {
    setCommandPaletteQuery("  typed lens  ");
    setCommandPaletteCursor(4);
    setCommandPaletteArmedCommandId("ops:vault-check");

    expect(useCommandPaletteStore.getState()).toMatchObject({
      query: "  typed lens  ",
      cursor: 4,
      armedCommandId: "ops:vault-check",
    });

    resetCommandPaletteSurfaceState();

    expect(useCommandPaletteStore.getState()).toMatchObject({
      query: "",
      cursor: 0,
      armedCommandId: null,
    });
  });

  it("normalizes malformed transient surface inputs at the palette seam", () => {
    const longQuery = ` ${"x".repeat(COMMAND_PALETTE_QUERY_MAX_CHARS + 10)} `;
    expect(normalizeCommandPaletteQuery(null)).toBe("");
    expect(normalizeCommandPaletteQuery("  typed lens  ")).toBe("  typed lens  ");
    expect(normalizeCommandPaletteQuery("   ")).toBe("   ");
    expect(normalizeCommandPaletteQuery(longQuery)).toHaveLength(
      COMMAND_PALETTE_QUERY_MAX_CHARS,
    );
    expect(normalizeCommandPaletteCursor(3.8)).toBe(3);
    expect(normalizeCommandPaletteCursor(-2)).toBe(0);
    expect(normalizeCommandPaletteCursor(Number.NaN)).toBe(0);
    expect(normalizeCommandPaletteArmedCommandId(" ops:vault-check ")).toBe(
      "ops:vault-check",
    );
    expect(
      normalizeCommandPaletteArmedCommandId(
        "x".repeat(COMMAND_PALETTE_ARMED_COMMAND_ID_MAX_CHARS + 1),
      ),
    ).toBeNull();
    expect(normalizeCommandPaletteArmedCommandId("   ")).toBeNull();
    expect(normalizeCommandPaletteArmedCommandId({ id: "ops:bad" })).toBeNull();
    expect(normalizeCommandPaletteFeedbackScope(" scope-a ")).toBe("scope-a");
    expect(normalizeCommandPaletteFeedbackScope("   ")).toBeNull();
    expect(normalizeCommandPaletteFeedbackScope({ scope: "scope-a" })).toBeNull();
    expect(normalizeCommandPaletteFeedbackTimeTravel(true)).toBe(true);
    expect(normalizeCommandPaletteFeedbackTimeTravel(false)).toBe(false);
    expect(normalizeCommandPaletteFeedbackTimeTravel("true")).toBe(false);
    expect(normalizeCommandPaletteOpen(true)).toBe(true);
    expect(normalizeCommandPaletteOpen("true")).toBe(false);
    expect(
      normalizeCommandPaletteSurfaceState({
        open: "true",
        query: "  typed lens  ",
        cursor: 3.8,
        armedCommandId: " ops:vault-check ",
        opsFeedback: " running ",
        opsEpoch: "12",
      }),
    ).toEqual({
      open: false,
      query: "  typed lens  ",
      cursor: 3,
      armedCommandId: "ops:vault-check",
      opsFeedback: null,
      opsEpoch: 0,
    });

    setCommandPaletteQuery({ text: "ignored" });
    setCommandPaletteCursor(Number.POSITIVE_INFINITY);
    setCommandPaletteArmedCommandId(
      "x".repeat(COMMAND_PALETTE_ARMED_COMMAND_ID_MAX_CHARS + 1),
    );
    expect(useCommandPaletteStore.getState()).toMatchObject({
      query: "",
      cursor: 0,
      armedCommandId: null,
    });

    setCommandPaletteArmedCommandId("   ");

    expect(useCommandPaletteStore.getState()).toMatchObject({
      query: "",
      cursor: 0,
      armedCommandId: null,
    });
  });

  it("projects search-palette keyboard intent and cursor movement at the store seam", () => {
    expect(searchPaletteMovedCursor(3, 0, 1)).toBe(1);
    expect(searchPaletteMovedCursor(3, 0, -1)).toBe(2);
    expect(searchPaletteMovedCursor(0, 2, 1)).toBe(0);
    expect(searchPaletteMovedCursor(3, Number.NaN, 1)).toBe(1);

    expect(deriveSearchPaletteKeyboardIntent("ArrowDown", false)).toEqual({
      kind: "move-cursor",
      delta: 1,
    });
    expect(deriveSearchPaletteKeyboardIntent("ArrowLeft", false)).toBeNull();
    expect(deriveSearchPaletteKeyboardIntent("ArrowLeft", true)).toEqual({
      kind: "move-cursor",
      delta: -1,
    });
    expect(deriveSearchPaletteKeyboardIntent("Enter", false)).toEqual({
      kind: "reveal-selected",
    });
    expect(deriveSearchPaletteKeyboardIntent("Enter", true)).toEqual({
      kind: "open-selected",
    });
    expect(deriveSearchPaletteKeyboardIntent({ key: "Enter" }, true)).toBeNull();
  });

  it("projects search-palette presentation copy and chrome from one seam", () => {
    expect(
      deriveSearchPalettePresentationView({
        query: "  auth  ",
        cursor: 3,
        expanded: true,
        pills: [{ nodeId: "doc:a" }, { nodeId: "code:b" }],
        searchState: "success",
        semanticOffline: false,
        error: false,
      }),
    ).toMatchObject({
      safeCursor: 1,
      selectedNodeId: "code:b",
      showExpandedPanel: true,
      dialogLabel: { key: "common:searchPalette.accessibility.dialog" },
      inputPlaceholder: { key: "common:searchPalette.placeholders.query" },
      resultCountLabel: {
        key: "common:searchPalette.counts.results",
        values: { count: 2 },
      },
      stateMode: null,
      emptyMessage: null,
      liveMessage: {
        key: "common:searchPalette.counts.results",
        values: { count: 2 },
      },
      footerHints: {
        move: { key: "common:searchPalette.actions.move" },
        previousNext: { key: "common:searchPalette.actions.previousNext" },
        open: { key: "common:searchPalette.actions.open" },
        close: { key: "common:searchPalette.actions.close" },
      },
    });

    expect(
      deriveSearchPalettePresentationView({
        query: "  ",
        cursor: 0,
        expanded: true,
        pills: [],
        searchState: "idle",
        semanticOffline: false,
        error: false,
      }),
    ).toMatchObject({
      safeCursor: 0,
      selectedNodeId: null,
      showExpandedPanel: false,
      resultCountLabel: null,
      stateMode: null,
      emptyMessage: { key: "common:searchPalette.states.idle" },
      liveMessage: null,
    });

    expect(
      deriveSearchPalettePresentationView({
        query: "auth",
        cursor: 0,
        expanded: false,
        pills: [],
        searchState: "loading",
        semanticOffline: false,
        error: false,
      }),
    ).toMatchObject({
      resultCountLabel: { key: "common:searchPalette.states.searching" },
      stateMode: "loading",
      emptyMessage: { key: "common:searchPalette.states.searching" },
      liveMessage: { key: "common:searchPalette.states.searching" },
    });

    expect(
      deriveSearchPalettePresentationView({
        query: "auth",
        cursor: 0,
        expanded: false,
        pills: [],
        searchState: "error",
        semanticOffline: true,
        error: true,
      }),
    ).toMatchObject({
      stateMode: "error",
      emptyMessage: { key: "common:searchPalette.states.failed" },
      liveMessage: { key: "common:searchPalette.states.failed" },
    });

    expect(
      deriveSearchPalettePresentationView({
        query: "auth",
        cursor: 0,
        expanded: false,
        pills: [],
        searchState: "success",
        semanticOffline: false,
        error: false,
      }),
    ).toMatchObject({
      stateMode: "empty",
      emptyMessage: {
        key: "common:searchPalette.states.noMatches",
        values: { query: "auth" },
      },
    });

    expect(
      deriveSearchPalettePresentationView({
        query: "auth",
        cursor: 0,
        expanded: false,
        pills: [],
        searchState: "semantic-offline",
        semanticOffline: true,
        error: false,
      }),
    ).toMatchObject({
      stateMode: "degraded",
      emptyMessage: { key: "common:searchPalette.states.degraded" },
      liveMessage: { key: "common:searchPalette.states.degraded" },
    });

    expect(
      deriveSearchPalettePresentationView({
        query: "auth",
        cursor: 0,
        expanded: false,
        pills: [{ nodeId: "doc:a" }, { nodeId: "code:b" }],
        searchState: "results",
        semanticOffline: true,
        error: false,
      }),
    ).toMatchObject({
      stateMode: null,
      emptyMessage: null,
      liveMessage: {
        key: "common:searchPalette.counts.results",
        values: { count: 2 },
      },
    });

    expect(
      deriveSearchPalettePresentationView({
        query: "auth",
        cursor: 0,
        expanded: false,
        pills: [{ nodeId: "code:a" }],
        searchState: "results",
        semanticOffline: false,
        error: false,
        incomplete: true,
      }).incompleteNote,
    ).toEqual({ key: "common:searchPalette.states.incomplete" });
    expect(
      deriveSearchPalettePresentationView({
        query: "auth",
        cursor: 0,
        expanded: false,
        pills: [{ nodeId: "code:a" }],
        searchState: "results",
        semanticOffline: false,
        error: false,
      }).incompleteNote,
    ).toBeNull();
    // At idle (no query) the note stays silent even on a capped corpus — no
    // matches are shown yet, so "missing matches" would be premature.
    expect(
      deriveSearchPalettePresentationView({
        query: "",
        cursor: 0,
        expanded: false,
        pills: [],
        searchState: "idle",
        semanticOffline: false,
        error: false,
        incomplete: true,
      }).incompleteNote,
    ).toBeNull();
  });

  it("normalizes corrupted palette state before open and toggle transitions", () => {
    useCommandPaletteStore.setState({
      open: "true",
      query: { text: "bad" },
      cursor: Number.POSITIVE_INFINITY,
      armedCommandId: { id: "ops:bad" },
      opsFeedback: " stale ",
      opsEpoch: "bad",
    } as unknown as ReturnType<typeof useCommandPaletteStore.getState>);

    openCommandPalette();

    expect(useCommandPaletteStore.getState()).toMatchObject({
      open: true,
      query: "",
      cursor: 0,
      armedCommandId: null,
      opsFeedback: null,
      opsEpoch: 1,
    });

    useCommandPaletteStore.setState({
      open: "true",
      opsEpoch: Number.NaN,
    } as unknown as Partial<ReturnType<typeof useCommandPaletteStore.getState>>);
    toggleCommandPalette();

    expect(useCommandPaletteStore.getState()).toMatchObject({
      open: true,
      query: "",
      cursor: 0,
      armedCommandId: null,
      opsFeedback: null,
      opsEpoch: 1,
    });
  });

  it("clears transient surface state when the palette opens, closes, or toggles", () => {
    setCommandPaletteQuery("stale");
    setCommandPaletteCursor(2);
    setCommandPaletteArmedCommandId("ops:stale");

    openCommandPalette();
    expect(useCommandPaletteStore.getState()).toMatchObject({
      open: true,
      query: "",
      cursor: 0,
      armedCommandId: null,
    });

    setCommandPaletteQuery("closing");
    setCommandPaletteCursor(3);
    setCommandPaletteArmedCommandId("ops:closing");
    closeCommandPalette();
    expect(useCommandPaletteStore.getState()).toMatchObject({
      open: false,
      query: "",
      cursor: 0,
      armedCommandId: null,
    });

    setCommandPaletteQuery("toggle");
    setCommandPaletteCursor(1);
    setCommandPaletteArmedCommandId("ops:toggle");
    toggleCommandPalette();
    expect(useCommandPaletteStore.getState()).toMatchObject({
      open: true,
      query: "",
      cursor: 0,
      armedCommandId: null,
    });
  });

  it("keeps ops feedback scoped to the active palette epoch", () => {
    openCommandPalette();
    const running = commandPaletteOpsFeedback({
      concept: "check-workspace",
      condition: "running",
    });
    const succeeded = commandPaletteOpsFeedback({
      concept: "check-workspace",
      condition: "succeeded",
    });
    const epoch = beginCommandPaletteOpsFeedback(running);
    expect(useCommandPaletteStore.getState()).toMatchObject({
      opsFeedback: running,
      opsEpoch: epoch,
    });

    setCommandPaletteOpsFeedbackForEpoch(epoch + 1, succeeded);
    expect(useCommandPaletteStore.getState().opsFeedback).toBe(running);

    setCommandPaletteOpsFeedbackForEpoch(epoch, "   ");
    expect(useCommandPaletteStore.getState().opsFeedback).toBe(running);

    setCommandPaletteOpsFeedbackForEpoch(`${epoch}`, succeeded);
    expect(useCommandPaletteStore.getState().opsFeedback).toBe(running);
  });
});

describe("search corpus separation (search-providers corpus seam)", () => {
  it("normalizes the corpus and defaults to all", () => {
    expect(normalizeSearchCorpus("docs")).toBe("docs");
    expect(normalizeSearchCorpus("code")).toBe("code");
    expect(normalizeSearchCorpus("everything")).toBe("all");
    expect(normalizeSearchCorpus(undefined)).toBe("all");
  });

  it("switching the corpus restarts the cursor and opening resets to all", () => {
    const store = useCommandPaletteStore.getState();
    store.openSearch();
    store.setSearchCursor(3);
    store.setSearchCorpus("code");
    expect(useCommandPaletteStore.getState().searchCorpus).toBe("code");
    expect(useCommandPaletteStore.getState().searchCursor).toBe(0);
    store.openSearch();
    expect(useCommandPaletteStore.getState().searchCorpus).toBe("all");
  });
});
