---
name: action-verbs-enroll-on-their-eligible-planes-by-shared-id
---

# Action verbs enroll on their eligible planes under one shared id

## Rule

Every UI action verb is one `ActionDescriptor` enrolled on each plane it is ELIGIBLE
for — the keymap registry for a command shortcut, the per-kind context-menu resolver for
a target-relative menu verb, and a command provider for a global no-target palette verb —
under ONE shared action `id` across those planes. A verb is never forced onto a plane it
is not eligible for (an input-requiring verb like rename onto a bare chord; a chrome/region
verb into an entity context menu; a feature-scoped verb like archive/autofix as a standing
palette command), and a non-capability is removed, not shipped as a permanently-disabled
lie. The eligible-plane coverage and the cross-plane id identity are asserted by a guard
test, not a manual sweep.

## Why

The `2026-06-22-action-surface-mapping-adr` (grounded by the
`2026-06-22-action-surface-mapping-audit`) settled how the action surface converges: the
keymap registry, the per-kind resolver registry, and the command-provider registry are
siblings that cross-reference by a shared action-id namespace, so an accelerator and the
`?` legend derive from the keymap by the verb's own id and cannot drift. The audit found
the surface already architecturally converged and re-scoped a 117-step blanket
element-by-surface re-enrollment to a verified coverage delta — because forcing every verb
onto every plane re-authors converged wiring and produces wrong-plane verbs (the
`command-palette-actions` ADR's remove-non-capability / correct-plane discipline). The
load-bearing invariant is the shared id: focus-filter / clear-filter / right-rail
focus-search are each authored from one builder plus one keymap id constant consumed by
both the keymap hook and the palette provider, so the two planes cannot diverge; autofix
and archive are feature-scoped, so they are node/feature entity verbs, not standing palette
commands. The guard test (`actionCoverage.guard.test.ts`) asserts each dual-plane verb is
present on BOTH the keymap and the palette under one id, turning the coverage guarantee
into a build-gated invariant instead of a vigilance task.

## How

- **Good:** a new global command verb adds one `KeybindingDef` (keymap) and is contributed
  by a command provider under the SAME id constant; its palette accelerator derives from
  the keymap automatically.
- **Good:** a target-relative verb (relate, archive, autofix, open-pr) is a shared builder
  composed into the right entity kind's resolver; it is NOT a standing palette command.
- **Good:** a verb the backend cannot perform, or that needs an input no chord can supply,
  is left on its correct surface (or removed) rather than shipped disabled.
- **Bad:** hand-typing a palette command id or a `defaultChord` that differs from the
  verb's keymap id constant — the accelerator/legend silently drift; the coverage guard is
  the backstop.
- **Bad:** enrolling a feature-scoped or input-requiring verb as a standing palette
  command, or a chrome verb as a context-menu entry, "to complete the grid".

## Status

Active. Promoted at the close of the re-scoped `action-surface-mapping` cycle
(audit -> ADR -> re-scoped plan -> execute -> review PASS), in which the verified coverage
delta (focus/clear-filter palette exposure, right-rail focus-search plus provider, the
pull-request resolver, the autofix entity verb) landed under shared ids with a coverage
guard. Sibling of `keyboard-shortcuts-bind-through-the-one-keymap-registry`,
`unified-action-plane`, `palette-commands-come-from-the-one-provider-registry`,
`palette-command-accelerators-derive-from-the-keymap-registry`, and
`one-open-verb-for-every-result-entity`.

## Source

ADR `2026-06-22-action-surface-mapping-adr` (codification candidate), audit
`2026-06-22-action-surface-mapping-audit`, and reference
`2026-06-22-action-surface-mapping-reference` (the coverage grid + per-plane eligibility
rule). Guard: `actionCoverage.guard.test.ts`.
