// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import { liveTransport } from "../../../testing/liveClient";
import { engineClient, EngineError } from "../engine";
import {
  deriveCodeViewerView,
  deriveContentView,
  deriveFrontmatterHeaderView,
  deriveMarkdownHeaderView,
  deriveMarkdownReaderView,
} from "./index";
import type { ContentView } from "./index";

afterEach(() => {
  engineClient.useTransport(liveTransport);
});

describe("deriveCodeViewerView (viewer code chrome)", () => {
  const content = (patch: Partial<ContentView>): ContentView => ({
    loading: false,
    errored: false,
    notFound: false,
    degraded: false,
    degradedTiers: [],
    reasons: {},
    path: "src/auth/mod.rs",
    blobHash: "abc",
    languageHint: "rust",
    text: "line one\nline two\n",
    truncated: null,
    available: true,
    ...patch,
  });

  it("projects ready code content into tokenizer text, raw lines, and header fields", () => {
    expect(deriveCodeViewerView(content({}))).toEqual({
      state: "ready",
      stateMessage: null,
      stateTone: "faint",
      stateToneClass: "text-ink-faint",
      text: "line one\nline two\n",
      rawLines: ["line one", "line two"],
      path: "src/auth/mod.rs",
      languageHint: "rust",
      truncated: null,
      readOnlyLabel: "read-only",
      truncationMessage: null,
    });
  });

  it("projects designed loading, error, degraded, and empty states", () => {
    expect(
      deriveCodeViewerView(content({ loading: true, available: false, text: "" })),
    ).toMatchObject({
      state: "loading",
      stateMessage: "Loading file...",
      stateTone: "faint",
      stateToneClass: "text-ink-faint",
      text: "",
      rawLines: [],
      readOnlyLabel: "read-only",
      truncationMessage: null,
    });
    expect(
      deriveCodeViewerView(content({ errored: true, available: false, text: "" })),
    ).toMatchObject({
      state: "errored",
      stateMessage: "The file could not be loaded.",
      stateTone: "broken",
      stateToneClass: "text-state-broken",
    });
    expect(
      deriveCodeViewerView(
        content({
          degraded: true,
          reasons: { structural: "worktree not listable" },
          available: false,
          text: "",
        }),
      ),
    ).toMatchObject({
      state: "degraded",
      stateMessage: "File unavailable: worktree not listable.",
      stateTone: "muted",
      stateToneClass: "text-ink-muted",
    });
    expect(deriveCodeViewerView(content({ available: false, text: "" }))).toMatchObject(
      {
        state: "empty",
        stateMessage: "This file is empty.",
        stateTone: "faint",
        stateToneClass: "text-ink-faint",
      },
    );
  });

  it("renders a distinct not-in-workspace state on a 404 (never a blank body)", () => {
    // A 404 in the read scope is the "missing" state — distinct from empty/errored so
    // the viewer never blanks (per-tab-scope-binding).
    expect(
      deriveCodeViewerView(content({ notFound: true, available: false, text: "" })),
    ).toMatchObject({
      state: "missing",
      stateMessage: "This file isn't in this workspace.",
      stateTone: "muted",
    });
  });

  it("carries the honest truncation block only with ready content", () => {
    const truncated = {
      total_bytes: 2_000_000,
      returned_bytes: 1_048_576,
      reason: "content byte ceiling",
    };

    expect(deriveCodeViewerView(content({ truncated })).truncated).toEqual(truncated);
    expect(deriveCodeViewerView(content({ truncated })).truncationMessage).toBe(
      "Truncated to the first 1,048,576 of 2,000,000 bytes — open the file directly for the full contents.",
    );
    expect(
      deriveCodeViewerView(
        content({ loading: true, available: false, text: "", truncated }),
      ).truncated,
    ).toBeNull();
    expect(
      deriveCodeViewerView(
        content({ loading: true, available: false, text: "", truncated }),
      ).truncationMessage,
    ).toBeNull();
  });
});

describe("deriveContentView (404 → notFound)", () => {
  it("flags a 404 as notFound (distinct from a transport error)", () => {
    const notFound = deriveContentView(
      undefined,
      new EngineError("/nodes/doc:x/content", 404, {
        tiers: { structural: { available: true } },
        body: { error: "no readable content in this scope" },
      }),
      false,
    );
    expect(notFound.notFound).toBe(true);
    // A non-404 EngineError is not notFound.
    const other = deriveContentView(
      undefined,
      new EngineError("/nodes/doc:x/content", 500, { tiers: {} }),
      false,
    );
    expect(other.notFound).toBe(false);
    // No error → not notFound.
    expect(deriveContentView(undefined, null, false).notFound).toBe(false);
  });
});

describe("deriveMarkdownHeaderView (viewer document chrome)", () => {
  const content = (patch: Partial<ContentView>): ContentView => ({
    loading: false,
    errored: false,
    notFound: false,
    degraded: false,
    degradedTiers: [],
    reasons: {},
    path: ".vault/plan/2026-06-18-centralize-state-plan.md",
    blobHash: "abc",
    languageHint: "markdown",
    text: "---\ndate: 2026-06-17\nmodified: 2026-06-18\n---\n# Title\n",
    truncated: null,
    available: true,
    ...patch,
  });

  it("projects header title, path trail, doc type chip, and metadata from content", () => {
    expect(
      deriveMarkdownHeaderView("doc:2026-06-18-centralize-state-plan", content({})),
    ).toEqual({
      title: "centralize state plan",
      trail: [{ label: ".vault" }, { label: "plan" }],
      category: "plan",
      categoryLabel: "plan",
      meta: [
        { label: "created", value: "2026-06-17" },
        { label: "modified", value: "2026-06-18" },
      ],
    });
  });

  it("falls back to the canonical stem suffix when the served path is absent", () => {
    expect(
      deriveMarkdownHeaderView(
        "doc:2026-06-18-boundary-audit",
        content({ path: undefined, text: "" }),
      ),
    ).toEqual({
      title: "boundary audit",
      category: "audit",
      categoryLabel: "audit",
      meta: undefined,
      trail: undefined,
    });
  });
});

describe("deriveMarkdownReaderView (viewer markdown body)", () => {
  const content = (patch: Partial<ContentView>): ContentView => ({
    loading: false,
    errored: false,
    notFound: false,
    degraded: false,
    degradedTiers: [],
    reasons: {},
    path: ".vault/adr/2026-06-18-reader-adr.md",
    blobHash: "abc",
    languageHint: "markdown",
    text: "",
    truncated: null,
    available: true,
    ...patch,
  });

  it("splits structured frontmatter from the rendered markdown body", () => {
    const view = deriveMarkdownReaderView(
      content({
        text: [
          "---",
          "tags:",
          "  - '#adr'",
          "date: '2026-06-17'",
          "status: accepted",
          "related:",
          "  - '[[2026-06-18-reader-plan]]'",
          "---",
          "",
          "# Body heading",
        ].join("\n"),
      }),
    );

    expect(view).toMatchObject({
      state: "ready",
      stateMessage: null,
      stateTone: "faint",
      truncated: null,
    });
    expect(view.frontmatter).toEqual({
      tags: [{ label: "#adr", category: "adr" }],
      dates: [{ label: "created", value: "2026-06-17" }],
      related: [
        {
          stem: "2026-06-18-reader-plan",
          nodeId: "doc:2026-06-18-reader-plan",
        },
      ],
    });
    expect(view.body).toBe("\n# Body heading");
    expect(view.status).toBe("accepted");
    expect(view.editorial).toMatchObject({
      title: "Body heading",
      dek: null,
      body: "",
      eyebrow: { label: "Decision", category: "adr" },
      meta: ["17 June 2026", "1 min read", "accepted"],
      footerTags: [],
      related: [
        {
          stem: "2026-06-18-reader-plan",
          nodeId: "doc:2026-06-18-reader-plan",
        },
      ],
    });
  });

  it("leaves general markdown untouched when no frontmatter fence is present", () => {
    expect(deriveMarkdownReaderView(content({ text: "# Plain markdown" }))).toEqual({
      state: "ready",
      stateMessage: null,
      stateTone: "faint",
      stateToneClass: "text-ink-faint",
      frontmatter: null,
      status: null,
      body: "# Plain markdown",
      editorial: {
        title: "Plain markdown",
        dek: null,
        body: "",
        eyebrow: null,
        meta: ["1 min read"],
        footerTags: [],
        related: [],
      },
      truncated: null,
      truncationMessage: null,
    });
  });

  it("projects reader editorial header, footer, and truncation chrome", () => {
    const view = deriveMarkdownReaderView(
      content({
        text: [
          "---",
          "tags:",
          "  - '#plan'",
          "  - '#state-boundary'",
          "date: '2026-06-19'",
          "status: draft",
          "related:",
          "  - '[[dashboard-state-plan]]'",
          "---",
          "",
          "# Reader title",
          "",
          "The dek is lifted out of the rendered markdown body.",
          "",
          "The remaining paragraph stays in the markdown article.",
        ].join("\n"),
        truncated: {
          total_bytes: 2500,
          returned_bytes: 1024,
          reason: "content byte ceiling",
        },
      }),
    );

    expect(view.editorial).toEqual({
      title: "Reader title",
      dek: "The dek is lifted out of the rendered markdown body.",
      body: "The remaining paragraph stays in the markdown article.",
      eyebrow: { label: "Plan", category: "plan" },
      meta: ["19 June 2026", "1 min read", "draft"],
      footerTags: [{ label: "#state-boundary" }],
      related: [{ stem: "dashboard-state-plan", nodeId: "doc:dashboard-state-plan" }],
    });
    expect(view.truncationMessage).toBe(
      "Truncated to the first 1,024 of 2,500 bytes — open the file directly for the full document.",
    );
  });

  it("projects loading, error, degraded, empty, and truncated states", () => {
    expect(
      deriveMarkdownReaderView(content({ loading: true, available: false })),
    ).toMatchObject({
      state: "loading",
      stateMessage: "Loading document…",
      stateTone: "faint",
      stateToneClass: "text-ink-faint",
      body: "",
    });
    expect(
      deriveMarkdownReaderView(
        content({ errored: true, available: false, text: "ignored" }),
      ),
    ).toMatchObject({
      state: "errored",
      stateMessage: "The document could not be loaded.",
      stateTone: "broken",
      stateToneClass: "text-state-broken",
      body: "",
    });
    expect(
      deriveMarkdownReaderView(
        content({
          degraded: true,
          available: false,
          reasons: { structural: "worktree not listable" },
          text: "ignored",
        }),
      ),
    ).toMatchObject({
      state: "degraded",
      stateMessage: "Document unavailable: worktree not listable.",
      stateTone: "muted",
      stateToneClass: "text-ink-muted",
      body: "",
    });
    expect(
      deriveMarkdownReaderView(content({ available: false, text: "" })),
    ).toMatchObject({
      state: "empty",
      stateMessage: "This document is empty.",
      stateTone: "faint",
      stateToneClass: "text-ink-faint",
      body: "",
    });

    const truncated = {
      total_bytes: 2_000_000,
      returned_bytes: 1_048_576,
      reason: "content byte ceiling",
    };
    expect(
      deriveMarkdownReaderView(content({ text: "# Body", truncated })).truncated,
    ).toEqual(truncated);
  });

  it("renders a distinct not-in-workspace state on a 404 (never a blank body)", () => {
    expect(
      deriveMarkdownReaderView(content({ notFound: true, available: false, text: "" })),
    ).toMatchObject({
      state: "missing",
      stateMessage: "This document isn't in this workspace.",
      stateTone: "muted",
      body: "",
    });
  });
});

describe("deriveFrontmatterHeaderView (reader frontmatter chrome)", () => {
  it("projects tags, dates, and related links into render rows", () => {
    expect(
      deriveFrontmatterHeaderView({
        tags: ["adr", "review-rail"],
        date: "2026-06-17",
        modified: "2026-06-18",
        related: ["2026-06-18-reader-plan"],
      }),
    ).toEqual({
      tags: [{ label: "#adr", category: "adr" }, { label: "#review-rail" }],
      dates: [
        { label: "created", value: "2026-06-17" },
        { label: "modified", value: "2026-06-18" },
      ],
      related: [
        {
          stem: "2026-06-18-reader-plan",
          nodeId: "doc:2026-06-18-reader-plan",
        },
      ],
    });
  });

  it("collapses absent or empty frontmatter to no header chrome", () => {
    expect(deriveFrontmatterHeaderView(null)).toBeNull();
    expect(deriveFrontmatterHeaderView({ tags: [], related: [] })).toBeNull();
  });
});
