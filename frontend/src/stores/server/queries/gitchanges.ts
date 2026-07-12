// Auto-split from queries.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the queries barrel; see ./index.ts.

import {
  EngineError,
  engineClient,
  readTierAvailability,
  type ChangedFile,
  type GitChangeGroup,
  type GitFileDiff,
  type GitOpResponse,
  type OpsResult,
} from "../engine";
import {
  codeNodeIdFromPath,
  docNodeIdFromStem,
  mergeNumstat,
  parseGitNumstat,
  parseGitStatus,
  parseUnifiedDiff,
  stemFromPath,
} from "../liveAdapters";
import { useQuery } from "@tanstack/react-query";
import { engineKeys, normalizeGitDiffArg } from "./internal";
import {
  CHANGED_FILES_LIST_SERVED,
  GIT_DIFF_CAPABILITY_SERVED,
  useGitStatus,
  type GitStatusHookView,
} from "./status";

/** The interpreted outcome of an ops dispatch, for the receipt copy. */
export type OpsOutcome = "ok" | "backend-down" | "failed";

/**
 * Classify an ops dispatch outcome in the stores layer so the chrome receipt
 * never inspects the raw `tiers` block itself (dashboard-layer-ownership /
 * rag-manager ADR: "reads status truth via stores"). A rejected dispatch whose
 * `EngineError` carries a tiers block is the backend reporting itself down (the
 * rag-down 502 surfaces as section-2 tier truth, contract §2 /
 * every-wire-response-carries-the-tiers-block) — distinct from a tiers-less
 * transport fault, which is a plain failure. A resolved-but-not-ok envelope is
 * also a plain failure. The chrome renders the returned kind, not the block.
 */
export function classifyOpsOutcome(
  result: Pick<OpsResult, "ok" | "tiers"> | { error: unknown },
): OpsOutcome {
  if ("error" in result) {
    return result.error instanceof EngineError && result.error.tiers !== undefined
      ? "backend-down"
      : "failed";
  }
  // A brokered rag control verb degrades to a 200 carrying a semantic-unavailable
  // `tiers` block rather than a 502 (rag-control-plane ADR D2: degradation is
  // read from tiers, not an error status). Read that truth here so a rag-down
  // op still surfaces as backend-down, not a flat failure.
  if (readTierAvailability(result.tiers, ["semantic"]).degraded) {
    return "backend-down";
  }
  return result.ok ? "ok" : "failed";
}

export interface OpsReceipt {
  verb: string;
  tone: "ok" | "failed" | "down";
  text: string;
}

function opsReceiptForOutcome(
  verb: string,
  outcome: OpsOutcome,
  failureText = "failed",
): OpsReceipt {
  if (outcome === "ok") return { verb, tone: "ok", text: "ok" };
  if (outcome === "backend-down") {
    return { verb, tone: "down", text: "rag is down — start it first" };
  }
  return { verb, tone: "failed", text: failureText };
}

export function opsReceiptFromResult(
  verb: string,
  result: Pick<OpsResult, "ok" | "tiers">,
): OpsReceipt {
  return opsReceiptForOutcome(verb, classifyOpsOutcome(result));
}

export function opsReceiptFromError(verb: string, error: unknown): OpsReceipt {
  return opsReceiptForOutcome(
    verb,
    classifyOpsOutcome({ error }),
    error instanceof Error ? error.message : "failed",
  );
}

// The `git` working-tree reads degrade off the PRESENCE of the git rollup in the
// status snapshot (git is NOT a canonical tier — see `deriveGitStatusView`). When
// the engine reports no git payload, the changed-files and diff selectors render
// their designed degraded state rather than firing a doomed `/ops/git` query.

/**
 * The interpreted changed-files view the `ChangesOverview` list renders. Parsed
 * from the porcelain `status` + `numstat` reads and grouped by git status. A
 * tiers-bearing `/ops/git` error envelope (or a transport fault) marks `errored`;
 * the surface distinguishes that from the clean (empty) and loading states.
 */
export interface ChangedFilesView {
  /** A changed-files read is in flight with no held entries. */
  loading: boolean;
  /** A genuine `/ops/git` failure (the engine answered with an error or faulted). */
  errored: boolean;
  /** One entry per changed file, status-grouped + numstat-reconciled. */
  files: ChangedFile[];
  /** Non-vault changed files, for source/diff surfaces. */
  codeFiles: ChangedFile[];
  /** Vault document changes, for document-reader surfaces. */
  documents: ChangedFile[];
  /** Summary counts/totals for the Changes tab header. */
  summary: {
    files: number;
    documents: number;
    additions: number;
    deletions: number;
    total: number;
  };
}

export type ChangedDocumentCategory = "adr" | "audit" | "exec" | "plan" | "research";

export interface ChangedSourceFileRow {
  path: string;
  basename: string;
  nodeId: string;
  group: ChangedFile["group"];
  dotColor: string;
  rowClassName: string;
  dotClassName: string;
  basenameClassName: string;
  adds: number | null;
  dels: number | null;
  addsLabel: string | null;
  delsLabel: string | null;
  addsClassName: string;
  delsClassName: string;
  openArrowClassName: string;
}

export interface ChangedDocumentRow {
  path: string;
  title: string;
  nodeId: string;
  category?: ChangedDocumentCategory;
  rowClassName: string;
  fallbackDotClassName: string;
  titleClassName: string;
  openArrowClassName: string;
}

const CHANGED_DOCUMENT_CATEGORY: Record<string, ChangedDocumentCategory> = {
  research: "research",
  adr: "adr",
  plan: "plan",
  exec: "exec",
  audit: "audit",
};

function fileBasename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

/** The repo-relative parent directory of a path, shown dimmed beside the basename
 *  so a row reads unambiguously even when the basename is opaque (a cache file's
 *  hash name) or duplicated across directories (the many `index.ts`/`mod.rs`). */
function fileDirname(path: string): string {
  const segments = path.split(/[/\\]/);
  segments.pop();
  return segments.join("/");
}

function changedDocumentType(path: string): string | null {
  const match = /(?:^|\/)\.vault\/([^/]+)\//.exec(path);
  return match ? (match[1] ?? null) : null;
}

function changedDocumentTitle(path: string): string {
  let stem = stemFromPath(path).replace(/^\d{4}-\d{2}-\d{2}-/, "");
  const parts = stem.split("-");
  const suffix = parts[parts.length - 1];
  if (
    suffix !== undefined &&
    [
      "research",
      "adr",
      "plan",
      "exec",
      "audit",
      "reference",
      "index",
      "rule",
      "summary",
    ].includes(suffix)
  ) {
    parts.pop();
  }
  stem = parts.join(" ").trim();
  if (stem.length === 0) return stemFromPath(path);
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

const CHANGES_OVERVIEW_ROW_CLASS =
  "flex h-[1.875rem] w-full items-center gap-fg-2 rounded-fg-md border border-rule bg-paper px-fg-2 text-left transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";
const CHANGED_FILE_DOT_CLASS = "size-2 shrink-0 rounded-full";
const CHANGED_FILE_BASENAME_CLASS =
  "min-w-0 flex-1 truncate font-mono text-[0.71875rem] text-ink";
const CHANGED_FILE_ADDS_CLASS = "shrink-0 text-meta text-diff-add";
const CHANGED_FILE_DELS_CLASS = "shrink-0 text-meta text-diff-remove";
const CHANGED_DOCUMENT_FALLBACK_DOT_CLASS = "size-2 shrink-0 rounded-full bg-ink-faint";
const CHANGED_DOCUMENT_TITLE_CLASS =
  "min-w-0 flex-1 truncate text-[0.78125rem] text-ink";
const CHANGES_OVERVIEW_OPEN_ARROW_CLASS = "shrink-0 text-body text-ink-faint";

function changedFileRow(file: ChangedFile): ChangedSourceFileRow {
  return {
    path: file.path,
    basename: fileBasename(file.path),
    nodeId: codeNodeIdFromPath(file.path),
    group: file.group,
    dotColor: changedFileDotColor(file.group),
    rowClassName: CHANGES_OVERVIEW_ROW_CLASS,
    dotClassName: CHANGED_FILE_DOT_CLASS,
    basenameClassName: CHANGED_FILE_BASENAME_CLASS,
    adds: file.adds,
    dels: file.dels,
    addsLabel: file.adds === null ? null : `${file.adds} added`,
    delsLabel: file.dels === null ? null : `${file.dels} removed`,
    addsClassName: CHANGED_FILE_ADDS_CLASS,
    delsClassName: CHANGED_FILE_DELS_CLASS,
    openArrowClassName: CHANGES_OVERVIEW_OPEN_ARROW_CLASS,
  };
}

function changedFileDotColor(group: ChangedFile["group"]): string {
  if (group === "added") return "var(--color-diff-add)";
  if (group === "deleted" || group === "renamed") return "var(--color-diff-remove)";
  return "var(--color-state-stale)";
}

function changedDocumentRow(file: ChangedFile): ChangedDocumentRow {
  const docType = changedDocumentType(file.path);
  const category = docType === null ? undefined : CHANGED_DOCUMENT_CATEGORY[docType];
  return {
    path: file.path,
    title: changedDocumentTitle(file.path),
    nodeId: docNodeIdFromStem(stemFromPath(file.path)),
    rowClassName: CHANGES_OVERVIEW_ROW_CLASS,
    fallbackDotClassName: CHANGED_DOCUMENT_FALLBACK_DOT_CLASS,
    titleClassName: CHANGED_DOCUMENT_TITLE_CLASS,
    openArrowClassName: CHANGES_OVERVIEW_OPEN_ARROW_CLASS,
    ...(category ? { category } : {}),
  };
}

// --- status-grouped change tree (binding GitStatusPill 642:1745 / GitFileRow 653:1864) -
//
// The Changes body groups every working-tree entry under three collapsible status
// parents — MODIFIED / DELETED / NEW — exactly as the binding GitStatusPill expanded
// state renders them. A row is the entry's filename + numstat (mono diff tallies):
// MODIFIED shows +A −D, DELETED shows only −D and strikes the name, NEW shows only
// +A. No per-row status dot and no open arrow (the GROUP conveys the status); a click
// still opens the code viewer (source files) or the markdown reader (vault docs).

/** The three status buckets the change tree groups entries into, in render order. */
export type GitChangeBucket = "staged" | "modified" | "deleted" | "new";

const GIT_CHANGE_BUCKET_ORDER: readonly GitChangeBucket[] = [
  // Staged first: it is what the next commit will capture, the most actionable
  // group. The remaining buckets carry the worktree-side (unstaged) changes.
  "staged",
  "modified",
  "deleted",
  "new",
] as const;

// SectionLabel uppercases the eyebrow, so author Title-case and it renders
// STAGED / MODIFIED / DELETED / NEW to match the binding.
const GIT_CHANGE_BUCKET_LABEL: Record<GitChangeBucket, string> = {
  staged: "Staged",
  modified: "Modified",
  deleted: "Deleted",
  new: "New",
};

/** Map a porcelain status group onto its tree bucket. An index-side change
 *  (porcelain X set) buckets as STAGED — what the next commit will capture —
 *  before the worktree-side groups: deleted → DELETED, added/untracked → NEW,
 *  the rest → MODIFIED. */
function gitChangeBucket(group: GitChangeGroup): GitChangeBucket {
  if (group === "staged") return "staged";
  if (group === "deleted") return "deleted";
  if (group === "added" || group === "untracked") return "new";
  return "modified";
}

export interface GitChangeRow {
  path: string;
  /** Source-file basename, or the readable title for a vault document. */
  label: string;
  /** The dimmed parent-directory context shown after the basename (empty at repo
   *  root). Disambiguates opaque/duplicate basenames so a row is always readable. */
  dirLabel: string;
  dirClassName: string;
  nodeId: string;
  /** Open target: the code viewer for files, the markdown reader for vault docs. */
  surface: "code" | "markdown";
  /** numstat tallies; the bucket decides which side(s) render. */
  showAdds: boolean;
  showDels: boolean;
  adds: number;
  dels: number;
  addsLabel: string;
  delsLabel: string;
  /** A binary entry carries no line tally; the row shows a "binary" tag instead
   *  (distinct from an untracked entry, which simply has no tallies). */
  showBinary: boolean;
  binaryLabel: string;
  binaryClassName: string;
  rowClassName: string;
  labelClassName: string;
  diffClassName: string;
  addsClassName: string;
  delsClassName: string;
}

export interface GitChangeGroupView {
  id: GitChangeBucket;
  /** Title-case label; the SectionLabel eyebrow renders it uppercase. */
  label: string;
  ariaLabel: string;
  count: number;
  rows: GitChangeRow[];
}

// Binding GitFileRow (653:1864): a flat row (no card chrome, no dot, no arrow) — the
// name rides the body role in ink, the numstat the mono meta role in the
// sacred diff hues. Deleted strikes the name and dims it to ink-muted.
const GIT_CHANGE_ROW_CLASS =
  "flex w-full items-center gap-fg-2 rounded-fg-xs py-fg-0-5 pr-fg-1 text-left transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";
// The basename sizes to content but yields to the dimmed dir context when the row
// is tight (shrink, not flex-1), so both the name and its location stay legible.
const GIT_CHANGE_LABEL_CLASS = "shrink truncate text-[0.75rem] text-ink";
const GIT_CHANGE_LABEL_DELETED_CLASS =
  "shrink truncate text-[0.75rem] text-ink-muted line-through";
// The dimmed parent-dir context takes the remaining width, truncating first.
const GIT_CHANGE_DIR_CLASS = "min-w-0 flex-1 truncate text-[0.6875rem] text-ink-faint";
const GIT_CHANGE_DIFF_CLASS = "flex shrink-0 items-center gap-fg-1 font-mono text-meta";
const GIT_CHANGE_ADDS_CLASS = "shrink-0 text-diff-add";
const GIT_CHANGE_DELS_CLASS = "shrink-0 text-diff-remove";
const GIT_CHANGE_BINARY_CLASS = "shrink-0 text-meta text-ink-faint";

function gitChangeRow(file: ChangedFile, bucket: GitChangeBucket): GitChangeRow {
  const isDoc = file.vault;
  const adds = file.adds ?? 0;
  const dels = file.dels ?? 0;
  return {
    path: file.path,
    label: isDoc ? changedDocumentTitle(file.path) : fileBasename(file.path),
    dirLabel: fileDirname(file.path),
    dirClassName: GIT_CHANGE_DIR_CLASS,
    nodeId: isDoc
      ? docNodeIdFromStem(stemFromPath(file.path))
      : codeNodeIdFromPath(file.path),
    surface: isDoc ? "markdown" : "code",
    // MODIFIED shows both sides; DELETED only deletions; NEW only additions — and
    // only when the numstat side is present (binary entries carry null).
    showAdds: bucket !== "deleted" && file.adds !== null,
    showDels: bucket !== "new" && file.dels !== null,
    adds,
    dels,
    addsLabel: `${adds} added`,
    delsLabel: `${dels} removed`,
    // Binary only when numstat actually flagged it (`-\t-`); an untracked entry
    // has no numstat row and stays non-binary with no tally.
    showBinary: file.binary === true,
    binaryLabel: "binary",
    binaryClassName: GIT_CHANGE_BINARY_CLASS,
    rowClassName: GIT_CHANGE_ROW_CLASS,
    labelClassName:
      bucket === "deleted" ? GIT_CHANGE_LABEL_DELETED_CLASS : GIT_CHANGE_LABEL_CLASS,
    diffClassName: GIT_CHANGE_DIFF_CLASS,
    addsClassName: GIT_CHANGE_ADDS_CLASS,
    delsClassName: GIT_CHANGE_DELS_CLASS,
  };
}

/** Bucket every changed entry into the MODIFIED / DELETED / NEW tree groups, keeping
 *  only non-empty groups in render order. */
function deriveGitChangeGroups(files: readonly ChangedFile[]): GitChangeGroupView[] {
  const byBucket: Record<GitChangeBucket, GitChangeRow[]> = {
    staged: [],
    modified: [],
    deleted: [],
    new: [],
  };
  for (const file of files) {
    const bucket = gitChangeBucket(file.group);
    byBucket[bucket].push(gitChangeRow(file, bucket));
  }
  return GIT_CHANGE_BUCKET_ORDER.filter((bucket) => byBucket[bucket].length > 0).map(
    (bucket) => ({
      id: bucket,
      label: GIT_CHANGE_BUCKET_LABEL[bucket],
      ariaLabel: `${GIT_CHANGE_BUCKET_LABEL[bucket].toLowerCase()} changes`,
      count: byBucket[bucket].length,
      rows: byBucket[bucket],
    }),
  );
}

export function deriveChangedFilesView(
  files: ChangedFile[] | undefined,
  loading: boolean,
  errored: boolean,
  available = true,
): ChangedFilesView {
  const entries = available ? (files ?? []) : [];
  const codeFiles = entries.filter((file) => !file.vault);
  const documents = entries.filter((file) => file.vault);
  return {
    loading: available && loading,
    errored: available && errored,
    files: entries,
    codeFiles,
    documents,
    summary: {
      files: codeFiles.length,
      documents: documents.length,
      additions: entries.reduce((n, file) => n + (file.adds ?? 0), 0),
      deletions: entries.reduce((n, file) => n + (file.dels ?? 0), 0),
      total: entries.length,
    },
  };
}

const EMPTY_CHANGED_FILES_SUMMARY: ChangedFilesView["summary"] = {
  files: 0,
  documents: 0,
  additions: 0,
  deletions: 0,
  total: 0,
};

export interface ChangesOverviewView {
  noScope: boolean;
  loading: boolean;
  degraded: boolean;
  errored: boolean;
  clean: boolean;
  hasChanges: boolean;
  hasFiles: boolean;
  hasDocuments: boolean;
  files: ChangedSourceFileRow[];
  documents: ChangedDocumentRow[];
  /** The status-grouped change tree (MODIFIED / DELETED / NEW) the body renders. */
  changeGroups: GitChangeGroupView[];
  summary: ChangedFilesView["summary"];
  summaryLabels: {
    files: string;
    documents: string;
    additions: string;
    deletions: string;
  };
  loadingLabel: string;
  degradedLabel: string;
  errorTitle: string;
  retryLabel: string;
  noScopeLabel: string;
  filesSectionLabel: string;
  filesListAriaLabel: string;
  documentsSectionLabel: string;
  documentsListAriaLabel: string;
  cleanLabel: string;
  noScopeClassName: string;
  rootClassName: string;
  summaryClassName: string;
  summaryPrimaryClassName: string;
  summaryDividerClassName: string;
  summaryAdditionsClassName: string;
  summaryDeletionsClassName: string;
  loadingClassName: string;
  degradedClassName: string;
  errorRootClassName: string;
  errorTitleClassName: string;
  retryButtonClassName: string;
  sectionLabelClassName: string;
  listClassName: string;
  cleanClassName: string;
  retry: () => void;
}

function pluralLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function changedSummaryLabels(
  summary: ChangedFilesView["summary"],
): ChangesOverviewView["summaryLabels"] {
  return {
    files: pluralLabel(summary.files, "file"),
    documents: pluralLabel(summary.documents, "document"),
    additions: `+${summary.additions}`,
    deletions: `−${summary.deletions}`,
  };
}

const CHANGES_OVERVIEW_NO_SCOPE_CLASS = "text-label text-ink-faint";
const CHANGES_OVERVIEW_ROOT_CLASS = "space-y-fg-3 text-label";
const CHANGES_OVERVIEW_SUMMARY_CLASS = "flex flex-wrap items-center gap-fg-1-5";
// Binding GitStatusPill `git-head` (642:1721): "N files · M documents" rides the
// label role in ink/muted; the diff tallies read the meta role in the sacred hues.
const CHANGES_OVERVIEW_SUMMARY_PRIMARY_CLASS = "text-label font-medium text-ink-muted";
const CHANGES_OVERVIEW_SUMMARY_DIVIDER_CLASS = "text-ink-faint";
const CHANGES_OVERVIEW_SUMMARY_ADDITIONS_CLASS = "text-meta text-diff-add";
const CHANGES_OVERVIEW_SUMMARY_DELETIONS_CLASS = "text-meta text-diff-remove";
const CHANGES_OVERVIEW_LOADING_CLASS =
  "animate-pulse-live text-label text-ink-faint motion-reduce:animate-none";
const CHANGES_OVERVIEW_DEGRADED_CLASS =
  "rounded-fg-md bg-paper-sunken px-fg-2 py-fg-1 text-label text-ink-muted";
const CHANGES_OVERVIEW_ERROR_ROOT_CLASS = "flex items-center gap-fg-2";
const CHANGES_OVERVIEW_ERROR_TITLE_CLASS = "flex-1 text-label text-state-broken";
const CHANGES_OVERVIEW_RETRY_BUTTON_CLASS =
  "rounded-fg-xs text-caption text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";
const CHANGES_OVERVIEW_SECTION_LABEL_CLASS = "mb-fg-1";
const CHANGES_OVERVIEW_LIST_CLASS = "space-y-fg-1";
const CHANGES_OVERVIEW_CLEAN_CLASS = "text-label text-ink-faint";

export function deriveChangesOverviewView(
  git: GitStatusHookView,
  changed: ChangedFilesView,
  scope: string | null | undefined = undefined,
): ChangesOverviewView {
  const gitAvailable = git.git !== undefined;
  const summary = gitAvailable ? changed.summary : EMPTY_CHANGED_FILES_SUMMARY;
  const hasChanges = gitAvailable && summary.total > 0;
  const files = gitAvailable ? changed.codeFiles.map(changedFileRow) : [];
  const documents = gitAvailable ? changed.documents.map(changedDocumentRow) : [];
  const changeGroups = gitAvailable ? deriveGitChangeGroups(changed.files) : [];
  return {
    noScope: scope === null,
    loading: (git.loading || changed.loading) && !hasChanges,
    degraded: git.degraded && !hasChanges,
    errored: (git.errored || changed.errored) && !hasChanges,
    clean:
      scope !== null && gitAvailable && !git.loading && !changed.loading && !hasChanges,
    hasChanges,
    hasFiles: files.length > 0,
    hasDocuments: documents.length > 0,
    files,
    documents,
    changeGroups,
    summary,
    summaryLabels: changedSummaryLabels(summary),
    loadingLabel: "reading changes…",
    degradedLabel: "repository state unavailable",
    errorTitle: "changes unavailable",
    retryLabel: "retry",
    noScopeLabel: "No worktree selected — pick one in the left rail first.",
    filesSectionLabel: "Changed files — open diff or source",
    filesListAriaLabel: "changed files",
    documentsSectionLabel: "Changed documents — open reader",
    documentsListAriaLabel: "changed documents",
    cleanLabel: "working tree clean — no changes to review.",
    noScopeClassName: CHANGES_OVERVIEW_NO_SCOPE_CLASS,
    rootClassName: CHANGES_OVERVIEW_ROOT_CLASS,
    summaryClassName: CHANGES_OVERVIEW_SUMMARY_CLASS,
    summaryPrimaryClassName: CHANGES_OVERVIEW_SUMMARY_PRIMARY_CLASS,
    summaryDividerClassName: CHANGES_OVERVIEW_SUMMARY_DIVIDER_CLASS,
    summaryAdditionsClassName: CHANGES_OVERVIEW_SUMMARY_ADDITIONS_CLASS,
    summaryDeletionsClassName: CHANGES_OVERVIEW_SUMMARY_DELETIONS_CLASS,
    loadingClassName: CHANGES_OVERVIEW_LOADING_CLASS,
    degradedClassName: CHANGES_OVERVIEW_DEGRADED_CLASS,
    errorRootClassName: CHANGES_OVERVIEW_ERROR_ROOT_CLASS,
    errorTitleClassName: CHANGES_OVERVIEW_ERROR_TITLE_CLASS,
    retryButtonClassName: CHANGES_OVERVIEW_RETRY_BUTTON_CLASS,
    sectionLabelClassName: CHANGES_OVERVIEW_SECTION_LABEL_CLASS,
    listClassName: CHANGES_OVERVIEW_LIST_CLASS,
    cleanClassName: CHANGES_OVERVIEW_CLEAN_CLASS,
    retry: git.retry,
  };
}

/**
 * Stores selector for the worktree's changed-files list: fetches porcelain
 * `status` and `numstat` through the `client.opsGit` seam (the stores layer is the
 * sole wire client — dashboard-layer-ownership), parses git's verbatim text, and
 * reconciles the numstat tallies onto the status entries. Disabled when scope is
 * null OR git is unavailable in the status snapshot (no doomed query when the
 * engine reports no repository state). A `git` SSE chunk refreshing `/status`
 * re-gates this query through the `useGitStatus` dependency.
 */
function useChangedFilesForGit(
  scope: unknown,
  git: Pick<GitStatusHookView, "git">,
): ChangedFilesView {
  const normalizedScope = normalizeGitDiffArg(scope);
  const enabled =
    normalizedScope !== null && CHANGED_FILES_LIST_SERVED && git.git !== undefined;
  const query = useQuery({
    queryKey: engineKeys.gitChanges(normalizedScope ?? ""),
    queryFn: async () => {
      const [status, numstat] = await Promise.all([
        engineClient.opsGit("status", { scope: normalizedScope! }),
        engineClient.opsGit("numstat", { scope: normalizedScope! }),
      ]);
      return mergeNumstat(
        parseGitStatus(status.output),
        parseGitNumstat(numstat.output),
      );
    },
    enabled,
  });
  return deriveChangedFilesView(
    query.data,
    enabled && query.isPending,
    query.isError,
    enabled,
  );
}

export function useChangedFiles(scope: unknown): ChangedFilesView {
  const git = useGitStatus();
  return useChangedFilesForGit(scope, git);
}

export function useChangesOverview(scope: unknown): ChangesOverviewView {
  const git = useGitStatus();
  const normalizedScope = normalizeGitDiffArg(scope);
  const changed = useChangedFilesForGit(normalizedScope, git);
  return deriveChangesOverviewView(git, changed, normalizedScope);
}

/**
 * The interpreted state of a file's read-only diff (git-diff-browser ADR).
 *
 * The read-only diff IS served by the `/ops/git/diff` pass-through: this selector
 * fetches a file's unified diff through the `client.opsGit` seam and parses it into
 * the structured `GitFileDiff` the `DiffView` renders. `loading` is the in-flight
 * state; `errored` a genuine `/ops/git` failure; `diff` the parsed body when served.
 */
export interface GitFileDiffView {
  /** A diff read is in flight with no held body. */
  loading: boolean;
  /** A genuine `/ops/git/diff` failure (the engine answered with an error). */
  errored: boolean;
  /** The structured diff body when served; undefined while loading/errored. */
  diff?: GitFileDiff;
}

export function deriveGitFileDiffView(
  diff: GitFileDiff | undefined,
  loading: boolean,
  errored: boolean,
  available = true,
): GitFileDiffView {
  return {
    loading: available && loading,
    errored: available && errored,
    diff: available ? diff : undefined,
  };
}

function parseGitOpDiff(
  op: GitOpResponse,
  path: string,
  status?: unknown,
): GitFileDiff {
  const diff = parseUnifiedDiff(op.output, path, status);
  if (op.truncated === undefined || diff.truncated !== undefined) return diff;
  return {
    ...diff,
    truncated: {
      total_hunks: diff.hunks.length,
      returned_hunks: diff.hunks.length,
      reason: op.truncated.reason,
    },
  };
}

export interface NormalizedGitDiffRequest {
  scope: string | null;
  path: string | null;
  from: string | null;
  to: string | null;
}

/**
 * Canonicalize git diff selector inputs at the stores boundary before they become
 * query keys or `/ops/git` arguments. Blank presentation state disables the read;
 * non-blank values use one trimmed identity for cache and wire.
 */
export function normalizeGitDiffRequest(
  scope: unknown,
  path: unknown,
  from: unknown = null,
  to: unknown = null,
): NormalizedGitDiffRequest {
  return {
    scope: normalizeGitDiffArg(scope),
    path: normalizeGitDiffArg(path),
    from: normalizeGitDiffArg(from),
    to: normalizeGitDiffArg(to),
  };
}

export function canReadGitFileDiff(
  scope: unknown,
  path: unknown,
  git: Pick<GitStatusHookView, "git">,
): boolean {
  const request = normalizeGitDiffRequest(scope, path);
  return (
    request.scope !== null &&
    request.path !== null &&
    GIT_DIFF_CAPABILITY_SERVED &&
    git.git !== undefined
  );
}

export function canReadGitHistoricalFileDiff(
  scope: unknown,
  path: unknown,
  from: unknown,
  to: unknown,
  git: Pick<GitStatusHookView, "git">,
): boolean {
  const request = normalizeGitDiffRequest(scope, path, from, to);
  return (
    canReadGitFileDiff(request.scope, request.path, git) &&
    request.from !== null &&
    request.to !== null
  );
}

/**
 * Stores selector for a changed file's read-only diff. Fetches the unified diff
 * for the path through `client.opsGit("diff", { scope, path })` and parses it
 * into the hunk-by-hunk `GitFileDiff` shape. Disabled until a file path is
 * selected, a scope is resolved, AND the status snapshot carries git state: a
 * closed diff view or no-repository degraded state fires no doomed query. The
 * optional `status` letter is threaded onto the parsed diff for the in-body
 * status mark.
 */
export function useGitFileDiff(
  scope: unknown,
  path: unknown,
  status?: unknown,
): GitFileDiffView {
  const git = useGitStatus();
  const request = normalizeGitDiffRequest(scope, path);
  const enabled = canReadGitFileDiff(request.scope, request.path, git);
  const query = useQuery({
    queryKey: engineKeys.gitDiff(request.scope ?? "", request.path ?? ""),
    queryFn: async () => {
      const scoped = request.scope!;
      const gitPath = request.path!;
      const op = await engineClient.opsGit("diff", {
        scope: scoped,
        path: gitPath,
      });
      return parseGitOpDiff(op, gitPath, status);
    },
    enabled,
  });
  return deriveGitFileDiffView(
    query.data,
    enabled && query.isPending,
    query.isError,
    enabled,
  );
}

/**
 * Stores selector for a bounded historical text diff. This is the same parsed
 * `GitFileDiff` body that `DiffView` renders for working-tree diffs, but keyed by
 * both revisions so time-travel / history consumers cannot collapse distinct
 * two-rev reads into the live working-tree diff cache entry.
 */
export function useGitHistoricalFileDiff(
  scope: unknown,
  path: unknown,
  from: unknown,
  to: unknown,
  status?: unknown,
): GitFileDiffView {
  const git = useGitStatus();
  const request = normalizeGitDiffRequest(scope, path, from, to);
  const enabled = canReadGitHistoricalFileDiff(
    request.scope,
    request.path,
    request.from,
    request.to,
    git,
  );
  const query = useQuery({
    queryKey: engineKeys.gitHistoricalDiff(
      request.scope ?? "",
      request.path ?? "",
      request.from ?? "",
      request.to ?? "",
    ),
    queryFn: async () => {
      const scoped = request.scope!;
      const gitPath = request.path!;
      const fromRev = request.from!;
      const toRev = request.to!;
      const op = await engineClient.opsGit("histdiff", {
        scope: scoped,
        path: gitPath,
        from: fromRev,
        to: toRev,
      });
      return parseGitOpDiff(op, gitPath, status);
    },
    enabled,
  });
  return deriveGitFileDiffView(
    query.data,
    enabled && query.isPending,
    query.isError,
    enabled,
  );
}
