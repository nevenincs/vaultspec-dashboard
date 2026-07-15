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
      stateTone: "faint",
      text: "line one\nline two\n",
      rawLines: ["line one", "line two"],
      path: "src/auth/mod.rs",
      languageHint: "rust",
      truncated: null,
    });
  });

  it("projects designed loading, error, degraded, and empty states", () => {
    expect(
      deriveCodeViewerView(content({ loading: true, available: false, text: "" })),
    ).toMatchObject({
      state: "loading",
      stateTone: "faint",
      text: "",
      rawLines: [],
    });
    expect(
      deriveCodeViewerView(content({ errored: true, available: false, text: "" })),
    ).toMatchObject({
      state: "errored",
      stateTone: "broken",
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
      stateTone: "muted",
    });
    expect(deriveCodeViewerView(content({ available: false, text: "" }))).toMatchObject(
      {
        state: "empty",
        stateTone: "faint",
      },
    );
  });

  it("renders a distinct not-in-workspace state on a 404 (never a blank body)", () => {
    expect(
      deriveCodeViewerView(content({ notFound: true, available: false, text: "" })),
    ).toMatchObject({
      state: "missing",
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
    expect(
      deriveCodeViewerView(
        content({ loading: true, available: false, text: "", truncated }),
      ).truncated,
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
        { kind: "created", iso: "2026-06-17" },
        { kind: "updated", iso: "2026-06-18" },
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
      stateTone: "faint",
      truncated: null,
    });
    expect(view.frontmatter).toEqual({
      tags: [{ value: "adr", category: "adr" }],
      dates: [{ kind: "created", iso: "2026-06-17" }],
      related: [
        {
          stem: "2026-06-18-reader-plan",
          nodeId: "doc:2026-06-18-reader-plan",
        },
      ],
    });
    expect(view.body).toBe("\n# Body heading");
    expect(view.editorial).toMatchObject({
      title: "Body heading",
      dek: null,
      body: "",
      documentType: "adr",
      createdAt: "2026-06-17",
      updatedAt: null,
      readMinutes: 1,
      status: "accepted",
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
      stateTone: "faint",
      frontmatter: null,
      body: "# Plain markdown",
      editorial: {
        title: "Plain markdown",
        dek: null,
        body: "",
        documentType: null,
        createdAt: null,
        updatedAt: null,
        readMinutes: 1,
        status: null,
        footerTags: [],
        related: [],
      },
      truncated: null,
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
      documentType: "plan",
      createdAt: "2026-06-19",
      updatedAt: null,
      readMinutes: 1,
      status: "draft",
      footerTags: [{ value: "state-boundary" }],
      related: [{ stem: "dashboard-state-plan", nodeId: "doc:dashboard-state-plan" }],
    });
  });

  it("projects loading, error, degraded, empty, and truncated states", () => {
    expect(
      deriveMarkdownReaderView(content({ loading: true, available: false })),
    ).toMatchObject({
      state: "loading",
      stateTone: "faint",
      body: "",
    });
    expect(
      deriveMarkdownReaderView(
        content({ errored: true, available: false, text: "ignored" }),
      ),
    ).toMatchObject({
      state: "errored",
      stateTone: "broken",
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
      stateTone: "muted",
      body: "",
    });
    expect(
      deriveMarkdownReaderView(content({ available: false, text: "" })),
    ).toMatchObject({
      state: "empty",
      stateTone: "faint",
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
      tags: [{ value: "adr", category: "adr" }, { value: "review-rail" }],
      dates: [
        { kind: "created", iso: "2026-06-17" },
        { kind: "updated", iso: "2026-06-18" },
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
