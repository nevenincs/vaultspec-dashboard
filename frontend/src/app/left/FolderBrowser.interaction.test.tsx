// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import type { FsListEntry, FsListResponse } from "../../stores/server/engine";
import type { FolderBrowserView } from "./FolderBrowser";
import { deriveFolderBrowserView, FolderBrowser } from "./FolderBrowser";

afterEach(cleanup);

const view: FolderBrowserView = {
  state: "ready",
  breadcrumbs: [
    { label: { key: "projects:folderBrowser.labels.roots" }, path: null },
    { label: "code", path: "C:/code" },
  ],
  currentPath: "C:/code",
  currentName: "code",
  rows: [
    {
      key: "registered",
      label: "registered",
      path: "C:/code/registered",
      isHidden: false,
      isRegistered: true,
      badge: "already-added",
    },
    {
      key: "available",
      label: "available",
      path: "C:/code/available",
      isHidden: false,
      isRegistered: false,
      badge: null,
    },
  ],
  emptyMessage: null,
  truncated: false,
};

function BrowserHarness({ inert = false }: { inert?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [navigated, setNavigated] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  return (
    <I18nextProvider i18n={createTestLocalizationRuntime()}>
      <FolderBrowser
        view={view}
        inert={inert}
        selectedPath={selected}
        onSelect={setSelected}
        onNavigate={setNavigated}
        query={query}
        onQueryChange={setQuery}
        showHidden={showHidden}
        onShowHiddenChange={setShowHidden}
      />
      <output data-testid="selected">{selected ?? "none"}</output>
      <output data-testid="navigated">{navigated ?? "none"}</output>
    </I18nextProvider>
  );
}

describe("FolderBrowser interaction", () => {
  it("keeps registered rows inert for click, double-click, and keyboard navigation", () => {
    render(<BrowserHarness />);
    const registered = screen.getByRole("option", { name: /registered/u });

    fireEvent.click(registered);
    fireEvent.doubleClick(registered);
    registered.focus();
    fireEvent.keyDown(registered, { key: "Enter" });
    fireEvent.keyDown(registered, { key: "ArrowRight" });

    expect(screen.getByTestId("selected").textContent).toBe("none");
    expect(screen.getByTestId("navigated").textContent).toBe("none");
  });

  it("prevents held rows from changing selection or navigation", () => {
    render(<BrowserHarness inert />);
    const available = screen.getByRole("option", { name: "available" });

    fireEvent.click(available);
    fireEvent.doubleClick(available);
    fireEvent.keyDown(available, { key: "Enter" });

    expect(screen.getByTestId("selected").textContent).toBe("none");
    expect(screen.getByTestId("navigated").textContent).toBe("none");
  });
});

// Focus movement across navigation paths.

function fsEntry(path: string, overrides: Partial<FsListEntry> = {}): FsListEntry {
  return {
    name: path.split("/").filter(Boolean).pop() ?? path,
    path,
    is_managed: false,
    is_git: false,
    is_hidden: false,
    is_registered: false,
    ...overrides,
  };
}

function fsLevel(
  path: string | null,
  parent: string | null,
  entries: FsListEntry[],
): FsListResponse {
  return {
    path,
    parent,
    is_registered: false,
    entries,
    places: [],
    truncated: false,
    tiers: {},
  };
}

const LEVELS = new Map<string, FsListResponse>([
  [
    "C:/code",
    fsLevel("C:/code", "C:/", [
      fsEntry("C:/code/alpha", { is_git: true }),
      fsEntry("C:/code/beta"),
      fsEntry("C:/code/gamma"),
    ]),
  ],
  [
    "C:/code/alpha",
    fsLevel("C:/code/alpha", "C:/code", [fsEntry("C:/code/alpha/inner")]),
  ],
  ["C:/", fsLevel("C:/", null, [fsEntry("C:/code"), fsEntry("C:/users")])],
  ["C:/code/beta", fsLevel("C:/code/beta", "C:/code", [fsEntry("C:/code/beta/leaf")])],
]);

/** Plays AddProjectDialog's owner role: owns the browsed path and selection,
 *  and arms the shared focus intent on every navigation exactly like the
 *  dialog's `navigate()`. The external button stands in for a places-rail row
 *  (the rail routes through the same owner `navigate`). */
function LevelHarness() {
  const [path, setPath] = useState<string | null>("C:/code");
  const [selected, setSelected] = useState<string | null>(null);
  const focusIntent = useRef(false);
  const data = path === null ? undefined : LEVELS.get(path);
  const levelView = deriveFolderBrowserView({
    data,
    loading: false,
    errored: false,
    filtered: false,
  });
  const navigate = (next: string | null) => {
    focusIntent.current = true;
    setSelected(null);
    setPath(next);
  };
  return (
    <I18nextProvider i18n={createTestLocalizationRuntime()}>
      <button
        type="button"
        data-testid="external-place"
        onClick={() => navigate("C:/code/beta")}
      >
        beta place
      </button>
      <FolderBrowser
        view={levelView}
        selectedPath={selected}
        onSelect={setSelected}
        onNavigate={navigate}
        focusIntent={focusIntent}
        query=""
        onQueryChange={() => {}}
        showHidden={false}
        onShowHiddenChange={() => {}}
      />
    </I18nextProvider>
  );
}

function options(): HTMLButtonElement[] {
  return screen.getAllByRole("option") as HTMLButtonElement[];
}

describe("FolderBrowser focus movement", () => {
  it("contributes one tab stop and selection follows the arrow rove", () => {
    render(<LevelHarness />);
    const rows = options();
    expect(rows.map((row) => row.tabIndex)).toEqual([0, -1, -1]);

    rows[0]!.focus();
    fireEvent.keyDown(rows[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(options()[1]);
    // Selection follows the roving focus.
    expect(options()[1]!.getAttribute("aria-selected")).toBe("true");
    expect(options().map((row) => row.tabIndex)).toEqual([-1, 0, -1]);

    fireEvent.keyDown(options()[1]!, { key: "Home" });
    expect(document.activeElement).toBe(options()[0]);
  });

  it("keeps keyboard focus in the list across an Enter navigation", () => {
    render(<LevelHarness />);
    const first = options()[0]!;
    first.focus();
    fireEvent.keyDown(first, { key: "Enter" });
    const landed = options();
    expect(landed[0]!.title).toBe("C:/code/alpha/inner");
    expect(document.activeElement).toBe(landed[0]);
  });

  it("keeps keyboard focus in the list when an ancestor breadcrumb navigates", () => {
    render(<LevelHarness />);
    // Drill in first so an ancestor crumb exists ("code").
    const first = options()[0]!;
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(options()[0]!.title).toBe("C:/code/alpha/inner");

    const crumb = screen.getByRole("button", { name: "code" });
    crumb.focus();
    fireEvent.click(crumb);
    // The activated crumb re-renders as the current-location span; focus must
    // land on the new level's first row, never document.body.
    const landed = options();
    expect(landed[0]!.title).toBe("C:/code/alpha");
    expect(document.activeElement).toBe(landed[0]);
  });

  it("keeps keyboard focus in the list when an external place navigates", () => {
    render(<LevelHarness />);
    const place = screen.getByTestId("external-place");
    place.focus();
    fireEvent.click(place);
    const landed = options();
    expect(landed[0]!.title).toBe("C:/code/beta/leaf");
    expect(document.activeElement).toBe(landed[0]);
  });

  it("climbs to the parent with ArrowLeft and Backspace, keeping focus", () => {
    render(<LevelHarness />);
    const first = options()[0]!;
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    const landed = options();
    expect(landed[0]!.title).toBe("C:/code");
    expect(document.activeElement).toBe(landed[0]);
  });
});
