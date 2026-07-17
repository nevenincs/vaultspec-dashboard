import type { ReactElement, ReactNode } from "react";
import { useMemo, useRef } from "react";

import {
  deriveCodeViewerView,
  type CodeViewerView,
  type ContentView,
} from "../../stores/server/queries";
import { dispatchCopy } from "../../platform/actions/clipboardActions";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import {
  CODE_VIEWER_MESSAGES,
  codeViewerFooterDescriptor,
  codeViewerStateDescriptor,
  documentViewerTruncationDescriptor,
} from "../../stores/server/documentViewerVocabulary";
import {
  deriveCodeLineRowStyle,
  deriveCodeLineWindow,
  deriveCodeLineWindowPresentation,
  setCodeViewerScrollTop,
  useCodeViewerScrollTop,
} from "../../stores/view/codeViewer";
import { useElementHeight } from "../chrome/useElementWidth";
import { Badge, Button, Skeleton, SkeletonBar } from "../kit";
import type { LineChange, LineMarker } from "../authoring/editorChanges";
import { lineMarkers } from "../authoring/editorChanges";
import { HighlightedLineContent, MARKER_TONE } from "./HighlightedCode";
import { languageDisplayDescriptor } from "./languages";
import { stopScrollKeyPropagation } from "./scrollRegion";
import type { TokenLine } from "./useHighlighter";
import { useTokenLines } from "./useHighlighter";

/** The windowed line list: renders only the visible range (plus overscan) of the
 *  line array, absolutely positioned within a full-height spacer, with a sticky
 *  line-number gutter. A byte-capped file's line count is bounded, and only the
 *  viewport's rows mount, so scrolling stays cheap. */
function CodeLines({
  label,
  rawLines,
  tokenLines,
  markersByLine,
}: {
  label: string;
  rawLines: string[];
  tokenLines: TokenLine[] | null;
  /** Per-line change marks from the file's git diff (editor-change-fidelity D5);
   *  undefined when the file is clean or git is unavailable. */
  markersByLine?: Map<number, LineMarker>;
}): ReactElement {
  const scrollTop = useCodeViewerScrollTop();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const viewportHeight = useElementHeight(scrollerRef) ?? 600;

  const total = rawLines.length;
  const lineWindow = deriveCodeLineWindow({
    totalLines: total,
    scrollTop,
    viewportHeight,
  });
  const presentation = deriveCodeLineWindowPresentation(lineWindow);

  return (
    <div
      ref={scrollerRef}
      className={presentation.scrollerClassName}
      onScroll={(e) => setCodeViewerScrollTop(e.currentTarget.scrollTop)}
      role="region"
      aria-label={label}
      tabIndex={0}
      onKeyDown={stopScrollKeyPropagation}
    >
      <div style={presentation.spacerStyle}>
        {rawLines.slice(lineWindow.first, lineWindow.last).map((raw, i) => {
          const lineNo = lineWindow.first + i;
          return (
            <div
              key={lineNo}
              className={`relative ${presentation.rowClassName}`}
              style={deriveCodeLineRowStyle(lineNo, lineWindow)}
            >
              {(() => {
                const marker = markersByLine?.get(lineNo);
                if (!marker) return null;
                const tone = MARKER_TONE[marker.kind];
                return marker.tick ? (
                  <span
                    aria-hidden
                    data-change-marker="removed"
                    className={`pointer-events-none absolute left-0 top-0 h-[0.125rem] w-[0.375rem] rounded-fg-pill ${tone}`}
                  />
                ) : (
                  <span
                    aria-hidden
                    data-change-marker={marker.kind}
                    className={`pointer-events-none absolute bottom-0 left-0 top-0 w-[0.1875rem] rounded-fg-pill ${tone}`}
                  />
                );
              })()}
              <span
                className={presentation.gutterClassName}
                style={presentation.gutterStyle}
                aria-hidden
              >
                {lineNo + 1}
              </span>
              <code className={presentation.codeClassName}>
                <HighlightedLineContent raw={raw} tokens={tokenLines?.[lineNo]} />
              </code>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const CODE_ENCODING = "UTF-8";

export function CodeViewer({
  content,
  changes,
}: {
  content: ContentView;
  /** The file's git dirty-diff as gutter marks (editor-change-fidelity D5); the
   *  DocPanel supplies it for a docked code tab, preview surfaces omit it. */
  changes?: LineChange[];
}): ReactElement {
  const resolveMessage = useLocalizedMessageResolver();
  const view = deriveCodeViewerView(content);
  const { lines: tokenLines } = useTokenLines(view.text, view.languageHint);
  const markersByLine = useMemo(
    () => (changes && changes.length > 0 ? lineMarkers(changes) : undefined),
    [changes],
  );
  const stateDescriptor = codeViewerStateDescriptor(view.state);
  const stateMessage =
    stateDescriptor === null ? null : resolveMessage(stateDescriptor);
  const genericCode = resolveMessage(CODE_VIEWER_MESSAGES.labels.code);
  const readOnly = resolveMessage(CODE_VIEWER_MESSAGES.labels.readOnly);
  const copy = resolveMessage(CODE_VIEWER_MESSAGES.actions.copy);
  const contents = resolveMessage(CODE_VIEWER_MESSAGES.accessibility.contents);
  const language = resolveMessage(languageDisplayDescriptor(view.languageHint, "code"));
  const footerDescriptor = codeViewerFooterDescriptor(
    view.rawLines.length,
    language.message,
    CODE_ENCODING,
  );
  const footer = footerDescriptor === null ? null : resolveMessage(footerDescriptor);
  const truncationDescriptor =
    view.truncated === null
      ? null
      : documentViewerTruncationDescriptor(
          view.truncated.returned_bytes,
          view.truncated.total_bytes,
        );
  const truncation =
    truncationDescriptor === null ? null : resolveMessage(truncationDescriptor);

  if (view.state === "loading") {
    return <CodeViewerSkeleton label={stateMessage!.message} />;
  }
  if (view.state !== "ready") {
    return (
      <ViewerState toneClass={codeViewerToneClass(view.stateTone)}>
        {stateMessage!.message}
      </ViewerState>
    );
  }
  if (
    genericCode.usedFallback ||
    language.usedFallback ||
    readOnly.usedFallback ||
    copy.usedFallback ||
    contents.usedFallback ||
    footer === null ||
    footer.usedFallback
  ) {
    return (
      <ViewerState toneClass="text-state-broken">{genericCode.message}</ViewerState>
    );
  }

  const fileName = view.path ? (view.path.split("/").pop() ?? view.path) : null;
  const onCopy = () => {
    void dispatchCopy({ text: view.text });
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-fg-2 border-b border-rule bg-paper px-fg-4 py-fg-2">
        <div className="flex min-w-0 items-center gap-[0.625rem]">
          <span className="min-w-0 truncate font-mono text-label text-ink">
            {fileName ?? language.message}
          </span>
          {view.languageHint && <Badge>{language.message}</Badge>}
        </div>
        <div className="flex shrink-0 items-center gap-[0.625rem]">
          <span className="text-label text-ink-muted">{readOnly.message}</span>
          <Button variant="ghost" onClick={onCopy}>
            {copy.message}
          </Button>
        </div>
      </header>
      {truncation !== null && !truncation.usedFallback && (
        <div className="border-b border-rule bg-paper-sunken px-fg-3 py-fg-1 text-label text-ink-muted">
          {truncation.message}
        </div>
      )}
      <CodeLines
        label={contents.message}
        rawLines={view.rawLines}
        tokenLines={tokenLines}
        markersByLine={markersByLine}
      />
      <footer className="flex shrink-0 items-center gap-fg-1-5 border-t border-rule bg-paper px-fg-4 py-fg-1-5 text-caption text-ink-muted">
        {footer.message}
      </footer>
    </div>
  );
}

/** The loading skeleton's per-line widths — varied like real code lines, as
 *  utility fractions so no hardcoded px enter the DOM (no-hardcoded-px). */
const CODE_SKELETON_WIDTHS = [
  "w-2/5",
  "w-3/4",
  "w-1/2",
  "w-5/6",
  "w-1/3",
  "w-2/3",
  "w-4/5",
  "w-1/2",
  "w-3/5",
];

function CodeViewerSkeleton({ label }: { label: string }): ReactElement {
  return (
    <Skeleton label={label} className="h-full justify-start p-fg-6">
      {CODE_SKELETON_WIDTHS.map((width, index) => (
        <SkeletonBar key={index} width={width} height="h-3" />
      ))}
    </Skeleton>
  );
}

function codeViewerToneClass(tone: CodeViewerView["stateTone"]): string {
  if (tone === "broken") return "text-state-broken";
  if (tone === "muted") return "text-ink-muted";
  return "text-ink-faint";
}

/** A centred placeholder for the viewer's loading / empty / degraded / error
 *  states. Reads the Reader/Meta role; the tone selects the ink token. */
function ViewerState({
  children,
  toneClass,
}: {
  children: ReactNode;
  toneClass: string;
}): ReactElement {
  return (
    <div
      className={`reader-meta flex h-full items-center justify-center p-fg-6 text-center ${toneClass}`}
    >
      <p>{children}</p>
    </div>
  );
}
