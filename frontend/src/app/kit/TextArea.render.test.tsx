// @vitest-environment happy-dom

import { createRef, type FormEvent } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { TextArea, type TextAreaProps } from "./TextArea";

afterEach(cleanup);

function compileOnlyTextAreaBoundaryExamples() {
  // @ts-expect-error -- an explicit accessible name is required.
  const unnamed = <TextArea />;
  // @ts-expect-error -- accessible-name forms are mutually exclusive.
  const conflictingNames = <TextArea aria-label="Comment" aria-labelledby="label" />;
  // @ts-expect-error -- horizontal and bidirectional resizing are excluded.
  const unsafeResize = <TextArea aria-label="Comment" resize="both" />;
  return [unnamed, conflictingNames, unsafeResize];
}

describe("TextArea", () => {
  it("renders an ordinary native multiline textbox with an aria-label", () => {
    render(<TextArea aria-label="Review comment" name="review-comment" rows={4} />);

    const textarea = screen.getByRole("textbox", {
      name: "Review comment",
    }) as HTMLTextAreaElement;
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea.name).toBe("review-comment");
    expect(textarea.getAttribute("rows")).toBe("4");
    expect(textarea.getAttribute("data-kit")).toBe("text-area");
  });

  it("uses aria-labelledby as the mutually exclusive visible-label contract", () => {
    render(
      <>
        <span id="comment-label">Comment</span>
        <TextArea aria-labelledby="comment-label" />
      </>,
    );

    const textarea = screen.getByRole("textbox", { name: "Comment" });
    expect(textarea.getAttribute("aria-label")).toBeNull();
    expect(textarea.getAttribute("aria-labelledby")).toBe("comment-label");
  });

  it("requires one accessible name and a layout-safe resize value at the type boundary", () => {
    expect(compileOnlyTextAreaBoundaryExamples).toBeTypeOf("function");
    expectTypeOf<{ "aria-label": string }>().toMatchTypeOf<TextAreaProps>();
    expectTypeOf<{ "aria-labelledby": string }>().toMatchTypeOf<TextAreaProps>();
  });

  it("applies the regular and compact semantic token recipes", () => {
    const { rerender } = render(<TextArea aria-label="Comment" />);
    const textarea = screen.getByRole("textbox", { name: "Comment" });

    expect(textarea.getAttribute("data-size")).toBe("regular");
    expect(textarea.className.split(" ")).toEqual(
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
    expect(textarea.className).not.toMatch(/\[(?:#|[^\]]*(?:px|rem|em|vw|vh|%))/);
    expect(textarea.getAttribute("style")).toBeNull();

    rerender(<TextArea aria-label="Comment" size="compact" />);
    expect(textarea.getAttribute("data-size")).toBe("compact");
    expect(textarea.className.split(" ")).toEqual(
      expect.arrayContaining(["rounded-fg-xs", "px-fg-2", "py-fg-1", "text-body"]),
    );
    expect(textarea.className).not.toContain("rounded-fg-md");
  });

  it("defaults to vertical resizing and supports an explicit fixed policy", () => {
    const { rerender } = render(<TextArea aria-label="Comment" />);
    const textarea = screen.getByRole("textbox", { name: "Comment" });

    expect(textarea.getAttribute("data-resize")).toBe("vertical");
    expect(
      textarea.className.split(" ").filter((name) => /^resize(?:-|$)/.test(name)),
    ).toEqual(["resize-y"]);

    rerender(<TextArea aria-label="Comment" resize="none" />);
    expect(textarea.getAttribute("data-resize")).toBe("none");
    expect(
      textarea.className.split(" ").filter((name) => /^resize(?:-|$)/.test(name)),
    ).toEqual(["resize-none"]);
  });

  it("exposes focus-visible, invalid, disabled, and read-only state hooks", () => {
    render(<TextArea aria-label="Comment" aria-invalid disabled readOnly />);
    const textarea = screen.getByRole("textbox", {
      name: "Comment",
    }) as HTMLTextAreaElement;

    expect(textarea.disabled).toBe(true);
    expect(textarea.readOnly).toBe(true);
    expect(textarea.getAttribute("aria-invalid")).toBe("true");
    expect(textarea.className.split(" ")).toEqual(
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

  it("forwards its ref and arbitrary native textarea properties", () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(
      <TextArea
        ref={ref}
        aria-label="Comment"
        aria-describedby="comment-hint"
        data-native-probe="forwarded"
        maxLength={500}
        placeholder="Describe the change"
        spellCheck={false}
        wrap="soft"
      />,
    );

    const textarea = screen.getByRole("textbox", {
      name: "Comment",
    }) as HTMLTextAreaElement;
    expect(ref.current).toBe(textarea);
    expect(textarea.getAttribute("aria-describedby")).toBe("comment-hint");
    expect(textarea.getAttribute("data-native-probe")).toBe("forwarded");
    expect(textarea.maxLength).toBe(500);
    expect(textarea.placeholder).toBe("Describe the change");
    expect(textarea.getAttribute("spellcheck")).toBe("false");
    expect(textarea.getAttribute("wrap")).toBe("soft");
  });

  it("preserves controlled values plus input, change, and keyboard events", () => {
    const inputs: string[] = [];
    const changes: string[] = [];
    const onInput: TextAreaProps["onInput"] = (event) =>
      inputs.push(event.currentTarget.value);
    const onChange: TextAreaProps["onChange"] = (event) =>
      changes.push(event.currentTarget.value);
    const onKeyDown = vi.fn();
    const { rerender } = render(
      <TextArea
        aria-label="Comment"
        value="draft"
        onInput={onInput}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />,
    );
    const textarea = screen.getByRole("textbox", {
      name: "Comment",
    }) as HTMLTextAreaElement;

    expect(textarea.value).toBe("draft");
    fireEvent.input(textarea, { target: { value: "input value" } });
    fireEvent.change(textarea, { target: { value: "change value" } });
    const keyAllowed = fireEvent.keyDown(textarea, {
      key: "Enter",
      shiftKey: true,
    });
    expect(inputs).toEqual(["input value"]);
    expect(changes).toContain("change value");
    expect(keyAllowed).toBe(true);
    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(onKeyDown.mock.calls[0]?.[0]).toMatchObject({
      key: "Enter",
      shiftKey: true,
    });

    rerender(
      <TextArea
        aria-label="Comment"
        value="updated"
        onInput={onInput}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />,
    );
    expect(textarea.value).toBe("updated");
  });

  it("preserves uncontrolled default-value mutation", () => {
    render(<TextArea aria-label="Comment" defaultValue="draft" />);
    const textarea = screen.getByRole("textbox", {
      name: "Comment",
    }) as HTMLTextAreaElement;

    expect(textarea.value).toBe("draft");
    fireEvent.change(textarea, { target: { value: "ready" } });
    expect(textarea.value).toBe("ready");
  });

  it("does not add code-editor, composer, or overlay behavior", () => {
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <TextArea aria-label="Ordinary multiline field" />
      </form>,
    );
    const textarea = screen.getByRole("textbox", {
      name: "Ordinary multiline field",
    });

    expect(textarea.getAttribute("role")).toBeNull();
    expect(textarea.getAttribute("aria-autocomplete")).toBeNull();
    expect(textarea.getAttribute("autocomplete")).toBeNull();
    expect(textarea.getAttribute("spellcheck")).toBeNull();
    expect(textarea.getAttribute("style")).toBeNull();
    expect(textarea.className).not.toContain("max-h-");
    expect(textarea.className).not.toContain("overflow-");
    expect(fireEvent.keyDown(textarea, { key: "Enter" })).toBe(true);
    expect(fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true })).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
