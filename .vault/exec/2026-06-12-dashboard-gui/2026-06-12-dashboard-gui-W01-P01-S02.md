---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S02'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---

# run the integrated-GPU frame-time gate at 1k/5k and 10k/50k synthetic corpora and record results against the G6.b gate criteria

## Scope

- `frontend/spike`

## Description

- Run the spike harness (mesh-based edges from S01) at both gate corpora via
  the dev server and a Playwright-driven Chromium, reading the structured
  results object after each run completed.
- Verify visually that the mesh edge field renders all four tier colours and
  that DOM islands track their nodes.

## Outcome

Hardware: NVIDIA GeForce RTX 4080 SUPER (ANGLE D3D11), Chromium, WebGL,
2026-06-12. This is a discrete GPU; the G6.b gate is stated for integrated
GPUs, so these numbers are an upper bound (see Notes).

| Corpus    | Phase                                       | avg fps | avg ms | p95 ms | foundation run (Graphics) |
| --------- | ------------------------------------------- | ------- | ------ | ------ | ------------------------- |
| 1k / 5k   | layout running (FA2 worker, full re-upload) | 59.6    | 16.77  | 17.9   | 59.5 fps                  |
| 1k / 5k   | settled, re-uploading per frame             | 60.1    | 16.63  | 18.0   | 60.1 fps                  |
| 1k / 5k   | static field                                | 60.1    | 16.65  | 17.9   | n/a (not sampled)         |
| 10k / 50k | layout running (FA2 worker, full re-upload) | 36.0    | 27.78  | 38.0   | 8.7 fps                   |
| 10k / 50k | settled, re-uploading per frame             | 59.3    | 16.87  | 20.0   | 7.5 fps                   |
| 10k / 50k | static field                                | 60.3    | 16.59  | 17.9   | 60.4 fps                  |

Against the G6.b gate criteria (smooth at 1k/5k; usable at 10k/50k):

- 1k/5k is vsync-locked in every phase - smooth, passes outright.
- 10k/50k settled-but-animating (the scrub-style worst case that failed at
  7.5 fps on the foundation run) is now vsync-locked at 59.3 fps - the
  mesh-based edge fix recovered an 8x improvement.
- 10k/50k with continuous FA2 layout runs at 36 fps (was 8.7) - usable; the
  remaining cost is the per-frame graphology attribute sync on the main
  thread, not rendering (the static phase proves the draw path is free).

## Notes

The integrated-GPU pass the gate literally requires cannot run from this
seat (discrete RTX 4080 SUPER; the same machine constraint the foundation
audit recorded). The harness remains a five-minute manual task: `npm run dev`
in `frontend/`, open `/spike.html?nodes=10000&edges=50000`, read the HUD.
Flagged to team-lead rather than blocking the wave; the S03 verdict records
this as the single open condition on G6.b.
