// The canonical `.vault/` tag vocabulary. A vault document carries exactly two
// frontmatter tags: one fixed DIRECTORY tag (set by the folder it lives in) and one
// FEATURE tag. Both the served header projection (which surfaces the feature tag on
// the document panel) and the editor's Feature control read the same set from here,
// so the directory/feature split is defined exactly once.
//
// Deliberately dependency-free: the editor's pure tag helpers import it without
// pulling the query layer in behind them.

export const VAULT_DIRECTORY_TAGS: ReadonlySet<string> = new Set([
  "adr",
  "audit",
  "exec",
  "index",
  "plan",
  "reference",
  "research",
]);
