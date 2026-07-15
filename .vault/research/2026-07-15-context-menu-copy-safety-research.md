---
tags:
  - '#research'
  - '#context-menu-copy-safety'
date: '2026-07-15'
modified: '2026-07-15'
related:
  - "[[2026-06-15-dashboard-context-menus-adr]]"
  - "[[2026-07-14-frontend-localization-adr]]"
---

# `context-menu-copy-safety` research: `User-level references in general context menus`

The accepted context-menu inventory requires raw graph identifiers in several menus,
while the later localization decision prohibits wire tokens and diagnostic identifiers in
general user-facing output. This research separates legitimate user-domain references from
internal transport identities and defines the narrow reconciliation needed before the next
menu migration.

## Findings

### F1 - The accepted decisions conflict on raw graph identifiers

The context-menu decision requires graph-node Copy ID and island Copy ID actions in its
canonical inventory. Its originating research also proposes copying node identifiers. The
later localization decision prohibits action IDs, wire tokens, schema identifiers, and
diagnostic detail in general UI. Clipboard output is user-facing output, so a generic Copy
label does not make a raw `doc:`, `feature:`, `code:`, or edge identity safe.

Sources: `.vault/adr/2026-06-15-dashboard-context-menus-adr.md:203`,
`.vault/adr/2026-06-15-dashboard-context-menus-adr.md:223`,
`.vault/research/2026-06-15-dashboard-context-menus-research.md:134`, and
`.vault/adr/2026-07-14-frontend-localization-adr.md:107`.

### F2 - User data and internal identity are different contracts

The localization decision already permits titles, paths, branch names, filenames, and
authored content as untranslated user data. Commit hashes and pull-request numbers are also
established domain references when an action labels them honestly. Graph transport syntax
is different: it exists to connect internal models and is not a public reference merely
because it is stable.

Source: `.vault/adr/2026-07-14-frontend-localization-adr.md:91`.

### F3 - Document nodes already have a public reference action

The production document-link action copies the established round-trippable `[[stem]]`
reference. The shared node helper recognizes document identities without inventing public
references for code or feature nodes. A document graph node can therefore compose the
existing copy-link action; other node kinds must omit the raw-reference action unless a
separate domain decision establishes a public reference.

Sources: `frontend/src/stores/view/documentLinkActions.ts:21`,
`frontend/src/app/left/menus/vaultDocMenu.ts:58`, and
`frontend/src/app/menus/sharedActions.ts:110`.

### F4 - A bounded hybrid is the safest option

- Retaining raw IDs preserves debugging convenience but violates the later user-facing
  language boundary. A vague label hides rather than fixes the leak. Rejected.
- Replacing a raw ID with an approved public reference preserves a useful copy operation.
  Chosen where that reference already exists.
- Omitting the action prevents leakage when no public reference exists. Raw identity remains
  available to structured logging or an explicitly production-fenced diagnostic surface.
  Chosen for all other general menus.

### F5 - The immediate and follow-on blast radius is bounded

The immediate graph-node action and its behavior tests must change. The same policy later
governs island, edge, and meta-connection menus, including raw edge JSON. The clipboard
substrate must remain capable of copying legitimate public identifiers such as commit
hashes, pull-request numbers, paths, filenames, branches, titles, and document links.

Sources: `frontend/src/app/stage/menus/graphNodeMenu.ts:112`,
`frontend/src/app/stage/menus/metaEdgeMenu.ts:63`,
`frontend/src/app/islands/menus/islandMenu.ts:37`,
`frontend/src/app/right/menus/edgeMenu.ts:62`,
`frontend/src/app/stage/menus/graphMenus.test.ts:63`, and
`frontend/src/app/menu/timeTravelGate.test.ts:44`.

## Recommendation

General menus may copy an entity reference only when the entity carries, or an approved
domain mapper derives, an established user-level reference. Document graph nodes reuse the
canonical document-link action and copy exactly `[[stem]]`. Graph entities without a public
reference omit the action. Raw identifiers remain in structured diagnostics or an
explicitly production-fenced diagnostic surface. Existing public domain references are
unaffected.

Verification must prove that document copy links remain available in time travel; other
graph nodes expose no raw-reference action; general graph, island, edge, and meta-connection
menus neither render nor copy wire prefixes, tier values, raw edge IDs, or serialized JSON;
and English, French, and Arabic presentation resolves without keys or internal vocabulary.
