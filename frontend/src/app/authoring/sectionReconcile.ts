// The section three-way reconcile (editor-change-fidelity D12): when an agent
// applies an external change while the user's draft is DIRTY, merge at HEADING-
// SECTION granularity so the user is structurally never silently overwritten.
//
// Three images: the OLD base (what the user opened / last saw), the NEW base (what
// the agent's apply landed), and the DRAFT (the user's unsaved buffer). Each is cut
// into ordered segments at every heading boundary — plus a leading pseudo-section
// (bytes 0 → first heading: frontmatter + preamble) keyed by the empty path. A
// segment key is its ancestor-inclusive heading path (the same key the comment
// anchor uses), so the three images align by key, not by position.
//
// Per key: `userTouched` = the draft segment differs from the old base's;
// `agentTouched` = the new base segment differs from the old base's. Agent-only takes
// the new base's bytes; user-only or untouched keeps the DRAFT's bytes verbatim; BOTH
// is a CONFLICT — never auto-merged. Every ambiguity also denies to conflict, the
// client-side image of the engine's `carry_forward_drafts` AnchorDrift law
// (authoring/rebase/mod.rs): preserve the drafted intent, re-materialize against the
// current base, and DENY drift as a value rather than guess. The ledgered save fence
// (blob_hash) remains the sole apply authority; this is a UX convenience over
// view-local strings whose worst outcome is another honest conflict, never a lost
// byte.

import { headingPathKey, parseHeadingBlocks } from "../viewer/sectionAnchor";

/** One ordered document segment: a heading section, or the leading pseudo-section. */
export interface DocSegment {
  /** The segment key — `headingPathKey(path)`; the empty path keys the pseudo-section. */
  key: string;
  /** The segment's exact bytes. */
  text: string;
}

/**
 * Cut a document body into ordered FLAT segments at every heading boundary. The
 * first segment is the pseudo-section (bytes 0 → first heading), keyed by the empty
 * path; it is emitted only when non-empty. Order is document order.
 *
 * A segment's bytes run from its heading line to the NEXT heading of ANY level —
 * never `HeadingBlock.sectionText`, which spans the heading's whole SUBTREE (the
 * comment-anchor hashing extent). Subtree extents OVERLAP for a parent heading
 * (an H1 title owns every `##` below it), which would make any parent-scope
 * document read every edit pair as a whole-doc conflict AND duplicate the nested
 * sections when the resolved segments are re-joined. Flat cuts tile the document
 * exactly once, so the join is byte-preserving by construction.
 */
export function partitionSegments(body: string): DocSegment[] {
  const blocks = parseHeadingBlocks(body);
  const segments: DocSegment[] = [];
  const firstStart = blocks.length > 0 ? blocks[0].start : body.length;
  const preamble = body.slice(0, firstStart);
  if (preamble.length > 0) {
    segments.push({ key: headingPathKey([]), text: preamble });
  }
  for (const [index, block] of blocks.entries()) {
    const end = index + 1 < blocks.length ? blocks[index + 1].start : body.length;
    segments.push({
      key: headingPathKey(block.path),
      text: body.slice(block.start, end),
    });
  }
  return segments;
}

/** A key → exact-bytes lookup over one document body, for pulling a conflicted
 *  section's text (the user's vs the agent's) into the resolution DiffView. A
 *  duplicate key keeps its FIRST occurrence (the same ambiguity that denied it to
 *  conflict); the resolver already treats such keys as conflicts. */
export function segmentTextByKey(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const segment of partitionSegments(body)) {
    if (!map.has(segment.key)) map.set(segment.key, segment.text);
  }
  return map;
}

/** The outcome of a dirty three-way reconcile. */
export type SectionReconcile =
  | {
      kind: "disjoint";
      /** The merged draft — agent-only sections adopt the new base, user/untouched
       *  sections keep the draft's bytes; safe to swap in. */
      mergedDraft: string;
    }
  | {
      kind: "conflict";
      /** The ordered keys of sections the agent AND the user both changed (and every
       *  denied ambiguity). Resolved per-section by the user. */
      conflictKeys: string[];
      /** Compute the merged text once each conflict key has a decision. A key mapped
       *  to "mine" keeps the draft's bytes, "theirs" takes the new base's; a missing
       *  decision falls back to the draft (never the agent — safe default). */
      mergeWith: (resolutions: Record<string, "mine" | "theirs">) => string;
    };

/**
 * Whether two segment texts are the SAME for touch detection. A section's bytes run
 * to the next heading, so inserting a sibling section after it changes its trailing
 * whitespace WITHOUT changing its content — comparing trailing-trimmed avoids reading
 * that boundary shift as an edit (which would false-conflict every append). An absent
 * segment (add/delete) is never equal to a present one. Assembly still uses the exact
 * bytes; only the touch test trims.
 */
function segEqual(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.trimEnd() === b.trimEnd();
}

/** Build a key → text map, flagging any DUPLICATE key (an ambiguity that denies to
 *  conflict — the same heading path twice cannot be aligned unambiguously). */
function segmentMap(segments: DocSegment[]): {
  map: Map<string, string>;
  duplicates: Set<string>;
} {
  const map = new Map<string, string>();
  const duplicates = new Set<string>();
  for (const segment of segments) {
    if (map.has(segment.key)) duplicates.add(segment.key);
    else map.set(segment.key, segment.text);
  }
  return { map, duplicates };
}

/**
 * The section three-way merge of (oldBase, newBase, draft). Returns a disjoint merge
 * when no section was changed by both sides, or a conflict listing the contested
 * section keys with a resolver.
 *
 * Merged order follows the NEW base (the agent's structure), with any user-added
 * section (present in the draft, absent from both bases) re-inserted after its
 * nearest preceding surviving segment in draft order.
 */
export function reconcileSections(
  oldBase: string,
  newBase: string,
  draft: string,
): SectionReconcile {
  const oldSegs = partitionSegments(oldBase);
  const newSegs = partitionSegments(newBase);
  const draftSegs = partitionSegments(draft);

  const old = segmentMap(oldSegs);
  const fresh = segmentMap(newSegs);
  const mine = segmentMap(draftSegs);

  // Any duplicate key in any image is ambiguous → those keys deny to conflict.
  const ambiguous = new Set<string>([
    ...old.duplicates,
    ...fresh.duplicates,
    ...mine.duplicates,
  ]);

  const allKeys = new Set<string>([
    ...old.map.keys(),
    ...fresh.map.keys(),
    ...mine.map.keys(),
  ]);

  const conflictKeys: string[] = [];
  // Per-key resolution: the chosen bytes for a non-conflict key, or a marker that the
  // key is conflicted. Keyed by segment key.
  const resolved = new Map<string, string>();

  for (const key of allKeys) {
    const oldText = old.map.get(key);
    const newText = fresh.map.get(key);
    const draftText = mine.map.get(key);

    const userTouched = !segEqual(draftText, oldText); // includes user add / delete
    const agentTouched = !segEqual(newText, oldText); // includes agent add / delete

    if (ambiguous.has(key)) {
      conflictKeys.push(key);
      continue;
    }
    if (userTouched && agentTouched) {
      // Both changed the same section — including user-deleted vs agent-modified
      // (either direction), which surfaces here because the two sides disagree.
      conflictKeys.push(key);
      continue;
    }
    if (agentTouched) {
      // Agent-only: take the new base's bytes (undefined = the agent deleted it).
      if (newText !== undefined) resolved.set(key, newText);
      continue;
    }
    // User-only or untouched: keep the draft's bytes verbatim (undefined = the user
    // deleted it).
    if (draftText !== undefined) resolved.set(key, draftText);
  }

  // The ordered key sequence for assembly: the NEW base's order, then any
  // user-added key (in the draft, absent from both bases) appended in draft order
  // after the new-base keys. A key present in neither the new base nor the draft
  // (agent + user both deleted, or agent-only delete) contributes nothing.
  const orderedKeys: string[] = [];
  const emitted = new Set<string>();
  const emit = (key: string) => {
    if (!emitted.has(key)) {
      emitted.add(key);
      orderedKeys.push(key);
    }
  };
  for (const segment of newSegs) emit(segment.key);
  // User-added segments (present in draft, absent from both bases) keep draft order,
  // appended after the new-base structure.
  for (const segment of draftSegs) {
    if (!old.map.has(segment.key) && !fresh.map.has(segment.key)) emit(segment.key);
  }

  if (conflictKeys.length === 0) {
    const mergedDraft = orderedKeys.map((key) => resolved.get(key) ?? "").join("");
    return { kind: "disjoint", mergedDraft };
  }

  const mergeWith = (resolutions: Record<string, "mine" | "theirs">): string =>
    orderedKeys
      .map((key) => {
        if (!conflictKeys.includes(key)) return resolved.get(key) ?? "";
        const choice = resolutions[key];
        // A resolved conflict takes the chosen side; an unresolved one falls back to
        // the draft (the user's bytes) — never silently the agent's.
        if (choice === "theirs") return fresh.map.get(key) ?? "";
        return mine.map.get(key) ?? "";
      })
      .join("");

  return { kind: "conflict", conflictKeys, mergeWith };
}
