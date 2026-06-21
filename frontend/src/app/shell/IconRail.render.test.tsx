// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { BrowserMode } from "../../stores/view/browserMode";
import { IconRail } from "./IconRail";

afterEach(cleanup);

describe("IconRail", () => {
  it("renders the collapsed left rail with the browser-mode labels", () => {
    const selected: BrowserMode[] = [];
    render(<IconRail active="vault" onSelect={(mode) => selected.push(mode)} />);

    const nav = screen.getByRole("navigation", { name: "Collapsed scope rail" });
    const buttons = Array.from(nav.querySelectorAll("button")).map((button) =>
      button.getAttribute("aria-label"),
    );
    expect(buttons).toEqual(["Vault", "Files"]);

    fireEvent.click(screen.getByRole("button", { name: "Files" }));
    expect(selected).toEqual(["code"]);
  });
});
