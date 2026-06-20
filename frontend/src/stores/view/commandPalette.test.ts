import { beforeEach, describe, expect, it } from "vitest";

import {
  COMMAND_PALETTE_ARMED_COMMAND_ID_MAX_CHARS,
  COMMAND_PALETTE_OPS_MESSAGE_CAP,
  COMMAND_PALETTE_QUERY_MAX_CHARS,
  beginCommandPaletteOpsFeedback,
  closeCommandPalette,
  normalizeCommandPaletteArmedCommandId,
  normalizeCommandPaletteCursor,
  normalizeCommandPaletteFeedbackScope,
  normalizeCommandPaletteFeedbackTimeTravel,
  normalizeCommandPaletteOpsMessage,
  normalizeCommandPaletteQuery,
  openCommandPalette,
  resetCommandPaletteSurfaceState,
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
