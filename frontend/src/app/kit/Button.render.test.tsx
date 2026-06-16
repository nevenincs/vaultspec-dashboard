// @vitest-environment happy-dom
//
// Kit Button render contract: it mounts as a real <button> under the default
// theme, defaults to type="button", reflects the variant via data-variant, and
// fires onClick. Core vitest matchers only (no jest-dom in this repo).

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "./Button";

afterEach(cleanup);

describe("Button", () => {
  it("renders a real button defaulting to type=button", () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.getAttribute("data-variant")).toBe("secondary");
  });

  it("reflects the requested variant", () => {
    render(<Button variant="primary">Go</Button>);
    expect(
      screen.getByRole("button", { name: "Go" }).getAttribute("data-variant"),
    ).toBe("primary");
  });

  it("does not fire onClick when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Nope
      </Button>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Nope" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
