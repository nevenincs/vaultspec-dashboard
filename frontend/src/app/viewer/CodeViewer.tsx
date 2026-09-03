import type { ReactElement, ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { Copy } from "lucide-react";

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
import { IconButton, Popover, Skeleton, SkeletonBar, StateBlock } from "../kit";
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

/** The header's copy affordance: a copy GLYPH opening a two-item menu that names
 *  each shape ("Copy contents" / "Copy path"). A bare "Copy" button left the reader
 *  guessing which of the two it wrote (owner review). Composes the centralized kit
 *  IconButton + Popover with the app's standing menu semantics (`role="menu"` /
 *  `role="menuitem"`), never a hand-built dropdown; the clipboard write rides the
 *  one `dispatchCopy` seam with its sanctioned `what` shape, and the path item
 *  speaks the same "Copy path" the code file's context menu does. */
function CopyMenu({
  menuLabel,
  contentsLabel,
  pathLabel,
  text,
  path,
}: {
  menuLabel: string;
  contentsLabel: string;
  pathLabel: string;
  text: string;
  path: string | null;
}): ReactElement {
  const [open, setOpen] = useState(false);
  // File CONTENTS carry no `what` token — the sanctioned whitelist names identity
  // shapes (id/title/path/stem/summary), and inventing a sixth here would widen a
  // platform contract for a label. The path copy uses its real `path` shape.
  const copy = (payload: { text: string; what?: "path" }) => {
    setOpen(false);
    void dispatchCopy(payload);
  };
  return (
    <span className="relative">
      <IconButton
        label={menuLabel}
        active={open}
        aria-haspopup="menu"
        aria-expanded={open}
        data-code-viewer-copy
        onClick={() => setOpen((current) => !current)}
      >
        <Copy size={16} aria-hidden />
      </IconButton>
      {open && (
        <Popover
          open
          onDismiss={() => setOpen(false)}
          // The trigger is a SIBLING of the popover root, so the light-dismiss must
          // skip it — otherwise the pointerdown dismiss and the button's own toggle
          // fight and the menu can never be closed by clicking its own glyph.
          ignoreSelector="[data-code-viewer-copy]"
          role="menu"
          aria-label={menuLabel}
          className="absolute right-0 top-full z-40 mt-fg-1 flex w-56 flex-col gap-fg-1 rounded-fg-md border border-rule bg-paper-raised p-fg-1 shadow-fg-popover"
        >
          <button
            type="button"
            role="menuitem"
            data-code-viewer-copy-contents
            onClick={() => copy({ text })}
            className={COPY_MENU_ITEM_CLASS}
          >
            {contentsLabel}
          </button>
          {/* Honest absence: a content view served without a path offers no path to
              copy, so the item is omitted rather than shipped permanently dead. */}
          {path !== null && (
            <button
              type="button"
              role="menuitem"
              data-code-viewer-copy-path
              onClick={() => copy({ text: path, what: "path" })}
              className={COPY_MENU_ITEM_CLASS}
            >
              {pathLabel}
            </button>
          )}
        </Popover>
      )}
    </span>
  );
}

const COPY_MENU_ITEM_CLASS =
  "rounded-fg-sm px-fg-2 py-fg-1 text-left text-label text-ink transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";

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
  const copyMenu = resolveMessage(CODE_VIEWER_MESSAGES.actions.copy);
  const copyContents = resolveMessage(CODE_VIEWER_MESSAGES.actions.copyContents);
  const copyPath = resolveMessage(CODE_VIEWER_MESSAGES.actions.copyPath);
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
  // DEGRADED — the shared caution mark + ONE plain sentence at the uniform glyph
  // size (state-mode-uniformity ADR D3), centred in the viewer body. A bare tinted
  // paragraph read as ordinary prose rather than the "the read did not land" state
  // every other surface in the app renders the same way.
  if (view.state === "degraded") {
    return (
      <div className="flex h-full items-center justify-center p-fg-6">
        <StateBlock mode="degraded" message={stateMessage!.message} />
      </div>
    );
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
    copyMenu.usedFallback ||
    copyContents.usedFallback ||
    copyPath.usedFallback ||
    contents.usedFallback ||
    footer === null ||
    footer.usedFallback
  ) {
    return (
      <ViewerState toneClass="text-state-broken">{genericCode.message}</ViewerState>
    );
  }

  const fileName = view.path ? (view.path.split("/").pop() ?? view.path) : null;

  return (
    <div className="flex h-full flex-col">
      {/* Two-line identity (owner review): the file NAME leads, the repo-relative
          path sits under it in the small caption role. One glance answers both
          "which file" and "where" without the name competing for width. */}
      <header className="flex items-start justify-between gap-fg-2 border-b border-rule bg-paper px-fg-4 py-fg-3">
        <div className="flex min-w-0 flex-col gap-fg-0-5">
          <span className="flex min-w-0 items-center gap-[0.625rem]">
            {/* No type pill here: the footer already states the language, and the
                header repeating it spent the widest line in the component on a fact
                already on screen. `language` still resolves — it is the footer's
                interpolation and this line's fallback when a file has no name. */}
            <span className="min-w-0 truncate font-mono text-label text-ink">
              {fileName ?? language.message}
            </span>
          </span>
          {/* The path is its own accessible name — it is visible text, so it carries
              no `aria-label` (one on a role-less span REPLACES the path for a screen
              reader, losing the very thing the line exists to say). `title` reveals
              it in full when the header is too narrow to show it. */}
          {view.path !== undefined && view.path !== null && (
            <span
              title={view.path}
              data-code-viewer-path
              className="min-w-0 select-text truncate font-mono text-caption text-ink-faint"
            >
              {view.path}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-[0.625rem]">
          <span className="text-label text-ink-muted">{readOnly.message}</span>
          <CopyMenu
            menuLabel={copyMenu.message}
            contentsLabel={copyContents.message}
            pathLabel={copyPath.message}
            text={view.text}
            path={view.path ?? null}
          />
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
      <footer className="flex shrink-0 items-center gap-fg-1-5 border-t border-rule bg-paper px-fg-4 py-fg-2 text-caption text-ink-muted">
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
