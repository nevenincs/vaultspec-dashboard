// @vitest-environment happy-dom

import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { TextField, type TextFieldProps } from "./TextField";

afterEach(cleanup);

function compileOnlyTextFieldBoundaryExamples() {
  // @ts-expect-error -- an explicit accessible name is required.
  const unnamed = <TextField />;
  // @ts-expect-error -- accessible-name forms are mutually exclusive.
  const conflictingNames = <TextField aria-label="Name" aria-labelledby="name-label" />;
  // @ts-expect-error -- specialized date-input semantics are not accepted.
  const dateInput = <TextField aria-label="Date" type="date" />;
  return [unnamed, conflictingNames, dateInput];
}

describe("TextField", () => {
  it("renders an ordinary native text input with an aria-label", () => {
    render(<TextField aria-label="Document name" name="document-name" />);

    const input = screen.getByRole("textbox", {
      name: "Document name",
    }) as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
    expect(input.type).toBe("text");
    expect(input.name).toBe("document-name");
    expect(input.getAttribute("data-kit")).toBe("text-field");
  });

  it("uses aria-labelledby as the mutually exclusive visible-label contract", () => {
    render(
      <>
        <span id="project-path-label">Project path</span>
        <TextField aria-labelledby="project-path-label" />
      </>,
    );

    const input = screen.getByRole("textbox", { name: "Project path" });
    expect(input.getAttribute("aria-label")).toBeNull();
    expect(input.getAttribute("aria-labelledby")).toBe("project-path-label");
  });

  it("requires exactly one accessible-name form at the type boundary", () => {
    expect(compileOnlyTextFieldBoundaryExamples).toBeTypeOf("function");
    expectTypeOf<{ "aria-label": string }>().toMatchTypeOf<TextFieldProps>();
    expectTypeOf<{ "aria-labelledby": string }>().toMatchTypeOf<TextFieldProps>();
  });

  it("applies the regular and compact semantic token recipes", () => {
    const { rerender } = render(<TextField aria-label="Title" />);
    const input = screen.getByRole("textbox", { name: "Title" });

    expect(input.getAttribute("data-size")).toBe("regular");
    expect(input.className.split(" ")).toEqual(
      expect.arrayContaining([
        "rounded-fg-md",
        "px-fg-3",
        "py-fg-2",
        "text-body",
        "border-rule",
        "bg-paper",
        "text-ink",
      ]),
    );
    expect(input.className).not.toMatch(/\[(?:#|[^\]]*(?:px|rem|em|vw|vh|%))/);
    expect(input.getAttribute("style")).toBeNull();

    rerender(<TextField aria-label="Title" size="compact" />);
    expect(input.getAttribute("data-size")).toBe("compact");
    expect(input.className.split(" ")).toEqual(
      expect.arrayContaining(["rounded-fg-xs", "px-fg-2", "py-fg-1", "text-body"]),
    );
    expect(input.className).not.toContain("rounded-fg-md");
  });

  it("exposes focus-visible, invalid, disabled, and read-only state hooks", () => {
    render(<TextField aria-label="Repository" aria-invalid disabled readOnly />);
    const input = screen.getByRole("textbox", {
      name: "Repository",
    }) as HTMLInputElement;

    expect(input.disabled).toBe(true);
    expect(input.readOnly).toBe(true);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.className.split(" ")).toEqual(
      expect.arrayContaining([
        "focus-visible:outline-focus",
        "aria-[invalid=true]:border-state-broken",
        "disabled:cursor-not-allowed",
        "disabled:bg-paper-sunken",
        "read-only:cursor-default",
        "read-only:text-ink-muted",
      ]),
    );
  });

  it("forwards its ref and ordinary native input properties", () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <TextField
        ref={ref}
        aria-label="Branch"
        autoComplete="off"
        inputMode="text"
        maxLength={80}
        placeholder="main"
        spellCheck={false}
      />,
    );

    const input = screen.getByRole("textbox", {
      name: "Branch",
    }) as HTMLInputElement;
    expect(ref.current).toBe(input);
    expect(input.autocomplete).toBe("off");
    expect(input.inputMode).toBe("text");
    expect(input.maxLength).toBe(80);
    expect(input.placeholder).toBe("main");
    expect(input.getAttribute("spellcheck")).toBe("false");
  });

  it("preserves controlled change and keyboard event propagation", () => {
    const changes: string[] = [];
    const onChange: TextFieldProps["onChange"] = (event) =>
      changes.push(event.currentTarget.value);
    const onKeyDown = vi.fn();
    const { rerender } = render(
      <TextField
        aria-label="Document name"
        value="draft"
        onChange={onChange}
        onKeyDown={onKeyDown}
      />,
    );
    const input = screen.getByRole("textbox", {
      name: "Document name",
    }) as HTMLInputElement;

    expect(input.value).toBe("draft");
    fireEvent.change(input, { target: { value: "final" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(changes).toEqual(["final"]);
    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(onKeyDown.mock.calls[0]?.[0].key).toBe("Enter");

    rerender(
      <TextField
        aria-label="Document name"
        value="updated"
        onChange={onChange}
        onKeyDown={onKeyDown}
      />,
    );
    expect(input.value).toBe("updated");
  });

  it("preserves uncontrolled default-value behavior", () => {
    render(<TextField aria-label="Tag" defaultValue="draft" />);
    const input = screen.getByRole("textbox", { name: "Tag" }) as HTMLInputElement;

    expect(input.value).toBe("draft");
    fireEvent.change(input, { target: { value: "ready" } });
    expect(input.value).toBe("ready");
  });

  it("does not absorb search, date, code, or composer semantics", () => {
    render(<TextField aria-label="Ordinary field" />);
    const input = screen.getByRole("textbox", { name: "Ordinary field" });
    expect(input.getAttribute("type")).toBe("text");
    expect(input.getAttribute("role")).toBeNull();
    expect(input.getAttribute("aria-autocomplete")).toBeNull();
    expect(input.getAttribute("autocomplete")).toBeNull();
    expect(input.getAttribute("rows")).toBeNull();
  });
});
