// Section-anchor derivation for reader comments (authoring-surface ADR D2,
// W02.P05).
//
// A comment anchors to a heading SECTION through the engine's `SectionSelector`
// (`heading_path` + `expected_content_hash`), resolved EXACT-OR-CONFLICT server-
// side. To create a comment that lists as ANCHORED, the reader must build a
// selector whose content hash MATCHES what the backend computes — so this module
// mirrors the engine EXACTLY:
//
//   - `parseHeadingBlocks` mirrors `authoring::sections::parse_heading_sections`:
//     ATX headings (1-6 `#` + space/EOL, column 0), fenced-code skipping (delimiter-
//     matched ``` / ~~~), the ancestor-inclusive heading path, and a section that
//     runs from its heading line through the next same-or-shallower heading (or EOF)
//     — the byte range the backend hashes.
//   - `gitBlobOid` mirrors `ingest_struct::reader::blob_oid`: the git blob object id
//     `sha1("blob " + byteLen + "\0" + bytes)` — the SAME digest the selector fences
//     against (verified against the live engine in `comments.live.test.ts`).
//
// The section text is byte-identical whether taken from the raw document (with
// frontmatter) or the frontmatter-stripped body, because a section starts at its
// heading and all headings follow the frontmatter — so the reader parses the
// frontmatter-stripped body (clean ancestor paths, H1 title present) and the hash
// still matches the backend's read of the raw worktree file.

import type { SectionSelector } from "../../stores/server/authoring";
import { sanitizeHeadingText } from "../../stores/server/markdownSanitize";

/** The bounded number of ATX headings a single parse scans (mirrors the engine's
 *  `MAX_HEADING_SECTIONS`): a document past this cap has its excess headings
 *  ignored — never unbounded work — well beyond any real vault document. */
const MAX_HEADING_SECTIONS = 4096;

/** One resolved heading section of a document body: its ancestor-inclusive RAW
 *  heading path (matching the engine's `heading_path`), level, and the exact
 *  section text the content hash is computed over. */
export interface HeadingBlock {
  /** The RAW ancestor-inclusive heading path (outermost first) — sent verbatim as
   *  the selector's `heading_path`, so the backend tail-match resolves it exactly. */
  path: string[];
  level: number;
  /** The section bytes: the heading line through the next same-or-shallower heading
   *  (or EOF) — exactly what the engine hashes. */
  sectionText: string;
}

/** The git blob object id of `content` — `sha1("blob " + byteLength + "\0" + bytes)`,
 *  mirroring `ingest_struct::reader::blob_oid` so a selector authored here fences
 *  exactly as the backend expects. Async (Web Crypto SHA-1); a comment create is
 *  already an async mutation, so computing the hash on demand costs nothing extra. */
export async function gitBlobOid(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  const header = encoder.encode(`blob ${bytes.length}\0`);
  const framed = new Uint8Array(header.length + bytes.length);
  framed.set(header, 0);
  framed.set(bytes, header.length);
  const digest = await crypto.subtle.digest("SHA-1", framed);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

interface RawLine {
  content: string;
  start: number;
}

/** Split `body` into lines, each carrying its start offset and its content with the
 *  trailing newline removed — the JS analogue of the engine's `split_inclusive`
 *  walk with `trim_end_matches(['\n','\r'])`. */
function splitLines(body: string): RawLine[] {
  const lines: RawLine[] = [];
  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === "\n") {
      lines.push({ content: stripLineEnding(body.slice(start, i + 1)), start });
      start = i + 1;
    }
  }
  if (start < body.length) {
    lines.push({ content: stripLineEnding(body.slice(start)), start });
  }
  return lines;
}

function stripLineEnding(line: string): string {
  return line.replace(/[\r\n]+$/, "");
}

/** The fence delimiter run at the start of `trimmed` — 3+ `` ` `` or `~` — as
 *  `[marker, runLength]`, or null. Mirrors the engine's `fence_marker_run`. */
function fenceMarkerRun(trimmed: string): [string, number] | null {
  const marker = trimmed[0];
  if (marker !== "`" && marker !== "~") return null;
  let run = 0;
  while (run < trimmed.length && trimmed[run] === marker) run += 1;
  return run >= 3 ? [marker, run] : null;
}

/** Parse one line as an ATX heading (1-6 `#` at column 0, then space/tab or EOL),
 *  returning `[level, text]` or null. Mirrors the engine's `parse_atx_heading_line`
 *  — no leading-indent tolerance, so it agrees byte-for-byte with the backend. */
function parseAtxHeadingLine(content: string): [number, string] | null {
  let hashes = 0;
  while (hashes < content.length && content[hashes] === "#") hashes += 1;
  if (hashes === 0 || hashes > 6) return null;
  const rest = content.slice(hashes);
  if (rest.length > 0 && rest[0] !== " " && rest[0] !== "\t") return null;
  const text = rest.trim();
  return text.length > 0 ? [hashes, text] : null;
}

interface RawHeading {
  level: number;
  text: string;
  lineStart: number;
}

/**
 * Parse every ATX heading section of `body`, mirroring the engine's
 * `parse_heading_sections`: fenced-code lines are skipped (delimiter-matched so an
 * unrelated marker inside a fence never closes it early), the ancestor stack builds
 * each heading's full path, and a section runs from its heading line to the next
 * same-or-shallower heading (or the end of the document). Bounded at
 * `MAX_HEADING_SECTIONS`.
 */
export function parseHeadingBlocks(body: string): HeadingBlock[] {
  const raw: RawHeading[] = [];
  let fence: [string, number] | null = null;

  for (const line of splitLines(body)) {
    const trimmed = line.content.trimStart();
    const marker = fenceMarkerRun(trimmed);
    if (marker) {
      if (fence === null) {
        fence = marker;
      } else if (marker[0] === fence[0] && marker[1] >= fence[1]) {
        fence = null;
      }
      continue;
    }
    if (fence !== null || raw.length >= MAX_HEADING_SECTIONS) continue;
    const heading = parseAtxHeadingLine(line.content);
    if (heading) {
      raw.push({ level: heading[0], text: heading[1], lineStart: line.start });
    }
  }

  const stack: { level: number; text: string }[] = [];
  const blocks: HeadingBlock[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const heading = raw[index];
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }
    const path = [...stack.map((entry) => entry.text), heading.text];
    stack.push({ level: heading.level, text: heading.text });

    let contentEnd = body.length;
    for (let next = index + 1; next < raw.length; next += 1) {
      if (raw[next].level <= heading.level) {
        contentEnd = raw[next].lineStart;
        break;
      }
    }
    blocks.push({
      path,
      level: heading.level,
      sectionText: body.slice(heading.lineStart, contentEnd),
    });
  }
  return blocks;
}

/** Build the selector for a live section from its CURRENT bytes: the raw
 *  ancestor-inclusive heading path the backend tail-matches, plus the git blob oid
 *  of the section bytes the backend fences against — so a comment created (or
 *  re-anchored) with this selector lists as ANCHORED immediately. The one selector
 *  builder shared by the compose box and the re-anchor action. */
export async function sectionSelectorForBlock(
  block: HeadingBlock,
): Promise<SectionSelector> {
  return {
    heading_path: block.path,
    expected_content_hash: await gitBlobOid(block.sectionText),
  };
}

/** The reader's map from a rendered heading's `data-comment-path` (the plugin's
 *  ancestor-inclusive path, which OMITS the lifted H1 title) to the raw heading
 *  block (whose full path + section bytes drive the selector). */
export interface CommentAnchorIndex {
  byPluginPath: Map<string, HeadingBlock>;
  /** Plugin-path keys that more than one heading resolves to — the document has two
   *  sections the reader cannot tell apart (the backend would resolve their selector
   *  as an ambiguous anchor). A comment on such a section would silently orphan, so
   *  the reader blocks composing there and says why. */
  ambiguousPaths: Set<string>;
}

/** Deep-equality-safe key for a heading path. */
export function headingPathKey(path: string[]): string {
  return JSON.stringify(path);
}

/**
 * Build the anchor index the reader threads to its heading wrappers. The reader
 * renders the EDITORIAL body (heading-sanitized, with the H1 title lifted into the
 * DocHeader), so the plugin's `data-comment-path` uses sanitized text and omits the
 * lifted title as an ancestor. This index maps that plugin path back to the raw
 * block by (a) sanitizing each raw block's path with the SAME transform the reader
 * applied and (b) stripping the lifted-title segment from the front when present —
 * so the key matches what the plugin stamped while the value keeps the full raw
 * path + section bytes the selector needs.
 *
 * `h1Lifted` states whether the reader lifted the document's H1 into the DocHeader
 * (true whenever `editorial.title` is present). The lifted block is the first
 * level-1 heading in document order; only its own descendants carry it as `path[0]`,
 * so stripping it conditionally leaves any second-H1 subtree's paths intact.
 */
export function buildCommentAnchorIndex(
  body: string,
  h1Lifted: boolean,
): CommentAnchorIndex {
  const blocks = parseHeadingBlocks(body);
  // The lifted H1 block itself is never rendered (it became the DocHeader title):
  // the first level-1 heading in document order.
  const liftedBlock = h1Lifted ? blocks.find((block) => block.level === 1) : undefined;
  const liftedSanitized =
    liftedBlock !== undefined ? sanitizeHeadingText(liftedBlock.path[0]) : null;

  const byPluginPath = new Map<string, HeadingBlock>();
  const ambiguousPaths = new Set<string>();
  for (const block of blocks) {
    if (block === liftedBlock) continue;
    const sanitized = block.path.map(sanitizeHeadingText);
    const key =
      liftedSanitized !== null && sanitized[0] === liftedSanitized
        ? sanitized.slice(1)
        : sanitized;
    if (key.length === 0) continue;
    const keyString = headingPathKey(key);
    // A second heading resolving to the same key is an ambiguous anchor: the reader
    // cannot tell the two sections apart and a comment there would silently orphan.
    if (byPluginPath.has(keyString)) ambiguousPaths.add(keyString);
    byPluginPath.set(keyString, block);
  }
  return { byPluginPath, ambiguousPaths };
}
