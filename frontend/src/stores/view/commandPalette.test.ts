import { beforeEach, describe, expect, it } from "vitest";

import {
  COMMAND_PALETTE_ARMED_COMMAND_ID_MAX_CHARS,
  COMMAND_PALETTE_OPS_MESSAGE_CAP,
  COMMAND_PALETTE_QUERY_MAX_CHARS,
  beginCommandPaletteOpsFeedback,
  closeCommandPalette,
  deriveSearchPaletteKeyboardIntent,
  deriveSearchPalettePresentationView,
  normalizeCommandPaletteArmedCommandId,
  normalizeCommandPaletteCursor,
  normalizeCommandPaletteFeedbackScope,
  normalizeCommandPaletteFeedbackTimeTravel,
  normalizeCommandPaletteOpen,
  normalizeCommandPaletteOpsMessage,
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

  it("normalizes and bounds ops feedback messages at the palette seam", () => {
    expect(normalizeCommandPaletteOpsMessage("  reindex queued  ")).toBe(
      "reindex queued",
    );
    expect(normalizeCommandPaletteOpsMessage("   ")).toBeNull();
    expect(normalizeCommandPaletteOpsMessage(null)).toBeNull();

    const long = "x".repeat(COMMAND_PALETTE_OPS_MESSAGE_CAP + 10);
    const normalized = normalizeCommandPaletteOpsMessage(long);
    expect(normalized).toHaveLength(COMMAND_PALETTE_OPS_MESSAGE_CAP);
    expect(normalized?.endsWith("…")).toBe(true);
  });

  it("owns transient surface input, cursor, and armed row state", () => {
    setCommandPaletteQuery("  typed lens  ");
    setCommandPaletteCursor(4);
    setCommandPaletteArmedCommandId("ops:vault-check");

    expect(useCommandPaletteStore.getState()).toMatchObject({
      query: "typed lens",
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
    expect(normalizeCommandPaletteQuery("  typed lens  ")).toBe("typed lens");
    expect(normalizeCommandPaletteQuery("   ")).toBe("");
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
        opsMessage: " running ",
        opsEpoch: "12",
      }),
    ).toEqual({
      open: false,
      query: "typed lens",
      cursor: 3,
      armedCommandId: "ops:vault-check",
      opsMessage: "running",
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
      dialogLabel: "Search documents and code",
      inputPlaceholder: "Search documents and code…",
      resultCountLabel: "2 results",
      stateMode: null,
      emptyMessage: null,
      liveMessage: "2 results",
      footerHints: {
        move: "move",
        previousNext: "previous / next",
        open: "open",
        close: "close",
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
      resultCountLabel: "",
      stateMode: null,
      emptyMessage: "Search across your documents and code.",
      liveMessage: "",
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
      resultCountLabel: "searching…",
      // Loading is UI-only (state-mode-uniformity ADR): the message becomes the
      // Skeleton's screen-reader label, never on-screen text.
      stateMode: "loading",
      emptyMessage: "Searching documents and code",
      liveMessage: "searching…",
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
      stateMode: "degraded",
      emptyMessage: "Full search is unavailable — showing name matches only.",
      liveMessage: "search request failed",
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
      emptyMessage: "No matches for “auth”.",
    });

    // Degraded WITHOUT a transport error (rag offline, files providers still
    // serving): the plain-language copy states both truths — full search down,
    // name matches only — and the screen-reader twin MATCHES the visible copy
    // (search-providers ADR D3; no mechanism vocabulary).
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
      emptyMessage: "Full search is unavailable — showing name matches only.",
      liveMessage: "Full search is unavailable — showing name matches only.",
    });

    // Twin parity when files RESCUE the query (review LOW-1): semantic offline but
    // results present → no degraded StateBlock, and the SR live region announces
    // the normal COUNT, not the degraded copy that would have no visible twin.
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
      liveMessage: "2 results",
    });

    // A walk-capped provider surfaces the honest one-line incomplete note (review
    // HIGH: truncated-not-surfaced); absent when every listing is complete.
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
    ).toBe(
      "Some files may be missing from name matches — the repository is very large.",
    );
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
  });

  it("normalizes corrupted palette state before open and toggle transitions", () => {
    useCommandPaletteStore.setState({
      open: "true",
      query: { text: "bad" },
      cursor: Number.POSITIVE_INFINITY,
      armedCommandId: { id: "ops:bad" },
      opsMessage: " stale ",
      opsEpoch: "bad",
    } as unknown as ReturnType<typeof useCommandPaletteStore.getState>);

    openCommandPalette();

    expect(useCommandPaletteStore.getState()).toMatchObject({
      open: true,
      query: "",
      cursor: 0,
      armedCommandId: null,
      opsMessage: null,
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
      opsMessage: null,
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
    const epoch = beginCommandPaletteOpsFeedback(" running ");
    expect(useCommandPaletteStore.getState()).toMatchObject({
      opsMessage: "running",
      opsEpoch: epoch,
    });

    setCommandPaletteOpsFeedbackForEpoch(epoch + 1, "stale");
    expect(useCommandPaletteStore.getState().opsMessage).toBe("running");

    setCommandPaletteOpsFeedbackForEpoch(epoch, "   ");
    expect(useCommandPaletteStore.getState().opsMessage).toBe("running");

    setCommandPaletteOpsFeedbackForEpoch(`${epoch}`, "stale");
    expect(useCommandPaletteStore.getState().opsMessage).toBe("running");
  });
});
