---
tags:
  - '#exec'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-06-26'
step_id: 'S13'
related:
  - "[[2026-06-26-rag-service-management-plan]]"
---

# Design the machine-level rag operations console frames in the binding Figma file and surface them for owner review

## Scope

- `frontend/figma/component-map.json`

## Description

DELIVERED - all 7 sections built in the binding Figma file (frame `RagOpsConsole`, node `879:4125`, 300px) and surfaced for owner review.

Grounded against the binding Figma file `SlhonORmySdoSMTQgDWw3w` (page Components):
- The right-rail language: `ActivityRail / Status` master (`599:2099`, 300px wide) - an identity/location strip on top, then collapsible UPPERCASE-eyebrow fold sections with count badges, list rows with status dots / pills / progress bars; warm, instrument register.
- Kit components to compose from: `SectionHeader` (fold header, State=Expanded/Collapsed), `LocationStrip`, `Badge` (Tone=Neutral), `Icon` (Glyph set), `ProgressBar`, `Pill / Base`, `TreeRow`, `StepMark`, `Twisty`.
- Tokens: colors `ink/body|muted|faint`, `surface/raised|sunken`, `border/subtle|strong`, `accent/base|subtle`, `chrome/accent-text`, `scene/state-complete` (green), `scene/state-stale` (amber); spacing `space/0-5..6`; `radius/sm`.
- Type ramp: `Label/12`, `Body/13`, `Meta/11`, `Caption/10`, `Mono/11`. Fonts: Inter (Regular/Medium), JetBrains Mono.

### Proposed console design (300px right-rail surface, distinct from the per-scope StatusTab)

1. **Machine service strip** (LocationStrip analog): status dot (green=running / amber=crashed / red=absent) + `rag` + a state Badge (`running`/`crashed`/`absent`) + `pid 4242 · :8766` (Mono/11); caption `Machine service - stop affects every consumer (CLI, MCP, other dashboards)`. Drives W01 `/status` `state` + the lifecycle hooks.
2. **SERVICE** fold (machine lifecycle): Start (shown only when absent) / Stop / Restart / Doctor / Install action row; crashed-reason line when crashed. Maps to `useRagServiceStart`/`useRagServiceStop` + the attach outcome.
3. **INDEX & SIZE** fold (diagnostics): vault docs, code chunks, total points, disk footprint (humanized bytes), GPU + VRAM, Qdrant version/port; live/orphaned namespace counts. Maps to `ops-state` (index + storage rollup).
4. **TENANTS** fold (projects): leased slots (root, ref_count, idle), max-slots, idle-TTL; per-slot Evict. Maps to `ops-state.tenants` + `useRagProjectEvict`.
5. **DATA** fold (per-tenant data management): Reindex (vault/code), Clean rebuild, Watcher on/off + reconfigure. Maps to `useRagReindexWithProgress` + watcher hooks.
6. **JOBS** fold (activity): recent reindex jobs with phase + ProgressBar (indexed-vs-total). Maps to `useRagJobs` / `useRagJobProgress`.
7. **DIAGNOSTICS** fold (Tier-2 + probes): per-collection health - optimizer status (green/yellow/red), segments, indexed-vs-total - plus Quality and Benchmark. Maps to `useRagCollectionHealth` (capability-gated) + `quality`/`benchmark`.

## Outcome

Done. The `RagOpsConsole` frame (node `879:4125`) was composed section-by-section from real kit instances (`SectionHeader` State=Expanded for every fold, `StepMark` Done as the status dot) and tokens (no raw hex / px), screenshotted at each stage, and the full 300px surface verified: machine-service strip; SERVICE (running, attach line, Stop/Restart/Doctor/Install); INDEX & SIZE (vault/code counts, points, disk, GPU, Qdrant, live/orphaned namespaces); TENANTS (slots, leases, idle); DATA (reindex/clean/watcher chips); JOBS (job rows + progress bars); DIAGNOSTICS (collection health pill, segments, indexed-vs-total, Quality/Benchmark). Surfaced for owner review; W04 builds against the approved frame.

## Notes

The console is a NEW host-level surface (distinct from the per-scope index/watcher/search per ADR D7); it is intentionally surfaced for owner review before frame composition rather than auto-designed, per `figma-is-the-binding-source-of-truth` and the established design-review pattern. The Figma plugin MCP is authenticated (Gergely Wootsch, Pro) and the binding file is reachable; the standalone Figma MCP server disconnected this session (plugin MCP is the working path).
