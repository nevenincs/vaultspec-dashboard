import { create } from "zustand";

export const CODE_VIEWER_LINE_HEIGHT = 20;
export const CODE_VIEWER_OVERSCAN = 12;

export interface CodeLineWindowInput {
  totalLines: unknown;
  scrollTop: unknown;
  viewportHeight: unknown;
  lineHeight?: unknown;
  overscan?: unknown;
}

export interface CodeLineWindow {
  first: number;
  last: number;
  totalHeight: number;
  gutterWidth: string;
  lineHeight: number;
}

export interface CodeLineWindowPresentation {
  scrollerClassName: string;
  scrollerAriaLabel: string;
  spacerStyle: {
    height: number;
    position: "relative";
  };
  rowClassName: string;
  gutterClassName: string;
  gutterStyle: {
    width: string;
    flex: "0 0 auto";
  };
  codeClassName: string;
}

export interface CodeLineRowStyle {
  position: "absolute";
  top: number;
  height: number;
  lineHeight: string;
  left: 0;
  right: 0;
}

export interface CodeViewerScrollState {
  scrollTop: number;
  setScrollTop: (scrollTop: unknown) => void;
  reset: () => void;
}

function boundedPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function boundedNonNegativeInteger(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

export function boundedScrollTop(scrollTop: unknown): number {
  return typeof scrollTop === "number" && Number.isFinite(scrollTop)
    ? Math.max(0, scrollTop)
    : 0;
}

export const useCodeViewerScrollStore = create<CodeViewerScrollState>((set) => ({
  scrollTop: 0,
  setScrollTop: (scrollTop) => set({ scrollTop: boundedScrollTop(scrollTop) }),
  reset: () => set({ scrollTop: 0 }),
}));

export function useCodeViewerScrollTop(): number {
  return useCodeViewerScrollStore((state) => state.scrollTop);
}

export function codeViewerScrollSnapshot(): CodeViewerScrollState {
  return useCodeViewerScrollStore.getState();
}

export function setCodeViewerScrollTop(scrollTop: unknown): void {
  useCodeViewerScrollStore.getState().setScrollTop(scrollTop);
}

export function resetCodeViewerScroll(): void {
  useCodeViewerScrollStore.getState().reset();
}

export function deriveCodeLineWindow({
  totalLines,
  scrollTop,
  viewportHeight,
  lineHeight = CODE_VIEWER_LINE_HEIGHT,
  overscan = CODE_VIEWER_OVERSCAN,
}: CodeLineWindowInput): CodeLineWindow {
  const safeTotal = boundedNonNegativeInteger(totalLines);
  const safeLineHeight = boundedPositiveInteger(lineHeight, CODE_VIEWER_LINE_HEIGHT);
  const safeViewportHeight = boundedPositiveInteger(viewportHeight, 1);
  const safeScrollTop = boundedScrollTop(scrollTop);
  const safeOverscan = boundedNonNegativeInteger(overscan);
  const first = Math.max(0, Math.floor(safeScrollTop / safeLineHeight) - safeOverscan);
  const visibleCount =
    Math.ceil(safeViewportHeight / safeLineHeight) + safeOverscan * 2;
  return {
    first,
    last: Math.min(safeTotal, first + visibleCount),
    totalHeight: safeTotal * safeLineHeight,
    gutterWidth: `${String(safeTotal).length + 1}ch`,
    lineHeight: safeLineHeight,
  };
}

export function deriveCodeLineWindowPresentation(
  lineWindow: CodeLineWindow,
): CodeLineWindowPresentation {
  return {
    scrollerClassName:
      "min-h-0 flex-1 overflow-auto bg-paper-sunken font-mono text-body",
    scrollerAriaLabel: "file contents",
    spacerStyle: { height: lineWindow.totalHeight, position: "relative" },
    rowClassName: "flex whitespace-pre",
    gutterClassName: "sticky left-0 select-none pr-fg-2 text-right text-ink-faint",
    gutterStyle: { width: lineWindow.gutterWidth, flex: "0 0 auto" },
    codeClassName: "px-fg-1",
  };
}

export function deriveCodeLineRowStyle(
  lineNo: number,
  lineWindow: CodeLineWindow,
): CodeLineRowStyle {
  return {
    position: "absolute",
    top: lineNo * lineWindow.lineHeight,
    height: lineWindow.lineHeight,
    lineHeight: `${lineWindow.lineHeight}px`,
    left: 0,
    right: 0,
  };
}
