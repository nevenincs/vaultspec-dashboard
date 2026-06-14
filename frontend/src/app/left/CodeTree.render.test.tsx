// @vitest-environment happy-dom
//
// Code mode surface adoption (dashboard-code-tree plan P04.S15): the code
// browser's FOUR honest states (loading, empty, degraded, error), its LAZY
// one-level-per-directory expansion, and the BIDIRECTIONAL code:<path> selection
// join — exercised through the real stores client transport (mockEngine), no
// component-internal doubles. The degraded state is driven by a real structural-
// tier block the engine serves, proving the surface renders worktree-only
// degradation as a designed state rather than a bare error, read through the
// stores selector and never the raw tiers block.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { buildFixtureCorpus } from "../../testing/fixtures/corpus";
import { MockEngine, MOCK_SCOPE } from "../../testing/mockEngine";
import { CodeTree, type CodeTreeProps } from "./CodeTree";

function renderTree(props: CodeTreeProps = {}) {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(CodeTree, props),
    ),
  );
}

describe("CodeTree surface states + lazy expansion + selection join (P04.S15)", () => {
  beforeEach(() => {
    // Pin the active scope synchronously so useActiveScope resolves without the
    // map/session round-trip; the file-tree query then runs against the mock.
    useViewStore.getState().setScope(MOCK_SCOPE);
    useViewStore.getState().select(null);
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    useViewStore.getState().setScope(null);
    useViewStore.getState().select(null);
    engineClient.useTransport((input, init) => fetch(input, init));
    vi.restoreAllMocks();
  });

  // --- the four honest states -----------------------------------------------------

  it("renders a quiet copy-toned loading line while the root level is in flight", () => {
    // A transport that never resolves keeps the root query pending.
    engineClient.useTransport(() => new Promise<Response>(() => {}));
    renderTree();
    const pending = screen.getByRole("status");
    expect(pending.textContent).toMatch(/reading the worktree/i);
  });

  it("renders the directory hierarchy under a labelled landmark when the root loads", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderTree();
    const nav = await screen.findByRole("navigation", { name: "code browser" });
    expect(nav).toBeTruthy();
    // The root level lists directories (src) and files (Cargo.toml, README.md),
    // each a disclosure/leaf row carrying its full path as the hover title.
    await waitFor(() => {
      const rows = document.querySelectorAll("[data-code-row]");
      expect(rows.length).toBeGreaterThan(0);
    });
    expect(screen.getByTitle("src")).toBeTruthy();
    expect(screen.getByTitle("Cargo.toml")).toBeTruthy();
    // One level only: a nested file is NOT in the root listing until expanded.
    expect(screen.queryByTitle("src/editor-demo/mod.rs")).toBeNull();
  });

  it("shows an approachable empty state for a worktree with no source files", async () => {
    // A real corpus whose code tree is empty — a valid scope that resolves to no
    // listable source (distinct from the degraded no-working-tree state).
    const corpus = { ...buildFixtureCorpus(), codeTree: [] as string[] };
    engineClient.useTransport(new MockEngine(corpus).fetchImpl);
    renderTree();
    await waitFor(() => {
      const empty = document.querySelector("[data-code-empty]");
      expect(empty?.textContent).toMatch(/no source files/i);
    });
  });

  it("renders a designed degraded state (with reason) for a scope with no working tree", async () => {
    // setNoVault models a scope whose structural tier cannot list the worktree:
    // the route degrades the `structural` tier honestly with an empty level. The
    // code mode reads that through the stores selector and renders the designed
    // degraded state, NOT a bare error and NOT a healthy-looking empty.
    const mock = new MockEngine();
    mock.setNoVault(true);
    engineClient.useTransport(mock.fetchImpl);
    renderTree();
    await waitFor(() => {
      const degraded = document.querySelector("[data-code-degraded]");
      expect(degraded).toBeTruthy();
      expect(degraded?.textContent).toMatch(/no code tree/i);
      expect(degraded?.textContent).toMatch(/worktree not listable/);
    });
    // Degradation is NOT an error and NOT the empty state.
    expect(document.querySelector("[data-code-error]")).toBeNull();
    expect(document.querySelector("[data-code-empty]")).toBeNull();
  });

  it("renders a contained error with a retry control on a genuine read failure", async () => {
    // A non-ok response with no tiers envelope is a transport-level failure —
    // the query errors, distinct from degradation.
    engineClient.useTransport(() =>
      Promise.resolve(new Response("boom", { status: 500 })),
    );
    renderTree();
    await waitFor(() => {
      expect(screen.getByText(/code tree unavailable/i)).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  });

  // --- lazy one-level-per-directory expansion -------------------------------------

  it("fetches a directory's children only on first expansion (lazy, one level per call)", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderTree();
    await screen.findByRole("navigation", { name: "code browser" });
    const srcRow = await screen.findByTitle("src");
    // Collapsed: the nested level is not mounted, so no src/* child rows exist.
    expect(screen.queryByTitle("src/editor-demo")).toBeNull();
    expect(srcRow.getAttribute("aria-expanded")).toBe("false");

    // Expand src → its children level mounts and fetches; a nested directory row
    // appears (one level deeper only — the grandchild files are not yet listed).
    fireEvent.click(srcRow);
    expect(srcRow.getAttribute("aria-expanded")).toBe("true");
    await waitFor(() => {
      expect(screen.getByTitle("src/editor-demo")).toBeTruthy();
    });
    // Still one level: the file inside src/editor-demo is NOT listed until that
    // directory is itself expanded.
    expect(screen.queryByTitle("src/editor-demo/mod.rs")).toBeNull();

    // Expand the nested directory → its files appear (the next level).
    fireEvent.click(screen.getByTitle("src/editor-demo"));
    await waitFor(() => {
      expect(screen.getByTitle("src/editor-demo/mod.rs")).toBeTruthy();
    });
  });

  // --- bidirectional selection join ----------------------------------------------

  it("a file-row click selects the file's code: node (row → stage)", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderTree();
    await screen.findByRole("navigation", { name: "code browser" });
    // Descend to a real file row: expand src, then src/editor-demo.
    fireEvent.click(await screen.findByTitle("src"));
    fireEvent.click(await screen.findByTitle("src/editor-demo"));
    const fileRow = await screen.findByTitle("src/editor-demo/mod.rs");
    fireEvent.click(fileRow);
    // The shared selection now names the file's code: node (the shared-rule id).
    expect(useViewStore.getState().selection).toEqual({
      kind: "node",
      id: "code:src/editor-demo/mod.rs",
    });
  });

  it("the active stage selection highlights its matching code row (stage → row)", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    // Pre-select a code node that lives at the root level (no expansion needed):
    // README.md → code:README.md.
    useViewStore.getState().select("code:README.md");
    renderTree();
    await screen.findByRole("navigation", { name: "code browser" });
    await waitFor(() => {
      const row = screen.getByTitle("README.md");
      // The selection join marks the matching row current (aria-current=page),
      // the same cross-region highlight the vault browser realizes for doc:<stem>.
      expect(row.getAttribute("aria-current")).toBe("page");
    });
    // A different file's row is NOT highlighted.
    expect(screen.getByTitle("Cargo.toml").getAttribute("aria-current")).toBeNull();
  });

  // --- quiet absent-interlink state ----------------------------------------------

  it("renders the quiet absent-interlink state by default and a marker for linked files", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    // Supply a linkage set containing ONLY README.md's node: that file shows the
    // quiet linkage marker; every other file is the quiet ABSENT state (no
    // marker), still listed and selectable.
    renderTree({ linkedNodeIds: new Set(["code:README.md"]) });
    await screen.findByRole("navigation", { name: "code browser" });
    await waitFor(() => {
      const linked = screen.getByTitle("README.md");
      expect(linked.hasAttribute("data-code-linked")).toBe(true);
    });
    // Cargo.toml has no graph node in the set → the quiet absent state (no marker),
    // but it is still a listed, clickable row (navigation is never blocked).
    const absent = screen.getByTitle("Cargo.toml");
    expect(absent.hasAttribute("data-code-linked")).toBe(false);
    expect(absent.tagName).toBe("BUTTON");
  });

  // --- in-rail filter (client-side narrowing, not a wire search) ------------------

  it("narrows the visible files by the in-rail filter, keeping directories", async () => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    renderTree({ filter: "README" });
    await screen.findByRole("navigation", { name: "code browser" });
    await waitFor(() => {
      // The matching file stays; the non-matching root file is hidden.
      expect(screen.getByTitle("README.md")).toBeTruthy();
      expect(screen.queryByTitle("Cargo.toml")).toBeNull();
    });
    // A directory always stays visible (its match may live in an unfetched
    // descendant) so the filter never hides the path to a possible match.
    expect(screen.getByTitle("src")).toBeTruthy();
  });
});
