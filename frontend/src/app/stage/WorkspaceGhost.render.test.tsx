// @vitest-environment happy-dom
//
// The workspace empty state gains a New-document affordance (authoring-surface ADR
// D5): a secondary button beside "Show graph" that dispatches the ONE shared
// new-document action (opening the create-document chrome store) — never a bespoke
// handler. Pure app chrome, so it renders without a query provider.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  resetCreateDocChrome,
  useCreateDocChromeStore,
} from "../../stores/view/createDocChrome";
import { WorkspaceGhost } from "./WorkspaceGhost";

afterEach(() => {
  resetCreateDocChrome();
  cleanup();
});

describe("WorkspaceGhost", () => {
  it("offers both recovery affordances", () => {
    render(<WorkspaceGhost />);
    expect(screen.getByRole("button", { name: "Show graph" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "New document" })).toBeTruthy();
  });

  it("New document dispatches the shared create action (opens the create store)", () => {
    render(<WorkspaceGhost />);
    expect(useCreateDocChromeStore.getState().open).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "New document" }));
    expect(useCreateDocChromeStore.getState().open).toBe(true);
  });
});
