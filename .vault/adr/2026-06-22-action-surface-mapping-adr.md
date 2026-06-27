---
tags:
  - '#adr'
  - '#action-surface-mapping'
date: '2026-06-22'
modified: '2026-06-22'
related:
  - "[[2026-06-22-action-surface-mapping-audit]]"
  - "[[2026-06-21-command-palette-actions-adr]]"
  - "[[2026-06-19-keyboard-action-system-adr]]"
  - "[[2026-06-15-dashboard-context-menus-adr]]"
---

# `action-surface-mapping` adr: `converge by coverage delta, not blanket re-enrollment` | (**status:** `accepted`)

## Problem Statement

A bare 117-step `action-surface-mapping` plan proposed to systematically enroll every UI
element's verbs onto the keymap registry (W01), the per-kind resolver registry (W02), and the
command palette (W03), across six surface domains — a full matrix re-enrollment. The
`2026-06-22-action-surface-mapping-audit` (three rag-grounded audits plus source verification)
established that this is the wrong shape of work: the action surface is ALREADY architecturally
converged, and a blanket re-enrollment would re-author existing wiring and force verbs onto
planes they do not belong on. This ADR records the decision the bare plan lacked — what
"convergence" actually requires now — and re-scopes the work from a 117-step matrix to a
verified coverage delta plus a structural guard.

## Considerations

- **The architecture is already cohesive (audit PASS).** One shared `ActionDescriptor` is the
  verb unit for all three planes; the keymap registry, resolver registry, and command-provider
  registry are siblings that cross-reference by a shared action-id namespace; exactly one global
  keydown listener exists (the dispatcher); one resolver per entity kind; one shortcut
  persistence (the engine `keybindings` setting) from which the legend, the dispatcher, and the
  palette accelerators all derive; one TanStack-backed backend-state authority with no
  split-brain. None of that needs re-doing.
- **The gaps are coverage, not structure (audit MED).** A small, verified set of verbs is not
  enrolled where it belongs: `focus-filter` / `clear-filter` are keymap-only (no palette
  exposure); the right-rail commit / pull-request verbs are enrolled on no plane; the editor
  `autofix` / `frontmatter` verbs are unenrolled; and there is no dedicated right-rail command
  provider (its tabs ride the window provider — an asymmetry).
- **Not every verb belongs on every plane.** A command shortcut belongs on the keymap; a
  target-relative menu verb belongs on its per-kind resolver; a global, no-target verb belongs
  on a command provider. Forcing a chrome/region verb into a context menu, or an
  input-requiring verb like `rename` onto a bare chord, is the "non-capability / wrong-plane"
  anti-pattern the `command-palette-actions` ADR already names. The blanket matrix would do
  exactly this.
- **Coverage should be mechanically verifiable, not a manual sweep.** The campaign's value is a
  durable guarantee that every verb is enrolled on its eligible planes under one id — best
  expressed as a guard test (mirroring the corpus-fence guard), not 117 hand-checked rows.

## Constraints

- **Parent surfaces are mature and must not be re-architected.** The three registries, the
  dispatcher, the engine settings schema, and the TanStack stores are shipped and load-bearing;
  this work only ADDS the missing enrollments and a guard. No new registry, no new wire, no
  id-namespace change.
- **One shared id across planes.** Each enrolled verb keeps ONE action id across the keymap
  `KeybindingDef`, the resolver `ActionDescriptor`, and the command provider, so accelerator
  derivation and the legend stay correct (`keyboard-shortcuts-bind-through-the-one-keymap-registry`,
  `palette-command-accelerators-derive-from-the-keymap-registry`).
- **Coordinate with the in-flight `keyboard-navigation` campaign** (~30%): region/focus
  enrollment is its territory and is not duplicated here.
- **Supersedes the bare 117-step plan.** The `action-surface-mapping` plan is re-scoped in
  place to the delta defined here; the executing agent for the blanket version is stopped before
  the re-scope lands.

## Implementation

The work is a coverage delta, not a matrix. First, capture the **6-domain × 3-plane coverage
grid** as a reference artifact (seeded by the audit): for each surface domain (global chrome,
left rail, graph stage, timeline, right rail, document editor), record which verbs are enrolled
on the keymap, the resolver, and the palette today, and which are eligible-but-missing. The grid
is the single source for what remains.

Then enroll ONLY the verified gaps, each as one `ActionDescriptor` under one shared id on the
plane(s) it is eligible for: surface `focus-filter` / `clear-filter` as command-provider
entries (keeping their existing keymap ids so accelerators derive); enroll the right-rail
commit / pull-request verbs on their eligible planes (a right-rail provider and/or a `change`/PR
resolver entry); enroll editor `autofix` / `frontmatter` where they are real capabilities;
and resolve the right-rail provider asymmetry. A verb that is genuinely input-requiring or
target-only is left on its correct plane, not forced onto another, and that decision is recorded
in the grid rather than shipped as a disabled lie.

Finally, land a **coverage-grid guard test** that asserts, for each declared surface verb, that
it is enrolled on its eligible planes and that its id is identical across them — converting the
coverage guarantee from a manual sweep into a build-gated invariant. Per-plane eligibility (which
verb class belongs on which plane) is the rule the grid encodes and the guard enforces.

Exact verb-by-verb enrollment and the grid contents are reference/plan detail, not decided here.

## Rationale

The audit is decisive: re-architecture is unwarranted and a 117-step blanket re-enrollment is
net-negative — it spends effort re-authoring converged wiring and risks the wrong-plane
anti-pattern. Re-scoping to the verified delta plus a guard test delivers the actual goal (every
verb reachable on its eligible planes, ids consistent so accelerators hold) at a fraction of the
cost, and leaves a mechanical guarantee instead of a one-time manual sweep. Grounding the bare
plan in this decision also gives future surfaces the per-plane eligibility rule to inherit rather
than re-deciding per element.

## Consequences

- **Gains.** A focused, groundable plan; the genuine coverage gaps closed; a build-gated coverage
  invariant; the per-plane eligibility rule written down once; no churn on the converged core.
- **Costs / difficulties.** The coverage grid must be accurate or the guard test encodes a wrong
  expectation; some "gaps" (e.g. editor `autofix`/`frontmatter`) need a capability check before
  enrollment (remove-non-capability, not a disabled lie). The right-rail provider asymmetry is a
  small refactor that must not regress the window-provider tab commands.
- **Pitfalls.** Re-introducing the blanket-matrix framing; forcing a verb onto an ineligible
  plane to "complete the grid"; letting a new verb's id diverge across planes and silently
  breaking accelerator derivation — the guard test is the backstop for the last.
- **Pathways opened.** The coverage grid + guard generalize to any future surface: add the verb,
  declare its eligible planes, the guard enforces enrollment and id-consistency.

## Codification candidates

- **Rule slug:** `action-verbs-enroll-on-their-eligible-planes-by-shared-id`.
  **Rule:** Every UI verb is one `ActionDescriptor` enrolled on each plane it is eligible for
  (keymap for command shortcuts, the per-kind resolver for target-relative menu verbs, a command
  provider for global palette verbs) under ONE shared action id; a verb is never forced onto a
  plane it does not belong on, and a coverage-grid guard test asserts both the enrollment and the
  cross-plane id identity. *(Promote only after it holds across the re-scoped cycle, per the
  codify discipline.)*

## Codification candidates
