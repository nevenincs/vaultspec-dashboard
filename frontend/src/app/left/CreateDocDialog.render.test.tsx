// @vitest-environment happy-dom
//
// Mount regression for the "New document" dialog. Every entry point (vault-tree
// context menu, palette, Mod+Alt+N) opens it by flipping `createDocChrome` state
// — after the stage nav bar was retired nothing rendered that state, so "New
// document…" silently did nothing. This guards the contract the shell now
// honors: the dialog component renders closed-by-default, and opening the
// chrome store (with an optional feature prefill) materializes the form.

import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { queryClient } from "../../stores/server/queryClient";
import {
  openCreateDocDialog,
  resetCreateDocChrome,
} from "../../stores/view/createDocChrome";
import { CreateDocDialog } from "./CreateDocDialog";

function renderDialog() {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(CreateDocDialog),
    ),
  );
}

describe("CreateDocDialog (store-driven mount)", () => {
  afterEach(() => {
    resetCreateDocChrome();
    cleanup();
  });

  it("renders nothing while the chrome store is closed", () => {
    renderDialog();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opening the store renders the create form with the feature prefill", () => {
    renderDialog();
    act(() => {
      openCreateDocDialog("editor-demo");
    });
    expect(screen.getByRole("dialog", { name: "New document" })).toBeTruthy();
    expect(screen.getByLabelText("document type")).toBeTruthy();
    expect(screen.getByLabelText("title")).toBeTruthy();
    const feature = screen.getByLabelText("feature") as HTMLInputElement;
    expect(feature.value).toBe("editor-demo");
  });
});
