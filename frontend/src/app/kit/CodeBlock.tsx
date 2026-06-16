// CodeBlock — the centralized static fenced-code container (figma-frontend-rewrite
// W01.P02.S05; binding kit board 135:2). A token-themed `<pre>/<code>` surface for
// displaying a code snippet at rest: a sunken paper ground, subtle rule, canonical
// radius, the mono type step, and an optional header showing a filename and/or
// language tag. This is deliberately a DISPLAY-ONLY surface — it performs NO syntax
// highlighting (no Shiki / highlighter here); the full code VIEWER (which owns
// highlighting) composes this container. Optional line numbers are rendered as a
// non-selectable gutter. Prop-driven; fetches nothing.

export interface CodeBlockProps {
  /** The raw source to display. */
  code: string;
  /** Optional language tag shown in the header (e.g. "ts"). */
  language?: string;
  /** Optional filename shown in the header. */
  filename?: string;
  /** Render a non-selectable line-number gutter. */
  showLineNumbers?: boolean;
  className?: string;
}

export function CodeBlock({
  code,
  language,
  filename,
  showLineNumbers = false,
  className = "",
}: CodeBlockProps) {
  const lines = code.replace(/\n$/, "").split("\n");
  const hasHeader = filename != null || language != null;
  return (
    <div
      className={`overflow-hidden rounded-fg-md border border-rule bg-paper-sunken ${className}`.trim()}
    >
      {hasHeader && (
        <div className="flex items-center justify-between gap-fg-2 border-b border-rule px-fg-3 py-fg-1 text-meta text-ink-muted">
          {filename != null && <span className="truncate">{filename}</span>}
          {language != null && (
            <span className="shrink-0 uppercase tracking-wider text-ink-faint">
              {language}
            </span>
          )}
        </div>
      )}
      <pre className="overflow-x-auto p-fg-3 text-mono text-ink">
        <code className="block">
          {showLineNumbers
            ? lines.map((line, i) => (
                <span key={i} className="grid grid-cols-[2.5rem_1fr] gap-fg-2">
                  <span
                    aria-hidden
                    className="select-none text-end text-ink-faint tabular-nums"
                  >
                    {i + 1}
                  </span>
                  <span className="whitespace-pre">{line === "" ? " " : line}</span>
                </span>
              ))
            : code}
        </code>
      </pre>
    </div>
  );
}
