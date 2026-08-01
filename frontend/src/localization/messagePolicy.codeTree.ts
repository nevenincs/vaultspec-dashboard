// Message policy for the code file-tree rail (`documents:codeTree.*`).
//
// Split out of the main policy module as its own scoped surface when the
// three-channel row treatment (type icon, git-state tone plus badge, ignored
// dimming) grew the key set: the row's copy now covers a state VOCABULARY
// - one badge letter and one spelled-out name per served git token - rather
// than a handful of loading and error lines.
//
// The badge entries are `label` because the single letter is drawn on the row;
// the matching `status.label.*` entries are `accessibility` because they exist
// to give that letter a spoken name, never to be read on screen.

import type { MessageKey } from "../platform/localization/message";
import type { MessagePolicyEntry } from "./messagePolicy";

export const CODE_TREE_MESSAGE_POLICY = {
  "documents:codeTree.accessibility.browser": { role: "accessibility" },
  "documents:codeTree.accessibility.linkedToMap": { role: "accessibility" },
  "documents:codeTree.errors.childUnavailable": { role: "error-message" },
  "documents:codeTree.errors.unavailable": { role: "error-message" },
  "documents:codeTree.ignored.git": { role: "accessibility" },
  "documents:codeTree.ignored.rag": { role: "accessibility" },
  "documents:codeTree.states.childLoading": { role: "status" },
  "documents:codeTree.states.degraded": { role: "status" },
  "documents:codeTree.states.empty": { role: "status" },
  "documents:codeTree.states.loading": { role: "status" },
  "documents:codeTree.states.statusTruncated": { role: "status" },
  "documents:codeTree.states.truncated": { role: "status" },
  "documents:codeTree.states.truncatedUnknown": { role: "status" },
  "documents:codeTree.status.badge.added": { role: "label" },
  "documents:codeTree.status.badge.conflicted": { role: "label" },
  "documents:codeTree.status.badge.deleted": { role: "label" },
  "documents:codeTree.status.badge.modified": { role: "label" },
  "documents:codeTree.status.badge.renamed": { role: "label" },
  "documents:codeTree.status.badge.untracked": { role: "label" },
  "documents:codeTree.status.label.added": { role: "accessibility" },
  "documents:codeTree.status.label.conflicted": { role: "accessibility" },
  "documents:codeTree.status.label.deleted": { role: "accessibility" },
  "documents:codeTree.status.label.modified": { role: "accessibility" },
  "documents:codeTree.status.label.renamed": { role: "accessibility" },
  "documents:codeTree.status.label.untracked": { role: "accessibility" },
} as const satisfies Partial<Record<MessageKey, MessagePolicyEntry>>;
