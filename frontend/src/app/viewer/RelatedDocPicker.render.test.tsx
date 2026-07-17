// @vitest-environment happy-dom
//
// Render tests for the Related-document linking picker (document-editor-redesign
// P03.S05): it links against the live corpus (add via the combobox, shown as a
// removable token) and never offers the document being edited or an already-linked
// one. Also covers the pure parse/serialize round-trip.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EditorCorpusDocument } from "../../stores/server/queries";
import {
  RelatedDocPicker,
  parseRelatedStems,
  serializeRelatedStems,
} from "./RelatedDocPicker";

afterEach(cleanup);

const CORPUS: EditorCorpusDocument[] = [
  { stem: "alpha-plan", title: "Alpha plan", feature: "alpha" },
  { stem: "beta-adr", title: "Beta decision", feature: "beta" },
  { stem: "self-doc", title: "Self", feature: "self" },
];

describe("parseRelatedStems / serializeRelatedStems", () => {
  it("parses, de-duplicates, and tolerates wiki-link wrapping", () => {
    expect(parseRelatedStems("alpha-plan, [[beta-adr]], alpha-plan")).toEqual([
      "alpha-plan",
      "beta-adr",
    ]);
    expect(parseRelatedStems("")).toEqual([]);
  });

  it("serializes back to a comma-joined string", () => {
    expect(serializeRelatedStems(["a", "b"])).toBe("a, b");
  });
});

describe("RelatedDocPicker", () => {
  it("adds a picked document to the related string, excluding self", () => {
    const onChange = vi.fn();
    render(
      <RelatedDocPicker
        related=""
        onChange={onChange}
        corpus={CORPUS}
        selfStem="self-doc"
      />,
    );

    const input = screen.getByRole("combobox", { name: "Link a related document" });
    fireEvent.focus(input);
    // The edited document never lists itself as a link target.
    expect(screen.queryByText("Self")).toBeNull();

    fireEvent.change(input, { target: { value: "beta" } });
    fireEvent.mouseDown(screen.getByRole("option", { name: /Beta decision/ }));

    expect(onChange).toHaveBeenCalledWith("beta-adr");
  });

  it("renders linked documents as removable tokens", () => {
    const onChange = vi.fn();
    render(
      <RelatedDocPicker
        related="alpha-plan, beta-adr"
        onChange={onChange}
        corpus={CORPUS}
        selfStem="self-doc"
      />,
    );

    expect(screen.getByText("alpha-plan")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove alpha-plan" }));
    expect(onChange).toHaveBeenCalledWith("beta-adr");
  });

  it("does not offer an already-linked document in the combobox", () => {
    render(
      <RelatedDocPicker
        related="alpha-plan"
        onChange={() => undefined}
        corpus={CORPUS}
        selfStem="self-doc"
      />,
    );
    const input = screen.getByRole("combobox", { name: "Link a related document" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "alpha" } });
    // "Alpha plan" is already linked, so it is not an option.
    expect(screen.queryByRole("option", { name: /Alpha plan/ })).toBeNull();
  });
});
