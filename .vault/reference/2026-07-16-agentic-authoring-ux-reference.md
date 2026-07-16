---
tags:
  - '#reference'
  - '#agentic-authoring-ux'
date: '2026-07-16'
modified: '2026-07-16'
related:
  - "[[2026-07-16-agentic-authoring-ux-adr]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #reference) and one feature tag.
     Replace agentic-authoring-ux with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `agentic-authoring-ux` reference: `agent surface design spec (panel, composer, transcript)`

The concrete visual/layout blueprint for the W02–W03 agent surface, so the
Figma frames and the coded components share ONE spec. It extends the existing
`[Surface] Authoring` design grammar (Figma `SlhonORmySdoSMTQgDWw3w`, node
`1072:4204`) rather than inventing a new one, and manifests the accepted ADR's
D1–D4/D8 and the Part A standards. Every size below is stated in the design's
own px basis (the code renders `rem` at the 16px basis per the no-hardcoded-px
rule; `28px input` → `1.75rem`, etc.). Named tokens (surface/ink/accent/status,
rule, radius) come from the semantic tier — never raw hex.

## Summary

### The existing grammar this extends (observed in node `1072:4204`)

- **Panels** are ~340px wide, single-purpose (`CommentThreadPanel` 340×357 with
  Populated/Orphaned states).
- **Inputs**: a combobox is a 27px-tall field, 8px left pad, a trailing `⌄`
  chevron; a labelled field stacks a 13px label above the input with ~17px gap.
- **Chips**: `LinkChip` 193×19 removable pills; `feature chip` ~75×18.
- **Eyebrows**: UPPERCASE 11px section labels ("NEW FEATURE").
- **Body** text ~13px; **titles** ~17px.
- **Footers**: right-aligned, a secondary + primary `Button` pair (36px tall).
- **Diff header**: `› Draft changes … ⌘⇧D` — disclosure caret + label + spark +
  accelerator; this is the grammar the transcript's collapsibles reuse.

### The Agent panel (ADR D1) — frame `AgentPanel`

A docked, non-modal, resizable region beside the document/graph surface,
**~400px wide** (a touch wider than CommentThreadPanel — it holds a
conversation, not a list). Top to bottom: a slim **header** (session name +
`New session`/recents menu, one overflow), the **transcript** (scrolls, fills),
and the bottom-docked **composer**. It never overlays the editor. Collapsed, the
panel is gone and its only trace is the footer chip below.

### The footer chip (ADR D1) — frame `AgentChip`

Lives in the `FrameworkStatusCluster` footer grammar (a tone dot + label + at
most one count, `2.75rem` coarse-tap height). Renders NOTHING when no session
exists; while a run streams collapsed it shows a `status/active` dot + "Agent
working" + the served run state. Click toggles the panel (`agent:toggle-panel`).
It is the ONLY idle-state affordance — no left-rail slot (that violates the
rail's no-mutation law).

### The composer (ADR D2) — frame `Composer`, the keystone

Bottom-docked inside the panel. Top to bottom:
- **Attached-context chip row** (above the input, wraps): removable pills for
  `@`-mentioned vault features/documents AND the "N comments" batch (ADR D6) —
  ONE chip grammar (the `LinkChip` 19px pill), a leading kind glyph
  (feature/document/comment) + label + `×`.
- **Multiline input**: min 1 line, grows to ~5 then scrolls; placeholder
  "Message the agent"; 8px pad matching the combobox. `/` at column 0 opens the
  slash popover (fed by the one command registry); `@` opens the corpus picker
  (reusing `AutocompleteCombobox`). Enter submits, Shift+Enter newlines.
- **Chrome row** (below the input, one line): left = two small adjacent
  selectors **Model** and **Team** (combobox pills, `⌄`, ~24px tall — smaller
  than a field, they are chrome); right = the **Send** primary button. While a
  run streams, Send is REPLACED in place by **Stop** (`status/broken` tone) —
  same slot, one control (ADR D4). A steer prompt reuses this same input when a
  run is parked on an interrupt — no separate control.
- **Queued chip** (ADR D4 interim): when the operator submits mid-run, one
  removable "Queued" pill appears in the attached-context row; it dispatches as
  the next turn on settle. Exactly one slot.

### The transcript (ADR D3) — frame `Transcript`

Fixed turn order, each turn a stack:
1. **User prompt** — right-affine or full-width plain block, the submitted text
   plus any attached-context chips rendered inert.
2. **Thinking** — ONE collapsed row in the diff-header grammar: `⟐ Thinking
   (1.2s)` dimmed (`ink-faint`), disclosure caret, cost hint; expands to the
   dimmed streamed block. Hidden entirely if no reasoning streamed.
3. **Tool calls** — each a collapsed single row: a kind glyph + tool name +
   a trailing served **status** token (running spinner / done check / failed
   dot, mapped to `status/*` tones exactly like `EditorStatus`), per-row expand
   to args/result. Never a flat expanded log.
4. **Tool-permission prompt** (inline, blocking) — when a tool needs approval:
   one row "Allow `<tool>` to run?" + **Allow**/**Deny** buttons (the footer
   button pair grammar), wired to the permission-decision route. Not a dialog.
5. **Final text** — the agent's message, plain body.
6. **Proposal card** (ADR D5) — when a run settles into a change: a bordered
   card with the served summary, a change count, a **Show changes** disclosure
   (reuses the `› Draft changes ⌘⇧D` header → the unified `DiffView`,
   `source="proposal-preview"`), and the eligibility-driven **Approve / Reject /
   Apply** button row. Preview-then-approve, inline, where the change appears —
   this is the review happy path (the "Review" dialog is only the cross-session
   queue).

In-progress turns show a live streaming indicator; settled turns collapse
transient "running" chrome to terminal status only. The transcript buffer is
bounded (retains a capped window; truth recoverable from durable lifecycle
events, never the relay).

### Naming (plain-language, per the labels rule)

Panel "Agent"; chip "Agent working"; composer placeholder "Message the agent";
selectors "Model" / "Team"; buttons "Send" / "Stop" / "Allow" / "Deny" /
"Approve" / "Reject" / "Apply" / "Show changes"; thinking "Thinking (Ns)";
autonomy control "Review each change" / "Apply automatically, log for review".
No internal vocabulary (session ids, run kinds, tier tokens) ever renders.

### Build facts from the S07/S08 wire slice (confirmed against the live engine)

The visual components consume `stores/server/agent/` (`index.ts` + `wireTypes.ts`),
which mirrors the authoring store's envelope/tiers/EngineError conventions. Facts
that shape the components:

- **Run state comes from the SESSION SNAPSHOT, not a run GET.** There is no
  run-status route on the authoring plane; `useSession` returns
  `{ runs[], active_run, ... }`. The composer's **Stop** reads `active_run` from
  the snapshot; the transcript reads the `runs[]`/turn structure from it. (The
  ADR's `run-status` is the W05 a2a pass-through only.)
- **Status vocab is already bounded served enums** (no cross-team ask):
  `SessionStatus` = active/cancelled/closed; `RunStatus` =
  active/cancel_requested/cancelled/completed/failed. The UI maps the served
  token to a label + `status/*` tone exactly like `EditorStatus` — never
  client-derives status.
- **`getSession` FAULTS (422) on an unknown/malformed id** (it does not return
  null like proposals do). The panel must render an honest error state on a
  bad/expired session id, never a fabricated empty snapshot.
- **Lifecycle fan-out is live once the panel mounts** — `session.created` /
  `run.started` refresh the session caches with no poll (via the
  `onAuthoringLifecycleEvent` subscriber seam). Components render off the query
  cache; they do not subscribe to SSE directly.
- Command seams the components call (all ambient-token, no sign-in):
  `createSession`, `startTurn`, `cancelRun` (Stop), `resumeRun`,
  `resumeInterrupt` (steer), `decideToolPermission` (Allow/Deny),
  `prepareToolCall`/`executeToolCall` (tool surface).

### Frames to author (W02/W03), all under a new `[Surface] Agent` section

`AgentPanel` (idle-empty, active-streaming, settled states), `AgentChip`
(hidden, working), `Composer` (empty, with-mentions, with-comments-batch,
slash-open, mid-run-Stop, queued), `Transcript` (thinking collapsed/open,
tool-call running/done/failed, permission-prompt, proposal-card), and the
`Autonomy` control (two states). Compose from the standardized atoms
(combobox, chip, button, status dot, disclosure header) — no bespoke primitive.
Zero of these exist today (research Part B §Q); this section is authored net-new
beside `[Surface] Authoring`.

**Figma progress** (file `SlhonORmySdoSMTQgDWw3w`, page `Components`): the
`[Surface] Agent` section (`1220:4503`) is created beside the other surfaces; the
`AgentPanel.idle-empty` frame (`1220:4504`) is built — header/transcript/composer
regions, bound to `surface/base`+`border/subtle`, `Title/15`/`Label/12`/`Meta/11`
text styles. Reusable Kit atoms confirmed present to compose from: `Button`
(`127:26`), `IconButton` (`127:39`), `DropdownButton` (`222:640`), `Chip`
(`136:27`), `StatusDot` (`136:20`), `SearchField` (`136:30`), `Switch`
(`137:28`), `_CreateDocDialog/LinkChip` (`1077:4230`), `_StatusChip`
(`1089:4329`). Remaining frames (composer states, transcript entries, chip,
autonomy, proposal card) are authored alongside their component builds for
design-code parity — the composer's manifestation follows the Fable-designed
interaction model.
