---
tags:
  - '#audit'
  - '#dashboard-foundation'
date: '2026-06-12'
related:
  - "[[2026-06-12-dashboard-foundation-adr]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---



# `dashboard-foundation` audit: `foundation rollout`

Migrated from the kickoff working set (`tmp/kickoff/`) on 2026-06-12; this
is the stamped record.

Status: COMPLETE — foundation-executor, team vaultspec-kickoff-specs,
2026-06-12. Sources executed against: project definition, engine spec
(draft 1), GUI spec (draft 1), contract (draft 2, AGREED), decisions
register (FINAL).

______________________________________________________________________

## 1. What was laid down

### 1.1 Rust cargo workspace — `engine/` (engine-spec §9, D9.1)

One workspace, ten crates, dependency arrow always pointing at
`engine-model`. All crates compile; 12 unit tests pass; `cargo fmt --check`
and `cargo clippy --workspace --all-targets -- -D warnings` are clean.

| Crate | Role | External deps |
| --- | --- | --- |
| `engine-model` | Pure types: Node, Edge, Tier, Provenance, ScopeRef, Facet — zero I/O, the dependency sink | serde 1.0.228 |
| `engine-store` | SQLite derived-artifact cache at `.vault/data/engine-data/` (D8.1) | rusqlite 0.40.1 (bundled) |
| `ingest-core` | core CLI `--json` adapter; pins `vaultspec.vault.graph.v2`, loud failure on unknown schema (D5.1) | — |
| `ingest-git` | gix-based workspace/worktree/ref discovery + the four named temporal rules (D2.5, D3.4) | gix 0.84.0 |
| `ingest-struct` | body extraction: paths, `W##.P##.S##` step ids (working recognizer + tests), wiki-links, symbols | — |
| `rag-client` | semantic tier over loopback HTTP; 0.7 confidence cap enforced in code (D3.5) | — |
| `engine-graph` | in-memory graph; `degree_by_tier` implemented as a query-time projection (contract §4) | — |
| `engine-query` | the one shared query core behind both front doors (D6.1); status rollup | — |
| `vaultspec-api` | axum serve skeleton: `/health` + `/status` live (with truthful per-tier degradation block per contract §2); full contract route inventory recorded as a tested constant | axum 0.8.9, tokio 1.52, serde_json |
| `vaultspec-cli` | the `vaultspec` bin: clap skeletons for map / index / graph / node / events / serve / status, global `--json` + `--scope` | clap 4.6.1, tokio, serde_json |

Behavior verified live:

- `vaultspec status --json` → success envelope in core's vocabulary with a
  truthful scaffold degradation entry.
- Unimplemented verbs (`map` etc.) exit **3** with an
  `{"ok": false, "error": "unimplemented"}` envelope — honest scaffolds, not
  fake successes.
- `vaultspec serve --port 8791` binds loopback-only; `GET /health` (ungated)
  and `GET /status` (with the contract-§2 `tiers` block, all four tiers
  truthfully `available: false`) verified over real HTTP.
- Read-and-infer discipline: no vault-write code path exists anywhere in the
  workspace; `engine-store` only computes its cache location.

### 1.2 Frontend scaffold — `frontend/` (gui-spec §5.2)

React 19 + TypeScript + Vite SPA. `tsc -b`, eslint, prettier, and vitest
(8 tests, 3 files) all green; production build emits `dist/` (97 kB gzip).

Three-store separation stubbed exactly as specified, with the boundary
stated in code comments:

- **Server state** — TanStack Query v5 (`src/stores/server/`):
  `queryClient` + a working `useEngineStatus()` hook hitting the engine's
  `/status` (Vite dev proxy `/api` → `127.0.0.1:8767`; same-origin in
  production per contract §1).
- **View state** — Zustand (`src/stores/view/viewStore.ts`): shared
  selection ("selection is one concept", G2.b), explicit working set, tier
  dial filter shape (per-tier toggles + 0..1 confidence floats per contract
  R3), timeline mode (LIVE / time-travel), rail collapse.
- **Scene state** — `src/scene/sceneController.ts`, **outside React** and
  framework-free by construction: command/event interface
  (set-data/focus/filter/set-time in; hover/select/open out). This interface
  is the renderer-swap seam G6.b requires (PixiJS ↔ sigma.js).

Shell: the four-region layout (left scope rail, center stage, right activity
rail, bottom timeline strip) as collapsible placeholders; the activity rail
renders live engine status including the degraded "engine unreachable"
state. TanStack Router with a code-based route tree. Tailwind v4 via
`@tailwindcss/vite` (CSS-first; token layer placeholder in `styles.css`).

### 1.3 Renderer spike — `frontend/spike.html` + `frontend/spike/` (gui-spec §6.1)

Harness: deterministic synthetic scale-free corpus (seeded PRNG,
preferential attachment; unit-tested) → graphology + **FA2 web-worker
layout** (`graphology-layout-forceatlas2/worker`, `inferSettings`,
Barnes-Hut) → **PixiJS v8** WebGL field (batched sprites from one shared
circle texture, tinted per kind; edges in one `Graphics`, one stroke per
tier) → **DOM overlay islands** (top-degree nodes carry HTML islands
repositioned per frame through the world transform). Frame times sampled
off the Pixi ticker; results in `window.__SPIKE_RESULTS__` + on-page HUD.
Parameterized: `?nodes=&edges=&islands=&measure=`.

Results in §2. Excluded from the production bundle (build input pins
`index.html` only).

### 1.4 Toolchain integration

- **justfile**: `just dev lint rust|frontend`, `fix rust|frontend`,
  `test rust|frontend`, `build rust|frontend`, all folded into the existing
  `all` aggregates (so `just ci` now covers all three stacks). Python
  targets untouched.
- **pre-commit**: four new local hooks — `cargo-fmt-check`, `cargo-clippy`
  (`-D warnings`), `frontend-eslint`, `frontend-typecheck` — scoped by file
  type so Python-only commits don't pay the Rust/Node cost. Existing hooks
  untouched.
- **.gitignore**: `engine/target/`, `frontend/node_modules/`,
  `frontend/dist/`.
- Python tooling (ruff, ty, pytest, taplo, markdown linters) untouched;
  pyproject.toml untouched — vaultspec-rag/torch remain dev-group-only and
  nothing new entered runtime dependencies.

______________________________________________________________________

## 2. Spike results (G6.b gate)

Hardware: **NVIDIA GeForce RTX 4080 SUPER** (ANGLE D3D11), Chromium via
Playwright, 2026-06-12. **This is a discrete GPU — the spec's gate is
"on integrated GPUs", which this machine cannot provide.** Numbers below
are therefore an upper bound; the integrated-GPU pass remains open (§4).

| Corpus | Phase | avg fps | avg ms | p95 ms |
| --- | --- | --- | --- | --- |
| 1k / 5k | layout running (FA2 worker, full per-frame re-sync + edge re-tessellation) | 59.5 | 16.8 | 18.6 |
| 1k / 5k | settled, still rebuilding per frame | 60.1 | 16.6 | 18.7 |
| 10k / 50k | layout running (full per-frame rebuild) | 8.7 | 114.7 | 181.1 |
| 10k / 50k | settled, still rebuilding per frame | 7.5 | 134.0 | 260.6 |
| 10k / 50k | **static field (geometry uploaded once, render only)** | **60.4** | **16.6** | **17.7** |

(1k/5k with naive per-edge strokes — before batching strokes per tier — was
51–54 fps; batching restored vsync lock. Kept as a data point on how
sensitive Pixi `Graphics` is to stroke batching.)

Reading:

- **GPU rendering clears the bar with huge margin.** Drawing 10k sprites +
  50k line segments costs nothing once uploaded — static 10k/50k is
  vsync-locked at 60 fps. Pixi's batching does exactly what the survey
  promised.
- **The cost is CPU-side per-frame re-tessellation** of one 50k-segment
  `Graphics` while every position changes every frame (continuous FA2).
  That is the pathological case: the GUI's own interaction model (DOI-bounded
  working set, §3.2; meta-edge aggregation at constellation level, §3.3)
  never puts 50k live-animated doc-level edges on stage. Mitigations, all
  standard and additive: edge rendering as a custom mesh/shader with a
  position buffer update instead of re-tessellation; dirty-subrange updates;
  layout tick throttling with interpolation (d3-interpolate is already in
  the stack for exactly this).
- **DOM islands cost nothing measurable** at 5 islands (their per-frame
  transform update is microseconds); the hybrid pattern works as advertised.
- FA2-in-worker behaved as specified: layout off the main thread, smooth
  incremental settle at 1k; at 10k the worker itself was not the bottleneck
  (static phase proves render path is free).

**Verdict: PixiJS v8 substrate CONFIRMED for the field, conditional on the
two open items in §4.** The 1k/5k smooth gate passes outright. The 10k/50k
"usable" gate passes for render/draw (60 fps static) and fails only in the
deliberately-naive full-rebuild mode, with a clear, conventional engineering
path (mesh-based edges) — not an architectural flaw. No evidence emerged
that would trigger the sigma.js v3 fallback: sigma would face the same
geometry-update economics with less node-anatomy freedom. Fallback stays
named and architecture-compatible behind the scene interface.

______________________________________________________________________

## 3. Version verifications (delegated to a Sonnet subagent, live registries, 2026-06-12)

| Spec named | Verified current | Action taken |
| --- | --- | --- |
| React 19.x | 19.2.7 | as specified |
| Vite 6 | **8.0.16 (Vite 6 is two majors behind; `previous` dist-tag)** | **DEVIATION: scaffolded on Vite 8** (see §5) |
| TypeScript (unpinned) | 6.0.3 | TS 6 adopted |
| TanStack Router | 1.170.x | as specified |
| TanStack Query v5 | 5.101.0 | as specified |
| Zustand | 5.0.14 | as specified |
| Tailwind v4 | 4.3.0 (+ @tailwindcss/vite) | as specified |
| Base UI | **1.0.0-rc.0 — still RC, no stable GA** | not installed (no primitives needed yet); flag against G5.c at implementation |
| pixi.js v8 | 8.19.0 | as specified |
| @pixi/react v8 | 8.0.5 (React ≥19 only) | installed, unused yet (islands are plain DOM in the spike) |
| graphology / FA2 | 0.26.0 / 0.10.1 (worker is a path export, not a separate package) | as specified |
| sigma v3 (fallback) | 3.0.3 | installed as named fallback |
| d3-interpolate / d3-ease | 3.0.1 / 3.0.1 | as specified |
| vitest | 4.1.8 (v4, aligns with Vite 8) | adopted |
| eslint / typescript-eslint | 10.4.1 / 8.61.0 (@eslint/js is 10.0.1, versioned separately) | adopted |
| gix | 0.84.0 | as specified (pure Rust, D2.5) |
| tokio / axum / rusqlite / clap / serde | 1.52 / 0.8.9 / 0.40.1 / 4.6.1 / 1.0.228 | as specified |
| notify | **9.0.0-rc.4 is RC; stable is 8.x** | not yet needed (no watcher in scaffold); pin 8.x when the watcher lands |
| Node floor (Vite 8) | ^20.19.0 \|\| >=22.12.0 | recorded in package.json `engines`; machine runs Node 24 |
| Rust | **rustc 1.93 → 1.96.0** | toolchain updated: libsqlite3-sys 0.38 (under rusqlite 0.40) needs `cfg_select`, unstable in 1.93. Workspace `rust-version = "1.96"` |

______________________________________________________________________

## 4. Honestly remaining (not closable from this seat)

- **Integrated-GPU spike pass (the actual G6.b gate).** This machine has an
  RTX 4080 SUPER; the spec gates on integrated graphics. The harness is
  committed and parameterized — a human (or any machine with an iGPU) runs
  `npm run dev` in `frontend/` and opens
  `/spike.html?nodes=10000&edges=50000`; results print on the HUD and land
  in `window.__SPIKE_RESULTS__`.
- **Human-eyes interaction feel** (settle behavior, island anchoring during
  motion) — measured numerically, not experienced.
- **Mesh-based edge rendering** is the named follow-up before the field
  meets a real 10k-edge corpus in motion (not a v1-scaffold concern).
- **Engine wheel bundling (D9.2)** untouched, as scoped: posture fixed,
  mechanics deferred.

## 5. Deviations from the specs (with reasons)

- **Vite 8 instead of Vite 6** (and consequently @vitejs/plugin-react 6,
  vitest 4, TS 6): the registry shows Vite 6 two majors stale; green-field
  repo, zero migration cost; G5.b is `recommended`-tier. Queried
  experience-architect before proceeding; **approved post-completion**
  ("§5.2's named versions were research-time observations; the
  architectural commitments are what's binding") — gui-spec §5.2 is being
  amended accordingly. Two riders from that approval, recorded:
  - *Worker story under Vite 8:* verified **in the spike, in dev mode** —
    the FA2 layout ran in its web worker (`graphology-layout-forceatlas2/
    worker`, which spawns its worker from an inline blob rather than a Vite
    `?worker` import) and drove live position updates throughout both
    measured corpora. Not yet verified: worker bundling in a **production**
    build, because the spike entry is deliberately excluded from `vite
    build`. When the real field component lands in `src/`, re-verify the
    worker path in a built bundle (and prefer Vite-native `?worker` imports
    for our own workers).
  - *Base UI at 1.0.0-rc:* open re-check at primitive-adoption time —
    rc-not-GA is exactly the "maintenance health" signal gui-spec §5.2
    names as the Radix-fallback trigger. If Base UI is still rc when the
    first primitive is needed, fall back to Radix.
- **Rust toolchain 1.93 → 1.96** (forced by current rusqlite; see §3).
- **Base UI not installed** despite G5.c committing it: still RC, and the
  scaffold needs no primitives. Decision deferred to first real component
  work, exactly as gui-spec §5.2's own fallback clause anticipates.
- Spike measured on a **discrete GPU** (machine constraint, §4) — harness
  built so the integrated-GPU pass is a five-minute human task.
- `exit code 3` chosen for unimplemented verbs (distinct from success/usage
  errors) — not specified anywhere; recorded as scaffold convention.

## 6. Verification matrix (all run 2026-06-12)

| Check | Result |
| --- | --- |
| `cargo test --workspace` | 12 passed, 0 failed |
| `cargo fmt --all -- --check` | clean |
| `cargo clippy --workspace --all-targets -- -D warnings` | clean |
| `vaultspec status/--help/serve` live smoke | as designed (incl. loopback bind + `/health`, `/status` over HTTP) |
| `npm run typecheck` (tsc -b) | clean |
| `npm run lint` (eslint 10) | clean |
| `npm run format:check` (prettier) | clean |
| `npm run test` (vitest 4) | 8 passed (3 files) |
| `npm run build` (production bundle) | dist/ 97 kB gzip, spike excluded |
| Spike at 1k/5k and 10k/50k | see §2 |
| `npm audit` at install | 0 vulnerabilities |
