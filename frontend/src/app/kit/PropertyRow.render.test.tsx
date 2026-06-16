// @vitest-environment happy-dom
//
// PropertyRow kit primitive (W01.P02.S05): renders the label/value pair without
// crashing under the default theme.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PropertyRow } from "./PropertyRow";

afterEach(cleanup);

describe("PropertyRow", () => {
  it("renders the label and value", () => {
    render(<PropertyRow label="branch" value="main" />);
    expect(screen.getByText("branch")).toBeTruthy();
    expect(screen.getByText("main")).toBeTruthy();
  });

  it("accepts a rich node value", () => {
    render(<PropertyRow label="tier" value={<span>L3</span>} />);
    expect(screen.getByText("L3")).toBeTruthy();
  });
});
