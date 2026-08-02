---
tags:
  - '#adr'
  - '#advanced-service-console'
date: '2026-08-01'
modified: '2026-08-02'
body_schema: 'body-v1'
body_hash: 'sha256:7d35199496b5f83ae6adfa4a098cfb8dfe73a440c074b0b5fccca7aed763ea2f'
related:
  - "[[2026-08-01-advanced-service-console-research]]"
---
# `advanced-service-console` adr: `one advanced console, no service chrome in the user ux` | (**status:** `accepted`)

## Problem Statement

Dev and service surfaces leak into the user chrome: framework status chips sit in the right-rail footer, a rag "Search" dashboard and an A2A lifecycle panel open as modal control panels, and the rag service controls read as product features. The owner rules all of it dev-territory and names Settings ▸ Advanced as the one canonical home. The rag console is simultaneously under-designed relative to the rag TUI it should pair with.

## Considerations

- The chips are today's only entry to the rag and a2a panels; removal and rehoming must be one cutover (research: mounting findings; no-deprecation-bridges discipline).
- The settings dialog is schema-driven for VALUES; consoles are not settings — the Advanced section must be a designed, deliberate non-schema extension, not hand-wired settings (research: settings dialog findings).
- Everything the redesigned rag console shows must come from rag's codified HTTP contract and the discovery record — never its Qdrant shape (rag-integration rule); identity facts (version, path, port, host, pid) are all already served (research: rag contract findings).
- The approvals count on the Review chip feeds the agent workflow and is NOT dev status; the agent-panel campaign owns that UX's future (owner's own deferral notes).

## Considered options

1. Settings ▸ Advanced hosts one consolidated service console; all service chrome leaves the user UX in the same change. CHOSEN.
2. Dedicated dev window outside Settings. Rejected — owner named the home explicitly.
3. Remove now, console later. Rejected — orphans controls; bridge-shaped.

## Constraints

- D1 — One home: the settings dialog gains an Advanced section (rendered after the schema-driven groups) hosting the service console. No service/dev surface may mount anywhere else in the product chrome; the desk and labs remain dev-domain.
- D2 — The user chrome sheds service surfaces in the SAME change: `FrameworkStatusCluster` leaves the rail footer; the rag dashboard and A2A lifecycle panels leave `ControlPanels`; their command-palette entries re-point to the Advanced console. No orphaned affordance, no legacy alias.
- D3 — Approvals stay user-facing, minimally: the pending-approvals affordance (count + open-review intent) survives as a small rail element with no dev styling; its final form belongs to the in-flight agent-panel campaign and is explicitly out of this record's scope.
- D4 — The rag console is the TUI's UI pair, named for the SERVICE (never "Search"): one panel with service identity header (name, version, host:port, pid, storage path — all from the codified contract/discovery record), lifecycle controls sized as normal actions (not a row of large buttons), job monitoring with the existing bounded filters, log tail, and storage/projects summary. All reads stay Tier-1 contract routes (+ the existing capability-gated Tier-2 Qdrant reads); no new naming-scheme couplings.
- D5 — A2A lifecycle relocates as a dev console subsection under Advanced, served by the existing `/a2a/lifecycle/*` plane unchanged; if the agent-panel campaign later supersedes it, it retires from ONE place.
- D6 — Engine status (the former Project-health chip's truth) renders as a compact status block inside Advanced from the existing status/tiers reads; degradation surfacing in the user chrome remains whatever the degradation matrix already renders on affected surfaces — this record moves the DASHBOARD of statuses, not the honest per-surface degradation.
- D7 — Access path: Settings opens from existing chrome; the Advanced section is one click inside (plus a palette command "Open service console"). No new keybinding by default (chord vetting applies if one is ever added).

Amendments recorded at execution (2026-08-01), from the closing audit of this record's own plan:

- D4 premise correction - the service's OWN host, port, and pid are NOT on any route the frontend reads. The considerations above say identity facts "are all already served", which traced true only for the tier component handshake (name, floor, running version) and the brokered ops-state blocks. The machine discovery record that carries the tool's port and pid is read by the engine, never forwarded, so a browser client cannot reach it. The delivered header therefore states the STORE's address, process, and version - each labelled as the store's, never as the tool's - and says nothing about a running port or pid. Facts are served or absent; nothing is substituted under a neighbour's label. Serving the tool's own listening identity is a future engine ask, not a gap to paper over here.
- D7 label refinement - the shipped palette command reads "Open advanced settings", not the literal "Open service console" this record names. The destination is unchanged (Settings, Advanced, primary console expanded) and there is still exactly one command with no alias. The label was chosen because the section hosts FOUR consoles, so a singular "service console" would name the destination wrongly, and because "advanced settings" is the plainer user-facing wording the labels law asks for. Recorded here rather than left as silent drift; renaming the command back is a one-line change if the owner prefers the literal.
- D4 naming correction (closing review) - the console does NOT render the served tool name. D4 says "named for the SERVICE", and the first implementation resolved the component handshake's `name` into the console heading; that value is the backend package identifier, which `PROHIBITED_UI_TERMS` bans from screen and the labels law keeps in source only. The record and the labels law were in direct conflict, and the labels law wins: the console names itself from the catalog ("Index") on every path, the unread `name` field is gone from the identity view, and the control vocabulary beneath it was retitled from "search" to index terms in the same pass so the fold name and its verbs agree. D4's real intent - never call this thing "Search" - is met; naming it after the package was the part that could not ship.

- D5 RETIREMENT (owner ruling, 2026-08-01, review note `msau86oc` — raised twice). The A2A lifecycle console D5 relocated under Advanced is DELETED, not moved again. The owner's ruling: install / start / stop / restart / repair / update / rollback / remove / doctor is development metastate that bled into a product surface and serves no user purpose. D5 anticipated exactly this outcome — "if the agent-panel campaign later supersedes it, it retires from ONE place" — and this is that retirement. What the ruling PRESERVES is service/status MONITORING, which stays consolidated under Advanced as D6's system-status block and the project-health block; only the control surface is gone. Retired in one change with no bridge and no alias: the panel, its wire client (`stores/server/a2aLifecycle.ts`, `a2aLifecycleActions.ts` and the `a2a-lifecycle:run` dispatch seam), the three `engineClient` methods and `engineKeys` entries over `/a2a/lifecycle/*`, the `A2a*` lifecycle wire types, the `agent` console id, the whole `common:agentService.*` catalog slice and its message-policy module, the desk specimen, and every test that existed only to cover them. The `agent` id now normalizes to `null` like any other unknown id, pinned by the Advanced guard. The engine's `/a2a/lifecycle/*` routes are untouched — this record only removes the dashboard's consumption of them; nothing else in the frontend read that plane.

- D6 AMENDMENT (owner review note `msaujyn2`, 2026-08-01). The status block D6 describes was built as six peer rows — Application, Project tools, Documents, Links, History, Search — each a bare available/unavailable word. The owner read it as cryptic and unrelatable: "the namings are generalized, and I have no idea how to relate it to the actual vaultspec and a2a backends." Working the wire first showed the defect was CATEGORICAL, not a labelling problem. Three of those rows are not programs at all: documents / links / history are inference tiers of the ONE engine — reads it either can or cannot answer — and "Search" named a capability rather than the program providing it. Only two rows ever pointed at a real process. The console therefore now renders two lists: PROGRAMS (things with a version, an address, a process — something findable in a task manager) and AVAILABLE DATA (what the app's own server can currently answer). A row nobody can point at a process for is no longer drawn as one.
  Every program row states the identity the wire already carried and the dashboard was discarding: `/status` `backends.rag` serves the indexing program's own `port` and `pid` (the tolerant adapter dropped both on the floor); `tiers.agent.component.gateway` carries `endpoint`, `pid` and `ownership` once a gateway is discovered, plus `release_set.version`; `tiers.declared.component` carries the project tools' version and floor. No new read was added.
  GAPS ARE STATED, NOT FILLED — the same discipline the D4 premise-correction settled on. The app's own server reports no version, no listening address and no running time on any route it exposes, and no program reports a start time, so each row names what it does not report rather than borrowing a neighbouring value. The ONE measured value is the status read's round trip, timed in the sole wire client and labelled as a response time, because the engine cannot observe a browser's latency to it. Also decided here: no row asserts a failure before the first snapshot settles; an uninstalled agent program reads "Not installed" rather than "Unavailable" (they mean different things to whoever is troubleshooting); a port and a process id render verbatim because they are identifiers and "8,766" names no port; and an unrecognised ownership token yields no fact rather than putting a raw wire word on screen. The premise is proven online against the real engine, including the absences.
- ENGINE-SIDE ASK arising from that amendment (open, unfiled against the engine at time of writing). The dashboard cannot describe the program it is talking to. Three facts are missing and none is derivable client-side:
  - VERSION of the running engine. On no route. `/health` answers `{ok, service, status}` and `/status` carries no build identity.
  - LISTENING ADDRESS (host and port) of the engine itself. The browser's own origin is NOT a substitute and must never be used as one: in development the SPA is served by a separate dev server that proxies to the engine, so the origin names the proxy, not the engine. Substituting it would print a confident falsehood under a correct label.
  - START TIME (for a running time). `service.json` carries `started_ms`, but that record is read by the engine from disk and never forwarded; a browser has no path to it.
  Shape suggested, not prescribed: extend the existing `/health` payload (or add a `data.self` block on `/status`) with `{version, listen: {host, port}, started_ms}`. Any of the three landing independently is useful — the console renders whichever facts arrive and keeps naming the rest as unreported. Until then the gap lines are the honest rendering, not a defect to patch around.

- D4 NAMING RE-CORRECTION (owner directive, 2026-08-02) — supersedes the "D4 naming correction (closing review)" above. The owner explicitly and repeatedly asked for the console to carry the name **"Search Service"** on screen, with the facts ordered health first, then port — reversing the closing-review outcome that renamed the console "Index" to satisfy the blanket `service` prohibition in the message policy's prohibited-terms list. The label and the rule could not both stand, and the conflict is resolved as a NARROWING of the rule, never a deletion: Settings ▸ Advanced is this record's own dev/troubleshooting home (D1), so "service" is correct operator vocabulary WITHIN the Advanced console catalog namespaces (`operations:searchMaintenance.*`, `common:systemStatus.*`, `common:advanced.*`) while remaining prohibited jargon on every other surface. The exemption is implemented at the policy layer with its scope written into it (a term-id → key-prefix exemption table beside the prohibited list), so the guard stays mechanical and the narrowing is visible where the ban lives. What does NOT change: the `RAG` initialism and the internal package names stay banned outright on every surface INCLUDING Advanced — "Search Service" is the on-screen name; the package identifier is never printed. The prior amendment's surviving intent is honoured, not discarded: the console is still never named "Search" the feature — it is named for the SERVICE, which is what D4 asked for from the start.

## Implementation

Frontend-only rearrangement over existing wire: extend the settings dialog with the Advanced section frame; move (and redesign per D4) the rag console; move the A2A panel; add the engine-status block; remove the cluster and its ControlPanels plumbing; keep a minimal approvals affordance; re-point palette commands; update guards (actionCoverage, ControlPanels guard, filterConsolidation untouched) and the desk specimens for the moved surfaces. No engine changes; the settings schema is not widened by this record.

## Rationale

Every note names the same destination, and the blocking risk of naive removal (orphaned rag/a2a controls) dissolves when removal and rehoming are one change. Keeping approvals out of the purge respects the owner's own agent-campaign deferral while still deleting every dev-status pixel from the user chrome.

## Consequences

- The user chrome finally contains only user surfaces; every operational console lives behind Settings ▸ Advanced.
- The settings dialog carries a designed non-schema section — a deliberate, recorded extension of its schema-driven purity.
- The rag console becomes the service's honest face (identity, lifecycle, jobs, logs, storage) and drops the misleading "Search" name.
- Chip-based at-a-glance health disappears from the rail; anyone relying on it now opens Advanced (one click deeper) — accepted by the owner's ruling.
- The desk's FrameworkStatusCluster / RagJobDashboard / A2aLifecyclePanel specimens follow the surfaces into their new home.
- The agent lifecycle console is subsequently retired outright (D5 retirement above); its desk specimen went with it, and Advanced hosts three consoles rather than four.
- The system-status console separates programs from reads and states each program's served identity; what the engine does not report about ITSELF is named on screen and carried as an open engine-side ask rather than filled from a neighbouring value.
