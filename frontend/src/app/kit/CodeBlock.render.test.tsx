// @vitest-environment happy-dom
//
// CodeBlock kit primitive (W01.P02.S05): renders the static fenced-code surface
// without crashing, shows the code, renders the optional filename/language header,
// and emits a line-number gutter when asked.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CodeBlock } from "./CodeBlock";

afterEach(cleanup);

describe("CodeBlock", () => {
  it("renders the code inside a <pre>/<code> surface", () => {
    const { container } = render(<CodeBlock code="const x = 1;" />);
    expect(container.querySelector("pre code")).toBeTruthy();
    expect(screen.getByText("const x = 1;")).toBeTruthy();
  });

  it("renders the optional filename and language header", () => {
    render(<CodeBlock code="x" filename="main.ts" language="ts" />);
    expect(screen.getByText("main.ts")).toBeTruthy();
    expect(screen.getByText("ts")).toBeTruthy();
  });

  it("renders a line-number gutter when showLineNumbers is set", () => {
    render(<CodeBlock code={"a\nb\nc"} showLineNumbers />);
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });
});
