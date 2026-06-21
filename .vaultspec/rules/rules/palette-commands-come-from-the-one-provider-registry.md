---
name: palette-commands-come-from-the-one-provider-registry
---

# Cmd+K commands come from the one command-provider registry; corpus is never a command

## Rule

Every Cmd+K command is contributed by a pure `CommandProvider`
(`(ctx: CommandContext) => CommandDescriptor[]`) registered once in the single
command-provider registry (`frontend/src/stores/view/commandRegistry.ts`) and consumed
through the generic `resolveCommands` host; no surface hand-assembles the palette command
list, and no provider enrolls transient corpus data — a per-document, per-feature, or
per-lens entry — as a standing command. Corpus navigation lives only in the
document-search plane, never the command plane.

## Why

Before this rule the palette read model concatenated nine hand-rolled `buildX()` arrays in
one mega-hook, so adding a command meant editing that file and threading another hook into
its dependency array, and the standing list was saturated with one `go to <feature>` and
one `archive feature: <feature>` per feature tag plus per-lens entries — transient vault
vocabulary masquerading as app actions (the `2026-06-21-command-palette-providers-adr`
problem statement, superseding the `2026-06-14-dashboard-command-palette-adr` "one entry
per feature tag" + "no re-architecting" stances). The context-menu resolver registry
already proved the fix — a generic host fed by pure per-surface contributions with central
gating — so the palette adopts the same contribution discipline (the `unified-action-plane`
plane that was lagging). Making contribution the only path, and the corpus fence
structural, is what stops the pollution and the N-place edit from recurring.

## How

- **Good:** a surface needs a command → it adds a `CommandProvider` under
  `stores/view/commandProviders/` that self-registers via `registerCommandProvider`, reading
  everything it needs from the injected `CommandContext` (never a store directly), and is
  imported once by `app/menus/registerAllCommands`. The assembly hook just builds the context
  and calls `resolveCommands`.
- **Good:** a navigation-to-a-document need → it is served by the document-search plane, not
  a standing command.
- **Bad:** concatenating a `buildX()` array inside `useCommandPaletteCommandView`, or a
  provider emitting a `nav:<tag>` / `archive:<tag>` / `lens:<name>` / `save-lens:` standing
  command — the corpus-fence guard test (`commandPalette.guard.test.ts`) fails the build.

## Status

Active. Promoted at the close of the `command-palette-architecture` campaign's first full
execution cycle (research → ADR cluster → plan → execute → review PASS). Sibling of
`unified-action-plane`, `dashboard-layer-ownership`, `stable-selectors`,
`bounded-by-default-for-every-accumulator`, and `one-open-verb-for-every-result-entity`.

## Source

ADR `2026-06-21-command-palette-providers-adr` (codification candidate) and research
`2026-06-21-command-palette-architecture-research` (F1–F3). Reference
`2026-06-21-command-palette-architecture-reference`.
