// The desk's review-feedback store.
//
// Notes are per component (and optionally per state), persisted through the dev
// server into `dev/visual-review/.feedback/notes.json` — a FILE, so feedback written
// from any reviewing machine is readable by the coding session that acts on it.
// This is desk chrome: it talks to the dev server through the captured `deskFetch`,
// never through the page's inert fetch, and no specimen can reach it.

import { useSyncExternalStore } from "react";

import { deskFetch } from "./hermetic";
import type { ReviewState } from "./state";

export interface FeedbackNote {
  readonly id: string;
  readonly surface: string;
  readonly state: ReviewState | null;
  readonly text: string;
  readonly created: string;
  readonly resolved: boolean;
}

const ENDPOINT = "/visual-review-feedback";

let notes: readonly FeedbackNote[] = [];
const listeners = new Set<() => void>();

function publish(next: readonly FeedbackNote[]): void {
  notes = next;
  for (const listener of listeners) listener();
}

async function send(op: Record<string, unknown>): Promise<void> {
  try {
    const response = await deskFetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(op),
    });
    if (response.ok) publish((await response.json()) as FeedbackNote[]);
  } catch (error) {
    console.debug("[visual-review] feedback save failed", error);
  }
}

export async function loadFeedback(): Promise<void> {
  try {
    const response = await deskFetch(ENDPOINT);
    if (response.ok) publish((await response.json()) as FeedbackNote[]);
  } catch (error) {
    console.debug("[visual-review] feedback load failed", error);
  }
}

/** Raw, referentially-stable note list; derive per-surface views in useMemo. */
export function useFeedbackNotes(): readonly FeedbackNote[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => notes,
  );
}

export function addNote(
  surface: string,
  state: ReviewState | null,
  text: string,
): Promise<void> {
  return send({ action: "add", surface, state, text });
}

export function setNoteResolved(id: string, resolved: boolean): Promise<void> {
  return send({ action: "resolve", id, resolved });
}

export function removeNote(id: string): Promise<void> {
  return send({ action: "remove", id });
}

export function clearResolvedNotes(): Promise<void> {
  return send({ action: "clear-resolved" });
}

/** Every open note as review-ready markdown, grouped by component. */
export function feedbackAsMarkdown(all: readonly FeedbackNote[]): string {
  const open = all.filter((n) => !n.resolved);
  if (open.length === 0) return "No open review notes.";
  const bySurface = new Map<string, FeedbackNote[]>();
  for (const note of open) {
    const bucket = bySurface.get(note.surface);
    if (bucket) bucket.push(note);
    else bySurface.set(note.surface, [note]);
  }
  const lines: string[] = ["# Visual review notes", ""];
  for (const [surface, group] of bySurface) {
    lines.push(`## ${surface}`);
    for (const note of group) {
      lines.push(`- ${note.state ? `[${note.state}] ` : ""}${note.text}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
