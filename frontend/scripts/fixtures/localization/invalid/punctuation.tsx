// A user-facing source literal carrying an em dash or a hand-typed ASCII ellipsis
// must be flagged by the punctuation rule (in addition to the untranslated-literal
// rule), so the prohibited punctuation cannot slip into rendered copy.
export function EmDashCopy() {
  return <p>Reload the page — the app recovered.</p>;
}

export function AsciiEllipsisCopy() {
  return <span title="Loading data...">busy</span>;
}
