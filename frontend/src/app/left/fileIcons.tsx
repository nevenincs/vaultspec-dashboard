// File-type marks for code file-tree rows (code-tree-legibility ADR D1/D2).
//
// The colored per-type mark is the type CHANNEL of the three-channel row
// treatment: it says what a file IS and nothing about its state. Git state rides
// the label tone and badge, and ignore status rides the dimming; both compose
// over this mark and neither changes it.
//
// This is the ONE sanctioned exception to the two-family (Lucide + Phosphor) icon
// law, scoped to code file-tree rows and any future listing that reuses this row
// primitive. The marks come from the single pinned library, `material-icon-theme`,
// as a generated tree-shaken subset (see `fileIcons.generated.ts` and the
// generator that produces it); their baked palette is the imported family's own,
// which is why they are exempt from the token-only color law here and nowhere
// else. Chrome and domain marks stay Lucide/Phosphor, and the 14px ink-coverage
// gate continues to govern authored domain marks — it does not admit these.
//
// Resolution is pure and total: an unmapped path falls back to the library's own
// generic file mark, so a row is never mark-less and the caller never branches.

import {
  FILE_ICON_BY_EXTENSION,
  FILE_ICON_BY_FILENAME,
  FILE_ICON_DEFS,
  GENERIC_FILE_ICON,
  type FileIconDef,
} from "./fileIcons.generated";

/** The final path segment, lowercased. Trailing slashes (a directory path as the
 *  engine may serve it) are stripped first. */
function basename(path: string): string {
  return path.replace(/\/+$/, "").replace(/^.*\//, "").toLowerCase();
}

/**
 * Resolve a repo-relative path to its icon id. Whole filename first
 * (`package.json` beats `.json`), then the final extension, then the generic
 * mark. A dotfile with no further dot (`.gitignore`) is matched by name; when it
 * is not in the name table its trailing segment is tried as an extension, which
 * is how `.env` reaches the env mark.
 */
export function resolveFileIconId(path: string): string {
  const name = basename(path);
  const byName = FILE_ICON_BY_FILENAME[name];
  if (byName !== undefined) return byName;
  const dot = name.lastIndexOf(".");
  if (dot >= 0) {
    const byExtension = FILE_ICON_BY_EXTENSION[name.slice(dot + 1)];
    if (byExtension !== undefined) return byExtension;
  }
  return GENERIC_FILE_ICON;
}

/** Resolve a path straight to its inlined definition. */
export function resolveFileIconDef(path: string): FileIconDef {
  return FILE_ICON_DEFS[resolveFileIconId(path)] ?? FILE_ICON_DEFS[GENERIC_FILE_ICON];
}

export interface FileTypeIconProps {
  /** Repo-relative path of the row this mark belongs to. */
  path: string;
  /** Rendered edge length in px (square), matching the row's other marks. */
  size: number;
  className?: string;
}

/**
 * The colored type mark for one file row, rendered as inline SVG. The geometry
 * and palette are build-time constants from the pinned package (no untrusted
 * input, no runtime fetch), set via `dangerouslySetInnerHTML` because a mark body
 * carries several elements — the same seam the domain-mark chrome components use.
 * Always decorative: the row's accessible name is its label, and the type is
 * already in the file extension, so the mark adds nothing for a screen reader.
 */
export function FileTypeIcon({ path, size, className }: FileTypeIconProps) {
  const def = resolveFileIconDef(path);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={def.viewBox}
      aria-hidden
      focusable="false"
      className={className}
      dangerouslySetInnerHTML={{ __html: def.svgBody }}
    />
  );
}
