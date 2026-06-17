// Changes tab (figma-frontend-rewrite W02.P05; binding ActivityRail Changes state,
// Figma node 244:751). The board's Changes pane is a compact working-tree summary
// over TWO flat lists: a "<N> files · <M> documents +A −D" summary line, then
// "CHANGED FILES — open diff or source" (each row a status dot + mono basename +
// numstat +adds/−dels + an open arrow), then "CHANGED DOCUMENTS — open reader"
// (each row a category dot + readable title + an open arrow). A file row opens its
// source in the code viewer; a document row opens the markdown reader — both
// through the preserved `openInViewer` intent, never a new fetch.
//
// Data is the stores layer's read-only `/ops/git` projection (chrome reads
// selectors, never the engine, never the raw `tiers` block — dashboard-layer-
// ownership): `useChangedFiles` is the status-parsed per-file list (with the
// `vault` flag that splits files vs documents and the numstat tallies);
// `useGitStatus` supplies the loading / degraded / errored truth. The surface
// NEVER writes git (engine-read-and-infer): it observes and opens, never stages,
// commits, or discards.
//
// DIFF LEGIBILITY: the numstat tallies keep the sacred diff hues AND carry +/−
// glyphs + programmatic labels, so the change magnitude reads in grayscale.

import {
  File as FileMark,
  FileDashed,
  FilePlus,
  GitCommit,
  PencilSimple,
  type Icon,
} from "@phosphor-icons/react";

import type { ChangedFile, EngineEvent } from "../../stores/server/engine";
import { useChangedFiles, useGitStatus } from "../../stores/server/queries";
import { selectNode } from "../../stores/view/selection";
import { useViewStore } from "../../stores/view/viewStore";
import { docDisplayTitle, docTypeCategory } from "../left/vaultRowPresentation";
import { useActiveScope } from "../stage/Stage";
import { SectionLabel, StatusDot } from "../kit";

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in ChangesOverview.test.ts; some are also consumed by
// the Status tab) — retained as the stable exported API.
// ---------------------------------------------------------------------------

/** Phosphor domain mark for each event kind (retained export). */
export const KIND_MARK: Record<string, Icon> = {
  commit: GitCommit,
  "doc-created": FilePlus,
  "doc-modified": PencilSimple,
  "step-checked": FileMark,
};

export function eventMark(kind: string): Icon {
  return KIND_MARK[kind] ?? FileDashed;
}

/** Human-readable label for an event row (commit SHA / ref fallback). */
export function eventLabel(ev: EngineEvent): string {
  if (ev.ref) {
    if (/^[0-9a-f]{40}$/i.test(ev.ref)) return ev.ref.slice(0, 8);
    if (/^[0-9a-f]{7,12}$/i.test(ev.ref)) return ev.ref;
    if (ev.kind === "commit") {
      const idPart = ev.id.includes(":") ? ev.id.split(":").pop()! : ev.id;
      return idPart.slice(0, 8);
    }
    return ev.ref.split(/[/\\]/).pop() ?? ev.ref;
  }
  return ev.node_ids[0] ?? ev.kind;
}

/** Compact relative timestamp: minutes -> hours -> days. */
export function relativeTs(ts: string, now: number): string {
  const at = Date.parse(ts);
  if (!Number.isFinite(at)) return "";
  const ageMs = now - at;
  if (ageMs < 60_000) return "just now";
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m`;
  if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)}h`;
  return `${Math.floor(ageMs / 86_400_000)}d`;
}

/** Basename of a file path. */
export function basename(p: string): string {
  return p.split(/[/\\]/).pop() ?? p;
}

/** True when the path is under the vault corpus (`.vault/`). */
export function isVaultPath(p: string): boolean {
  return p.startsWith(".vault/") || p.includes("/.vault/");
}

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

/** The status-dot fill for a changed FILE row (board uses a small colored dot by
 *  change kind): added -> diff-add, deleted/renamed -> diff-remove, else stale. */
function fileDotColor(file: ChangedFile): string {
  if (file.group === "added") return "var(--color-diff-add)";
  if (file.group === "deleted" || file.group === "renamed")
    return "var(--color-diff-remove)";
  return "var(--color-state-stale)";
}

/** The `.vault/<type>/` doc-type of a vault path, or null. */
function vaultDocType(path: string): string | null {
  const m = /(?:^|\/)\.vault\/([^/]+)\//.exec(path);
  return m ? m[1] : null;
}

/** The `doc:<stem>` node id for a vault document path. */
function docNodeId(path: string): string {
  return `doc:${basename(path).replace(/\.md$/i, "")}`;
}

/** The board's open arrow (faint). */
function OpenArrow() {
  return (
    <span className="shrink-0 text-[13px] text-ink-faint" aria-hidden>
      →
    </span>
  );
}

/** A changed-FILE row: status dot + mono basename + numstat + open arrow. Opens
 *  the file's source in the code viewer (board "open diff or source"). */
function ChangedFileRow({ file }: { file: ChangedFile }) {
  const open = () => {
    const id = `code:${file.path}`;
    selectNode(id);
    useViewStore.getState().openInViewer(id, "code");
  };
  return (
    <li>
      <button
        type="button"
        onClick={open}
        title={file.path}
        className="flex h-[30px] w-full items-center gap-fg-2 rounded-fg-md border border-rule bg-paper px-fg-2 text-left transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      >
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: fileDotColor(file) }}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink">
          {basename(file.path)}
        </span>
        {file.adds !== null && (
          <span
            className="shrink-0 text-[11px] text-diff-add"
            aria-label={`${file.adds} added`}
          >
            +{file.adds}
          </span>
        )}
        {file.dels !== null && (
          <span
            className="shrink-0 text-[11px] text-diff-remove"
            aria-label={`${file.dels} removed`}
          >
            −{file.dels}
          </span>
        )}
        <OpenArrow />
      </button>
    </li>
  );
}

/** A changed-DOCUMENT row: category dot + readable title + open arrow. Opens the
 *  markdown reader (board "open reader"). */
function ChangedDocRow({ file }: { file: ChangedFile }) {
  const category = docTypeCategory(vaultDocType(file.path) ?? "");
  const open = () => {
    const id = docNodeId(file.path);
    selectNode(id);
    useViewStore.getState().openInViewer(id, "markdown");
  };
  return (
    <li>
      <button
        type="button"
        onClick={open}
        title={file.path}
        className="flex h-[30px] w-full items-center gap-fg-2 rounded-fg-md border border-rule bg-paper px-fg-2 text-left transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      >
        {category ? (
          <StatusDot category={category} />
        ) : (
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-ink-faint" />
        )}
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
          {docDisplayTitle(file.path)}
        </span>
        <OpenArrow />
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// The Changes tab
// ---------------------------------------------------------------------------

export function ChangesOverview() {
  const scope = useActiveScope();
  const gitView = useGitStatus();
  const changed = useChangedFiles(scope);

  if (!scope) {
    return (
      <p className="text-label text-ink-faint">no scope — pick a worktree first</p>
    );
  }

  const files = changed.files.filter((f) => !f.vault);
  const docs = changed.files.filter((f) => f.vault);
  const totalAdds = changed.files.reduce((n, f) => n + (f.adds ?? 0), 0);
  const totalDels = changed.files.reduce((n, f) => n + (f.dels ?? 0), 0);
  const hasChanges = changed.files.length > 0;

  return (
    <div className="space-y-fg-3 text-label" data-changes-overview>
      {/* Summary line (board 244:751): "<N> files · <M> documents +A −D". */}
      {hasChanges && (
        <p className="flex flex-wrap items-center gap-fg-1-5" data-changes-summary>
          <span className="font-medium text-ink">
            {files.length} file{files.length === 1 ? "" : "s"}
          </span>
          <span className="text-ink-faint">·</span>
          <span className="font-medium text-ink">
            {docs.length} document{docs.length === 1 ? "" : "s"}
          </span>
          <span className="text-[11px] text-diff-add" data-tabular>
            +{totalAdds}
          </span>
          <span className="text-[11px] text-diff-remove" data-tabular>
            −{totalDels}
          </span>
        </p>
      )}

      {/* Loading / degraded / error states (read from the stores git seam). */}
      {(gitView.loading || changed.loading) && !hasChanges && (
        <p
          className="animate-pulse-live text-label text-ink-faint motion-reduce:animate-none"
          data-changes-loading
          role="status"
        >
          reading changes…
        </p>
      )}
      {gitView.degraded && !hasChanges && (
        <p
          className="rounded-fg-md bg-paper-sunken px-fg-2 py-fg-1 text-label text-ink-muted"
          data-git-degraded
        >
          repository state unavailable
        </p>
      )}
      {(gitView.errored || changed.errored) && !hasChanges && (
        <div className="flex items-center gap-fg-2" data-changes-error>
          <p className="flex-1 text-label text-state-broken">changes unavailable</p>
          <button
            type="button"
            onClick={gitView.retry}
            className="rounded-fg-xs text-caption text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            retry
          </button>
        </div>
      )}

      {/* CHANGED FILES — open diff or source. */}
      {files.length > 0 && (
        <section aria-label="changed files" data-working-changes>
          <SectionLabel className="mb-fg-1">
            Changed files — open diff or source
          </SectionLabel>
          <ul className="space-y-fg-1" aria-label="changed files">
            {files.map((file) => (
              <ChangedFileRow key={file.path} file={file} />
            ))}
          </ul>
        </section>
      )}

      {/* CHANGED DOCUMENTS — open reader. */}
      {docs.length > 0 && (
        <section aria-label="changed documents" data-changed-documents>
          <SectionLabel className="mb-fg-1">
            Changed documents — open reader
          </SectionLabel>
          <ul className="space-y-fg-1" aria-label="changed documents">
            {docs.map((file) => (
              <ChangedDocRow key={file.path} file={file} />
            ))}
          </ul>
        </section>
      )}

      {/* Clean working tree — an approachable copy-toned empty state. */}
      {gitView.git && !changed.loading && !hasChanges && (
        <p className="text-label text-ink-faint" data-git-clean>
          working tree clean — no changes to review.
        </p>
      )}
    </div>
  );
}
