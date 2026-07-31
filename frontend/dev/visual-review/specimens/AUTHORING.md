# Authoring specimens

One entry per discovered surface id (`surfaces.ts`: `${area}-${filename}` lowercased),
in the area's module here, merged in `index.ts`. The desk joins entries against the
discovered inventory and shows any gap.

## The contract (`../registry.tsx`)

A rendered specimen supplies:

- `render(state)` — return the REAL production component (imported from
  `@app/app/...`) for one of `normal | loading | empty | degraded`, from authored
  inputs only.
- `seed?(client, state)` — for containers: pre-fill the CELL's own QueryClient with
  authored data at the real `engineKeys` (from `@app/stores/server/queries`) so the
  container's hooks resolve engine-free. Leave a query unseeded and it pends forever
  against the page's inert fetch — that IS the loading state, so a `loading` seed
  usually seeds nothing.
- `solo?` — set when the surface portals to `document.body` (dialog, palette, lifted
  overlay): the desk then renders one state at a time.
- `host?` — override the default `p-fg-3` cell padding when the surface needs a shaped
  slot (e.g. a fixed-height rail column: `"h-[28rem] relative"`).
- `note?` — one plain sentence on how the specimen mounts (which view half, which
  honest-null behaviours to expect).

A scene-owning composite is `{ excluded: "reason" }` — reserved for surfaces that own
the WebGL singleton, never a shortcut for "hard to author".

## Rules

- **Authored inputs only.** Type every model against the application's own store/wire
  types (`import type` from `@app/stores/...`) so drift is a compile error. Never
  fetch, never fake `fetch` — the page is hermetic (`../hermetic.ts`).
- **Prefer the wire-free view half** where the file exports one (`ReviewStationBody`,
  `A2aLifecyclePanelBody`, `ProvisionPanelBody`, `StatusTabView`, ...) and say so in
  `note`. Otherwise mount the real container and `seed` its queries. Do not add view
  halves to production files unless a one-word `export` on an EXISTING internal
  component is strictly necessary — and report any such edit.
- **Scope.** The desk pins the client-local scope to `REVIEW_SCOPE` (`./support.tsx`)
  at boot; author every scoped key with it.
- **Degraded is tiers truth**: a success-shaped payload whose `tiers` block reports
  the backing tier down (`tiersDown`), never a synthetic thrown error.
- **Honest nulls stay honest.** A component whose empty state is "renders nothing"
  gets a `note` saying so, not a fabricated body.
- **Closed-by-default surfaces** (open flag in a view store): `solo: true`, and render
  a small local wrapper component that fires the surface's own exported store action
  (`openAgentPanel()`, `openCreateDocDialog()`, ...) from a `useEffect` on mount — the
  exact action a user click dispatches.
- **Hooks in specimens** live in a named local wrapper component inside `render`'s
  returned tree, never in `render` itself.
- **Copy and styling**: plain-language strings; token utilities only (`text-meta`,
  `p-fg-3`, `rounded-fg-sm`, arbitrary `[...rem]` for off-scale sizes) — no `px`, no
  raw hex.
- Zustand writes from a specimen affect the whole desk page (module singletons) —
  scope them to what the surface itself would do.
