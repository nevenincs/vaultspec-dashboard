import { beforeEach, describe, expect, it } from "vitest";

import {
  boundedScrollTop,
  codeViewerScrollSnapshot,
  deriveCodeLineRowStyle,
  deriveCodeLineWindow,
  deriveCodeLineWindowPresentation,
  resetCodeViewerScroll,
  setCodeViewerScrollTop,
} from "./codeViewer";

describe("deriveCodeLineWindow", () => {
  it("derives the visible line range with overscan and stable gutter width", () => {
    expect(
      deriveCodeLineWindow({
        totalLines: 1_000,
        scrollTop: 400,
        viewportHeight: 100,
        lineHeight: 20,
        overscan: 2,
      }),
    ).toEqual({
      first: 18,
      last: 27,
      totalHeight: 20_000,
      gutterWidth: "5ch",
      lineHeight: 20,
    });
  });

  it("clamps invalid measurements and scroll positions", () => {
    expect(
      deriveCodeLineWindow({
        totalLines: -1,
        scrollTop: -20,
        viewportHeight: 0,
        lineHeight: 0,
        overscan: -2,
      }),
    ).toEqual({
      first: 0,
      last: 0,
      totalHeight: 0,
      gutterWidth: "2ch",
      lineHeight: 1,
    });

    expect(
      deriveCodeLineWindow({
        totalLines: "many",
        scrollTop: "40",
        viewportHeight: null,
        lineHeight: Number.NaN,
        overscan: "large",
      }),
    ).toEqual({
      first: 0,
      last: 0,
      totalHeight: 0,
      gutterWidth: "2ch",
      lineHeight: 20,
    });
  });

  it("projects the scroll-region, spacer, row, gutter, and code chrome", () => {
    const lineWindow = deriveCodeLineWindow({
      totalLines: 120,
      scrollTop: 40,
      viewportHeight: 60,
      lineHeight: 20,
      overscan: 1,
    });

    expect(deriveCodeLineWindowPresentation(lineWindow)).toEqual({
      scrollerClassName:
        "min-h-0 flex-1 overflow-auto bg-paper-sunken font-mono text-body",
      scrollerAriaLabel: "file contents",
      spacerStyle: { height: 2_400, position: "relative" },
      rowClassName: "flex whitespace-pre",
      gutterClassName: "sticky left-0 select-none pr-fg-2 text-right text-ink-faint",
      gutterStyle: { width: "4ch", flex: "0 0 auto" },
      codeClassName: "px-fg-1",
    });
    expect(deriveCodeLineRowStyle(3, lineWindow)).toEqual({
      position: "absolute",
      top: 60,
      height: 20,
      lineHeight: "20px",
      left: 0,
      right: 0,
    });
  });
});

describe("code viewer scroll seam", () => {
  beforeEach(() => {
    resetCodeViewerScroll();
  });

  it("stores bounded code viewer scroll state behind one seam", () => {
    setCodeViewerScrollTop(240);
    expect(codeViewerScrollSnapshot()).toMatchObject({ scrollTop: 240 });

    setCodeViewerScrollTop(-10);
    expect(codeViewerScrollSnapshot()).toMatchObject({ scrollTop: 0 });

    setCodeViewerScrollTop(Number.NaN);
    expect(codeViewerScrollSnapshot()).toMatchObject({ scrollTop: 0 });

    setCodeViewerScrollTop("240");
    expect(codeViewerScrollSnapshot()).toMatchObject({ scrollTop: 0 });
    expect(boundedScrollTop({ scrollTop: 240 })).toBe(0);
  });

  it("resets scroll state to the top of the code viewer", () => {
    setCodeViewerScrollTop(500);
    resetCodeViewerScroll();

    expect(codeViewerScrollSnapshot()).toMatchObject({ scrollTop: 0 });
  });
});
