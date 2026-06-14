// Unit tests for the pure helpers exported from ChangesOverview.
// These are stable, side-effect-free functions that cover the data-to-display
// pipeline: event glyphs, commit label extraction (including the HEAD case),
// relative timestamps, path basename, and vault-path detection.

import { describe, expect, it } from "vitest";

import {
  FilePlus,
  GitCommit,
  PencilSimple,
  File as FileMark,
} from "@phosphor-icons/react";

import type { EngineEvent } from "../../stores/server/engine";
import {
  basename,
  eventLabel,
  eventMark,
  isVaultPath,
  KIND_MARK,
  relativeTs,
} from "./ChangesOverview";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<EngineEvent>): EngineEvent {
  return {
    id: "evt-001",
    ts: new Date(0).toISOString(),
    kind: "commit",
    ref: "",
    node_ids: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// eventGlyph
// ---------------------------------------------------------------------------

describe("eventMark (Phosphor domain marks, retiring the Unicode glyphs)", () => {
  it("returns the registered Phosphor mark for every known kind in KIND_MARK", () => {
    for (const [kind, expected] of Object.entries(KIND_MARK)) {
      expect(eventMark(kind)).toBe(expected);
    }
  });

  it("returns the FileDashed fallback for an unknown kind", () => {
    // Fallback is the dashed-file mark, distinct from every mapped kind.
    expect(eventMark("unknown-kind")).not.toBe(GitCommit);
    expect(Object.values(KIND_MARK)).not.toContain(eventMark("unknown-kind"));
    expect(eventMark("")).toBe(eventMark("unknown-kind"));
  });

  it("maps the four product kinds to their sanctioned-family marks", () => {
    expect(eventMark("commit")).toBe(GitCommit);
    expect(eventMark("doc-created")).toBe(FilePlus);
    expect(eventMark("doc-modified")).toBe(PencilSimple);
    expect(eventMark("step-checked")).toBe(FileMark);
  });
});

// ---------------------------------------------------------------------------
// eventLabel — commit SHA extraction
// ---------------------------------------------------------------------------

describe("eventLabel (commit SHA handling)", () => {
  it("shortens a full 40-char SHA ref to 8 chars", () => {
    const ev = makeEvent({ ref: "a".repeat(40) });
    expect(eventLabel(ev)).toBe("a".repeat(8));
  });

  it("passes through a short SHA ref unchanged (7 chars)", () => {
    const ev = makeEvent({ ref: "abc1234" });
    expect(eventLabel(ev)).toBe("abc1234");
  });

  it("passes through a short SHA ref unchanged (12 chars)", () => {
    const ev = makeEvent({ ref: "abc123456789" });
    expect(eventLabel(ev)).toBe("abc123456789");
  });

  it("falls back to the event id when ref is the symbolic HEAD", () => {
    // The engine returns ref:"HEAD" for commits; the id carries the SHA.
    const ev = makeEvent({
      kind: "commit",
      ref: "HEAD",
      id: "deadbeefcafe0102",
    });
    expect(eventLabel(ev)).toBe("deadbeef");
  });

  it("strips the 'commit:' namespace prefix from the event id", () => {
    const ev = makeEvent({
      kind: "commit",
      ref: "HEAD",
      id: "commit:deadbeef12345678",
    });
    expect(eventLabel(ev)).toBe("deadbeef");
  });

  it("handles a colon-namespaced id even with a full SHA", () => {
    const ev = makeEvent({
      kind: "commit",
      ref: "HEAD",
      id: "commit:" + "f".repeat(40),
    });
    expect(eventLabel(ev)).toBe("f".repeat(8));
  });

  it("falls back to the event id slice for non-hex commit ids too", () => {
    // Should not crash; return first 8 chars of whatever is there.
    const ev = makeEvent({
      kind: "commit",
      ref: "HEAD",
      id: "synthetic-id-01",
    });
    expect(eventLabel(ev).length).toBeGreaterThan(0);
  });

  it("shows a branch-name ref's final segment for non-commit events", () => {
    const ev = makeEvent({
      kind: "doc-modified",
      ref: "refs/heads/feature/my-work",
    });
    expect(eventLabel(ev)).toBe("my-work");
  });

  it("falls back to the first node_id when ref is empty", () => {
    const ev = makeEvent({ ref: "", node_ids: ["doc:some-plan"] });
    expect(eventLabel(ev)).toBe("doc:some-plan");
  });

  it("falls back to the event kind when ref is empty and node_ids is empty", () => {
    const ev = makeEvent({ ref: "", node_ids: [], kind: "doc-created" });
    expect(eventLabel(ev)).toBe("doc-created");
  });
});

// ---------------------------------------------------------------------------
// relativeTs
// ---------------------------------------------------------------------------

describe("relativeTs", () => {
  const now = 1_000_000_000_000; // a fixed epoch for determinism

  it("returns 'just now' for events younger than a minute", () => {
    const ts = new Date(now - 30_000).toISOString();
    expect(relativeTs(ts, now)).toBe("just now");
  });

  it("returns minutes for events 1 minute to 1 hour old", () => {
    const ts = new Date(now - 5 * 60_000).toISOString();
    expect(relativeTs(ts, now)).toBe("5m");
  });

  it("returns hours for events 1 hour to 1 day old", () => {
    const ts = new Date(now - 3 * 3_600_000).toISOString();
    expect(relativeTs(ts, now)).toBe("3h");
  });

  it("returns days for events older than 1 day", () => {
    const ts = new Date(now - 2 * 86_400_000).toISOString();
    expect(relativeTs(ts, now)).toBe("2d");
  });

  it("returns empty string for an unparseable timestamp", () => {
    expect(relativeTs("not-a-date", now)).toBe("");
    expect(relativeTs("", now)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// basename
// ---------------------------------------------------------------------------

describe("basename", () => {
  it("returns the filename from a POSIX path", () => {
    expect(basename(".vault/plan/2026-06-12-foo-plan.md")).toBe(
      "2026-06-12-foo-plan.md",
    );
  });

  it("returns the filename from a Windows path", () => {
    expect(basename("frontend\\src\\app\\AppShell.tsx")).toBe("AppShell.tsx");
  });

  it("returns the string unchanged when there is no separator", () => {
    expect(basename("CLAUDE.md")).toBe("CLAUDE.md");
  });

  it("returns empty string for an empty input", () => {
    expect(basename("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// isVaultPath
// ---------------------------------------------------------------------------

describe("isVaultPath", () => {
  it("recognises .vault/ at the root", () => {
    expect(isVaultPath(".vault/plan/2026-06-12-foo-plan.md")).toBe(true);
  });

  it("recognises .vault/ embedded in a path", () => {
    expect(isVaultPath("/some/repo/.vault/audit/foo.md")).toBe(true);
  });

  it("returns false for non-vault paths", () => {
    expect(isVaultPath("frontend/src/App.tsx")).toBe(false);
    expect(isVaultPath("engine/src/main.rs")).toBe(false);
  });

  it("returns false for paths that merely contain 'vault' without the dot prefix", () => {
    expect(isVaultPath("src/stores/vault/store.ts")).toBe(false);
  });
});
